// x24 derivation helper (CLI): writes the three synthetic business-policy/1 data sets and the two
// synthetic facts descriptors. Pure data: every value is chosen here, none is read from the base tree.
// Neutral A and neutral B differ in every variable field; the legacy-shaped set has the shape of the
// private legacy record with synthetic values. Run from the repository root:
//   node tests/fixtures/x24-externalization/expectations/derive/policies.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "tests/fixtures/x24-externalization/expectations";
// Property names of the synthetic facts descriptors (exportFacts.properties): order, direction, label,
// lane, primary link and navigation process of an element.
const FACTS_A = { order: "seq", direction: "way", label: "caption", lane: "lane", primary: "anchor", process: "opens" };
const FACTS_B = { order: "pos", direction: "dir", label: "tag", lane: "row", primary: "lead", process: "goes" };
const table = (f) => Array.from({ length: 95 }, (_, i) => f(i));
const tokens = (t) => ({
  fontFamily: t.font, fontSize: t.size, strokeWidth: t.sw,
  stroke: t.c[0], fill: t.c[1], text: t.c[2], labelText: t.c[3], headerText: t.c[4], flow: t.c[5], link: t.c[6], docLink: t.c[7],
  docLinkDash: t.dash, dataLinkArrow: t.arrow,
  taskLine: t.c[8], taskFill: t.c[9], taskFillEnd: t.c[10], eventLine: t.c[11], eventFill: t.c[12], gatewayLine: t.c[13], gatewayFill: t.c[14],
  poolLine: t.c[15], poolFill: t.c[16], laneLine: t.c[17], laneFill: t.c[18], laneHeaderFill: t.c[19], externalLine: t.c[20], externalFill: t.c[21],
  docLine: t.c[22], docFill: t.c[23], dataLine: t.c[24], dataFill: t.c[25], appLine: t.c[26], appFill: t.c[27],
});
const grey = (from) => Array.from({ length: 28 }, (_, i) => `#${(from + 3 * i).toString(16).padStart(2, "0").repeat(3)}`);
const nodeSizes = (s) => [
  ["task", s.task], ["subprocess", s.sub], ["call", s.call], ["gateway", s.gw], ["start", s.ev], ["end", s.ev], ["event", s.ev],
  ["object-in", s.item], ["object-out", s.item], ["port-in", s.port], ["port-out", s.port], ["document", s.doc],
].map(([kind, [width, height]]) => ({ kind, width, height }));
const drawio = (p, n) => ({
  pool: `${p}=pool;`, lane: `${p}=lane;`, start: `${p}=start;`, end: `${p}=end;`, task: `${p}=task;`, subprocess: `${p}=subprocess;`,
  gatewayBase: `${p}=gateway;gw=`, external: `${p}=call;`, application: `${p}=badge;`, document: `${p}=sheet;`, item: `${p}=item;`,
  edgeHead: `${p}=edge;`, flowTail: `${p}=flow;`, linkTail: `${p}=link;`, event: `${p}=event;`, ...n,
});

const legacy = {
  policyVersion: "1",
  id: "x24-legacy-synthetic",
  classification: {
    annotationRoles: [
      { role: "document", prefix: "[Binder]", trim: "ecma262-2024-start", labelCase: "none" },
      { role: "application", prefix: "[Gadget]", trim: "ecma262-2024-start", labelCase: "none" },
    ],
    insertSeparator: " ",
  },
  attachment: { applicationHost: { type: "bpmn:Activity", mode: "assignable" }, nonActivityHost: "preserve-report" },
  metrics: {
    id: "x24-metrics-ramp", unit: "per-mille-em", firstCodePoint: 32,
    regular: table((i) => 400 + i), bold: table((i) => 500 + i), fallback: 999, lineHeight: 12 / 10,
    aliases: [{ from: "Í", to: "I" }, { from: "Ç", to: "C" }, { from: "é", to: "e" }, { from: "Å", to: "A" }, { from: "≠", to: "=" }],
    license: "CC0-1.0", attribution: "Synthetic distinct-per-code-point advance table authored for the x24 seal; aliases follow the canonical decomposition of each listed character.",
  },
  navigation: { mode: "legacy-default" },
  presentation: {
    looks: [
      { alias: "look-plain", renderer: "upstream", flat: false, palette: "upstream", paletteFloor: 56, markerSelectors: [".bjs-drilldown", "[data-marker='sub-process']", "[data-marker='x24-icon']", ".x24-annotated-marker"] },
      { alias: "look-annotated", renderer: "annotated", flat: false, palette: "annotated", paletteFloor: 112, markerSelectors: [".bjs-drilldown", "[data-marker='sub-process']", "[data-marker='x24-icon']", ".x24-annotated-marker"], tokens: tokens({ font: "monospace", size: 12, sw: 1, dash: "5 5", arrow: false, c: grey(1) }) },
      { alias: "look-recolor", renderer: "recolor", flat: false, palette: "upstream", paletteFloor: 56, markerSelectors: [".bjs-drilldown", "[data-marker='sub-process']", "[data-marker='x24-icon']", ".x24-annotated-marker"], tokens: tokens({ font: "monospace", size: 12, sw: 1, dash: "5 5", arrow: true, c: grey(0x51) }) },
    ],
    legacyOptions: { flatDrawing: "drawing-flat", annotatedPalette: "palette-annotated" },
    layout: {
      poolHeader: 31, laneHeader: 29, minLaneHeight: 190, channel: 25, fontSize: 12, labelFontSize: 11,
      nodeSizes: nodeSizes({ task: [118, 78], sub: [118, 78], call: [106, 60], gw: [48, 48], ev: [48, 48], item: [38, 48], port: [38, 48], doc: [108, 48] }),
      labelMaxWidth: { event: 118, item: 98 },
      appBadge: { minWidth: 78, height: 28, overlap: 9, chrome: 29, margin: 9, gap: 5, font: 12, linkInset: 19 },
      document: { width: 118, minHeight: 48, band: 14, textTop: 19, waveTop: 0.75, padX: 5, padBottom: 3 },
      laneHeaderWidth: 39, poolStrip: 29,
    },
    exportStyles: {
      drawio: drawio("x24l", { poolHeaderWidth: 39, dx: 49, dy: 1, appBand: 9 }),
      decode: {
        associationIdSuffix: "_gadget",
        kinds: [
          { match: [{ key: "shape", value: "x24.legacy.symbol" }, { key: "symbolType", value: "call" }], kind: "callActivity" },
          { match: [{ key: "shape", value: "x24.legacy.symbol" }, { key: "symbolType", value: "tool" }], kind: "textAnnotation" },
          { match: [{ key: "shape", value: "x24.legacy.sheet" }], kind: "textAnnotation" },
        ],
        roles: [
          { match: [{ key: "symbolType", value: "tool" }], role: "application" },
          { match: [{ key: "shape", value: "x24.legacy.sheet" }], role: "document" },
        ],
      },
    },
    palette: {
      entries: [
        { id: "legacy.start", title: "Start", bpmnType: "bpmn:StartEvent", group: "events", icon: "bpmn-icon-start-event-none" },
        { id: "legacy.subprocess", title: "Sub-process (collapsed)", bpmnType: "bpmn:SubProcess", group: "activities", icon: "bpmn-icon-subprocess-collapsed", collapsed: true },
        { id: "legacy.data-input", title: "Task input", bpmnType: "bpmn:DataObjectReference", group: "data", icon: "bpmn-icon-data-object", initialName: "Input" },
        { id: "legacy.document", title: "Document reference", bpmnType: "bpmn:TextAnnotation", group: "annotations", icon: "bpmn-icon-text-annotation", initialRole: "document" },
        { id: "legacy.application", title: "Application", bpmnType: "bpmn:TextAnnotation", group: "annotations", icon: "bpmn-icon-text-annotation", initialRole: "application" },
        { id: "legacy.sequence-flow", title: "Sequence flow", bpmnType: "bpmn:SequenceFlow", group: "flows", icon: "bpmn-icon-connection-multi", tool: "connect" },
      ],
    },
  },
  exportFacts: { descriptorId: "x24-facts/1", extensionType: "xf:Facts", namespaceFamily: "urn:x24:facts:", properties: FACTS_A },
};

const neutralA = {
  policyVersion: "1",
  id: "x24-neutral-a",
  classification: {
    annotationRoles: [
      { role: "application", prefix: "[Aid]", trim: "none", labelCase: "none" },
      { role: "document", prefix: "[Folio]", trim: "none", labelCase: "none" },
    ],
    insertSeparator: " ",
  },
  attachment: { applicationHost: { type: "bpmn:Activity", mode: "assignable" }, nonActivityHost: "preserve-report" },
  metrics: {
    id: "x24-metrics-a", unit: "per-mille-em", firstCodePoint: 32,
    regular: table(() => 500), bold: table(() => 600), fallback: 500, lineHeight: 5 / 4, aliases: [],
    license: "CC0-1.0", attribution: "Synthetic uniform advance table authored for the x24 seal.",
  },
  navigation: { mode: "called-element" },
  presentation: {
    looks: [
      { alias: "alpha-look", renderer: "annotated", flat: false, palette: "annotated", paletteFloor: 104, markerSelectors: [".x24-alpha-marker"], tokens: tokens({ font: "sans-serif", size: 11, sw: 1, dash: "4 2", arrow: true, c: grey(0x21) }) },
      { alias: "delta-look", renderer: "recolor", flat: false, palette: "annotated", paletteFloor: 88, markerSelectors: [".x24-delta-marker"], tokens: tokens({ font: "cursive", size: 10, sw: 3, dash: "3 1", arrow: true, c: grey(0x30) }) },
    ],
    legacyOptions: { flatDrawing: "flat-a", annotatedPalette: "palette-a" },
    layout: {
      poolHeader: 24, laneHeader: 22, minLaneHeight: 160, channel: 20, fontSize: 10, labelFontSize: 9,
      nodeSizes: nodeSizes({ task: [100, 70], sub: [104, 72], call: [96, 56], gw: [36, 36], ev: [34, 34], item: [32, 40], port: [30, 42], doc: [90, 40] }),
      labelMaxWidth: { event: 100, item: 80 },
      appBadge: { minWidth: 70, height: 24, overlap: 8, chrome: 20, margin: 6, gap: 3, font: 10, linkInset: 16 },
      document: { width: 100, minHeight: 40, band: 10, textTop: 16, waveTop: 0.8, padX: 4, padBottom: 2 },
      laneHeaderWidth: 32, poolStrip: 24,
    },
    exportStyles: {
      drawio: drawio("x24a", { poolHeaderWidth: 32, dx: 40, dy: 10, appBand: 8 }),
      decode: {
        associationIdSuffix: "_aid-link",
        kinds: [
          { match: [{ key: "shape", value: "mxgraph.flowchart.document" }], kind: "textAnnotation" },
          { match: [{ key: "shape", value: "mxgraph.flowchart.card" }], kind: "textAnnotation" },
        ],
        roles: [
          { match: [{ key: "shape", value: "mxgraph.flowchart.document" }], role: "document" },
          { match: [{ key: "shape", value: "mxgraph.flowchart.card" }], role: "application" },
        ],
      },
    },
    palette: {
      entries: [
        { id: "alpha.task", title: "Task", bpmnType: "bpmn:Task", group: "activities", icon: "bpmn-icon-task" },
        { id: "alpha.aid", title: "Aid", bpmnType: "bpmn:TextAnnotation", group: "annotations", icon: "bpmn-icon-text-annotation", initialRole: "application" },
        { id: "alpha.folio", title: "Folio", bpmnType: "bpmn:TextAnnotation", group: "annotations", icon: "bpmn-icon-text-annotation", initialRole: "document" },
      ],
    },
  },
  exportFacts: { descriptorId: "x24-facts/1", extensionType: "xf:Facts", namespaceFamily: "urn:x24:facts:", properties: FACTS_A },
};

const neutralB = {
  policyVersion: "1",
  id: "x24-neutral-b",
  classification: {
    annotationRoles: [
      { role: "application", prefix: "[Note]", trim: "ecma262-2024-start", labelCase: "upper" },
      { role: "document", prefix: "[Leaf]", trim: "none", labelCase: "upper" },
    ],
    insertSeparator: ": ",
  },
  attachment: { applicationHost: { type: "bpmn:Task", mode: "exact" }, nonActivityHost: "preserve-report" },
  metrics: {
    id: "x24-metrics-b", unit: "per-mille-em", firstCodePoint: 32,
    regular: table((i) => 560 + 3 * i), bold: table((i) => 640 + 3 * i), fallback: 640, lineHeight: 1.5, aliases: [{ from: "É", to: "E" }],
    license: "CC0-1.0", attribution: "Synthetic uniform advance table with one width alias, authored for the x24 seal.",
  },
  navigation: { mode: "legacy-rules", rules: ["name-equal", "section-equal"] },
  presentation: {
    looks: [
      { alias: "beta-look", renderer: "recolor", flat: false, palette: "upstream", paletteFloor: 60, markerSelectors: [".x24-beta-marker", "[data-marker='x24-beta']"], tokens: tokens({ font: "serif", size: 13, sw: 2, dash: "6 3", arrow: false, c: grey(0x60) }) },
      { alias: "gamma-look", renderer: "annotated", flat: false, palette: "annotated", paletteFloor: 96, markerSelectors: [".x24-gamma-marker"], tokens: tokens({ font: "fantasy", size: 12, sw: 1, dash: "2 2", arrow: false, c: grey(0x42) }) },
    ],
    legacyOptions: { flatDrawing: "flat-b" },
    layout: {
      poolHeader: 28, laneHeader: 26, minLaneHeight: 180, channel: 22, fontSize: 11, labelFontSize: 10,
      nodeSizes: nodeSizes({ task: [110, 76], sub: [112, 74], call: [102, 58], gw: [40, 40], ev: [38, 38], item: [34, 44], port: [36, 46], doc: [96, 44] }),
      labelMaxWidth: { event: 110, item: 90 },
      appBadge: { minWidth: 74, height: 26, overlap: 7, chrome: 24, margin: 8, gap: 6, font: 11, linkInset: 14 },
      document: { width: 106, minHeight: 60, band: 12, textTop: 18, waveTop: 0.7, padX: 7, padBottom: 5 },
      laneHeaderWidth: 36, poolStrip: 27,
    },
    exportStyles: {
      drawio: drawio("x24b", { poolHeaderWidth: 36, dx: 44, dy: 6, appBand: 7 }),
      decode: {
        associationIdSuffix: "-note-link",
        kinds: [
          { match: [{ key: "shape", value: "x24.leaf" }], kind: "textAnnotation" },
          { match: [{ key: "shape", value: "x24.note" }], kind: "textAnnotation" },
        ],
        roles: [
          { match: [{ key: "shape", value: "x24.leaf" }], role: "document" },
          { match: [{ key: "shape", value: "x24.note" }], role: "application" },
        ],
      },
    },
    palette: {
      entries: [
        { id: "beta.note", title: "Note", bpmnType: "bpmn:TextAnnotation", group: "annotations", icon: "bpmn-icon-text-annotation", initialRole: "application" },
        { id: "beta.leaf", title: "Leaf", bpmnType: "bpmn:TextAnnotation", group: "annotations", icon: "bpmn-icon-text-annotation", initialRole: "document" },
        { id: "beta.gateway", title: "Gateway", bpmnType: "bpmn:ExclusiveGateway", group: "gateways", icon: "bpmn-icon-gateway-none" },
        { id: "beta.flow", title: "Flow", bpmnType: "bpmn:SequenceFlow", group: "flows", icon: "bpmn-icon-connection-multi", tool: "connect" },
      ],
    },
  },
  exportFacts: { descriptorId: "x24-facts-b/1", extensionType: "yf:Facts", namespaceFamily: "urn:x24:facts-b:", properties: FACTS_B },
};

/** Facts descriptor package: one Facts type whose property names are the values of exportFacts.properties. */
const descriptor = (name, prefix, uri, p) => ({
  name, prefix, uri, xml: { tagAlias: "lowerCase" },
  types: [{ name: "Facts", superClass: ["Element"], properties: [
    { name: p.order, type: "Integer", isAttr: true },
    { name: p.lane, type: "bpmn:Lane", isAttr: true, isReference: true },
    { name: p.direction, type: "String", isAttr: true },
    { name: p.label, type: "String", isAttr: true },
    { name: p.primary, type: "bpmn:BaseElement", isAttr: true, isReference: true },
    { name: p.process, type: "bpmn:Process", isAttr: true, isReference: true },
  ] }],
});

const write = (path, value) => writeFileSync(join(DIR, path), JSON.stringify(value, null, 2) + "\n");
write("policy/policy-legacy-synthetic.json", legacy);
write("policy/policy-neutral-a.json", neutralA);
write("policy/policy-neutral-b.json", neutralB);
write("inputs/x24-facts-descriptor.json", descriptor("X24Facts", "xf", "urn:x24:facts:1", FACTS_A));
write("inputs/x24-facts-descriptor-b.json", descriptor("X24FactsB", "yf", "urn:x24:facts-b:1", FACTS_B));
console.log("policies and descriptors written");
