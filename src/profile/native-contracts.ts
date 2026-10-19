import { canonicalize, canonicalDigest, stableId, ProfileContractError } from "./canonical.js";

export interface NativeType {
  readonly id: boolean;
  readonly scalars: readonly string[];
  readonly containment: Readonly<Record<string, readonly string[]>>;
  readonly references: Readonly<Record<string, readonly string[]>>;
  readonly extends?: readonly string[];
  readonly scalarTypes?: Readonly<Record<string, string>>;
}
export type DescriptorIndex = Readonly<Record<string, NativeType>>;
export interface NativeNode { $type: string; id?: string; [key: string]: unknown }
export interface SupportBinding { readonly ownerId: string; readonly role: string; readonly targetId: string }
export interface SupportRole {
  readonly role: string;
  readonly type: string;
  readonly ownerType?: string;
  readonly parentRole: string;
  readonly property: string;
  readonly ownerReference?: string;
  readonly absent?: readonly string[];
}
export const failContract = (code?: string): never => { throw new ProfileContractError(code); };
export const cloneJson = <T>(value: T): T => JSON.parse(canonicalize(value)) as T;
/** Only call on owned JSON snapshots, never on caller-owned objects. */
export function freezeJson<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
const own = (object: object, key: string): boolean => Object.hasOwn(object, key);
const validNativeId = (id: string): boolean => /^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/.exec(id)?.[0] === id;

/** Injected descriptor slice only; no moddle instance, ambient configuration or IO. */
export function descriptorIndex(input: { readonly types: DescriptorIndex }): DescriptorIndex {
  const types = cloneJson(input.types);
  const done: Record<string, NativeType> = Object.create(null) as Record<string, NativeType>;
  const active = new Set<string>();
  function visit(name: string): NativeType {
    if (own(done, name)) return done[name]!;
    const type = own(types, name) ? types[name]! : failContract("profile-type");
    if (active.has(name)) failContract("profile-cycle");
    active.add(name);
    const parents = (type.extends ?? []).map(visit);
    const result = { ...type, scalars: [...new Set([...parents.flatMap(p => p.scalars), ...type.scalars])],
      containment: Object.assign({}, ...parents.map(p => p.containment), type.containment) as NativeType["containment"],
      references: Object.assign({}, ...parents.map(p => p.references), type.references) as NativeType["references"],
      scalarTypes: Object.assign({}, ...parents.map(p => p.scalarTypes), type.scalarTypes) as NonNullable<NativeType["scalarTypes"]> };
    active.delete(name); done[name] = result;
    return result;
  }
  for (const name of Object.keys(types)) visit(name);
  return done;
}

export function typeMatches(actual: string, expected: string, mode: "exact" | "assignable", descriptors: DescriptorIndex): boolean {
  if (!own(descriptors, actual) || !own(descriptors, expected)) failContract("profile-type");
  if (actual === expected) return true;
  if (mode === "exact") return false;
  const seen = new Set<string>();
  function inherits(name: string): boolean {
    if (seen.has(name)) return false;
    seen.add(name);
    return (descriptors[name]?.extends ?? []).some(parent => parent === expected || inherits(parent));
  }
  return inherits(actual);
}

interface NativeEntry { readonly node: NativeNode; readonly parent?: NativeNode; readonly property?: string; readonly pointer: string }
export function nativeIndex(tree: NativeNode, descriptors: DescriptorIndex): {
  readonly byId: Map<string, NativeEntry>; readonly entries: readonly NativeEntry[];
} {
  canonicalize(tree);
  const byId = new Map<string, NativeEntry>(), entries: NativeEntry[] = [];
  function walk(node: NativeNode, pointer: string, parent?: NativeNode, property?: string): void {
    const type = own(descriptors, node.$type) ? descriptors[node.$type]! : failContract("profile-type");
    const entry: NativeEntry = { node, pointer, ...(parent ? { parent } : {}), ...(property ? { property } : {}) };
    entries.push(entry);
    if (own(node, "id")) {
      if (!type.id || typeof node.id !== "string" || !validNativeId(node.id)) failContract("profile-create-identity");
      if (byId.has(node.id!)) failContract("id-collision");
      byId.set(node.id!, entry);
    }
    for (const [field, allowed] of Object.entries(type.containment)) {
      if (!own(node, field)) continue;
      const value = node[field];
      const children = Array.isArray(value) ? value : [value];
      children.forEach((child: unknown, i) => {
        if (!child || typeof child !== "object" || Array.isArray(child)) failContract("profile-type");
        const native = child as NativeNode;
        if (!allowed.some(name => typeMatches(native.$type, name, "assignable", descriptors))) failContract("profile-type");
        walk(native, `${pointer}/${pointerKey(field)}${Array.isArray(value) ? `/${i}` : ""}`, node, field);
      });
    }
  }
  walk(tree, "");
  return { byId, entries };
}

export const pointerKey = (key: string): string => key.replace(/~/g, "~0").replace(/\//g, "~1");
export function compareBindings(a: SupportBinding, b: SupportBinding): number {
  for (const key of ["ownerId", "role", "targetId"] as const) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  return 0;
}
export function validateBindingKeys(bindings: readonly SupportBinding[]): void {
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (!binding || Object.keys(binding).sort().join(",") !== "ownerId,role,targetId" ||
      Object.values(binding).some(value => typeof value !== "string" || value.length === 0)) failContract("support-binding-conflict");
    const key = canonicalize([binding.ownerId, binding.role]);
    if (seen.has(key)) failContract("support-binding-conflict");
    seen.add(key);
  }
}

/** Roles and their native constraints are caller-supplied immutable profile facts. */
export function validateSupportBindings(tree: NativeNode, bindings: readonly SupportBinding[], descriptors: DescriptorIndex, roles: readonly SupportRole[]): void {
  canonicalize(bindings); validateBindingKeys(bindings);
  if (!bindings.length) return;
  let byId: ReturnType<typeof nativeIndex>["byId"];
  try { byId = nativeIndex(tree, descriptors).byId; }
  catch { return failContract("support-binding-conflict"); }
  const targets = new Set<string>();
  if (new Set(roles.map(r => r.role)).size !== roles.length) failContract("support-binding-conflict");
  for (const binding of bindings) {
    const role = roles.find(r => r.role === binding.role);
    const target = byId.get(binding.targetId), owner = byId.get(binding.ownerId);
    if (!role || !target || !owner || targets.has(binding.targetId)) failContract("support-binding-conflict");
    const spec = role!, entry = target!, ownerEntry = owner!;
    targets.add(binding.targetId);
    const parentId = spec.parentRole === "root" ? tree.id : spec.parentRole === "owner" ? binding.ownerId :
      bindings.find(b => b.ownerId === binding.ownerId && b.role === spec.parentRole)?.targetId;
    if (entry.node.$type !== spec.type || (spec.ownerType && ownerEntry.node.$type !== spec.ownerType) ||
      !parentId || entry.parent?.id !== parentId || entry.property !== spec.property ||
      (spec.ownerReference && entry.node[spec.ownerReference] !== binding.ownerId) ||
      spec.absent?.some(field => own(entry.node, field))) failContract("support-binding-conflict");
  }
}

export async function reserveStableId(tree: NativeNode, descriptors: DescriptorIndex, owner: string, slot: string, key: string): Promise<string> {
  const id = await stableId(owner, slot, key);
  if (nativeIndex(tree, descriptors).byId.has(id)) failContract("id-collision");
  return id;
}

export async function createIdentity(type: string, identity: "allocated" | "containment", args: {
  readonly fields: Readonly<Record<string, unknown>>; readonly ownerId?: string; readonly slot?: string; readonly key?: string;
}, descriptors: DescriptorIndex): Promise<NativeNode> {
  canonicalize(args);
  const descriptor = own(descriptors, type) ? descriptors[type]! : failContract("profile-type");
  if ((identity === "allocated") !== descriptor.id || !["allocated", "containment"].includes(identity)) failContract("profile-create-identity");
  for (const [name, value] of Object.entries(args.fields)) if (name === "id" || !descriptor.scalars.includes(name) ||
    !["string", "number", "boolean"].includes(typeof value)) failContract("profile-type");
  if (identity === "containment") {
    if (["ownerId", "slot", "key"].some(key => own(args, key))) failContract("profile-create-identity");
    return { $type: type, ...cloneJson(args.fields) };
  }
  if ([args.ownerId, args.slot, args.key].some(value => typeof value !== "string")) failContract("profile-create-identity");
  return { $type: type, id: await stableId(args.ownerId!, args.slot!, args.key!), ...cloneJson(args.fields) };
}

interface Allocation { readonly id: string; readonly contentSignature: string; readonly duplicateOrdinal: number; readonly stableKey: string }
/** Identity-only C sub-operation on an already projected, admitted semantic tree.
 * Capture every birth signature before adding any IDs; never supply defaults.
 */
export async function allocateMissingIds(source: NativeNode, descriptors: DescriptorIndex): Promise<{
  readonly tree: NativeNode; readonly createdIds: readonly string[]; readonly allocations: readonly Allocation[];
}> {
  const tree = cloneJson(source), index = nativeIndex(tree, descriptors);
  const signatures = new Map<NativeNode, string>(), ordinals = new Map<NativeNode, number>();
  const counts = new Map<string, number>();
  function withoutIds(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutIds);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id").map(([k, v]) => [k, withoutIds(v)]));
    return value;
  }
  for (const entry of index.entries) {
    const signature = await canonicalDigest(withoutIds(entry.node));
    signatures.set(entry.node, signature);
    // Source parent pointer distinguishes domains even before the parent has an ID.
    let allocationOwner = entry.parent ? index.entries.find(e => e.node === entry.parent) : undefined;
    while (allocationOwner && !descriptors[allocationOwner.node.$type]!.id) allocationOwner = allocationOwner.parent ? index.entries.find(e => e.node === allocationOwner!.parent) : undefined;
    const key = canonicalize([allocationOwner?.pointer ?? "", entry.parent ? `${entry.parent.$type}.${entry.property}` : "", signature]);
    ordinals.set(entry.node, counts.get(key) ?? 0); counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const createdIds: string[] = [], allocations: Allocation[] = [];
  const occupied = new Set(index.byId.keys());
  for (const entry of index.entries) {
    const node = entry.node;
    if (node.id !== undefined || !descriptors[node.$type]!.id) continue;
    const parentEntry = entry.parent ? index.entries.find(e => e.node === entry.parent) : undefined;
    let owner = entry.parent;
    let ancestor = parentEntry;
    while (owner && !owner.id) {
      owner = ancestor?.parent;
      ancestor = owner ? index.entries.find(e => e.node === owner) : undefined;
    }
    const contentSignature = signatures.get(node)!, duplicateOrdinal = ordinals.get(node)!;
    const stableKey = canonicalize([contentSignature, duplicateOrdinal]);
    const id = entry.parent ? await stableId(owner?.id ?? failContract("profile-create-identity"), `${entry.parent.$type}.${entry.property}`, stableKey) :
      await stableId("document-root/1", "definitions", "root");
    if (occupied.has(id)) failContract("id-collision");
    node.id = id; occupied.add(id); createdIds.push(id);
    allocations.push({ id, contentSignature, duplicateOrdinal, stableKey });
  }
  return { tree, createdIds, allocations };
}

export interface IdRemap { readonly sourceId: string; readonly resultId: string; readonly domain: string }
/** Pre-resolved local references only. QName/opaque import adaptation belongs to
 * the separately approved import migration; unknown properties refuse here.
 */
export function remapNativeIds(source: NativeNode, bindings: readonly SupportBinding[], map: readonly IdRemap[], descriptors: DescriptorIndex): {
  readonly tree: NativeNode; readonly bindings: readonly SupportBinding[]; readonly idMap: readonly IdRemap[];
} {
  const tree = cloneJson(source), index = nativeIndex(tree, descriptors);
  canonicalize(bindings); canonicalize(map); validateBindingKeys(bindings);
  const remap = new Map(map.map(item => [item.sourceId, item.resultId]));
  if (remap.size !== map.length || new Set(map.map(m => m.resultId)).size !== map.length) failContract("id-collision");
  for (const item of map) if (!index.byId.has(item.sourceId) || (index.byId.has(item.resultId) && !remap.has(item.resultId)) ||
    !validNativeId(item.resultId)) failContract("id-collision");
  const resolve = (id: unknown): unknown => typeof id === "string" ? remap.get(id) ?? id : Array.isArray(id) ? id.map(resolve) : failContract("profile-type");
  for (const { node } of index.entries) {
    const type = descriptors[node.$type]!;
    for (const name of Object.keys(node)) if (name !== "$type" && !type.scalars.includes(name) &&
      !own(type.containment, name) && !own(type.references, name)) failContract("migration-reference-opaque");
    if (node.id) node.id = resolve(node.id) as string;
    for (const name of Object.keys(type.references)) if (own(node, name)) node[name] = resolve(node[name]);
  }
  return { tree, bindings: bindings.map(b => ({ ownerId: resolve(b.ownerId) as string, role: b.role, targetId: resolve(b.targetId) as string })).sort(compareBindings), idMap: cloneJson(map) };
}

/** Raw descriptor reads never apply moddle defaults or prototype fallback. The
 * sentinel stays internal; it is not a serializable document/profile value.
 */
export const MISSING: unique symbol = Symbol("profile-missing");
export function readNative(node: NativeNode, path: string, descriptors: DescriptorIndex): unknown {
  canonicalize(node);
  if (!/^(?:\/(?:[^~/]|~[01])*)+$/.test(path)) failContract("profile-type");
  const parts = path.slice(1).split("/").map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = node;
  for (const [i, field] of parts.entries()) {
    const descriptor = own(descriptors, current.$type) ? descriptors[current.$type]! : failContract("profile-type");
    if (!descriptor.scalars.includes(field) && !own(descriptor.references, field) && !own(descriptor.containment, field)) failContract("profile-type");
    if (!own(current, field)) return MISSING;
    const value = current[field];
    if (value === null) failContract("profile-type");
    if (i === parts.length - 1) return cloneJson(value);
    if (!own(descriptor.containment, field) || !value || typeof value !== "object" || Array.isArray(value)) failContract("profile-type");
    current = value as NativeNode;
  }
  return MISSING;
}

export function validateNativeReferences(tree: NativeNode, descriptors: DescriptorIndex, idRefScalars: readonly string[] = []): ReturnType<typeof nativeIndex> {
  const index = nativeIndex(tree, descriptors);
  for (const { node } of index.entries) for (const [field, targets] of Object.entries(descriptors[node.$type]!.references)) {
    if (!own(node, field)) continue;
    const values = Array.isArray(node[field]) ? node[field] as unknown[] : [node[field]];
    for (const value of values) {
      const target = typeof value === "string" ? index.byId.get(value) : undefined;
      if (!target) failContract("reference-dangling");
      if (!targets.some(type => typeMatches(target!.node.$type, type, "assignable", descriptors))) failContract("profile-type");
    }
  }
  for (const { node } of index.entries) for (const field of descriptors[node.$type]!.scalars) {
    if (!idRefScalars.includes(`${node.$type}.${field}`) || !own(node, field)) continue;
    const values = Array.isArray(node[field]) ? node[field] as unknown[] : [node[field]];
    for (const value of values) if (typeof value !== "string" || !index.byId.has(value)) failContract("reference-dangling");
  }
  return index;
}

/** Validate precomputed deletion evidence; does not compute a dependency closure
 * or execute a deletion/normalization command. */
export function checkDeletionReferences(inbound: readonly { readonly sourceId: string }[], declaredDependents: readonly string[], policy: "refuseIfReferenced" | "includeDeclared"): void {
  canonicalize(inbound); canonicalize(declaredDependents);
  if (!["refuseIfReferenced", "includeDeclared"].includes(policy) ||
    inbound.some(r => policy === "refuseIfReferenced" || !declaredDependents.includes(r.sourceId))) failContract();
}

/** Recovery is only a proposal until the explicit transaction is selected.
 * Verified provenance and structural facts come from the trusted import path;
 * neither the hash nor a label supplies those facts. */
export function checkBindingRecovery(facts: { readonly trustedGeneratedDocument: boolean; readonly creationProvenanceVerified: boolean;
  readonly exactTypeParentOwnerVerified: boolean; readonly recoveryTransactionSelected: boolean }): void {
  canonicalize(facts);
  if (!facts.trustedGeneratedDocument || !facts.creationProvenanceVerified || !facts.exactTypeParentOwnerVerified || !facts.recoveryTransactionSelected) failContract("support-binding-recovery-required");
}

/** Contract for a supplied detached identity delta. This validates allocated,
 * deleted and surviving IDs, not recipe execution, C/N or browser history. */
export async function validateIdentityDelta(before: NativeNode, after: NativeNode, descriptors: DescriptorIndex, delta: {
  readonly created: readonly { readonly id: string; readonly ownerId: string; readonly slot: string; readonly key: string }[];
  readonly deleted: readonly string[];
}): Promise<void> {
  canonicalize(delta);
  const source = nativeIndex(before, descriptors), candidate = nativeIndex(after, descriptors);
  const created = new Set(delta.created.map(c => c.id)), deleted = new Set(delta.deleted);
  if (created.size !== delta.created.length || deleted.size !== delta.deleted.length) failContract("id-collision");
  for (const claim of delta.created) {
    if (await stableId(claim.ownerId, claim.slot, claim.key) !== claim.id || !candidate.byId.has(claim.id) || source.byId.has(claim.id) && !deleted.has(claim.id)) failContract("id-collision");
  }
  for (const id of deleted) if (!source.byId.has(id) || candidate.byId.has(id) && !created.has(id)) failContract("profile-create-identity");
  for (const [id, entry] of source.byId) {
    if (deleted.has(id)) continue;
    if (!candidate.byId.has(id) || candidate.byId.get(id)!.node.$type !== entry.node.$type) failContract("profile-create-identity");
  }
  for (const id of candidate.byId.keys()) if (!source.byId.has(id) && !created.has(id)) failContract("profile-create-identity");
  validateNativeReferences(after, descriptors);
}
