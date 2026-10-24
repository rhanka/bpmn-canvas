// Lot-4 synthetic world: literal neutral packages and documents authored by the
// spec author. Pure data plus small constructors. No profile evaluation.
import { clone } from "./lot4-core.mjs";

// ---------------------------------------------------------------- descriptors
const T = (id, scalars, containment = {}, references = {}) => ({ id, scalars, containment, references });
const FLOW_NODES = ["bpmn:Task", "bpmn:ServiceTask", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:ExclusiveGateway"];
export const descriptorsDoc = {
  id: "neutral-lot4-descriptors/1",
  scope: "Synthetic lot-4 descriptor slice (stores, bands, lanes, Process IO, data associations, calls, terminate ends); not the complete BPMN descriptor set.",
  types: {
    "bpmn:Definitions": T(true, ["id", "name", "targetNamespace"], { rootElements: ["bpmn:Process", "bpmn:Collaboration", "bpmn:DataStore"] }),
    "bpmn:Process": T(true, ["id", "name", "isExecutable"], {
      flowElements: [...FLOW_NODES, "bpmn:SequenceFlow", "bpmn:DataStoreReference"],
      artifacts: ["bpmn:TextAnnotation", "bpmn:Association"],
      documentation: ["bpmn:Documentation"],
      laneSets: ["bpmn:LaneSet"],
      ioSpecification: ["bpmn:InputOutputSpecification"],
    }),
    "bpmn:Collaboration": T(true, ["id", "name"], { participants: ["bpmn:Participant"] }),
    "bpmn:Participant": T(true, ["id", "name"], {}, { processRef: ["bpmn:Process"] }),
    "bpmn:LaneSet": T(true, ["id", "name"], { lanes: ["bpmn:Lane"] }),
    "bpmn:Lane": T(true, ["id", "name"], {}, { flowNodeRef: FLOW_NODES }),
    "bpmn:Task": T(true, ["id", "name"], {
      documentation: ["bpmn:Documentation"], properties: ["bpmn:Property"],
      dataInputAssociations: ["bpmn:DataInputAssociation"], dataOutputAssociations: ["bpmn:DataOutputAssociation"],
    }, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
    "bpmn:ServiceTask": T(true, ["id", "name"], { documentation: ["bpmn:Documentation"] }, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
    "bpmn:CallActivity": T(true, ["id", "name"], { documentation: ["bpmn:Documentation"] }, { calledElement: ["bpmn:Process"], incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
    "bpmn:TextAnnotation": T(true, ["id", "text"]),
    "bpmn:Association": T(true, ["id", "associationDirection"], {}, {
      sourceRef: ["bpmn:Task", "bpmn:ServiceTask", "bpmn:TextAnnotation", "bpmn:DataStoreReference"],
      targetRef: ["bpmn:Task", "bpmn:ServiceTask", "bpmn:TextAnnotation", "bpmn:DataStoreReference"],
    }),
    "bpmn:Documentation": T(false, ["text", "textFormat"]),
    "bpmn:FormalExpression": T(false, ["body", "language"]),
    "bpmn:StartEvent": T(true, ["id", "name"], {}, { outgoing: ["bpmn:SequenceFlow"] }),
    "bpmn:EndEvent": T(true, ["id", "name"], { eventDefinitions: ["bpmn:TerminateEventDefinition"] }, { incoming: ["bpmn:SequenceFlow"] }),
    "bpmn:TerminateEventDefinition": T(true, ["id"]),
    "bpmn:ExclusiveGateway": T(true, ["id", "name", "gatewayDirection"], {}, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
    "bpmn:SequenceFlow": T(true, ["id", "name"], {}, {
      sourceRef: ["bpmn:StartEvent", "bpmn:ExclusiveGateway", "bpmn:Task", "bpmn:ServiceTask", "bpmn:CallActivity"],
      targetRef: ["bpmn:ExclusiveGateway", "bpmn:Task", "bpmn:ServiceTask", "bpmn:CallActivity", "bpmn:EndEvent"],
    }),
    "bpmn:DataStore": T(true, ["id", "name"]),
    "bpmn:DataStoreReference": T(true, ["id", "name"], {}, { dataStoreRef: ["bpmn:DataStore"] }),
    "bpmn:InputOutputSpecification": T(false, [], {
      dataInputs: ["bpmn:DataInput"], dataOutputs: ["bpmn:DataOutput"], inputSets: ["bpmn:InputSet"], outputSets: ["bpmn:OutputSet"],
    }),
    "bpmn:DataInput": T(true, ["id", "name"]),
    "bpmn:DataOutput": T(true, ["id", "name"]),
    "bpmn:InputSet": T(true, ["id", "name"], {}, { dataInputRefs: ["bpmn:DataInput"] }),
    "bpmn:OutputSet": T(true, ["id", "name"], {}, { dataOutputRefs: ["bpmn:DataOutput"] }),
    "bpmn:Property": T(true, ["id", "name"]),
    "bpmn:DataInputAssociation": T(true, ["id"], {}, { sourceRef: ["bpmn:DataInput"], targetRef: ["bpmn:Property"] }),
    "bpmn:DataOutputAssociation": T(true, ["id"], {}, { sourceRef: ["bpmn:Property"], targetRef: ["bpmn:DataOutput"] }),
  },
};

// ----------------------------------------------------------------------- base
// Every descriptor field is admitted to code, editor and import, exactly like
// the vendored neutral base. Field kinds follow the descriptor slice.
export function buildBase() {
  const fields = [];
  for (const [type, d] of Object.entries(descriptorsDoc.types)) {
    for (const field of d.scalars) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "scalar" });
    for (const field of Object.keys(d.containment)) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "containment" });
    for (const field of Object.keys(d.references)) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "reference" });
  }
  return {
    id: "neutral-lot4-base/1",
    version: "lot4-2",
    descriptor: "neutral-lot4-descriptors/1",
    types: Object.keys(descriptorsDoc.types),
    producerPolicy: "fixture-explicit",
    fields,
  };
}

// --------------------------------------------------------------- predicates
const selfType = type => ({ op: "typeIs", binding: "self", type, mode: "exact" });
const readSelf = path => ({ op: "read", binding: "self", path });
const fromGateway = (min, max) => ({
  op: "count", min, ...(max === undefined ? {} : { max }),
  select: { from: "self", via: "reference", property: "sourceRef", where: selfType("bpmn:ExclusiveGateway"), order: "id" },
});
const terminateCount = (min, max) => ({
  op: "count", min, ...(max === undefined ? {} : { max }),
  select: { from: "self", via: "children", property: "eventDefinitions", where: selfType("bpmn:TerminateEventDefinition"), order: "id" },
});
export const semanticIs = where => ({ op: "count", min: 1, select: { from: "self", via: "semantic", where, order: "id" } });
export const TERMINATE_END = { op: "all", args: [selfType("bpmn:EndEvent"), terminateCount(1)] };

// ------------------------------------------------------------- notions
const AI = { description: "Synthetic lot-4 profile example; no customer vocabulary.", examples: [], counterexamples: [], producers: ["editor", "import"], evidenceRequired: false };
const binding = (theme, glyph, tokens, label) => ({ theme, glyph, tokens, label });
const tok = (name, value) => ({ name, value });
export const EMPTY_LABEL = { op: "literal", value: "" };
export function notion(id, nativeTypes, recognition, renderBindings, extra = {}) {
  return { id, labels: [{ name: "en", value: id }], citations: [], nativeTypes, recognition, exclusiveGroup: "primary", ai: AI, referenceRecipes: [], renderBindings, fields: [], ...extra };
}
function facet(id, nativeTypes, recognition, renderBindings) {
  return { id, labels: [{ name: "en", value: id }], citations: [], nativeTypes, recognition, facet: true, ai: AI, referenceRecipes: [], renderBindings, fields: [] };
}
export const CHOICE_BLUE = "#1f4fbf";
export function lot4Notions(neutralNotions) {
  const task = clone(neutralNotions.find(n => n.id === "task"));
  const aid = clone(neutralNotions.find(n => n.id === "aid"));
  return [
    task,
    aid,
    notion("start", ["bpmn:StartEvent"], selfType("bpmn:StartEvent"), [binding("plain", "start", [], readSelf("/name"))]),
    notion("end", ["bpmn:EndEvent"], { op: "all", args: [selfType("bpmn:EndEvent"), terminateCount(0, 0)] }, [binding("plain", "end", [], readSelf("/name"))]),
    notion("terminate-end", ["bpmn:EndEvent"], TERMINATE_END, [binding("plain", "terminate-end", [tok("strokeWidth", 3)], readSelf("/name"))]),
    notion("service", ["bpmn:ServiceTask"], selfType("bpmn:ServiceTask"), [binding("plain", "service-task", [], readSelf("/name"))]),
    notion("call", ["bpmn:CallActivity"], selfType("bpmn:CallActivity"), [binding("plain", "call", [tok("strokeWidth", 2)], readSelf("/name"))]),
    notion("decision", ["bpmn:ExclusiveGateway"], selfType("bpmn:ExclusiveGateway"),
      [binding("plain", "gateway", [tok("fontWeight", "bold"), tok("textColor", "#000000")], readSelf("/name"))]),
    notion("choice", ["bpmn:SequenceFlow"], { op: "all", args: [selfType("bpmn:SequenceFlow"), fromGateway(1)] }, [
      binding("plain", "flow-line", [tok("arrow", "filled"), tok("fontWeight", "bold"), tok("textColor", CHOICE_BLUE)],
        { op: "case", value: readSelf("/name"), mode: "upper", unicode: "15.0.0" }),
      binding("lowered", "flow-line", [tok("arrow", "filled"), tok("fontWeight", "bold"), tok("textColor", CHOICE_BLUE)],
        { op: "case", value: readSelf("/name"), mode: "lower", unicode: "15.0.0" }),
    ]),
    notion("flow", ["bpmn:SequenceFlow"], { op: "all", args: [selfType("bpmn:SequenceFlow"), fromGateway(0, 0)] },
      [binding("plain", "flow-line", [tok("arrow", "filled")], readSelf("/name"))]),
    notion("pool", ["bpmn:Participant"], { op: "all", args: [selfType("bpmn:Participant"), { op: "boundRole", binding: "self", owner: "bindingOwner", role: "main-participant" }] },
      [binding("plain", "pool", [], readSelf("/name"))]),
    notion("band", ["bpmn:Participant"], { op: "all", args: [selfType("bpmn:Participant"), { op: "boundRole", binding: "self", owner: "bindingOwner", role: "reference-band" }] },
      [binding("plain", "band", [tok("fill", "#f4f4f4")], readSelf("/name"))]),
    notion("lane-external", ["bpmn:Lane"], { op: "all", args: [selfType("bpmn:Lane"), { op: "boundRole", binding: "self", owner: "bindingOwner", role: "external-lane" }] },
      [binding("plain", "lane", [tok("fill", "#fafafa")], readSelf("/name"))]),
    notion("lane-work", ["bpmn:Lane"], { op: "all", args: [selfType("bpmn:Lane"), { op: "not", arg: { op: "boundRole", binding: "self", owner: "bindingOwner", role: "external-lane" } }] },
      [binding("plain", "lane", [], readSelf("/name"))]),
    notion("process-input", ["bpmn:DataInput"], selfType("bpmn:DataInput"), [binding("plain", "data-input", [], readSelf("/name"))]),
    notion("process-output", ["bpmn:DataOutput"], selfType("bpmn:DataOutput"), [binding("plain", "data-output", [], readSelf("/name"))]),
    notion("reference", ["bpmn:DataStoreReference"], selfType("bpmn:DataStoreReference"), [binding("plain", "store", [tok("fill", "#f0f0ff")], readSelf("/name"))]),
    notion("relation", ["bpmn:Association"], selfType("bpmn:Association"), [binding("plain", "association-line", [tok("arrow", "open"), tok("dash", "dashed")], EMPTY_LABEL)]),
    notion("data-link", ["bpmn:DataInputAssociation", "bpmn:DataOutputAssociation"],
      { op: "any", args: [selfType("bpmn:DataInputAssociation"), selfType("bpmn:DataOutputAssociation")] },
      [binding("plain", "data-line", [tok("arrow", "open"), tok("dash", "dashed")], EMPTY_LABEL)]),
    facet("rework-stroke", ["bpmn:Task"], { op: "all", args: [selfType("bpmn:Task"), { op: "equal", left: readSelf("/name"), right: { op: "literal", value: "Fix order" } }] },
      [binding("plain", "task", [tok("stroke", "#aa0000")], readSelf("/name"))]),
    facet("rework-weight", ["bpmn:Task"], { op: "all", args: [selfType("bpmn:Task"), { op: "equal", left: readSelf("/name"), right: { op: "literal", value: "Fix order" } }] },
      [binding("plain", "task", [tok("fontWeight", "bold")], readSelf("/name"))]),
  ];
}

// --------------------------------------------------------------- themes
export const native = (id, nativeType, w, h) => ({ id, kind: "native", nativeType, viewBox: [0, 0, w, h], commands: [] });
export const PLAIN_PAINT = [
  tok("fill", "#ffffff"), tok("stroke", "#000000"), tok("textColor", "#000000"), tok("fontFamily", "fixture-sans"),
  tok("fontSize", 10), tok("fontWeight", "normal"), tok("strokeWidth", 1), tok("arrow", "none"),
];
export const REGION = {
  "external-lane": { headerWidth: 30000, padding: 10000, gap: 20000, minHeight: 60000 },
  "reference-band": { headerWidth: 30000, padding: 10000, gap: 20000, minHeight: 60000 },
};
const regionTokens = (key, values) => ["headerWidth", "padding", "gap", "minHeight"].map(n => tok(`region.${key}.${n}`, values[n]));
export const PLAIN_GLYPHS = [
  native("task", "bpmn:Task", 100, 80),
  native("aid", "bpmn:TextAnnotation", 100, 40),
  native("start", "bpmn:StartEvent", 36, 36),
  native("end", "bpmn:EndEvent", 36, 36),
  native("terminate-end", "bpmn:EndEvent", 36, 36),
  native("service-task", "bpmn:ServiceTask", 100, 80),
  native("call", "bpmn:CallActivity", 100, 80),
  native("gateway", "bpmn:ExclusiveGateway", 50, 50),
  native("flow-line", "bpmn:SequenceFlow", 100, 10),
  native("association-line", "bpmn:Association", 100, 10),
  { id: "data-line", kind: "path", viewBox: [0, 0, 100, 10], commands: [{ command: "M", values: [0, 5] }, { command: "L", values: [100, 5] }] },
  native("pool", "bpmn:Participant", 600, 250),
  native("band", "bpmn:Participant", 600, 120),
  native("lane", "bpmn:Lane", 570, 150),
  native("data-input", "bpmn:DataInput", 36, 50),
  native("data-output", "bpmn:DataOutput", 36, 50),
  native("store", "bpmn:DataStoreReference", 50, 50),
];
export const STRIPE_GLYPH = { id: "stripe", kind: "template", viewBox: [0, 0, 20, 100], commands: [], template: "band-stripe", parameters: [tok("stripeWidth", 20000)] };
export const TEMPLATE_GLYPHS = [
  { id: "hb", kind: "template", viewBox: [0, 0, 100, 80], commands: [], template: "header-band", parameters: [tok("headerHeight", 12000)] },
  { id: "cf", kind: "template", viewBox: [0, 0, 100, 80], commands: [], template: "corner-fold", parameters: [tok("foldRatio", 0.25), tok("headerRotation", 90)] },
  { id: "ab", kind: "template", viewBox: [0, 0, 30, 15], commands: [], template: "attached-badge", parameters: [tok("offsetX", 10000), tok("offsetY", -20000), tok("hideSource", false), tok("markerShift", 0)] },
  { id: "bs", kind: "template", viewBox: [0, 0, 20, 100], commands: [], template: "band-stripe", parameters: [tok("stripeWidth", 20000)] },
];
export const badgeGlyph = hideSource => ({ id: "badge", kind: "template", viewBox: [0, 0, 30, 15], commands: [], template: "attached-badge",
  parameters: [tok("offsetX", 10000), tok("offsetY", -20000), tok("hideSource", hideSource), tok("markerShift", 3000)] });
const rootSelect = type => ({ from: "root", via: "all", where: selfType(type), order: "id" });
export const STRIPE_DECLARATION = {
  id: "band-stripe",
  select: rootSelect("bpmn:Process"),
  role: "band-stripe",
  label: EMPTY_LABEL,
  region: "reference-band",
  glyph: "stripe",
  tokens: [tok("fill", "#dddddd")],
};
export const BADGE_DECLARATION = {
  id: "aid-badge",
  select: rootSelect("bpmn:TextAnnotation"),
  role: "attached-badge",
  label: { op: "literal", value: "tool" },
  region: "aids",
  glyph: "badge",
  tokens: [tok("fill", "#ccccff")],
};
const theme = (id, extra) => ({ id, aliases: [], tokens: [], glyphs: [], metricsResource: "neutral-metrics", geometry: "shared", syntheticOccurrences: [], ...extra });
export function lot4Themes() {
  return [
    theme("plain", { aliases: ["default"], tokens: [...PLAIN_PAINT, ...regionTokens("external-lane", REGION["external-lane"]), ...regionTokens("reference-band", REGION["reference-band"])], glyphs: PLAIN_GLYPHS }),
    theme("dim", { tokens: [tok("fill", "#eeeeee"), tok("arrow", "open")], fallback: "plain" }),
    theme("plain-striped", { glyphs: [STRIPE_GLYPH], syntheticOccurrences: [STRIPE_DECLARATION], fallback: "plain" }),
    theme("lowered", { glyphs: [native("flow-line", "bpmn:SequenceFlow", 100, 10)], fallback: "plain" }),
    theme("wide", { tokens: [tok("region.external-lane.padding", 12000)], fallback: "plain" }),
    theme("bold", { tokens: [tok("fontWeight", "bold")], fallback: "plain" }),
    theme("wide-own", { tokens: [tok("region.external-lane.padding", 12000)], geometry: "theme", fallback: "plain" }),
    theme("bare", { tokens: [...PLAIN_PAINT, ...regionTokens("external-lane", REGION["external-lane"])], glyphs: PLAIN_GLYPHS }),
    theme("templates", { glyphs: TEMPLATE_GLYPHS, fallback: "plain" }),
    theme("badged", { glyphs: [badgeGlyph(false)], syntheticOccurrences: [BADGE_DECLARATION], fallback: "plain" }),
    theme("badged-hidden", { glyphs: [badgeGlyph(true)], syntheticOccurrences: [BADGE_DECLARATION], fallback: "plain" }),
    theme("metric-z", { metricsResource: "z-metrics", fallback: "plain" }),
    theme("legacy-standard", { tokens: [tok("stroke", "#333333")], fallback: "plain" }),
    theme("legacy-custom", { tokens: [tok("fill", "#fff8e0"), tok("stroke", "#5a4a00")], fallback: "plain" }),
    theme("legacy-colored", { fallback: "legacy-standard" }),
  ];
}
export const LEGACY_ALIASES = [
  { kind: "theme", old: "standard", destination: "legacy-standard", mode: "explicit-adapter" },
  { kind: "theme", old: "legend", destination: "legacy-custom", mode: "explicit-adapter" },
  { kind: "theme", old: "colored", destination: "legacy-colored", mode: "explicit-adapter" },
];

// ------------------------------------------------------- support roles (N)
// The R3.1 lot-0 support recipe shape: declares the structural support roles
// the envelopes bind (DESIGN 5.1 L430: roles are profile data keys).
const ensure = (as, type, parent, property, role, key) => ({ op: "ensure", as, type, parent, property, owner: "self", role,
  ownerId: { op: "id", binding: role === "collaboration" ? "root" : "self" }, slot: role, key: role === "collaboration" ? { op: "id", binding: "self" } : { op: "literal", value: key ?? role },
  fields: [{ name: "name", value: { op: "literal", value: role } }] });
export function ensureSupportsRecipe() {
  return {
    id: "ensure-supports", phase: "normalize", parameters: [], select: rootSelect("bpmn:Process"), when: { op: "true" },
    writes: [{ binding: "root", path: "/rootElements", mode: "create" }, { binding: "envelope", path: "/bindings", mode: "binding" },
      { binding: "collaboration", path: "/participants", mode: "create" }, { binding: "main", path: "/processRef", mode: "reference" },
      { binding: "self", path: "/laneSets", mode: "create" }, { binding: "laneSet", path: "/lanes", mode: "create" }],
    steps: [
      ensure("collaboration", "bpmn:Collaboration", "root", "rootElements", "collaboration"),
      ensure("main", "bpmn:Participant", "collaboration", "participants", "main-participant"),
      { op: "assignRef", target: "main", path: "/processRef", mode: "replace", values: [{ op: "id", binding: "self" }] },
      ensure("laneSet", "bpmn:LaneSet", "self", "laneSets", "lane-set"),
      ensure("lane", "bpmn:Lane", "laneSet", "lanes", "external-lane"),
      ensure("band", "bpmn:Participant", "collaboration", "participants", "reference-band"),
    ],
  };
}
// Successor profiles bind their region key to a reserved lane.
export function ensureRegionLaneRecipe(region) {
  return {
    id: `ensure-${region}-lane`, phase: "normalize", parameters: [], select: rootSelect("bpmn:Process"), when: { op: "true" },
    writes: [{ binding: "envelope", path: "/bindings", mode: "binding" }, { binding: "self", path: "/laneSets", mode: "create" }, { binding: "laneSet", path: "/lanes", mode: "create" }],
    steps: [ensure("laneSet", "bpmn:LaneSet", "self", "laneSets", "lane-set"), ensure("lane", "bpmn:Lane", "laneSet", "lanes", region)],
  };
}

// --------------------------------------------------------------- exports
const occurrenceSelect = where => ({ from: "render", via: "occurrences", where, order: "page-occurrence" });
const readEq = (path, value) => ({ op: "equal", left: readSelf(path), right: { op: "literal", value } });
const artifactWrite = [{ binding: "self", path: "", mode: "artifact" }];
const reportWrite = { binding: "self", path: "", mode: "report" };
const isCall = semanticIs(selfType("bpmn:CallActivity"));
const nodeFields = [{ name: "id", value: { op: "outputId", binding: "self", domain: "node" } }, { name: "name", value: readSelf("/label/text") }];
export function lot4ExportRecipes() {
  return [
    {
      id: "export-nodes", phase: "export", parameters: [], select: occurrenceSelect({ op: "all", args: [readEq("/emittedType", "node"), { op: "not", arg: isCall }] }),
      when: { op: "true" }, writes: artifactWrite,
      steps: [{ op: "emit", as: "node", kind: "node", fields: nodeFields }],
    },
    {
      // Navigation (10.2 L794): the call node is emitted, its calledElement link
      // has no IR field, so the same iteration reports a navigation loss.
      id: "export-calls", phase: "export", parameters: [], select: occurrenceSelect({ op: "all", args: [readEq("/emittedType", "node"), isCall] }),
      when: { op: "true" }, writes: [...artifactWrite, reportWrite],
      steps: [{ op: "emit", as: "node", kind: "node", fields: nodeFields }, { op: "loss", target: "self", code: "navigation" }],
    },
    {
      id: "export-edges", phase: "export", parameters: [], select: occurrenceSelect(readEq("/emittedType", "edge")), when: { op: "true" }, writes: artifactWrite,
      steps: [
        { op: "bind", as: "fromNode", select: { from: "self", via: "reference", property: "sourceOccurrence", where: { op: "true" }, order: "page-occurrence" }, cardinality: "one" },
        { op: "bind", as: "toNode", select: { from: "self", via: "reference", property: "targetOccurrence", where: { op: "true" }, order: "page-occurrence" }, cardinality: "one" },
        { op: "emit", as: "edge", kind: "edge", fields: [
          { name: "id", value: { op: "outputId", binding: "self", domain: "edge" } },
          { name: "source", value: { op: "outputId", binding: "fromNode", domain: "node" } },
          { name: "target", value: { op: "outputId", binding: "toNode", domain: "node" } },
        ] },
      ],
    },
    {
      id: "export-edge-labels", phase: "export", parameters: [],
      select: occurrenceSelect({ op: "all", args: [readEq("/emittedType", "edge"), { op: "present", value: readSelf("/label/text") }] }),
      when: { op: "true" }, writes: artifactWrite,
      steps: [{ op: "emit", as: "label", kind: "label", fields: [
        { name: "id", value: { op: "outputId", binding: "self", domain: "label" } },
        { name: "text", value: readSelf("/label/text") },
      ] }],
    },
    {
      // Marker stripped from the node name (10.2 L793): loss-only recipe, no
      // record in its own iteration, hence unavailable result coordinates (B23).
      id: "export-aid-marker", phase: "export", parameters: [],
      select: occurrenceSelect(semanticIs({ op: "recognizes", binding: "self", notion: "aid" })),
      when: { op: "true" }, writes: [reportWrite],
      steps: [{ op: "loss", target: "self", code: "metadata" }],
    },
  ];
}
const anyType = (...types) => types.length === 1 ? selfType(types[0]) : { op: "any", args: types.map(selfType) };
export const LOT4_CAPABILITIES = [
  { when: { op: "true" }, class: "structural", losses: [] },
  { when: semanticIs(anyType("bpmn:DataStoreReference")), class: "structural", losses: ["semantic-type"] },
  { when: semanticIs(anyType("bpmn:DataInput", "bpmn:DataOutput")), class: "structural", losses: ["semantic-type"] },
  { when: semanticIs(anyType("bpmn:DataInputAssociation", "bpmn:DataOutputAssociation")), class: "structural", losses: ["relation-kind"] },
  { when: semanticIs({ op: "recognizes", binding: "self", notion: "band" }), class: "structural", losses: ["metadata"] },
  { when: semanticIs(TERMINATE_END), class: "structural", losses: ["semantic-type", "appearance"] },
  { when: semanticIs(selfType("bpmn:ServiceTask")), class: "structural", losses: ["semantic-type"] },
];
export const SERIALIZER = { version: "lot4-2", encoding: "UTF-8", newline: "LF", indent: 0, compression: "none",
  attributeOrder: ["id", "value", "style", "parent", "vertex", "edge", "source", "target"], emptyElement: "short" };
export function lot4Exports() {
  return [
    { id: "drawing", format: "drawio", recipes: ["export-pages", "export-nodes", "export-calls", "export-edges", "export-edge-labels", "export-aid-marker"],
      capabilities: LOT4_CAPABILITIES, idPolicy: "counter", counterOrigin: 1, metadata: [], serializer: SERIALIZER },
    { id: "ea", format: "sparx", recipes: ["export-pages", "export-nodes", "export-calls", "export-edges", "export-aid-marker"],
      capabilities: LOT4_CAPABILITIES, idPolicy: "native", counterOrigin: 0, metadata: [], serializer: SERIALIZER },
  ];
}

// ------------------------------------------------------------- profile
// Lint tables: every standard upstream setting is off (lot 4 does not test the
// lot-1 engine); the declarative profile subrules keep their draft/accept rows,
// so each lint stage outcome is a literal decision (DESIGN 6.2-6.4).
export const standardOff = validation => validation.map(table => ({ ...table, settings: table.settings.map(s => (s.rule.startsWith("profile:") ? s : { ...s, severity: "off" })) }));
export function buildProfile(neutral, basePin, descriptorPin, zMetrics) {
  const p = clone(neutral);
  p.profile = "neutral-lot4/1";
  p.version = "1.1.0";
  p.base = basePin;
  p.descriptors = [descriptorPin];
  p.notions = lot4Notions(neutral.notions);
  p.recipes = [...neutral.recipes.filter(r => !["place-task", "export-nodes"].includes(r.id)), ensureSupportsRecipe(), ...lot4ExportRecipes()];
  p.validation = standardOff(neutral.validation);
  p.themes = lot4Themes();
  p.exports = lot4Exports();
  p.resources = [...neutral.resources, zMetrics];
  p.compatibilityAliases = LEGACY_ALIASES;
  return p;
}

// Explicitly bound neutral successors (DESIGN 14.3 L961): the lot-0 profile
// with the lot-4 package, a declared region lane role and a lane glyph.
export function buildSuccessor(lot0, { version, region, basePin, descriptorPin }) {
  const p = clone(lot0);
  p.version = version;
  p.base = basePin;
  p.descriptors = [descriptorPin];
  p.recipes = [...p.recipes, ensureRegionLaneRecipe(region)];
  p.notions = [...p.notions, notion("lane", ["bpmn:Lane"], { op: "all", args: [selfType("bpmn:Lane"), { op: "boundRole", binding: "self", owner: "bindingOwner", role: region }] },
    [binding("plain", "lane", [], readSelf("/name"))])];
  p.themes = p.themes.map(t => (t.id === "plain" ? { ...t, glyphs: [...t.glyphs, native("lane", "bpmn:Lane", 570, 150)] } : t));
  return p;
}
