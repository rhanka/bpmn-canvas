import { canonicalize } from "./canonical.js";
import { gateDecision, parseActivation } from "./activation.js";
import type { Activation, GateTrigger } from "./activation.js";
import type { CompiledProfile } from "./compiler.js";
import { compiledState } from "./public-compiler.js";
import type { AuthorityField } from "./compiler-authority.js";
import { semanticRevision } from "./envelope.js";
import { allocateMissingIds, cloneJson, failContract, pointerKey, validateNativeReferences } from "./native-contracts.js";
import { Applier, checkPlacementAgreement, makePlanState, runRecipe } from "./planning.js";
import type { BeforeInfo, Holder, PlanEnv, PlannedWrite, PlanState, RecipeDef } from "./planning.js";
import type { ReportEntry } from "./report.js";
import type { Result } from "./results.js";
import { admitContent, admitShape, buildStageReport, checkProducer, echoOf, refusedResult, type AdmittedEnvelope } from "./stages.js";

const COMPLETE_MODES = ["extraction", "retained"];

export interface PendingWrite {
  readonly write: PlannedWrite;
  readonly before: BeforeInfo;
  readonly holder: Holder;
  readonly scalar: boolean;
}

export function isEffective(write: PlannedWrite, before: BeforeInfo, scalar: boolean): boolean {
  switch (write.op) {
    case "create":
    case "ensure":
    case "reparent":
    case "remove":
      return true;
    case "set":
      return !before.present || canonicalize(before.value) !== canonicalize(write.value);
    case "unset":
      return before.present;
    case "assignRef": {
      if (write.mode === "replace") {
        if (!before.present) return true;
        const cardinality = (write as { readonly cardinality?: string }).cardinality;
        const next = Array.isArray(before.value) || !scalar || cardinality === "many" ? write.ids
          : write.ids[0] as unknown;
        return canonicalize(before.value) !== canonicalize(next);
      }
      const norm = !before.present ? [] : Array.isArray(before.value) ? before.value as unknown[] : [before.value];
      if (write.mode === "appendUnique") {
        if (!before.present) return write.ids.length > 0;
        return write.ids.some(id => !(norm as unknown[]).includes(id));
      }
      return write.ids.some(id => (norm as unknown[]).includes(id));
    }
  }
}

function dedupeKey(write: PlannedWrite): string {
  const { recipeId: _ignored, ...rest } = write as PlannedWrite & { readonly recipeId: string };
  void _ignored;
  return canonicalize(rest);
}

/** Extraction modification check (DESIGN §7.1 actor matrix): C preserves valid
 * content but only generates defaults and AI-authored members. An effective
 * C write that changes a present member no AI actor may author means the
 * extraction input smuggled foreign authorship: refuse profile-producer.
 * Additions (absent before) and C-stable reruns pass. */
function checkExtractionModifications(authorityFields: readonly AuthorityField[], delta: readonly {
    readonly nativeType: string; readonly path: string; readonly from: string; readonly to: string }[],
    pending: readonly PendingWrite[]): void {
  const table = new Map(authorityFields.map(field =>
    [`${field.type}\n${field.field}`, field] as const));
  for (const item of pending) {
    if (item.write.op !== "assignRef" && item.write.op !== "set" && item.write.op !== "unset") continue;
    if (!item.before.present) continue;
    const field = table.get(`${item.holder.type}\n${item.holder.property}`);
    if (!field) continue;
    const producers = new Set<string>(field.producers);
    for (const entry of delta) {
      if (entry.nativeType === field.type && entry.path === `/${pointerKey(field.field)}`) {
        producers.delete(entry.from);
        producers.add(entry.to);
      }
    }
    if (!producers.has("ai")) return failContract("profile-producer");
  }
}

function gateFor(write: PlannedWrite, before: BeforeInfo, holder: Holder): GateTrigger | null {
  if (write.op === "ensure") return "support-create";
  if (write.op !== "assignRef" && write.op !== "set") return null;
  const property = (write as { readonly property: string }).property;
  if (holder.type === "bpmn:Lane" && property === "flowNodeRef" && write.op === "assignRef") {
    return write.mode === "remove" ? "lane-member-remove" : "lane-member-write";
  }
  if (holder.type === "bpmn:DataOutputAssociation" && property === "sourceRef" && !before.present) {
    return "output-source-fill";
  }
  return null;
}

function checkGate(write: PlannedWrite, before: BeforeInfo, holder: Holder, activation: Activation): void {
  const trigger = gateFor(write, before, holder);
  if (!trigger) return;
  if (trigger === "lane-member-remove" && activation === "qualification") {
    failContract("responsibility-preservation-required");
  }
  const decision = gateDecision(trigger, activation);
  if (!decision.proceed) failContract(decision.code);
}

export interface EntryIdSets {
  readonly allocated: ReadonlyMap<string, string | null>;
  readonly created: readonly string[];
}

function buildEntry(stage: "complete" | "normalize", applier: Applier, item: PendingWrite, ids: EntryIdSets): ReportEntry {
  const { write, before } = item;
  const opName = write.op === "assignRef" ? "assignRef" : write.op;
  const code = `${stage}/${opName}`;
  const messageKey = `${stage}.${opName}`;
  if (write.op === "create" || write.op === "ensure") {
    const id = (write as { readonly id?: string }).id ?? failContract("profile-type");
    const pointer = applier.pointerOf(id) ?? failContract("profile-type");
    const node = applier.nodeOf(id) ?? failContract("profile-type");
    return { code, severity: "info", classification: "repairable", stage, ruleId: write.recipeId, messageKey,
      disposition: "corrected",
      source: { domain: "none", pointer: null, targetId: null, provenance: "generated" },
      result: { domain: "tree", pointer, targetId: id, provenance: "generated" },
      property: write.property, beforePresent: false, afterPresent: true, after: cloneJson(node) } as ReportEntry;
  }
  const targetId = (write as { readonly target: { readonly id: string } }).target.id;
  const property = (write as { readonly property: string }).property;
  const pointer = `${applier.pointerOf(targetId) ?? failContract("profile-type")}/${property}`;
  const afterNode = applier.nodeOf(targetId) ?? failContract("profile-type");
  const afterPresent = Object.hasOwn(afterNode, property);
  const after = afterPresent ? cloneJson((afterNode as Record<string, unknown>)[property]) : undefined;
  const born = ids.created.includes(targetId);
  const owner = ids.allocated.get(targetId);
  const filled = owner !== undefined && owner !== null ? (applier.nodeOf(owner) ? owner : null)
    : owner === null ? null : undefined;
  return { code, severity: "info", classification: "repairable", stage, ruleId: write.recipeId, messageKey,
    disposition: "corrected",
    source: born ? { domain: "none", pointer: null, targetId: null, provenance: "generated" }
      : filled !== undefined ? { domain: "tree", pointer, targetId: filled, provenance: "exact" }
      : { domain: "tree", pointer, targetId, provenance: "exact" },
    result: born || filled !== undefined ? { domain: "tree", pointer, targetId, provenance: "generated" }
      : { domain: "tree", pointer, targetId, provenance: "exact" },
    property,
    ...(before.present ? { beforePresent: true, before: cloneJson(before.value) } : { beforePresent: false }),
    ...(afterPresent ? { afterPresent: true, after } : { afterPresent: false }) } as ReportEntry;
}

export interface CollectOptions {
  readonly stage: "complete" | "normalize";
  readonly validated: AdmittedEnvelope["validated"];
  readonly activation: Activation;
  readonly verify: boolean;
  /** Recovery preview skips gate checks (producer checks still apply). */
  readonly gates?: boolean;
}

export async function collectPass(env: PlanEnv, recipes: readonly RecipeDef[], options: CollectOptions): Promise<{
    readonly pending: PendingWrite[]; readonly states: PlanState[]; readonly verifyDirty: boolean }> {
  const pending: PendingWrite[] = [];
  const states: PlanState[] = [];
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (recipe.phase !== options.stage) continue;
    const state = makePlanState(env, recipe.id, { root: env.index.entries[0] ?? failContract("operation-error") }, {},
      { onWrite: (write: PlannedWrite, before: BeforeInfo, holder: Holder) => {
        const scalar = write.op === "assignRef" ? state.shapes.get(write) ?? false : false;
        if (!isEffective(write, before, scalar)) return;
        if (options.verify) {
          state.verifyDirty = true;
          return;
        }
        if (options.gates ?? true) checkGate(write, before, holder, options.activation);
        checkProducer(options.validated, holder.type, holder.property, "code");
        const key = dedupeKey(write);
        if (seen.has(key)) return;
        seen.add(key);
        pending.push({ write, before, holder, scalar });
      } });
    if (options.verify) state.verifyOnly = true;
    await runRecipe(state, recipe);
    states.push(state);
  }
  checkPlacementAgreement(states.flatMap(state => state.placements));
  return { pending, states, verifyDirty: states.some(state => state.verifyDirty === true) };
}

export async function complete(compiled: CompiledProfile, envelopeInput: unknown, modeInput?: unknown, activationInput?: unknown): Promise<Result<unknown>> {
  const shape = admitShape(envelopeInput);
  if (!("admitted" in shape)) return refusedResult("complete", shape.code, null);
  const envelope = shape.admitted;
  const echo = echoOf(envelope);
  try {
    const mode = modeInput ?? "retained";
    if (typeof mode !== "string" || !COMPLETE_MODES.includes(mode)) failContract("operation-error");
    const activation: Activation = parseActivation(activationInput);
    const { validated, registry, descriptors, idRefScalars } = admitContent(compiled, envelope);
    const extractionDelta = mode === "extraction" ? validated.profile.producerDelta as readonly {
        readonly nativeType: string; readonly path: string; readonly from: string; readonly to: string }[] ?? [] : undefined;
    if (extractionDelta !== undefined && !extractionDelta.some(entry => entry.to === "ai")) {
      failContract("profile-producer");
    }
    const allocated = await allocateMissingIds(cloneJson(envelope.tree), descriptors);
    const working = allocated.tree;
    const entries: ReportEntry[] = [];
    let index = validateNativeReferences(working, descriptors, idRefScalars);
    const owners = new Map(allocated.allocations.map(item => [item.id, item.sourceOwner]));
    for (const createdId of allocated.createdIds) {
      const pointer = `${index.byId.get(createdId)?.pointer ?? failContract("profile-type")}/id`;
      const owner = owners.get(createdId) ?? null;
      const ownerId = owner !== null && index.byId.has(owner) ? owner : null;
      entries.push({ code: "complete/allocate-id", severity: "info", classification: "repairable", stage: "complete",
        ruleId: "stable-id/1", messageKey: "complete.allocate-id", disposition: "corrected",
        source: { domain: "tree", pointer, targetId: ownerId, provenance: "exact" },
        result: { domain: "tree", pointer, targetId: createdId, provenance: "generated" },
        property: "id", beforePresent: false, afterPresent: true, after: createdId } as ReportEntry);
    }
    const recipes = validated.profile.recipes as readonly RecipeDef[];
    const applier = new Applier(working, envelope.bindings ?? [], descriptors);
    const authorityFields = extractionDelta !== undefined ? compiledState(compiled).authorityFields : undefined;
    for (let pass = 0; pass < 2; pass++) {
      const verify = pass === 1;
      index = validateNativeReferences(working, descriptors, idRefScalars);
      const env: PlanEnv = { tree: working, index, descriptors, notions: compiled.notions, idRefScalars,
        supportBindings: applier.bindings, ...(registry.unicodeCase ? { unicodeCase: registry.unicodeCase } : {}) };
      let collected: { readonly pending: PendingWrite[]; readonly states: PlanState[]; readonly verifyDirty: boolean };
      try {
        collected = await collectPass(env, recipes, { stage: "complete", validated, activation, verify });
      } catch (error) {
        if (verify) failContract("normalization-not-fixed");
        throw error;
      }
      if (!verify && authorityFields !== undefined && extractionDelta !== undefined) {
        checkExtractionModifications(authorityFields, extractionDelta, collected.pending);
      }
      if (verify) {
        if (collected.pending.length > 0 || collected.verifyDirty) failContract("normalization-not-fixed");
        break;
      }
      if (collected.pending.length === 0) break;
      applier.applyWrites(collected.pending.map(item => item.write), collected.pending.map(item => item.scalar));
      const idSets = { allocated: owners, created: applier.createdIds };
      for (const item of collected.pending) entries.push(buildEntry("complete", applier, item, idSets));
    }
    const revision = semanticRevision(working, envelope.profileIdentity, applier.bindings);
    const report = buildStageReport("complete", { sourceIdentity: echo.identity, targetIdentity: echo.identity,
      inputRevision: echo.baseRevision, outputRevision: revision, entries });
    const payload = { documentVersion: "1" as const, profileIdentity: echo.identity, tree: working,
      bindings: cloneJson(applier.bindings), semanticRevision: revision };
    return { status: "ok", operation: "complete", profileIdentity: echo.identity, baseRevision: echo.baseRevision,
      revision, report, payload } as unknown as Result<unknown>;
  } catch (error) {
    return refusedResult("complete", (error as { readonly code?: string }).code ?? "operation-error", echo);
  }
}
