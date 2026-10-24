import { canonicalize, stableId } from "./canonical.js";
import { evaluatePredicate, evaluateValue, invalidateEvalIndex, selectHandles } from "./compiler.js";
import type { CompiledProfile, EvalContext, EvalHandle } from "./compiler.js";
import { compiledState } from "./public-compiler.js";
import { parseActivation } from "./activation.js";
import type { UnicodeCaseTable } from "./unicode-case.js";
import { MISSING, cloneJson, failContract, nativeIndex, typeMatches, validateNativeReferences } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode } from "./native-contracts.js";
import type { PureResult } from "./results.js";

export type ParentRef = { readonly id: string } | { readonly handle: number } | { readonly pointer: string };

export type PlannedWrite =
  | { readonly op: "create"; readonly recipeId: string; readonly id?: string; readonly type: string;
      readonly parent: ParentRef; readonly property: string;
      readonly fields: Record<string, unknown>; readonly cardinality: "many" | "single" }
  | { readonly op: "ensure"; readonly recipeId: string; readonly id: string; readonly type: string;
      readonly parent: ParentRef; readonly property: string;
      readonly fields: Record<string, unknown>; readonly cardinality: "many" | "single";
      readonly ownerId: string; readonly role: string; readonly decision: "create" | "reuse" }
  | { readonly op: "assignRef"; readonly recipeId: string; readonly target: { readonly id: string };
      readonly property: string; readonly mode: "replace" | "appendUnique" | "remove"; readonly ids: readonly string[];
      readonly cardinality: "many" | "single"; readonly targetTypes: readonly string[] }
  | { readonly op: "set"; readonly recipeId: string; readonly target: { readonly id: string };
      readonly property: string; readonly value: unknown }
  | { readonly op: "unset"; readonly recipeId: string; readonly target: { readonly id: string }; readonly property: string }
  | { readonly op: "reparent"; readonly recipeId: string; readonly target: { readonly id: string };
      readonly parent: { readonly id: string }; readonly property: string;
      readonly position: "first" | "last" | "preserve" | { readonly kind: "before" | "after"; readonly ref: string };
      readonly cardinality: "many" | "single" }
  | { readonly op: "remove"; readonly recipeId: string; readonly target: { readonly id: string };
      readonly policy: "refuseIfReferenced" | "includeDeclared"; readonly deleteIds: readonly string[] };

export interface WritePlan {
  readonly planVersion: "1";
  readonly phase: string;
  readonly actor: string;
  readonly activation: "edit" | "qualification";
  readonly baseRevision: string;
  readonly writes: readonly PlannedWrite[];
}

export interface ChangeReport {
  readonly reportVersion: "change/1";
  readonly tree: NativeNode;
  readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
  readonly entries: readonly [];
  readonly placements: readonly [];
  readonly created: readonly string[];
  readonly removed: readonly string[];
}

const EXPLICIT_PHASES = ["create", "edit", "reference", "convert", "migrate"];

export interface RecipeDef {
  readonly id: string;
  readonly phase: string;
  readonly parameters: readonly { readonly name: string; readonly type: string; readonly required?: boolean }[];
  readonly select: unknown;
  readonly when: unknown;
  readonly steps: readonly { readonly op: string; [key: string]: unknown }[];
}

export interface PlanEnv {
  readonly tree: NativeNode;
  readonly index: ReturnType<typeof nativeIndex>;
  readonly descriptors: DescriptorIndex;
  readonly notions: CompiledProfile["notions"];
  readonly idRefScalars: readonly string[];
  readonly supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
  readonly unicodeCase?: UnicodeCaseTable;
  /** Pass-global ensure registry by owner+role: alias when the planned identity
   * matches, profile-write-conflict when another identity claimed the role. */
  sharedEnsures?: Map<string, { readonly identity: string; readonly node: NativeNode; readonly id: string }>;
  /** Pass-global creation-ordinal handles for id-less created parents. */
  planHandles?: { count: number; marks: WeakMap<NativeNode, number> };
  /** Recovery-preview mode: ensures report reuse proposals instead of gated
   * writes; nothing is applied. */
  propose?: { readonly provenance: ReadonlySet<string>; readonly proposals: SupportBinding[] };
}

export interface SupportBinding {
  readonly ownerId: string;
  readonly role: string;
  readonly targetId: string;
}

export type Binding = EvalHandle | typeof MISSING;

function recordOf(value: unknown, code: "operation-error" | "profile-ui-parameters" | "profile-symbol"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return failContract(code);
  return value as Record<string, unknown>;
}

/** Unwrap a PureResult, refusing with its code on failure. */
function must<T>(result: PureResult<T>): T {
  if (result.status !== "ok") return failContract(result.code);
  return result.payload;
}

/** Neutral metamodel fallback: data association endpoints are multi-valued even
 * when the descriptor slice carries no many/single markers. */
const MANY_BY_DEFAULT = new Set(["bpmn:DataInputAssociation.sourceRef", "bpmn:DataOutputAssociation.sourceRef"]);

function referenceCardinality(descriptors: DescriptorIndex, type: string, property: string): "many" | "single" {
  if ((descriptors[type]?.many ?? []).includes(property)) return "many";
  return MANY_BY_DEFAULT.has(`${type}.${property}`) ? "many" : "single";
}

function containmentCardinality(descriptors: DescriptorIndex, type: string, property: string): "many" | "single" {
  return (descriptors[type]?.single ?? []).includes(property) ? "single" : "many";
}

function referenceTargets(descriptors: DescriptorIndex, type: string, property: string, idRefScalars: readonly string[]): readonly string[] {
  const targets = descriptors[type]?.references[property];
  if (targets) return [...targets].sort();
  if (idRefScalars.includes(`${type}.${property}`)) {
    return Object.keys(descriptors).filter(t => descriptors[t]!.id).sort();
  }
  return failContract("profile-type");
}

function evalContext(env: PlanEnv, bindings: Record<string, Binding>, params: Record<string, unknown>): EvalContext {
  const clean: Record<string, EvalHandle> = {};
  for (const [name, handle] of Object.entries(bindings)) {
    if (handle !== MISSING) clean[name] = handle;
  }
  return { descriptors: env.descriptors, tree: env.tree, notions: env.notions, bindings: clean, params,
    idRefScalars: env.idRefScalars, ...(env.unicodeCase ? { unicodeCase: env.unicodeCase } : {}),
    supportBindings: env.supportBindings, admission: "lenient" };
}

function lookupTarget(bindings: Record<string, Binding>, name: string): EvalHandle {
  const handle = bindings[name];
  if (!handle || handle === MISSING || Array.isArray(handle)) return failContract("profile-type");
  return handle;
}

function targetId(handle: EvalHandle): string {
  return handle.node.id ?? failContract("profile-type");
}

interface CreatedNode {
  readonly node: NativeNode;
  readonly id: string | undefined;
  readonly parent: NativeNode | null;
}

export interface BeforeInfo {
  readonly present: boolean;
  readonly value: unknown;
}

export interface Holder {
  readonly type: string;
  readonly property: string;
}

export interface PlanHooks {
  onWrite?(write: PlannedWrite, before: BeforeInfo, holder: Holder): void;
}

export interface PlacementRecord {
  readonly elementId: string;
  readonly ownerProcessId: string;
  readonly regionKey: string;
  readonly anchorAssociationId?: string;
  readonly relatedAssociationIds: readonly string[];
}

/** Two distinct place plans for one target/region refuse
 * profile-write-conflict; identical plans coalesce (DESIGN §2.4). */
export function checkPlacementAgreement(placements: readonly PlacementRecord[]): void {
  const seen = new Map<string, Set<string>>();
  for (const placement of placements) {
    const key = `${placement.elementId}\n${placement.ownerProcessId}\n${placement.regionKey}`;
    const shape = canonicalize({ anchor: placement.anchorAssociationId ?? null,
      related: [...placement.relatedAssociationIds] });
    const known = seen.get(key) ?? new Set<string>();
    known.add(shape);
    seen.set(key, known);
    if (known.size > 1) return failContract("profile-write-conflict");
  }
}

export interface PlanState {
  readonly env: PlanEnv;
  readonly recipeId: string;
  /** Steps of the recipe currently planned: the ensure reuse check reads
   * whether the recipe provides processRef instead of naming a role. */
  recipeSteps?: readonly Record<string, unknown>[];
  readonly writes: PlannedWrite[];
  readonly created: CreatedNode[];
  readonly placements: PlacementRecord[];
  /** Operand shape per assignRef write: true when a single scalar operand was given. */
  readonly shapes: Map<PlannedWrite, boolean>;
  bindings: Record<string, Binding>;
  readonly params: Record<string, unknown>;
  readonly hooks?: PlanHooks;
  verifyOnly?: boolean;
  verifyDirty?: boolean;
}

export function makePlanState(env: PlanEnv, recipeId: string, bindings: Record<string, Binding>,
    params: Record<string, unknown>, hooks?: PlanHooks): PlanState {
  return { env, recipeId, writes: [], created: [], placements: [], shapes: new Map(), bindings, params,
    ...(hooks ? { hooks } : {}) };
}

/** bindingOwner is the unique owner from a verified support binding targeting
 * this candidate, or MISSING. Ambiguous ownership refuses (DESIGN §2.2). */
function ownerBindingOf(env: PlanEnv, candidate: EvalHandle): Binding {
  const owners = new Set(env.supportBindings
    .filter(binding => binding.targetId === candidate.node.id).map(binding => binding.ownerId));
  if (owners.size > 1) return failContract("support-binding-conflict");
  if (owners.size === 0) return MISSING;
  const hit = env.supportBindings.find(binding => binding.targetId === candidate.node.id)!;
  const handle = env.index.byId.get(hit.ownerId);
  return handle ?? MISSING;
}

export async function runRecipe(state: PlanState, recipe: RecipeDef): Promise<void> {
  const { bindings, params } = state;
  state.recipeSteps = recipe.steps as readonly Record<string, unknown>[];
  const candidates = must(selectHandles(recipe.select, evalContext(state.env, { ...bindings }, params)));
  for (const candidate of candidates) {
    state.bindings = { ...bindings, self: candidate, bindingOwner: ownerBindingOf(state.env, candidate) };
    if (!must(evaluatePredicate(recipe.when, planContext(state)))) continue;
    for (const raw of recipe.steps ?? []) await planStep(state, raw as Record<string, unknown>);
  }
}

function planContext(state: PlanState): EvalContext {
  return evalContext(state.env, state.bindings, state.params);
}

/** Pass-global creation handles: a created parent with an id is referenced by
 * that id; only a genuinely id-less created parent needs a creation-ordinal
 * handle, resolved against the applier's creation order. */
function parentRefOf(state: PlanState, parent: EvalHandle): ParentRef {
  if (typeof parent.node.id === "string") return { id: parent.node.id };
  const handles = state.env.planHandles ?? (state.env.planHandles = { count: 0, marks: new WeakMap() });
  const known = handles.marks.get(parent.node);
  if (known !== undefined) return { handle: known };
  return { pointer: parent.pointer };
}

function markCreated(state: PlanState, node: NativeNode): void {
  const handles = state.env.planHandles ?? (state.env.planHandles = { count: 0, marks: new WeakMap() });
  handles.marks.set(node, handles.count);
  handles.count += 1;
}

function planBind(state: PlanState, step: Record<string, unknown>): void {
  const selects = [step.select, ...((step.fallbacks as readonly unknown[] | undefined) ?? [])];
  let handles: readonly EvalHandle[] = [];
  for (const select of selects) {
    handles = must(selectHandles(select, planContext(state)));
    if (handles.length > 0) break;
  }
  const cardinality = step.cardinality as string;
  if (cardinality === "one") {
    if (handles.length !== 1) return failContract("profile-ambiguous-binding");
    state.bindings[step.as as string] = handles[0] as EvalHandle;
  } else if (cardinality === "zeroOrOne") {
    if (handles.length > 1) return failContract("profile-ambiguous-binding");
    state.bindings[step.as as string] = handles.length === 0 ? MISSING : handles[0] as EvalHandle;
  } else if (cardinality === "first") {
    state.bindings[step.as as string] = handles.length === 0 ? MISSING : handles[0] as EvalHandle;
  } else {
    return failContract("profile-type");
  }
}

function stripPath(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/")) return failContract("profile-type");
  return path.slice(1);
}

async function planCreate(state: PlanState, step: Record<string, unknown>): Promise<void> {
  const { env, recipeId } = state;
  const as = step.as as string;
  const type = step.type as string;
  const parent = lookupTarget(state.bindings, step.parent as string);
  const property = step.property as string;
  const admitted = env.descriptors[parent.node.$type]?.containment[property];
  if (!admitted || !admitted.some(name => typeMatches(type, name, "assignable", env.descriptors))) {
    return failContract("profile-type");
  }
  const fields: Record<string, unknown> = {};
  for (const field of (step.fields as readonly Record<string, unknown>[]) ?? []) {
    const value = must(evaluateValue(field.value, planContext(state), `${recipeId}.fields`));
    if (value === MISSING) return failContract("profile-type");
    fields[field.name as string] = cloneJson(value);
  }
  const node: NativeNode = { $type: type, ...cloneJson(fields) };
  let id: string | undefined;
  if (step.identity === "allocated") {
    const ownerId = must(evaluateValue(step.ownerId, planContext(state), `${recipeId}.ownerId`));
    if (typeof ownerId !== "string") return failContract("profile-type");
    const key = must(evaluateValue(step.key, planContext(state), `${recipeId}.key`));
    if (typeof key !== "string") return failContract("profile-type");
    id = stableId(ownerId, step.slot as string, key);
    node.id = id;
  }
  const parentRef = parentRefOf(state, parent);
  markCreated(state, node);
  state.created.push({ node, id, parent: parent.node });
  const create: PlannedWrite = { op: "create", recipeId, ...(id === undefined ? {} : { id }), type, parent: parentRef, property,
    fields: cloneJson(fields), cardinality: containmentCardinality(env.descriptors, parent.node.$type, property) };
  state.writes.push(create);
  state.hooks?.onWrite?.(create, { present: false, value: undefined }, { type: parent.node.$type, property });
  state.bindings[as] = { node, pointer: "" };
}

function planAssignRef(state: PlanState, step: Record<string, unknown>): void {
  const { env, recipeId } = state;
  const target = lookupTarget(state.bindings, step.target as string);
  const property = stripPath(step.property ?? step.path);
  const context = planContext(state);
  const operands = (step.values as readonly unknown[]) ?? [];
  const ids: string[] = [];
  let scalar = false;
  if (operands.length === 1) {
    const value = must(evaluateValue(operands[0], context, "assignRef.values"));
    if (typeof value === "string") {
      ids.push(value);
      scalar = true;
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== "string") return failContract("profile-type");
        ids.push(item);
      }
    } else return failContract("profile-type");
  } else {
    for (const operand of operands) {
      const value = must(evaluateValue(operand, context, "assignRef.values"));
      if (typeof value === "string") ids.push(value);
      else if (Array.isArray(value)) for (const item of value) {
        if (typeof item !== "string") return failContract("profile-type");
        ids.push(item);
      }
      else return failContract("profile-type");
    }
  }
  const assign: PlannedWrite = { op: "assignRef", recipeId, target: { id: targetId(target) },
    property, mode: step.mode as "replace" | "appendUnique" | "remove", ids,
    cardinality: referenceCardinality(env.descriptors, target.node.$type, property),
    targetTypes: referenceTargets(env.descriptors, target.node.$type, property, env.idRefScalars) };
  state.writes.push(assign);
  state.shapes.set(assign, scalar);
  state.hooks?.onWrite?.(assign, beforeOf(target.node, property), { type: target.node.$type, property });
}

function planSet(state: PlanState, step: Record<string, unknown>): void {
  const target = lookupTarget(state.bindings, step.target as string);
  const value = must(evaluateValue(step.value, planContext(state), `${state.recipeId}.value`));
  if (value === MISSING) return failContract("profile-type");
  const property = stripPath(step.path);
  const set: PlannedWrite = { op: "set", recipeId: state.recipeId, target: { id: targetId(target) },
    property, value: cloneJson(value) };
  state.writes.push(set);
  state.hooks?.onWrite?.(set, beforeOf(target.node, property), { type: target.node.$type, property });
}

function planUnset(state: PlanState, step: Record<string, unknown>): void {
  const target = lookupTarget(state.bindings, step.target as string);
  const property = stripPath(step.path);
  const unset: PlannedWrite = { op: "unset", recipeId: state.recipeId, target: { id: targetId(target) }, property };
  state.writes.push(unset);
  state.hooks?.onWrite?.(unset, beforeOf(target.node, property), { type: target.node.$type, property });
}

function planReparent(state: PlanState, step: Record<string, unknown>): void {
  const { env, recipeId } = state;
  const target = lookupTarget(state.bindings, step.target as string);
  const parent = lookupTarget(state.bindings, step.parent as string);
  const property = step.property as string;
  const admitted = env.descriptors[parent.node.$type]?.containment[property];
  if (!admitted || !admitted.some(name => typeMatches(target.node.$type, name, "assignable", env.descriptors))) {
    return failContract("profile-type");
  }
  const raw = step.position as string | { readonly kind: "before" | "after"; readonly ref: unknown };
  let position: "first" | "last" | "preserve" | { readonly kind: "before" | "after"; readonly ref: string };
  if (typeof raw === "string") {
    if (raw !== "first" && raw !== "last" && raw !== "preserve") return failContract("profile-type");
    position = raw;
  } else {
    const ref = must(evaluateValue((raw as { readonly ref: unknown }).ref, planContext(state), `${recipeId}.position`));
    if (typeof ref !== "string") return failContract("profile-type");
    position = { kind: (raw as { readonly kind: "before" | "after" }).kind, ref };
  }
  const reparent: PlannedWrite = { op: "reparent", recipeId, target: { id: targetId(target) },
    parent: { id: parent.node.id ?? failContract("profile-type") },
    property, position, cardinality: containmentCardinality(env.descriptors, parent.node.$type, property) };
  state.writes.push(reparent);
  state.hooks?.onWrite?.(reparent, { present: false, value: undefined }, { type: parent.node.$type, property });
}

function subtreeIds(index: ReturnType<typeof nativeIndex>, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const root = index.byId.get(rootId);
  if (!root) return ids;
  const visit = (node: NativeNode): void => {
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const item of value) {
        if (item && typeof item === "object" && typeof (item as NativeNode).$type === "string") {
          if (typeof (item as NativeNode).id === "string") ids.add((item as NativeNode).id as string);
          visit(item as NativeNode);
        }
      } else if (value && typeof value === "object" && typeof (value as NativeNode).$type === "string") {
        if (typeof (value as NativeNode).id === "string") ids.add((value as NativeNode).id as string);
        visit(value as NativeNode);
      }
    }
  };
  visit(root.node);
  return ids;
}

function planRemove(state: PlanState, step: Record<string, unknown>): void {
  const { env, recipeId } = state;
  const target = lookupTarget(state.bindings, step.target as string);
  const id = targetId(target);
  const declared = must(selectHandles(step.dependents, evalContext(env, { ...state.bindings, self: target }, state.params)));
  const declaredIds = declared.map(handle => handle.node.id ?? failContract("profile-type"));
  const policy = step.policy as "refuseIfReferenced" | "includeDeclared";
  const deleteIds = policy === "includeDeclared" ? [id, ...declaredIds] : [id];
  const deleted = new Set(deleteIds);
  const doomed = subtreeIds(env.index, id);
  for (const { node } of env.index.entries) {
    if (typeof node.id === "string" && (doomed.has(node.id) || deleted.has(node.id))) continue;
    const type = env.descriptors[node.$type];
    if (!type) continue;
    const check = (value: unknown): void => {
      if (typeof value === "string" && doomed.has(value)) return failContract("reference-dangling");
    };
    for (const field of Object.keys(type.references)) {
      const current = (node as Record<string, unknown>)[field];
      if (Array.isArray(current)) for (const item of current) check(item);
      else check(current);
    }
    for (const scalar of type.scalars) {
      if (!env.idRefScalars.includes(`${node.$type}.${scalar}`)) continue;
      const current = (node as Record<string, unknown>)[scalar];
      if (Array.isArray(current)) for (const item of current) check(item);
      else check(current);
    }
  }
  const remove: PlannedWrite = { op: "remove", recipeId, target: { id }, policy, deleteIds };
  state.writes.push(remove);
  state.hooks?.onWrite?.(remove, { present: true, value: cloneJson(target.node) }, slotOf(state, target));
}

function beforeOf(node: NativeNode, property: string): BeforeInfo {
  if (!Object.hasOwn(node, property)) return { present: false, value: undefined };
  return { present: true, value: cloneJson((node as Record<string, unknown>)[property]) };
}

function slotOf(state: PlanState, target: EvalHandle): Holder {
  const id = target.node.id;
  if (id !== undefined) {
    const entry = state.env.index.byId.get(id);
    const parent = entry?.parent;
    if (parent) {
      for (const [property, value] of Object.entries(parent)) {
        if (value === target.node) return { type: parent.$type, property };
        if (Array.isArray(value) && (value as unknown[]).includes(target.node)) return { type: parent.$type, property };
      }
    }
  }
  return { type: target.node.$type, property: "" };
}

function parentOf(env: PlanEnv, state: PlanState, node: NativeNode): NativeNode | null {
  const made = state.created.find(record => record.node === node);
  if (made) return made.parent;
  const entry = env.index.entries.find(item => item.node === node);
  return entry?.parent ?? null;
}

function nodeById(env: PlanEnv, state: PlanState, id: string): NativeNode | undefined {
  return env.index.byId.get(id)?.node ?? state.created.find(record => record.id === id)?.node;
}

/** Whether the running recipe provides processRef to the ensured binding:
 * the ensure step declares a processRef field, or an assignRef/set step
 * targets the same binding at /processRef. */
function recipeProvidesProcessRef(state: PlanState,
    as: string, fields: Record<string, unknown>): boolean {
  if (Object.hasOwn(fields, "processRef")) return true;
  for (const raw of state.recipeSteps ?? []) {
    if (raw.op !== "assignRef" && raw.op !== "set") continue;
    if (raw.target !== as) continue;
    const path = raw.op === "assignRef" ? (raw.property ?? raw.path) : raw.path;
    if (typeof path !== "string") continue;
    if (path === "processRef" || path === "/processRef") return true;
  }
  return false;
}

async function planEnsure(state: PlanState, step: Record<string, unknown>): Promise<void> {
  const { env, recipeId } = state;
  const as = step.as as string;
  const type = step.type as string;
  const property = step.property as string;
  const role = step.role as string;
  const slot = step.slot as string;
  // An unresolvable owner/parent is a conflicting support definition, never a
  // mistyped expression: the snapshot binding cannot witness this role.
  let parent: EvalHandle, owner: EvalHandle;
  try {
    parent = lookupTarget(state.bindings, step.parent as string);
    owner = lookupTarget(state.bindings, step.owner as string);
  } catch {
    return failContract("support-binding-conflict");
  }
  const ownerNodeId = owner.node.id;
  if (typeof ownerNodeId !== "string") return failContract("support-binding-conflict");
  const context = planContext(state);
  const ownerArgResult = evaluateValue(step.ownerId, context, `${recipeId}.ownerId`);
  const keyResult = evaluateValue(step.key, context, `${recipeId}.key`);
  if (ownerArgResult.status !== "ok" || keyResult.status !== "ok"
    || typeof ownerArgResult.payload !== "string" || typeof keyResult.payload !== "string") {
    return failContract("support-binding-conflict");
  }
  const ownerArg = ownerArgResult.payload, key = keyResult.payload;
  const id = stableId(ownerArg, slot, key);
  const admitted = env.descriptors[parent.node.$type]?.containment[property];
  if (!admitted || !admitted.some(name => typeMatches(type, name, "assignable", env.descriptors))) {
    return failContract("profile-type");
  }
  const fields: Record<string, unknown> = {};
  for (const field of (step.fields as readonly Record<string, unknown>[]) ?? []) {
    const value = must(evaluateValue(field.value, context, `${recipeId}.fields`));
    if (value === MISSING) return failContract("profile-type");
    fields[field.name as string] = cloneJson(value);
  }
  const parentRef = parentRefOf(state, parent);
  // Pass-global role registry: the same owner+role planned twice aliases when
  // the planned identity matches and refuses on a conflicting identity.
  const shared = env.sharedEnsures ?? (env.sharedEnsures = new Map());
  const roleKey = `${ownerNodeId}\n${role}`;
  const identity = canonicalize([ownerNodeId, role, type, parentRef, property, fields, ownerArg, slot, key]);
  const known = shared.get(roleKey);
  if (known !== undefined) {
    if (known.identity !== identity) return failContract("profile-write-conflict");
    state.bindings[as] = { node: known.node, pointer: "" };
    return;
  }
  const scoped = env.supportBindings.filter(binding => binding.role === role && binding.ownerId === ownerNodeId);
  if (scoped.length > 1) return failContract("support-binding-conflict");
  const bound = scoped.length === 1 ? nodeById(env, state, scoped[0]!.targetId) : undefined;
  if (bound !== undefined) {
    if (bound.$type !== type) return failContract("support-binding-conflict");
    if (parentOf(env, state, bound) !== parent.node) return failContract("support-binding-conflict");
    // A reused support element carrying processRef conflicts when the recipe
    // never provides it: a black-box band ensure declares no processRef
    // field and assigns none, while a main-participant recipe assigns it.
    // The check reads the recipe steps, never the role name.
    if (Object.hasOwn(bound, "processRef") && !recipeProvidesProcessRef(state, as, fields)) {
      return failContract("support-binding-conflict");
    }
    shared.set(roleKey, { identity, node: bound, id: scoped[0]!.targetId });
    const pointer = env.index.byId.get(scoped[0]!.targetId)?.pointer ?? "";
    state.bindings[as] = { node: bound, pointer };
    return;
  }
  if (env.propose !== undefined) {
    // Recovery preview: an occupied planned id never refuses. A qualified,
    // attested, unbound occupant is proposed as a reuse; anything else binds
    // the alias to the occupying element. A free id falls through to the
    // normal creation path (its write is discarded by the dry run).
    const occupantEntry = env.index.byId.get(id);
    const occupant = occupantEntry?.node;
    if (occupant !== undefined) {
      const valid = occupant.$type === type && occupantEntry?.parent === parent.node &&
        occupantEntry?.property === property;
      if (valid && env.propose.provenance.has(id) &&
        !env.supportBindings.some(binding => binding.targetId === id)) {
        const proposal: SupportBinding = { ownerId: ownerNodeId, role, targetId: id };
        const clash = env.propose.proposals.some(item => item.targetId === id &&
          (item.ownerId !== proposal.ownerId || item.role !== proposal.role));
        if (clash) return failContract("support-binding-conflict");
        if (!env.propose.proposals.some(item => item.ownerId === proposal.ownerId &&
          item.role === proposal.role && item.targetId === id)) {
          env.propose.proposals.push(proposal);
        }
      }
      shared.set(roleKey, { identity, node: occupant, id });
      state.bindings[as] = { node: occupant, pointer: occupantEntry?.pointer ?? "" };
      return;
    }
  }
  // No binding witnesses this role: the planned id must be free. A tree hit is
  // an ambiguous occupant (id-collision), never a silent reuse.
  if (nodeById(env, state, id) !== undefined) return failContract("id-collision");
  const node: NativeNode = { $type: type, id, ...cloneJson(fields) };
  markCreated(state, node);
  state.created.push({ node, id, parent: parent.node });
  shared.set(roleKey, { identity, node, id });
  const ensure: PlannedWrite = { op: "ensure", recipeId, id, type, parent: parentRef, property,
    fields: cloneJson(fields), cardinality: containmentCardinality(env.descriptors, parent.node.$type, property),
    ownerId: ownerNodeId, role, decision: "create" };
  state.writes.push(ensure);
  state.hooks?.onWrite?.(ensure, { present: false, value: undefined }, { type: parent.node.$type, property });
  state.bindings[as] = { node, pointer: "" };
}

function planPlace(state: PlanState, step: Record<string, unknown>): void {
  const target = lookupTarget(state.bindings, step.target as string);
  const owner = lookupTarget(state.bindings, step.owner as string);
  const region = step.region;
  if (typeof region !== "string" || !region) return failContract("profile-type");
  const elementId = target.node.id;
  const ownerProcessId = owner.node.id;
  if (typeof elementId !== "string" || typeof ownerProcessId !== "string") return failContract("profile-type");
  const related = must(selectHandles(step.related, planContext(state)));
  const relatedAssociationIds = [...new Set(related.map(handle => {
    if (typeof handle.node.id !== "string") return failContract("profile-type");
    return handle.node.id;
  }))].sort();
  let anchorAssociationId: string | undefined;
  const anchorName = step.anchor as string | undefined;
  if (anchorName !== undefined) {
    if (typeof anchorName !== "string" || !Object.hasOwn(state.bindings, anchorName)) {
      return failContract("profile-symbol");
    }
    const anchor = state.bindings[anchorName];
    if (anchor !== MISSING) {
      if (!anchor || Array.isArray(anchor)) return failContract("profile-type");
      if (typeof anchor.node.id !== "string") return failContract("profile-type");
      anchorAssociationId = anchor.node.id;
    }
  }
  state.placements.push({ elementId, ownerProcessId, regionKey: region,
    ...(anchorAssociationId === undefined ? {} : { anchorAssociationId }), relatedAssociationIds });
}

async function planStep(state: PlanState, step: Record<string, unknown>): Promise<void> {
  if (state.verifyOnly && step.op === "refuse") {
    state.verifyDirty = true;
    return;
  }
  switch (step.op) {
    case "bind": planBind(state, step); return;
    case "create": await planCreate(state, step); return;
    case "ensure": await planEnsure(state, step); return;
    case "set": planSet(state, step); return;
    case "unset": planUnset(state, step); return;
    case "assignRef": planAssignRef(state, step); return;
    case "reparent": planReparent(state, step); return;
    case "remove": planRemove(state, step); return;
    case "place": planPlace(state, step); return;
    case "refuse": return failContract(step.code as string);
    default: return failContract("profile-action-phase");
  }
}

export async function planRecipe(compiled: CompiledProfile, envelopeInput: unknown, recipeInput: unknown,
    paramsInput: unknown, authorityInput: unknown): Promise<PureResult<WritePlan>> {
  try {
    const authority = recordOf(authorityInput, "operation-error");
    const actor = authority.actor;
    if (actor !== "editor" && actor !== "code") return failContract("operation-error");
    const activation = parseActivation(authority.activation);
    const { validated, registry, idRefScalars } = compiledState(compiled);
    const recipes = validated.profile.recipes as readonly (RecipeDef & Record<string, unknown>)[];
    let recipe: RecipeDef;
    if (typeof recipeInput === "string") {
      recipe = recipes.find(candidate => candidate.id === recipeInput) ?? failContract("profile-symbol");
    } else {
      const given = recordOf(recipeInput, "profile-symbol") as unknown as RecipeDef;
      const compiledRecipe = recipes.find(candidate => candidate.id === (given as { readonly id: string }).id);
      if (!compiledRecipe || canonicalize(given) !== canonicalize(compiledRecipe)) return failContract("profile-symbol");
      recipe = compiledRecipe;
    }
    if (!EXPLICIT_PHASES.includes(recipe.phase)) return failContract("profile-action-phase");
    if (actor !== "editor") return failContract("profile-producer");
    if ((recipe.steps ?? []).some(step => (step as { readonly op: string }).op === "remove") && authority.deletionIntent !== true) {
      return failContract("profile-producer");
    }
    const envelope = recordOf(envelopeInput, "operation-error");
    const tree = recordOf(envelope.tree, "operation-error") as unknown as NativeNode;
    if (typeof (tree as { readonly $type?: unknown }).$type !== "string") return failContract("operation-error");
    if (typeof envelope.semanticRevision !== "string") return failContract("operation-error");
    const supportBindings = (envelope.bindings ?? []) as PlanEnv["supportBindings"];
    const index = validateNativeReferences(tree, registry.descriptors, idRefScalars);
    const env: PlanEnv = { tree, index, descriptors: registry.descriptors, notions: compiled.notions,
      idRefScalars, supportBindings, ...(registry.unicodeCase ? { unicodeCase: registry.unicodeCase } : {}) };
    const params: Record<string, unknown> = {};
    const bindings: Record<string, Binding> = { root: index.entries[0] ?? failContract("operation-error") };
    const given = recordOf(paramsInput, "profile-ui-parameters");
    for (const declared of recipe.parameters ?? []) {
      const value = (given as Record<string, unknown>)[declared.name];
      if (value === undefined) {
        if (declared.required !== false) return failContract("profile-ui-parameters");
        continue;
      }
      if (declared.type === "string") {
        if (typeof value !== "string") return failContract("profile-type");
        params[declared.name] = value;
      } else if (declared.type === "element") {
        if (typeof value !== "string") return failContract("profile-type");
        const handle = index.byId.get(value);
        if (!handle) return failContract("reference-dangling");
        bindings[declared.name] = handle;
        params[declared.name] = value;
      } else {
        return failContract("profile-ui-parameters");
      }
    }
    for (const name of Object.keys(given)) {
      if (!(recipe.parameters ?? []).some(declared => declared.name === name)) return failContract("profile-ui-parameters");
    }
    const state: PlanState = makePlanState(env, recipe.id, bindings, params);
    await runRecipe(state, recipe);
    checkPlacementAgreement(state.placements);
    const plan: WritePlan = { planVersion: "1", phase: recipe.phase, actor: actor as string, activation,
      baseRevision: envelope.semanticRevision, writes: dedupeWrites(state.writes) };
    return { status: "ok", payload: cloneJson(plan) as WritePlan, diagnostics: [] };
  } catch (error) {
    return { status: "refused", code: (error as { readonly code?: string }).code ?? "operation-error", diagnostics: [] };
  }
}

function dedupeWrites(writes: PlannedWrite[]): PlannedWrite[] {
  const seen = new Set<string>();
  const out: PlannedWrite[] = [];
  for (const write of writes) {
    const key = canonicalize(write);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(write);
  }
  return out;
}

export async function applyPlan(planInput: unknown, stagedTreeInput: unknown, stagedEnvelopeInput: unknown): Promise<PureResult<ChangeReport>> {
  try {
    const plan = recordOf(planInput, "operation-error") as unknown as WritePlan;
    if (plan.planVersion !== "1" || typeof plan.baseRevision !== "string" || !Array.isArray(plan.writes)) {
      return failContract("operation-error");
    }
    const stagedEnvelope = recordOf(stagedEnvelopeInput, "operation-error");
    const stagedTree = recordOf(stagedTreeInput, "operation-error") as unknown as NativeNode;
    if (plan.baseRevision !== stagedEnvelope.semanticRevision) return failContract("operation-error");
    if (canonicalize(stagedTree) !== canonicalize(stagedEnvelope.tree)) return failContract("input-conflict");
    const applier = new Applier(cloneJson(stagedTree) as NativeNode,
      (stagedEnvelope.bindings ?? []) as PlanEnv["supportBindings"]);
    const report = applier.apply(plan);
    const doomed = new Set(report.removed);
    const bindings = applier.bindings.filter(binding => !doomed.has(binding.targetId) && !doomed.has(binding.ownerId));
    return { status: "ok", payload: { reportVersion: "change/1", tree: report.tree, bindings, entries: [], placements: [],
      created: report.created, removed: report.removed }, diagnostics: [] };
  } catch (error) {
    return { status: "refused", code: (error as { readonly code?: string }).code ?? "operation-error", diagnostics: [] };
  }
}

export class Applier {
  readonly bindings: SupportBinding[];
  private readonly byId = new Map<string, NativeNode>();
  private readonly pointerCache = new Map<string, string>();
  private readonly created: NativeNode[] = [];
  readonly createdIds: string[] = [];
  readonly removedIds: string[] = [];

  constructor(readonly tree: NativeNode, bindings?: readonly SupportBinding[], private readonly descriptors?: DescriptorIndex) {
    this.bindings = (bindings ?? []).map(binding => ({ ...binding }));
    this.reindex();
  }

  private reindex(): void {
    this.byId.clear();
    this.pointerCache.clear();
    const visit = (node: NativeNode): void => {
      if (typeof node.id === "string") this.byId.set(node.id, node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) for (const item of value) {
          if (item && typeof item === "object" && typeof (item as NativeNode).$type === "string") visit(item as NativeNode);
        } else if (value && typeof value === "object" && typeof (value as NativeNode).$type === "string") visit(value as NativeNode);
      }
    };
    visit(this.tree);
  }

  private locate(id: string): { parent: NativeNode | null; property: string | null; index: number } {
    if ((this.tree.id ?? null) === id) return { parent: null, property: null, index: -1 };
    const visit = (node: NativeNode): { parent: NativeNode | null; property: string | null; index: number } | null => {
      for (const [property, value] of Object.entries(node)) {
        if (Array.isArray(value)) for (let index = 0; index < value.length; index++) {
          const item = value[index] as NativeNode;
          if (item && typeof item === "object" && typeof item.$type === "string") {
            if (item.id === id) return { parent: node, property, index };
            const found = visit(item);
            if (found) return found;
          }
        } else if (value && typeof value === "object" && typeof (value as NativeNode).$type === "string") {
          if ((value as NativeNode).id === id) return { parent: node, property, index: -1 };
          const found = visit(value as NativeNode);
          if (found) return found;
        }
      }
      return null;
    };
    return visit(this.tree) ?? failContract("reference-dangling");
  }

  pointerOf(id: string): string | undefined {
    if ((this.tree.id ?? null) === id) return "";
    const hit = this.pointerCache.get(id);
    if (hit !== undefined) return hit;
    const trail: (string | number)[] = [];
    const found = (node: NativeNode, prefix: (string | number)[]): boolean => {
      for (const [property, value] of Object.entries(node)) {
        const key = property.replace(/~/g, "~0").replace(/\//g, "~1");
        if (Array.isArray(value)) for (let index = 0; index < value.length; index++) {
          const item = value[index] as NativeNode;
          if (item && typeof item === "object" && typeof item.$type === "string") {
            if (item.id === id) {
              trail.push(...prefix, key, index);
              return true;
            }
            if (found(item, [...prefix, key, index])) return true;
          }
        } else if (value && typeof value === "object" && typeof (value as NativeNode).$type === "string") {
          if ((value as NativeNode).id === id) {
            trail.push(...prefix, key);
            return true;
          }
          if (found(value as NativeNode, [...prefix, key])) return true;
        }
      }
      return false;
    };
    if (!found(this.tree, [])) return undefined;
    const pointer = `/${trail.join("/")}`;
    this.pointerCache.set(id, pointer);
    return pointer;
  }

  private detach(id: string): NativeNode {
    const node = this.byId.get(id) ?? failContract("reference-dangling");
    const slot = this.locate(id);
    if (slot.parent && slot.property) {
      const current = (slot.parent as Record<string, unknown>)[slot.property];
      if (Array.isArray(current)) current.splice(slot.index, 1);
      else delete (slot.parent as Record<string, unknown>)[slot.property];
    }
    this.reindex();
    return node;
  }

  private attach(parent: NativeNode, property: string, node: NativeNode, cardinality: "many" | "single",
      position?: "first" | "last" | "preserve" | { readonly kind: string; readonly ref?: string }): void {
    const slot = (parent as Record<string, unknown>)[property];
    if (cardinality === "single") {
      (parent as Record<string, unknown>)[property] = node;
      this.reindex();
      return;
    }
    const array = Array.isArray(slot) ? slot as unknown[] : [];
    if (!Array.isArray(slot)) (parent as Record<string, unknown>)[property] = array;
    const kind = typeof position === "string" ? position : position?.kind ?? "last";
    if (kind === "first") array.unshift(node);
    else if (kind === "preserve") return failContract("profile-write-conflict");
    else if (kind === "before" || kind === "after") {
      const ref = typeof position === "string" ? undefined : position?.ref;
      const at = array.findIndex(item => (item as NativeNode).id === ref);
      if (at < 0) return failContract("reference-dangling");
      array.splice(kind === "before" ? at : at + 1, 0, node);
    } else array.push(node);
    this.reindex();
  }

  nodeOf(id: string): NativeNode | undefined {
    return this.byId.get(id);
  }

  /** Envelope bindings stay sorted by owner, role and target in UTF-16 order. */
  private sortBindings(): void {
    const rank = (binding: SupportBinding): readonly [string, string, string] =>
      [binding.ownerId, binding.role, binding.targetId];
    this.bindings.sort((a, b) => {
      const left = rank(a), right = rank(b);
      for (let i = 0; i < 3; i++) {
        if (left[i]! < right[i]!) return -1;
        if (left[i]! > right[i]!) return 1;
      }
      return 0;
    });
  }

  applyWrites(writes: readonly PlannedWrite[], scalars?: readonly (boolean | undefined)[]): { created: string[]; removed: string[] } {
    invalidateEvalIndex(this.tree);
    this.checkConflicts(writes);
    const merged = this.coalesceAssignRefs(writes, scalars);
    const created = this.createdIds.length, removed = this.removedIds.length;
    for (const item of merged) {
      const write = item.write;
      switch (write.op) {
        case "create": this.applyCreate(write); break;
        case "ensure": this.applyEnsure(write); break;
        case "assignRef": this.applyAssignRef(write, item.scalar); break;
        case "set": this.applySet(write); break;
        case "unset": {
          const node = this.byId.get(write.target.id) ?? failContract("reference-dangling");
          delete (node as Record<string, unknown>)[write.property];
          break;
        }
        case "reparent": this.applyReparent(write); break;
        case "remove": this.applyRemove(write); break;
      }
    }
    this.sortBindings();
    return { created: this.createdIds.slice(created), removed: this.removedIds.slice(removed) };
  }

  apply(plan: WritePlan): { tree: NativeNode; created: string[]; removed: string[] } {
    invalidateEvalIndex(this.tree);
    this.checkConflicts(plan.writes);
    for (const { write, scalar } of this.coalesceAssignRefs(plan.writes)) {
      switch (write.op) {
        case "create": this.applyCreate(write); break;
        case "ensure": this.applyEnsure(write); break;
        case "assignRef": this.applyAssignRef(write, scalar); break;
        case "set": this.applySet(write); break;
        case "unset": {
          const node = this.byId.get(write.target.id) ?? failContract("reference-dangling");
          delete (node as Record<string, unknown>)[write.property];
          break;
        }
        case "reparent": this.applyReparent(write); break;
        case "remove": this.applyRemove(write); break;
      }
    }
    this.sortBindings();
    return { tree: this.tree, created: [...this.createdIds], removed: [...this.removedIds] };
  }

  /** Coalesce appendUnique/remove deltas on the same reference array by ID:
   * retain existing relative order, apply removals, append new IDs in
   * canonical (UTF-16) order, independent of recipe order (DESIGN §2.4).
   * Replace writes are never merged. Scalar flags only affect replace. */
  private coalesceAssignRefs(writes: readonly PlannedWrite[], scalars?: readonly (boolean | undefined)[]):
      readonly { readonly write: PlannedWrite; readonly scalar: boolean }[] {
    type Delta = Extract<PlannedWrite, { readonly op: "assignRef" }>;
    const acc = new Map<string, { readonly remove: Set<string>; readonly append: Set<string>; readonly first: Delta }>();
    writes.forEach((write) => {
      if (write.op !== "assignRef" || write.mode === "replace") return;
      const inner = new Set<string>();
      for (const id of write.ids) {
        if (inner.has(id)) return failContract("profile-write-conflict");
        inner.add(id);
      }
      const key = `${write.target.id}\n${write.property}`;
      let entry = acc.get(key);
      if (!entry) {
        entry = { remove: new Set(), append: new Set(), first: write };
        acc.set(key, entry);
      }
      for (const id of write.ids) (write.mode === "appendUnique" ? entry.append : entry.remove).add(id);
    });
    if (acc.size === 0) {
      return writes.map((write, index) => ({ write,
        scalar: scalars?.[index] ?? (write as { readonly cardinality?: string }).cardinality === "single" }));
    }
    const emitted = new Set<string>();
    const out: { readonly write: PlannedWrite; readonly scalar: boolean }[] = [];
    writes.forEach((write, index) => {
      if (write.op !== "assignRef" || write.mode === "replace") {
        out.push({ write,
          scalar: scalars?.[index] ?? (write as { readonly cardinality?: string }).cardinality === "single" });
        return;
      }
      const key = `${write.target.id}\n${write.property}`;
      if (emitted.has(key)) return;
      emitted.add(key);
      const entry = acc.get(key)!;
      if (entry.remove.size > 0) {
        out.push({ write: { ...entry.first, mode: "remove", ids: [...entry.remove].sort() }, scalar: false });
      }
      if (entry.append.size > 0) {
        out.push({ write: { ...entry.first, mode: "appendUnique", ids: [...entry.append].sort() }, scalar: false });
      }
    });
    return out;
  }

  private checkConflicts(writes: readonly PlannedWrite[]): void {
    const groups = new Map<string, PlannedWrite[]>();
    for (const write of writes) {
      const key = write.op === "create" || write.op === "ensure"
        ? (`create ${(write as { readonly id?: string }).id ?? canonicalize(write)}`)
        : write.op === "remove" ? `remove ${write.target.id}`
        : write.op === "reparent" ? `reparent ${write.target.id}`
        : `${write.target.id} ${(write as { readonly property: string }).property}`;
      const group = groups.get(key) ?? [];
      group.push(write);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const first = group[0] as PlannedWrite;
      if (group.every(write => canonicalize(write) === canonicalize(first))) continue;
      if (first.op === "assignRef" && group.every(write => write.op === "assignRef")) {
        const modes = group.map(write => (write as { readonly mode: string }).mode);
        if (modes.includes("replace")) return failContract("profile-write-conflict");
        const appended = new Set<string>();
        const removed = new Set<string>();
        for (const write of group) {
          const mode = (write as { readonly mode: string }).mode;
          const ids = (write as { readonly ids: readonly string[] }).ids;
          if (mode === "appendUnique") for (const id of ids) {
            if (removed.has(id)) return failContract("profile-write-conflict");
            appended.add(id);
          } else if (mode === "remove") for (const id of ids) {
            if (appended.has(id)) return failContract("profile-write-conflict");
            removed.add(id);
          } else return failContract("profile-write-conflict");
        }
        continue;
      }
      return failContract("profile-write-conflict");
    }
  }

  private parentOfRef(ref: ParentRef): NativeNode {
    if ("handle" in ref) return this.created[ref.handle] ?? failContract("profile-type");
    if ("id" in ref) return this.byId.get(ref.id) ?? failContract("reference-dangling");
    let current: unknown = this.tree;
    for (const segment of ref.pointer === "" ? [] : ref.pointer.slice(1).split("/")) {
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      if (Array.isArray(current)) {
        if (!/^(0|[1-9][0-9]*)$/.test(key)) return failContract("reference-dangling");
        current = current[Number(key)];
      } else if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[key];
      } else return failContract("reference-dangling");
      if (current === undefined) return failContract("reference-dangling");
    }
    if (!current || typeof current !== "object" || typeof (current as NativeNode).$type !== "string") {
      return failContract("reference-dangling");
    }
    return current as NativeNode;
  }

  private applyCreate(write: Extract<PlannedWrite, { readonly op: "create" }>): void {
    const parent = this.parentOfRef(write.parent);
    const node = cloneJson({ $type: write.type, ...(write.id === undefined ? {} : { id: write.id }), ...write.fields }) as NativeNode;
    if (write.id !== undefined && this.byId.has(write.id)) return failContract("id-collision");
    this.attach(parent, write.property, node, write.cardinality);
    this.created.push(node);
    if (write.id !== undefined) this.createdIds.push(write.id);
  }

  private applyEnsure(write: Extract<PlannedWrite, { readonly op: "ensure" }>): void {
    const parent = this.parentOfRef(write.parent);
    const node = cloneJson({ $type: write.type, id: write.id, ...write.fields }) as NativeNode;
    if (this.byId.has(write.id)) return failContract("id-collision");
    this.attach(parent, write.property, node, write.cardinality);
    this.created.push(node);
    this.createdIds.push(write.id);
    // An ensured support node witnesses its owner+role in the envelope bindings.
    if (!this.bindings.some(binding => binding.ownerId === write.ownerId && binding.role === write.role)) {
      this.bindings.push({ ownerId: write.ownerId, role: write.role, targetId: write.id });
    }
  }

  private applyAssignRef(write: Extract<PlannedWrite, { readonly op: "assignRef" }>, scalar: boolean): void {
    const node = this.byId.get(write.target.id) ?? failContract("reference-dangling");
    const record = node as Record<string, unknown>;
    const before = record[write.property];
    const asArray = Array.isArray(before) || !scalar || write.cardinality === "many";
    if (write.mode === "replace" && !asArray && write.ids.length !== 1) {
      return failContract("profile-type");
    }
    const seen = new Set<string>();
    for (const id of write.ids) {
      if (seen.has(id)) return failContract("profile-write-conflict");
      seen.add(id);
      const endpoint = this.byId.get(id) ?? failContract("reference-dangling");
      // Reference writes validate target type with inheritance: an endpoint
      // whose type extends a declared target type is admitted (DESIGN §2.2
      // typeIs assignable; the pending-reference check already agrees).
      const admitted = this.descriptors !== undefined
        ? write.targetTypes.some(target => typeMatches(endpoint.$type, target, "assignable", this.descriptors!))
        : write.targetTypes.includes(endpoint.$type);
      if (!admitted) return failContract("profile-type");
    }
    if (write.mode === "replace") {
      record[write.property] = asArray ? [...write.ids] : write.ids[0] as string;
    } else if (write.mode === "appendUnique") {
      const current = Array.isArray(before) ? [...(before as string[])] : before === undefined ? [] : [before as string];
      const fresh = write.ids.filter(id => !current.includes(id)).sort();
      record[write.property] = [...current, ...fresh];
    } else if (typeof before === "string") {
      if ((new Set(write.ids)).has(before)) delete record[write.property];
    } else if (Array.isArray(before)) {
      const doomed = new Set(write.ids);
      record[write.property] = (before as string[]).filter(id => !doomed.has(id));
    }
  }

  private applySet(write: Extract<PlannedWrite, { readonly op: "set" }>): void {
    const node = this.byId.get(write.target.id) ?? failContract("reference-dangling");
    (node as Record<string, unknown>)[write.property] = cloneJson(write.value);
  }

  private applyReparent(write: Extract<PlannedWrite, { readonly op: "reparent" }>): void {
    if (write.position === "preserve") {
      const slot = this.locate(write.target.id);
      if (!slot.parent || slot.parent.id !== write.parent.id || slot.property !== write.property) {
        return failContract("profile-write-conflict");
      }
      return;
    }
    const node = this.detach(write.target.id);
    const parent = this.byId.get(write.parent.id) ?? failContract("reference-dangling");
    this.attach(parent, write.property, node, write.cardinality, write.position);
  }

  private applyRemove(write: Extract<PlannedWrite, { readonly op: "remove" }>): void {
    for (const id of write.deleteIds) {
      this.detach(id);
      this.removedIds.push(id);
    }
  }
}
