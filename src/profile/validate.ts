import { canonicalize, ProfileContractError } from "./canonical.js";
import { compiledState } from "./public-compiler.js";
import { checkHostInputLimits, evaluatePredicate, selectHandles } from "./compiler.js";
import type { CompiledProfile, EvalContext, EvalHandle } from "./compiler.js";
import { cloneJson, failContract, listDanglingReferences, nativeIndex, pointerKey } from "./native-contracts.js";
import { checkCompatibility } from "./compatibility.js";
import { semanticRevision } from "./envelope.js";
import type { DocumentEnvelope } from "./envelope.js";
import { compileLintPolicy, lintSummary, lintStages } from "./lint-contracts.js";
import type { CompiledLintOptions } from "./lint-contracts.js";
import { createPinnedRegistry, runLintSync } from "./lint-bridge.js";
import type { PolicyRow, ProfileSubfinding } from "./lint-bridge.js";
import { buildReport, entry } from "./report.js";
import { validateEnvelopeShape, validateResult } from "./results.js";
import type { PureResult, Result } from "./results.js";
import type { ReportEntry } from "./report.js";
import { hydrate } from "../io/moddle-json.js";
import type { ModdleJsonElement } from "../io/moddle-json.js";
import { IoError } from "../io/errors.js";
import type { Report } from "./report.js";

export interface ValidationReport { readonly ok: boolean; readonly counts: { readonly info: number; readonly warn: number; readonly error: number } }
const value = <T>(result: PureResult<T>): T => result.status === "ok" ? result.payload : failContract(result.code);
type Rule = CompiledLintOptions["compiledRules"][number] & {
  readonly select: unknown; readonly assert: unknown; readonly code: string; readonly message: string;
  readonly bindings?: readonly { readonly as: string; readonly select: unknown; readonly cardinality: string; readonly fallbacks?: readonly unknown[] }[];
};

function interpret(options: CompiledLintOptions, context: EvalContext): readonly ProfileSubfinding[] {
  const findings: ProfileSubfinding[] = [];
  const index = nativeIndex(context.tree, context.descriptors);
  for (const rule of options.compiledRules as readonly Rule[]) {
    for (const self of value(selectHandles(rule.select, context))) {
      const bindings: Record<string, EvalHandle | readonly EvalHandle[]> = { ...context.bindings, self };
      for (const binding of rule.bindings ?? []) {
        let handles = value(selectHandles(binding.select, { ...context, bindings }));
        if (binding.cardinality === "first") {
          for (const fallback of binding.fallbacks ?? []) {
            if (handles.length) break;
            handles = value(selectHandles(fallback, { ...context, bindings }));
          }
        } else if (handles.length > 1) failContract("profile-ambiguous-binding");
        if (!handles.length && binding.cardinality === "one") failContract("profile-binding-missing");
        if (handles[0]) bindings[binding.as] = handles[0];
        else delete bindings[binding.as];
      }
      if (!value(evaluatePredicate(rule.assert, { ...context, bindings }))) {
        const ancestor = index.entries.filter(e => typeof e.node.id === "string" && (self.pointer === e.pointer || self.pointer.startsWith(`${e.pointer}/`)))
          .sort((a, b) => b.pointer.length - a.pointer.length)[0];
        findings.push({ profileRuleId: rule.id, code: rule.code, messageKey: rule.message, sourcePointer: self.pointer,
          ...(ancestor?.node.id ? { id: ancestor.node.id } : {}) });
      }
    }
  }
  return findings;
}

/** Read-only synchronous Result/1 boundary. Every selected declarative rule is
 * interpreted by the single profile plugin; upstream traversal stays literal. */
export function validate(compiled: CompiledProfile, input: DocumentEnvelope, selector: { readonly phase: string; readonly readinessPolicy: string }): Result<ValidationReport> {
  let envelope: DocumentEnvelope | undefined;
  let attempted: Report | undefined;
  try {
    envelope = validateEnvelopeShape(input);
    const { validated, registry, idRefScalars } = compiledState(compiled);
    if (!selector || Object.keys(selector).sort().join(",") !== "phase,readinessPolicy" ||
      !(lintStages as readonly string[]).includes(selector.phase) || !["draft", "accept"].includes(selector.readinessPolicy)) failContract("lint-config-incomplete");
    // §3.3 compatibility preflight (C1): the matrix replaces the blanket
    // identity comparison. The source package is the injected profile itself,
    // so it is available exactly when the identities already agree.
    const injected = compiled.identity;
    const resources = validated.profile.resources as readonly { readonly assetKey: string }[];
    const decision = checkCompatibility({
      runtime: { mechanisms: ["1"], schemas: ["1.0.0"], capabilities: [...registry.capabilities], assets: resources.map(r => r.assetKey) },
      injected,
      document: { documentVersion: envelope.documentVersion, profileIdentity: envelope.profileIdentity },
      requiredCapabilities: [...(validated.profile.capabilities as readonly string[])],
      requiredAssets: resources.map(r => r.assetKey),
      sourcePackage: canonicalize(injected) === canonicalize(envelope.profileIdentity) ? "known-and-available" : "unavailable",
      envelopeValid: true,
      selectedMigration: false,
    });
    if (decision.verdict.status === "refused") failContract(decision.verdict.code);
    if (semanticRevision(envelope.tree, envelope.profileIdentity, envelope.bindings) !== envelope.semanticRevision) failContract("profile-schema");
    // Dangling references are adapter findings (C2), never an admission
    // refusal: the lenient index collects them for the report below.
    const { dangling } = listDanglingReferences(envelope.tree, registry.descriptors, idRefScalars);
    void dangling;
    checkHostInputLimits(envelope.tree);
    const table = (validated.profile.validation as readonly { readonly id: string; readonly policy: string; readonly extends?: readonly string[] }[])
      .find(t => t.id === selector.phase && t.policy === selector.readinessPolicy);
    const inherited = createPinnedRegistry().flatten(table?.extends ?? [], {}) as Parameters<typeof compileLintPolicy>[2];
    const policy = compileLintPolicy(validated.profile, selector, inherited, registry.requiredStandardRules ?? [], envelope.bindings);
    const policies: Record<string, PolicyRow> = Object.create(null) as Record<string, PolicyRow>;
    for (const setting of policy.settings) {
      policies[setting.rule] = { severity: setting.severity, classification: (setting.classification ?? "integrity") as PolicyRow["classification"] };
    }
    const context: EvalContext = { tree: envelope.tree, descriptors: registry.descriptors, idRefScalars, supportBindings: envelope.bindings,
      notions: compiled.notions, bindings: { root: { node: envelope.tree, pointer: "" } }, admission: "lenient",
      ...(registry.unicodeCase ? { unicodeCase: registry.unicodeCase } : {}) };
    const root = hydrate(envelope.tree as ModdleJsonElement, registry.codecConfiguration ?? { contractVersion: "1", defaults: "explicit", descriptors: {} });
    const { report: findings } = runLintSync(root, { stage: selector.phase as "import", readinessPolicy: selector.readinessPolicy as "draft",
      profile: validated.profile, bindings: envelope.bindings,
      standard: policy.standard, policies, compiledOptions: policy.compiledOptions, evaluator: options => interpret(options, context) });
    const identity = envelope.profileIdentity, revision = envelope.semanticRevision;
    // Graph-index integrity entries for dangling references (C2): library
    // adapter convention, ruleId adapter, messageKey = code.
    const adapters: ReportEntry[] = dangling.map(ref => entry({ code: "reference-dangling", severity: "error",
      classification: "integrity", stage: selector.phase as ReportEntry["stage"], ruleId: "adapter", messageKey: "reference-dangling",
      disposition: "observed",
      source: ref.elementId === null
        ? { domain: "tree", pointer: `${ref.pointer}/${pointerKey(ref.property)}`, targetId: null, provenance: "unavailable" }
        : { domain: "tree", pointer: `${ref.pointer}/${pointerKey(ref.property)}`, targetId: ref.elementId, provenance: "exact" },
      result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" } }));
    const entries = [...findings.entries, ...adapters];
    attempted = buildReport("validate", { ...findings, entries, sourceIdentity: identity, inputRevision: revision });
    if (entries.some(entry => entry.code === "lint-rule-error")) failContract("lint-rule-error");
    // Draft readiness keeps identity integrity blocking: an unresolved
    // dangling-adapter error refuses with the first such code (C19), while
    // qualification (accept) reports every entry.
    if (selector.readinessPolicy === "draft") {
      const blocked = entries.find(entry => entry.ruleId === "adapter" && entry.severity === "error");
      if (blocked) failContract(blocked.code);
    }
    const report = buildReport("validate", { ...findings, entries, sourceIdentity: identity, targetIdentity: identity, inputRevision: revision, outputRevision: revision });
    return validateResult<ValidationReport>({ status: "ok", operation: "validate", profileIdentity: identity, baseRevision: revision, revision, report, payload: lintSummary(report.entries) });
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : error instanceof IoError ? error.code : "operation-error";
    return { status: "refused", operation: "validate", ...(envelope ? { profileIdentity: cloneJson(envelope.profileIdentity), baseRevision: envelope.semanticRevision } : {}),
      code, diagnostics: attempted?.entries ?? [], report: attempted ?? buildReport("validate", envelope ? { sourceIdentity: envelope.profileIdentity, inputRevision: envelope.semanticRevision } : {}) };
  }
}
