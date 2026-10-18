import { canonicalize, canonicalDigest, rawDigest } from "./canonical.js";
import { parseProfileText } from "./contracts.js";
import type { SchemaValidator } from "./contracts.js";
import { cloneJson, compareBindings, failContract, pointerKey, nativeIndex, validateBindingKeys, validateSupportBindings } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode, SupportBinding, SupportRole } from "./native-contracts.js";

export interface IdentityPin { readonly id: string; readonly version: string; readonly sha256: string }
export interface ProfileIdentity {
  readonly mechanismVersion: string; readonly schemaVersion: string; readonly profile: string; readonly version: string;
  readonly sha256: string; readonly base: IdentityPin; readonly descriptors: readonly IdentityPin[];
}
export interface DocumentEnvelope {
  readonly documentVersion: "1"; readonly profileIdentity: ProfileIdentity; readonly tree: NativeNode;
  readonly bindings: readonly SupportBinding[]; readonly semanticRevision: string;
}
export function sortBindings(bindings: readonly SupportBinding[]): readonly SupportBinding[] {
  canonicalize(bindings); validateBindingKeys(bindings);
  return [...cloneJson(bindings)].sort(compareBindings);
}

/** Hash-only boundary: ownership and projection must be checked separately. */
export function semanticRevision(tree: NativeNode, profileIdentity: ProfileIdentity, bindings: readonly SupportBinding[]): Promise<string> {
  return canonicalDigest({ tree, profileIdentity, bindings: sortBindings(bindings) });
}

const profileArraySections = ["descriptors", "capabilities", "producerDelta", "notions", "rules", "recipes", "placements", "themes", "ui",
  "validation", "providerDialects", "exports", "migrations", "resources", "messages", "compatibilityAliases"] as const;
export type CompleteProfileDocument = Omit<ProfileIdentity, "sha256"> & {
  readonly $schema: string; readonly policies: Readonly<Record<string, unknown>>;
} & Readonly<Record<typeof profileArraySections[number], readonly unknown[]>>;

/** Syntax validation belongs to the loader; this boundary additionally refuses
 * partial records so an identity pin can never stand in for the whole package. */
export async function profileIdentity(completeProfileDocument: CompleteProfileDocument): Promise<ProfileIdentity> {
  const profile = completeProfileDocument;
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  if (!record(profile) || Object.hasOwn(profile, "sha256") ||
    (["$schema", "mechanismVersion", "schemaVersion", "profile", "version"] as const).some(key => !Object.hasOwn(profile, key) || typeof profile[key] !== "string") ||
    !Object.hasOwn(profile, "base") || !record(profile.base) || !Object.hasOwn(profile, "policies") || !record(profile.policies) ||
    profileArraySections.some(key => !Object.hasOwn(profile, key) || !Array.isArray(profile[key]))) failContract("profile-schema");
  return { mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion, profile: profile.profile,
    version: profile.version, sha256: await canonicalDigest(completeProfileDocument), base: cloneJson(profile.base), descriptors: cloneJson(profile.descriptors) };
}

export async function validateEnvelope(value: unknown, context: {
  readonly syntax: SchemaValidator; readonly descriptors: DescriptorIndex; readonly supportRoles: readonly SupportRole[];
  readonly storageValidator: (tree: unknown) => boolean;
  readonly descriptorRoles?: readonly DescriptorRole[];
}): Promise<DocumentEnvelope> {
  canonicalize(value);
  function rejectNull(data: unknown): void {
    if (data === null) failContract();
    if (data && typeof data === "object") for (const child of Object.values(data)) rejectNull(child);
  }
  rejectNull(value);
  if (!context.syntax(value).valid) failContract();
  const envelope = value as DocumentEnvelope;
  validateBindingKeys(envelope.bindings);
  if (canonicalize(envelope.bindings) !== canonicalize(sortBindings(envelope.bindings))) failContract("support-binding-conflict");
  if (!context.storageValidator(envelope.tree)) failContract();
  if (envelope.tree.$type !== "bpmn:Definitions" || typeof envelope.tree.targetNamespace !== "string" || !envelope.tree.targetNamespace ||
    typeof envelope.tree.exporterVersion !== "string" || !envelope.tree.exporterVersion) failContract();
  nativeIndex(envelope.tree, context.descriptors);
  const projection = projectSemanticTree(envelope.tree, context.descriptors, context.descriptorRoles ?? []);
  if (canonicalize(projection.tree) !== canonicalize(envelope.tree)) failContract();
  validateSupportBindings(envelope.tree, envelope.bindings, context.descriptors, context.supportRoles);
  if (await semanticRevision(envelope.tree, envelope.profileIdentity, envelope.bindings) !== envelope.semanticRevision) failContract("document-revision-mismatch");
  return cloneJson(envelope);
}

/** This hashes XML bytes supplied by an already validated import path; it does
 * not parse XML or change the existing XML API. Native JSON is strictly parsed.
 */
export async function importRevision(format: "native-json" | "bpmn-xml", source: string): Promise<{ readonly sourceDigest: string; readonly baseRevision: string }> {
  if (format !== "native-json" && format !== "bpmn-xml") failContract("profile-type");
  const sourceDigest = format === "native-json" ? await canonicalDigest(parseProfileText(source)) : await rawDigest(source);
  return { sourceDigest, baseRevision: await canonicalDigest({ domain: "profile-import/1", format, sourceDigest }) };
}

export interface DescriptorRole { readonly property: string; readonly role: "semantic" | "presentation"; readonly valueType?: string }
/** Qualified roles include inherited extension properties in the caller's
 * compiled index. Keep an exact list of excluded qualified property IDs.
 */
export function projectSemanticTree(source: NativeNode, descriptors: DescriptorIndex, roles: readonly DescriptorRole[]): {
  readonly tree: NativeNode; readonly extractedPresentation: { readonly diagrams: readonly unknown[]; readonly properties: readonly { readonly pointer: string; readonly value: unknown }[] };
} {
  canonicalize(source); canonicalize(roles);
  const roleMap = new Map(roles.map(r => [r.property, r]));
  if (roleMap.size !== roles.length || roles.some(r => !["semantic", "presentation"].includes(r.role))) failContract("descriptor-role-unknown");
  const diagrams: unknown[] = [], properties: { pointer: string; value: unknown }[] = [];
  function walk(node: NativeNode, pointer: string): NativeNode {
    const type = Object.hasOwn(descriptors, node.$type) ? descriptors[node.$type]! : failContract("descriptor-role-unknown");
    const entries: [string, unknown][] = [];
    for (const [key, value] of Object.entries(node)) {
      const qualified = `${node.$type}.${key}`, role = roleMap.get(qualified);
      const excludedType = role?.valueType && /^(?:bpmndi:|di:|dc:|bioc:|color:)/.test(role.valueType) ||
        (type.containment[key] ?? []).some(name => /^(?:bpmndi:|di:|dc:|bioc:|color:)/.test(name));
      if (qualified === "bpmn:Definitions.diagrams" || role?.role === "presentation" || excludedType) {
        if (qualified === "bpmn:Definitions.diagrams") {
          if (!Array.isArray(value)) failContract("profile-type");
          diagrams.push(...cloneJson(value as unknown[]));
        } else properties.push({ pointer: `${pointer}/${pointerKey(key)}`, value: cloneJson(value) });
        continue;
      }
      if (key !== "$type" && !type.scalars.includes(key) && !Object.hasOwn(type.containment, key) &&
        !Object.hasOwn(type.references, key) && role?.role !== "semantic") failContract("descriptor-role-unknown");
      if (Object.hasOwn(type.containment, key)) {
        entries.push([key, Array.isArray(value) ? value.map((v: NativeNode, i) => walk(v, `${pointer}/${pointerKey(key)}/${i}`)) : walk(value as NativeNode, `${pointer}/${pointerKey(key)}`)]);
      } else entries.push([key, cloneJson(value)]);
    }
    return Object.fromEntries(entries) as NativeNode;
  }
  return { tree: walk(source, ""), extractedPresentation: { diagrams, properties } };
}
