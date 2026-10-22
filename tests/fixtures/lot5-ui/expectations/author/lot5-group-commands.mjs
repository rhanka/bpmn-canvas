// Groups "palette", "context", "connect", "replace" and "delete": programmatic
// transactions, equivalent gestures and command-record refusals. Every
// expected tree is an explicit edit; every Result/Report is complete.
import {
  addCase, artifact, pin, cite, docs, clone, stableId, fe, art, io, find, removeIds, okCommand, noopCommand, refusedCommand, artifactsOf,
  surface, upstream, transaction, selectionValid, ref, unsealed, T0, S0, S0c, S1set, T1set, COMMAND_IDS, GESTURE_IDS, GESTURE_REFUSED_IDS,
  CANVAS,
} from "./lot5-kit.mjs";

const node = ($type, id, fields = {}) => ({ $type, id, ...fields });
const ALLOC = [cite("3.2", 276), cite("3.2", 278, 282)];
const COMMIT = [cite("8.2", 632), cite("8.2", 633), cite("8.2", 641), cite("8.1", 606), cite("10.1", 735), cite("10.1", 739), cite("9.2", 690)];
export const SNAPSHOT_LAYOUT = ref("snapshot", "/payload/presentation/layout");
const occ = (pageId, semanticId, edge) => ({ pageId, semanticId, role: "content", ...(edge ? { edge: { source: edge[0], target: edge[1] } } : {}) });
const auto = ["DESIGN fixes no geometry for an occurrence created by a command or gesture: its occurrence key, bounds, waypoints and label are UNSEALED (auto-layout); its page, semantic element, role and edge endpoints are exact, and every other occurrence must stay byte-identical (§8.2 L630–L632: the delta contains only the transaction's changes; the fixture profile declares no place action, region or synthetic occurrence)."];

/** Clauses implied by the sealed artifacts of a committed case. */
function implied(x) {
  const out = [...COMMIT];
  if (x.report.entries.length > 1) out.push(cite("10.1", 751));
  if (x.report.entries.some(e => e.ruleId.startsWith("activity-named"))) out.push(cite("6.2", 474), cite("6.4", 515));
  if (Array.isArray(x.report.idMap) && x.report.idMap.length) out.push(cite("10.1", 753));
  return out;
}
/** Programmatic committed command case. */
export function ok(group, nn, slug, { snap = S0, doc = docs.basic, transactionId, commands, tree, opts = {}, clauses, discriminates, defaults, phase, unsealedNotes }) {
  const t = transaction(snap, transactionId, commands);
  const x = okCommand(snap, t, tree, opts);
  addCase(group, nn, slug, {
    operation: "applyCommands", phase, inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("transaction", t),
    expectedArtifacts: artifactsOf(x), expectedStatus: "ok", comparatorIds: COMMAND_IDS,
    clauses: [...clauses, ...implied(x)], discriminates, defaults: [...(opts.add?.length ? auto : []), ...(defaults ?? [])], unsealed: unsealedNotes,
  });
  return { t, x };
}
/** Programmatic no-op case: recipe `when` false or no difference. */
export function noop(group, nn, slug, { snap = S0, doc = docs.basic, transactionId, commands, clauses, discriminates, defaults, phase }) {
  const t = transaction(snap, transactionId, commands);
  const x = noopCommand(snap, t);
  addCase(group, nn, slug, {
    operation: "applyCommands", phase, inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("transaction", t),
    expectedArtifacts: artifactsOf(x), expectedStatus: "ok", comparatorIds: COMMAND_IDS,
    clauses: [...clauses, cite("8.2", 641), cite("10.1", 735), cite("10.1", 739)], discriminates, defaults,
  });
}
/** Gesture case whose staged command must equal a programmatic transaction. */
export function gesture(group, nn, slug, { snap = S0, doc = docs.basic, gesture: g, commands, tree, opts = {}, clauses, discriminates, defaults, phase }) {
  const t = transaction(snap, g.transactionId, commands);
  const x = okCommand(snap, t, tree, { selection: selectionValid(SNAPSHOT_LAYOUT), ...opts, gesture: true });
  addCase(group, nn, slug, {
    operation: "canvas.gesture", phase, inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("gesture", g),
    expectedArtifacts: artifactsOf(x, { staged: { transactionId: g.transactionId, commands }, gesture: true }), expectedStatus: "ok", comparatorIds: GESTURE_IDS,
    clauses: [...clauses, cite("8.2", 637), ...implied(x)], discriminates, defaults: [...(opts.add?.length ? auto : []), ...(defaults ?? [])],
  });
}
/** Refused programmatic transaction: complete refusal record, nothing committed. */
export function refused(group, nn, slug, { snap = S0, doc = docs.basic, transactionId, commands, code, entries = [], clauses, discriminates, defaults, phase, request = {} }) {
  const t = transaction(snap, transactionId, commands, request);
  const x = refusedCommand(snap, code, { entries });
  addCase(group, nn, slug, {
    operation: "applyCommands", phase, inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("transaction", t),
    expectedArtifacts: artifactsOf(x), expectedStatus: `refused:${code}`, comparatorIds: COMMAND_IDS,
    clauses: [...clauses, cite("8.2", 633), cite("10.1", 735), cite("10.1", 739)], discriminates, defaults,
  });
}
/** Refused gesture: the staged input, its diagnostic outcome, nothing committed. */
export function refusedGesture(group, nn, slug, { snap = S0, doc = docs.basic, gesture: g, commands, code, clauses, discriminates, defaults, phase }) {
  const x = refusedCommand(snap, code);
  addCase(group, nn, slug, {
    operation: "canvas.gesture", phase, inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("gesture", g),
    expectedArtifacts: artifactsOf(x, { staged: { transactionId: g.transactionId, commands }, gesture: true }), expectedStatus: `refused:${code}`,
    comparatorIds: GESTURE_REFUSED_IDS, clauses: [...clauses, cite("8.2", 633), cite("8.2", 637), cite("10.1", 735)], discriminates, defaults,
  });
}
/** A gesture the canvas does not stage (prompt, refused hover, cancellation). */
export function notStaged(group, nn, slug, { snap = S0, doc = docs.basic, gesture: g, outcome, clauses, discriminates, defaults, phase }) {
  const x = refusedCommand(snap, "operation-error");
  addCase(group, nn, slug, {
    operation: "canvas.gesture", phase, inputArtifacts: [pin("snapshot", doc)], commandArtifact: artifact("gesture", g),
    expectedArtifacts: [artifact("gesture-outcome", outcome), artifact("snapshot", x.snapshot), artifact("events", []), artifact("history", x.history)],
    expectedStatus: "ok", comparatorIds: ["lot5/gesture-outcome", ...CANVAS], clauses, discriminates, defaults,
  });
}

export const PRODUCER_DEFAULT = "Harmonization C7: invoking an entry whose ui.when is false, or a hidden, immutable or readonly field, refuses profile-producer (§8.3 L649: ui.when is the security/producer boundary; §8.2 L637 reserves transaction-entry-unsupported for technically unadaptable entries).";
export const SUBJECT_DEFAULT = "Command subject (the ui.when self): owner for palette and paste, target for context, replace, delete and direct-edit, source for append and connect; a command supplies exactly the subject plus the sources its entry binds (§8.3 L655; aligned with the Python binding S5 §3.1).";
const REPLACE_DEFAULT = "Harmonization D7 (DESIGN §2.4 L163, L171, §2.4.1 L182, §8.3 L651): mechanism 1 has no retype action and no action writes an existing ID, so a type-changing replace creates a new allocated element (appended to the container), removes the original with an explicit empty dependents selector (refuseIfReferenced) and reports the replacement map {sourceId, resultId, domain:\"migration\"} in report.idMap; a referenced original refuses reference-dangling (C12); a same-type conversion keeps the ID with an empty idMap.";
const DELETE_DEFAULT = "Delete uses the single schema dependents selector over outgoing edges (inverseReference sourceRef, includeDeclared); an inbound reference from outside the deletion closure refuses reference-dangling (§2.4 L171; harmonization C12).";

export function commands() {
  const P = "Proc_main";
  const fresh = () => clone(T0);
  // ------------------------------------------------------------ palette
  {
    const key = "k-palette-001", id = stableId(P, "task", key);
    const tree = fresh(); fe(tree).push(node("bpmn:Task", id, { name: "" }));
    const commands = [surface("task-create", { owner: P, key, value: "" })];
    const opts = { unnamed: [id], add: [occ("page-main", id)] };
    ok("palette", 1, "task-programmatic", { transactionId: "tx-palette-001", commands, tree, opts, phase: "create",
      clauses: [cite("8.3", 649), cite("8.3", 655), cite("8.3", 659), cite("2.4", 163), ...ALLOC],
      discriminates: "Creates the shape with an upstream random ID (Activity_xxx) instead of stable-id/1, omits the explicit empty name, skips the draft lint stages (no warning entries), lets one palette action produce two history entries, or re-lays out untouched shapes." });
    gesture("palette", 2, "task-gesture", { gesture: { gesture: "palette-drop", entry: "task-create", pageId: "page-main", container: P, point: { x: 640000, y: 600000 }, insertionKey: key, transactionId: "tx-palette-001" },
      commands, tree, opts, phase: "create", clauses: [cite("8.3", 649), cite("8.3", 655), ...ALLOC],
      discriminates: "Executes the upstream create.task command (bpmn-js ElementFactory) and lets a changed listener patch it afterwards, producing a different ID, an extra history entry or a second onChange.",
      defaults: ["Gesture parameter sources (lot-5 default): palette drop supplies owner = drop container, key = injected insertion key, value = explicit empty string; the harness injects transactionId and insertionKey."] });
  }
  [["user-task", 3, "UserTask-create", "bpmn:UserTask", "user-task", "", true],
    ["start", 4, "start-create", "bpmn:StartEvent", "start", "Order amended", false],
    ["end", 5, "end-create", "bpmn:EndEvent", "end", "", false],
    ["gateway", 6, "gateway-create", "bpmn:ExclusiveGateway", "gateway", "Complete?", false],
    ["call", 7, "call-create", "bpmn:CallActivity", "call", "Escalate", false],
  ].forEach(([slug, nn, entry, type, slot, value, lint]) => {
    const key = `k-palette-${slug}`, id = stableId(P, slot, key);
    const tree = fresh(); fe(tree).push(node(type, id, { name: value }));
    ok("palette", nn, slug, { transactionId: `tx-palette-${slug}`, commands: [surface(entry, { owner: P, key, value })], tree, phase: "create",
      opts: { unnamed: lint ? [id] : [], add: [occ("page-main", id)] },
      clauses: [cite("8.3", 649), cite("8.3", 655), cite("2.4", 163), ...ALLOC, ...(lint ? [cite("2.3", 143)] : [])],
      discriminates: lint ? "Lints the new UserTask with an exact Task type test (no finding) instead of the assignable rule, or creates a plain Task." :
        `Creates the native ${type} with an upstream ID or default name, or invents a calledElement/definition for the new element.` });
  });
  {
    const key = "k-palette-reference", store = stableId(P, "store", key), reference = stableId(P, "reference", key);
    const tree = fresh();
    tree.rootElements.push(node("bpmn:DataStore", store, { name: "Supplier list" }));
    fe(tree).push(node("bpmn:DataStoreReference", reference, { dataStoreRef: store }));
    ok("palette", 8, "reference", { transactionId: "tx-palette-reference", commands: [surface("reference-create", { owner: P, key, value: "Supplier list" })], tree, phase: "create",
      opts: { add: [occ("page-main", reference)] }, clauses: [cite("8.3", 651), cite("4", 352), cite("4.4", 408), cite("2.4", 163), ...ALLOC],
      discriminates: "Creates only an upstream DataStoreReference without a root DataStore, names the reference instead of the store, places the DataStore inside the Process, or draws the root DataStore." });
  }
  {
    const key = "k-palette-item", backing = stableId(P, "data-object", key), item = stableId(P, "item", key);
    const tree = fresh();
    fe(tree).push(node("bpmn:DataObject", backing), node("bpmn:DataObjectReference", item, { name: "Delivery note", dataObjectRef: backing }));
    ok("palette", 9, "item", { transactionId: "tx-palette-item", commands: [surface("item-create", { owner: P, key, value: "Delivery note" })], tree, phase: "create",
      opts: { add: [occ("page-main", item)] }, clauses: [cite("8.3", 651), cite("4", 349), cite("2.4", 163), ...ALLOC],
      discriminates: "Creates a DataObjectReference without its DataObject backing, or orders the two created elements differently from the recipe steps." });
  }
  {
    const key = "k-palette-aid", note = stableId(P, "aid", key);
    const tree = fresh(); art(tree).push(node("bpmn:TextAnnotation", note, { text: "[Aid] calculator" }));
    ok("palette", 10, "aid", { transactionId: "tx-palette-aid", commands: [surface("aid-create", { owner: P, key, value: "calculator" })], tree, phase: "create",
      opts: { add: [occ("page-main", note)] }, clauses: [cite("8.3", 653), cite("9.3", 702), cite("2.4", 163), ...ALLOC],
      discriminates: "Stores the typed body without the configured marker, or adds the marker without its separating space." });
  }
  // Multi-set selection (§8.3 L651, §7.1 L547).
  notStaged("palette", 11, "input-two-sets-prompt", { phase: "create",
    gesture: { gesture: "palette-drop", entry: "input-create", pageId: "page-main", container: P, point: { x: 80000, y: 120000 }, insertionKey: "k-palette-input", transactionId: "tx-palette-input-prompt" },
    outcome: { staged: false, prompt: { kind: "set-selection", entry: "input-create", parameter: "set", source: "target", candidates: ["Set_A", "Set_B"] } },
    clauses: [cite("8.3", 651), cite("7.1", 547), cite("8.3", 655)],
    discriminates: "Silently appends the new DataInput to the first InputSet (Set_A), or commits without a set, instead of asking for the set when several valid sets exist.",
    defaults: ["Valid sets are the InputSet children of the owner Process ioSpecification, listed in UTF-16 ID order; the prompt is a UI outcome without transaction, history or event."] });
  {
    const key = "k-palette-input", input = stableId(P, "data-input", key);
    const tree = fresh();
    io(tree).dataInputs.push(node("bpmn:DataInput", input, { name: "" }));
    find(tree, "Set_B").dataInputRefs = [input];
    gesture("palette", 12, "input-set-b-gesture", { gesture: { gesture: "palette-drop", entry: "input-create", pageId: "page-main", container: P, point: { x: 80000, y: 120000 }, choice: { parameter: "set", value: "Set_B" }, insertionKey: key, transactionId: "tx-palette-input-b" },
      commands: [surface("input-create", { owner: P, target: "Set_B", key, value: "" })], tree, opts: { add: [occ("page-main", input)] }, phase: "create",
      clauses: [cite("8.3", 651), cite("7.1", 547), cite("2.4", 166)],
      discriminates: "Adds the input to both sets, to the first set, or replaces Set_B's absent dataInputRefs with a list that drops the new ID; or writes Lane.flowNodeRef for process IO." });
    const tree2 = fresh();
    const input2 = stableId(P, "data-input", "k-palette-input-2");
    io(tree2).dataInputs.push(node("bpmn:DataInput", input2, { name: "Rush request" }));
    find(tree2, "Set_B").dataInputRefs = [input2];
    ok("palette", 13, "input-set-b-programmatic", { transactionId: "tx-palette-input-b2", commands: [surface("input-create", { owner: P, target: "Set_B", key: "k-palette-input-2", value: "Rush request" })],
      tree: tree2, opts: { add: [occ("page-main", input2)] }, phase: "create", clauses: [cite("8.3", 651), cite("7.1", 547), cite("1.1", 32)],
      discriminates: "Twin divergence: a headless implementation that resolves the set by position or by name instead of the explicit target ID." });
  }
  {
    const key = "k-palette-input-one", input = stableId(P, "data-input", key);
    const tree = clone(T1set);
    io(tree).dataInputs.push(node("bpmn:DataInput", input, { name: "" }));
    find(tree, "Set_A").dataInputRefs.push(input);
    gesture("palette", 14, "input-one-set-gesture", { snap: S1set, doc: docs.oneSet,
      gesture: { gesture: "palette-drop", entry: "input-create", pageId: "page-main", container: P, point: { x: 80000, y: 120000 }, insertionKey: key, transactionId: "tx-palette-input-one" },
      commands: [surface("input-create", { owner: P, target: "Set_A", key, value: "" })], tree, opts: { add: [occ("page-main", input)] }, phase: "create",
      clauses: [cite("8.3", 651), cite("2.4", 166), cite("2.4", 176)],
      discriminates: "Prompts although exactly one valid set exists, or rewrites Set_A's reference array instead of appending the new ID after Input_1 (stable appendUnique order)." });
  }
  refused("palette", 15, "input-missing-target", { transactionId: "tx-palette-input-missing", code: "profile-ui-parameters",
    commands: [surface("input-create", { owner: P, key: "k-palette-input-3", value: "" })], phase: "create",
    clauses: [cite("8.3", 655), cite("2.4.1", 195)], defaults: [SUBJECT_DEFAULT],
    discriminates: "Defaults the missing set parameter to the first set or to a label/ambient variable instead of refusing the missing required parameter." });
  refused("palette", 16, "disabled-owner", { transactionId: "tx-palette-disabled", code: "profile-producer",
    commands: [surface("task-create", { owner: "Task_A", key: "k-palette-disabled", value: "" })], phase: "create",
    clauses: [cite("8.3", 649)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Treats the hidden palette entry as the only guard and executes a programmatic call whose ui.when (owner is a Process) is false, or refuses with the adapter code transaction-entry-unsupported." });
  refused("palette", 17, "unknown-entry", { transactionId: "tx-palette-unknown", code: "profile-symbol",
    commands: [surface("create.group", { owner: P, key: "k-palette-unknown", value: "" })], phase: "create",
    clauses: [cite("8.3", 659), cite("2.4.1", 190)],
    discriminates: "Falls through to the upstream create.group handler for an ID that no profile entry declares (unlisted upstream entries are disabled)." });
  {
    const key = "k-palette-final", id = stableId(P, "task", key);
    const tree = fresh(); fe(tree).push(node("bpmn:Task", id, { name: "Prepare offer" }));
    ok("palette", 18, "final-only-report", { transactionId: "tx-palette-final",
      commands: [surface("task-create", { owner: P, key, value: "" }), surface("rename-direct", { target: id, value: "Prepare offer" })],
      tree, opts: { add: [occ("page-main", id)] }, phase: "create", clauses: [cite("8.2", 631)],
      discriminates: "Reports or emits the intermediate state (activity-name-missing warnings after the first command), emits two onChange events, or records two history entries for one transaction." });
  }
  {
    const key = "k-palette-001", id = stableId(P, "task", key);
    const tree = fresh(); fe(tree).push(node("bpmn:Task", id, { name: "" }));
    ok("palette", 19, "contrast-theme-same-tree", { snap: S0c, doc: docs.basicContrast, transactionId: "tx-palette-contrast",
      commands: [surface("task-create", { owner: P, key, value: "" })], tree, opts: { unnamed: [id], add: [occ("page-main", id)] }, phase: "create",
      clauses: [cite("8.3", 649), cite("3.1", 264)],
      discriminates: "Theme bypass: derives the created type, ID, name or report from the active theme; the envelope and report must equal the plain-theme case and only the theme digest differs in viewRevision." });
  }
  // Command records (harmonization I3, C8): upstream mapping and closed records.
  {
    const key = "k-palette-upstream", id = stableId(P, "task", key);
    const tree = fresh(); fe(tree).push(node("bpmn:Task", id, { name: "" }));
    ok("palette", 20, "upstream-command-mapped", { transactionId: "tx-palette-upstream", commands: [upstream("create.task", { owner: P, key, value: "" })],
      tree, opts: { unnamed: [id], add: [occ("page-main", id)] }, phase: "create", clauses: [cite("8.3", 659), ...ALLOC],
      defaults: ["Harmonization I3: an upstream command record {command:\"upstream\", upstream, context} resolves through upstreamEntries to its unique enabled entry and behaves exactly like that surface command."],
      discriminates: "Runs the upstream create.task handler (random ID, no lint) instead of the mapped task-create recipe, or refuses a listed upstream ID." });
  }
  refused("palette", 21, "unlisted-upstream", { transactionId: "tx-palette-unlisted", code: "transaction-entry-unsupported",
    commands: [upstream("create.group", { owner: P, key: "k-palette-unlisted", value: "" })], phase: "create", clauses: [cite("8.3", 659), cite("8.2", 635)],
    defaults: ["Harmonization C8: an upstream ID no entry lists is a disabled, unadapted entry: transaction-entry-unsupported."],
    discriminates: "Executes the upstream create.group command (a group is created) because the headless path does not apply the business-profile upstream filter." });
  refused("palette", 22, "bare-recipe-command", { transactionId: "tx-palette-bare", code: "transaction-entry-unsupported",
    commands: [{ recipe: "create-task", parameters: { owner: P, key: "k-palette-bare", name: "" } }], phase: "create", clauses: [cite("8.2", 635), cite("8.3", 657)],
    defaults: ["Harmonization C8/I3: applyCommands accepts only surface, upstream and field command records; a bare recipe command is an unadapted entry."],
    discriminates: "Accepts a bare {recipe, parameters} command, a second recipe authority that bypasses ui.when and the parameter map." });
  refused("palette", 23, "unknown-member", { transactionId: "tx-palette-member", code: "profile-ui-parameters",
    commands: [{ ...surface("task-create", { owner: P, key: "k-palette-member", value: "" }), label: "Task" }], phase: "create", clauses: [cite("8.3", 655)],
    defaults: ["Harmonization I3: command records are closed; an unknown member refuses profile-ui-parameters (no parameter comes from a label)."],
    discriminates: "Ignores the unknown label member, or uses it as the created name." });
  refused("palette", 24, "extra-source", { transactionId: "tx-palette-extra", code: "profile-ui-parameters",
    commands: [surface("task-create", { owner: P, target: "Task_A", key: "k-palette-extra", value: "" })], phase: "create", clauses: [cite("8.3", 655)],
    defaults: [SUBJECT_DEFAULT],
    discriminates: "Ignores the extra target source that the task-create parameter map does not bind (an ambient parameter)." });
  refused("palette", 25, "non-string-handle", { transactionId: "tx-palette-handle-type", code: "profile-type",
    commands: [surface("task-create", { owner: 7, key: "k-palette-handle", value: "" })], phase: "create", clauses: [cite("8.3", 655), cite("2.2", 113)],
    discriminates: "Coerces the number 7 to an element ID or resolves it by position." });
  refused("palette", 26, "dangling-handle", { transactionId: "tx-palette-handle-missing", code: "reference-dangling",
    commands: [surface("task-create", { owner: "Proc_missing", key: "k-palette-handle", value: "" })], phase: "create", clauses: [cite("8.3", 655), cite("2.2", 113), cite("2.2", 132)],
    discriminates: "Creates a placeholder Process or falls back to the active page's Process for an owner handle that names no element." });
  refused("palette", 27, "null-value", { transactionId: "tx-palette-null", code: "profile-type",
    commands: [surface("task-create", { owner: P, key: "k-palette-null", value: null })], phase: "create", clauses: [cite("8.3", 655), cite("8.3", 659), cite("2.2", 113)],
    discriminates: "Treats a null value as an omitted name (no name property) or as the empty string." });
  refused("palette", 28, "number-value", { transactionId: "tx-palette-number", code: "profile-type",
    commands: [surface("task-create", { owner: P, key: "k-palette-number", value: 3 })], phase: "create", clauses: [cite("8.3", 659), cite("2.2", 114)],
    discriminates: "Coerces the number 3 to the name \"3\" (implicit scalar coercion)." });
  {
    // C refusal through profile data: an input no set covers while two sets exist.
    refused("palette", 29, "input-loose-two-sets", { transactionId: "tx-palette-loose", code: "io-set-selection-required",
      commands: [surface("input-loose-create", { owner: P, key: "k-palette-loose", value: "Walk-in request" })], phase: "create",
      clauses: [cite("7.1", 547), cite("8.3", 651), cite("8.2", 631)],
      defaults: ["The require-input-set complete recipe refuses io-set-selection-required on the staged state; report.entries and diagnostics are empty because the refusal precedes every lint stage (harmonization B2)."],
      discriminates: "Appends the uncovered DataInput to the first InputSet, commits it uncovered, or runs C before the user command is staged." });
  }
  refused("palette", 30, "cancelled-before-call", { transactionId: "tx-palette-cancelled", code: "operation-cancelled",
    commands: [surface("task-create", { owner: P, key: "k-palette-cancelled", value: "" })], phase: "create", request: { signal: "aborted" },
    clauses: [cite("8.1", 604), cite("8.2", 629)],
    defaults: ["The request carries an AbortSignal already aborted before the call (\"signal\": \"aborted\" is the harness instruction); cancellation refuses with operation-cancelled and echoes the loaded identity (harmonization B3)."],
    discriminates: "Rejects the Promise instead of returning the refusal union, or creates the task because cancellation is only polled after commit." });
  refused("palette", 31, "cancelled-after-call", { transactionId: "tx-palette-cancelled-async", code: "operation-cancelled",
    commands: [surface("task-create", { owner: P, key: "k-palette-cancelled-async", value: "" })], phase: "create", request: { signal: "aborted-after-call" },
    clauses: [cite("8.1", 604), cite("8.2", 629), cite("8.2", 633)],
    defaults: ["\"signal\": \"aborted-after-call\": the harness aborts the AbortSignal synchronously right after invoking applyCommands and before awaiting it; applyCommands is a queued operation (§8.1 L604; block-A methodDelivery \"queued\"), so the abort is seen before staging and the call refuses operation-cancelled with nothing committed."],
    discriminates: "Runs the queued transaction to completion although its signal was aborted while it waited, or commits the stage and only then reports the cancellation." });

  // ------------------------------------------------------------ context pad / append
  {
    const key = "k-context-append", task = stableId(P, "task", key), flow = stableId(P, "flow", key);
    const tree = fresh();
    fe(tree).push(node("bpmn:Task", task, { name: "" }), node("bpmn:SequenceFlow", flow, { sourceRef: "Task_A", targetRef: task }));
    const commands = [surface("append-task", { owner: P, source: "Task_A", key, value: "" })];
    const opts = { unnamed: [task], add: [occ("page-main", task), occ("page-main", flow, ["Task_A", task])] };
    ok("context", 1, "append-task-programmatic", { transactionId: "tx-context-append", commands, tree, opts, phase: "create",
      clauses: [cite("8.3", 649), cite("8.3", 655), cite("2.4", 163), ...ALLOC], defaults: [SUBJECT_DEFAULT],
      discriminates: "Appends with upstream AppendBehavior (random IDs, incoming/outgoing writes, auto-placement commands as extra history entries) or connects the flow in the reverse direction." });
    gesture("context", 2, "append-task-gesture", { gesture: { gesture: "context-pad", entry: "append-task", pageId: "page-main", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_A" }, insertionKey: key, transactionId: "tx-context-append" },
      commands, tree, opts, phase: "create", clauses: [cite("8.3", 649), cite("8.3", 655)],
      discriminates: "Derives the anchor from the semantic ID of another repeated occurrence or from the selection instead of the clicked occurrence, or creates a different staged input than the programmatic call.",
      defaults: ["Context-pad append sources: owner = container Process of the clicked element, source = semantic element of the clicked occurrence, key = injected insertion key, value = explicit empty string."] });
  }
  {
    const key = "k-context-end", end = stableId(P, "end", key), flow = stableId(P, "flow", key);
    const tree = fresh();
    fe(tree).push(node("bpmn:EndEvent", end, { name: "" }), node("bpmn:SequenceFlow", flow, { sourceRef: "Task_B", targetRef: end }));
    ok("context", 3, "append-end", { transactionId: "tx-context-end", commands: [surface("append-end", { owner: P, source: "Task_B", key, value: "" })], tree, phase: "create",
      opts: { add: [occ("page-main", end), occ("page-main", flow, ["Task_B", end])] }, clauses: [cite("8.3", 649), cite("2.3", 143), ...ALLOC],
      discriminates: "Refuses the append from the UserTask with an exact-Task ui.when, or appends an intermediate event." });
  }
  {
    const key = "k-context-aid", note = stableId(P, "aid", key), link = stableId(P, "aid-link", key);
    const tree = fresh();
    art(tree).push(node("bpmn:TextAnnotation", note, { text: "[Aid] printer" }), node("bpmn:Association", link, { associationDirection: "None", sourceRef: note, targetRef: "Task_A" }));
    ok("context", 4, "aid-attach", { transactionId: "tx-context-aid", commands: [surface("aid-attach", { owner: P, source: "Task_A", key, value: "printer" })], tree, phase: "create",
      opts: { add: [occ("page-main", note), occ("page-main", link, [note, "Task_A"])] }, clauses: [cite("4", 354), cite("8.3", 653), ...ALLOC],
      discriminates: "Links the annotation with direction One (reference-link type) or from the task to the annotation, or omits the marker." });
  }
  refused("context", 5, "append-on-end", { transactionId: "tx-context-append-end", code: "profile-producer",
    commands: [surface("append-task", { owner: P, source: "End_1", key: "k-context-append-end", value: "" })], phase: "create",
    clauses: [cite("8.3", 649)], defaults: [PRODUCER_DEFAULT, SUBJECT_DEFAULT],
    discriminates: "Executes append-task from an EndEvent because the programmatic path skips the ui.when check that hides it from the context pad." });
  {
    const tree = fresh(); delete find(tree, "Call_1").calledElement;
    ok("context", 6, "call-unlink", { transactionId: "tx-context-unlink", commands: [surface("call-unlink", { target: "Call_1" })], tree, phase: "edit",
      clauses: [cite("8.3", 659), cite("2.4", 165), cite("8.3", 653), cite("4", 356)],
      discriminates: "Clears the call target by writing an empty string or null instead of an explicit unset, or drops the call's source Documentation evidence while editing it." });
    noop("context", 7, "call-unlink-noop", { transactionId: "tx-context-unlink-noop", commands: [surface("call-unlink", { target: "Call_3" })], phase: "edit",
      clauses: [cite("2.4", 158)],
      defaults: ["A recipe whose `when` is false runs no step (§2.4 L158): the explicit command commits nothing and reports changed:false without history entry or event."],
      discriminates: "Refuses, or writes calledElement:\"\" / creates a history entry, when the recipe `when` (present calledElement) is false for a call that has no target." });
  }

  // ------------------------------------------------------------ connect
  {
    const key = "k-connect-flow", flow = stableId(P, "flow", key);
    const tree = fresh(); fe(tree).push(node("bpmn:SequenceFlow", flow, { sourceRef: "Task_A", targetRef: "End_1" }));
    const commands = [surface("connect-flow", { owner: P, source: "Task_A", target: "End_1", key })];
    const opts = { add: [occ("page-main", flow, ["Task_A", "End_1"])] };
    ok("connect", 1, "flow-programmatic", { transactionId: "tx-connect-flow", commands, tree, opts, phase: "reference",
      clauses: [cite("8.3", 649), cite("4", 347), ...ALLOC],
      discriminates: "Writes FlowNode incoming/outgoing (not admitted by the descriptor slice), or creates the flow in Definitions instead of the Process flow container." });
    gesture("connect", 2, "flow-gesture", { gesture: { gesture: "connect", pageId: "page-main", source: { pageId: "page-main", occurrenceKey: "occ:Task_A" }, target: { pageId: "page-main", occurrenceKey: "occ:End_1" }, insertionKey: key, transactionId: "tx-connect-flow" },
      commands, tree, opts, phase: "reference", clauses: [cite("8.3", 649)],
      discriminates: "Uses the upstream connection rule (bpmn-js canConnect) to pick the connection type instead of the unique enabled profile connect entry whose recipe accepts the target.",
      defaults: ["Connect dispatch (lot-5 default): among connect entries whose ui.when holds for the source, exactly one whose recipe `when` holds for {source,target} is staged; none means the connection is not offered."] });
  }
  {
    const key = "k-connect-ref", link = stableId(P, "reference-link", key);
    const tree = fresh(); art(tree).push(node("bpmn:Association", link, { associationDirection: "One", sourceRef: "Ref_1", targetRef: "Task_B" }));
    const commands = [surface("connect-reference-link", { owner: P, source: "Ref_1", target: "Task_B", key })];
    const opts = { add: [occ("page-main", link, ["Ref_1", "Task_B"])] };
    ok("connect", 3, "reference-link-programmatic", { transactionId: "tx-connect-ref", commands, tree, opts, phase: "reference",
      clauses: [cite("8.3", 651), cite("4", 353), ...ALLOC],
      discriminates: "Creates the upstream default DataInputAssociation (with a target port) for DataStoreReference→Task, or an Association with direction None." });
    gesture("connect", 4, "reference-link-gesture", { gesture: { gesture: "connect", pageId: "page-main", source: { pageId: "page-main", occurrenceKey: "occ:Ref_1" }, target: { pageId: "page-main", occurrenceKey: "occ:Task_B" }, insertionKey: key, transactionId: "tx-connect-ref" },
      commands, tree, opts, phase: "reference", clauses: [cite("8.3", 651), cite("8.3", 649)],
      discriminates: "Lets the upstream DataStoreReference connect rule win (connection type bpmn:DataInputAssociation) instead of overriding it with the profile reference-link Association." });
  }
  {
    const key = "k-connect-input", port = stableId("Task_A", "port", key), association = stableId("Task_A", "input-association", key);
    const tree = fresh();
    Object.assign(find(tree, "Task_A"), { properties: [node("bpmn:Property", port)], dataInputAssociations: [node("bpmn:DataInputAssociation", association, { sourceRef: ["Item_1"], targetRef: port })] });
    ok("connect", 5, "item-input", { transactionId: "tx-connect-input", commands: [surface("connect-item-input", { source: "Item_1", target: "Task_A", key })], tree, phase: "reference",
      opts: { add: [occ("page-main", association, ["Item_1", "Task_A"])] }, clauses: [cite("8.3", 651), cite("4", 350), cite("7.1", 546), ...ALLOC],
      discriminates: "Uses an Association for an internal item, targets the task itself instead of an owned port, or allocates the port with the Process as ownerId." });
  }
  {
    const key = "k-connect-output", association = stableId("Task_B", "output-association", key);
    const tree = fresh(); find(tree, "Task_B").dataOutputAssociations = [node("bpmn:DataOutputAssociation", association, { targetRef: "Item_1" })];
    ok("connect", 6, "item-output", { transactionId: "tx-connect-output", commands: [surface("connect-item-output", { source: "Task_B", target: "Item_1", key })], tree, phase: "reference",
      opts: { add: [occ("page-main", association, ["Task_B", "Item_1"])] }, clauses: [cite("8.3", 651), cite("4", 350)],
      discriminates: "Creates a SequenceFlow or Association from a task to an item (connect-flow chosen because both entries are enabled for the task source)." });
  }
  {
    const key = "k-connect-note", link = stableId(P, "aid-link", key);
    const tree = fresh(); art(tree).push(node("bpmn:Association", link, { associationDirection: "None", sourceRef: "Note_1", targetRef: "Task_A" }));
    ok("connect", 7, "annotation-link", { transactionId: "tx-connect-note", commands: [surface("connect-annotation-link", { owner: P, source: "Note_1", target: "Task_A", key })], tree, phase: "reference",
      opts: { add: [occ("page-main", link, ["Note_1", "Task_A"])] }, clauses: [cite("4", 354), cite("8.3", 651)],
      discriminates: "Gives an annotation link the reference-link direction One, or reverses it to task→annotation." });
  }
  {
    const key = "k-connect-call", link = stableId(P, "reference-link", key);
    const tree = fresh(); art(tree).push(node("bpmn:Association", link, { associationDirection: "One", sourceRef: "Ref_2", targetRef: "Call_1" }));
    ok("connect", 8, "reference-to-call", { transactionId: "tx-connect-call", commands: [surface("connect-reference-link", { owner: P, source: "Ref_2", target: "Call_1", key })], tree, phase: "reference",
      opts: { add: [occ("page-main", link, ["Ref_2", "Call_1"])] }, clauses: [cite("4", 353), cite("8.3", 651)],
      discriminates: "Restricts the eligible activity to bpmn:Task by exact type and refuses or no-ops a CallActivity target." });
  }
  noop("connect", 9, "ineligible-target-noop", { transactionId: "tx-connect-ineligible", commands: [surface("connect-reference-link", { owner: P, source: "Ref_1", target: "End_1", key: "k-connect-ineligible" })],
    phase: "reference", clauses: [cite("2.4", 158), cite("4", 353)],
    defaults: ["A recipe whose `when` is false runs no step (§2.4 L158): the explicit command commits nothing and reports changed:false."],
    discriminates: "Creates the Association anyway (ignoring the recipe `when`), or falls back to a SequenceFlow or DataInputAssociation for an ineligible target." });
  notStaged("connect", 10, "ineligible-target-gesture", { phase: "reference",
    gesture: { gesture: "connect", pageId: "page-main", source: { pageId: "page-main", occurrenceKey: "occ:Ref_1" }, target: { pageId: "page-main", occurrenceKey: "occ:End_1" }, insertionKey: "k-connect-ineligible", transactionId: "tx-connect-ineligible-gesture" },
    outcome: { staged: false, connectionAllowed: false }, clauses: [cite("8.3", 649), cite("8.3", 651)],
    discriminates: "Offers the connection because the upstream rule allows DataStoreReference→EndEvent data associations, or stages a no-op transaction (history entry) for a refused hover." });
  refused("connect", 11, "flow-from-end", { transactionId: "tx-connect-end", code: "profile-producer",
    commands: [surface("connect-flow", { owner: P, source: "End_1", target: "Task_A", key: "k-connect-end" })], phase: "reference",
    clauses: [cite("8.3", 649)], defaults: [PRODUCER_DEFAULT, SUBJECT_DEFAULT],
    discriminates: "Accepts an outgoing SequenceFlow from an EndEvent through the programmatic path because only the context pad hides it." });

  // ------------------------------------------------------------ replace (harmonization D7)
  {
    const key = "k-replace-001", id = stableId(P, "replace", key);
    const tree = fresh(); removeIds(tree, ["Task_X"]); fe(tree).push(node("bpmn:UserTask", id, { name: "Standalone check" }));
    const commands = [surface("to-user-task", { target: "Task_X", key })];
    const opts = { idMap: [{ sourceId: "Task_X", resultId: id, domain: "migration" }], remove: ["Task_X"], add: [occ("page-main", id)], selection: selectionValid(SNAPSHOT_LAYOUT) };
    ok("replace", 1, "task-to-user-programmatic", { transactionId: "tx-replace-001", commands, tree, opts, phase: "convert",
      clauses: [cite("8.3", 651), cite("2.4", 163), cite("2.4", 171), cite("2.4.1", 182), ...ALLOC], defaults: [REPLACE_DEFAULT],
      discriminates: "Keeps the ID Task_X with an in-place type change (an implicit override the recipe grammar cannot express), omits the replacement map, keeps the original element, or places the replacement at the original index instead of appending it." });
    gesture("replace", 2, "task-to-user-gesture", { gesture: { gesture: "replace-menu", entry: "to-user-task", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_X" }, insertionKey: key, transactionId: "tx-replace-001" },
      commands, tree, opts, phase: "convert", clauses: [cite("8.3", 649), cite("8.3", 651)], defaults: [REPLACE_DEFAULT],
      discriminates: "Executes upstream BpmnReplace (shape.replace with ReplaceConnectionBehavior) as several commands, producing more than one history entry, an intermediate onChange or an upstream-allocated ID." });
  }
  {
    const key = "k-replace-003", id = stableId(P, "replace", key);
    const tree = fresh(); removeIds(tree, ["Task_Y"]); fe(tree).push(node("bpmn:Task", id, { name: "Standalone approval" }));
    ok("replace", 3, "user-to-task", { transactionId: "tx-replace-003", commands: [surface("to-task", { target: "Task_Y", key })], tree, phase: "convert",
      opts: { idMap: [{ sourceId: "Task_Y", resultId: id, domain: "migration" }], remove: ["Task_Y"], add: [occ("page-main", id)], selection: selectionValid(SNAPSHOT_LAYOUT) },
      clauses: [cite("8.3", 651), cite("2.3", 143), cite("2.4", 171), ...ALLOC], defaults: [REPLACE_DEFAULT],
      discriminates: "Keeps the UserTask type because the target already is assignable to Task, loses the name, or reports no replacement map." });
  }
  refused("replace", 4, "exact-type-refusal", { transactionId: "tx-replace-004", code: "profile-producer",
    commands: [surface("to-user-task", { target: "Task_B", key: "k-replace-004" })], phase: "convert",
    clauses: [cite("8.3", 649), cite("2.3", 143)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Evaluates typeIs(Task, exact) with subtype inclusion and re-applies to-user-task to a UserTask." });
  {
    const key = "k-replace-005", backing = stableId(P, "data-object", key), id = stableId(P, "replace", key);
    const tree = fresh(); removeIds(tree, ["Ref_2"]);
    fe(tree).push(node("bpmn:DataObject", backing), node("bpmn:DataObjectReference", id, { name: "Tariff sheet", dataObjectRef: backing }));
    ok("replace", 5, "reference-to-item", { transactionId: "tx-replace-005", commands: [surface("reference-to-item", { target: "Ref_2", key })], tree, phase: "convert",
      opts: { idMapUnsealed: true, remove: ["Ref_2"], add: [occ("page-main", id)], selection: selectionValid(SNAPSHOT_LAYOUT) },
      clauses: [cite("8.3", 651), cite("4", 349), cite("4", 352), cite("4.4", 408), cite("2.4", 171)], defaults: [REPLACE_DEFAULT],
      unsealedNotes: ["/report/idMap of result, events and history (replacement-map-multi-create)."],
      discriminates: "Deletes the shared root DataStore Store_2, keeps a dataStoreRef on the item, reuses the store as backing, keeps the ID Ref_2 for the new type, or lets N change the type silently instead of the explicit conversion." });
  }
  refused("replace", 6, "reference-to-item-linked", { transactionId: "tx-replace-006", code: "reference-dangling",
    commands: [surface("reference-to-item", { target: "Ref_1", key: "k-replace-006" })], phase: "convert",
    clauses: [cite("8.3", 651), cite("2.4", 171)], defaults: [REPLACE_DEFAULT],
    discriminates: "Converts the reference although Link_1.sourceRef still names it, silently deleting Link_1, re-pointing it implicitly or keeping a dangling sourceRef." });
  refused("replace", 7, "referenced-task-refused", { transactionId: "tx-replace-007", code: "reference-dangling",
    commands: [surface("to-user-task", { target: "Task_A", key: "k-replace-007" })], phase: "convert",
    clauses: [cite("8.3", 651), cite("2.4", 171), cite("2.4.1", 182)], defaults: [REPLACE_DEFAULT],
    discriminates: "Re-points Flow_1, Flow_2 and Link_1 to the replacement implicitly (no declared write), keeps the ID in place, or cascades the deletion of the flows." });
  {
    const tree = fresh(); find(tree, "Note_4").text = "[Aid] Check totals";
    ok("replace", 8, "note-to-aid-same-type", { transactionId: "tx-replace-008", commands: [surface("note-to-aid", { target: "Note_4" })], tree, phase: "convert",
      opts: { relabel: ["Note_4"] }, clauses: [cite("8.3", 651), cite("9.3", 702)], defaults: [REPLACE_DEFAULT],
      discriminates: "Allocates a new ID for a conversion that keeps the native type, or reports a replacement map row for a surviving ID." });
  }
  refusedGesture("replace", 9, "referenced-task-gesture-refused", { phase: "convert", code: "reference-dangling",
    gesture: { gesture: "replace-menu", entry: "to-user-task", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_A" }, insertionKey: "k-replace-009", transactionId: "tx-replace-009" },
    commands: [surface("to-user-task", { target: "Task_A", key: "k-replace-009" })], clauses: [cite("8.3", 651), cite("2.4", 171)], defaults: [REPLACE_DEFAULT],
    discriminates: "Commits the upstream BpmnReplace (which re-points the connections) when the profile conversion refuses, or emits an onChange for the refused gesture." });

  // ------------------------------------------------------------ delete
  {
    const tree = fresh(); removeIds(tree, ["Ref_1", "Link_1"]);
    ok("delete", 1, "reference-with-links", { transactionId: "tx-delete-001", commands: [surface("delete-element", { target: "Ref_1" })], tree, phase: "edit",
      opts: { remove: ["Ref_1", "Link_1"] }, clauses: [cite("8.3", 653), cite("2.4", 171), cite("4.4", 408)], defaults: [DELETE_DEFAULT],
      discriminates: "Leaves the reference-link Association as an orphan shell, or also deletes the shared root DataStore Store_1." });
  }
  {
    const tree = fresh(); removeIds(tree, ["Task_X"]);
    ok("delete", 2, "unconnected-task", { transactionId: "tx-delete-002", commands: [surface("delete-element", { target: "Task_X" })], tree, phase: "edit",
      opts: { remove: ["Task_X"] }, clauses: [cite("8.3", 653), cite("2.4", 171)], discriminates: "Refuses an unreferenced element or removes more than its closure." });
  }
  {
    const tree = fresh(); removeIds(tree, ["Start_1", "Flow_1"]);
    ok("delete", 3, "outgoing-only", { transactionId: "tx-delete-003", commands: [surface("delete-element", { target: "Start_1" })], tree, phase: "edit",
      opts: { remove: ["Start_1", "Flow_1"] }, clauses: [cite("8.3", 653), cite("2.4", 171)], defaults: [DELETE_DEFAULT],
      discriminates: "Removes the start event but keeps Flow_1 with a dangling sourceRef (orphan shell), or refuses although the only dependent is declared." });
  }
  refused("delete", 4, "incoming-refused", { transactionId: "tx-delete-004", code: "reference-dangling", commands: [surface("delete-element", { target: "Task_A" })], phase: "edit",
    clauses: [cite("8.3", 653), cite("2.4", 171)], defaults: [DELETE_DEFAULT],
    discriminates: "Cascades like upstream bpmn-js (deleting Flow_1 and Link_1 that the dependents selector does not declare), or deletes Task_A leaving Flow_1.targetRef dangling." });
  {
    const tree = fresh(); removeIds(tree, ["Flow_3"]);
    const commands = [surface("delete-element", { target: "Flow_3" })];
    ok("delete", 5, "flow", { transactionId: "tx-delete-005", commands, tree, phase: "edit", opts: { remove: ["Flow_3"] }, clauses: [cite("8.3", 653)],
      discriminates: "Also deletes the flow endpoints or rewires Task_B to End_1." });
    [[6, "keyboard-delete", { gesture: "keyboard", key: "Delete", selection: [{ pageId: "page-main", occurrenceKey: "occ:Flow_3" }], transactionId: "tx-delete-005" },
      "Maps the keyboard shortcut to a second delete authority (upstream removeSelection editor action) instead of the canonical delete surface.", [cite("8.3", 657), cite("8.3", 649)]],
    [7, "context-pad-delete", { gesture: "context-pad", entry: "delete-element", pageId: "page-main", occurrence: { pageId: "page-main", occurrenceKey: "occ:Flow_3" }, transactionId: "tx-delete-005" },
      "Runs the upstream context-pad delete (modeling.removeElements with its cascade behaviors) instead of the profile delete recipe, so the staged input or the history differs from the keyboard path.", [cite("8.3", 649)]],
    ].forEach(([nn, slug, g, discriminates, clauses]) => gesture("delete", nn, slug, { gesture: g, commands, tree, opts: { remove: ["Flow_3"] }, phase: "edit", clauses, discriminates }));
  }
  refused("delete", 8, "multi-atomic", { transactionId: "tx-delete-008", code: "reference-dangling",
    commands: [surface("delete-element", { target: "Task_X" }), surface("delete-element", { target: "Task_A" })], phase: "edit",
    clauses: [cite("2.4", 172), cite("8.2", 643)], defaults: [DELETE_DEFAULT],
    discriminates: "Commits the first deletion (Task_X) before the second command refuses: a transaction is atomic." });
  {
    const tree = fresh(); removeIds(tree, ["Note_1", "AidLink_1"]);
    ok("delete", 9, "annotation-with-link", { transactionId: "tx-delete-009", commands: [surface("delete-element", { target: "Note_1" })], tree, phase: "edit",
      opts: { remove: ["Note_1", "AidLink_1"] }, clauses: [cite("8.3", 653), cite("2.4", 171)],
      discriminates: "Leaves the annotation link without its source (orphan shell)." });
  }
  refused("delete", 10, "process-disabled", { transactionId: "tx-delete-010", code: "profile-producer", commands: [surface("delete-element", { target: "Proc_main" })], phase: "edit",
    clauses: [cite("8.3", 649), cite("2.4", 174)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Accepts a programmatic delete of the Process (ui.when lists deletable element types only)." });
  {
    const tree = fresh(); removeIds(tree, ["Start_x"]);
    ok("delete", 11, "last-element-keeps-empty-array", { transactionId: "tx-delete-011", commands: [surface("delete-element", { target: "Start_x" })], tree, phase: "edit",
      opts: { remove: ["Start_x"] }, clauses: [cite("8.3", 653), cite("2.4", 171)],
      defaults: ["Harmonization F1: an emptied containment array is stored as written; ProcArchive keeps flowElements: []."],
      discriminates: "Removes the emptied flowElements property instead of keeping the empty array, or refuses the deletion of an element without a view." });
  }
  void [unsealed];
}
