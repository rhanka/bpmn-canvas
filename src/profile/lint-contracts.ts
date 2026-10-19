import { canonicalDigest } from "./canonical.js";
import { cloneJson, failContract, validateBindingKeys } from "./native-contracts.js";
import { array, choice, compareText, digest, equal, record, text } from "./boundary.js";
import { entry, sourceCoordinate, validPointer } from "./report.js";
import type { ReportEntry } from "./report.js";
import type { CompleteProfileDocument } from "./envelope.js";

export const lintStages = ["import", "pre-normalize", "post-normalize", "post-layout", "release"] as const;
type Severity = "off" | "info" | "warn" | "error";
export interface Setting { readonly rule: string; readonly severity: string | number; readonly classification?: string; readonly options?: Readonly<Record<string, unknown>> }
interface Rule { readonly id: string; readonly phase: string; readonly [key: string]: unknown }
export interface CompiledLintOptions { readonly mechanismVersion: "1"; readonly profileDigest: string; readonly phase: string; readonly readinessPolicy: string; readonly compiledRules: readonly Rule[]; readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[]; readonly severityPolicyDigest: string }
/** Snapshot of containment coordinates, including nodes without IDs. */
export interface LintSourceIndex { readonly ids: Readonly<Record<string, string>>; readonly pointers: ReadonlySet<string> }
export function severity(value: unknown): { readonly effectiveSeverity: Severity; readonly transportSeverity: Severity; readonly evaluated: boolean } {
  const effective = typeof value === "number" ? ["off", "warn", "error", "info"][value] : value;
  choice(effective, ["off", "warn", "error", "info"]); const effectiveSeverity = effective as Severity;
  return { effectiveSeverity, transportSeverity: effective === "info" ? "warn" : effectiveSeverity, evaluated: effective !== "off" };
}
interface Config { readonly extends?: readonly string[]; readonly rules?: Readonly<Record<string, Setting>> }
/** Caller supplies a pinned resolver and an exact allowlist. No module loading. */
export function flattenLintConfigs(names: readonly string[], resolver: (name: string) => Config | undefined, allowlist: readonly string[], local: Readonly<Record<string, Setting>> = {}): Record<string, Setting> {
  const active = new Set<string>(), rules: Record<string, Setting> = Object.create(null) as Record<string, Setting>;
  function visit(name: string): void {
    if (!allowlist.includes(name) || !(name === "bpmnlint:recommended" || /^plugin:[A-Za-z_][A-Za-z0-9_.-]*\/[A-Za-z_][A-Za-z0-9_.-]*$/.test(name))) failContract("lint-config-unknown");
    if (active.has(name)) failContract("lint-config-cycle"); active.add(name);
    const config = resolveLint("config", name, resolver); for (const parent of config.extends ?? []) visit(parent);
    for (const [key, setting] of Object.entries(config.rules ?? {})) rules[key] = cloneJson(setting);
    active.delete(name);
  }
  names.forEach(visit); for (const [key, setting] of Object.entries(local)) rules[key] = { ...cloneJson(setting), options: {} }; return rules;
}
export function resolveLint<T>(kind: "rule" | "config", name: string, resolver: (name: string) => T | undefined): T {
  let value: T | undefined;
  try { value = resolver(name); }
  catch (error) {
    // Only the resolver's specified lookup failures mean unknown. Internal
    // exceptions are evaluator errors, never silently treated as absent rules.
    const code = (error as { code?: unknown })?.code;
    if (code !== "MODULE_NOT_FOUND" && code !== "CONFIG_NOT_FOUND") failContract("lint-rule-error");
    return failContract(kind === "rule" ? "lint-rule-unknown" : "lint-config-unknown");
  }
  if (value === undefined) failContract(kind === "rule" ? "lint-rule-unknown" : "lint-config-unknown"); return value!;
}
/** Data transform only; literal upstream execution and factory instances are lot 1. */
export function compileLintPolicy(profile: CompleteProfileDocument, selector: { readonly phase: string; readonly readinessPolicy: string }, inherited: Readonly<Record<string, Setting>> = {}, requiredStandardRules: readonly string[] = [], bindings: CompiledLintOptions["bindings"] = []): {
  readonly settings: readonly Setting[]; readonly standard: Readonly<Record<string, readonly [Severity, Readonly<Record<string, unknown>>]>>;
  readonly compiledOptions: CompiledLintOptions; readonly transport: readonly ["error", CompiledLintOptions]; readonly subruleSeverity: Severity;
} {
  choice(selector.phase, lintStages); choice(selector.readinessPolicy, ["draft", "accept"]);
  const tables = profile.validation as readonly { id: string; policy: string; settings: readonly Setting[] }[];
  const matching = tables.filter(t => t.id === selector.phase && t.policy === selector.readinessPolicy);
  if (matching.length !== 1) failContract("lint-config-incomplete");
  const table = matching[0]; if (!table) failContract("lint-config-incomplete");
  const rules = profile.rules as readonly Rule[], settingsByName = new Map(Object.entries(inherited).map(([name, s]) => [name, cloneJson(s)]));
  const localNames = new Set<string>();
  for (const setting of table!.settings) {
    record(setting, ["rule", "severity", "classification"], [], "lint-config-incomplete");
    if (localNames.has(setting.rule)) failContract("lint-config-incomplete"); localNames.add(setting.rule);
    severity(setting.severity);
    if (setting.rule.startsWith("profile:") && !rules.some(r => `profile:${r.id}` === setting.rule && r.phase === selector.phase)) failContract("lint-config-incomplete");
    settingsByName.set(setting.rule, cloneJson(setting));
  }
  for (const [name, setting] of settingsByName) {
    if (setting.rule !== name) failContract("lint-config-incomplete");
    severity(setting.severity);
    if (name.startsWith("profile:") && !rules.some(r => `profile:${r.id}` === name && r.phase === selector.phase)) failContract("lint-config-incomplete");
  }
  if (requiredStandardRules.some(name => !settingsByName.has(name))) failContract("lint-config-incomplete");
  const selected = rules.filter(r => r.phase === selector.phase).filter(r => {
    const setting = settingsByName.get(`profile:${r.id}`); if (!setting) failContract("lint-config-incomplete"); return severity(setting!.severity).evaluated;
  });
  const settings = [...settingsByName.values()].sort((a, b) => compareText(a.rule, b.rule));
  const standard: Record<string, readonly [Severity, Readonly<Record<string, unknown>>]> = Object.create(null) as Record<string, readonly [Severity, Readonly<Record<string, unknown>>]>;
  for (const setting of settings) if (!setting.rule.startsWith("profile:")) standard[setting.rule] = [severity(setting.severity).transportSeverity, localNames.has(setting.rule) ? {} : setting.options ?? {}];
  const compiledOptions: CompiledLintOptions = { mechanismVersion: "1", profileDigest: canonicalDigest(profile), phase: selector.phase, readinessPolicy: selector.readinessPolicy,
    compiledRules: cloneJson(selected), bindings: cloneJson(bindings), severityPolicyDigest: canonicalDigest({ phase: selector.phase, readinessPolicy: selector.readinessPolicy, settings }) };
  validateCompiledOptions(compiledOptions, compiledOptions);
  return cloneJson({ settings, standard, compiledOptions, transport: ["error", compiledOptions] as const, subruleSeverity: selected.length ? severity(settingsByName.get(`profile:${selected[0]!.id}`)!.severity).effectiveSeverity : "off" });
}
export function validateCompiledOptions(value: unknown, selected: CompiledLintOptions): CompiledLintOptions {
  const r = record(value, ["mechanismVersion", "profileDigest", "phase", "readinessPolicy", "compiledRules", "bindings", "severityPolicyDigest"]);
  choice(r.mechanismVersion, ["1"]); digest(r.profileDigest); digest(r.severityPolicyDigest); choice(r.phase, lintStages); choice(r.readinessPolicy, ["draft", "accept"]); array(r.bindings); validateBindingKeys(r.bindings as CompiledLintOptions["bindings"]); array(r.compiledRules);
  if (!equal(value, selected)) failContract("lint-rule-error");
  const ids = new Set<string>();
  for (const rule of r.compiledRules as readonly Rule[]) {
    record(rule, ["id", "phase", "select", "assert", "code", "message", "classification"], ["repairRecipe", "bindings"], "lint-rule-error");
    for (const key of ["id", "code", "message"] as const) text(rule[key]);
    if (rule.phase !== r.phase || ids.has(rule.id)) failContract("lint-rule-error");
    ids.add(rule.id);
  }
  return cloneJson(value) as CompiledLintOptions;
}
export function lintSummary(entries: readonly Pick<ReportEntry, "severity" | "disposition">[]): { readonly ok: boolean; readonly counts: { info: number; warn: number; error: number } } {
  const counts = { info: 0, warn: 0, error: 0 }; for (const e of entries) { choice(e.severity, ["info", "warn", "error"]); if (!["corrected", "dropped", "mapped"].includes(e.disposition)) counts[e.severity]++; } return { ok: counts.error === 0, counts };
}
export function standardFinding(finding: { readonly id?: string; readonly path?: unknown }, policy: { readonly rule: string; readonly severity: unknown; readonly classification: ReportEntry["classification"] }, index: Readonly<Record<string, string>>, stage: ReportEntry["stage"]): ReportEntry {
  const s = severity(policy.severity); if (!s.evaluated) failContract("lint-rule-error");
  return entry({ stage, ruleId: policy.rule, code: `bpmnlint/${policy.rule}`, messageKey: `bpmnlint.${policy.rule}`, severity: s.effectiveSeverity as ReportEntry["severity"], classification: policy.classification, source: sourceCoordinate(index, finding) });
}
export function profileFinding(finding: Record<string, unknown>, rule: { readonly id: string; readonly code: string; readonly message: string }, policy: { readonly severity: unknown; readonly classification: ReportEntry["classification"] }, index: LintSourceIndex, stage: ReportEntry["stage"]): ReportEntry {
  if (finding.profileRuleId !== rule.id || finding.code !== rule.code || finding.messageKey !== rule.message || typeof finding.sourcePointer !== "string" || !validPointer(finding.sourcePointer)) failContract("lint-rule-error");
  const id = typeof finding.id === "string" ? finding.id : null;
  const pointer = finding.sourcePointer as string;
  if (!index.pointers.has(pointer) || finding.id !== undefined && (typeof finding.id !== "string" || !finding.id.length) ||
    id !== null && (!Object.hasOwn(index.ids, id) || !(pointer === index.ids[id] || pointer.startsWith(`${index.ids[id]}/`)))) failContract("lint-rule-error");
  const s = severity(policy.severity); if (!s.evaluated) failContract("lint-rule-error");
  return entry({ stage, ruleId: rule.id, code: rule.code, messageKey: rule.message, severity: s.effectiveSeverity as ReportEntry["severity"], classification: policy.classification,
    source: { domain: "tree", pointer: finding.sourcePointer as string, targetId: id, provenance: "exact" } });
}
export function lintOperationStages(operation: string): readonly string[] {
  if (operation === "prepareExport") return ["complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release"];
  if ((lintStages as readonly string[]).includes(operation)) return [operation];
  if (operation === "draft") return ["complete", "pre-normalize", "normalize", "post-normalize"];
  if (operation === "accept") return ["complete", "pre-normalize", "normalize", "post-normalize", "release"];
  return failContract("lint-config-incomplete");
}
export const lintBarrier = (entries: readonly Pick<ReportEntry, "severity" | "disposition">[]): boolean => lintSummary(entries).ok;
