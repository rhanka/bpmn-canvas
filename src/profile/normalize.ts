import { parseActivation } from "./activation.js";
import type { Activation } from "./activation.js";
import type { CompiledProfile } from "./compiler.js";
import { semanticRevision } from "./envelope.js";
import { cloneJson, failContract, validateNativeReferences } from "./native-contracts.js";
import { Applier } from "./planning.js";
import { collectPass } from "./completion.js";
import type { PendingWrite } from "./completion.js";
import type { BeforeInfo, Holder, PlanEnv, PlannedWrite, PlanState, RecipeDef } from "./planning.js";
import type { PlacementRecord } from "./planning.js";
import type { ReportEntry } from "./report.js";
import type { Result } from "./results.js";
import { admitContent, admitShape, buildStageReport, echoOf, refusedResult } from "./stages.js";

export function sortPlacementRecords(records: readonly PlacementRecord[]): PlacementRecord[] {
  const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
  const seen = new Set<string>();
  return [...records].filter(record => {
    const key = JSON.stringify(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => cmp(a.ownerProcessId, b.ownerProcessId) || cmp(a.regionKey, b.regionKey)
    || cmp(a.elementId, b.elementId)
    || (a.anchorAssociationId === undefined
      ? (b.anchorAssociationId === undefined ? 0 : -1)
      : b.anchorAssociationId === undefined ? 1 : cmp(a.anchorAssociationId, b.anchorAssociationId))
    || (() => {
      const left = a.relatedAssociationIds, right = b.relatedAssociationIds;
      for (let i = 0; i < Math.min(left.length, right.length); i++) {
        const order = cmp(left[i]!, right[i]!);
        if (order !== 0) return order;
      }
      return left.length - right.length;
    })());
}

function buildEntry(applier: Applier, createdIds: readonly string[],
    item: { readonly write: PlannedWrite; readonly before: BeforeInfo }): ReportEntry {
  const { write, before } = item;
  const opName = write.op === "assignRef" ? "assignRef" : write.op;
  const code = `normalize/${opName}`;
  const messageKey = `normalize.${opName}`;
  if (write.op === "create" || write.op === "ensure") {
    const id = (write as { readonly id?: string }).id ?? failContract("profile-type");
    const pointer = applier.pointerOf(id) ?? failContract("profile-type");
    const node = applier.nodeOf(id) ?? failContract("profile-type");
    return { code, severity: "info", classification: "repairable", stage: "normalize", ruleId: write.recipeId, messageKey,
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
  const born = createdIds.includes(targetId);
  return { code, severity: "info", classification: "repairable", stage: "normalize", ruleId: write.recipeId, messageKey,
    disposition: "corrected",
    source: born ? { domain: "none", pointer: null, targetId: null, provenance: "generated" }
      : { domain: "tree", pointer, targetId, provenance: "exact" },
    result: born ? { domain: "tree", pointer, targetId, provenance: "generated" }
      : { domain: "tree", pointer, targetId, provenance: "exact" },
    property,
    ...(before.present ? { beforePresent: true, before: cloneJson(before.value) } : { beforePresent: false }),
    ...(afterPresent ? { afterPresent: true, after } : { afterPresent: false }) } as ReportEntry;
}

export async function normalize(compiled: CompiledProfile, envelopeInput: unknown, activationInput?: unknown,
    placementIntentInput?: unknown): Promise<Result<unknown>> {
  const shape = admitShape(envelopeInput);
  if (!("admitted" in shape)) return refusedResult("normalize", shape.code, null);
  const envelope = shape.admitted;
  const echo = echoOf(envelope);
  try {
    const activation: Activation = parseActivation(activationInput);
    const { validated, registry, descriptors, idRefScalars } = admitContent(compiled, envelope);
    const working = cloneJson(envelope.tree);
    let index = validateNativeReferences(working, descriptors, idRefScalars);
    if (placementIntentInput !== undefined) {
      const intent = placementIntentInput as readonly unknown[];
      if (!Array.isArray(intent)) failContract("operation-error");
      for (const item of intent) {
        const elementId = (item as { readonly elementId?: unknown })?.elementId;
        if (typeof elementId !== "string" || !index.byId.has(elementId)) failContract("reference-dangling");
      }
    }
    const entries: ReportEntry[] = [];
    let placements: PlacementRecord[] = [];
    const recipes = validated.profile.recipes as readonly RecipeDef[];
    const applier = new Applier(working, envelope.bindings ?? [], descriptors);
    for (let pass = 0; pass < 2; pass++) {
      const verify = pass === 1;
      index = validateNativeReferences(working, descriptors, idRefScalars);
      const env: PlanEnv = { tree: working, index, descriptors, notions: compiled.notions, idRefScalars,
        supportBindings: applier.bindings, ...(registry.unicodeCase ? { unicodeCase: registry.unicodeCase } : {}) };
      let collected: { readonly pending: readonly PendingWrite[];
        readonly states: PlanState[]; readonly verifyDirty: boolean };
      try {
        collected = await collectPass(env, recipes, { stage: "normalize", validated, activation, verify });
      } catch (error) {
        if (verify) failContract("normalization-not-fixed");
        throw error;
      }
      placements = collected.states.flatMap(state => state.placements);
      if (verify) {
        if (collected.pending.length > 0 || collected.verifyDirty) failContract("normalization-not-fixed");
        break;
      }
      if (collected.pending.length === 0) break;
      applier.applyWrites(collected.pending.map(item => item.write), collected.pending.map(item => item.scalar));
      for (const item of collected.pending) entries.push(buildEntry(applier, applier.createdIds, item));
    }
    const revision = semanticRevision(working, envelope.profileIdentity, applier.bindings);
    const report = buildStageReport("normalize", { sourceIdentity: echo.identity, targetIdentity: echo.identity,
      inputRevision: echo.baseRevision, outputRevision: revision, entries });
    const sorted = sortPlacementRecords(placements);
    const outEnvelope = { documentVersion: "1" as const, profileIdentity: echo.identity, tree: working,
      bindings: cloneJson(applier.bindings), semanticRevision: revision };
    const payload = { envelope: outEnvelope, placements: sorted, report };
    return { status: "ok", operation: "normalize", profileIdentity: echo.identity, baseRevision: echo.baseRevision,
      revision, report, payload } as unknown as Result<unknown>;
  } catch (error) {
    return refusedResult("normalize", (error as { readonly code?: string }).code ?? "operation-error", echo);
  }
}
