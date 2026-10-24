// Groups "history", "workshop" (sequences), "fields" (commit-time
// invalidation), "twin", "demo" and "gates": multi-step cases with an exact
// expected outcome per step, plus the panel dependency gate and the OPEN gates.
import { addCase, artifact, pin, cite, docs, clone, stableId, jcs, fe, find, removeIds, draftLint, completeSet, lintEntry, reportFor, okResult, refusedResult,
  pureOk, surface, fieldCommand, transaction, assertResolved, assertUnnamed, unsealed, eq, eqIn, ref, inputRef, viewRule, selectionValid, layoutDelta, downloadOk, downloadRefused,
  T0, E0, R0, S0, V0, L0, SV, LV, TD, SD, TU, SU, TB, SB, TBB, SBB, PID, P, D, pointerOf } from "./lot5-kit.mjs";
import { ok, refused, PRODUCER_DEFAULT } from "./lot5-group-commands.mjs";
import { paste, fragment, pasteId } from "./lot5-group-paste.mjs";

const fresh = () => clone(T0);
const CURRENT = "@current";
const SEQ_DEFAULTS = ["Sequence steps run in order on one canvas; each step observation carries exactly the members of its expected template; \"@current\" in a request is replaced by getSnapshot().payload.viewRevision before the call; refs into earlier steps compare observed values exactly (harmonization A8)."];
const TWIN_STEPS = "Twin: the Python headless bridge replays the listed headless steps (gestures as their staged command lists) on the same envelope; presentation members are excluded (twin-presentation).";
const occ = (pageId, semanticId, edge) => ({ pageId, semanticId, role: "content", ...(edge ? { edge: { source: edge[0], target: edge[1] } } : {}) });

/**
 * Step-by-step expectation builder over one canvas. Each state's envelope has
 * one literal copy (the step Result, or the snapshot of a gesture); later
 * members refer to it with $equals refs into the observed steps (canvas) or the
 * twin steps (Python twin), so every member stays exact.
 */
class Seq {
  constructor(snap, { pageId = snap.presentation.activePageId } = {}) {
    this.snap = snap; this.pageId = pageId; this.steps = []; this.outcomes = []; this.twin = []; this.headless = true;
    this.env = clone(snap.envelope); this.theme = snap.presentation.themeId;
    this.payloadRef = null; // null = the input snapshot payload
    this.twinEnvRef = null; // null = the input snapshot envelope
    this.history = []; this.cursor = 0;
  }
  get i() { return this.outcomes.length; }
  get R() { return this.env.semanticRevision; }
  layoutRef() { return this.payloadRef ? ref("steps", `${this.payloadRef}/presentation/layout`) : inputRef("snapshot", "/presentation/layout"); }
  viewRef() { return this.payloadRef ? eq("steps", `${this.payloadRef}/viewRevision`) : this.snap.viewRevision; }
  currentPayload() { return this.payloadRef ? eq("steps", this.payloadRef) : eqIn(""); }
  envRef() { return this.payloadRef ? eq("steps", `${this.payloadRef}/envelope`) : eqIn("/envelope"); }
  twinEnv() { return this.twinEnvRef ? eq("twin", this.twinEnvRef) : eqIn("/envelope"); }
  request(transactionId, commands) { return { baseRevision: this.R, expectedViewRevision: CURRENT, transactionId, commands }; }
  presentation(layout, selection) {
    return { layout, themeId: this.theme, overrides: clone(D.EMPTY_OVERRIDES), diStyles: clone(D.EMPTY_STYLES), importedDi: eqIn("/presentation/importedDi"),
      selection, activePageId: this.snap.presentation.activePageId };
  }
  /** Committed command or gesture step. */
  commit({ transactionId, commands, tree, unnamed = [], changes = [], idMap = [], remove = [], relabel = [], add = [], gesture, origin = "command" }) {
    assertResolved(tree, transactionId); assertUnnamed(tree, unnamed, transactionId);
    const k = this.i, ti = this.twin.length, env = D.envelope(tree, { bindings: this.env.bindings }), R1 = env.semanticRevision;
    if (R1 === this.R) throw new Error(`${transactionId}: expected a change`);
    const report = reportFor("applyCommands", { entries: [...changes, ...draftLint(tree, unnamed)], idMap, input: this.R, output: R1 });
    const layoutOf = ref("steps", `/${k}/snapshot/payload/presentation/layout`);
    const payload = { snapshotVersion: "1", envelope: gesture ? clone(env) : eq("steps", `/${k}/result/payload/envelope`),
      presentation: this.presentation(layoutDelta({ base: this.layoutRef(), pages: add.length ? "growth" : "exact", remove,
        modify: relabel.map(semanticId => ({ pageId: this.pageId, semanticId, unsealed: ["label"] })), add }), selectionValid(layoutOf)),
      viewRevision: viewRule(R1, this.theme, layoutOf) };
    const result = okResult("applyCommands", this.R, R1, { envelope: env, semanticRevision: R1, viewRevision: viewRule(R1, this.theme, layoutOf), transactionId, changed: true }, report);
    const events = [{ envelope: eq("steps", `/${k}/snapshot/payload/envelope`), semanticRevision: R1, viewRevision: eq("steps", `/${k}/snapshot/payload/viewRevision`),
      transactionId, origin, report: gesture ? clone(report) : eq("steps", `/${k}/result/report`) }];
    this.steps.push(gesture ? { step: k + 1, action: "gesture", gesture } : { step: k + 1, action: "applyCommands", request: this.request(transactionId, commands) });
    this.outcomes.push({ ...(gesture ? { staged: { transactionId, commands } } : { result }), snapshot: okResult("getSnapshot", R1, R1, payload, reportFor("getSnapshot", { input: R1, output: R1 })), events });
    const twinResult = clone(result); twinResult.payload.viewRevision = TWIN;
    this.twin.push({ step: k + 1, result: twinResult, events: twinEventsOf(events, ti) });
    this.history.length = this.cursor;
    this.history.push({ before: { env: this.env, payloadRef: this.payloadRef, twinEnvRef: this.twinEnvRef }, after: { env, payloadRef: `/${k}/snapshot/payload`, twinEnvRef: `/steps/${ti}/result/payload/envelope` }, transactionId });
    this.cursor++;
    this.env = env; this.payloadRef = `/${k}/snapshot/payload`; this.twinEnvRef = `/steps/${ti}/result/payload/envelope`;
    return { env, R: R1 };
  }
  /** Refused or no-op command step: nothing committed, snapshot equal to the previous state. */
  still({ transactionId, commands, code, entries = [] }) {
    const k = this.i;
    const noop = envelope => okResult("applyCommands", this.R, this.R, { envelope, semanticRevision: this.R, viewRevision: this.viewRef(), transactionId, changed: false },
      reportFor("applyCommands", { entries: draftLint(this.env.tree, []), input: this.R, output: this.R }));
    const result = code ? refusedResult("applyCommands", code, { base: this.R, entries }) : noop(this.envRef());
    this.steps.push({ step: k + 1, action: "applyCommands", request: this.request(transactionId, commands) });
    this.outcomes.push({ result, snapshot: okResult("getSnapshot", this.R, this.R, this.currentPayload(), reportFor("getSnapshot", { input: this.R, output: this.R })), events: [] });
    const twinResult = code ? clone(result) : noop(this.twinEnv()); if (!code) twinResult.payload.viewRevision = TWIN;
    this.twin.push({ step: k + 1, result: twinResult, events: [] });
  }
  /** undo() or redo() restoring a stored state exactly (§8.2 L641). */
  restore(action) {
    const k = this.i, ti = this.twin.length;
    const entry = action === "undo" ? this.history[this.cursor - 1] : this.history[this.cursor];
    if (!entry) throw new Error(`nothing to ${action}`);
    const target = action === "undo" ? entry.before : entry.after, Rt = target.env.semanticRevision;
    const rep = reportFor(action, { input: this.R, output: Rt });
    const resultLayout = ref("steps", `/${k}/result/payload/presentation/layout`);
    const sameTheme = this.theme === this.snap.presentation.themeId;
    const payload = {
      snapshotVersion: "1", envelope: target.payloadRef ? eq("steps", `${target.payloadRef}/envelope`) : eqIn("/envelope"),
      presentation: this.presentation(target.payloadRef ? eq("steps", `${target.payloadRef}/presentation/layout`) : eqIn("/presentation/layout"), selectionValid(resultLayout)),
      viewRevision: !target.payloadRef ? D.viewRevision(Rt, this.snap.presentation.layout, this.theme)
        : sameTheme ? eq("steps", `${target.payloadRef}/viewRevision`) : viewRule(Rt, this.theme, resultLayout),
    };
    const events = [{ envelope: eq("steps", `/${k}/result/payload/envelope`), semanticRevision: Rt, viewRevision: eq("steps", `/${k}/result/payload/viewRevision`),
      transactionId: entry.transactionId, origin: action, report: eq("steps", `/${k}/result/report`) }];
    this.steps.push({ step: k + 1, action, request: { expectedRevision: this.R, expectedViewRevision: CURRENT } });
    this.outcomes.push({ result: okResult(action, this.R, Rt, payload, rep), events });
    const twinPayload = { snapshotVersion: "1", envelope: target.twinEnvRef ? eq("twin", target.twinEnvRef) : eqIn("/envelope"), presentation: unsealed("twin-presentation", "object"), viewRevision: TWIN };
    this.twin.push({ step: k + 1, result: okResult(action, this.R, Rt, twinPayload, rep), events: twinEventsOf(events, ti) });
    this.cursor += action === "undo" ? -1 : 1;
    this.env = clone(target.env); this.payloadRef = `/${k}/result/payload`; this.twinEnvRef = `/steps/${ti}/result/payload/envelope`;
  }
  /** Refused undo/redo (nothing to restore or stale guard): operation-error (harmonization C10). */
  restoreRefused(action, { expectedRevision = this.R, staleView = false } = {}) {
    const k = this.i;
    const result = refusedResult(action, "operation-error", { base: this.R });
    this.steps.push({ step: k + 1, action, request: { expectedRevision, expectedViewRevision: staleView ? "0".repeat(64) : CURRENT } });
    this.outcomes.push({ result, events: [] });
    this.twin.push({ step: k + 1, result: clone(result), events: [] });
  }
  setTheme(themeId) {
    const k = this.i; this.headless = false; this.theme = themeId;
    const view = viewRule(this.R, themeId, ref("steps", `/${k}/snapshot/payload/presentation/layout`));
    const rep = reportFor("setTheme", { input: this.R, output: this.R });
    const prev = this.payloadRef;
    const payload = { snapshotVersion: "1", envelope: this.envRef(),
      presentation: this.presentation(prev ? eq("steps", `${prev}/presentation/layout`) : eqIn("/presentation/layout"),
        prev ? eq("steps", `${prev}/presentation/selection`) : clone(this.snap.presentation.selection)),
      viewRevision: view };
    this.steps.push({ step: k + 1, action: "setTheme", themeId });
    this.outcomes.push({ result: okResult("setTheme", this.R, this.R, { viewRevision: view }, rep), snapshot: okResult("getSnapshot", this.R, this.R, payload, reportFor("getSnapshot", { input: this.R, output: this.R })),
      events: [{ envelope: eq("steps", `/${k}/snapshot/payload/envelope`), semanticRevision: this.R, viewRevision: eq("steps", `/${k}/snapshot/payload/viewRevision`),
        transactionId: unsealed("event-transaction", "string"), origin: "theme", report: eq("steps", `/${k}/result/report`) }] });
    this.payloadRef = `/${k}/snapshot/payload`;
  }
  /** restoreSnapshot(input snapshot): a new history epoch (§8.2 L643, §8.1 L594). */
  restoreSnapshot() {
    const k = this.i; this.headless = false;
    const S = this.snap, Rin = S.envelope.semanticRevision;
    const rep = reportFor("restoreSnapshot", { input: Rin, output: Rin });
    this.steps.push({ step: k + 1, action: "restoreSnapshot", snapshot: "input snapshot", request: { expectedRevision: this.R } });
    this.outcomes.push({ result: okResult("restoreSnapshot", Rin, Rin, { envelope: eqIn("/envelope"), semanticRevision: Rin, viewRevision: S.viewRevision, historyEpoch: unsealed("history-epoch", "string") }, rep),
      events: [{ envelope: eqIn("/envelope"), semanticRevision: Rin, viewRevision: S.viewRevision, transactionId: unsealed("event-transaction", "string"), origin: "snapshot", report: eq("steps", `/${k}/result/report`) }] });
    this.env = clone(S.envelope); this.payloadRef = null; this.twinEnvRef = null; this.history = []; this.cursor = 0;
  }
  exportOk(opts) {
    const k = this.i; this.headless = false;
    this.steps.push({ step: k + 1, action: "export", request: { formatId: "drawing", themeId: "plain", label: "Drawing" } });
    this.outcomes.push({ download: downloadOk(ref("steps", `/${k}/download`), { R: this.R, tree: this.env.tree, ...opts }), events: [] });
  }
  exportRefused(code, entries) {
    const k = this.i; this.headless = false;
    this.steps.push({ step: k + 1, action: "export", request: { formatId: "drawing", themeId: "plain", label: "Drawing" } });
    this.outcomes.push({ download: downloadRefused(code, { R: this.R, entries }), events: [] });
  }
  query(operation, queryRecord, result) {
    const k = this.i;
    this.steps.push({ step: k + 1, action: operation, request: queryRecord });
    this.outcomes.push({ result });
    this.twin.push({ step: k + 1, result: clone(result) });
  }
}
const TWIN = unsealed("twin-presentation", "string");
/** Twin events: same records with refs into the twin step result instead of the canvas observation. */
const twinEventsOf = (events, ti) => events.map(e => ({ envelope: eq("twin", `/steps/${ti}/result/payload/envelope`), semanticRevision: e.semanticRevision, viewRevision: TWIN,
  transactionId: e.transactionId, origin: e.origin, report: eq("twin", `/steps/${ti}/result/report`) }));

function seqCase(group, nn, slug, s, { doc, clauses, discriminates, defaults = [], twin = s.headless, extraCmp = [], extraArtifacts = [] }) {
  addCase(group, nn, slug, {
    operation: "canvas.sequence", inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("sequence", { sequenceVersion: "1", steps: s.steps }),
    expectedArtifacts: [artifact("sequence", s.outcomes), ...extraArtifacts, ...(twin ? [artifact("twin", { steps: s.twin })] : [])],
    expectedStatus: "ok", comparatorIds: ["lot5/sequence", ...extraCmp, ...(twin ? ["lot5/twin"] : [])],
    clauses, discriminates, defaults: [...SEQ_DEFAULTS, ...(twin ? [TWIN_STEPS] : []), ...defaults],
  });
}

export function sequences() {
  const P0 = "Proc_main";
  // ------------------------------------------------------------ history
  {
    const s = new Seq(S0);
    const t1 = fresh(); find(t1, "Task_A").name = "Verify order";
    s.commit({ transactionId: "tx-history-1-1", commands: [surface("rename-direct", { target: "Task_A", value: "Verify order" })], tree: t1, relabel: ["Task_A"] });
    s.still({ transactionId: "tx-history-1-2", commands: [surface("delete-element", { target: "Task_A" })], code: "reference-dangling" });
    s.restore("undo"); s.restore("redo");
    seqCase("history", 1, "refusal-leaves-no-entry", s, { doc: docs.basic, clauses: [cite("8.2", 633), cite("8.2", 641), cite("3.1", 268), cite("10.1", 735)],
      discriminates: "Pushes a history entry (or partial state) for the refused delete, so that the first undo restores the rename's after-state instead of the input; or undo/redo emit no or several events, or carry lint entries." });
  }
  {
    const s = new Seq(S0);
    const t1 = fresh(); find(t1, "Task_A").name = "Verify order";
    const rename = fieldCommand("task", "name", { target: "Task_A", value: "Verify order" });
    s.commit({ transactionId: "tx-history-2-1", commands: [rename], tree: t1, relabel: ["Task_A"] });
    s.still({ transactionId: "tx-history-2-2", commands: [rename] });
    s.restore("undo");
    seqCase("history", 2, "noop-leaves-no-entry", s, { doc: docs.basic, clauses: [cite("8.2", 641), cite("8.1", 606)],
      discriminates: "Records the identical second submission as a history entry, so one undo leaves the renamed state, or emits an event for the no-op." });
  }
  {
    // One undo/redo step per entry point, with the D7 replace before the task is connected.
    const s = new Seq(S0);
    const k1 = "k-history-3-1", t = stableId(P0, "task", k1), k2 = "k-history-3-2", u = stableId(P0, "replace", k2), k3 = "k-history-3-3", f = stableId(P0, "flow", k3);
    const t1 = fresh(); fe(t1).push({ $type: "bpmn:Task", id: t, name: "" });
    const t2 = fresh(); fe(t2).push({ $type: "bpmn:UserTask", id: u, name: "" });
    const t3 = clone(t2); fe(t3).push({ $type: "bpmn:SequenceFlow", id: f, sourceRef: u, targetRef: "End_1" });
    const t4 = clone(t3); find(t4, u).name = "Draft review";
    const t5 = clone(t4); removeIds(t5, ["Flow_3"]);
    s.commit({ transactionId: "tx-history-3-1", commands: [surface("task-create", { owner: P0, key: k1, value: "" })], tree: t1, unnamed: [t], add: [occ("page-main", t)] });
    s.commit({ transactionId: "tx-history-3-2", commands: [surface("to-user-task", { target: t, key: k2 })], tree: t2, unnamed: [u],
      idMap: [{ sourceId: t, resultId: u, domain: "migration" }], remove: [t], add: [occ("page-main", u)] });
    s.commit({ transactionId: "tx-history-3-3", commands: [surface("connect-flow", { owner: P0, source: u, target: "End_1", key: k3 })], tree: t3, unnamed: [u], add: [occ("page-main", f, [u, "End_1"])] });
    s.commit({ transactionId: "tx-history-3-4", commands: [fieldCommand("user-task", "name", { target: u, value: "Draft review" })], tree: t4, relabel: [u] });
    s.commit({ transactionId: "tx-history-3-5", commands: [surface("delete-element", { target: "Flow_3" })], tree: t5, remove: ["Flow_3"] });
    for (let n = 0; n < 5; n++) s.restore("undo");
    for (let n = 0; n < 5; n++) s.restore("redo");
    seqCase("history", 3, "entry-point-chain", s, { doc: docs.basic, clauses: [cite("8.2", 632), cite("8.2", 641), cite("8.3", 649), cite("8.3", 651), cite("3.2", 276)],
      defaults: ["Harmonization D7: the replace runs while the created task is still unconnected, so it yields a new allocated ID and a replacement-map row."],
      discriminates: "Recomputes IDs or reruns C/N on redo, merges two entry points into one undo step, splits one entry point into several, truncates redo during undo, or replays the replacement with a different ID." });
  }
  {
    const s = new Seq(S0);
    const key = "k-history-key", id = stableId(P0, "task", key);
    const t1 = fresh(); fe(t1).push({ $type: "bpmn:Task", id, name: "" });
    const create = surface("task-create", { owner: P0, key, value: "" });
    s.commit({ transactionId: "tx-history-4-1", commands: [create], tree: t1, unnamed: [id], add: [occ("page-main", id)] });
    s.still({ transactionId: "tx-history-4-2", commands: [create], code: "id-collision" });
    s.restore("undo");
    seqCase("history", 4, "insertion-key-reuse", s, { doc: docs.basic, clauses: [cite("3.2", 288), cite("8.3", 655)],
      discriminates: "Suffixes or re-randomizes the colliding allocated ID (a second task appears) instead of refusing id-collision." });
  }
  {
    const s = new Seq(S0);
    const fragTask = fragment(R0, [["flowElements", find(T0, "Task_A")]]);
    const key = "pk-history", id = pasteId(P0, key, "Task_A");
    const t1 = fresh(); fe(t1).push({ $type: "bpmn:Task", id, name: "Check order" });
    s.commit({ transactionId: "tx-history-5-1", commands: [paste(P0, key, fragTask)], tree: t1, add: [occ("page-main", id)] });
    s.still({ transactionId: "tx-history-5-2", commands: [paste(P0, key, fragTask)], code: "id-collision" });
    seqCase("history", 5, "paste-key-reuse", s, { doc: docs.basic, clauses: [cite("3.2", 288), cite("8.3", 653)],
      discriminates: "Pastes a second copy by suffixing IDs when the same transaction-scoped insertion key is replayed." });
  }
  {
    const s = new Seq(S0);
    const t1 = fresh(); find(t1, "Task_A").name = "Verify order";
    s.commit({ transactionId: "tx-history-6-1", commands: [surface("rename-direct", { target: "Task_A", value: "Verify order" })], tree: t1, relabel: ["Task_A"] });
    s.setTheme("contrast");
    s.restore("undo"); s.restore("redo");
    seqCase("history", 6, "theme-switch-keeps-history", s, { doc: docs.basic, twin: false, clauses: [cite("3.1", 264), cite("8.2", 643), cite("9.2", 694)],
      discriminates: "Clears or replays native history on a theme switch, treats the theme switch as an undo step, or restores the previous theme on undo." });
  }
  {
    const s = new Seq(SV);
    const t1 = fresh(); removeIds(t1, ["Flow_2"]);
    s.commit({ transactionId: "tx-history-7-1", commands: [surface("delete-element", { target: "Flow_2" })], tree: t1, remove: ["Flow_2"] });
    s.restore("undo");
    seqCase("history", 7, "multi-page-undo", s, { doc: docs.views, clauses: [cite("8.2", 643), cite("8.2", 641)],
      discriminates: "Restores the deleted edge on the active page only (multi-page operations stage and roll back all affected pages together)." });
  }
  const STALE = H0 => ({ baseRevision: H0 });
  refused("history", 8, "stale-base-revision", { transactionId: "tx-history-8", code: "operation-error", commands: [surface("rename-direct", { target: "Task_A", value: "Verify order" })],
    request: STALE(D.semanticRevision(clone(T1Renamed()))), phase: "edit", clauses: [cite("8.2", 629), cite("3.1", 268)],
    defaults: ["Harmonization C10: a stale baseRevision refuses operation-error before staging; the current identity and revision are echoed (B3)."],
    discriminates: "Applies the command to the current state although the caller staged it against another revision (last writer wins)." });
  refused("history", 9, "stale-view-revision", { transactionId: "tx-history-9", code: "operation-error", commands: [surface("rename-direct", { target: "Task_A", value: "Verify order" })],
    request: { expectedViewRevision: D.viewRevision(R0, L0, "contrast") }, phase: "edit", clauses: [cite("8.2", 629), cite("8.1", 587)],
    defaults: ["Harmonization C10: a stale expectedViewRevision refuses operation-error before staging."],
    discriminates: "Ignores expectedViewRevision (only the semantic revision is checked), committing over a presentation the caller has not seen." });
  {
    const s = new Seq(S0);
    s.restoreRefused("undo"); s.restoreRefused("redo");
    const t1 = fresh(); find(t1, "Task_A").name = "Verify order";
    s.commit({ transactionId: "tx-history-10-1", commands: [surface("rename-direct", { target: "Task_A", value: "Verify order" })], tree: t1, relabel: ["Task_A"] });
    s.restoreRefused("undo", { expectedRevision: R0 });
    s.restore("undo");
    s.restoreRefused("redo", { staleView: true });
    s.restore("redo");
    seqCase("history", 10, "undo-redo-guards", s, { doc: docs.basic, clauses: [cite("8.1", 595), cite("8.1", 596), cite("8.2", 629)],
      defaults: ["Harmonization C10: nothing to undo/redo and a stale expectedRevision/expectedViewRevision refuse operation-error, echoing the current identity and revision; the cursor is kept."],
      discriminates: "Undoes the last entry although the caller's expected revision is stale, moves the cursor on a refused redo, or returns an ok no-op for an empty history." });
  }
  {
    const s = new Seq(S0);
    const t1 = fresh(); find(t1, "Task_A").name = "Verify order";
    s.commit({ transactionId: "tx-history-11-1", commands: [surface("rename-direct", { target: "Task_A", value: "Verify order" })], tree: t1, relabel: ["Task_A"] });
    s.restoreSnapshot();
    s.restoreRefused("undo");
    seqCase("history", 11, "restore-starts-epoch", s, { doc: docs.basic, twin: false, clauses: [cite("8.2", 643), cite("8.1", 594), cite("8.1", 612)],
      defaults: ["restoreSnapshot starts a new history epoch: earlier entries become unavailable (§8.2 L643 load epoch, §8.1 L594 historyEpoch); the restored state equals the input snapshot exactly; historyEpoch is session-local (UNSEALED)."],
      discriminates: "Keeps the pre-restore history so undo reverts into the replaced document, or recomputes the restored layout." });
  }
  noopEmpty();
  // ------------------------------------------------------------ workshop sequences
  {
    const s = new Seq(S0);
    const t1 = fresh(); find(t1, "Task_A").name = "Verify order";
    s.commit({ transactionId: "tx-workshop-edit", commands: [fieldCommand("task", "name", { target: "Task_A", value: "Verify order" })], tree: t1, relabel: ["Task_A"] });
    s.exportOk({ required: ["Verify order"], stale: ["Check order"], covers: ["Task_A"] });
    seqCase("workshop", 7, "export-after-edit", s, { doc: docs.basic, clauses: [cite("10.2", 803), cite("8.1", 621), cite("12.1", 876)],
      defaults: ["Workshop export (lot-5 default): FormatOption {formatId:\"drawing\", themeId, label}; the download carries the final committed revision."],
      discriminates: "Exports a stale artifact (the pre-edit revision, a cached preparation or the old name) instead of the final committed state." });
  }
  {
    const s = new Seq(S0);
    const key = "k-workshop-blocked", id = stableId(P0, "task", key);
    const t1 = fresh(); fe(t1).push({ $type: "bpmn:Task", id, name: "" });
    s.commit({ transactionId: "tx-workshop-blocked-1", commands: [surface("task-create", { owner: P0, key, value: "" })], tree: t1, unnamed: [id], add: [occ("page-main", id)] });
    s.exportRefused("activity-name-missing-pre-normalize", [lintEntry("pre-normalize", id, pointerOf(t1, id), "accept")]);
    const t2 = clone(t1); find(t2, id).name = "Prepare invoice";
    s.commit({ transactionId: "tx-workshop-blocked-2", commands: [surface("rename-direct", { target: id, value: "Prepare invoice" })], tree: t2, relabel: [id] });
    s.exportOk({ required: ["Prepare invoice"], covers: [id] });
    seqCase("workshop", 8, "export-blocked-unnamed", s, { doc: docs.basic, clauses: [cite("10.2", 803), cite("6.2", 478), cite("6.2", 481), cite("16", 1144), cite("12.1", 876)],
      defaults: ["prepareExport uses the accept policy (§6.2 L478): the unnamed activity is an error at the first lint stage; harmonization C19 refuses with the code of the first unresolved error entry and B2 reports exactly the entries of the stages run (pre-normalize)."],
      discriminates: "Downloads the draft state with warnings (export barrier bypassed), calls the host with a partial artifact, reports the post-normalize entry or no entry, or blocks the later export of the named state." });
  }
  {
    const s = new Seq(SU);
    const key = "k-workshop-correction", id = stableId(P0, "task", key);
    const t1 = clone(TU); t1.rootElements[0].isExecutable = false; fe(t1).push({ $type: "bpmn:Task", id, name: "Prepare invoice" });
    s.commit({ transactionId: "tx-workshop-correction", commands: [surface("task-create", { owner: P0, key, value: "Prepare invoice" })], tree: t1,
      changes: [completeSet(t1, "Proc_main", "isExecutable", false, "complete-process")], add: [occ("page-main", id)] });
    s.exportOk({ required: ["Prepare invoice"], covers: [id] });
    seqCase("workshop", 9, "correction-final-only", s, { doc: docs.unfixed, clauses: [cite("8.2", 631), cite("8.2", 633), cite("7.1", 543), cite("10.1", 764), cite("10.2", 803), cite("8.1", 606)],
      defaults: ["The staged command triggers a completion write (complete-process sets the absent isExecutable to false): its change entry uses the harmonization B8 vocabulary and B9 coordinates; the single change event and the later download carry only the corrected final state."],
      discriminates: "Emits one onChange for the user command and another for the completion correction, exposes the uncorrected intermediate envelope, omits the correction entry, or downloads the uncorrected state." });
  }
  // ------------------------------------------------------------ fields: commit-time revalidation of a picked reference
  {
    const s = new Seq(S0);
    const anchors = [["Call_1", "bpmn:CallActivity", "Run review"], ["Call_2", "bpmn:CallActivity", "Révision cycle"], ["Call_3", "bpmn:CallActivity", "Draft call"],
      ["Call_4", "bpmn:CallActivity", "[Locked] Archive run"], ["Call_5", "bpmn:CallActivity", "[Hidden] Legacy run"], ["Task_A", "bpmn:Task", "Check order"],
      ["Task_B", "bpmn:UserTask", "Approve order"], ["Task_X", "bpmn:Task", "Standalone check"], ["Task_Y", "bpmn:UserTask", "Standalone approval"]].map(([id, type, label]) => ({ id, type, label }));
    s.query("queryReferences", { baseRevision: R0, targetId: "AidLink_1", fieldId: "target", query: "Standalone", offset: 0, limit: 10 },
      pureOk({ candidates: anchors.filter(c => c.label.includes("Standalone")), revision: R0 }));
    const t1 = fresh(); removeIds(t1, ["Task_X"]);
    const { R: R1 } = s.commit({ transactionId: "tx-fields-invalidate-1", commands: [surface("delete-element", { target: "Task_X" })], tree: t1, remove: ["Task_X"] });
    void R1;
    s.still({ transactionId: "tx-fields-invalidate-2", commands: [fieldCommand("aid-link", "target", { target: "AidLink_1", value: "Task_X" })], code: "reference-dangling" });
    seqCase("fields", 63, "commit-time-invalidation", s, { doc: docs.basic, clauses: [cite("8.3", 657), cite("2.4", 166)],
      defaults: ["A candidate offered at one revision is revalidated at commit (§8.3 L657): after its deletion the submission refuses reference-dangling."],
      discriminates: "Trusts the candidate list of the earlier revision and commits a reference to the deleted Task_X." });
  }
  // ------------------------------------------------------------ twin
  {
    const tree = fresh(); find(tree, "Task_B").name = "";
    ok("twin", 1, "assignable-rule-user-task", { transactionId: "tx-twin-1", commands: [fieldCommand("user-task", "name", { target: "Task_B", value: "" })], tree, phase: "edit",
      opts: { unnamed: ["Task_B"], relabel: ["Task_B"] }, clauses: [cite("2.3", 143), cite("1.1", 32), cite("14.3", 963)],
      discriminates: "A twin whose assignable typeIs degrades to exact matching on plain native JSON omits the UserTask finding; the twins must produce identical envelopes and reports." });
  }
  // ------------------------------------------------------------ gates
  addCase("gates", 1, "panel-dependency-absent", {
    operation: "package.surface", inputArtifacts: [artifact("package-query", {
      manifest: "package.json", fields: ["dependencies", "peerDependencies", "optionalDependencies"],
      entryPoints: [".", "./react", "./browser", "./browser/iife"], packages: ["bpmn-js-properties-panel", "@bpmn-io/properties-panel"] })],
    expectedArtifacts: [artifact("package-surface", { declared: [], importedByEntryPoints: [] })],
    expectedStatus: "ok", comparatorIds: ["lot5/package-surface"], clauses: [cite("8.3", 661), cite("13", 925), cite("16", 1148)],
    defaults: ["OPEN-PANEL stays an owner choice: this gate seals only the DESIGN default (no properties-panel dependency in the published dependency fields, none reachable from the root, React/workshop or browser entry points)."],
    discriminates: "Adds bpmn-js-properties-panel (or its base package) as a runtime/peer dependency or bundles it into the root/static/browser entry points before the owner selects the panel.",
  });
  refused("gates", 2, "external-call-gated", { transactionId: "tx-gates-external", code: "profile-open",
    commands: [surface("external-call-create", { owner: P0, key: "k-gates-external", value: "Partner review" })], phase: "create",
    clauses: [cite("8.3", 651), cite("4.1", 364), cite("13", 910), cite("16", 1140)],
    defaults: ["Harmonization H4: the profile gates its external entry with a refuse step (code profile-open); the refusal precedes C, so report.entries and diagnostics are empty (B2)."],
    discriminates: "Creates a CallActivity (with or without a guessed marker) although external creation is gated by OPEN-EXTERNAL, or refuses with a non-gate code." });
  {
    const tree = clone(TB); find(tree, "Task_b1").name = "Intake review";
    refused("gates", 3, "reserved-n-creation", { snap: SB, doc: docs.banded, transactionId: "tx-gates-reserved", code: "profile-open",
      commands: [surface("rename-direct", { target: "Task_b1", value: "Intake review" })], phase: "edit",
      entries: [lintEntry("pre-normalize", "Task_b2", pointerOf(tree, "Task_b2"))],
      clauses: [cite("7.2", 554), cite("13", 917), cite("16", 1160), cite("8.2", 631)],
      defaults: ["Harmonization H1/H2: applyCommands runs N with activation edit; an N ensure that would create a support (here the Collaboration of a Banded Process) refuses profile-open inside N; the refusal report holds the pre-normalize lint entries run before it (B2), never a change entry."],
      discriminates: "Creates the Collaboration support during an edit although OPEN-RESERVED-N is open, commits the rename without N, or reports the post-normalize entry." });
  }
  {
    const tree = clone(TBB); find(tree, "Task_b1").name = "Intake review";
    ok("gates", 4, "reserved-n-reuse", { snap: SBB, doc: docs.bandedBound, transactionId: "tx-gates-reuse", commands: [surface("rename-direct", { target: "Task_b1", value: "Intake review" })],
      tree, opts: { unnamed: ["Task_b2"], relabel: ["Task_b1"] }, phase: "edit", clauses: [cite("7.2", 552), cite("5.2", 440), cite("5.1", 430)],
      defaults: ["N reuses the correctly bound Collaboration (type, parent and containment property, single binding; harmonization C5): no write, no gate; the bindings stay byte-identical."],
      discriminates: "Refuses profile-open although the support already exists and is bound, re-creates or renames the bound Collaboration, or drops the binding." });
  }
  // ------------------------------------------------------------ demo acceptance scenario (owner demo)
  {
    const s = new Seq(SD, { pageId: "page-demo" });
    const PD = "Proc_demo";
    const task = stableId(PD, "task", "demo-task"), user = stableId(PD, "replace", "demo-replace");
    const flow1 = stableId(PD, "flow", "demo-flow-1"), flow2 = stableId(PD, "flow", "demo-flow-2");
    const store = stableId(PD, "store", "demo-ref"), reference = stableId(PD, "reference", "demo-ref"), link = stableId(PD, "reference-link", "demo-link");
    const states = [clone(TD)];
    const next = edit => { const t = clone(states[states.length - 1]); edit(t); states.push(t); return t; };
    const o = semanticId => ({ pageId: "page-demo", semanticId });
    const g = (n, extra) => ({ ...extra, transactionId: `tx-demo-${String(n).padStart(2, "0")}` });
    const step = (n, gesture, command, edit, opts) => s.commit({ transactionId: `tx-demo-${String(n).padStart(2, "0")}`, commands: [command], tree: next(edit), gesture: g(n, gesture), ...opts });
    step(1, { gesture: "palette-drop", entry: "task-create", pageId: "page-demo", container: PD, point: { x: 400000, y: 210000 }, insertionKey: "demo-task" },
      surface("task-create", { owner: PD, key: "demo-task", value: "" }), t => fe(t).push({ $type: "bpmn:Task", id: task, name: "" }),
      { unnamed: [task], add: [occ("page-demo", task)] });
    step(2, { gesture: "direct-edit", occurrence: o(task), text: "Review request" },
      surface("rename-direct", { target: task, value: "Review request" }), t => { find(t, task).name = "Review request"; }, { relabel: [task] });
    step(3, { gesture: "replace-menu", entry: "to-user-task", occurrence: o(task), insertionKey: "demo-replace" },
      surface("to-user-task", { target: task, key: "demo-replace" }), t => { removeIds(t, [task]); fe(t).push({ $type: "bpmn:UserTask", id: user, name: "Review request" }); },
      { idMap: [{ sourceId: task, resultId: user, domain: "migration" }], remove: [task], add: [occ("page-demo", user)] });
    step(4, { gesture: "connect", pageId: "page-demo", source: o("Start_d"), target: o(user), insertionKey: "demo-flow-1" },
      surface("connect-flow", { owner: PD, source: "Start_d", target: user, key: "demo-flow-1" }), t => fe(t).push({ $type: "bpmn:SequenceFlow", id: flow1, sourceRef: "Start_d", targetRef: user }),
      { add: [occ("page-demo", flow1, ["Start_d", user])] });
    step(5, { gesture: "connect", pageId: "page-demo", source: o(user), target: o("End_d"), insertionKey: "demo-flow-2" },
      surface("connect-flow", { owner: PD, source: user, target: "End_d", key: "demo-flow-2" }), t => fe(t).push({ $type: "bpmn:SequenceFlow", id: flow2, sourceRef: user, targetRef: "End_d" }),
      { add: [occ("page-demo", flow2, [user, "End_d"])] });
    step(6, { gesture: "palette-drop", entry: "reference-create", pageId: "page-demo", container: PD, point: { x: 400000, y: 420000 }, insertionKey: "demo-ref" },
      surface("reference-create", { owner: PD, key: "demo-ref", value: "" }),
      t => { t.rootElements.push({ $type: "bpmn:DataStore", id: store, name: "" }); fe(t).push({ $type: "bpmn:DataStoreReference", id: reference, dataStoreRef: store }); },
      { add: [occ("page-demo", reference)] });
    step(7, { gesture: "field-submit", target: store, notion: "store", field: "title", value: "Request policy" },
      fieldCommand("store", "title", { target: store, value: "Request policy" }), t => { find(t, store).name = "Request policy"; }, { relabel: [reference] });
    step(8, { gesture: "connect", pageId: "page-demo", source: o(reference), target: o(user), insertionKey: "demo-link" },
      surface("connect-reference-link", { owner: PD, source: reference, target: user, key: "demo-link" }),
      t => { t.rootElements[0].artifacts = [{ $type: "bpmn:Association", id: link, associationDirection: "One", sourceRef: reference, targetRef: user }]; },
      { add: [occ("page-demo", link, [reference, user])] });
    step(9, { gesture: "field-submit", occurrence: o(user), notion: "user-task", field: "name", value: "Review and approve request" },
      fieldCommand("user-task", "name", { target: user, value: "Review and approve request" }), t => { find(t, user).name = "Review and approve request"; }, { relabel: [user] });
    s.restore("undo"); s.restore("redo");
    s.exportOk({ required: ["Review and approve request", "Request received", "Request closed"], stale: ["Review request"], covers: [user, "Start_d", "End_d", reference], never: [task] });
    seqCase("demo", 1, "acceptance-script", s, { doc: docs.demo, twin: true,
      clauses: [cite("14.2", 954), cite("8.3", 649), cite("8.3", 651), cite("8.3", 653), cite("8.2", 632), cite("8.2", 641), cite("10.2", 803), cite("2.4", 163)],
      defaults: ["Gesture occurrences may be written {pageId, semanticId}: the harness resolves the unique occurrence of that semantic element on that page (keys of new shapes are layout outputs).",
        "Harmonization D7: the owner demo replaces the task by a user task while it is still unconnected (new allocated ID plus replacement map), then connects the user task; a type-changing replace of a connected task refuses (replace-007).",
        "Twin: the Python headless bridge replays steps 1–11 (gestures as their staged commands); the export step 12 is canvas-only."],
      discriminates: "Any upstream shortcut in the demo path: random IDs, DataInputAssociation for the reference link, an in-place retype keeping the task ID, more than one history entry per gesture, intermediate reports, or a download of a non-final state (the stale name Review request)." });
  }
  void [jcs, PID, P, V0, LV, SV, E0, transaction, PRODUCER_DEFAULT, assertResolved];
}

function T1Renamed() { const t = clone(T0); find(t, "Task_A").name = "Verify order"; return t; }
function noopEmpty() {
  const x = { transactionId: "tx-history-12", commands: [] };
  addCase("history", 12, "empty-batch-noop", {
    operation: "applyCommands", phase: null, inputArtifacts: [pin("snapshot", docs.basic)], commandArtifact: artifact("transaction", transaction(S0, x.transactionId, x.commands)),
    expectedArtifacts: [
      artifact("result", okResult("applyCommands", R0, R0, { envelope: eqIn("/envelope"), semanticRevision: R0, viewRevision: V0, transactionId: x.transactionId, changed: false }, reportFor("applyCommands", { input: R0, output: R0 }))),
      artifact("snapshot", okResult("getSnapshot", R0, R0, eqIn(""), reportFor("getSnapshot", { input: R0, output: R0 }))),
      artifact("events", []), artifact("history", { probe: refusedResult("undo", "operation-error", { base: R0 }), probeEvents: [], rootTransactions: 0 }),
      artifact("twin", { result: okResult("applyCommands", R0, R0, { envelope: eqIn("/envelope"), semanticRevision: R0, viewRevision: unsealed("twin-presentation", "string"), transactionId: x.transactionId, changed: false }, reportFor("applyCommands", { input: R0, output: R0 })),
        events: [], history: { probe: refusedResult("undo", "operation-error", { base: R0 }), probeEvents: [] } }),
    ],
    expectedStatus: "ok", comparatorIds: ["lot5/result", "lot5/snapshot", "lot5/events", "lot5/history", "lot5/twin"], clauses: [cite("8.2", 641), cite("10.1", 735)],
    defaults: ["An empty command list is a no-op (changed:false) that runs no C, N or lint stage (Python binding S5 §4.8 step 4): the report has no entry."],
    discriminates: "Runs C/N on an empty batch (completion writes or lint entries), records a history entry, or emits an event." });
}
