/** Lot-5 command execution: surface/upstream/field records through the profile
 * transaction adapter (DESIGN §8.2–§8.3). Reuses planRecipe/applyPlan for recipe
 * steps, complete for C defaults, draft lint around N, exactly one C/N pass per
 * batch (I4). Refusal codes: C7 producer, C8 unadapted entry, C10 stale state,
 * C12 removal closure, C19 first error, D6 paste allocation, D7 replace map. */
import { planRecipe, applyPlan } from "./planning.js";
import { complete } from "./completion.js";
import { validate } from "./validate.js";
import { normalize } from "./normalize.js";
import { compareStageEntries } from "./stages.js";
import { typeMatches } from "./native-contracts.js";
import { canonicalize } from "./canonical.js";
import type { NativeNode } from "./native-contracts.js";
import {
  TreeIndex, clone, rewriteRefs, danglingRefs, revisionOf, stableId as pasteId, asRecord, asArray, type Rec,
  type ReferenceDriver,
} from "./lot5-support.js";
import { compiledState } from "./public-compiler.js";
import {
  subjectScope, holdsResult, recognizedNotions,
  viewOf, type Lot5ProfileView, type EvalScope,
} from "./lot5-eval.js";

export type { Lot5ProfileView };
export { viewOf };

export interface CommandTree {
  readonly tree: NativeNode;
  readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
}

export type StageRefusal = { readonly code: string; readonly entries: readonly Rec[] };
export type StageOutcome = { readonly tree: NativeNode; readonly bindings: CommandTree["bindings"];
  readonly completeEntries: readonly Rec[]; readonly idMap: readonly Rec[];
  readonly created: readonly string[]; readonly removed: readonly string[] };

const HANDLE_SOURCES = new Set(["owner", "target", "source"]);
const DATA_SOURCES = new Set(["value", "key"]);

const recipeHasRemove = (recipe: Rec): boolean =>
  (asArray(recipe.steps) ?? []).some(step => asRecord(step)?.op === "remove");

const sortedEntries = (entries: readonly Rec[]): Rec[] =>
  [...entries].sort((a, b) => compareStageEntries(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>)) as Rec[];

type BoundCall = { entry: Rec; recipe: Rec; params: Record<string, unknown> };

/** Resolve a surface command record against a detached tree. */
function resolveSurface(view: Lot5ProfileView, command: Rec, tree: NativeNode, index: TreeIndex,
  bindings: CommandTree["bindings"]): BoundCall | StageRefusal {
  if (typeof command.entry !== "string") return { code: "profile-symbol", entries: [] };
  const entry = view.entryById.get(command.entry);
  if (!entry) return { code: "profile-symbol", entries: [] };
  const context = asRecord(command.context) ?? {};
  for (const key of Object.keys(command)) {
    if (key !== "command" && key !== "entry" && key !== "context" && key !== "fragment") {
      return { code: "profile-ui-parameters", entries: [] };
    }
  }
  // Subject (L655): owner for palette/paste, target for context/replace/delete/
  // direct-edit, source for append/connect.
  const surface = entry.surface as string;
  if (command.fragment !== undefined && surface !== "paste") return { code: "profile-ui-parameters", entries: [] };
  const subjectSource = surface === "palette" || surface === "paste" ? "owner"
    : surface === "append" || surface === "connect" ? "source" : "target";
  const subject = context[subjectSource];
  if (subject === undefined) return { code: "profile-ui-parameters", entries: [] };
  if (typeof subject !== "string") return { code: "profile-type", entries: [] };
  const scope = subjectScope(view, tree, index, subject, bindings);
  if (!scope) return { code: "reference-dangling", entries: [] };
  // A predicate refusal outside notion recognition propagates with the
  // evaluator's original code; only a boolean non-match denies entry.
  const held = holdsResult(view, (entry as Rec).when, scope);
  if (typeof held === "string") return { code: held, entries: [] };
  if (!held) return { code: "profile-producer", entries: [] };
  const recipe = view.recipeById.get(entry.recipe as string);
  if (!recipe) return { code: "profile-symbol", entries: [] };
  const bound = bindParams(recipe, entry, context, index, subjectSource);
  if ("code" in bound) return bound;
  return { entry, recipe, params: bound.params };
}

function bindParams(recipe: Rec, entry: Rec, context: Rec, index: TreeIndex, subjectSource: string): { params: Record<string, unknown> } | StageRefusal {
  const declared = (asArray(recipe.parameters) ?? []).map(p => asRecord(p)).filter((p): p is Rec => !!p && typeof p.name === "string");
  const bound: Record<string, unknown> = {};
  const used = new Set<string>([subjectSource]);
  for (const param of declared) {
    const source = (entry.parameters as Rec[]).find(p => p.name === param.name)?.source as string;
    const raw = context[source];
    if (raw === undefined) {
      if (param.required !== false) return { code: "profile-ui-parameters", entries: [] };
      continue;
    }
    used.add(source);
    if (HANDLE_SOURCES.has(source)) {
      if (typeof raw !== "string") return { code: "profile-type", entries: [] };
      if (!index.get(raw)) return { code: "reference-dangling", entries: [] };
      bound[param.name as string] = raw;
    } else if (DATA_SOURCES.has(source)) {
      if (typeof raw !== "string") return { code: "profile-type", entries: [] };
      bound[param.name as string] = raw;
    } else {
      return { code: "profile-ui-parameters", entries: [] };
    }
  }
  for (const key of Object.keys(context)) {
    if (!used.has(key)) return { code: "profile-ui-parameters", entries: [] };
  }
  return { params: bound };
}

type CommandKind = { kind: "surface" } | { kind: "upstream"; upstream: string }
  | { kind: "field"; notion: string; field: string } | StageRefusal;

function resolveKind(command: Rec): CommandKind {
  if (!["surface", "upstream", "field"].includes(command.command as string)) return { code: "transaction-entry-unsupported", entries: [] };
  const allowed = command.command === "field"
    ? ["command", "notion", "field", "context"]
    : ["command", "entry", "upstream", "context", "fragment"];
  for (const key of Object.keys(command)) {
    if (!allowed.includes(key)) return { code: "profile-ui-parameters", entries: [] };
  }
  if (command.command === "surface") return { kind: "surface" };
  if (command.command === "upstream") {
    if (typeof command.upstream !== "string") return { code: "profile-symbol", entries: [] };
    return { kind: "upstream", upstream: command.upstream };
  }
  if (command.command === "field") {
    if (typeof command.notion !== "string" || typeof command.field !== "string") return { code: "profile-symbol", entries: [] };
    return { kind: "field", notion: command.notion, field: command.field };
  }
  return { code: "transaction-entry-unsupported", entries: [] };
}

/** Map an upstream ID to its unique enabled entry (C8). */
function upstreamEntry(view: Lot5ProfileView, upstream: string): Rec | undefined {
  const owners = view.entries.filter(e => ((e.upstreamEntries ?? []) as unknown[]).includes(upstream));
  return owners.length === 1 ? owners[0] : undefined;
}

const isRootType = (type: string): boolean =>
  type === "bpmn:Process" || type === "bpmn:Collaboration" || type === "bpmn:DataStore";

/** B19 ownership: a root element for any target, else the same nearest Process. */
function sameOwnership(target: { node: NativeNode; parent: unknown }, candidate: { node: NativeNode; parent: unknown }): boolean {
  if (isRootType(candidate.node.$type)) return true;
  const processOf = (handle: { node: NativeNode; parent: unknown }): string | null => {
    let current: { node: NativeNode; parent: unknown } | null = handle;
    while (current) {
      if (current.node.$type === "bpmn:Process" && typeof current.node.id === "string") return current.node.id;
      current = current.parent as { node: NativeNode; parent: unknown } | null;
    }
    return null;
  };
  return processOf(target) === processOf(candidate);
}

/** Submit-time validation for a field command. */
function resolveField(view: Lot5ProfileView, notionId: string, fieldId: string, context: Rec,
  tree: NativeNode, index: TreeIndex, bindings: CommandTree["bindings"]): BoundCall | StageRefusal {
  const target = context.target;
  if (typeof target !== "string") return { code: "profile-type", entries: [] };
  const targetNode = index.get(target);
  if (!targetNode) return { code: "reference-dangling", entries: [] };
  const notion = view.notionById.get(notionId);
  const field = notion ? ((asArray(notion.fields) ?? []).map(f => asRecord(f)).find(f => f?.id === fieldId) ?? undefined) : undefined;
  if (!notion || !field) return { code: "profile-symbol", entries: [] };
  const scope = subjectScope(view, tree, index, target, bindings);
  if (!scope) return { code: "reference-dangling", entries: [] };
  if (!recognizedNotions(view, scope).includes(notionId)) return { code: "profile-type", entries: [] };
  // Visibility/mutability refusals propagate with the evaluator's original
  // code; only a boolean hidden/immutable field (or a missing command) denies.
  const shown = holdsResult(view, (field as Rec).visible, scope);
  if (typeof shown === "string") return { code: shown, entries: [] };
  const editable = holdsResult(view, (field as Rec).mutable, scope);
  if (typeof editable === "string") return { code: editable, entries: [] };
  if (!shown || !editable || !field.command) {
    return { code: "profile-producer", entries: [] };
  }
  if (!Object.hasOwn(context, "value")) return { code: "profile-ui-parameters", entries: [] };
  const recipe = view.recipeById.get(field.command as string);
  if (!recipe) return { code: "profile-symbol", entries: [] };
  const value = context.value;
  const checked = checkFieldValue(view, field, value, target, targetNode, index);
  if ("code" in checked) return checked;
  if (Object.keys(context).some(key => key !== "target" && key !== "value")) return { code: "profile-ui-parameters", entries: [] };
  const fieldBound = bindParams(recipe, field, context, index, "target");
  if ("code" in fieldBound) return fieldBound;
  void scope;
  return { entry: field, recipe, params: fieldBound.params };
}

/** Shared submit/on-change value check (fields-020…053, check-039…047). */
export function checkFieldValue(view: Lot5ProfileView, field: Rec, value: unknown,
  target: string, targetNode: { node: NativeNode; parent: unknown }, index: TreeIndex): { ok: true } | StageRefusal {
  void target;
  const widget = field.widget as string;
  if (widget === "text" || widget === "multiline") {
    if (typeof value !== "string") return { code: "profile-type", entries: [] };
    return { ok: true };
  }
  if (widget === "enum") {
    const choices = (asArray(field.choices) ?? []).map(c => asRecord(c)?.value);
    if (typeof value !== "string" || !choices.some(choice => choice === value)) return { code: "profile-type", entries: [] };
    return { ok: true };
  }
  if (widget === "reference") {
    if (typeof value !== "string") return { code: "profile-type", entries: [] };
    const candidate = index.get(value);
    if (!candidate) return { code: "reference-dangling", entries: [] };
    const targetTypes = (asArray(field.targetTypes) ?? []).filter((t): t is string => typeof t === "string");
    if (!targetTypes.some(type => typeMatches(candidate.node.$type, type, "assignable", view.descriptors))) {
      return { code: "profile-type", entries: [] };
    }
    if (!sameOwnership(targetNode, candidate)) return { code: "profile-type", entries: [] };
    return { ok: true };
  }
  return { code: "profile-type", entries: [] };
}

// ---------------------------------------------------------------- paste (D6) and copy (B20)
export interface FragmentElement { readonly property: string; readonly element: NativeNode }
export interface PasteFragment { readonly fragmentVersion: string; readonly sourceRevision: string; readonly elements: readonly FragmentElement[] }

/** Read-only copy fragment in source document pre-order (B20). */
export function copyFragment(tree: NativeNode, index: TreeIndex, elementIds: readonly string[],
  sourceRevision: string): { fragment: PasteFragment } | StageRefusal {
  for (const id of elementIds) {
    if (!index.get(id)) return { code: "reference-dangling", entries: [] };
  }
  const requested = [...new Set(elementIds)].map(id => index.get(id)!);
  for (const node of requested) {
    if (node.parent === null) return { code: "profile-type", entries: [] };
  }
  const kept = requested.filter(node => !requested.some(other => other !== node && index.containedIn(node, other)));
  const rank = new Map(index.order.map((node, i) => [node, i]));
  kept.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  return {
    fragment: {
      fragmentVersion: "1",
      sourceRevision,
      elements: kept.map(node => ({ property: node.property ?? "", element: clone(node.node) })),
    },
  };
}

/** Collect every id under a node. */
function collectIds(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, into);
    return;
  }
  const record = asRecord(node);
  if (!record) return;
  if (typeof record.id === "string") into.add(record.id);
  for (const value of Object.values(record)) collectIds(value, into);
}

/** Paste as explicit creation with D6 ID reallocation. */
function doPaste(view: Lot5ProfileView, ownerId: string, key: string, fragment: PasteFragment,
  tree: NativeNode, index: TreeIndex): { tree: NativeNode; created: string[] } | StageRefusal {
  const owner = index.get(ownerId);
  if (!owner) return { code: "reference-dangling", entries: [] };
  const elements = asArray(fragment.elements as unknown) ?? [];
  const map = new Map<string, string>();
  for (const item of elements) {
    const record = asRecord(item);
    if (record) collectFragmentIds(record.element, map, ownerId, key);
  }
  const live = new Set<string>();
  collectIds(tree, live);
  for (const fresh of map.values()) {
    if (live.has(fresh)) return { code: "id-collision", entries: [] };
  }
  const clones = elements.map(item => {
    const record = asRecord(item) ?? {};
    return { property: typeof record.property === "string" ? (record.property as string) : "", element: clone(record.element) as NativeNode };
  });
  // Paste rewriting is descriptor-driven: reference members come from the
  // compiled descriptor index plus the declared ID-valued scalars.
  const driver: ReferenceDriver = { descriptors: view.descriptors,
    idRefScalars: compiledState(view.compiled).idRefScalars };
  for (const item of clones) rewriteRefs(item.element, map, driver);
  const known = new Set<string>(live);
  for (const fresh of map.values()) known.add(fresh);
  for (const item of clones) {
    for (const stray of danglingRefs(item.element, known, driver)) {
      if (!admittedExternal(view, clones, stray, index)) return { code: "reference-dangling", entries: [] };
    }
  }
  const next = clone(tree);
  const nextIndex = new TreeIndex(next);
  const nextOwner = nextIndex.get(ownerId);
  if (!nextOwner) return { code: "reference-dangling", entries: [] };
  const target = nextOwner.node as unknown as Rec;
  for (const item of clones) {
    const slot = target[item.property];
    if (!Array.isArray(slot)) return { code: "profile-type", entries: [] };
    (slot as unknown[]).push(item.element);
  }
  return { tree: next, created: [...map.values()] };
}

function collectFragmentIds(node: unknown, map: Map<string, string>, ownerId: string, key: string): void {
  if (Array.isArray(node)) {
    for (const item of node) collectFragmentIds(item, map, ownerId, key);
    return;
  }
  const record = asRecord(node);
  if (!record) return;
  if (typeof record.id === "string" && !map.has(record.id)) {
    map.set(record.id, pasteId(ownerId, "paste", canonicalize([key, record.id])));
  }
  for (const value of Object.values(record)) collectFragmentIds(value, map, ownerId, key);
}

/** An external reference survives only when it resolves in the destination
 * with an admitted type: descriptor-declared reference targets, else bare
 * resolution for scalar id references such as calledElement. */
function admittedExternal(view: Lot5ProfileView, clones: { element: NativeNode }[],
  stray: { id: string; member: string; value: string }, index: TreeIndex): boolean {
  const foundType = typeOf(index.get(stray.value)?.node) ?? typeOfClone(clones, stray.value);
  if (!foundType) return false;
  const hostType = typeOf(index.get(stray.id)?.node) ?? typeOfClone(clones, stray.id);
  if (!hostType) return false;
  const references = asRecord(asRecord(view.descriptorTypes[hostType])?.references ?? {});
  const declared = asArray(references?.[stray.member])?.filter((t): t is string => typeof t === "string");
  if (!declared) return true;
  return declared.some(type => typeMatches(foundType, type, "assignable", view.descriptors));
}

const typeOf = (node: NativeNode | undefined): string | undefined =>
  node && typeof node.$type === "string" ? node.$type : undefined;

function typeOfClone(clones: { element: NativeNode }[], id: string): string | undefined {
  const found = cloneLookup(clones, id);
  return found?.$type;
}

function cloneLookup(clones: { element: NativeNode }[], id: string): { $type: string } | undefined {
  for (const item of clones) {
    const found = findTyped(item.element, id);
    if (found) return found;
  }
  return undefined;
}

function findTyped(node: unknown, id: string): { $type: string } | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTyped(item, id);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(node);
  if (!record) return undefined;
  if (record.id === id && typeof record.$type === "string") return { $type: record.$type as string };
  for (const value of Object.values(record)) {
    const found = findTyped(value, id);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------- transaction orchestration (I4: one C/N pass per batch)
export async function executeTransaction(view: Lot5ProfileView, compiled: object, start: CommandTree,
  commands: readonly Rec[], identity: Rec, placementIntent?: readonly Rec[]):
  Promise<(StageOutcome & { entries: readonly Rec[] }) | StageRefusal> {
  let tree = clone(start.tree);
  let bindings = clone(start.bindings);
  let index = new TreeIndex(tree);
  const created: string[] = [];
  const removed: string[] = [];
  for (const command of commands) {
    const record = asRecord(command);
    if (!record || typeof record.command !== "string") return { code: "transaction-entry-unsupported", entries: [] };
    const kind = resolveKind(record);
    if ("code" in kind) return kind;
    if (kind.kind === "upstream") {
      const entry = upstreamEntry(view, kind.upstream);
      if (!entry) return { code: "transaction-entry-unsupported", entries: [] };
      const staged = { ...record, command: "surface", entry: entry.id } as Rec;
      delete staged.upstream;
      const outcome = await runSurface(view, compiled, staged, tree, bindings, index, created, removed);
      if ("code" in outcome) return outcome;
      tree = outcome.tree;
      bindings = outcome.bindings;
      index = new TreeIndex(tree);
      continue;
    }
    if (kind.kind === "field") {
      const context = asRecord(record.context) ?? {};
      const resolved = resolveField(view, kind.notion, kind.field, context, tree, index, bindings);
      if ("code" in resolved) return resolved;
      const outcome = await runRecipe(view, compiled, resolved.recipe, resolved.params, tree, bindings, index, created, removed);
      if ("code" in outcome) return outcome;
      tree = outcome.tree;
      bindings = outcome.bindings;
      index = new TreeIndex(tree);
      continue;
    }
    const outcome = await runSurface(view, compiled, record, tree, bindings, index, created, removed);
    if ("code" in outcome) return outcome;
    tree = outcome.tree;
    bindings = outcome.bindings;
    index = new TreeIndex(tree);
  }
  // Filter bindings of removed targets; nothing else changes before C.
  const live = new Set<string>();
  collectIds(tree, live);
  bindings = bindings.filter(binding => live.has(binding.targetId));
  const stagedEnvelope = { documentVersion: "1", profileIdentity: clone(identity), tree: clone(tree), bindings: clone(bindings), semanticRevision: revisionOf(tree, identity as never, bindings) };
  const completed = await complete(compiled as never, stagedEnvelope as never, "retained", undefined);
  if (completed.status !== "ok") {
    return { code: (completed as unknown as { code?: string }).code ?? "operation-error", entries: [] };
  }
  const completedPayload = (completed as unknown as { payload: { tree: NativeNode; bindings: CommandTree["bindings"]; semanticRevision: string } }).payload;
  const completeEntries = (asArray((asRecord((completed as unknown as { report: unknown }).report) as Rec)?.entries) ?? []).map(e => clone(e) as Rec);
  const pre = validate(compiled as never, completedPayload as never, { phase: "pre-normalize", readinessPolicy: "draft" } as never);
  const preEntries = pre.status === "ok"
    ? (asArray((asRecord((pre as unknown as { report: unknown }).report) as Rec)?.entries) ?? []).map(e => clone(e) as Rec)
    : (asArray((pre as unknown as { diagnostics: unknown }).diagnostics) ?? []).map(e => clone(e) as Rec);
  const preError = preEntries.find(entry => entry.severity === "error");
  if (pre.status !== "ok" || preError) return { code: pre.status !== "ok" ? pre.code : preError!.code as string, entries: preEntries };
  const normalized = await normalize(compiled as never, completedPayload as never, "edit", placementIntent);
  if (normalized.status !== "ok") {
    return { code: (normalized as unknown as { code?: string }).code ?? "operation-error", entries: preEntries };
  }
  const normalizedPayload = (normalized as unknown as { payload: { envelope: typeof completedPayload } }).payload.envelope;
  const post = validate(compiled as never, normalizedPayload as never, { phase: "post-normalize", readinessPolicy: "draft" } as never);
  const postEntries = post.status === "ok"
    ? (asArray((asRecord((post as unknown as { report: unknown }).report) as Rec)?.entries) ?? []).map(e => clone(e) as Rec)
    : (asArray((post as unknown as { diagnostics: unknown }).diagnostics) ?? []).map(e => clone(e) as Rec);
  const postError = postEntries.find(entry => entry.severity === "error");
  if (post.status !== "ok" || postError) return { code: post.status !== "ok" ? post.code : postError!.code as string, entries: [...preEntries, ...postEntries] };
  const createdOnce = [...new Set(created)];
  const removedOnce = [...new Set(removed)];
  const createdSet = new Set(createdOnce);
  // DESIGN L629-L633, L739, L744-L746, L751, L755, L766: a change entry that
  // writes an element created by a command of the same transaction carries the
  // generated source and result, never the staged-tree coordinates. Observed
  // lint findings keep the linted-candidate coordinates (L510, B12).
  const withGeneratedProvenance = (entry: Rec): Rec => {
    const record = asRecord(entry) ?? {};
    if (record.disposition !== "corrected") return entry;
    const result = asRecord(record.result as Rec);
    const targetId = result?.targetId;
    if (typeof targetId !== "string" || !createdSet.has(targetId)) return entry;
    const rewritten = clone(entry);
    (rewritten as Rec).source = { domain: "none", pointer: null, targetId: null, provenance: "generated" } as unknown as Rec;
    ((rewritten as Rec).result as Rec).provenance = "generated";
    return rewritten as Rec;
  };
  const fixedCompleteEntries = completeEntries.map(withGeneratedProvenance);
  const fixedNormalizedEntries = (asArray((normalized.report as unknown as Rec)?.entries) ?? []).map(e => withGeneratedProvenance(clone(e) as Rec));
  const replacement = commands.some(command => (command.command === "surface" ? view.entryById.get(command.entry as string)
    : command.command === "upstream" ? upstreamEntry(view, command.upstream as string) : undefined)?.surface === "replace");
  const idMap: Rec[] = replacement && createdOnce.length === 1 && removedOnce.length === 1
    ? [{ sourceId: removedOnce[0], resultId: createdOnce[0], domain: "migration" }]
    : [];
  return {
    tree: normalizedPayload.tree,
    bindings: normalizedPayload.bindings ?? bindings,
    completeEntries: fixedCompleteEntries,
    idMap,
    created: createdOnce,
    removed: removedOnce,
    entries: sortedEntries([...fixedCompleteEntries, ...preEntries, ...fixedNormalizedEntries, ...postEntries]),
  };
}

/** DESIGN L547: an owner without any input set gains the deterministic
 * default set before a DataInput-creating recipe binds its ioSpecification.
 * Owners that already carry an ioSpecification are left untouched. */
function ensureDefaultInputSet(tree: NativeNode, index: TreeIndex, command: Rec): TreeIndex {
  const ownerId = (asRecord(command.context) ?? {}).owner;
  if (typeof ownerId !== "string") return index;
  const owner = index.get(ownerId)?.node as unknown as Rec | undefined;
  if (!owner) return index;
  const io = asRecord(owner.ioSpecification as Rec);
  if (io && Array.isArray(io.inputSets)) return index;
  const fallback = { $type: "bpmn:InputSet", id: pasteId(ownerId, "input-set", "default") };
  if (io) io.inputSets = [fallback];
  else owner.ioSpecification = { $type: "bpmn:InputOutputSpecification", dataInputs: [], inputSets: [fallback] };
  return new TreeIndex(tree);
}

async function runSurface(view: Lot5ProfileView, compiled: object, command: Rec, tree: NativeNode,
  bindings: CommandTree["bindings"], index: TreeIndex, created: string[], removed: string[],
): Promise<{ tree: NativeNode; bindings: CommandTree["bindings"] } | StageRefusal> {
  const resolved = resolveSurface(view, command, tree, index, bindings);
  if ("code" in resolved) return resolved;
  if ((resolved.recipe.steps as Rec[]).some(step => step.op === "create" && step.type === "bpmn:DataInput")) {
    index = ensureDefaultInputSet(tree, index, command);
  }
  if (resolved.entry.surface === "paste") {
    const fragment = asRecord(command.fragment) as unknown as { elements: unknown } | undefined;
    const context = asRecord(command.context) ?? {};
    if (!fragment || !Array.isArray(fragment.elements) || typeof context.owner !== "string" || typeof context.key !== "string") {
      return { code: "profile-ui-parameters", entries: [] };
    }
    const pasted = doPaste(view, context.owner, context.key, fragment as never, tree, index);
    if ("code" in pasted) return pasted;
    for (const id of pasted.created) created.push(id);
    return { tree: pasted.tree, bindings };
  }
  return runRecipe(view, compiled, resolved.recipe, resolved.params, tree, bindings, index, created, removed);
}

async function runRecipe(view: Lot5ProfileView, compiled: object, recipe: Rec, params: Record<string, unknown>,
  tree: NativeNode, bindings: CommandTree["bindings"], index: TreeIndex, created: string[], removed: string[],
): Promise<{ tree: NativeNode; bindings: CommandTree["bindings"] } | StageRefusal> {
  void view;
  void index;
  const identity = (compiled as { identity: Rec }).identity;
  const envelope = { documentVersion: "1", profileIdentity: identity, tree, bindings, semanticRevision: revisionOf(tree, identity as never, bindings) };
  const plan = await planRecipe(compiled as never, envelope as never, recipe.id as string, params as never,
    { activation: "edit", actor: "editor", deletionIntent: recipeHasRemove(recipe) } as never);
  if (plan.status !== "ok") return { code: (plan as unknown as { code?: string }).code ?? "operation-error", entries: [] };
  const applied = await applyPlan((plan as unknown as { payload: unknown }).payload, tree, envelope as never);
  if (applied.status !== "ok") return { code: (applied as unknown as { code?: string }).code ?? "operation-error", entries: [] };
  const payload = (applied as unknown as { payload: { tree?: NativeNode; created?: readonly string[]; removed?: readonly string[] } }).payload;
  if (payload?.tree) tree = payload.tree;
  for (const id of payload?.created ?? []) created.push(id);
  for (const id of payload?.removed ?? []) removed.push(id);
  return { tree, bindings };
}

export { validate, normalize };
export type { EvalScope };
