// Lot-4 synthetic documents, adapter base geometry and literal decision tables.
// Every value is authored here; region rows use the section 9.4 arithmetic only.
import { clone, compareText, jcs } from "./lot4-core.mjs";
import { regionRow, center, edgeBounds, bandStripe, attachedBadge } from "./lot4-geometry.mjs";

const b = (x, y, width, height) => ({ x, y, width, height });
const L = (text, bounds, lines = [text]) => ({ text, bounds, lines });
const pt = (x, y) => ({ x, y });
const pair = (pageId, occurrenceKey) => ({ pageId, occurrenceKey });
const sortBindings = list => list.sort((a, b) => compareText(a.ownerId, b.ownerId) || compareText(a.role, b.role) || compareText(a.targetId, b.targetId));
const supportBindings = (processId, roles) => roles.map(([role, targetId]) => ({ ownerId: processId, role, targetId }));

// ------------------------------------------------------------------ trees
export function mainTree({ withNote = false, unnamedFix = false } = {}) {
  const tree = {
    $type: "bpmn:Definitions", id: "Definitions_Main", targetNamespace: "urn:neutral-lot4",
    rootElements: [
      { $type: "bpmn:DataStore", id: "Store_Policy", name: "Policy archive" },
      {
        $type: "bpmn:Process", id: "Process_Main", name: "Main process", isExecutable: false,
        ioSpecification: {
          $type: "bpmn:InputOutputSpecification",
          dataInputs: [{ $type: "bpmn:DataInput", id: "Input_Order", name: "Order" }],
          dataOutputs: [{ $type: "bpmn:DataOutput", id: "Output_Receipt", name: "Receipt" }],
          inputSets: [{ $type: "bpmn:InputSet", id: "InputSet_Main", dataInputRefs: ["Input_Order"] }],
          outputSets: [{ $type: "bpmn:OutputSet", id: "OutputSet_Main", dataOutputRefs: ["Output_Receipt"] }],
        },
        laneSets: [{ $type: "bpmn:LaneSet", id: "LaneSet_Main", lanes: [
          { $type: "bpmn:Lane", id: "Lane_External", name: "External", flowNodeRef: [] },
          { $type: "bpmn:Lane", id: "Lane_Work", name: "Work", flowNodeRef: ["Start_Main", "Task_Check", "Gateway_Ok", "Task_Ship", "Task_Fix", "End_Done"] },
        ] }],
        flowElements: [
          { $type: "bpmn:StartEvent", id: "Start_Main", name: "Order received", outgoing: ["Flow_Start"] },
          { $type: "bpmn:Task", id: "Task_Check", name: "Check order", incoming: ["Flow_Start", "Flow_Back"], outgoing: ["Flow_Check"],
            properties: [{ $type: "bpmn:Property", id: "Port_Check_In", name: "order" }],
            dataInputAssociations: [{ $type: "bpmn:DataInputAssociation", id: "Input_Link", sourceRef: ["Input_Order"], targetRef: "Port_Check_In" }] },
          { $type: "bpmn:ExclusiveGateway", id: "Gateway_Ok", name: "Approved?", gatewayDirection: "Diverging", incoming: ["Flow_Check"], outgoing: ["Flow_Yes", "Flow_No"] },
          { $type: "bpmn:Task", id: "Task_Ship", name: "Ship order", incoming: ["Flow_Yes"], outgoing: ["Flow_Ship"],
            properties: [{ $type: "bpmn:Property", id: "Port_Ship_Out", name: "receipt" }],
            dataOutputAssociations: [{ $type: "bpmn:DataOutputAssociation", id: "Output_Link", sourceRef: ["Port_Ship_Out"], targetRef: "Output_Receipt" }] },
          { $type: "bpmn:Task", id: "Task_Fix", name: unnamedFix ? "" : "Fix order", incoming: ["Flow_No"], outgoing: ["Flow_Back"] },
          { $type: "bpmn:EndEvent", id: "End_Done", name: "Order shipped", incoming: ["Flow_Ship"] },
          { $type: "bpmn:SequenceFlow", id: "Flow_Start", sourceRef: "Start_Main", targetRef: "Task_Check" },
          { $type: "bpmn:SequenceFlow", id: "Flow_Check", sourceRef: "Task_Check", targetRef: "Gateway_Ok" },
          { $type: "bpmn:SequenceFlow", id: "Flow_Yes", name: "yes", sourceRef: "Gateway_Ok", targetRef: "Task_Ship" },
          { $type: "bpmn:SequenceFlow", id: "Flow_No", name: "no", sourceRef: "Gateway_Ok", targetRef: "Task_Fix" },
          { $type: "bpmn:SequenceFlow", id: "Flow_Ship", sourceRef: "Task_Ship", targetRef: "End_Done" },
          { $type: "bpmn:SequenceFlow", id: "Flow_Back", sourceRef: "Task_Fix", targetRef: "Task_Check" },
          { $type: "bpmn:DataStoreReference", id: "StoreRef_Policy", name: "Policy archive", dataStoreRef: "Store_Policy" },
        ],
        artifacts: [
          { $type: "bpmn:Association", id: "Assoc_Policy", sourceRef: "StoreRef_Policy", targetRef: "Task_Check", associationDirection: "One" },
          { $type: "bpmn:TextAnnotation", id: "Aid_Scanner", text: "[Aid] Scanner" },
          { $type: "bpmn:Association", id: "Assoc_Aid", sourceRef: "Aid_Scanner", targetRef: "Task_Check", associationDirection: "None" },
        ],
      },
      { $type: "bpmn:Collaboration", id: "Collab_Main", participants: [
        { $type: "bpmn:Participant", id: "Pool_Main", name: "Main process", processRef: "Process_Main" },
        { $type: "bpmn:Participant", id: "Band_Main", name: "References" },
      ] },
    ],
  };
  if (withNote) tree.rootElements[1].artifacts.push({ $type: "bpmn:TextAnnotation", id: "Note_Plain", text: "Plain note" });
  return tree;
}
export const mainBindings = ({ withoutLane = false } = {}) => sortBindings(supportBindings("Process_Main", [
  ["collaboration", "Collab_Main"], ...(withoutLane ? [] : [["external-lane", "Lane_External"]]), ["lane-set", "LaneSet_Main"],
  ["main-participant", "Pool_Main"], ["reference-band", "Band_Main"],
]));
export const mainPlacements = ({ aid = undefined } = {}) => [
  { elementId: "Input_Order", ownerProcessId: "Process_Main", regionKey: "external-lane", anchorAssociationId: "Input_Link", relatedAssociationIds: ["Input_Link"] },
  { elementId: "Output_Receipt", ownerProcessId: "Process_Main", regionKey: "external-lane", anchorAssociationId: "Output_Link", relatedAssociationIds: ["Output_Link"] },
  { elementId: "StoreRef_Policy", ownerProcessId: "Process_Main", regionKey: "reference-band", anchorAssociationId: "Assoc_Policy", relatedAssociationIds: ["Assoc_Policy"] },
  // Attached aid (DESIGN 9.4 L725): explicit placement anchor, region "aids".
  ...(aid === undefined ? [] : [{ elementId: "Aid_Scanner", ownerProcessId: "Process_Main", regionKey: "aids", ...(aid === "anchored" ? { anchorAssociationId: "Assoc_Aid" } : {}), relatedAssociationIds: ["Assoc_Aid"] }]),
];

export function multiTree() {
  return {
    $type: "bpmn:Definitions", id: "Definitions_Multi", targetNamespace: "urn:neutral-lot4",
    rootElements: [
      { $type: "bpmn:DataStore", id: "Store_Shared", name: "Shared register" },
      { $type: "bpmn:Process", id: "Process_A", name: "Process A", isExecutable: false,
        flowElements: [
          { $type: "bpmn:Task", id: "Task_A1", name: "Prepare" },
          { $type: "bpmn:DataStoreReference", id: "StoreRef_A", name: "Shared register", dataStoreRef: "Store_Shared" },
        ],
        artifacts: [{ $type: "bpmn:Association", id: "Assoc_A", sourceRef: "StoreRef_A", targetRef: "Task_A1", associationDirection: "One" }] },
      { $type: "bpmn:Process", id: "Process_B", name: "Process B", isExecutable: false,
        flowElements: [
          { $type: "bpmn:Task", id: "Task_B1", name: "Review" },
          { $type: "bpmn:DataStoreReference", id: "StoreRef_B", name: "Register copy", dataStoreRef: "Store_Shared" },
        ],
        artifacts: [{ $type: "bpmn:Association", id: "Assoc_B", sourceRef: "StoreRef_B", targetRef: "Task_B1", associationDirection: "One" }] },
      { $type: "bpmn:Collaboration", id: "Collab_A", participants: [
        { $type: "bpmn:Participant", id: "Pool_A", name: "Process A", processRef: "Process_A" },
        { $type: "bpmn:Participant", id: "Band_A", name: "References A" },
      ] },
      { $type: "bpmn:Collaboration", id: "Collab_B", participants: [
        { $type: "bpmn:Participant", id: "Pool_B", name: "Process B", processRef: "Process_B" },
        { $type: "bpmn:Participant", id: "Band_B", name: "References B" },
      ] },
    ],
  };
}
export const multiBindings = () => sortBindings([
  ...supportBindings("Process_A", [["collaboration", "Collab_A"], ["main-participant", "Pool_A"], ["reference-band", "Band_A"]]),
  ...supportBindings("Process_B", [["collaboration", "Collab_B"], ["main-participant", "Pool_B"], ["reference-band", "Band_B"]]),
]);
export const multiPlacements = () => [
  { elementId: "StoreRef_A", ownerProcessId: "Process_A", regionKey: "reference-band", anchorAssociationId: "Assoc_A", relatedAssociationIds: ["Assoc_A"] },
  { elementId: "StoreRef_B", ownerProcessId: "Process_B", regionKey: "reference-band", anchorAssociationId: "Assoc_B", relatedAssociationIds: ["Assoc_B"] },
];

export const emptyTree = () => ({
  $type: "bpmn:Definitions", id: "Definitions_Empty", targetNamespace: "urn:neutral-lot4",
  rootElements: [
    { $type: "bpmn:Process", id: "Process_Empty", name: "Empty process", isExecutable: false },
    { $type: "bpmn:Collaboration", id: "Collab_Empty", participants: [{ $type: "bpmn:Participant", id: "Pool_Empty", name: "Empty process", processRef: "Process_Empty" }] },
  ],
});
export const emptyBindings = () => sortBindings(supportBindings("Process_Empty", [["collaboration", "Collab_Empty"], ["main-participant", "Pool_Empty"]]));

// Navigation, terminate end and retained subtype document (DESIGN 10.2 L794-L796).
export const varietyTree = () => ({
  $type: "bpmn:Definitions", id: "Definitions_Variety", targetNamespace: "urn:neutral-lot4",
  rootElements: [
    { $type: "bpmn:Process", id: "Process_Variety", name: "Variety process", isExecutable: false, flowElements: [
      { $type: "bpmn:StartEvent", id: "Start_V", name: "Request", outgoing: ["Flow_V1"] },
      { $type: "bpmn:ServiceTask", id: "Service_V", name: "Run check", incoming: ["Flow_V1"], outgoing: ["Flow_V2"] },
      { $type: "bpmn:CallActivity", id: "Call_V", name: "Call review", calledElement: "Process_Review", incoming: ["Flow_V2"], outgoing: ["Flow_V3"] },
      { $type: "bpmn:EndEvent", id: "End_V", name: "Stopped", incoming: ["Flow_V3"], eventDefinitions: [{ $type: "bpmn:TerminateEventDefinition", id: "Terminate_V" }] },
      { $type: "bpmn:SequenceFlow", id: "Flow_V1", sourceRef: "Start_V", targetRef: "Service_V" },
      { $type: "bpmn:SequenceFlow", id: "Flow_V2", sourceRef: "Service_V", targetRef: "Call_V" },
      { $type: "bpmn:SequenceFlow", id: "Flow_V3", sourceRef: "Call_V", targetRef: "End_V" },
    ] },
    { $type: "bpmn:Process", id: "Process_Review", name: "Review process", isExecutable: false, flowElements: [
      { $type: "bpmn:Task", id: "Task_Review", name: "Review" },
    ] },
    { $type: "bpmn:Collaboration", id: "Collab_Variety", participants: [{ $type: "bpmn:Participant", id: "Pool_Variety", name: "Variety process", processRef: "Process_Variety" }] },
  ],
});
export const varietyBindings = () => sortBindings(supportBindings("Process_Variety", [["collaboration", "Collab_Variety"], ["main-participant", "Pool_Variety"]]));

// Neutral successors: the lot-0 completed trees plus an explicitly bound
// region lane (role = the fixture's region key).
export function successorTree(completed, region) {
  const tree = clone(completed);
  tree.rootElements[0].laneSets = [{ $type: "bpmn:LaneSet", id: "LaneSet_1", name: "lane-set", lanes: [{ $type: "bpmn:Lane", id: `Lane_${region}`, name: region }] }];
  return tree;
}
export const successorBindings = region => sortBindings(supportBindings("Process_1", [[region, `Lane_${region}`], ["lane-set", "LaneSet_1"]]));

// Decision-label document: question on the gateway, choices on its flows.
export const CHOICES = [
  ["Flow_C1", "istanbul", "Task_East", "East"],
  ["Flow_C2", "İzmir", "Task_West", "West"],
  ["Flow_C3", "straße ﬆop", "Task_North", "North"],
  ["Flow_C4", "σοφός ΟΔΟΣ Σ", "Task_South", "South"],
  ["Flow_C5", "ɤ-shape", "Task_Up", "Up"],
  ["Flow_C6", "ŉ ǅ", "Task_Down", "Down"],
  ["Flow_C7", undefined, "Task_Other", "Other"],
];
export function choicesTree() {
  const tasks = CHOICES.map(([flow, , task, name]) => ({ $type: "bpmn:Task", id: task, name, incoming: [flow] }));
  const flows = CHOICES.map(([flow, name, task]) => ({ $type: "bpmn:SequenceFlow", id: flow, ...(name === undefined ? {} : { name }), sourceRef: "Gateway_Route", targetRef: task }));
  return {
    $type: "bpmn:Definitions", id: "Definitions_Choices", targetNamespace: "urn:neutral-lot4",
    rootElements: [
      { $type: "bpmn:Process", id: "Process_Choices", name: "Routing", isExecutable: false, flowElements: [
        { $type: "bpmn:StartEvent", id: "Start_Choices", name: "Request", outgoing: ["Flow_C0"] },
        { $type: "bpmn:ExclusiveGateway", id: "Gateway_Route", name: "Which route?", gatewayDirection: "Diverging", incoming: ["Flow_C0"], outgoing: CHOICES.map(c => c[0]) },
        ...tasks,
        { $type: "bpmn:SequenceFlow", id: "Flow_C0", sourceRef: "Start_Choices", targetRef: "Gateway_Route" },
        ...flows,
      ] },
      { $type: "bpmn:Collaboration", id: "Collab_Choices", participants: [{ $type: "bpmn:Participant", id: "Pool_Choices", name: "Routing", processRef: "Process_Choices" }] },
    ],
  };
}
export const choicesBindings = () => sortBindings(supportBindings("Process_Choices", [["collaboration", "Collab_Choices"], ["main-participant", "Pool_Choices"]]));
// Literal Unicode 15.0.0 full mappings (re-checked against the pinned unicode-case/1 table by the derivation).
export const CHOICE_UPPER = {
  Flow_C1: "ISTANBUL",
  Flow_C2: "İZMIR",
  Flow_C3: "STRASSE STOP",
  Flow_C4: "ΣΟΦΌΣ ΟΔΟΣ Σ",
  Flow_C5: "ɤ-SHAPE",
  Flow_C6: "ʼN Ǆ",
};
export const CHOICE_LOWER = {
  Flow_C1: "istanbul",
  Flow_C2: "i̇zmir",
  Flow_C3: "straße ﬆop",
  Flow_C4: "σοφός οδος σ",
  Flow_C5: "ɤ-shape",
  Flow_C6: "ŉ ǆ",
};

// ------------------------------------------------------------- geometry
const G = (pageId, occurrenceKey, semanticId, role, bounds, label) => ({ pageId, occurrenceKey, semanticId, role, bounds, ...(label ? { label } : {}) });
const E = (pageId, occurrenceKey, semanticId, source, target, waypoints, label) => ({
  pageId, occurrenceKey, semanticId, role: "content", bounds: edgeBounds(waypoints), ...(label ? { label } : {}),
  sourceOccurrence: pair(pageId, source), targetOccurrence: pair(pageId, target), waypoints,
});
const pageRecord = p => ({ pageId: p.pageId, name: p.name, order: p.order, semanticRootId: p.semanticRootId, bounds: p.bounds });
const sortPages = pages => [...pages].sort((a, b) => a.order - b.order || compareText(a.pageId, b.pageId));
function sortGeometry(geometry, pages) {
  const order = new Map(pages.map(p => [p.pageId, p.order]));
  return geometry.sort((a, b) => order.get(a.pageId) - order.get(b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey));
}
// Straight link between the facing edges of two boxes (authored routing for links
// incident to region items; adapter-owned routing elsewhere).
function straightLink(src, dst) {
  const sc = src.x + src.width / 2, dc = dst.x + dst.width / 2;
  return src.y + src.height <= dst.y
    ? [pt(sc, src.y + src.height), pt(dc, dst.y)]
    : [pt(sc, src.y), pt(dc, dst.y + dst.height)];
}

// Region items as delivered by the adapter before section 9.4 resolution:
// stale imported positions, object sizes and fitted label boxes.
export const REGION_ITEMS = {
  Input_Order: { object: { width: 36000, height: 50000 }, label: { text: "Order", width: 30000, height: 14000 } },
  Output_Receipt: { object: { width: 36000, height: 50000 }, label: { text: "Receipt", width: 42000, height: 14000 } },
  StoreRef_Policy: { object: { width: 50000, height: 50000 }, label: { text: "Policy archive", width: 70000, height: 14000 } },
  StoreRef_A: { object: { width: 50000, height: 50000 }, label: { text: "Shared register", width: 76000, height: 14000 } },
  StoreRef_B: { object: { width: 50000, height: 50000 }, label: { text: "Register copy", width: 64000, height: 14000 } },
};
const staleItem = (pageId, key, id, x, y) => {
  const it = REGION_ITEMS[id];
  return G(pageId, key, id, "content", b(x, y, it.object.width, it.object.height), L(it.label.text, b(x, y + it.object.height + 5000, it.label.width, it.label.height)));
};
// DP-ANCHOR (2.4.1 L218, 7.2 L563): the activity owning a data association, or
// the other end of an Association, relative to the placed element (literal table).
const ENDPOINTS = {
  Input_Link: ["Task_Check"], Output_Link: ["Task_Ship"],
  Assoc_Policy: ["StoreRef_Policy", "Task_Check"], Assoc_Aid: ["Aid_Scanner", "Task_Check"],
  Assoc_A: ["StoreRef_A", "Task_A1"], Assoc_B: ["StoreRef_B", "Task_B1"],
  "Y-consumer": ["Task_A", "Task_B"], "Z-consumer": ["Task_A", "Task_B"], "A-producer": ["Task_B", "Task_A"],
};
export function anchorActivity(associationId, placedId) {
  const ends = ENDPOINTS[associationId];
  if (!ends) throw new Error(`fixture: no endpoint decision for ${associationId}`);
  return ends.length === 1 ? ends[0] : ends[0] === placedId ? ends[1] : ends[0];
}

// A fixture page: base occurrences plus link specs incident to region items.
function page(spec) { return { links: [], ...spec, base: spec.nodes.concat(spec.edges) }; }
function linkOccurrences(p, geometry) {
  return p.links.filter(l => geometry.some(g => g.occurrenceKey === l.source) && geometry.some(g => g.occurrenceKey === l.target))
    .map(l => E(p.pageId, l.key, l.semanticId, l.source, l.target, straightLink(geometry.find(g => g.occurrenceKey === l.source).bounds, geometry.find(g => g.occurrenceKey === l.target).bounds)));
}
export function baseLayoutOf(pages) {
  const ps = sortPages(pages).map(pageRecord);
  const geometry = pages.flatMap(p => { const nodes = clone(p.base); return [...nodes, ...linkOccurrences(p, nodes)]; });
  return { layoutVersion: "1", pages: ps, geometry: sortGeometry(geometry, ps) };
}

// Final layout (DP-LAYOUT, DP-IO, DP-SYN): region items resolved per (owner,
// region) and page, incident links re-routed, then the selected theme's
// synthetic occurrences. ctx = { tokensFor(regionKey), declarations, glyphOf(id),
// ownersOf(declaration), labelOf(declaration, ownerId) }. Returns { layout,
// relocatedLinks } or { refused, why }.
export function finalLayoutOf(pages, placements, bindings, ctx, trace = []) {
  const outPages = [], outGeometry = [], relocatedLinks = [];
  for (const p of sortPages(pages)) {
    const base = clone(p.base);
    const geometry = clone(p.base);
    let pageBounds = p.bounds;
    const groups = [];
    for (const pl of placements) {
      let g = groups.find(x => x.owner === pl.ownerProcessId && x.regionKey === pl.regionKey);
      if (!g) groups.push(g = { owner: pl.ownerProcessId, regionKey: pl.regionKey, list: [] });
      g.list.push(pl);
    }
    const moved = new Set();
    for (const group of groups) {
      const shown = group.list.filter(pl => geometry.some(g => g.semanticId === pl.elementId));
      if (!shown.length) continue;
      const supportId = bindings.find(x => x.ownerId === group.owner && x.role === group.regionKey)?.targetId;
      if (supportId === undefined) {
        // Attachment region: the selected theme declares an attached badge for it.
        if (ctx.declarations.some(d => d.role === "attached-badge" && d.region === group.regionKey)) {
          for (const pl of shown) geometry.find(g => g.semanticId === pl.elementId).role = group.regionKey;
          continue;
        }
        return { refused: "render-region-missing", why: `no binding ${group.owner}/${group.regionKey}` };
      }
      const support = geometry.find(g => g.semanticId === supportId);
      if (!support) return { refused: "render-region-missing", why: `support ${supportId} absent on ${p.pageId}` };
      const tokens = ctx.tokensFor(group.regionKey);
      if (!tokens) return { refused: "render-region-missing", why: `region tokens ${group.regionKey}` };
      const items = shown.map(pl => {
        const g = geometry.find(x => x.semanticId === pl.elementId);
        const anchorId = pl.anchorAssociationId === undefined ? undefined : anchorActivity(pl.anchorAssociationId, pl.elementId);
        // K4: the anchor is available only with exactly one base record on the page.
        const records = anchorId === undefined ? [] : base.filter(x => x.semanticId === anchorId);
        const anchor = records.length === 1 ? records[0].bounds : undefined;
        return { elementId: pl.elementId, occurrenceKey: g.occurrenceKey, object: { width: g.bounds.width, height: g.bounds.height },
          ...(g.label ? { label: { width: g.label.bounds.width, height: g.label.bounds.height } } : {}),
          ...(anchor ? { anchorCenterX: center(anchor), anchor } : {}) };
      });
      const input = { page: pageBounds, body: support.bounds, tokens, items };
      const row = regionRow(input);
      trace.push({ pageId: p.pageId, ownerProcessId: group.owner, regionKey: group.regionKey, supportKey: support.occurrenceKey, input, output: row });
      pageBounds = row.pageBounds;
      support.bounds = row.body;
      for (const r of row.items) {
        const g = geometry.find(x => x.semanticId === r.elementId);
        g.bounds = r.bounds; g.role = group.regionKey;
        if (g.label) g.label = { ...g.label, bounds: r.labelBounds };
        moved.add(g.occurrenceKey);
      }
    }
    // Synthetic occurrences of the selected theme (DESIGN 9.3 L712-L715; Layout/1 semanticId? L667).
    const synthetic = [];
    for (const d of ctx.declarations) {
      const glyph = ctx.glyphOf(d.glyph);
      for (const ownerId of ctx.ownersOf(d)) {
        const represented = p.semanticRootId === ownerId || base.some(g => g.semanticId === ownerId);
        if (!represented) continue;
        let bounds;
        if (d.role === "band-stripe") {
          const supportId = bindings.find(x => x.ownerId === ownerId && x.role === d.region)?.targetId;
          const region = supportId === undefined ? undefined : geometry.find(g => g.semanticId === supportId);
          if (!region) return { refused: "render-region-missing", why: `stripe region ${ownerId}/${d.region} on ${p.pageId}` };
          const width = glyph.template === "band-stripe" ? glyph.parameters.find(x => x.name === "stripeWidth").value : undefined;
          bounds = bandStripe(region.bounds, width).stripe;
        } else {
          const params = Object.fromEntries(glyph.parameters.map(x => [x.name, x.value]));
          if (params.hideSource) return { refused: "render-unsupported", why: "hideSource" };
          const pl = placements.find(x => x.elementId === ownerId && x.regionKey === d.region);
          if (!pl || pl.anchorAssociationId === undefined) return { refused: "render-region-missing", why: `badge placement anchor ${ownerId}` };
          const records = base.filter(g => g.semanticId === anchorActivity(pl.anchorAssociationId, ownerId));
          if (records.length !== 1) return { refused: "render-region-missing", why: `badge anchor records ${records.length}` };
          bounds = attachedBadge(records[0].bounds, params, { width: glyph.viewBox[2] * 1000, height: glyph.viewBox[3] * 1000 }).badge;
        }
        const text = ctx.labelOf(d, ownerId);
        synthetic.push({ pageId: p.pageId, occurrenceKey: jcs([d.id, ownerId, p.pageId]), role: d.role, bounds, ...(text ? { label: L(text, bounds) } : {}) });
      }
    }
    const links = linkOccurrences(p, geometry);
    for (const l of links) if (moved.has(l.sourceOccurrence.occurrenceKey) || moved.has(l.targetOccurrence.occurrenceKey)) relocatedLinks.push({ pageId: p.pageId, occurrenceKey: l.occurrenceKey });
    outPages.push({ ...pageRecord(p), bounds: pageBounds });
    outGeometry.push(...geometry, ...synthetic, ...links);
  }
  return { layout: { layoutVersion: "1", pages: outPages, geometry: sortGeometry(outGeometry, outPages) }, relocatedLinks };
}

const k = id => `${id}_di`;
const mainLinks = (key = k) => [
  { key: key("Input_Link"), semanticId: "Input_Link", source: key("Input_Order"), target: key("Task_Check") },
  { key: key("Output_Link"), semanticId: "Output_Link", source: key("Task_Ship"), target: key("Output_Receipt") },
  { key: key("Assoc_Policy"), semanticId: "Assoc_Policy", source: key("StoreRef_Policy"), target: key("Task_Check") },
];
export function mainPage({ pageId = "Page_Main", name = "Main sheet", order = 0, withNote = false, twice = false, labels = {} } = {}) {
  const t = (id, text) => labels[id] === undefined ? text : labels[id];
  const nodes = [
    G(pageId, k("Pool_Main"), "Pool_Main", "support", b(0, 0, 1100000, 450000), L("Main process", b(0, 0, 30000, 450000))),
    G(pageId, k("Lane_External"), "Lane_External", "support", b(30000, 0, 1070000, 150000), L("External", b(30000, 0, 30000, 150000))),
    G(pageId, k("Lane_Work"), "Lane_Work", "support", b(30000, 150000, 1070000, 300000), L("Work", b(30000, 150000, 30000, 300000))),
    G(pageId, k("Band_Main"), "Band_Main", "support", b(0, 470000, 1100000, 120000), L("References", b(0, 470000, 30000, 120000))),
    G(pageId, k("Start_Main"), "Start_Main", "content", b(100000, 282000, 36000, 36000), L("Order received", b(83000, 323000, 70000, 14000))),
    G(pageId, k("Task_Check"), "Task_Check", "content", b(180000, 260000, 100000, 80000), labels.Task_Check === null ? undefined : L(t("Task_Check", "Check order"), b(180000, 260000, 100000, 80000))),
    G(pageId, k("Gateway_Ok"), "Gateway_Ok", "content", b(330000, 275000, 50000, 50000), L("Approved?", b(320000, 330000, 70000, 14000))),
    G(pageId, k("Task_Ship"), "Task_Ship", "content", b(440000, 260000, 100000, 80000), L("Ship order", b(440000, 260000, 100000, 80000))),
    G(pageId, k("Task_Fix"), "Task_Fix", "content", b(440000, 360000, 100000, 80000), L("Fix order", b(440000, 360000, 100000, 80000))),
    G(pageId, k("End_Done"), "End_Done", "content", b(600000, 282000, 36000, 36000), L("Order shipped", b(583000, 323000, 70000, 14000))),
    G(pageId, k("Aid_Scanner"), "Aid_Scanner", "content", b(180000, 170000, 100000, 40000), L("Scanner", b(180000, 170000, 100000, 40000))),
    staleItem(pageId, k("Input_Order"), "Input_Order", 600000, 20000),
    staleItem(pageId, k("Output_Receipt"), "Output_Receipt", 700000, 20000),
    staleItem(pageId, k("StoreRef_Policy"), "StoreRef_Policy", 800000, 480000),
  ];
  // Second view of Task_Check on the same page (K4 / attached-badge ambiguity).
  if (twice) nodes.push(G(pageId, "Task_Check_di2", "Task_Check", "content", b(700000, 360000, 100000, 80000), L("Check order", b(700000, 360000, 100000, 80000))));
  if (withNote) nodes.push(G(pageId, k("Note_Plain"), "Note_Plain", "content", b(330000, 170000, 100000, 40000), L("Plain note", b(330000, 170000, 100000, 40000))));
  const yes = t("Flow_Yes", "YES"), assocLabel = labels.Assoc_Aid;
  const edges = [
    E(pageId, k("Flow_Start"), "Flow_Start", k("Start_Main"), k("Task_Check"), [pt(136000, 300000), pt(180000, 300000)]),
    E(pageId, k("Flow_Check"), "Flow_Check", k("Task_Check"), k("Gateway_Ok"), [pt(280000, 300000), pt(330000, 300000)]),
    E(pageId, k("Flow_Yes"), "Flow_Yes", k("Gateway_Ok"), k("Task_Ship"), [pt(380000, 300000), pt(440000, 300000)], L(yes, b(395000, 285000, 30000, 14000))),
    E(pageId, k("Flow_No"), "Flow_No", k("Gateway_Ok"), k("Task_Fix"), [pt(355000, 325000), pt(355000, 400000), pt(440000, 400000)], L("NO", b(360000, 380000, 20000, 14000))),
    E(pageId, k("Flow_Ship"), "Flow_Ship", k("Task_Ship"), k("End_Done"), [pt(540000, 300000), pt(600000, 300000)]),
    E(pageId, k("Flow_Back"), "Flow_Back", k("Task_Fix"), k("Task_Check"), [pt(440000, 420000), pt(230000, 420000), pt(230000, 340000)]),
    E(pageId, k("Assoc_Aid"), "Assoc_Aid", k("Aid_Scanner"), k("Task_Check"), [pt(230000, 210000), pt(230000, 260000)], assocLabel === undefined ? undefined : L(assocLabel, b(235000, 225000, 30000, 14000))),
  ];
  return page({ pageId, name, order, semanticRootId: "Process_Main", bounds: b(0, 0, 1200000, 640000), nodes, edges, links: mainLinks() });
}
// Second, partial view of the same process (repeated semantic IDs, own keys).
export function detailPage() {
  const pageId = "View_A", d = id => `d-${id}`;
  const nodes = [
    G(pageId, d("Pool_Main"), "Pool_Main", "support", b(0, 0, 600000, 400000), L("Main process", b(0, 0, 30000, 400000))),
    G(pageId, d("Lane_External"), "Lane_External", "support", b(30000, 0, 570000, 140000), L("External", b(30000, 0, 30000, 140000))),
    G(pageId, d("Lane_Work"), "Lane_Work", "support", b(30000, 140000, 570000, 260000), L("Work", b(30000, 140000, 30000, 260000))),
    G(pageId, d("Band_Main"), "Band_Main", "support", b(0, 420000, 600000, 110000), L("References", b(0, 420000, 30000, 110000))),
    G(pageId, d("Task_Check"), "Task_Check", "content", b(300000, 220000, 100000, 80000), L("Check order", b(300000, 220000, 100000, 80000))),
    staleItem(pageId, d("Input_Order"), "Input_Order", 450000, 30000),
    staleItem(pageId, d("StoreRef_Policy"), "StoreRef_Policy", 450000, 440000),
  ];
  return page({ pageId, name: "Detail", order: 1, semanticRootId: "Process_Main", bounds: b(0, 0, 700000, 560000), nodes, edges: [], links: [
    { key: d("Input_Link"), semanticId: "Input_Link", source: d("Input_Order"), target: d("Task_Check") },
    { key: d("Assoc_Policy"), semanticId: "Assoc_Policy", source: d("StoreRef_Policy"), target: d("Task_Check") },
  ] });
}
export function multiPagesSpec() {
  return [["A", "Task_A1", 200000, "Prepare", "Page_A", "Sheet A", 0], ["B", "Task_B1", 400000, "Review", "Page_B", "Sheet B", 1]].map(([P, task, tx, name, pageId, pageName, order]) => page({
    pageId, name: pageName, order, semanticRootId: `Process_${P}`, bounds: b(0, 0, 800000, 400000), edges: [],
    nodes: [
      G(pageId, k(`Pool_${P}`), `Pool_${P}`, "support", b(0, 0, 700000, 250000), L(`Process ${P}`, b(0, 0, 30000, 250000))),
      G(pageId, k(`Band_${P}`), `Band_${P}`, "support", b(0, 270000, 700000, 100000), L(`References ${P}`, b(0, 270000, 30000, 100000))),
      G(pageId, k(task), task, "content", b(tx, 85000, 100000, 80000), L(name, b(tx, 85000, 100000, 80000))),
      staleItem(pageId, k(`StoreRef_${P}`), `StoreRef_${P}`, 600000, 290000),
    ],
    links: [{ key: k(`Assoc_${P}`), semanticId: `Assoc_${P}`, source: k(`StoreRef_${P}`), target: k(task) }],
  }));
}
export function emptyPageSpec() {
  return page({ pageId: "Page_Empty", name: "Empty sheet", order: 0, semanticRootId: "Process_Empty", bounds: b(0, 0, 700000, 300000), edges: [],
    nodes: [G("Page_Empty", k("Pool_Empty"), "Pool_Empty", "support", b(0, 0, 600000, 200000), L("Empty process", b(0, 0, 30000, 200000)))] });
}
export function choicesPageSpec(labels) {
  const pageId = "Page_Choices";
  const nodes = [
    G(pageId, k("Pool_Choices"), "Pool_Choices", "support", b(0, 0, 900000, 860000), L("Routing", b(0, 0, 30000, 860000))),
    G(pageId, k("Start_Choices"), "Start_Choices", "content", b(80000, 412000, 36000, 36000), L("Request", b(73000, 453000, 50000, 14000))),
    G(pageId, k("Gateway_Route"), "Gateway_Route", "content", b(200000, 405000, 50000, 50000), L("Which route?", b(185000, 460000, 80000, 14000))),
  ];
  const edges = [E(pageId, k("Flow_C0"), "Flow_C0", k("Start_Choices"), k("Gateway_Route"), [pt(116000, 430000), pt(200000, 430000)])];
  CHOICES.forEach(([flow, , task, name], i) => {
    const y = 40000 + i * 120000;
    nodes.push(G(pageId, k(task), task, "content", b(600000, y, 100000, 80000), L(name, b(600000, y, 100000, 80000))));
    const text = labels[flow];
    edges.push(E(pageId, k(flow), flow, k("Gateway_Route"), k(task), [pt(250000, 430000), pt(400000, y + 40000), pt(600000, y + 40000)],
      text === undefined ? undefined : L(text, b(420000, y + 22000, 120000, 14000))));
  });
  return page({ pageId, name: "Routing sheet", order: 0, semanticRootId: "Process_Choices", bounds: b(0, 0, 1000000, 900000), nodes, edges });
}
export function varietyPageSpec() {
  const pageId = "Page_Variety";
  const nodes = [
    G(pageId, k("Pool_Variety"), "Pool_Variety", "support", b(0, 0, 900000, 300000), L("Variety process", b(0, 0, 30000, 300000))),
    G(pageId, k("Start_V"), "Start_V", "content", b(80000, 132000, 36000, 36000), L("Request", b(63000, 173000, 70000, 14000))),
    G(pageId, k("Service_V"), "Service_V", "content", b(180000, 110000, 100000, 80000), L("Run check", b(180000, 110000, 100000, 80000))),
    G(pageId, k("Call_V"), "Call_V", "content", b(340000, 110000, 100000, 80000), L("Call review", b(340000, 110000, 100000, 80000))),
    G(pageId, k("End_V"), "End_V", "content", b(500000, 132000, 36000, 36000), L("Stopped", b(483000, 173000, 70000, 14000))),
  ];
  const edges = [
    E(pageId, k("Flow_V1"), "Flow_V1", k("Start_V"), k("Service_V"), [pt(116000, 150000), pt(180000, 150000)]),
    E(pageId, k("Flow_V2"), "Flow_V2", k("Service_V"), k("Call_V"), [pt(280000, 150000), pt(340000, 150000)]),
    E(pageId, k("Flow_V3"), "Flow_V3", k("Call_V"), k("End_V"), [pt(440000, 150000), pt(500000, 150000)]),
  ];
  return page({ pageId, name: "Variety sheet", order: 0, semanticRootId: "Process_Variety", bounds: b(0, 0, 1000000, 400000), nodes, edges });
}
// Neutral successor pages (two views, repeated Task_B, reversed page/key order).
export const AID_ID = "g_61b268027699fa668a9b0e3eced8130a2b2e188f426051e9ad25ebb1e33a800c";
export function neutralSuccessorPages() {
  return [
    page({ pageId: "Z-page", name: "First sheet", order: 0, semanticRootId: "Process_1", bounds: b(0, 0, 1000000, 800000), edges: [], nodes: [
      G("Z-page", "z-lane", "Lane_content", "support", b(0, 0, 800000, 200000), L("content", b(0, 0, 30000, 200000))),
      G("Z-page", "a-first", "Task_A", "content", b(100000, 300000, 100000, 80000)),
      G("Z-page", "a-note", AID_ID, "content", b(100000, 500000, 100000, 40000), L("helper", b(100000, 500000, 100000, 40000))),
      G("Z-page", "z-last", "Task_B", "content", b(300000, 300000, 100000, 80000), L("Ready", b(300000, 385000, 40000, 14000))),
    ] }),
    page({ pageId: "A-page", name: "Second sheet", order: 1, semanticRootId: "Process_1", bounds: b(0, 0, 1000000, 800000), edges: [], nodes: [
      G("A-page", "a-lane", "Lane_content", "support", b(0, 0, 600000, 180000), L("content", b(0, 0, 30000, 180000))),
      G("A-page", "a-last-page", "Task_B", "content", b(200000, 300000, 100000, 80000), L("Ready", b(200000, 385000, 40000, 14000))),
    ] }),
  ];
}
export function gridSuccessorPages() {
  return [
    page({ pageId: "Z-page", name: "First sheet", order: 0, semanticRootId: "Process_1", bounds: b(0, 0, 1000000, 800000), edges: [], nodes: [
      G("Z-page", "z-lane", "Lane_side", "support", b(0, 0, 500000, 100000), L("side", b(0, 0, 30000, 100000))),
      G("Z-page", "a-first", "Task_A", "content", b(100000, 200000, 100000, 80000)),
      G("Z-page", "a-note", AID_ID, "content", b(100000, 350000, 150000, 40000), L("HELPER", b(100000, 350000, 150000, 40000))),
      G("Z-page", "z-last", "Task_B", "content", b(300000, 200000, 100000, 80000), L("Ready", b(300000, 285000, 40000, 14000))),
    ] }),
    page({ pageId: "A-page", name: "Second sheet", order: 1, semanticRootId: "Process_1", bounds: b(0, 0, 1000000, 800000), edges: [], nodes: [
      G("A-page", "a-lane", "Lane_side", "support", b(0, 0, 400000, 100000), L("side", b(0, 0, 30000, 100000))),
      G("A-page", "a-last-page", "Task_B", "content", b(100000, 200000, 100000, 80000), L("Ready", b(100000, 285000, 40000, 14000))),
    ] }),
  ];
}
