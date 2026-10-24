// Group "paste": read-only copy fragments (harmonization B20), paste as an
// explicit creation with ID reallocation (harmonization D6), external
// references, one C/N pass per batch, cut.
import { addCase, artifact, pin, cite, docs, clone, stableId, jcs, fe, find, removeIds, okCommand, transaction, surface, fieldCommand, artifactsOf,
  pureOk, pureRefused, unchangedSnapshotResult, selectionValid, T0, S0, R0, S0review, SF, D, GESTURE_IDS } from "./lot5-kit.mjs";
import { ok, refused, PRODUCER_DEFAULT, SNAPSHOT_LAYOUT } from "./lot5-group-commands.mjs";

const fresh = () => clone(T0);
/** Harmonization D6: every ID X of the fragment becomes stable-id/1(owner, "paste", JCS([key, X])). */
export const pasteId = (owner, key, sourceId) => stableId(owner, "paste", jcs([key, sourceId]));
/** NativeFragment/1 (B20): {fragmentVersion, sourceRevision, elements:[{property, element}]}, source document pre-order. */
export const fragment = (sourceRevision, elements) => ({ fragmentVersion: "1", sourceRevision, elements: elements.map(([property, element]) => ({ property, element: clone(element) })) });
export const paste = (owner, key, frag) => ({ command: "surface", entry: "paste-elements", context: { owner, key }, fragment: frag });
const occ = (pageId, semanticId, edge) => ({ pageId, semanticId, role: "content", ...(edge ? { edge: { source: edge[0], target: edge[1] } } : {}) });
const PASTE_DEFAULTS = [
  "Fragment (harmonization B20) = {fragmentVersion:\"1\", sourceRevision, elements:[{property, element}]}: the requested ID-bearing subtrees, deduplicated, without elements contained in another requested element, in source document pre-order, each with its containment property in the source parent.",
  "Paste allocation (harmonization D6): every ID X inside the fragment becomes stable-id/1(paste owner, \"paste\", JCS([insertionKey, X])); a reference to a fragment ID is rewritten, any other reference is kept only when it resolves in the destination with an admitted type (else reference-dangling); each root is appended to owner[property] in fragment order.",
];
const COPY_CMP = ["lot5/result", "lot5/snapshot", "lot5/events", "lot5/twin"];

export function pasteGroup() {
  const task = find(T0, "Task_A"), user = find(T0, "Task_B"), flow2 = find(T0, "Flow_2"), ref1 = find(T0, "Ref_1"), call1 = find(T0, "Call_1");
  const copy = (nn, slug, elementIds, result, discriminates, { base = R0, extra = [] } = {}) => addCase("paste", nn, slug, {
    operation: "copy", inputArtifacts: [pin("snapshot", docs.basic), artifact("queries", [{ baseRevision: base, elementIds }])],
    expectedArtifacts: [artifact("result", [result]), artifact("snapshot", unchangedSnapshotResult(S0)), artifact("events", []), artifact("twin", { result: [result] })],
    expectedStatus: result.status === "ok" ? "ok" : `refused:${result.code}`, comparatorIds: COPY_CMP,
    clauses: [cite("8.3", 657), cite("10.1", 737), ...extra], discriminates, defaults: PASTE_DEFAULTS,
  });
  const fragTask = fragment(R0, [["flowElements", task]]);
  const fragGroup = fragment(R0, [["flowElements", task], ["flowElements", user], ["flowElements", flow2]]);
  const fragRef = fragment(R0, [["flowElements", ref1]]);
  const fragCall = fragment(R0, [["flowElements", call1]]);
  copy(1, "copy-task", ["Task_A"], pureOk(fragTask), "Copies through a mutating command (revision, history or event changes), or drops the source ID needed for remapping.");
  copy(2, "copy-group", ["Flow_2", "Task_B", "Task_A"], pureOk(fragGroup), "Orders fragment elements by request order or UTF-16 ID instead of source document pre-order.");

  {
    const key = "pk-003", id = pasteId("Proc_main", key, "Task_A");
    const tree = fresh(); fe(tree).push({ $type: "bpmn:Task", id, name: "Check order" });
    const commands = [paste("Proc_main", key, fragTask)];
    ok("paste", 3, "paste-task", { transactionId: "tx-paste-003", commands, tree, opts: { add: [occ("page-main", id)] }, phase: "create",
      clauses: [cite("8.3", 653), cite("2.4", 174), cite("3.2", 288), cite("3.2", 276), cite("3.2", 278, 282)], defaults: PASTE_DEFAULTS,
      discriminates: "Keeps the copied ID (duplicate Task_A), suffixes it (Task_A_1), uses an upstream random ID, or allocates with the containment-property slot instead of the D6 paste slot." });
    const t = transaction(S0, "tx-paste-003", commands);
    const x = okCommand(S0, t, tree, { add: [occ("page-main", id)], selection: selectionValid(SNAPSHOT_LAYOUT), gesture: true });
    addCase("paste", 4, "paste-gesture", {
      operation: "canvas.gesture", phase: "create", inputArtifacts: [pin("snapshot", docs.basic)],
      commandArtifact: artifact("gesture", { gesture: "keyboard", key: "Ctrl+V", pageId: "page-main", container: "Proc_main", fragment: fragTask, insertionKey: key, transactionId: "tx-paste-003" }),
      expectedArtifacts: artifactsOf(x, { staged: { transactionId: "tx-paste-003", commands }, gesture: true }),
      expectedStatus: "ok", comparatorIds: GESTURE_IDS, clauses: [cite("8.3", 657), cite("8.2", 637), cite("8.2", 632), cite("8.2", 633)], defaults: PASTE_DEFAULTS,
      discriminates: "Routes keyboard paste through upstream copy-paste (separate authority) instead of the canonical paste surface.",
    });
  }
  {
    const key = "pk-005", a = pasteId("Proc_main", key, "Task_A"), b = pasteId("Proc_main", key, "Task_B"), f = pasteId("Proc_main", key, "Flow_2");
    const tree = fresh();
    fe(tree).push({ $type: "bpmn:Task", id: a, name: "Check order" }, { $type: "bpmn:UserTask", id: b, name: "Approve order" }, { $type: "bpmn:SequenceFlow", id: f, name: D.CHOICE_NAME, sourceRef: a, targetRef: b });
    ok("paste", 5, "paste-group", { transactionId: "tx-paste-005", commands: [paste("Proc_main", key, fragGroup)], tree, phase: "create",
      opts: { add: [occ("page-main", a), occ("page-main", b), occ("page-main", f, [a, b])] },
      clauses: [cite("8.3", 653), cite("2.4", 174)], defaults: PASTE_DEFAULTS,
      discriminates: "Leaves the pasted flow pointing at the original Task_A/Task_B (no internal remap), or downgrades the pasted UserTask to Task." });
  }
  {
    const key = "pk-006", id = pasteId("Proc-review", key, "Ref_1");
    const tree = fresh(); fe(tree, 1).push({ $type: "bpmn:DataStoreReference", id, dataStoreRef: "Store_1" });
    ok("paste", 6, "paste-reference-shared-store", { snap: S0review, doc: docs.basicReview, transactionId: "tx-paste-006", commands: [paste("Proc-review", key, fragRef)], tree, phase: "create",
      opts: { add: [occ("page-review", id)] }, clauses: [cite("8.3", 653), cite("4.4", 408)], defaults: PASTE_DEFAULTS,
      discriminates: "Duplicates the root DataStore for the pasted reference, or drops the valid external dataStoreRef." });
  }
  refused("paste", 7, "paste-cross-document-dangling", { snap: SF, doc: docs.foreign, transactionId: "tx-paste-007", code: "reference-dangling",
    commands: [paste("Proc_other", "pk-007", fragRef)], phase: "create", clauses: [cite("8.3", 653), cite("2.2", 132)], defaults: PASTE_DEFAULTS,
    discriminates: "Pastes the reference with a dangling dataStoreRef, or silently drops the reference/creates a store, instead of refusing the invalid external reference." });
  {
    const draftTree = { $type: "bpmn:Definitions", id: "Defs_drafts", targetNamespace: "urn:example:lot5-drafts", exporterVersion: "ui-neutral-base/1",
      rootElements: [{ $type: "bpmn:Process", id: "Proc_drafts", isExecutable: false, flowElements: [{ $type: "bpmn:Task", id: "Draft_1", name: "" }, { $type: "bpmn:Task", id: "Draft_2", name: "" }] }] };
    const source = D.envelope(draftTree);
    const frag = fragment(source.semanticRevision, [["flowElements", draftTree.rootElements[0].flowElements[0]], ["flowElements", draftTree.rootElements[0].flowElements[1]]]);
    const key = "pk-008", a = pasteId("Proc_main", key, "Draft_1"), b = pasteId("Proc_main", key, "Draft_2");
    const tree = fresh(); fe(tree).push({ $type: "bpmn:Task", id: a, name: "" }, { $type: "bpmn:Task", id: b, name: "" });
    ok("paste", 8, "paste-batch-one-pass", { transactionId: "tx-paste-008", commands: [paste("Proc_main", key, frag)], tree, phase: "create",
      opts: { unnamed: [a, b], add: [occ("page-main", a), occ("page-main", b)] }, clauses: [cite("8.3", 653), cite("8.2", 631)], defaults: PASTE_DEFAULTS,
      discriminates: "Runs C/lint/N once per pasted element (duplicated findings or two history entries) instead of once for the batch." });
  }
  refused("paste", 9, "paste-into-task", { transactionId: "tx-paste-009", code: "profile-producer", commands: [paste("Task_A", "pk-009", fragTask)], phase: "create",
    clauses: [cite("8.3", 649)], defaults: [PRODUCER_DEFAULT],
    discriminates: "Pastes into a non-container owner through the programmatic path." });
  {
    // Cut = read-only copy fragment plus one delete transaction with declared dependents.
    const tree = fresh(); removeIds(tree, ["Ref_1", "Link_1"]);
    const commands = [surface("delete-element", { target: "Ref_1" })];
    const x = okCommand(S0, transaction(S0, "tx-paste-cut", commands), tree, { remove: ["Ref_1", "Link_1"], selection: selectionValid(SNAPSHOT_LAYOUT), gesture: true });
    addCase("paste", 10, "cut-reference", {
      operation: "canvas.gesture", phase: "edit", inputArtifacts: [pin("snapshot", docs.basic)],
      commandArtifact: artifact("gesture", { gesture: "keyboard", key: "Ctrl+X", selection: [{ pageId: "page-main", occurrenceKey: "occ:Ref_1" }], transactionId: "tx-paste-cut" }),
      expectedArtifacts: [artifact("clipboard", fragRef), ...artifactsOf(x, { staged: { transactionId: "tx-paste-cut", commands }, gesture: true })],
      expectedStatus: "ok", comparatorIds: ["lot5/clipboard", ...GESTURE_IDS], clauses: [cite("8.3", 653), cite("8.3", 657), cite("8.2", 632), cite("8.2", 633)], defaults: PASTE_DEFAULTS,
      discriminates: "Cuts without removing the dependent reference link (orphan shell), or copies the link although it was not selected.",
    });
  }
  copy(11, "copy-stale-revision", ["Task_A"], pureRefused("operation-error"), "Copies from the current state although the caller's revision is stale.",
    { base: "0".repeat(64), extra: [cite("8.2", 629)] });
  copy(12, "copy-unknown-id", ["Nope"], pureRefused("reference-dangling"), "Returns an empty fragment (or skips the ID) instead of refusing an element ID that names nothing.", { extra: [cite("2.2", 132)] });
  copy(13, "copy-definitions-root", ["Defs_ui"], pureRefused("profile-type"), "Copies the whole Definitions root, which no paste owner can contain.", { extra: [cite("2.4", 174)] });
  {
    const key = "pk-014", id = pasteId("Proc_main", key, "Task_A");
    const tree = fresh(); fe(tree).push({ $type: "bpmn:Task", id, name: "Check order copy" });
    ok("paste", 14, "paste-then-edit-same-batch", { transactionId: "tx-paste-014", commands: [paste("Proc_main", key, fragTask), fieldCommand("task", "name", { target: id, value: "Check order copy" })],
      tree, opts: { add: [occ("page-main", id)] }, phase: "create", clauses: [cite("8.3", 653), cite("8.2", 631), cite("8.2", 632)], defaults: PASTE_DEFAULTS,
      discriminates: "Validates the second command against the pre-batch state (the pasted ID is unknown) instead of the stage left by the paste, or records two history entries." });
  }
  {
    const key = "pk-015", id = pasteId("Proc_main", key, "Call_1");
    const tree = fresh(); fe(tree).push({ ...clone(call1), id });
    ok("paste", 15, "paste-call-keeps-evidence", { transactionId: "tx-paste-015", commands: [paste("Proc_main", key, fragCall)], tree, opts: { add: [occ("page-main", id)] }, phase: "create",
      clauses: [cite("8.3", 653), cite("4", 356), cite("3.2", 288)], defaults: PASTE_DEFAULTS,
      discriminates: "Drops the ID-less Documentation evidence of the copied call, assigns an ID to it, or drops the valid internal calledElement reference." });
  }
}
