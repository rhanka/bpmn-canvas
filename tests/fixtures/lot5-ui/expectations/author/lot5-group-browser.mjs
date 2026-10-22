// Groups "navigation", "static", "workshop", "theme", "views", "presentation"
// and "lifecycle": canvas-level wiring, read-only paths, final-only downloads,
// theme independence, repeated views, DI-only gestures and lifecycle refusals.
import { addCase, artifact, pin, cite, docs, clone, fixture, stableId, fe, find, removeIds, okCommand, refusedCommand, artifactsOf, transaction, surface,
  fieldCommand, okResult, refusedResult, reportFor, pureOk, pureRefused, unchangedSnapshotResult, snapshotWith, layoutDelta, viewRule, selectionValid, inputRef, ref, eq, eqIn,
  unsealed, downloadOk, downloadRefused, T0, E0, R0, S0, V0, L0, SV, SVdetail, SVreviewA, LV, SDang, PID, D, P, H, CANVAS, COMMAND_IDS, GESTURE_IDS } from "./lot5-kit.mjs";
import { ok, refused, notStaged, SNAPSHOT_LAYOUT } from "./lot5-group-commands.mjs";

const fresh = () => clone(T0);
const indexEntry = p => ({ diagramId: p.pageId, semanticRootId: p.semanticRootId, processId: p.semanticRootId, label: p.name, order: p.order });
const NAV_DEFAULTS = [
  "Navigation request/result (lot-5 format): request {callId, diagramId?}; PureResult payload {resolution:\"open\", diagramId} or {resolution:\"choose\", candidates:[index entries]}; diagramId = Layout/1 pageId; processId = the page's semantic root when it is a Process; refusals are PureResult {status:\"refused\", code, diagnostics:[]}.",
  "Opening a view changes presentation.activePageId only: semanticRevision, viewRevision (§8.1 L612: navigation does not affect the render digest), history and change events are unchanged (no navigation origin exists).",
];
const historyProbe = snap => ({ probe: refusedResult("undo", "operation-error", { base: snap.envelope.semanticRevision }), probeEvents: [], rootTransactions: 0 });
const FORMAT = { formatId: "drawing", themeId: "plain", label: "Drawing" };
const FORMAT_DEFAULT = "Workshop export (lot-5 default): FormatOption {formatId, themeId, label} names exports[].id; PreparedArtifact.format and the report artifact record use exports[].format (drawio). The host download callback receives {format, bytes, digest, capability, report, idMap, semanticRevision, viewRevision, profileIdentity} (§8.1 L621, §10.2 L803).";

export function browser() {
  // ------------------------------------------------------------ navigation
  addCase("navigation", 1, "index", {
    operation: "canvas.navigationIndex", inputArtifacts: [pin("snapshot", docs.views)],
    expectedArtifacts: [artifact("result", pureOk(LV.pages.map(indexEntry))), artifact("snapshot", unchangedSnapshotResult(SV)), artifact("events", [])],
    expectedStatus: "ok", comparatorIds: ["lot5/result", "lot5/snapshot", "lot5/events"], clauses: [cite("8.1", 623), cite("9.1", 667)], defaults: NAV_DEFAULTS,
    discriminates: "Builds the index from diagram names or omits repeated views of the same Process; entries must be exactly {diagramId, semanticRootId, processId?, label, order} in page order.",
  });
  const nav = (nn, slug, doc, snap, request, result, activePageId, discriminates, extra = []) => {
    addCase("navigation", nn, slug, {
      operation: "canvas.navigate", inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("navigation-request", request),
      expectedArtifacts: [artifact("result", result), artifact("snapshot", snapshotWith(snap, { activePageId })), artifact("events", []), artifact("history", historyProbe(snap))],
      expectedStatus: result.status === "ok" ? "ok" : `refused:${result.code}`, comparatorIds: ["lot5/result", ...CANVAS],
      clauses: [cite("8.1", 623), cite("8.1", 612), ...extra], defaults: NAV_DEFAULTS, discriminates,
    });
  };
  const open = diagramId => pureOk({ resolution: "open", diagramId });
  nav(2, "single-view", docs.basic, S0, { callId: "Call_1" }, open("page-review"), "page-review",
    "Navigates by the call name or a section number (legacy resolver) instead of calledElement→Process→view, or changes the semantic/view revision when switching pages.");
  nav(3, "chooser", docs.views, SV, { callId: "Call_1" }, pureOk({ resolution: "choose", candidates: [indexEntry(LV.pages[2]), indexEntry(LV.pages[3])] }), "page-main",
    "Opens the first diagram found (or the lowest diagram ID page-review-a) instead of offering a chooser ordered by view order (Review B, order 2, before Review A, order 3).");
  nav(4, "current-view-preferred", docs.viewsReviewA, SVreviewA, { callId: "Call_1" }, open("page-review-a"), "page-review-a",
    "Ignores that the current view already displays the target and opens page-review-b (lower order) or offers a chooser.");
  nav(5, "explicit-diagram", docs.views, SV, { callId: "Call_1", diagramId: "page-review-a" }, open("page-review-a"), "page-review-a",
    "Ignores the caller-supplied diagram ID and opens page-review-b (first in view order).");
  nav(6, "view-missing-no-name-fallback", docs.basic, S0, { callId: "Call_2" }, pureRefused("navigation-view-missing"), "page-main",
    "Falls back to the page whose name equals the call name (\"Révision cycle\") although calledElement is ProcArchive, which has no view.");
  nav(7, "incomplete-call", docs.basic, S0, { callId: "Call_3" }, pureRefused("call-target-required"), "page-main",
    "Resolves an absent calledElement by name or opens the first page; an absent target has no Process to resolve.", [cite("4.1", 379)]);
  nav(8, "explicit-diagram-not-a-view", docs.views, SV, { callId: "Call_1", diagramId: "page-detail" }, pureRefused("navigation-view-missing"), "page-main",
    "Opens a caller-supplied diagram that displays another Process (page-detail shows Proc_main) because the explicit ID is not validated against the called Process.");
  nav(9, "missing-process", docs.dangling, SDang, { callId: "Call_d" }, pureRefused("reference-dangling"), "page-dangling",
    "Answers navigation-view-missing (or offers view creation) for a calledElement that names no Process; DESIGN distinguishes a missing Process (reference-dangling).");

  // ------------------------------------------------------------ static / read-only
  const PREVIEW = { inputKind: "native", envelope: "input snapshot envelope", compiledProfile: "fixtures/ui-neutral-profile.json", descriptorContext: "fixtures/ui-neutral-descriptors.json" };
  addCase("static", 1, "preview-surface", {
    operation: "viewer.static", inputArtifacts: [pin("snapshot", docs.basic), artifact("preview-props", PREVIEW)],
    expectedArtifacts: [artifact("static-surface", { mutationOperations: [], changeCallbacks: [], palette: "absent", contextPad: "absent",
      gestures: { "keyboard-delete": "no-staged-command", "keyboard-paste": "no-staged-command", "direct-edit": "no-staged-command", "drag-move": "no-staged-command" }, sourceEnvelopeUnchanged: true })],
    expectedStatus: "ok", comparatorIds: ["lot5/static-surface"], clauses: [cite("12.1", 876), cite("8.1", 619)],
    defaults: ["mutationOperations lists the exposed mutating methods among applyCommands, undo, redo, restoreSnapshot, activateBusinessProfile and setDefinitions (none on the read-only preview); changeCallbacks lists the accepted onChange/onExportResult callbacks (none)."],
    discriminates: "Mounts a full modeler for the preview (palette/context pad, keyboard edits commit), or accepts onChange/onExportResult on the read-only preview.",
  });
  {
    const env = D.envelope(D.unfixedTree());
    const file = fixture("fixtures/documents/unfixed.envelope.json", env);
    addCase("static", 2, "no-normalize", {
      operation: "viewer.static", inputArtifacts: [pin("envelope", file)],
      expectedArtifacts: [artifact("static-surface", { previewEnvelope: env, completionRun: false, normalizationRun: false, sourceEnvelopeUnchanged: true })],
      expectedStatus: "ok", comparatorIds: ["lot5/static-surface"], clauses: [cite("8.1", 619), cite("3.3", 296)],
      discriminates: "Runs C on load in the static view (adding isExecutable:false) or otherwise normalizes the source state of a read-only preview.",
    });
  }
  addCase("static", 3, "multi-page", {
    operation: "viewer.static", inputArtifacts: [pin("snapshot", docs.views)],
    expectedArtifacts: [artifact("static-surface", { renderedPages: LV.pages.map(p => ({ pageId: p.pageId, name: p.name, order: p.order, semanticRootId: p.semanticRootId })) })],
    expectedStatus: "ok", comparatorIds: ["lot5/static-surface"], clauses: [cite("8.1", 621), cite("9.1", 667), cite("8.1", 610)],
    discriminates: "Renders only the first diagram, renders pages by pageId instead of order, or merges repeated views of one Process into a single page.",
  });
  {
    const file = fixture("fixtures/documents/standalone.native.json", T0);
    addCase("static", 4, "metadata-missing-preview", {
      operation: "viewer.importPreview", inputArtifacts: [pin("native-json", file)],
      commandArtifact: artifact("transaction", { baseRevision: "none", expectedViewRevision: "none", transactionId: "tx-static-preview", commands: [surface("task-create", { owner: "Proc_main", key: "k-static-preview", value: "" })] }),
      expectedArtifacts: [
        artifact("result", refusedResult("applyCommands", "profile-metadata-missing")),
        artifact("static-surface", { mode: "generic-read-only", tree: "equals input native JSON", activated: false, surfaces: { palette: [], paste: [] }, committed: false, events: [] }),
      ],
      expectedStatus: "refused:profile-metadata-missing", comparatorIds: ["lot5/result", "lot5/static-surface"], clauses: [cite("3.3", 303), cite("8.1", 619), cite("5.2", 442), cite("10.1", 735)],
      defaults: ["A mutation attempted on a generic read-only import preview (no profile metadata) is refused with the compatibility code that keeps it read-only (profile-metadata-missing); no envelope exists, so profileIdentity, baseRevision and the report identity/revision members are omitted (harmonization B3, DESIGN L735)."],
      discriminates: "Activates the standalone tree under the injected profile by guessing, or lets the preview accept edits.",
    });
  }
  {
    const env = clone(E0); env.profileIdentity.sha256 = "ab".repeat(32);
    env.semanticRevision = H({ tree: env.tree, profileIdentity: env.profileIdentity, bindings: [] });
    const file = fixture("fixtures/documents/digest-mismatch.envelope.json", env);
    addCase("static", 5, "digest-mismatch", {
      operation: "setDefinitions", inputArtifacts: [pin("envelope", file)], commandArtifact: artifact("load-request", { mode: "draft" }),
      expectedArtifacts: [
        artifact("result", refusedResult("setDefinitions", "profile-digest-mismatch", { base: env.semanticRevision, identity: env.profileIdentity })),
        artifact("follow-up", refusedResult("getDefinitions", "document-not-loaded")),
        artifact("events", []),
      ],
      expectedStatus: "refused:profile-digest-mismatch", comparatorIds: ["lot5/result", "lot5/follow-up", "lot5/events"], clauses: [cite("3.3", 314), cite("3.3", 296), cite("8.1", 604), cite("10.1", 737)],
      defaults: ["Harmonization B3: a refused load echoes the identity and semanticRevision of a shape-valid documentVersion \"1\" argument envelope; the getter afterwards refuses document-not-loaded without echo (L737)."],
      discriminates: "Accepts the same profile ID/version with a different digest (token-only difference), migrates it silently, commits a partial model before refusing, or echoes the compiled profile's identity instead of the argument's.",
    });
  }
  {
    const x = refusedCommand(S0, "operation-error");
    const t = transaction(S0, "tx-static-readonly", [surface("rename-direct", { target: "Task_A", value: "Verify order" })]);
    addCase("static", 6, "read-only-canvas-mutation", {
      operation: "applyCommands", phase: "edit", inputArtifacts: [pin("snapshot", docs.basic), artifact("canvas-options", { readOnly: true })], commandArtifact: artifact("transaction", t),
      expectedArtifacts: artifactsOf(x, { twin: false }), expectedStatus: "refused:operation-error", comparatorIds: ["lot5/result", ...CANVAS],
      clauses: [cite("8.1", 619), cite("8.2", 629), cite("8.2", 633)],
      defaults: ["A mutation on a canvas in read-only mode (§8.1 L619) is rejected before staging (§8.2 L629) with operation-error, the code harmonization C10/C11 gives to requests refused before staging; the loaded identity is echoed (harmonization B3)."],
      discriminates: "Applies the edit (read-only only hides the palette), normalizes the source state, or emits an onChange for the rejected mutation.",
    });
  }

  // ------------------------------------------------------------ workshop wiring and downloads
  addCase("workshop", 1, "get-definitions", {
    operation: "getDefinitions", inputArtifacts: [pin("snapshot", docs.basic)],
    expectedArtifacts: [artifact("result", okResult("getDefinitions", R0, R0, E0, reportFor("getDefinitions", { input: R0, output: R0 }))), artifact("snapshot", unchangedSnapshotResult(S0)), artifact("events", [])],
    expectedStatus: "ok", comparatorIds: ["lot5/result", "lot5/snapshot", "lot5/events"], clauses: [cite("12.1", 876), cite("10.1", 737)],
    discriminates: "Returns legacy XML or a bare envelope instead of Result<DocumentEnvelope>, or a revision different from the loaded one.",
  });
  addCase("workshop", 2, "input-conflict", {
    operation: "setDefinitions", inputArtifacts: [pin("snapshot", docs.basic), artifact("load-request", { envelope: "input snapshot envelope", xml: "<definitions xmlns=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" id=\"Defs_ui\"/>", mode: "draft" })],
    expectedArtifacts: [artifact("result", refusedResult("setDefinitions", "input-conflict")), artifact("follow-up", refusedResult("getDefinitions", "document-not-loaded")), artifact("events", [])],
    expectedStatus: "refused:input-conflict", comparatorIds: ["lot5/result", "lot5/follow-up", "lot5/events"], clauses: [cite("8.1", 619), cite("10.1", 735)],
    defaults: ["The load is refused as an invocation before either input is admitted, so no input identity is echoed (L735: missing pre-load identity is omitted); the canvas holds no document afterwards."],
    discriminates: "Lets one input win (XML or native) when both are supplied for one load.",
  });
  const download = (nn, slug, { request, expected, status, extraClauses = [], discriminates }) => addCase("workshop", nn, slug, {
    operation: "workshop.export", inputArtifacts: [pin("snapshot", docs.basic), artifact("format-option", request)],
    expectedArtifacts: [artifact("download", expected), artifact("snapshot", unchangedSnapshotResult(S0)), artifact("events", [])],
    expectedStatus: status, comparatorIds: ["lot5/download", "lot5/snapshot", "lot5/events"],
    clauses: [cite("10.2", 803), cite("12.1", 876), cite("8.1", 621), ...extraClauses], defaults: [FORMAT_DEFAULT], discriminates,
    unsealed: status === "ok" ? ["prepared IR geometry, renderBinding layout/payload digests, occurrence keys, counter assignment and serialized bytes (export-adapter)."] : undefined,
  });
  download(3, "export-success", { request: FORMAT, status: "ok",
    expected: downloadOk(ref("download"), { R: R0, tree: T0, required: ["Check order", "Approve order"], covers: ["Start_1", "Task_A", "Task_B", "End_1"] }),
    extraClauses: [cite("10.1", 737), cite("10.1", 753), cite("9.2", 690)],
    discriminates: "Uses the legacy byte-or-throw export callback, calls the host twice or with an intermediate (pre-release or pre-layout) artifact, drops the report/idMap from the download context, reports a digest that is not the SHA-256 of the bytes, or mutates the document while exporting." });
  download(4, "export-unknown-format", { request: { ...FORMAT, formatId: "unknown-format" }, status: "refused:export-format-unsupported",
    expected: downloadRefused("export-format-unsupported", { R: R0 }), extraClauses: [cite("10.2", 780)],
    discriminates: "Calls the download callback with an empty or partial artifact, throws instead of returning the refusal, runs the pipeline before validating the format (harmonization C18), or falls back to another format." });
  addCase("workshop", 5, "preview-tool", {
    operation: "workshop.preview", inputArtifacts: [pin("snapshot", docs.views), artifact("preview-props", PREVIEW)],
    expectedArtifacts: [artifact("static-surface", { renderedPages: LV.pages.map(p => ({ pageId: p.pageId, name: p.name, order: p.order, semanticRootId: p.semanticRootId })), callbacks: [] })],
    expectedStatus: "ok", comparatorIds: ["lot5/static-surface"], clauses: [cite("12.1", 876)],
    discriminates: "Routes the native preview through the legacy XML overload (serialize/reparse) or invokes host callbacks from the read-only preview.",
  });
  {
    const key = "k-workshop-drop", id = stableId("Proc_main", "task", key);
    const tree = fresh(); fe(tree).push({ $type: "bpmn:Task", id, name: "" });
    const commands = [surface("task-create", { owner: "Proc_main", key, value: "" })];
    const x = okCommand(S0, transaction(S0, "tx-workshop-drop", commands), tree, { unnamed: [id], add: [{ pageId: "page-main", semanticId: id, role: "content" }], selection: selectionValid(SNAPSHOT_LAYOUT), gesture: true });
    addCase("workshop", 6, "onchange-final-only", {
      operation: "workshop.gesture", phase: "create", inputArtifacts: [pin("snapshot", docs.basic)],
      commandArtifact: artifact("gesture", { gesture: "palette-drop", entry: "task-create", pageId: "page-main", container: "Proc_main", point: { x: 640000, y: 600000 }, insertionKey: key, transactionId: "tx-workshop-drop" }),
      expectedArtifacts: [...artifactsOf(x, { staged: { transactionId: "tx-workshop-drop", commands }, gesture: true }),
        artifact("host-callbacks", { onChange: [eq("events", "/0")], autosave: 0 })],
      expectedStatus: "ok", comparatorIds: ["lot5/host-callbacks", ...GESTURE_IDS], clauses: [cite("8.2", 633), cite("8.1", 606), cite("8.1", 619), cite("8.1", 621)],
      discriminates: "Forwards raw bpmn-js commandStack.changed notifications (several per gesture) to the host onChange, or saves to the backend automatically.",
    });
  }

  // ------------------------------------------------------------ theme
  {
    const V0c = D.viewRevision(R0, L0, "contrast");
    const rep = reportFor("setTheme", { input: R0, output: R0 });
    addCase("theme", 1, "switch-view-only", {
      operation: "setTheme", inputArtifacts: [pin("snapshot", docs.basic)], commandArtifact: artifact("theme-request", { themeId: "contrast" }),
      expectedArtifacts: [
        artifact("result", okResult("setTheme", R0, R0, { viewRevision: V0c }, rep)),
        artifact("snapshot", snapshotWith(S0, { themeId: "contrast", viewRevision: V0c })),
        artifact("events", [{ envelope: eqIn("/envelope"), semanticRevision: R0, viewRevision: V0c, transactionId: unsealed("event-transaction", "string"), origin: "theme", report: eq("result", "/report") }]),
        artifact("history", historyProbe(S0)),
      ],
      expectedStatus: "ok", comparatorIds: ["lot5/result", ...CANVAS], clauses: [cite("3.1", 264), cite("9.2", 690), cite("9.2", 694), cite("8.2", 643), cite("13", 928), cite("8.1", 606)],
      discriminates: "Replays native history or records an undo entry for the theme switch, changes profileIdentity/semanticRevision, or recomputes theme-specific geometry (geometry: shared).",
    });
  }

  // ------------------------------------------------------------ repeated views
  {
    addCase("views", 1, "select-repeated-occurrence", {
      operation: "canvas.select", inputArtifacts: [pin("snapshot", docs.views)],
      commandArtifact: artifact("selection-request", { activatePage: "page-detail", select: [{ pageId: "page-detail", occurrenceKey: "occ:Task_A" }] }),
      expectedArtifacts: [artifact("snapshot", snapshotWith(SV, { activePageId: "page-detail", selection: [{ pageId: "page-detail", occurrenceKey: "occ:Task_A" }] })), artifact("events", []), artifact("history", historyProbe(SV))],
      expectedStatus: "ok", comparatorIds: CANVAS, clauses: [cite("8.1", 610), cite("8.1", 612)],
      discriminates: "Stores the selection by semantic ID (selecting both repeated occurrences, or the page-main one), or changes the view revision on selection.",
    });
  }
  {
    const tree = fresh(); find(tree, "Task_A").name = "Verify order";
    ok("views", 2, "rename-shared-element", { snap: SVdetail, doc: docs.viewsDetail, transactionId: "tx-views-rename", commands: [fieldCommand("task", "name", { target: "Task_A", value: "Verify order" })],
      tree, phase: "edit", opts: { relabel: ["Task_A"] }, clauses: [cite("8.2", 643), cite("8.1", 610), cite("9.1", 673)],
      defaults: ["Selection after an in-place edit (lot-5 default): kept exactly."],
      discriminates: "Updates only the selected page's occurrence, loses the page-detail selection, or creates one history entry per page." });
  }
  {
    const tree = fresh(); removeIds(tree, ["Flow_2"]);
    ok("views", 3, "delete-shared-edge", { snap: SV, doc: docs.views, transactionId: "tx-views-delete", commands: [surface("delete-element", { target: "Flow_2" })],
      tree, phase: "edit", opts: { remove: ["Flow_2"] }, clauses: [cite("8.2", 643), cite("9.1", 673)],
      discriminates: "Removes the edge occurrence from the active page only, leaving a stale occurrence of a deleted semantic element on page-detail." });
  }
  {
    const key = "k-views-detail", id = stableId("Proc_main", "task", key);
    const tree = fresh(); fe(tree).push({ $type: "bpmn:Task", id, name: "" });
    const commands = [surface("task-create", { owner: "Proc_main", key, value: "" })];
    const x = okCommand(SVdetail, transaction(SVdetail, "tx-views-detail", commands), tree, { unnamed: [id], add: [{ pageId: "page-detail", semanticId: id, role: "content" }], selection: selectionValid(SNAPSHOT_LAYOUT), gesture: true });
    addCase("views", 4, "palette-on-repeated-view", {
      operation: "canvas.gesture", phase: "create", inputArtifacts: [pin("snapshot", docs.viewsDetail)],
      commandArtifact: artifact("gesture", { gesture: "palette-drop", entry: "task-create", pageId: "page-detail", container: "Proc_main", point: { x: 500000, y: 300000 }, insertionKey: key, transactionId: "tx-views-detail" }),
      expectedArtifacts: artifactsOf(x, { staged: { transactionId: "tx-views-detail", commands }, gesture: true }),
      expectedStatus: "ok", comparatorIds: GESTURE_IDS, clauses: [cite("8.1", 610), cite("8.2", 643), cite("9.1", 667), cite("8.2", 637)],
      defaults: ["A created element receives exactly one occurrence, on the page of the gesture (the active page displaying its owner); other repeated views of the same Process stay byte-identical."],
      discriminates: "Places the new shape on page-main (first view of the Process), on every view of the Process, or derives the owner from the page name instead of the page semantic root.",
    });
  }
  refused("views", 5, "multi-page-rollback", { snap: SV, doc: docs.views, transactionId: "tx-views-rollback", code: "reference-dangling",
    commands: [surface("delete-element", { target: "Flow_2" }), surface("delete-element", { target: "Task_A" })], phase: "edit",
    clauses: [cite("8.2", 643), cite("2.4", 172), cite("8.2", 639)],
    discriminates: "Rolls back the refused batch on the active page only, leaving Flow_2 removed from page-detail, or commits the first deletion." });

  // ------------------------------------------------------------ DI-only gestures (OPEN-HOOK contract, sealed against its DESIGN default)
  const DI_DEFAULT = "A DI-only gesture commits one presentation transaction (§3.1 L268: only viewRevision changes; §8.2 L630: semanticRevision equality never skips a drag): one root profile.transaction, one change event with origin command, the unchanged envelope and its draft report, and undo restoring the input snapshot exactly. Its staged intent has no DESIGN command record (UNSEALED gesture-intent, not compared).";
  const diGesture = (nn, slug, { gesture: g, modify, clauses, discriminates, defaults = [] }) => {
    const pres = (layout, selection) => ({ layout, themeId: "plain", overrides: clone(D.EMPTY_OVERRIDES), diStyles: clone(D.EMPTY_STYLES),
      importedDi: eqIn("/presentation/importedDi"), selection, activePageId: "page-main" });
    const payload = { snapshotVersion: "1", envelope: eqIn("/envelope"), presentation: pres(layoutDelta({ base: inputRef("snapshot", "/presentation/layout"), modify }), selectionValid(SNAPSHOT_LAYOUT)),
      viewRevision: viewRule(R0, "plain", SNAPSHOT_LAYOUT) };
    const rep = reportFor("applyCommands", { input: R0, output: R0 });
    const undoRep = reportFor("undo", { input: R0, output: R0 }), redoRep = reportFor("redo", { input: R0, output: R0 });
    const undoPayload = { snapshotVersion: "1", envelope: eqIn("/envelope"), presentation: pres(eqIn("/presentation/layout"), selectionValid(ref("history", "/undo/result/payload/presentation/layout"))), viewRevision: V0 };
    const redoPayload = { snapshotVersion: "1", envelope: eqIn("/envelope"), presentation: pres(eq("snapshot", "/payload/presentation/layout"), selectionValid(ref("history", "/redo/result/payload/presentation/layout"))),
      viewRevision: eq("snapshot", "/payload/viewRevision") };
    addCase("presentation", nn, slug, {
      operation: "canvas.gesture", phase: null, inputArtifacts: [pin("snapshot", docs.basic)], commandArtifact: artifact("gesture", g),
      expectedArtifacts: [
        artifact("snapshot", okResult("getSnapshot", R0, R0, payload, reportFor("getSnapshot", { input: R0, output: R0 }))),
        artifact("events", [{ envelope: eqIn("/envelope"), semanticRevision: R0, viewRevision: eq("snapshot", "/payload/viewRevision"), transactionId: g.transactionId, origin: "command", report: rep }]),
        artifact("history", {
          undo: { result: okResult("undo", R0, R0, undoPayload, undoRep), events: [{ envelope: eqIn("/envelope"), semanticRevision: R0, viewRevision: V0, transactionId: g.transactionId, origin: "undo", report: eq("history", "/undo/result/report") }] },
          redo: { result: okResult("redo", R0, R0, redoPayload, redoRep), events: [{ envelope: eqIn("/envelope"), semanticRevision: R0, viewRevision: eq("snapshot", "/payload/viewRevision"), transactionId: g.transactionId, origin: "redo", report: eq("history", "/redo/result/report") }] },
          rootTransactions: 1,
        }),
      ],
      expectedStatus: "ok", comparatorIds: CANVAS, clauses: [cite("8.2", 637), cite("8.2", 630), cite("3.1", 268), cite("8.2", 641), cite("8.2", 639), ...clauses],
      defaults: [DI_DEFAULT, ...defaults], discriminates,
    });
  };
  const at = id => L0.geometry.find(g => g.semanticId === id);
  diGesture(1, "drag-move-di-only", {
    gesture: { gesture: "drag", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_X" }, delta: { x: 40000, y: 0 }, transactionId: "tx-presentation-drag" },
    modify: [{ pageId: "page-main", occurrenceKey: "occ:Task_X", set: { bounds: { ...at("Task_X").bounds, x: at("Task_X").bounds.x + 40000 } } }],
    clauses: [], defaults: ["The drag delta is grid-aligned (10 px at zoom 1) and the shape unconnected, so the final bounds are exactly the input bounds plus the delta."],
    discriminates: "Skips the DI-only drag because semanticRevision is unchanged, records no history entry, moves other shapes, or writes a semantic change." });
  diGesture(2, "resize-di-only", {
    gesture: { gesture: "resize", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_X" }, edge: "east", delta: { x: 40000, y: 0 }, transactionId: "tx-presentation-resize" },
    modify: [{ pageId: "page-main", occurrenceKey: "occ:Task_X", set: { bounds: { ...at("Task_X").bounds, width: at("Task_X").bounds.width + 40000 } } }],
    clauses: [], defaults: ["The east-edge delta is grid-aligned, so the final width is exactly the input width plus the delta."],
    discriminates: "Treats the resize as a no-op (no history entry), changes the semantic tree, or rescales other occurrences." });
  diGesture(3, "label-move-di-only", {
    gesture: { gesture: "label-move", occurrence: { pageId: "page-main", occurrenceKey: "occ:Start_1" }, delta: { x: 0, y: 20000 }, transactionId: "tx-presentation-label" },
    modify: [{ pageId: "page-main", occurrenceKey: "occ:Start_1", set: { label: { ...at("Start_1").label, bounds: { ...at("Start_1").label.bounds, y: at("Start_1").label.bounds.y + 20000 } } } }],
    clauses: [], defaults: ["The label delta is grid-aligned; only the label bounds move, the event shape and Flow_1 stay byte-identical."],
    discriminates: "Moves the event shape with its label, re-routes Flow_1, or drops the label move because no semantic field changed." });
  diGesture(4, "bendpoint-di-only", {
    gesture: { gesture: "bendpoint-add", occurrence: { pageId: "page-main", occurrenceKey: "occ:Flow_2" }, point: { x: 330000, y: 300000 }, transactionId: "tx-presentation-bendpoint" },
    modify: [{ pageId: "page-main", occurrenceKey: "occ:Flow_2", unsealed: ["bounds", "waypoints"], changed: ["waypoints"], minWaypoints: 3 }],
    clauses: [], defaults: ["The new route is adapter output (UNSEALED edge-routing): Flow_2 keeps its key, role and both endpoints, gains at least one waypoint, and every other occurrence stays byte-identical."],
    discriminates: "Commits the bendpoint through upstream modeling as a second history entry, re-routes other edges, or drops the change because the semantic tree is unchanged." });
  notStaged("presentation", 5, "reconnect-disabled", { phase: "reference",
    gesture: { gesture: "reconnect", connection: { pageId: "page-main", occurrenceKey: "occ:Flow_3" }, end: "target", to: { pageId: "page-main", occurrenceKey: "occ:Task_X" }, transactionId: "tx-presentation-reconnect" },
    outcome: { staged: false, reconnectAllowed: false }, clauses: [cite("8.2", 635), cite("8.2", 637)],
    defaults: ["The fixture profile declares no reconnect entry: the unadapted upstream reconnect is disabled in business-profile mode (§8.2 L635); the drag offers no drop target and stages nothing."],
    discriminates: "Lets upstream bpmn-js reconnect Flow_3 to Task_X directly (a semantic change outside the profile adapter)." });
  notStaged("presentation", 6, "drag-cancelled", { phase: null,
    gesture: { gesture: "drag", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_X" }, delta: { x: 40000, y: 0 }, cancel: "escape-before-drop", transactionId: "tx-presentation-cancel" },
    outcome: { staged: false, cancelled: true }, clauses: [cite("8.2", 637), cite("8.2", 633), cite("8.2", 639)],
    discriminates: "Commits the preview geometry of a cancelled drag, records a history entry, or emits an onChange." });

  // ------------------------------------------------------------ lifecycle
  const notLoaded = op => refusedResult(op, "document-not-loaded");
  addCase("lifecycle", 1, "not-loaded", {
    operation: "canvas.sequence", inputArtifacts: [artifact("canvas-setup", { descriptorContext: "fixtures/ui-neutral-descriptors.json", document: "none" })],
    commandArtifact: artifact("sequence", { sequenceVersion: "1", steps: [{ step: 1, action: "getDefinitions" }, { step: 2, action: "getSnapshot" },
      { step: 3, action: "applyCommands", request: { baseRevision: R0, expectedViewRevision: V0, transactionId: "tx-lifecycle-1", commands: [surface("task-create", { owner: "Proc_main", key: "k-lifecycle-1", value: "" })] } }] }),
    expectedArtifacts: [artifact("sequence", [{ result: notLoaded("getDefinitions"), events: [] }, { result: notLoaded("getSnapshot"), events: [] }, { result: notLoaded("applyCommands"), events: [] }])],
    expectedStatus: "ok", comparatorIds: ["lot5/sequence"], clauses: [cite("10.1", 737), cite("10.1", 735), cite("8.1", 604)],
    defaults: ["Before an envelope exists, getters and commands refuse document-not-loaded without echoed identity or revision; the report omits sourceIdentity and inputRevision (harmonization B3, B4)."],
    discriminates: "Fabricates an empty document or the profile's identity for the not-loaded state, or throws instead of returning the refusal union.",
  });
  const disposed = op => refusedResult(op, "canvas-disposed");
  addCase("lifecycle", 2, "dispose", {
    operation: "canvas.sequence", inputArtifacts: [pin("snapshot", docs.basic)],
    commandArtifact: artifact("sequence", { sequenceVersion: "1", steps: [{ step: 1, action: "dispose" }, { step: 2, action: "getDefinitions" },
      { step: 3, action: "applyCommands", request: { baseRevision: R0, expectedViewRevision: V0, transactionId: "tx-lifecycle-2", commands: [surface("task-create", { owner: "Proc_main", key: "k-lifecycle-2", value: "" })] } },
      { step: 4, action: "undo", request: { expectedRevision: R0, expectedViewRevision: V0 } }, { step: 5, action: "dispose" }] }),
    expectedArtifacts: [artifact("sequence", [
      { result: pureOk({ disposed: true }), events: [] }, { result: disposed("getDefinitions"), events: [] }, { result: disposed("applyCommands"), events: [] },
      { result: disposed("undo"), events: [] }, { result: pureRefused("canvas-disposed"), events: [] },
    ])],
    expectedStatus: "ok", comparatorIds: ["lot5/sequence"], clauses: [cite("8.1", 599), cite("8.1", 604), cite("8.1", 606)],
    defaults: ["After dispose every call refuses canvas-disposed without echoed identity or revision (the disposed canvas holds no document; aligned with the Python binding); a second dispose is a PureResult refusal."],
    discriminates: "Keeps answering getters from the disposed model, rejects the Promise, or lets a late command commit after disposal.",
  });
  {
    const variantDescriptor = { ...clone(P.descriptorDocument), version: "lot5-2-variant" };
    const descFile = fixture("fixtures/variants/descriptor-variant.descriptors.json", variantDescriptor);
    const variantProfile = clone(P.profile); variantProfile.version = "1.1.1";
    variantProfile.descriptors = [{ id: variantDescriptor.id, version: variantDescriptor.version, sha256: descFile.sha256 }];
    const profileFile = fixture("fixtures/variants/descriptor-variant.profile.json", variantProfile, { compact: true });
    addCase("lifecycle", 3, "activation-descriptor-mismatch", {
      operation: "activateBusinessProfile",
      inputArtifacts: [pin("snapshot", docs.basic), pin("variant-profile", profileFile), pin("variant-descriptors", descFile)],
      expectedArtifacts: [artifact("result", refusedResult("activateBusinessProfile", "descriptor-mismatch", { base: R0 })), artifact("snapshot", unchangedSnapshotResult(S0)), artifact("events", [])],
      expectedStatus: "refused:descriptor-mismatch", comparatorIds: ["lot5/result", "lot5/snapshot", "lot5/events"], clauses: [cite("8.1", 617), cite("8.1", 615), cite("10.1", 735)],
      defaults: ["Setup per harness convention 1 (main profile, basic snapshot); the variant profile, compiled with its own descriptor package, pins a different descriptor version and digest than the canvas descriptor context, so activation refuses before any identity comparison and echoes the loaded identity (harmonization B3)."],
      discriminates: "Activates a compiled profile whose descriptor pins differ from the canvas descriptor context, reinterprets the canvas context with the variant descriptors, or replaces the loaded document.",
    });
  }
  void [P, PID, COMMAND_IDS, unsealed];
}
