import { Linter } from "bpmnlint";
import type { LintRawFinding, ModdleNode, RuleFactory } from "bpmnlint";
import recommended from "bpmnlint/config/recommended.js";
import adHocSubProcess from "bpmnlint/rules/ad-hoc-sub-process.js";
import conditionalEvent from "bpmnlint/rules/conditional-event.js";
import conditionalFlows from "bpmnlint/rules/conditional-flows.js";
import endEventRequired from "bpmnlint/rules/end-event-required.js";
import eventBasedGateway from "bpmnlint/rules/event-based-gateway.js";
import eventSubProcessTypedStartEvent from "bpmnlint/rules/event-sub-process-typed-start-event.js";
import fakeJoin from "bpmnlint/rules/fake-join.js";
import global from "bpmnlint/rules/global.js";
import labelRequired from "bpmnlint/rules/label-required.js";
import linkEvent from "bpmnlint/rules/link-event.js";
import noBpmndi from "bpmnlint/rules/no-bpmndi.js";
import noComplexGateway from "bpmnlint/rules/no-complex-gateway.js";
import noDisconnected from "bpmnlint/rules/no-disconnected.js";
import noDuplicateSequenceFlows from "bpmnlint/rules/no-duplicate-sequence-flows.js";
import noGatewayJoinFork from "bpmnlint/rules/no-gateway-join-fork.js";
import noImplicitEnd from "bpmnlint/rules/no-implicit-end.js";
import noImplicitSplit from "bpmnlint/rules/no-implicit-split.js";
import noImplicitStart from "bpmnlint/rules/no-implicit-start.js";
import noInclusiveGateway from "bpmnlint/rules/no-inclusive-gateway.js";
import noOverlappingElements from "bpmnlint/rules/no-overlapping-elements.js";
import singleBlankStartEvent from "bpmnlint/rules/single-blank-start-event.js";
import singleEventDefinition from "bpmnlint/rules/single-event-definition.js";
import startEventRequired from "bpmnlint/rules/start-event-required.js";
import subProcessBlankStartEvent from "bpmnlint/rules/sub-process-blank-start-event.js";
import superfluousGateway from "bpmnlint/rules/superfluous-gateway.js";
import superfluousLabel from "bpmnlint/rules/superfluous-label.js";
import superfluousTermination from "bpmnlint/rules/superfluous-termination.js";
import { canonicalize, ProfileContractError } from "./canonical.js";
import { choice, equal, record } from "./boundary.js";
import { cloneJson, failContract, pointerKey } from "./native-contracts.js";
import { buildReport, entry } from "./report.js";
import type { Report, ReportEntry } from "./report.js";
import { compileLintPolicy, flattenLintConfigs, lintStages, profileFinding, resolveLint, standardFinding, severity, validateCompiledOptions } from "./lint-contracts.js";
import type { CompiledLintOptions, LintSourceIndex, Setting } from "./lint-contracts.js";
import type { CompleteProfileDocument } from "./envelope.js";

/** Published lint baseline pinned by lot 1: literal upstream engine, no workbench runner. */
export const LINT_BASELINE = Object.freeze({ engine: "bpmnlint", version: "11.15.0" });
/** The only executable profile plugin. Business checks are data it interprets. */
export const PROFILE_PLUGIN_PACKAGE = "bpmnlint-plugin-profile-mechanism";
export const PROFILE_RULE = "profile-mechanism/profile";
const PROFILE_SHORT_RULE = "profile";

const recommendedFactories: Readonly<Record<string, RuleFactory>> = Object.freeze({
  "ad-hoc-sub-process": adHocSubProcess,
  "conditional-event": conditionalEvent,
  "conditional-flows": conditionalFlows,
  "end-event-required": endEventRequired,
  "event-based-gateway": eventBasedGateway,
  "event-sub-process-typed-start-event": eventSubProcessTypedStartEvent,
  "fake-join": fakeJoin,
  global,
  "label-required": labelRequired,
  "link-event": linkEvent,
  "no-bpmndi": noBpmndi,
  "no-complex-gateway": noComplexGateway,
  "no-disconnected": noDisconnected,
  "no-duplicate-sequence-flows": noDuplicateSequenceFlows,
  "no-gateway-join-fork": noGatewayJoinFork,
  "no-implicit-end": noImplicitEnd,
  "no-implicit-split": noImplicitSplit,
  "no-implicit-start": noImplicitStart,
  "no-inclusive-gateway": noInclusiveGateway,
  "no-overlapping-elements": noOverlappingElements,
  "single-blank-start-event": singleBlankStartEvent,
  "single-event-definition": singleEventDefinition,
  "start-event-required": startEventRequired,
  "sub-process-blank-start-event": subProcessBlankStartEvent,
  "superfluous-gateway": superfluousGateway,
  "superfluous-label": superfluousLabel,
  "superfluous-termination": superfluousTermination,
});

/** Exact pinned upstream recommended rule set. */
export function recommendedRuleNames(): readonly string[] {
  return Object.freeze([...Object.keys(recommended.rules).sort()]);
}

export interface ProfileSubfinding {
  readonly profileRuleId: string; readonly code: string; readonly messageKey: string;
  readonly sourcePointer: string; readonly id?: string;
}
/** Declarative compiled-rule interpretation; owned by the compiler lane (lot 2).
 * Absence is an integrity error, never silent success. */
export type ProfileEvaluator = (options: CompiledLintOptions, root: unknown) => readonly ProfileSubfinding[];

/** The single executable profile rule. Evaluates once at Definitions with a
 * per-instance guard; it never mutates the input tree. */
export function createProfileRule(evaluator?: ProfileEvaluator): RuleFactory {
  return function profileRule(ruleOptions: unknown) {
    const evaluated = new WeakSet<object>();
    return {
      check(node: ModdleNode, reporter: { report(id: string, message: string, path?: Record<string, unknown>): void }): void {
        if (!node || typeof node !== "object" || node.$type !== "bpmn:Definitions" || evaluated.has(node)) return;
        evaluated.add(node);
        const selected = (ruleOptions as CompiledLintOptions).compiledRules ?? [];
        if (!selected.length) return;
        if (!evaluator) throw new Error("profile evaluator unavailable");
        for (const finding of evaluator(ruleOptions as CompiledLintOptions, node)) {
          reporter.report(finding.id ?? finding.profileRuleId, finding.messageKey, {
            profileRuleId: finding.profileRuleId, code: finding.code,
            messageKey: finding.messageKey, sourcePointer: finding.sourcePointer,
            targetId: finding.id ?? null,
          });
        }
      },
    };
  };
}

export interface PinnedRegistryExtras {
  readonly rules?: Readonly<Record<string, RuleFactory>>;
  readonly configs?: Readonly<Record<string, { readonly extends?: readonly string[]; readonly rules?: Readonly<Record<string, unknown>> }>>;
}
export interface PinnedRegistry {
  readonly allowlist: readonly string[];
  resolveRule(pkg: string, ruleName: string): RuleFactory | undefined;
  resolveConfig(pkg: string, configName: string): unknown;
  flatten(names: readonly string[], local: Readonly<Record<string, { readonly severity: unknown; readonly options?: unknown }>>): Record<string, Setting>;
}

/** Static allowlist registry over pinned immutable factories/configs. It never
 * caches configured rule instances or findings; every run builds a fresh Linter. */
export function createPinnedRegistry(extras: PinnedRegistryExtras = {}, profileRule?: RuleFactory): PinnedRegistry {
  const extraRules = extras.rules ?? {}, extraConfigs = extras.configs ?? {};
  const allowlist = Object.freeze(["bpmnlint:recommended", ...Object.keys(extraConfigs).sort()]);
  function resolveRule(pkg: string, ruleName: string): RuleFactory | undefined {
    if (pkg === "bpmnlint") return Object.hasOwn(recommendedFactories, ruleName) ? recommendedFactories[ruleName] : undefined;
    if (pkg === PROFILE_PLUGIN_PACKAGE) return ruleName === PROFILE_SHORT_RULE ? profileRule : undefined;
    const full = `${pkg}/${ruleName}`;
    if (Object.hasOwn(extraRules, full)) return extraRules[full];
    throw new ProfileContractError("lint-config-unknown");
  }
  function resolveConfig(pkg: string, configName: string): unknown {
    if (pkg === "bpmnlint" && configName === "recommended") return recommended;
    const full = configName.includes(":") ? configName : `${pkg}/${configName}`;
    if (Object.hasOwn(extraConfigs, full)) return extraConfigs[full];
    if (pkg === "bpmnlint" || Object.keys(extraConfigs).some(name => name.startsWith(`plugin:${pkg}/`) || name === full)) return undefined;
    throw new ProfileContractError("lint-config-unknown");
  }
  function toSetting(name: string, value: unknown): { rule: string; severity: string | number; classification?: string; options?: Record<string, unknown> } {
    if (typeof value === "string" || typeof value === "number") return { rule: name, severity: value };
    if (Array.isArray(value)) {
      if (value.length !== 2) failContract("lint-rule-error");
      return toSetting(name, { severity: value[0], options: value[1] });
    }
    const setting = cloneJson(value) as { severity: string | number; classification?: string; options?: Record<string, unknown> };
    return {
      rule: name,
      severity: setting.severity,
      ...(setting.classification !== undefined ? { classification: setting.classification } : {}),
      ...(setting.options !== undefined ? { options: setting.options } : {}),
    };
  }
  function flatten(names: readonly string[], local: Readonly<Record<string, { readonly severity: unknown; readonly options?: unknown }>>): Record<string, Setting> {
    return flattenLintConfigs(names, name => {
      if (name === "bpmnlint:recommended") {
        return { rules: Object.fromEntries(Object.entries(cloneJson(recommended.rules)).map(([rule, value]) => [rule, toSetting(rule, value)])) };
      }
      if (Object.hasOwn(extraConfigs, name)) {
        const inherited = cloneJson(extraConfigs[name]) as { extends?: string[]; rules?: Record<string, unknown> };
        return {
          ...(inherited.extends !== undefined ? { extends: inherited.extends } : {}),
          ...(inherited.rules !== undefined
            ? { rules: Object.fromEntries(Object.entries(inherited.rules).map(([rule, value]) => [rule, toSetting(rule, value)])) }
            : {}),
        };
      }
      return undefined;
    }, allowlist, Object.fromEntries(Object.entries(cloneJson(local)).map(([rule, value]) => [rule, toSetting(rule, value)])));
  }
  return { allowlist, resolveRule, resolveConfig, flatten };
}

/** Read-only element-id to absolute-pointer index over a moddle tree. */
export function indexModdleIds(root: unknown): Record<string, string> {
  return indexModdleTree(root).ids;
}

function indexModdleTree(root: unknown): LintSourceIndex {
  const index: Record<string, string> = Object.create(null) as Record<string, string>;
  const pointers = new Set<string>();
  const seen = new Set<object>();
  function walk(node: unknown, pointer: string): void {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    pointers.add(pointer);
    const element = node as Record<string, unknown>;
    if (typeof element.id === "string") index[element.id] = pointer;
    const descriptor = element.$descriptor as { readonly isGeneric?: boolean; readonly properties?: readonly { readonly name: string; readonly isAttr?: boolean; readonly isReference?: boolean; readonly isVirtual?: boolean }[] } | undefined;
    const properties: NonNullable<NonNullable<typeof descriptor>["properties"]> = descriptor?.isGeneric
      ? Object.keys(element).filter(name => !name.startsWith("$") || name === "$children" || name === "$body").map(name => ({ name }))
      : descriptor?.properties ?? [];
    for (const property of properties) {
      if (property.isReference || property.isVirtual || !Object.hasOwn(element, property.name)) continue;
      const value = element[property.name];
      const segment = pointerKey(property.name);
      pointers.add(`${pointer}/${segment}`);
      if (property.isAttr || !value || typeof value !== "object") continue;
      if (Array.isArray(value)) value.forEach((child, position) => {
        if (child && typeof child === "object" && (child as Record<string, unknown>).$type !== undefined) walk(child, `${pointer}/${segment}/${position}`);
        else if (child === null || typeof child !== "object") pointers.add(`${pointer}/${segment}/${position}`);
      });
      else if ((value as Record<string, unknown>).$type !== undefined) walk(value, `${pointer}/${segment}`);
    }
  }
  walk(root, "");
  return { ids: Object.freeze(index), pointers };
}

export interface PolicyRow { readonly severity: unknown; readonly classification: ReportEntry["classification"] }
export interface LintRunRequest {
  readonly stage: typeof lintStages[number];
  readonly readinessPolicy: "draft" | "accept";
  /** Admitted profile: the selected validation record is the sole policy source. */
  readonly profile: CompleteProfileDocument;
  readonly bindings?: CompiledLintOptions["bindings"];
  /** Optional caller witnesses must equal the generated selected configuration. */
  readonly extends?: readonly string[];
  readonly standard?: Readonly<Record<string, readonly [unknown, Readonly<Record<string, unknown>>]>>;
  readonly policies?: Readonly<Record<string, PolicyRow>>;
  readonly compiledOptions?: CompiledLintOptions;
  readonly evaluator?: ProfileEvaluator;
  readonly extraConfigs?: PinnedRegistryExtras["configs"];
}
export interface LintRunResult { readonly report: Report; readonly rawStandardFindings: readonly { readonly rule: string; readonly reports: readonly LintRawFinding[] }[] }

function lintRefusal(code: string): never {
  throw new ProfileContractError(code);
}

/** Literal upstream execution over one selected profile configuration, adapted to
 * one unified report. A fresh Linter and fresh rule instances run every call;
 * only immutable factories survive A->B->A. */
export async function runLint(moddleRoot: unknown, request: LintRunRequest): Promise<LintRunResult> {
  return runLintSync(moddleRoot, request);
}

/** Synchronous execution with the literal upstream applyRule traversal. Only
 * resolution transport is omitted: the registry already contains factories. */
export function runLintSync(moddleRoot: unknown, request: LintRunRequest): LintRunResult {
  const index = indexModdleTree(moddleRoot);
  choice(request.stage, lintStages);
  if (!["draft", "accept"].includes(request.readinessPolicy) || !request.profile) lintRefusal("lint-config-incomplete");
  const profile = cloneJson(request.profile);
  const tables = profile.validation as readonly { readonly id: string; readonly policy: string; readonly extends: readonly string[]; readonly profileRule: string }[];
  const matching = tables.filter(table => table.id === request.stage && table.policy === request.readinessPolicy);
  if (matching.length !== 1 || matching[0]!.profileRule !== PROFILE_RULE) lintRefusal("lint-config-incomplete");
  const table = matching[0]!;
  const registry = createPinnedRegistry(request.extraConfigs === undefined ? {} : { configs: request.extraConfigs }, createProfileRule(request.evaluator));
  const inherited = registry.flatten(table.extends, {});
  const selected = compileLintPolicy(profile, { phase: request.stage, readinessPolicy: request.readinessPolicy }, inherited, recommendedRuleNames(), request.bindings ?? []);
  const policies: Record<string, PolicyRow> = Object.create(null) as Record<string, PolicyRow>;
  let options: CompiledLintOptions;
  try {
    options = validateCompiledOptions(request.compiledOptions ?? selected.compiledOptions, selected.compiledOptions);
    for (const setting of selected.settings) {
      const classification = setting.classification ?? "integrity";
      choice(classification, ["integrity", "readiness", "repairable", "advisory"]);
      policies[setting.rule] = { severity: setting.severity, classification: classification as PolicyRow["classification"] };
    }
    if (request.extends !== undefined && !equal(request.extends, table.extends) ||
      request.standard !== undefined && !equal(request.standard, selected.standard) ||
      request.policies !== undefined && !equal(request.policies, policies)) lintRefusal("lint-config-incomplete");
  } catch (error) {
    if (error instanceof ProfileContractError && error.code === "lint-config-incomplete") throw error;
    lintRefusal("lint-rule-error");
  }
  const upstreamRules: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [name, setting] of Object.entries(selected.standard)) {
    resolveLint("rule", name, candidate => {
      if (candidate === PROFILE_RULE) return undefined;
      try {
        const parsed = /^(?:bpmnlint\/)?([^/]+)$/.exec(candidate);
        if (!parsed) return undefined;
        return registry.resolveRule("bpmnlint", parsed[1]!);
      } catch (error) {
        if (error instanceof ProfileContractError && error.code === "lint-config-unknown") return undefined;
        throw error;
      }
    });
    // The pinned 11.15.0 recommended factories declare no configurable options.
    // Host manifests may supply options only within that closed empty schema.
    record(setting[1], [], [], "lint-rule-error");
    upstreamRules[name] = cloneJson(setting);
  }
  upstreamRules[PROFILE_RULE] = ["error", cloneJson(options)];
  const linter = new Linter({
    resolver: {
      resolveRule: (pkg: string, ruleName: string) => registry.resolveRule(pkg, ruleName),
      resolveConfig: (pkg: string, configName: string) => registry.resolveConfig(pkg, configName),
    },
  });
  let results: Record<string, LintRawFinding[]>;
  try {
    results = Object.create(null) as Record<string, LintRawFinding[]>;
    for (const [name, setting] of Object.entries(upstreamRules)) {
      const [level, config] = setting as readonly [unknown, unknown];
      const category = severity(level).transportSeverity;
      if (category === "off") continue;
      const factory = name === PROFILE_RULE ? registry.resolveRule(PROFILE_PLUGIN_PACKAGE, PROFILE_SHORT_RULE)
        : registry.resolveRule("bpmnlint", name.replace(/^bpmnlint\//, ""));
      if (!factory) lintRefusal("lint-rule-unknown");
      const reports = linter.applyRule(moddleRoot, { name, category, config, rule: factory!(config) });
      if (reports.length) results[name] = reports;
    }
  } catch (error) {
    if (error instanceof ProfileContractError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/unknown rule\b/.test(message)) lintRefusal("lint-rule-unknown");
    if (/unknown config\b/.test(message)) lintRefusal("lint-config-unknown");
    lintRefusal("lint-rule-error");
  }
  const entries: ReportEntry[] = [];
  const rawStandardFindings: { readonly rule: string; readonly reports: readonly LintRawFinding[] }[] = [];
  for (const [name, findings] of Object.entries(results!)) {
    if (name === PROFILE_RULE) {
      const compiled = options.compiledRules as readonly Record<string, unknown>[];
      for (const finding of findings) {
        if (finding.category === "rule-error" || typeof finding.profileRuleId !== "string") {
          entries.push(entry({ stage: request.stage, ruleId: "adapter", code: "lint-rule-error", messageKey: "lint-rule-error",
            severity: "error", classification: "integrity", disposition: "observed" }));
          continue;
        }
        const candidate = compiled.find(item => item.id === finding.profileRuleId);
        const rule = candidate && typeof candidate.id === "string" && typeof candidate.code === "string" && typeof candidate.message === "string"
          ? { id: candidate.id, code: candidate.code, message: candidate.message }
          : undefined;
        const policy = rule ? policies[`profile:${rule.id}`] : undefined;
        if (!rule || !policy) {
          entries.push(entry({ stage: request.stage, ruleId: "adapter", code: "lint-rule-error", messageKey: "lint-rule-error",
            severity: "error", classification: "integrity", disposition: "observed" }));
          continue;
        }
        try {
          entries.push(profileFinding({ profileRuleId: finding.profileRuleId, code: finding.code,
            messageKey: finding.messageKey, sourcePointer: finding.sourcePointer,
            ...(finding.targetId !== null ? { id: finding.targetId } : {}) },
            rule, policy, index, request.stage));
        } catch {
          entries.push(entry({ stage: request.stage, ruleId: "adapter", code: "lint-rule-error", messageKey: "lint-rule-error",
            severity: "error", classification: "integrity", disposition: "observed" }));
        }
      }
      continue;
    }
    const policy = policies[name];
    if (!policy) lintRefusal("lint-config-incomplete");
    rawStandardFindings.push({ rule: name, reports: findings.map(finding => cloneJson(finding)) });
    for (const finding of findings) {
      if (finding.category === "rule-error") {
        entries.push(entry({ stage: request.stage, ruleId: "adapter", code: "lint-rule-error", messageKey: "lint-rule-error",
          severity: "error", classification: "integrity", disposition: "observed" }));
        continue;
      }
      const coordinates: { readonly id?: string; readonly path?: unknown } = finding.id === undefined ? { path: finding.path } : { id: finding.id, path: finding.path };
      entries.push(standardFinding(coordinates, { ...policy, rule: name }, index.ids, request.stage));
    }
  }
  return { report: buildReport("validate", { entries, rawStandardFindings: cloneJson(rawStandardFindings) }), rawStandardFindings };
}

export type EventKind = "StartEvent" | "IntermediateCatchEvent" | "EndEvent" | "IntermediateThrowEvent";
export interface EventDefinitionInput { readonly type: "TimerEventDefinition" | "TerminateEventDefinition"; readonly timerBody?: string }
export interface EventMatrixVerdict { readonly ok: boolean; readonly gate?: "open-throw" }

/** Closed §6.5 event matrix. Empty catch/throw forms stay gated on the owner
 * OPEN-THROW decision; downstream schema generation for AI tool schemas is out
 * of scope (§11) and consumes this table only. */
export function checkEventMatrix(kind: EventKind, definitions: readonly EventDefinitionInput[]): EventMatrixVerdict {
  canonicalize([kind, definitions]);
  choice(kind, ["StartEvent", "IntermediateCatchEvent", "EndEvent", "IntermediateThrowEvent"]);
  const fail = (): EventMatrixVerdict => ({ ok: false });
  const gated = (): EventMatrixVerdict => ({ ok: true, gate: "open-throw" });
  if (definitions.length === 0) {
    if (kind === "StartEvent" || kind === "EndEvent") return { ok: true };
    return gated();
  }
  if (definitions.length > 1) return fail();
  const [definition] = definitions;
  if (definition!.type === "TerminateEventDefinition") return kind === "EndEvent" ? { ok: true } : fail();
  if (kind === "EndEvent" || kind === "IntermediateThrowEvent") return fail();
  if (typeof definition!.timerBody !== "string" || definition!.timerBody.length === 0) return fail();
  return { ok: true };
}
