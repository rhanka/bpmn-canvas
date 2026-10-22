// Lot-5 authoring kit: case assembly, explicit tree edits, complete Result/1,
// PureResult and Report/2 records, presentation templates and digest
// arithmetic. Expected trees are written as explicit per-case edits; nothing
// here plans or applies a recipe. Template markers are defined by the pinned
// comparator module (comparators/lot5-compare.mjs) and only built here.
import { H, B, stableId, jcs, clone, noNull } from "./lot5-arith.mjs";
import * as P from "./lot5-profile.mjs";
import * as D from "./lot5-documents.mjs";

export { H, B, stableId, jcs, clone, P, D };
export const PID = P.profileIdentity;
export const PROFILE_ARTIFACT = { path: "fixtures/ui-neutral-profile.json", sha256: P.profileFileSha256 };

// ---------------------------------------------------------------- fixture registry
export const fixtures = new Map(); // relative path -> text
export function fixture(path, value, { compact = false } = {}) {
  const text = compact ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
  if (fixtures.has(path) && fixtures.get(path) !== text) throw new Error(`fixture ${path} redefined`);
  fixtures.set(path, text);
  return { path, sha256: B(text) };
}
/** A committed byte sequence registered unchanged (vendored files): text is the exact UTF-8 file content. */
export function rawFixture(path, text) {
  if (fixtures.has(path) && fixtures.get(path) !== text) throw new Error(`fixture ${path} redefined`);
  fixtures.set(path, text);
  return { path, sha256: B(text) };
}

// ---------------------------------------------------------------- tree helpers
export const proc = (t, i = 0) => t.rootElements[i];
export const fe = (t, i = 0) => proc(t, i).flowElements;
export const art = t => proc(t).artifacts;
export const io = t => proc(t).ioSpecification;
const escape = key => key.replace(/~/g, "~0").replace(/\//g, "~1");
export function locate(t, id) {
  let found;
  (function walk(n, pointer) {
    if (found || !n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach((c, i) => walk(c, `${pointer}/${i}`)); return; }
    if (n.id === id && typeof n.$type === "string") { found = { node: n, pointer }; return; }
    for (const [k, v] of Object.entries(n)) if (v && typeof v === "object") walk(v, `${pointer}/${escape(k)}`);
  })(t, "");
  if (!found) throw new Error(`no node ${id}`);
  return found;
}
export const find = (t, id) => locate(t, id).node;
export const pointerOf = (t, id) => locate(t, id).pointer;
export function removeIds(t, ids) {
  const set = new Set(ids);
  (function walk(n) {
    if (Array.isArray(n)) {
      for (let i = n.length - 1; i >= 0; i--) {
        if (n[i] && typeof n[i] === "object" && set.has(n[i].id)) n.splice(i, 1); else walk(n[i]);
      }
      return;
    }
    if (n && typeof n === "object") for (const v of Object.values(n)) walk(v);
  })(t);
  for (const id of ids) {
    let present = true;
    try { locate(t, id); } catch { present = false; }
    if (present) throw new Error(`still present ${id}`);
  }
}
/** Authoring self-check only: every ID-valued reference resolves inside the tree. */
export function assertResolved(t, label) {
  const ids = new Set();
  (function collect(n) { if (Array.isArray(n)) n.forEach(collect); else if (n && typeof n === "object") { if (typeof n.id === "string") ids.add(n.id); Object.values(n).forEach(collect); } })(t);
  const refs = ["sourceRef", "targetRef", "dataStoreRef", "dataObjectRef", "calledElement", "dataInputRefs", "processRef"];
  (function check(n) {
    if (Array.isArray(n)) { n.forEach(check); return; }
    if (!n || typeof n !== "object") return;
    for (const r of refs) if (Object.hasOwn(n, r)) for (const v of [].concat(n[r])) if (!ids.has(v)) throw new Error(`${label}: dangling ${r} ${v}`);
    Object.values(n).forEach(check);
  })(t);
  noNull(t, label);
}
/** Authoring self-check only: the hand-listed unnamed activities match the tree. */
export function assertUnnamed(t, listed, label) {
  const found = [];
  (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") { if (["bpmn:Task", "bpmn:UserTask"].includes(n.$type) && (n.name === undefined || n.name === "")) found.push(n.id); Object.values(n).forEach(walk); } })(t);
  if (jcs([...found].sort()) !== jcs([...listed].sort())) throw new Error(`${label}: unnamed activities ${found} vs listed ${listed}`);
}

// ---------------------------------------------------------------- Report/2 (DESIGN §10.1 L739–L753, harmonization B2, B4, B8, B9, G2)
export const UNAVAILABLE = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
const STAGE_ORDER = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];
const cmp = (a, b) => a === b ? 0 : a === undefined || a === null ? -1 : b === undefined || b === null ? 1 : a < b ? -1 : 1;
/** DESIGN L751 keys, then the G2 tie-breaks (result domain, pointer, targetId; property). */
export function sortEntries(entries) {
  const key = e => [e.ruleId, e.source.domain, e.source.pointer, e.source.targetId, e.code, e.pageId, e.occurrenceKey,
    e.beforePresent ? jcs(e.before) : undefined, e.afterPresent ? jcs(e.after) : undefined, e.result.domain, e.result.pointer, e.result.targetId, e.property];
  return [...entries].sort((a, b) => {
    const s = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage); if (s) return s;
    const x = key(a), y = key(b);
    for (let i = 0; i < x.length; i++) { const c = cmp(x[i], y[i]); if (c) return c; }
    return 0;
  });
}
export const lintEntry = (stage, targetId, pointer, policy = "draft") => ({
  code: P.ruleCode(stage), severity: policy === "draft" ? "warn" : "error", classification: "readiness", stage, ruleId: P.ruleFor(stage),
  messageKey: P.RULE_MESSAGE, disposition: "observed", source: { domain: "tree", pointer, targetId, provenance: "exact" },
  result: clone(UNAVAILABLE), beforePresent: false, afterPresent: false,
});
/** Edit pipeline lint (§6.2 L474: pre-normalize and post-normalize, draft) for hand-listed unnamed activities. */
export const draftLint = (tree, unnamed) => unnamed.flatMap(id => ["pre-normalize", "post-normalize"].map(stage => lintEntry(stage, id, pointerOf(tree, id))));
/** C change entry for a generated default written at an absent location (B8 vocabulary, B9 coordinates). */
export const completeSet = (tree, id, property, after, ruleId) => {
  const pointer = `${pointerOf(tree, id)}/${property}`;
  return { code: "complete/set", severity: "info", classification: "repairable", stage: "complete", ruleId, messageKey: "complete.set", disposition: "corrected",
    source: { domain: "tree", pointer, targetId: id, provenance: "exact" }, result: { domain: "tree", pointer, targetId: id, provenance: "exact" },
    property, beforePresent: false, afterPresent: true, after };
};
/** Report/2 with the B4 header: success carries source/target identity and input/output revisions; a refusal only what it echoes. */
export function reportFor(operation, { entries = [], idMap = [], artifacts = [], input, output, identity = PID, refusal = false } = {}) {
  return {
    reportVersion: "2", operation,
    ...(identity ? { sourceIdentity: clone(identity) } : {}),
    ...(!refusal && identity ? { targetIdentity: clone(identity) } : {}),
    ...(input ? { inputRevision: input } : {}),
    ...(!refusal && output ? { outputRevision: output } : {}),
    entries: sortEntries(entries), rawStandardFindings: [], idMap: clone(idMap), artifacts: clone(artifacts),
  };
}

// ---------------------------------------------------------------- Result/1 and PureResult (DESIGN §10.1 L735, L737)
export const okResult = (operation, base, revision, payload, report, identity = PID) =>
  ({ status: "ok", operation, profileIdentity: clone(identity), baseRevision: base, revision, report, payload });
/** Refusal: diagnostics = report.entries = findings of the lint stages run before the refusal (harmonization B2, B3). */
export const refusedResult = (operation, code, { base, identity = PID, entries = [] } = {}) => ({
  status: "refused", operation, ...(base ? { profileIdentity: clone(identity), baseRevision: base } : {}), code,
  diagnostics: sortEntries(entries), report: reportFor(operation, { entries, input: base, identity: base ? identity : undefined, refusal: true }),
});
export const pureOk = (payload, diagnostics = []) => ({ status: "ok", payload, diagnostics });
export const pureRefused = (code, diagnostics = []) => ({ status: "refused", code, diagnostics });

// ---------------------------------------------------------------- template markers (see comparators/lot5-compare.mjs)
export const unsealed = (reason, type, optional = false) => ({ $unsealed: reason, type, ...(optional ? { optional: true } : {}) });
export const eq = (member, pointer = "") => ({ $equals: { member, pointer } });
/** Equals the value at pointer in the pinned input snapshot of the case. */
export const eqIn = (pointer = "") => ({ $equals: { input: "snapshot", pointer } });
export const ref = (member, pointer = "") => ({ member, pointer });
export const inputRef = (input, pointer = "") => ({ input, pointer });
export const viewRule = (semantic, themeId, layout) => ({
  $rule: "view-revision", semanticRevision: semantic, themeId, themeDigest: D.themeDigest(themeId),
  overridesDigest: D.overridesDigest, diStylesDigest: D.diStylesDigest, metricsDigest: D.metricsDigest, layout,
});
export const selectionValid = layout => ({ $rule: "selection-valid", layout });
export const layoutDelta = ({ base, pages = "exact", remove = [], modify = [], add = [] }) => ({ $rule: "layout-delta", base, pages, remove, modify, add });

// ---------------------------------------------------------------- cases
export const cases = [];
export const clauseIndex = [];
const numbers = new Map();
export const cite = (section, from, to = from) => ({ section, from, to });
export const artifact = (role, json) => ({ role, json: clone(json) });
export const pin = (role, file) => ({ role, path: file.path, sha256: file.sha256 });
/** Register one case with an explicit, stable number (numbers are never reused). */
export function addCase(group, nn, slug, spec) {
  const key = `${group}-${nn}`;
  if (numbers.has(key)) throw new Error(`${key} reused`);
  numbers.set(key, slug);
  const n = String(nn).padStart(3, "0");
  const caseId = `lot5-${group}-${n}-${slug}`;
  const path = `cases/${group}-${n}-${slug}.json`;
  if (!spec.clauses?.length || !spec.discriminates || !spec.expectedArtifacts?.length) throw new Error(`${caseId}: incomplete spec`);
  if (!/^(?:ok|refused:[a-z][a-z0-9-]*)$/.test(spec.expectedStatus)) throw new Error(`${caseId}: status ${spec.expectedStatus}`);
  const roles = spec.expectedArtifacts.map(a => a.role);
  if (new Set(roles).size !== roles.length) throw new Error(`${caseId}: duplicate expected role`);
  const record = {
    caseId, operation: spec.operation, phase: spec.phase ?? null, profileArtifact: spec.profileArtifact ?? clone(PROFILE_ARTIFACT),
    inputArtifacts: spec.inputArtifacts, ...(spec.commandArtifact ? { commandArtifact: spec.commandArtifact } : {}),
    expectedArtifacts: spec.expectedArtifacts, expectedStatus: spec.expectedStatus, comparatorIds: spec.comparatorIds,
  };
  cases.push({ path, record });
  const seen = new Set();
  const clauses = spec.clauses.filter(c => { const k = `${c.section}|${c.from}|${c.to}`; if (seen.has(k)) return false; seen.add(k); return true; });
  clauseIndex.push({ caseId, path, group, clauses, discriminates: spec.discriminates, ...(spec.defaults ? { defaults: spec.defaults } : {}), ...(spec.unsealed ? { unsealed: spec.unsealed } : {}) });
  return record;
}

// ---------------------------------------------------------------- shared documents
export const T0 = D.basicTree();
export const E0 = D.envelope(T0);
export const R0 = E0.semanticRevision;
export const L0 = D.basicLayout();
export const S0 = D.snapshot(E0, L0);
export const V0 = S0.viewRevision;
export const S0c = D.snapshot(E0, L0, { themeId: "contrast" });
export const S0review = D.snapshot(E0, L0, { activePageId: "page-review" });
export const LV = D.viewsLayout();
export const SV = D.snapshot(E0, LV);
export const SVdetail = D.snapshot(E0, LV, { activePageId: "page-detail", selection: [{ pageId: "page-detail", occurrenceKey: "occ:Task_A" }] });
export const SVreviewA = D.snapshot(E0, LV, { activePageId: "page-review-a" });
export const T1set = D.oneSetTree();
export const S1set = D.snapshot(D.envelope(T1set), L0);
export const TF = D.foreignTree();
export const SF = D.snapshot(D.envelope(TF), D.foreignLayout());
export const TD = D.demoTree();
export const SD = D.snapshot(D.envelope(TD), D.demoLayout());
export const TU = D.unfixedTree();
export const SU = D.snapshot(D.envelope(TU), L0);
export const TB = D.bandedTree();
export const SB = D.snapshot(D.envelope(TB), D.bandedLayout());
export const TBB = D.bandedTree({ bound: true });
export const SBB = D.snapshot(D.envelope(TBB, { bindings: D.BANDED_BINDINGS }), D.bandedLayout());
export const SDang = D.snapshot(D.envelope(D.danglingTree()), D.danglingLayout());

export const docs = {
  basic: fixture("fixtures/documents/basic.snapshot.json", S0),
  basicContrast: fixture("fixtures/documents/basic-contrast.snapshot.json", S0c),
  basicReview: fixture("fixtures/documents/basic-review-page.snapshot.json", S0review),
  views: fixture("fixtures/documents/views.snapshot.json", SV),
  viewsDetail: fixture("fixtures/documents/views-detail.snapshot.json", SVdetail),
  viewsReviewA: fixture("fixtures/documents/views-review-a.snapshot.json", SVreviewA),
  oneSet: fixture("fixtures/documents/one-set.snapshot.json", S1set),
  foreign: fixture("fixtures/documents/foreign.snapshot.json", SF),
  demo: fixture("fixtures/documents/demo.snapshot.json", SD),
  unfixed: fixture("fixtures/documents/unfixed.snapshot.json", SU),
  banded: fixture("fixtures/documents/banded.snapshot.json", SB),
  bandedBound: fixture("fixtures/documents/banded-bound.snapshot.json", SBB),
  dangling: fixture("fixtures/documents/dangling-call.snapshot.json", SDang),
};

// ---------------------------------------------------------------- command records (harmonization I3)
export const surface = (entry, context) => ({ command: "surface", entry, context });
export const upstream = (id, context) => ({ command: "upstream", upstream: id, context });
export const fieldCommand = (notion, fieldId, context) => ({ command: "field", notion, field: fieldId, context });
export const transaction = (snap, transactionId, commands, extra = {}) => ({ baseRevision: snap.envelope.semanticRevision, expectedViewRevision: snap.viewRevision, transactionId, commands, ...extra });

// ---------------------------------------------------------------- presentation
const LAYOUT_OF = ref("snapshot", "/payload/presentation/layout");
/** Layout after removing every occurrence of the listed semantic IDs (fully determined). */
export function withoutOccurrences(layoutRecord, ids) {
  const set = new Set(ids);
  return { ...clone(layoutRecord), geometry: layoutRecord.geometry.filter(g => !set.has(g.semanticId)).map(clone) };
}
/** Occurrences (page, key) of the listed semantic IDs in a layout, as modify entries with unsealed members. */
export const modifiedOccurrences = (layoutRecord, ids, unsealedMembers) =>
  layoutRecord.geometry.filter(g => ids.includes(g.semanticId)).map(g => ({ pageId: g.pageId, occurrenceKey: g.occurrenceKey, unsealed: unsealedMembers }));

/**
 * Presentation expectation of a committed state: a literal layout and
 * viewRevision when the delta is fully determined (removals only, no label
 * change), otherwise the exact layout-delta rule plus the §9.2 formula.
 */
function presentationAfter(snap, env, { remove = [], relabel = [], add = [], selection, envelope }) {
  const themeId = snap.presentation.themeId;
  const literal = !relabel.length && !add.length;
  const layoutTemplate = literal ? (remove.length ? withoutOccurrences(snap.presentation.layout, remove) : eqIn("/presentation/layout"))
    : layoutDelta({ base: inputRef("snapshot", "/presentation/layout"), pages: add.length ? "growth" : "exact", remove,
      modify: modifiedOccurrences(snap.presentation.layout, relabel, ["label"]), add });
  const view = literal ? D.viewRevision(env.semanticRevision, withoutOccurrences(snap.presentation.layout, remove), themeId) : viewRule(env.semanticRevision, themeId, LAYOUT_OF);
  return {
    payload: {
      snapshotVersion: "1", envelope,
      presentation: { layout: layoutTemplate, themeId, overrides: clone(D.EMPTY_OVERRIDES), diStyles: clone(D.EMPTY_STYLES), importedDi: eqIn("/presentation/importedDi"),
        selection, activePageId: snap.presentation.activePageId },
      viewRevision: view,
    },
    view,
  };
}
/** The input snapshot's getSnapshot() Result, unchanged (the payload refers to the pinned input exactly). */
export const unchangedSnapshotResult = snap => okResult("getSnapshot", snap.envelope.semanticRevision, snap.envelope.semanticRevision, eqIn(""),
  reportFor("getSnapshot", { input: snap.envelope.semanticRevision, output: snap.envelope.semanticRevision }));
/** getSnapshot() Result equal to the input snapshot except the listed presentation members (and viewRevision). */
export function snapshotWith(snap, { themeId, selection, activePageId, viewRevision } = {}) {
  const R = snap.envelope.semanticRevision;
  return okResult("getSnapshot", R, R, {
    snapshotVersion: "1", envelope: eqIn("/envelope"),
    presentation: { layout: eqIn("/presentation/layout"), themeId: themeId ?? snap.presentation.themeId, overrides: clone(snap.presentation.overrides),
      diStyles: clone(snap.presentation.diStyles), importedDi: eqIn("/presentation/importedDi"), selection: selection ?? clone(snap.presentation.selection),
      activePageId: activePageId ?? snap.presentation.activePageId },
    viewRevision: viewRevision ?? snap.viewRevision,
  }, reportFor("getSnapshot", { input: R, output: R }));
}

/** Canvas history after one commit: undo restores the input exactly, redo the committed state. */
function historyAfterCommit(snap, env, transactionId) {
  const R1 = env.semanticRevision, Rb = snap.envelope.semanticRevision;
  const undoReport = reportFor("undo", { input: R1, output: Rb }), redoReport = reportFor("redo", { input: Rb, output: R1 });
  const undoPayload = {
    snapshotVersion: "1", envelope: eqIn("/envelope"),
    presentation: { layout: eqIn("/presentation/layout"), themeId: snap.presentation.themeId, overrides: clone(D.EMPTY_OVERRIDES), diStyles: clone(D.EMPTY_STYLES),
      importedDi: eqIn("/presentation/importedDi"), selection: selectionValid(ref("history", "/undo/result/payload/presentation/layout")), activePageId: snap.presentation.activePageId },
    viewRevision: snap.viewRevision,
  };
  const redoPayload = {
    snapshotVersion: "1", envelope: eq("snapshot", "/payload/envelope"),
    presentation: { layout: eq("snapshot", "/payload/presentation/layout"), themeId: snap.presentation.themeId, overrides: clone(D.EMPTY_OVERRIDES), diStyles: clone(D.EMPTY_STYLES),
      importedDi: eqIn("/presentation/importedDi"), selection: selectionValid(ref("history", "/redo/result/payload/presentation/layout")), activePageId: snap.presentation.activePageId },
    viewRevision: eq("snapshot", "/payload/viewRevision"),
  };
  return {
    undo: { result: okResult("undo", R1, Rb, undoPayload, undoReport),
      events: [{ envelope: eqIn("/envelope"), semanticRevision: Rb, viewRevision: snap.viewRevision, transactionId, origin: "undo", report: eq("history", "/undo/result/report") }] },
    redo: { result: okResult("redo", Rb, R1, redoPayload, redoReport),
      events: [{ envelope: eq("snapshot", "/payload/envelope"), semanticRevision: R1, viewRevision: eq("snapshot", "/payload/viewRevision"), transactionId, origin: "redo", report: eq("history", "/redo/result/report") }] },
    rootTransactions: 1,
  };
}
/** No history entry: on a freshly restored canvas undo() refuses operation-error (harmonization C10). */
const historyUntouched = snap => ({
  probe: refusedResult("undo", "operation-error", { base: snap.envelope.semanticRevision }), probeEvents: [], rootTransactions: 0,
});

// ---------------------------------------------------------------- twin projection (Python headless commands/fields)
const TWIN = unsealed("twin-presentation", "string");
const TWIN_SNAPSHOT = envelope => ({ snapshotVersion: "1", envelope, presentation: unsealed("twin-presentation", "object"), viewRevision: TWIN });
/** Build the twin artifact (self-contained: refs only into the twin observation and the pinned input). */
export function twinOf({ result, events, history }) {
  const out = {};
  if (result) {
    out.result = clone(result);
    if (result.status === "ok" && result.operation === "applyCommands") out.result.payload.viewRevision = TWIN;
  }
  if (events) out.events = events.map(e => ({ envelope: eq("twin", "/result/payload/envelope"), semanticRevision: e.semanticRevision, viewRevision: TWIN,
    transactionId: e.transactionId, origin: e.origin, report: eq("twin", "/result/report") }));
  if (history) out.history = history.probe ? { probe: clone(history.probe), probeEvents: [] } : {
    undo: { result: { ...clone(history.undo.result), payload: TWIN_SNAPSHOT(eqIn("/envelope")) },
      events: history.undo.events.map(e => ({ envelope: eqIn("/envelope"), semanticRevision: e.semanticRevision, viewRevision: TWIN, transactionId: e.transactionId, origin: "undo", report: eq("twin", "/history/undo/result/report") })) },
    redo: { result: { ...clone(history.redo.result), payload: TWIN_SNAPSHOT(eq("twin", "/result/payload/envelope")) },
      events: history.redo.events.map(e => ({ envelope: eq("twin", "/result/payload/envelope"), semanticRevision: e.semanticRevision, viewRevision: TWIN, transactionId: e.transactionId, origin: "redo", report: eq("twin", "/history/redo/result/report") })) },
  };
  return out;
}
export const TWIN_NOTE = "Twin projection: the Python headless result for the same envelope and command list; payload.viewRevision, snapshot presentation and event viewRevision are excluded (twin-presentation).";

// ---------------------------------------------------------------- command case expectations
/**
 * Expected artifacts of a committed transaction (canvas and twin). opts:
 * unnamed (activities left unnamed → draft lint entries), changes (C entries),
 * idMap (replacement map rows), remove/relabel/add (presentation delta),
 * selection (template; default per the lot-5 selection default).
 */
export function okCommand(snap, tx, tree, { unnamed = [], changes = [], idMap = [], remove = [], relabel = [], add = [], selection, origin = "command", idMapUnsealed = false, gesture = false } = {}) {
  assertResolved(tree, tx.transactionId); assertUnnamed(tree, unnamed, tx.transactionId);
  const env = D.envelope(tree, { bindings: snap.envelope.bindings });
  const R1 = env.semanticRevision, Rb = snap.envelope.semanticRevision;
  if (R1 === Rb) throw new Error(`${tx.transactionId}: expected a change`);
  const report = reportFor("applyCommands", { entries: [...changes, ...draftLint(tree, unnamed)], idMap, input: Rb, output: R1 });
  if (idMapUnsealed) report.idMap = unsealed("replacement-map-multi-create", "array");
  const sel = selection ?? (remove.length ? snap.presentation.selection.filter(s => !remove.some(id => s.occurrenceKey === D.occurrenceKey(id)))
    : add.length ? selectionValid(LAYOUT_OF) : clone(snap.presentation.selection));
  // One literal copy of the committed envelope and report: in the Result for a
  // programmatic call, in the snapshot and event for a gesture (no caller Result).
  const pres = presentationAfter(snap, env, { remove, relabel, add, selection: sel, envelope: gesture ? clone(env) : eq("result", "/payload/envelope") });
  const result = okResult("applyCommands", Rb, R1, { envelope: env, semanticRevision: R1, viewRevision: pres.view, transactionId: tx.transactionId, changed: true }, report);
  const snapshotResult = okResult("getSnapshot", R1, R1, pres.payload, reportFor("getSnapshot", { input: R1, output: R1 }));
  const events = [{ envelope: eq("snapshot", "/payload/envelope"), semanticRevision: R1, viewRevision: eq("snapshot", "/payload/viewRevision"), transactionId: tx.transactionId, origin,
    report: gesture ? clone(report) : eq("result", "/report") }];
  const history = historyAfterCommit(snap, env, tx.transactionId);
  return { result, snapshot: snapshotResult, events, history, envelope: env, revision: R1, report };
}
/** Expected artifacts of a transaction that changes nothing (§2.4 L158 when false, §8.2 L641 no difference). */
export function noopCommand(snap, tx, { unnamed = [] } = {}) {
  const Rb = snap.envelope.semanticRevision;
  assertUnnamed(snap.envelope.tree, unnamed, tx.transactionId);
  const report = reportFor("applyCommands", { entries: draftLint(snap.envelope.tree, unnamed), input: Rb, output: Rb });
  const result = okResult("applyCommands", Rb, Rb, { envelope: eqIn("/envelope"), semanticRevision: Rb, viewRevision: snap.viewRevision, transactionId: tx.transactionId, changed: false }, report);
  return { result, snapshot: unchangedSnapshotResult(snap), events: [], history: historyUntouched(snap) };
}
/** Expected artifacts of a refused transaction: nothing committed, full refusal record. */
export function refusedCommand(snap, code, { entries = [], loaded = true } = {}) {
  const result = refusedResult("applyCommands", code, loaded ? { base: snap.envelope.semanticRevision, entries } : { entries });
  return { result, snapshot: unchangedSnapshotResult(snap), events: [], history: historyUntouched(snap) };
}
/**
 * Expected artifact list. Programmatic calls seal the Result; a gesture has no
 * caller-visible Result (its commit is observed through the snapshot, events
 * and history; a refused gesture through its diagnostic outcome, §8.2 L633).
 * The twin replays the same command list headlessly.
 */
export function artifactsOf(x, { twin = true, staged, gesture = false, extra = [] } = {}) {
  const out = [];
  if (staged) out.push(artifact("staged-command", staged));
  if (!gesture) out.push(artifact("result", x.result));
  else if (x.result.status === "refused") out.push(artifact("diagnostic", x.result));
  out.push(artifact("snapshot", x.snapshot), artifact("events", x.events), artifact("history", x.history), ...extra);
  if (twin) out.push(artifact("twin", twinOf({ result: x.result, events: x.events, history: x.history })));
  return out;
}
// ---------------------------------------------------------------- workshop downloads (DESIGN §10.2 L803, §12.1 L876, §8.1 L621)
const NODE_LABEL_TYPES = ["bpmn:Task", "bpmn:UserTask", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:ExclusiveGateway", "bpmn:CallActivity",
  "bpmn:DataObjectReference", "bpmn:DataStoreReference", "bpmn:DataInput"];
/** Nonempty evaluated node labels of a final tree (notion label Values; empty labels give no label, harmonization F3). */
export function finalLabels(tree) {
  const out = new Set();
  (function walk(n) {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    if (NODE_LABEL_TYPES.includes(n.$type) && typeof n.name === "string" && n.name) out.add(n.name);
    if (n.$type === "bpmn:TextAnnotation" && typeof n.text === "string") {
      const label = n.text.startsWith("[Aid]") ? (n.text.startsWith(P.AID_MARKER) ? n.text.slice(P.AID_MARKER.length) : n.text) : n.text;
      if (label) out.add(label);
    }
    Object.values(n).forEach(walk);
  })(tree);
  return [...out].sort();
}
/**
 * One successful export reaching the host exactly once with the final state:
 * header, report, capability and freshness are exact; IR geometry, keys,
 * counter assignment and bytes are adapter output (UNSEALED export-adapter)
 * checked by rules: final names only, digest = H(ir), digest = SHA-256(bytes).
 */
export function downloadOk(at, { R, tree, required = [], stale = [], covers = [], never = [] }) {
  const idMap = eq(at.member, `${at.pointer}/prepared/payload/idMap`);
  const prepReport = reportFor("prepareExport", { input: R, output: R, idMap: [],
    artifacts: [{ format: "drawio", capability: "structural", digest: { $rule: "ir-digest", ir: ref(at.member, `${at.pointer}/prepared/payload/ir`) }, entryIndexes: [] }] });
  prepReport.idMap = idMap;
  const prepared = okResult("prepareExport", R, R, {
    format: "drawio", profileIdentity: clone(PID), semanticRevision: R,
    viewRevision: { $rule: "view-revision-binding", binding: ref(at.member, `${at.pointer}/prepared/payload/renderBinding`) },
    ir: { $rule: "ir-names", allowed: finalLabels(tree), required, stale },
    renderBinding: { semanticRevision: R, profileDigest: PID.sha256, descriptorDigest: D.descriptorDigest, layoutDigest: unsealed("export-adapter", "string"),
      themeId: "plain", themeDigest: D.themeDigest("plain"), overridesDigest: D.overridesDigest, diStylesDigest: D.diStylesDigest, metricsDigest: D.metricsDigest,
      payloadDigest: unsealed("export-adapter", "string") },
    report: eq(at.member, `${at.pointer}/prepared/report`), capability: "structural",
    idMap: { $rule: "export-idmap", covers, never },
  }, prepReport);
  const serializedReport = reportFor("exportPrepared", { input: R, output: R }); serializedReport.artifacts = unsealed("export-adapter", "array");
  const serialized = okResult("exportPrepared", R, R, {
    format: "drawio", bytes: unsealed("export-adapter", "bytes"), digest: { $rule: "bytes-sha256", bytes: ref(at.member, `${at.pointer}/serialized/payload/bytes`) },
    idMap, capability: "structural",
  }, serializedReport);
  const callbacks = [{
    format: "drawio", bytes: eq(at.member, `${at.pointer}/serialized/payload/bytes`), digest: eq(at.member, `${at.pointer}/serialized/payload/digest`),
    capability: "structural", report: eq(at.member, `${at.pointer}/prepared/payload/report`), idMap,
    semanticRevision: R, viewRevision: eq(at.member, `${at.pointer}/prepared/payload/viewRevision`), profileIdentity: clone(PID),
  }];
  return { prepared, serialized, callbacks };
}
/** A refused export: complete refusal record, no download callback, diagnostics shown. */
export const downloadRefused = (code, { R, entries = [] }) => ({ prepared: refusedResult("prepareExport", code, { base: R, entries }), callbacks: [], diagnosticsShown: true });

export const CANVAS = ["lot5/snapshot", "lot5/events", "lot5/history"];
export const COMMAND_IDS = ["lot5/result", ...CANVAS, "lot5/twin"];
export const GESTURE_IDS = ["lot5/staged-command", ...CANVAS, "lot5/twin"];
export const GESTURE_REFUSED_IDS = ["lot5/staged-command", "lot5/diagnostic", ...CANVAS, "lot5/twin"];
