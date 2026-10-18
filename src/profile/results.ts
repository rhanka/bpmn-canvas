import { canonicalize, ProfileContractError } from "./canonical.js";
import { cloneJson, failContract, validateBindingKeys } from "./native-contracts.js";
import { array, choice, compareText, digest, equal, noNull, record, text, validateIdentity } from "./boundary.js";
import type { DocumentEnvelope, ProfileIdentity } from "./envelope.js";
import { normalizeDiStyles, normalizeOverrides, validateLayout, validateRenderDataShape, validateRenderBinding, viewRevision } from "./presentation-contracts.js";
import type { RenderBinding, RenderData, Snapshot } from "./presentation-contracts.js";
import { buildReport, capabilities, sortIdMap, validateEntry, validateReport, resultOperations } from "./report.js";
import type { Capability, IdMapping, Report, ReportEntry } from "./report.js";

export type PureResult<T> = { readonly status: "ok"; readonly payload: T; readonly diagnostics: readonly ReportEntry[] } |
  { readonly status: "refused"; readonly code: string; readonly diagnostics: readonly ReportEntry[] };
export type Result<T> = { readonly status: "ok"; readonly operation: string; readonly profileIdentity: ProfileIdentity; readonly baseRevision: string; readonly revision: string; readonly report: Report; readonly payload: T } |
  { readonly status: "refused"; readonly operation: string; readonly profileIdentity?: ProfileIdentity; readonly baseRevision?: string; readonly code: string; readonly diagnostics: readonly ReportEntry[]; readonly report: Report };
export interface PreparedArtifact { readonly format: string; readonly profileIdentity: ProfileIdentity; readonly semanticRevision: string; readonly viewRevision: string;
  readonly ir: unknown; readonly renderBinding: RenderBinding; readonly report: Report; readonly capability: Capability; readonly idMap: readonly IdMapping[] }
export interface SerializedArtifact { readonly format: string; readonly bytes: Uint8Array; readonly digest: string; readonly idMap: readonly IdMapping[]; readonly capability: Capability }
type Committed = { readonly envelope: DocumentEnvelope; readonly semanticRevision: string; readonly viewRevision: string };
export interface ProfileBoundary {
  getDefinitions(): Result<DocumentEnvelope>; getSnapshot(): Result<Snapshot>;
  setDefinitions(envelope: DocumentEnvelope, options: { readonly expectedRevision?: string; readonly expectedViewRevision?: string; readonly signal?: AbortSignal; readonly mode: "draft" | "accept" }): Promise<Result<Committed>>;
  applyCommands(request: { readonly baseRevision: string; readonly expectedViewRevision: string; readonly commands: readonly unknown[]; readonly transactionId: string; readonly signal?: AbortSignal }): Promise<Result<Committed & { readonly transactionId: string; readonly changed: boolean }>>;
  activateBusinessProfile(compiled: unknown, explicitMigrationPlan?: unknown): Promise<Result<Committed & { readonly historyEpoch: string }>>;
  setTheme(themeId: string, overrides?: unknown): Promise<Result<{ readonly viewRevision: string }>>;
  restoreSnapshot(snapshot: Snapshot, options: { readonly expectedRevision?: string; readonly signal?: AbortSignal }): Promise<Result<Committed & { readonly historyEpoch: string }>>;
  undo(options: { readonly expectedRevision: string; readonly expectedViewRevision: string }): Promise<Result<Snapshot>>; redo(options: { readonly expectedRevision: string; readonly expectedViewRevision: string }): Promise<Result<Snapshot>>;
  onChange(callback: (event: unknown) => void): PureResult<{ readonly subscriptionId: string }>;
  unsubscribe(subscriptionId: string): PureResult<{ readonly unsubscribed: true }>;
  dispose(): Promise<PureResult<{ readonly disposed: true }>>;
  prepareExport(compiled: unknown, envelope: DocumentEnvelope, options: { readonly format: string; readonly themeId: string; readonly overrides: unknown; readonly diStyles: unknown; readonly signal?: AbortSignal }): Promise<Result<PreparedArtifact>>;
  exportPrepared(prepared: PreparedArtifact): Promise<Result<SerializedArtifact>>;
}
export const methodDelivery = Object.freeze({ getDefinitions: "synchronous", getSnapshot: "synchronous", onChange: "synchronous", unsubscribe: "synchronous",
  setDefinitions: "queued", applyCommands: "queued", activateBusinessProfile: "queued", setTheme: "queued", restoreSnapshot: "queued", undo: "queued", redo: "queued", dispose: "queued", prepareExport: "queued", exportPrepared: "queued" });

/** Shape only. Storage, descriptors and revision hashes must be admitted before
 * constructing a committed Result; restore/render do their async integrity checks. */
export function validateEnvelopeShape(value: unknown): DocumentEnvelope {
  canonicalize(value); noNull(value); const e = record(value, ["documentVersion", "profileIdentity", "tree", "bindings", "semanticRevision"]);
  choice(e.documentVersion, ["1"]); validateIdentity(e.profileIdentity); digest(e.semanticRevision); array(e.bindings); validateBindingKeys(e.bindings as DocumentEnvelope["bindings"]);
  if (!e.tree || typeof e.tree !== "object" || Array.isArray(e.tree)) failContract(); return cloneJson(value) as DocumentEnvelope;
}
function snapshotShape(value: unknown): Snapshot {
  noNull(value); const s = record(value, ["snapshotVersion", "envelope", "presentation", "viewRevision"]); choice(s.snapshotVersion, ["1"]); validateEnvelopeShape(s.envelope); digest(s.viewRevision);
  const p = record(s.presentation, ["layout", "themeId", "overrides", "diStyles", "importedDi", "selection", "activePageId"]); const layout = validateLayout(p.layout); text(p.themeId); text(p.activePageId, true);
  if (!equal(normalizeOverrides(p.overrides, (s.envelope as DocumentEnvelope).tree, layout.geometry), p.overrides) ||
      !equal(normalizeDiStyles(p.diStyles, layout.geometry), p.diStyles)) failContract();
  const a = record(p.importedDi, ["descriptorDigest", "diagrams", "sha256"]); digest(a.descriptorDigest); digest(a.sha256); array(a.diagrams); array(p.selection);
  const selected = new Set<string>();
  for (const item of p.selection) { const pair = record(item, ["pageId", "occurrenceKey"]); text(pair.pageId); text(pair.occurrenceKey); const key = canonicalize(pair);
    if (selected.has(key) || !layout.geometry.some(g => g.pageId === pair.pageId && g.occurrenceKey === pair.occurrenceKey)) failContract(); selected.add(key); }
  if (layout.pages.length ? !layout.pages.some(page => page.pageId === p.activePageId) : p.activePageId !== "" || p.selection.length !== 0) failContract();
  return cloneJson(value) as Snapshot;
}
/** Synchronous Result validation checks shape only. Queued preparation and byte
 * admission must use validatePreparedArtifact before exposing a success. */
function preparedArtifactShape(value: unknown): PreparedArtifact {
  canonicalize(value); const p = record(value, ["format", "profileIdentity", "semanticRevision", "viewRevision", "ir", "renderBinding", "report", "capability", "idMap"]);
  text(p.format); validateIdentity(p.profileIdentity); digest(p.semanticRevision); digest(p.viewRevision); const b = validateRenderBinding(p.renderBinding); validateReport(p.report); choice(p.capability, capabilities); array(p.idMap);
  if (!equal(sortIdMap(p.idMap as IdMapping[]), p.idMap) || b.profileDigest !== (p.profileIdentity as ProfileIdentity).sha256 || b.semanticRevision !== p.semanticRevision) failContract();
  return cloneJson(value) as PreparedArtifact;
}
/** Recompute the view revision from the immutable render binding before byte admission. */
export async function validatePreparedArtifact(value: unknown): Promise<PreparedArtifact> {
  const prepared = preparedArtifactShape(value);
  if (await viewRevision(prepared.renderBinding) !== prepared.viewRevision) failContract("render-stale");
  return prepared;
}
function validatePlacements(value: unknown): void {
  array(value);
  const tuples: string[][] = [];
  for (const item of value) {
    const p = record(item, ["elementId", "ownerProcessId", "regionKey", "relatedAssociationIds"], ["anchorAssociationId"]);
    for (const key of ["elementId", "ownerProcessId", "regionKey", "anchorAssociationId"]) if (Object.hasOwn(p, key)) text(p[key]);
    array(p.relatedAssociationIds); let previous: string | undefined;
    for (const id of p.relatedAssociationIds) { text(id); if (previous !== undefined && compareText(previous, id) >= 0) failContract(); previous = id; }
    tuples.push([p.ownerProcessId as string, p.regionKey as string, p.elementId as string, p.anchorAssociationId as string ?? "", ...p.relatedAssociationIds as string[]]);
  }
  for (let i = 1; i < tuples.length; i++) {
    const a = tuples[i - 1]!, b = tuples[i]!;
    let order = 0;
    for (let j = 0; j < Math.min(a.length, b.length); j++) { order = compareText(a[j]!, b[j]!); if (order) break; }
    if ((order || a.length - b.length) > 0) failContract();
  }
}
function diagnostics(value: unknown): void { array(value); value.forEach(validateEntry); }
export function validatePureResult<T = unknown>(value: unknown, operation?: string): PureResult<T> {
  canonicalize(value); const status = (value as { status?: unknown })?.status;
  const r = record(value, status === "ok" ? ["status", "payload", "diagnostics"] : ["status", "code", "diagnostics"]); choice(status, ["ok", "refused"]); diagnostics(r.diagnostics);
  if (status === "refused") text(r.code);
  else if (operation === "dispose" || operation === "unsubscribe") { const key = operation === "dispose" ? "disposed" : "unsubscribed"; const p = record(r.payload, [key]); choice(p[key], [true]); }
  return cloneJson(value) as PureResult<T>;
}
const operations = resultOperations;
const readonlyOperations = ["getDefinitions", "getSnapshot", "validate", "resolveTheme", "mapExport", "serializePrepared", "exportPrepared", "setTheme"];
export function validateResult<T = unknown>(value: unknown): Result<T> {
  const status = (value as { status?: unknown })?.status;
  const r = record(value, status === "ok" ? ["status", "operation", "profileIdentity", "baseRevision", "revision", "report", "payload"] : ["status", "operation", "code", "diagnostics", "report"], status === "ok" ? [] : ["profileIdentity", "baseRevision"]);
  choice(status, ["ok", "refused"]); choice(r.operation, operations); const operation = r.operation as string;
  const report = validateReport(r.report); if (report.operation !== operation) failContract();
  if (Object.hasOwn(r, "profileIdentity")) validateIdentity(r.profileIdentity); if (Object.hasOwn(r, "baseRevision")) digest(r.baseRevision);
  if (report.sourceIdentity !== undefined && r.profileIdentity !== undefined && !equal(report.sourceIdentity, r.profileIdentity) || report.inputRevision !== undefined && r.baseRevision !== undefined && report.inputRevision !== r.baseRevision) failContract();
  if (status === "refused") { text(r.code); diagnostics(r.diagnostics); return cloneJson(value) as Result<T>; }
  digest(r.revision); if (readonlyOperations.includes(operation) && r.baseRevision !== r.revision) failContract();
  if (report.outputRevision !== undefined && report.outputRevision !== r.revision || report.inputRevision !== undefined && report.inputRevision !== r.baseRevision) failContract();
  const p = r.payload;
  if (["getDefinitions", "complete"].includes(operation)) validateEnvelopeShape(p);
  else if (["getSnapshot", "undo", "redo"].includes(operation)) snapshotShape(p);
  else if (["prepareExport", "mapExport"].includes(operation)) preparedArtifactShape(p);
  else if (["setDefinitions", "applyCommands", "activateBusinessProfile", "restoreSnapshot"].includes(operation)) {
    const keys = ["envelope", "semanticRevision", "viewRevision", ...(operation === "applyCommands" ? ["transactionId", "changed"] : ["activateBusinessProfile", "restoreSnapshot"].includes(operation) ? ["historyEpoch"] : [])];
    const payload = record(p, keys); const envelope = validateEnvelopeShape(payload.envelope); digest(payload.semanticRevision); digest(payload.viewRevision);
    if (payload.semanticRevision !== envelope.semanticRevision || payload.semanticRevision !== r.revision || !equal(envelope.profileIdentity, r.profileIdentity)) failContract();
    if (operation === "applyCommands") { text(payload.transactionId); choice(payload.changed, [true, false]); } if (Object.hasOwn(payload, "historyEpoch")) text(payload.historyEpoch);
  } else if (operation === "setTheme") { const payload = record(p, ["viewRevision"]); digest(payload.viewRevision); }
  else if (operation === "normalize") { const payload = record(p, ["envelope", "placements", "report"]); validateEnvelopeShape(payload.envelope); validatePlacements(payload.placements); validateReport(payload.report); }
  else if (operation === "validate") validateReport(p);
  else if (operation === "resolveTheme") validateRenderDataShape(p);
  else if (["serializePrepared", "exportPrepared"].includes(operation)) {
    const payload = record(p, ["format", "bytes", "digest", "idMap", "capability"]); text(payload.format); digest(payload.digest); array(payload.idMap); if (!equal(sortIdMap(payload.idMap as IdMapping[]), payload.idMap)) failContract(); choice(payload.capability, ["engine-byte-compatible", "structural"]);
    if (!(payload.bytes instanceof Uint8Array)) failContract();
    // Binary bytes have their specified in-process type, never JSON-number arrays.
    canonicalize({ ...r, payload: { ...payload, bytes: null } }); return { ...cloneJson({ ...r, payload: { ...payload, bytes: null } }), payload: { ...cloneJson({ ...payload, bytes: null }), bytes: new Uint8Array(payload.bytes as Uint8Array) } } as Result<T>;
  }
  const envelope = ["getDefinitions", "complete"].includes(operation) ? p as DocumentEnvelope : ["getSnapshot", "undo", "redo"].includes(operation) ? (p as Snapshot).envelope : operation === "normalize" ? (p as { envelope: DocumentEnvelope }).envelope : undefined;
  if (envelope && (envelope.semanticRevision !== r.revision || !equal(envelope.profileIdentity, r.profileIdentity))) failContract();
  if (["prepareExport", "mapExport"].includes(operation)) {
    const prepared = p as PreparedArtifact;
    if (prepared.semanticRevision !== r.revision || !equal(prepared.profileIdentity, r.profileIdentity)) failContract();
  }
  if (operation === "resolveTheme") {
    const render = p as RenderData;
    if (render.binding.semanticRevision !== r.revision || render.binding.profileDigest !== (r.profileIdentity as ProfileIdentity).sha256) failContract();
  }
  canonicalize(value); return cloneJson(value) as Result<T>;
}
export function documentRead(operation: "getDefinitions", snapshot?: Snapshot): Result<DocumentEnvelope>;
export function documentRead(operation: "getSnapshot", snapshot?: Snapshot): Result<Snapshot>;
export function documentRead(operation: "getDefinitions" | "getSnapshot", snapshot?: Snapshot): Result<DocumentEnvelope | Snapshot> {
  if (!snapshot) return { status: "refused", operation, code: "document-not-loaded", diagnostics: [], report: buildReport(operation) };
  const { profileIdentity, semanticRevision: revision } = snapshot.envelope;
  return validateResult({ status: "ok", operation, profileIdentity, baseRevision: revision, revision,
    report: buildReport(operation, { sourceIdentity: profileIdentity, targetIdentity: profileIdentity, inputRevision: revision, outputRevision: revision }), payload: operation === "getDefinitions" ? snapshot.envelope : snapshot });
}
/** Scheduling/error seam only, not a canvas transaction implementation. The
 * stage and commit adapter must own isolation, serialization and rollback. */
export async function queueBoundary<T>(context: { readonly operation: string; readonly snapshot?: Snapshot; readonly cancelled?: boolean; readonly disposed?: boolean; readonly rollback: () => void | Promise<void> }, stage: () => T | Promise<T>, commit: (staged: T) => Result<T> | Promise<Result<T>>): Promise<Result<T>> {
  const refusal = (code: string): Result<T> => { const e = context.snapshot?.envelope; return { status: "refused", operation: context.operation,
    ...(e ? { profileIdentity: cloneJson(e.profileIdentity), baseRevision: e.semanticRevision } : {}), code, diagnostics: [],
    report: buildReport(context.operation, e ? { sourceIdentity: e.profileIdentity, inputRevision: e.semanticRevision } : {}) }; };
  if (context.disposed) return refusal("canvas-disposed"); if (context.cancelled) return refusal("operation-cancelled");
  let rolledBack = false;
  const rollback = async (): Promise<void> => { if (!rolledBack) { rolledBack = true; await context.rollback(); } };
  try { const staged = await stage();
    if (context.operation === "exportPrepared" || context.operation === "serializePrepared") await validatePreparedArtifact(staged);
    if (context.disposed || context.cancelled) { await rollback(); return refusal(context.disposed ? "canvas-disposed" : "operation-cancelled"); } const result = validateResult<T>(await commit(staged));
    if (result.status === "ok" && ["prepareExport", "mapExport"].includes(context.operation)) await validatePreparedArtifact(result.payload);
    return result; }
  catch (error) {
    try { await rollback(); } catch { return refusal("operation-error"); }
    return refusal(error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error");
  }
}
