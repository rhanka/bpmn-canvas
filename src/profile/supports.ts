import { parseActivation } from "./activation.js";
import { collectPass } from "./completion.js";
import type { CompiledProfile } from "./compiler.js";
import { semanticRevision } from "./envelope.js";
import { cloneJson, compareBindings, failContract, validateNativeReferences } from "./native-contracts.js";
import type { PlanEnv, RecipeDef, SupportBinding } from "./planning.js";
import { admitContent, admitShape, buildStageReport, echoOf, refusedResult } from "./stages.js";
import type { PureResult, Result } from "./results.js";

function checkSelection(bindingsInput: unknown): SupportBinding[] {
  if (!Array.isArray(bindingsInput)) return failContract("profile-schema");
  const seen = new Set<string>();
  return (bindingsInput as readonly unknown[]).map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return failContract("profile-schema");
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "ownerId,role,targetId") return failContract("profile-schema");
    const { ownerId, role, targetId } = record;
    if (typeof ownerId !== "string" || typeof role !== "string" || typeof targetId !== "string" ||
      !ownerId || !role || !targetId) return failContract("profile-schema");
    const key = `${ownerId}\n${role}`;
    if (seen.has(key)) return failContract("support-binding-conflict");
    seen.add(key);
    return { ownerId, role, targetId };
  });
}

/** Explicit support binding transaction (§5.5): the selection merges over the
 * snapshot bindings without touching the tree. Edit activation stays gated. */
export async function bindSupports(compiled: CompiledProfile, envelopeInput: unknown,
    bindingsInput: unknown, activationInput?: unknown): Promise<Result<unknown>> {
  const shape = admitShape(envelopeInput);
  if (!("admitted" in shape)) return refusedResult("bindSupports", shape.code, null);
  const envelope = shape.admitted;
  const echo = echoOf(envelope);
  try {
    const activation = parseActivation(activationInput);
    const selected = checkSelection(bindingsInput);
    const { descriptors, idRefScalars } = admitContent(compiled, envelope);
    if (activation === "edit") return failContract("profile-open");
    const snapshot = (envelope.bindings ?? []) as readonly SupportBinding[];
    const takenRoles = new Set(snapshot.map(binding => `${binding.ownerId}\n${binding.role}`));
    const takenTargets = new Set(snapshot.map(binding => binding.targetId));
    const index = validateNativeReferences(envelope.tree, descriptors, idRefScalars);
    for (const entry of selected) {
      if (takenRoles.has(`${entry.ownerId}\n${entry.role}`)) return failContract("support-binding-conflict");
      if (!index.byId.has(entry.ownerId) || !index.byId.has(entry.targetId)) {
        return failContract("support-binding-conflict");
      }
      if (takenTargets.has(entry.targetId)) return failContract("support-binding-conflict");
      takenRoles.add(`${entry.ownerId}\n${entry.role}`);
      takenTargets.add(entry.targetId);
    }
    const merged = [...snapshot.map(binding => ({ ...binding })), ...selected.map(entry => ({ ...entry }))]
      .sort(compareBindings);
    const revision = semanticRevision(envelope.tree, envelope.profileIdentity, merged);
    const report = buildStageReport("bindSupports", { sourceIdentity: echo.identity, targetIdentity: echo.identity,
      inputRevision: echo.baseRevision, outputRevision: revision, entries: [] });
    const outEnvelope = { documentVersion: "1" as const, profileIdentity: echo.identity, tree: cloneJson(envelope.tree),
      bindings: merged, semanticRevision: revision };
    return { status: "ok", operation: "bindSupports", profileIdentity: echo.identity, baseRevision: echo.baseRevision,
      revision, report, payload: outEnvelope } as unknown as Result<unknown>;
  } catch (error) {
    return refusedResult("bindSupports", (error as { readonly code?: string }).code ?? "operation-error", echo);
  }
}

/** Read-only recovery preview (§6.7): plans the normalize recipes as
 * qualification would, without gates and without applying, reporting the
 * ensures that can reuse an attested element. */
export async function proposeSupportBindings(compiled: CompiledProfile, envelopeInput: unknown,
    provenanceInput?: unknown): Promise<PureResult<{ readonly proposals: readonly SupportBinding[] }>> {
  const shape = admitShape(envelopeInput);
  if (!("admitted" in shape)) return { status: "refused", code: shape.code, diagnostics: [] };
  const envelope = shape.admitted;
  try {
    if (provenanceInput !== undefined && (!Array.isArray(provenanceInput) ||
      !(provenanceInput as readonly unknown[]).every(item => typeof item === "string"))) {
      return failContract("operation-error");
    }
    const { validated, registry, descriptors, idRefScalars } = admitContent(compiled, envelope);
    const index = validateNativeReferences(envelope.tree, descriptors, idRefScalars);
    const recipes = validated.profile.recipes as readonly RecipeDef[];
    const proposals: SupportBinding[] = [];
    const env: PlanEnv = { tree: envelope.tree, index, descriptors, notions: compiled.notions, idRefScalars,
      supportBindings: (envelope.bindings ?? []) as readonly SupportBinding[],
      ...(registry.unicodeCase ? { unicodeCase: registry.unicodeCase } : {}),
      propose: { provenance: new Set((provenanceInput ?? []) as readonly string[]), proposals } };
    await collectPass(env, recipes, { stage: "normalize", validated, activation: "qualification", verify: false, gates: false });
    proposals.sort(compareBindings);
    return { status: "ok", payload: { proposals: proposals.map(item => ({ ...item })) }, diagnostics: [] };
  } catch (error) {
    return { status: "refused", code: (error as { readonly code?: string }).code ?? "operation-error", diagnostics: [] };
  }
}
