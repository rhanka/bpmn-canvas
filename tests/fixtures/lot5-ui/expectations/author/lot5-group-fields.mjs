// Group "fields": listFields records (harmonization B18), on-change checks
// (checkField), typed submissions, denied visibility/mutability/ownership,
// marker editing with source evidence, and reference picking (queryReferences).
import { addCase, artifact, pin, cite, docs, clone, find, P, D, pureOk, pureRefused, unchangedSnapshotResult, fieldCommand, surface, transaction,
  okCommand, artifactsOf, T0, S0, R0, GESTURE_IDS } from "./lot5-kit.mjs";
import { ok, noop, refused, PRODUCER_DEFAULT, SNAPSHOT_LAYOUT } from "./lot5-group-commands.mjs";
import { selectionValid } from "./lot5-kit.mjs";

const fresh = () => clone(T0);
const text = (key, locale = "en") => (P.MESSAGE_TEXT[locale] ?? {})[key] ?? P.MESSAGE_TEXT.en[key];
const QUERY_CMP = ["lot5/result", "lot5/snapshot", "lot5/events", "lot5/twin"];
const FIELD_DEFAULT = "listFields (harmonization B18): PureResult {revision, targetId, fields:[{notion, field, widget, path, label:{key,text}, message:{key,text}, present, value?, display?, mutable, choices, targetTypes}]}; only visible fields of the recognized notions are listed (notion order, then field order); value is the raw stored value and display the field display Value (else the raw value), both present iff present; mutable is false for a readonly widget, a field without command or a false mutable predicate.";
const CHECK_DEFAULT = "checkField (§8.3 L659 on-change validation): PureResult {revision, valid:true} or {revision, valid:false, code, messageKey}, where code is the code the same submission refuses with at commit and messageKey the field message key; an unknown field, an unknown target or a stale revision refuses the query itself.";
const PICK_DEFAULT = "queryReferences (§8.3 L657, harmonization B19): candidates are ID-bearing elements of the field targetTypes, admitted by effective reference ownership (a root element for any target, otherwise the same nearest Process as the target), offered only when the field is visible and mutable; label = candidate name (empty string when absent); literal case-sensitive substring without normalization; UTF-16 ID order, then offset/limit; invalid paging refuses profile-bounds.";

function queryCase(nn, slug, { operation, queries, results, clauses, discriminates, defaults }) {
  addCase("fields", nn, slug, {
    operation, inputArtifacts: [pin("snapshot", docs.basic), artifact("queries", queries)],
    expectedArtifacts: [artifact("result", results), artifact("snapshot", unchangedSnapshotResult(S0)), artifact("events", []), artifact("twin", { result: results })],
    expectedStatus: results.length === 1 && results[0].status === "refused" ? `refused:${results[0].code}` : "ok", comparatorIds: QUERY_CMP,
    clauses: [...clauses, cite("10.1", 737)], discriminates, defaults,
  });
}
const rec = (notion, field, widget, path, labelKey, { present, value, display, mutable = true, choices = [], targetTypes = [] }, locale = "en") => ({
  notion, field, widget, path, label: { key: labelKey, text: text(labelKey, locale) }, message: { key: "field.invalid", text: text("field.invalid", locale) },
  present, ...(present ? { value, display: display === undefined ? value : display } : {}), mutable, choices, targetTypes,
});
const listed = (targetId, fields) => pureOk({ revision: R0, targetId, fields });
const nameRec = (notion, value, extra = {}, locale = "en") => rec(notion, "name", "text", "/name", "field.name", { present: true, value, ...extra }, locale);
const callTarget = (value, mutable = true) => rec("call", "target", "reference", "/calledElement", "field.call-target", { present: true, value, mutable, targetTypes: ["bpmn:Process"] });
const ANCHOR_TYPES = ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity"];

export function fields() {
  // ------------------------------------------------------------ field states (listFields)
  const state = (nn, slug, targetId, fieldList, discriminates, extra = [], locale = "en") => queryCase(nn, slug, {
    operation: "listFields", queries: [{ baseRevision: R0, targetId, locale }], results: [listed(targetId, fieldList)],
    clauses: [cite("8.3", 653), cite("8.3", 655), ...extra], discriminates, defaults: [FIELD_DEFAULT],
  });
  state(1, "state-task", "Task_A", [nameRec("task", "Check order")],
    "Shows the ID, a port or a hash as an ordinary input, or derives the label from the theme instead of the message table.");
  state(2, "state-task-fr", "Task_A", [nameRec("task", "Check order", {}, "fr")],
    "Ignores the requested locale or falls back to the message key although an fr text exists (the message falls back to en).", [cite("8.3", 659)], "fr");
  state(3, "state-aid", "Note_1", [rec("aid", "body", "multiline", "/text", "field.body", { present: true, value: "[Aid] spreadsheet", display: "spreadsheet" })],
    "Displays the stored text with its marker, or strips the marker by rewriting the stored text.", [cite("9.3", 702), cite("2.2", 115)]);
  state(4, "state-aid-no-space", "Note_2", [rec("aid", "body", "multiline", "/text", "field.body", { present: true, value: "[Aid]calculator", display: "[Aid]calculator" })],
    "Strips a partial marker (\"[Aid]\" without the configured separator), returning \"calculator\"; stripPrefix must return the original value when the exact prefix does not match.", [cite("2.2", 115), cite("9.3", 702)]);
  state(5, "state-note-leading-space", "Note_3", [rec("note", "text", "multiline", "/text", "field.text", { present: true, value: " [Aid] ledger" })],
    "Trims leading whitespace before the trim:none textPrefix test and recognizes the annotation as an aid.", [cite("2.3", 146), cite("2.3", 152)]);
  state(6, "state-process", "Proc_main", [
    nameRec("process", "Order handling"),
    rec("process", "kind", "enum", "/processType", "field.kind", { present: false, choices: [{ name: "none", value: "None" }, { name: "public", value: "Public" }, { name: "private", value: "Private" }] }),
    rec("process", "executable", "readonly", "/isExecutable", "field.executable", { present: true, value: false, mutable: false }),
  ], "Fills the absent processType with a descriptor default, or reports the readonly field as mutable.", [cite("2.1", 79), cite("8.3", 659)]);
  state(7, "state-call", "Call_1", [nameRec("call", "Run review"), callTarget("Proc-review")],
    "Shows the called Process name as the stored value, or resolves the called element by name instead of by ID.", [cite("8.3", 657)]);
  state(8, "state-user-task", "Task_B", [nameRec("user-task", "Approve order")],
    "Recognizes the UserTask also as the task notion (assignable recognition), producing two exclusive-group matches or duplicated fields.", [cite("2.3", 154)]);
  state(34, "state-call-locked", "Call_4", [nameRec("call", "[Locked] Archive run"), callTarget("ProcArchive", false)],
    "Ignores the field mutability predicate (offering the locked call target as editable).", []);
  state(35, "state-call-hidden", "Call_5", [nameRec("call", "[Hidden] Legacy run")],
    "Lists a field whose visibility predicate is false (the hidden call target), or lists it as present but immutable.", []);
  state(36, "state-choice-upper", "Flow_2", [rec("flow", "choice", "text", "/name", "field.choice", { present: true, value: D.CHOICE_NAME, display: D.CHOICE_UPPER })],
    "Displays the stored name, upper-cases with a locale-dependent or simple per-character mapping (\"FİT\" or \"STRAßE\"), or rewrites storage to the display text.", [cite("2.2", 116), cite("8.3", 655)]);
  state(37, "state-aid-link-anchor", "AidLink_1", [rec("aid-link", "target", "reference", "/targetRef", "field.anchor", { present: true, value: "Task_B", targetTypes: ANCHOR_TYPES })],
    "Shows the anchor's name as the stored value, or offers no field for an Association recognized by its direction.", []);
  state(38, "state-no-fields", "Link_1", [],
    "Shows generic BPMN properties (direction, endpoints) for a notion that declares no field.", []);

  // ------------------------------------------------------------ on-change checks (checkField)
  const valid = { revision: R0, valid: true };
  const invalid = code => ({ revision: R0, valid: false, code, messageKey: "field.invalid" });
  const check = (nn, slug, queries, results, discriminates, extra = []) => queryCase(nn, slug, {
    operation: "checkField", queries: queries.map(([targetId, fieldId, value]) => ({ baseRevision: R0, targetId, fieldId, value })), results,
    clauses: [cite("8.3", 659), ...extra], discriminates, defaults: [CHECK_DEFAULT],
  });
  check(39, "check-enum", [["Proc_main", "kind", "Public"], ["Proc_main", "kind", "public"], ["Proc_main", "kind", "PUBLIC"]],
    [pureOk(valid), pureOk(invalid("profile-type")), pureOk(invalid("profile-type"))],
    "Accepts a choice name or a case-folded value on change, or validates on change differently from submit.", [cite("8.3", 655)]);
  check(40, "check-reference", [["Call_1", "target", "ProcArchive"], ["Call_1", "target", "Store_1"], ["Call_1", "target", "Proc_missing"], ["Call_1", "target", "Archive records \u{10000}"]],
    [pureOk(valid), pureOk(invalid("profile-type")), pureOk(invalid("reference-dangling")), pureOk(invalid("reference-dangling"))],
    "Accepts any existing ID, an unresolved ID or a displayed label for a reference widget (reference widgets submit IDs of the targetTypes).", [cite("8.3", 657)]);
  check(41, "check-text", [["Task_A", "name", ""], ["Task_A", "name", 5], ["Task_A", "name", true]],
    [pureOk(valid), pureOk(invalid("profile-type")), pureOk(invalid("profile-type"))],
    "Treats the explicit empty string as invalid, or coerces a number or a Boolean to text.", [cite("2.2", 114)]);
  check(42, "check-denied", [["Call_4", "target", "Proc-review"], ["Call_5", "target", "Proc-review"], ["Proc_main", "executable", true]],
    [pureOk(invalid("profile-producer")), pureOk(invalid("profile-producer")), pureOk(invalid("profile-producer"))],
    "Reports an immutable, hidden or readonly field as valid on change although its submit refuses.", [cite("8.3", 653), cite("8.3", 649)]);
  check(43, "check-unknown-field", [["Call_1", "owner", "Proc-review"]], [pureRefused("profile-symbol")],
    "Answers valid:false (or valid:true) for a field that no recognized notion declares instead of refusing the unknown field symbol.", [cite("2.4.1", 190)]);
  check(44, "check-unknown-target", [["Nope", "name", "x"]], [pureRefused("reference-dangling")],
    "Validates against an implicit default target, or answers valid for a target that names no element.", [cite("2.2", 132)]);
  queryCase(45, "check-stale-revision", { operation: "checkField", queries: [{ baseRevision: "0".repeat(64), targetId: "Task_A", fieldId: "name", value: "x" }],
    results: [pureRefused("operation-error")], clauses: [cite("8.3", 659), cite("8.2", 629)], defaults: [CHECK_DEFAULT, "Harmonization C10: a stale revision refuses operation-error."],
    discriminates: "Validates a submission against the current state although the caller's revision is stale." });

  // ------------------------------------------------------------ field submissions
  const FIELD_CLAUSES = [cite("8.3", 653), cite("8.3", 655), cite("8.3", 659)];
  const edit = (nn, slug, notion, field, target, value, mutate, { unnamed = [], relabel = [], extra = [], discriminates, defaults }) => {
    const tree = fresh(); mutate(tree);
    ok("fields", nn, slug, { transactionId: `tx-fields-${slug}`, commands: [fieldCommand(notion, field, { target, value })], tree, phase: "edit",
      opts: { unnamed, relabel }, clauses: [...FIELD_CLAUSES, ...extra], discriminates, defaults });
  };
  edit(9, "edit-task-name", "task", "name", "Task_A", "Verify order", t => { find(t, "Task_A").name = "Verify order"; }, { relabel: ["Task_A"],
    discriminates: "Edits the name through the upstream properties/label command (separate history entry, no lint), or trims the submitted text." });
  edit(10, "edit-situations-crlf", "start", "situations", "Start_1", "Order received\r\nOrder amended", t => { find(t, "Start_1").name = "Order received\r\nOrder amended"; }, { relabel: ["Start_1"],
    extra: [cite("4.2", 387)], discriminates: "Normalizes CRLF to LF (or trims lines) in the multiline widget; the submitted string is stored exactly, without implicit conversion." });
  edit(11, "edit-empty-name", "task", "name", "Task_A", "", t => { find(t, "Task_A").name = ""; },
    { unnamed: ["Task_A"], relabel: ["Task_A"], discriminates: "Removes the name property (omission) instead of storing the explicit empty string, or refuses the empty text." });
  edit(12, "edit-aid-body", "aid", "body", "Note_1", "spreadsheet, calculator", t => { find(t, "Note_1").text = "[Aid] spreadsheet, calculator"; }, { relabel: ["Note_1"],
    extra: [cite("9.3", 702)], discriminates: "Stores the body without restoring the configured marker, or restores it twice." });
  edit(13, "edit-aid-body-typed-marker", "aid", "body", "Note_1", "[Aid] tool", t => { find(t, "Note_1").text = "[Aid] [Aid] tool"; }, { relabel: ["Note_1"],
    extra: [cite("9.3", 702)], discriminates: "Deduplicates a marker typed by the user (stores \"[Aid] tool\"); the recipe restores the marker exactly once and display(stored) must return the submitted body." });
  edit(14, "edit-aid-no-space-keeps-evidence", "aid", "body", "Note_2", "calculator", t => { find(t, "Note_2").text = "[Aid] calculator"; }, { relabel: ["Note_2"],
    extra: [cite("9.3", 702), cite("4", 356)],
    discriminates: "Keeps the legacy partial marker \"[Aid]calculator\", or rewrites or drops the annotation's source Documentation evidence while editing the marked text (L653: without touching source evidence)." });
  edit(15, "edit-call-target-keeps-evidence", "call", "target", "Call_1", "ProcArchive", t => { find(t, "Call_1").calledElement = "ProcArchive"; },
    { extra: [cite("8.3", 657), cite("4", 356)], discriminates: "Submits the displayed label (\"Archive records\") or a QName instead of the ID, or drops the call's source Documentation." });
  edit(16, "edit-process-kind", "process", "kind", "Proc_main", "Public", t => { t.rootElements[0].processType = "Public"; },
    { discriminates: "Stores the choice name (\"public\") or its localized label instead of its JSON value \"Public\"." });
  edit(17, "edit-reference-override", "reference", "override", "Ref_1", "Handbook copy", t => { find(t, "Ref_1").name = "Handbook copy"; }, { relabel: ["Ref_1"],
    extra: [cite("4.4", 408)], discriminates: "Propagates the local reference-name override to the shared DataStore name." });
  edit(18, "edit-store-title", "store", "title", "Store_1", "Policy manual", t => { find(t, "Store_1").name = "Policy manual"; }, { relabel: ["Ref_1"],
    extra: [cite("4.4", 408)], discriminates: "Renaming the store writes names onto its references (Ref_1) instead of leaving the fallback label derivation to the store." });
  noop("fields", 19, "edit-no-op", { transactionId: "tx-fields-noop", commands: [fieldCommand("task", "name", { target: "Task_A", value: "Check order" })], phase: "edit",
    clauses: [...FIELD_CLAUSES], discriminates: "Records a history entry or emits onChange for a submission that produces no difference." });
  refused("fields", 20, "edit-call-target-wrong-type", { transactionId: "tx-fields-wrong-type", code: "profile-type",
    commands: [fieldCommand("call", "target", { target: "Call_1", value: "Store_1" })], phase: "edit", clauses: [cite("8.3", 657), cite("8.3", 655)],
    discriminates: "Accepts any existing ID for a reference field instead of revalidating the submitted ID against targetTypes [bpmn:Process] at commit." });
  refused("fields", 21, "edit-call-target-dangling", { transactionId: "tx-fields-dangling", code: "reference-dangling",
    commands: [fieldCommand("call", "target", { target: "Call_1", value: "Proc_missing" })], phase: "edit", clauses: [cite("8.3", 657), cite("4.1", 378)],
    discriminates: "Stores an unresolved called element (or creates a placeholder Process) instead of revalidating existence at commit." });
  refused("fields", 22, "edit-enum-not-a-choice", { transactionId: "tx-fields-enum", code: "profile-type",
    commands: [fieldCommand("process", "kind", { target: "Proc_main", value: "public" })], phase: "edit", clauses: [cite("8.3", 659), cite("2.3", 145)],
    defaults: ["DESIGN names no dedicated code for a value outside the enum choices; submit validation uses the type/value refusal profile-type (no case folding or coercion; Python binding S5 §4.3)."],
    discriminates: "Case-folds \"public\" to the choice value \"Public\" or stores a value outside the declared choices." });
  refused("fields", 23, "edit-readonly", { transactionId: "tx-fields-readonly", code: "profile-producer",
    commands: [fieldCommand("process", "executable", { target: "Proc_main", value: true })], phase: "edit", clauses: [cite("8.3", 655), cite("8.3", 659)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Writes isExecutable through the generic properties path although the field is readonly (no command)." });
  refused("fields", 24, "edit-number-no-coercion", { transactionId: "tx-fields-number", code: "profile-type",
    commands: [fieldCommand("task", "name", { target: "Task_A", value: 5 })], phase: "edit", clauses: [cite("8.3", 659), cite("2.2", 114)],
    discriminates: "Coerces the number 5 to the string \"5\" for a text field instead of refusing the ill-typed submission (no implicit scalar coercion)." });
  {
    const tree = fresh(); find(tree, "Task_A").name = "Verify order";
    const commands = [surface("rename-direct", { target: "Task_A", value: "Verify order" })];
    const t = transaction(S0, "tx-fields-direct", commands);
    const x = okCommand(S0, t, tree, { relabel: ["Task_A"], selection: selectionValid(SNAPSHOT_LAYOUT), gesture: true });
    addCase("fields", 25, "direct-edit-gesture", {
      operation: "canvas.gesture", phase: "edit", inputArtifacts: [pin("snapshot", docs.basic)],
      commandArtifact: artifact("gesture", { gesture: "direct-edit", occurrence: { pageId: "page-main", occurrenceKey: "occ:Task_A" }, text: "Verify order", transactionId: "tx-fields-direct" }),
      expectedArtifacts: artifactsOf(x, { staged: { transactionId: "tx-fields-direct", commands }, gesture: true }),
      expectedStatus: "ok", comparatorIds: GESTURE_IDS, clauses: [cite("8.3", 649), cite("8.3", 657), cite("8.2", 637), cite("8.2", 632), cite("8.2", 633), cite("8.2", 641)],
      discriminates: "Commits the upstream direct-editing label update (element.updateLabel) as its own command instead of the canonical direct-edit surface; the envelope must equal the field-edit case.",
    });
  }
  {
    const tree = fresh(); find(tree, "Note_1").text = "[Aid] spreadsheet, scanner";
    const commands = [surface("aid-direct-edit", { target: "Note_1", value: "spreadsheet, scanner" })];
    const t = transaction(S0, "tx-fields-direct-aid", commands);
    const x = okCommand(S0, t, tree, { relabel: ["Note_1"], selection: selectionValid(SNAPSHOT_LAYOUT), gesture: true });
    addCase("fields", 26, "direct-edit-aid-gesture", {
      operation: "canvas.gesture", phase: "edit", inputArtifacts: [pin("snapshot", docs.basic)],
      commandArtifact: artifact("gesture", { gesture: "direct-edit", occurrence: { pageId: "page-main", occurrenceKey: "occ:Note_1" }, text: "spreadsheet, scanner", transactionId: "tx-fields-direct-aid" }),
      expectedArtifacts: artifactsOf(x, { staged: { transactionId: "tx-fields-direct-aid", commands }, gesture: true }),
      expectedStatus: "ok", comparatorIds: GESTURE_IDS, clauses: [cite("8.3", 653), cite("9.3", 702), cite("8.2", 637), cite("8.2", 632), cite("8.2", 633)],
      defaults: ["Direct-edit dispatch: among direct-edit entries whose ui.when holds, the one whose recipe `when` holds is staged (aid-direct-edit for a marked annotation)."],
      discriminates: "Edits the raw stored text (losing the marker) or stages note-direct-edit for a marked annotation.",
    });
  }
  refused("fields", 46, "edit-locked-target", { transactionId: "tx-fields-locked", code: "profile-producer",
    commands: [fieldCommand("call", "target", { target: "Call_4", value: "Proc-review" })], phase: "edit", clauses: [cite("8.3", 653), cite("8.3", 649)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Writes a field whose mutability predicate is false because the programmatic path skips the predicate the panel uses." });
  refused("fields", 47, "edit-hidden-target", { transactionId: "tx-fields-hidden", code: "profile-producer",
    commands: [fieldCommand("call", "target", { target: "Call_5", value: "ProcArchive" })], phase: "edit", clauses: [cite("8.3", 653), cite("8.3", 649)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Writes a field whose visibility predicate is false (an invisible field is not an authorization boundary either)." });
  refused("fields", 48, "edit-unknown-field", { transactionId: "tx-fields-unknown", code: "profile-symbol",
    commands: [fieldCommand("call", "owner", { target: "Call_1", value: "Proc-review" })], phase: "edit", clauses: [cite("2.4.1", 190), cite("8.3", 655)],
    discriminates: "Writes the generic property named by an undeclared field ID instead of refusing the unknown field symbol." });
  refused("fields", 49, "edit-unknown-target", { transactionId: "tx-fields-target", code: "reference-dangling",
    commands: [fieldCommand("task", "name", { target: "Nope", value: "x" })], phase: "edit", clauses: [cite("8.3", 655), cite("2.2", 132)],
    discriminates: "Creates the element or applies the edit to the selected element when the target handle names no element." });
  refused("fields", 50, "edit-value-omitted", { transactionId: "tx-fields-omitted", code: "profile-ui-parameters",
    commands: [fieldCommand("task", "name", { target: "Task_A" })], phase: "edit", clauses: [cite("8.3", 655), cite("8.3", 659)],
    discriminates: "Treats an omitted value as the explicit empty string or removes the name (omission is not an empty text)." });
  refused("fields", 51, "edit-boolean-no-coercion", { transactionId: "tx-fields-boolean", code: "profile-type",
    commands: [fieldCommand("task", "name", { target: "Task_A", value: true })], phase: "edit", clauses: [cite("8.3", 659), cite("2.2", 114)],
    discriminates: "Coerces the Boolean true to the name \"true\" (String(value)) instead of refusing the ill-typed submission." });
  edit(52, "edit-aid-link-anchor", "aid-link", "target", "AidLink_1", "Task_X", t => { find(t, "AidLink_1").targetRef = "Task_X"; },
    { extra: [cite("8.3", 657), cite("2.4", 166)], discriminates: "Submits the anchor's name, or re-creates the association with a new ID instead of re-pointing its targetRef." });
  refused("fields", 53, "edit-aid-link-other-process", { transactionId: "tx-fields-anchor-owner", code: "profile-type",
    commands: [fieldCommand("aid-link", "target", { target: "AidLink_1", value: "Task_R" })], phase: "edit", clauses: [cite("8.3", 657), cite("2.4", 166), cite("4", 358)],
    defaults: [PICK_DEFAULT],
    discriminates: "Accepts a candidate of the right type owned by another Process (a cross-owner association) because only targetTypes is revalidated at commit." });

  // ------------------------------------------------------------ reference picking (queryReferences)
  const pick = (nn, slug, targetId, fieldId, q, offset, limit, result, discriminates, extra = []) => queryCase(nn, slug, {
    operation: "queryReferences", queries: [{ baseRevision: R0, targetId, fieldId, query: q, offset, limit }], results: [result],
    clauses: [cite("8.3", 657), ...extra], discriminates, defaults: [PICK_DEFAULT],
  });
  const c = (id, type, label) => ({ id, type, label });
  const processes = [c("Proc-review", "bpmn:Process", "Révision cycle"), c("ProcArchive", "bpmn:Process", "Archive records \u{10000}"), c("Proc_main", "bpmn:Process", "Order handling")];
  const page = list => pureOk({ candidates: list, revision: R0 });
  pick(27, "candidates-all", "Call_1", "target", "", 0, 10, page(processes), "Sorts with localeCompare (Proc_main first) or by label, or lists DataStores/Tasks that the targetTypes exclude.", [cite("2.2", 123)]);
  pick(28, "candidates-case", "Call_1", "target", "cycle", 0, 10, page([processes[0]]), "Matches on a normalized or folded label in a way that misses the literal substring.");
  pick(29, "candidates-case-miss", "Call_1", "target", "Cycle", 0, 10, page([]), "Uses case-insensitive matching (\"Cycle\" would match \"Révision cycle\").");
  pick(30, "candidates-normalization", "Call_1", "target", "Révision", 0, 10, page([]), "Applies NFC/NFD normalization so that decomposed e + U+0301 matches the precomposed é.");
  pick(31, "candidates-paging", "Call_1", "target", "", 1, 1, page([processes[1]]), "Pages before sorting (returning the second Process in document order, Proc-review), or treats offset as 1-based.");
  pick(32, "candidates-astral", "Call_1", "target", "\u{10000}", 0, 10, page([processes[1]]), "Iterates labels by UTF-16 code units in a way that drops or splits the astral scalar.");
  pick(33, "candidates-unknown-field", "Call_1", "owner", "", 0, 10, pureRefused("profile-symbol"), "Returns all elements for an undeclared field instead of refusing the unknown field symbol.", [cite("2.4.1", 190)]);
  const anchors = [
    c("Call_1", "bpmn:CallActivity", "Run review"), c("Call_2", "bpmn:CallActivity", "Révision cycle"), c("Call_3", "bpmn:CallActivity", "Draft call"),
    c("Call_4", "bpmn:CallActivity", "[Locked] Archive run"), c("Call_5", "bpmn:CallActivity", "[Hidden] Legacy run"),
    c("Task_A", "bpmn:Task", "Check order"), c("Task_B", "bpmn:UserTask", "Approve order"), c("Task_X", "bpmn:Task", "Standalone check"), c("Task_Y", "bpmn:UserTask", "Standalone approval"),
  ];
  pick(54, "candidates-anchor-ownership", "AidLink_1", "target", "", 0, 20, page(anchors),
    "Offers Task_R of Proc-review (wrong effective ownership), StartEvents (outside targetTypes), or sorts the calls after the tasks by label.", [cite("4", 358)]);
  pick(55, "candidates-locked-field", "Call_4", "target", "", 0, 10, page([]), "Offers candidates for a field whose mutability predicate is false.", [cite("8.3", 653)]);
  pick(56, "candidates-hidden-field", "Call_5", "target", "", 0, 10, page([]), "Offers candidates for a field whose visibility predicate is false.", [cite("8.3", 653)]);
  pick(57, "candidates-not-reference", "Call_1", "name", "", 0, 10, pureRefused("profile-type"), "Lists elements for a text widget as if it were a reference field.");
  pick(58, "candidates-negative-offset", "Call_1", "target", "", -1, 10, pureRefused("profile-bounds"), "Clamps a negative offset to zero instead of refusing invalid paging.", [cite("2.4.1", 189)]);
  pick(59, "candidates-fractional-limit", "Call_1", "target", "", 0, 1.5, pureRefused("profile-bounds"), "Truncates a fractional limit to 1 instead of refusing invalid paging.", [cite("2.4.1", 189)]);
  pick(60, "candidates-boolean-limit", "Call_1", "target", "", 0, true, pureRefused("profile-bounds"), "Coerces the Boolean limit true to 1 (JavaScript Number(true)) and returns one candidate instead of refusing invalid paging.", [cite("2.4.1", 189)]);
  pick(61, "candidates-unknown-target", "Nope", "target", "", 0, 10, pureRefused("reference-dangling"), "Answers candidates (for example every Process) for a target handle that names no element instead of refusing it.", [cite("2.2", 132)]);
  queryCase(62, "candidates-stale-revision", { operation: "queryReferences", queries: [{ baseRevision: "0".repeat(64), targetId: "Call_1", fieldId: "target", query: "", offset: 0, limit: 10 }],
    results: [pureRefused("operation-error")], clauses: [cite("8.3", 657)], defaults: [PICK_DEFAULT, "Harmonization C10: a stale revision refuses operation-error."],
    discriminates: "Answers from the current state although the caller's baseRevision is stale (candidates must match the revision they are offered for)." });
}
