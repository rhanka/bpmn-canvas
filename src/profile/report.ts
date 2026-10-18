import { canonicalize } from "./canonical.js";
import { cloneJson, failContract, pointerKey } from "./native-contracts.js";
import { array, choice, compareText, digest, record, text, validateIdentity } from "./boundary.js";
import type { ProfileIdentity } from "./envelope.js";

export const resultOperations = ["complete", "normalize", "validate", "resolveTheme", "mapExport", "serializePrepared", "prepareExport", "getDefinitions", "getSnapshot", "setDefinitions", "applyCommands", "activateBusinessProfile", "setTheme", "restoreSnapshot", "undo", "redo", "exportPrepared"] as const;
export const reportStages = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"] as const;
export const lossClasses = ["semantic-type", "relation-kind", "navigation", "appearance", "layout", "metadata", "unsupported-feature", "provenance-unavailable"] as const;
export const capabilities = ["engine-byte-compatible", "structural", "unsupported"] as const;
export type Capability = typeof capabilities[number];
export interface Coordinate { readonly domain: "tree" | "profile" | "artifact" | "none"; readonly pointer: string | null; readonly targetId: string | null; readonly provenance: "exact" | "unavailable" | "generated" }
export interface ReportEntry {
  readonly code: string; readonly severity: "info" | "warn" | "error";
  readonly classification: "integrity" | "readiness" | "repairable" | "advisory" | "loss";
  readonly stage: typeof reportStages[number]; readonly ruleId: string; readonly messageKey: string;
  readonly disposition: "observed" | "corrected" | "dropped" | "mapped" | "refused";
  readonly source: Coordinate; readonly result: Coordinate; readonly beforePresent: boolean; readonly before?: unknown;
  readonly afterPresent: boolean; readonly after?: unknown;
  readonly originalType?: string; readonly property?: string; readonly causedBy?: string; readonly pageId?: string;
  readonly occurrenceKey?: string; readonly emittedType?: string; readonly legacyCode?: string; readonly lossClass?: typeof lossClasses[number];
}
export interface IdMapping { readonly sourceId: string; readonly resultId: string; readonly domain: "migration" | "export"; readonly pageId?: string; readonly occurrenceKey?: string }
export interface ReportArtifact { readonly format: string; readonly pageId?: string; readonly capability: Capability; readonly digest?: string; readonly entryIndexes: readonly number[] }
export interface Report {
  readonly reportVersion: "2"; readonly operation: string; readonly sourceIdentity?: ProfileIdentity; readonly targetIdentity?: ProfileIdentity;
  readonly inputRevision?: string; readonly outputRevision?: string; readonly entries: readonly ReportEntry[];
  readonly rawStandardFindings: readonly unknown[]; readonly idMap: readonly IdMapping[]; readonly artifacts: readonly ReportArtifact[];
}
export const unavailable: Coordinate = Object.freeze({ domain: "none", pointer: null, targetId: null, provenance: "unavailable" });
export function validateCoordinate(value: unknown): asserts value is Coordinate {
  const c = record(value, ["domain", "pointer", "targetId", "provenance"]);
  choice(c.domain, ["tree", "profile", "artifact", "none"]); choice(c.provenance, ["exact", "unavailable", "generated"]);
  if (c.pointer !== null) { text(c.pointer, true); if (!validPointer(c.pointer)) failContract(); }
  if (c.targetId !== null) text(c.targetId);
  if (c.provenance === "unavailable" && c.pointer !== null || c.provenance !== "unavailable" && c.pointer === null) failContract();
  if (c.domain === "none" && (c.pointer !== null || c.targetId !== null || c.provenance !== "unavailable")) failContract();
}
export const validPointer = (s: string): boolean => (s === "" || s.startsWith("/")) && !/~(?![01])/.test(s);
export function validateEntry(value: unknown): ReportEntry {
  canonicalize(value);
  const e = record(value, ["code", "severity", "classification", "stage", "ruleId", "messageKey", "disposition", "source", "result", "beforePresent", "afterPresent"],
    ["originalType", "property", "before", "after", "causedBy", "pageId", "occurrenceKey", "emittedType", "legacyCode", "lossClass"]);
  for (const key of ["code", "ruleId", "messageKey", "originalType", "property", "causedBy", "pageId", "occurrenceKey", "emittedType", "legacyCode"]) if (Object.hasOwn(e, key)) text(e[key]);
  choice(e.stage, reportStages); choice(e.severity, ["info", "warn", "error"]);
  choice(e.classification, ["integrity", "readiness", "repairable", "advisory", "loss"]);
  choice(e.disposition, ["observed", "corrected", "dropped", "mapped", "refused"]);
  validateCoordinate(e.source); validateCoordinate(e.result);
  for (const key of ["before", "after"]) if (typeof e[`${key}Present`] !== "boolean" || e[`${key}Present`] !== Object.hasOwn(e, key)) failContract();
  if (e.classification === "loss") choice(e.lossClass, lossClasses); else if (Object.hasOwn(e, "lossClass")) failContract();
  return cloneJson(value) as ReportEntry;
}
export function entry(extra: Partial<ReportEntry> = {}): ReportEntry {
  return validateEntry({ code: "diagnostic", severity: "info", classification: "advisory", stage: "load", ruleId: "adapter", messageKey: "diagnostic", disposition: "observed", source: unavailable, result: unavailable, beforePresent: false, afterPresent: false, ...extra });
}
// The default fields are generic diagnostic data. Callers normally supply their
// stable code/rule/message; no coordinates are inferred from message text.
function component(a: unknown, b: unknown): number {
  a = a ?? undefined; b = b ?? undefined;
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return compareText(String(a), String(b));
}
export function compareEntries(a: ReportEntry, b: ReportEntry): number {
  const stage = reportStages.indexOf(a.stage) - reportStages.indexOf(b.stage); if (stage) return stage;
  const left = [a.ruleId, a.source.domain, a.source.pointer, a.source.targetId, a.code, a.pageId, a.occurrenceKey,
    a.beforePresent ? canonicalize(a.before) : undefined, a.afterPresent ? canonicalize(a.after) : undefined];
  const right = [b.ruleId, b.source.domain, b.source.pointer, b.source.targetId, b.code, b.pageId, b.occurrenceKey,
    b.beforePresent ? canonicalize(b.before) : undefined, b.afterPresent ? canonicalize(b.after) : undefined];
  for (let i = 0; i < left.length; i++) { const n = component(left[i], right[i]); if (n) return n; } return 0;
}
export function sortIdMap(input: readonly IdMapping[]): IdMapping[] {
  for (const item of input) {
    const m = record(item, ["sourceId", "resultId", "domain"], ["pageId", "occurrenceKey"]);
    choice(m.domain, ["migration", "export"]); for (const k of ["sourceId", "resultId", "pageId", "occurrenceKey"]) if (Object.hasOwn(m, k)) text(m[k]);
  }
  return [...cloneJson(input)].sort((a, b) => {
    for (const key of ["domain", "pageId", "occurrenceKey", "sourceId", "resultId"] as const) { const n = component(a[key], b[key]); if (n) return n; } return 0;
  });
}
export function validateReport(value: unknown): Report {
  canonicalize(value);
  const r = record(value, ["reportVersion", "operation", "entries", "rawStandardFindings", "idMap", "artifacts"], ["sourceIdentity", "targetIdentity", "inputRevision", "outputRevision"]);
  choice(r.reportVersion, ["2"]); text(r.operation);
  for (const k of ["sourceIdentity", "targetIdentity"]) if (Object.hasOwn(r, k)) validateIdentity(r[k]);
  for (const k of ["inputRevision", "outputRevision"]) if (Object.hasOwn(r, k)) digest(r[k]);
  array(r.entries); array(r.rawStandardFindings); array(r.idMap); array(r.artifacts);
  const entries = r.entries.map(validateEntry), unique = new Set<string>();
  entries.forEach((e, i) => { const s = canonicalize(e); if (unique.has(s) || i > 0 && compareEntries(entries[i - 1]!, e) > 0) failContract(); unique.add(s); });
  if (canonicalize(sortIdMap(r.idMap as IdMapping[])) !== canonicalize(r.idMap)) failContract();
  const reachable = new Set<number>();
  for (const item of r.artifacts) {
    const a = record(item, ["format", "capability", "entryIndexes"], ["pageId", "digest"]);
    text(a.format); choice(a.capability, capabilities); if (Object.hasOwn(a, "pageId")) text(a.pageId);
    if (Object.hasOwn(a, "digest")) { digest(a.digest); if (a.capability === "unsupported") failContract(); }
    array(a.entryIndexes); const seen = new Set<number>(); let previous = -1;
    for (const n of a.entryIndexes) { if (!Number.isSafeInteger(n) || (n as number) < 0 || (n as number) >= entries.length || seen.has(n as number) || (n as number) <= previous) failContract(); previous = n as number; seen.add(n as number); reachable.add(n as number); }
  }
  entries.forEach((e, i) => { if (e.classification === "loss" && !reachable.has(i)) failContract(); });
  return cloneJson(value) as Report;
}
export function buildReport(operation: string, options: Partial<Omit<Report, "reportVersion" | "operation">> = {}, limits = { maxEntries: 100_000 }): Report {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 0 || (options.entries?.length ?? 0) > limits.maxEntries) failContract("resource-limit");
  const source = (options.entries ?? []).map(validateEntry), seen = new Set<string>();
  const entries = [...source].sort(compareEntries).filter(e => { const s = canonicalize(e); if (seen.has(s)) return false; seen.add(s); return true; });
  const position = new Map(entries.map((e, i) => [canonicalize(e), i]));
  const artifacts = (options.artifacts ?? []).map(a => ({ ...a, entryIndexes: [...new Set(a.entryIndexes.map(n => {
    if (!Number.isSafeInteger(n) || n < 0 || n >= source.length) failContract(); return position.get(canonicalize(source[n]))!;
  }))].sort((a, b) => a - b) }));
  return validateReport({ reportVersion: "2", operation, ...options, entries, rawStandardFindings: options.rawStandardFindings ?? [], idMap: sortIdMap(options.idMap ?? []), artifacts });
}
export const serializeReport = (r: Report): Uint8Array => new TextEncoder().encode(canonicalize(validateReport(r)));
export function sourceCoordinate(index: Readonly<Record<string, string>>, finding: { readonly id?: string; readonly path?: unknown }, relativePointer?: string): Coordinate {
  const id = finding.id ?? null, base = id !== null && Object.hasOwn(index, id) ? index[id] : undefined;
  let pointer: string | null = null;
  if (base !== undefined && validPointer(base)) {
    const path = finding.path;
    if (relativePointer !== undefined) { if (validPointer(relativePointer)) pointer = base + relativePointer; }
    else if (path === undefined) pointer = base;
    else if (typeof path === "string" && path.length > 0) pointer = `${base}/${pointerKey(path)}`;
    else if (Array.isArray(path) && path.every(p => typeof p === "string" || Number.isSafeInteger(p) && p >= 0)) pointer = base + path.map(p => `/${pointerKey(String(p))}`).join("");
  }
  return { domain: "tree", pointer, targetId: id, provenance: pointer === null ? "unavailable" : "exact" };
}
export function lossEntry(lossClass: string, context: Partial<ReportEntry>): ReportEntry {
  choice(lossClass, lossClasses);
  return entry({ ...context, stage: "export", classification: "loss", severity: "warn", disposition: "mapped", code: `export-loss/${lossClass}`, messageKey: `export.loss.${lossClass}`, lossClass: lossClass as typeof lossClasses[number] });
}
export function legacyEntries(error: { readonly code: string; readonly ids?: readonly string[] }, options: { readonly lossManifest?: Readonly<Record<string, string>>; readonly sourceIndex?: Readonly<Record<string, string>>; readonly ruleId?: string } = {}): ReportEntry[] {
  const mappings: Record<string, string> = { "unknown-format": "export-format-unsupported", "unsupported-format": "export-format-unsupported", "invalid-reference": "reference-dangling", "missing-endpoint": "reference-dangling", "duplicate-id": "id-collision" };
  const declared = options.lossManifest && Object.hasOwn(options.lossManifest, error.code) ? options.lossManifest[error.code] : undefined;
  return (error.ids?.length ? [...error.ids] : [undefined]).map(id => {
    const context: Partial<ReportEntry> = { stage: "export", ruleId: options.ruleId ?? "adapter", legacyCode: error.code,
      ...(id !== undefined ? { source: sourceCoordinate(options.sourceIndex ?? {}, { id, path: [] }) } : {}) };
    if (declared) return lossEntry(declared, context);
    const code = Object.hasOwn(mappings, error.code) ? mappings[error.code]! : "legacy-unmapped";
    return entry({ ...context, code, messageKey: code === "export-format-unsupported" ? "export.format-unsupported" : code === "legacy-unmapped" ? "legacy.unmapped" : code, severity: "error", classification: "integrity", disposition: "refused" });
  });
}
export function worstCapability(values: readonly string[]): Capability {
  let worst = 0; for (const v of values) { choice(v, capabilities); worst = Math.max(worst, capabilities.indexOf(v as Capability)); } return capabilities[worst]!;
}
export function artifactCapability(values: readonly { readonly necessary: boolean; readonly capability: Capability }[]): Capability {
  if (values.some(v => v.necessary && v.capability === "unsupported")) failContract(); return worstCapability(values.map(v => v.capability));
}
