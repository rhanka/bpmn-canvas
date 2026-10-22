// Lot-5 synthetic input documents, authored by hand: native trees, Layout/1
// pages and geometry, Snapshot/1 records. Digests use the standalone helper.
import { H, clone, noNull } from "./lot5-arith.mjs";
import { profileIdentity, themes, metricsSha256, descriptorPin } from "./lot5-profile.mjs";

const node = ($type, id, fields = {}) => ({ $type, id, ...fields });
const flow = (id, sourceRef, targetRef, fields = {}) => node("bpmn:SequenceFlow", id, { sourceRef, targetRef, ...fields });
// Flow_2 carries a choice name whose full Unicode 15.0.0 upper case expands ß
// to SS and keeps a dotless capital I (no Turkish locale mapping).
export const CHOICE_NAME = "Fit straße", CHOICE_UPPER = "FIT STRASSE";
const doc = text => ({ $type: "bpmn:Documentation", text });

export const EVIDENCE = { Call_1: "Source: review procedure, step 4", Note_2: "Source: tool inventory, sheet 2" };

export function basicTree() {
  return noNull({
    $type: "bpmn:Definitions", id: "Defs_ui", targetNamespace: "urn:example:lot5-ui", exporterVersion: "ui-neutral-base/1",
    rootElements: [
      {
        $type: "bpmn:Process", id: "Proc_main", name: "Order handling", isExecutable: false,
        flowElements: [
          node("bpmn:StartEvent", "Start_1", { name: "Order received" }),
          node("bpmn:Task", "Task_A", { name: "Check order" }),
          node("bpmn:UserTask", "Task_B", { name: "Approve order" }),
          node("bpmn:EndEvent", "End_1", { name: "Order closed" }),
          flow("Flow_1", "Start_1", "Task_A"),
          flow("Flow_2", "Task_A", "Task_B", { name: CHOICE_NAME }),
          flow("Flow_3", "Task_B", "End_1"),
          node("bpmn:DataStoreReference", "Ref_1", { dataStoreRef: "Store_1" }),
          node("bpmn:DataObjectReference", "Item_1", { name: "Order form", dataObjectRef: "Obj_1" }),
          node("bpmn:DataObject", "Obj_1"),
          node("bpmn:CallActivity", "Call_1", { name: "Run review", calledElement: "Proc-review", documentation: [doc(EVIDENCE.Call_1)] }),
          node("bpmn:CallActivity", "Call_2", { name: "Révision cycle", calledElement: "ProcArchive" }),
          node("bpmn:Task", "Task_X", { name: "Standalone check" }),
          node("bpmn:DataStoreReference", "Ref_2", { dataStoreRef: "Store_2" }),
          node("bpmn:CallActivity", "Call_3", { name: "Draft call" }),
          node("bpmn:UserTask", "Task_Y", { name: "Standalone approval" }),
          node("bpmn:CallActivity", "Call_4", { name: "[Locked] Archive run", calledElement: "ProcArchive" }),
          node("bpmn:CallActivity", "Call_5", { name: "[Hidden] Legacy run", calledElement: "Proc-review" }),
        ],
        artifacts: [
          node("bpmn:TextAnnotation", "Note_1", { text: "[Aid] spreadsheet" }),
          node("bpmn:Association", "Link_1", { sourceRef: "Ref_1", targetRef: "Task_A", associationDirection: "One" }),
          node("bpmn:Association", "AidLink_1", { sourceRef: "Note_1", targetRef: "Task_B", associationDirection: "None" }),
          node("bpmn:TextAnnotation", "Note_2", { text: "[Aid]calculator", documentation: [doc(EVIDENCE.Note_2)] }),
          node("bpmn:TextAnnotation", "Note_3", { text: " [Aid] ledger" }),
          node("bpmn:TextAnnotation", "Note_4", { text: "Check totals" }),
        ],
        ioSpecification: {
          $type: "bpmn:InputOutputSpecification",
          dataInputs: [node("bpmn:DataInput", "Input_1", { name: "Customer request" })],
          inputSets: [node("bpmn:InputSet", "Set_A", { name: "Standard", dataInputRefs: ["Input_1"] }), node("bpmn:InputSet", "Set_B", { name: "Express" })],
        },
      },
      { $type: "bpmn:Process", id: "Proc-review", name: "Révision cycle", isExecutable: false,
        flowElements: [node("bpmn:StartEvent", "Start_r", { name: "Review requested" }), node("bpmn:Task", "Task_R", { name: "Review case" })] },
      { $type: "bpmn:Process", id: "ProcArchive", name: "Archive records \u{10000}", isExecutable: false, flowElements: [node("bpmn:StartEvent", "Start_x", { name: "Archive requested" })] },
      node("bpmn:DataStore", "Store_1", { name: "Policy handbook" }),
      node("bpmn:DataStore", "Store_2", { name: "Tariff sheet" }),
    ],
  }, "basic tree");
}

export function oneSetTree() {
  const tree = basicTree();
  tree.rootElements[0].ioSpecification.inputSets = tree.rootElements[0].ioSpecification.inputSets.filter(set => set.id === "Set_A");
  return tree;
}

/** The basic tree before completion: Proc_main lacks the generated isExecutable default. */
export function unfixedTree() {
  const tree = basicTree();
  delete tree.rootElements[0].isExecutable;
  return tree;
}

export function foreignTree() {
  return noNull({
    $type: "bpmn:Definitions", id: "Defs_other", targetNamespace: "urn:example:lot5-other", exporterVersion: "ui-neutral-base/1",
    rootElements: [{ $type: "bpmn:Process", id: "Proc_other", name: "Other process", isExecutable: false, flowElements: [node("bpmn:StartEvent", "Start_o", { name: "Other start" })] }],
  }, "foreign tree");
}

export function demoTree() {
  return noNull({
    $type: "bpmn:Definitions", id: "Defs_demo", targetNamespace: "urn:example:lot5-demo", exporterVersion: "ui-neutral-base/1",
    rootElements: [{
      $type: "bpmn:Process", id: "Proc_demo", name: "Demo request", isExecutable: false,
      flowElements: [node("bpmn:StartEvent", "Start_d", { name: "Request received" }), node("bpmn:EndEvent", "End_d", { name: "Request closed" })],
    }],
  }, "demo tree");
}

/** A Process whose name carries the support marker of the ensure-collaboration recipe. */
export function bandedTree({ bound = false } = {}) {
  return noNull({
    $type: "bpmn:Definitions", id: "Defs_banded", targetNamespace: "urn:example:lot5-banded", exporterVersion: "ui-neutral-base/1",
    rootElements: [
      { $type: "bpmn:Process", id: "Proc_banded", name: "Banded intake", isExecutable: false,
        flowElements: [node("bpmn:StartEvent", "Start_b", { name: "Intake requested" }), node("bpmn:Task", "Task_b1", { name: "Intake check" }), node("bpmn:Task", "Task_b2", { name: "" })] },
      ...(bound ? [node("bpmn:Collaboration", "Collab_banded", { name: "Intake collaboration" })] : []),
    ],
  }, "banded tree");
}
export const BANDED_BINDINGS = [{ ownerId: "Proc_banded", role: "collaboration", targetId: "Collab_banded" }];

/** A call whose calledElement names no element of the document (navigation only). */
export function danglingTree() {
  return noNull({
    $type: "bpmn:Definitions", id: "Defs_dangling", targetNamespace: "urn:example:lot5-dangling", exporterVersion: "ui-neutral-base/1",
    rootElements: [{ $type: "bpmn:Process", id: "Proc_d", name: "Dangling calls", isExecutable: false,
      flowElements: [node("bpmn:CallActivity", "Call_d", { name: "Run missing", calledElement: "Proc_gone" })] }],
  }, "dangling tree");
}

// ---------------------------------------------------------------- envelope
export const semanticRevision = (tree, bindings = [], identity = profileIdentity) => H({ tree, profileIdentity: identity, bindings });
export function envelope(tree, { identity = profileIdentity, bindings = [] } = {}) {
  noNull(tree, "envelope tree");
  return { documentVersion: "1", profileIdentity: clone(identity), tree: clone(tree), bindings: clone(bindings), semanticRevision: semanticRevision(tree, bindings, identity) };
}

// ---------------------------------------------------------------- layout
const box = (x, y, width, height) => ({ x, y, width, height });
const center = b => ({ x: b.x + Math.floor(b.width / 2), y: b.y + Math.floor(b.height / 2) });
export const occurrenceKey = semanticId => `occ:${semanticId}`;
export const utf16 = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Build sorted Layout/1 from page records and per-page node/edge/label declarations. */
export function layout(pages, perPage) {
  const geometry = [];
  for (const page of pages) {
    const spec = perPage[page.pageId] ?? { nodes: {}, edges: {} };
    for (const [semanticId, bounds] of Object.entries(spec.nodes)) {
      geometry.push({ pageId: page.pageId, occurrenceKey: occurrenceKey(semanticId), semanticId, role: "content", bounds: clone(bounds),
        ...(spec.labels?.[semanticId] ? { label: clone(spec.labels[semanticId]) } : {}) });
    }
    for (const [semanticId, [from, to]] of Object.entries(spec.edges)) {
      const a = center(spec.nodes[from]), b = center(spec.nodes[to]);
      geometry.push({
        pageId: page.pageId, occurrenceKey: occurrenceKey(semanticId), semanticId, role: "content",
        bounds: box(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)),
        sourceOccurrence: { pageId: page.pageId, occurrenceKey: occurrenceKey(from) },
        targetOccurrence: { pageId: page.pageId, occurrenceKey: occurrenceKey(to) },
        waypoints: [a, b],
      });
    }
  }
  const order = new Map(pages.map(p => [p.pageId, p.order]));
  const sortedPages = [...pages].sort((a, b) => a.order - b.order || utf16(a.pageId, b.pageId));
  geometry.sort((a, b) => order.get(a.pageId) - order.get(b.pageId) || utf16(a.occurrenceKey, b.occurrenceKey));
  return noNull({ layoutVersion: "1", pages: clone(sortedPages), geometry }, "layout");
}

const page = (pageId, name, order, semanticRootId, width, height) => ({ pageId, name, order, semanticRootId, bounds: box(0, 0, width, height) });
const mainNodes = {
  Input_1: box(60000, 40000, 36000, 50000),
  Start_1: box(100000, 200000, 36000, 36000),
  Task_A: box(200000, 180000, 100000, 80000),
  Task_B: box(360000, 180000, 100000, 80000),
  End_1: box(520000, 200000, 36000, 36000),
  Ref_1: box(220000, 400000, 50000, 50000),
  Item_1: box(380000, 400000, 36000, 50000),
  Call_1: box(600000, 180000, 100000, 80000),
  Call_2: box(760000, 180000, 100000, 80000),
  Task_X: box(920000, 180000, 100000, 80000),
  Ref_2: box(600000, 400000, 50000, 50000),
  Call_3: box(1080000, 180000, 100000, 80000),
  Task_Y: box(1240000, 180000, 100000, 80000),
  Call_4: box(920000, 560000, 100000, 80000),
  Call_5: box(1080000, 560000, 100000, 80000),
  Note_1: box(360000, 40000, 100000, 30000),
  Note_2: box(520000, 40000, 100000, 30000),
  Note_3: box(680000, 40000, 100000, 30000),
  Note_4: box(840000, 40000, 100000, 30000),
};
// Grid-aligned values (multiples of 10 px = 10000 ticks) so upstream snapping
// is the identity for the exact-delta drag, resize and label-move witnesses.
const mainLabels = { Start_1: { text: "Order received", bounds: box(80000, 250000, 80000, 20000), lines: ["Order received"] } };
const mainEdges = {
  Flow_1: ["Start_1", "Task_A"], Flow_2: ["Task_A", "Task_B"], Flow_3: ["Task_B", "End_1"],
  Link_1: ["Ref_1", "Task_A"], AidLink_1: ["Note_1", "Task_B"],
};
const reviewNodes = { Start_r: box(100000, 100000, 36000, 36000), Task_R: box(200000, 80000, 100000, 80000) };
export const basicPages = [page("page-main", "Order handling", 0, "Proc_main", 1600000, 900000), page("page-review", "Révision cycle", 1, "Proc-review", 800000, 400000)];
export function basicLayout() {
  return layout(basicPages, { "page-main": { nodes: mainNodes, edges: mainEdges, labels: mainLabels }, "page-review": { nodes: reviewNodes, edges: {} } });
}
export const viewPages = [
  page("page-main", "Order handling", 0, "Proc_main", 1600000, 900000),
  page("page-detail", "Order detail", 1, "Proc_main", 800000, 400000),
  page("page-review-b", "Review B", 2, "Proc-review", 800000, 400000),
  page("page-review-a", "Review A", 3, "Proc-review", 800000, 400000),
];
export function viewsLayout() {
  return layout(viewPages, {
    "page-main": { nodes: mainNodes, edges: mainEdges, labels: mainLabels },
    "page-detail": { nodes: { Task_A: box(100000, 100000, 100000, 80000), Task_B: box(300000, 100000, 100000, 80000) }, edges: { Flow_2: ["Task_A", "Task_B"] } },
    "page-review-b": { nodes: reviewNodes, edges: {} },
    "page-review-a": { nodes: { Start_r: box(200000, 100000, 36000, 36000) }, edges: {} },
  });
}
export function foreignLayout() {
  return layout([page("page-other", "Other process", 0, "Proc_other", 800000, 400000)], { "page-other": { nodes: { Start_o: box(100000, 100000, 36000, 36000) }, edges: {} } });
}
export function demoLayout() {
  return layout([page("page-demo", "Demo request", 0, "Proc_demo", 1200000, 600000)], {
    "page-demo": { nodes: { Start_d: box(100000, 200000, 36000, 36000), End_d: box(900000, 200000, 36000, 36000) }, edges: {} },
  });
}
export function bandedLayout() {
  return layout([page("page-banded", "Banded intake", 0, "Proc_banded", 800000, 400000)], {
    "page-banded": { nodes: { Start_b: box(100000, 100000, 36000, 36000), Task_b1: box(200000, 80000, 100000, 80000), Task_b2: box(360000, 80000, 100000, 80000) }, edges: {} },
  });
}
export function danglingLayout() {
  return layout([page("page-dangling", "Dangling calls", 0, "Proc_d", 800000, 400000)], { "page-dangling": { nodes: { Call_d: box(100000, 100000, 100000, 80000) }, edges: {} } });
}

// ---------------------------------------------------------------- presentation digests
const chain = themeId => {
  const out = [];
  let id = themeId;
  while (id !== undefined) { const t = themes.find(x => x.id === id); out.unshift(clone(t)); id = t.fallback; }
  return out;
};
export const EMPTY_OVERRIDES = { semantic: [], occurrence: [] };
export const EMPTY_STYLES = { native: [], bioc: [] };
export const themeDigest = themeId => H({ themeId, themes: chain(themeId) });
export const overridesDigest = H(EMPTY_OVERRIDES);
export const diStylesDigest = H(EMPTY_STYLES);
export const metricsDigest = H([{ id: "ui-neutral-metrics", sha256: metricsSha256 }]);
export const descriptorDigest = H([descriptorPin].map(p => ({ id: p.id, version: p.version, sha256: p.sha256 })));
export const importedDi = { descriptorDigest, diagrams: [], sha256: H({ descriptorDigest, diagrams: [] }) };
export const viewRevision = (semantic, layoutRecord, themeId) => H({
  semanticRevision: semantic, layoutDigest: H(layoutRecord), themeId, themeDigest: themeDigest(themeId),
  overridesDigest, diStylesDigest, metricsDigest,
});

export function snapshot(env, layoutRecord, { themeId = "plain", selection = [], activePageId } = {}) {
  return noNull({
    snapshotVersion: "1", envelope: clone(env),
    presentation: {
      layout: clone(layoutRecord), themeId, overrides: clone(EMPTY_OVERRIDES), diStyles: clone(EMPTY_STYLES), importedDi: clone(importedDi),
      selection: clone(selection), activePageId: activePageId ?? layoutRecord.pages[0].pageId,
    },
    viewRevision: viewRevision(env.semanticRevision, layoutRecord, themeId),
  }, "snapshot");
}
