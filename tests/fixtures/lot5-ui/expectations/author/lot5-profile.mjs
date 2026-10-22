// Lot-5 synthetic UI fixture data, authored by hand. Pure data assembly: this
// module builds JSON records and never parses, compiles or evaluates them.
// It imports only the sibling arithmetic helper.
import { B, H, clone } from "./lot5-arith.mjs";

// ---------------------------------------------------------------- descriptors
const FLOW_ELEMENTS = [
  "bpmn:Task", "bpmn:UserTask", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:ExclusiveGateway",
  "bpmn:SequenceFlow", "bpmn:CallActivity", "bpmn:DataStoreReference", "bpmn:DataObjectReference", "bpmn:DataObject",
];
const FLOW_NODES = ["bpmn:Task", "bpmn:UserTask", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:ExclusiveGateway", "bpmn:CallActivity"];
const task = {
  id: true, scalars: ["id", "name"],
  containment: {
    documentation: ["bpmn:Documentation"], properties: ["bpmn:Property"],
    dataInputAssociations: ["bpmn:DataInputAssociation"], dataOutputAssociations: ["bpmn:DataOutputAssociation"],
  },
  references: {},
};
export const descriptorDocument = {
  id: "ui-neutral-descriptors/1",
  version: "lot5-2",
  scope: "Synthetic descriptor slice for the lot-5 UI expectations; not the complete BPMN descriptor set. FlowNode incoming/outgoing are deliberately not admitted.",
  types: {
    "bpmn:Definitions": { id: true, scalars: ["id", "name", "targetNamespace", "exporterVersion"], containment: { rootElements: ["bpmn:Process", "bpmn:DataStore", "bpmn:Collaboration"] }, references: {} },
    "bpmn:Collaboration": { id: true, scalars: ["id", "name"], containment: { participants: ["bpmn:Participant"] }, references: {} },
    "bpmn:Participant": { id: true, scalars: ["id", "name"], containment: {}, references: { processRef: ["bpmn:Process"] } },
    "bpmn:Process": {
      id: true, scalars: ["id", "name", "isExecutable", "processType"],
      containment: { flowElements: FLOW_ELEMENTS, artifacts: ["bpmn:TextAnnotation", "bpmn:Association"], ioSpecification: ["bpmn:InputOutputSpecification"], documentation: ["bpmn:Documentation"] },
      references: {},
    },
    "bpmn:Task": task,
    "bpmn:UserTask": { ...clone(task), extends: ["bpmn:Task"] },
    "bpmn:StartEvent": { id: true, scalars: ["id", "name"], containment: { documentation: ["bpmn:Documentation"] }, references: {} },
    "bpmn:EndEvent": { id: true, scalars: ["id", "name"], containment: { documentation: ["bpmn:Documentation"] }, references: {} },
    "bpmn:ExclusiveGateway": { id: true, scalars: ["id", "name"], containment: { documentation: ["bpmn:Documentation"] }, references: {} },
    "bpmn:SequenceFlow": { id: true, scalars: ["id", "name"], containment: {}, references: { sourceRef: FLOW_NODES, targetRef: FLOW_NODES } },
    "bpmn:CallActivity": { id: true, scalars: ["id", "name", "calledElement"], containment: { documentation: ["bpmn:Documentation"] }, references: {} },
    "bpmn:DataStore": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
    "bpmn:DataStoreReference": { id: true, scalars: ["id", "name"], containment: {}, references: { dataStoreRef: ["bpmn:DataStore"] } },
    "bpmn:DataObject": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
    "bpmn:DataObjectReference": { id: true, scalars: ["id", "name"], containment: {}, references: { dataObjectRef: ["bpmn:DataObject"] } },
    "bpmn:Property": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
    "bpmn:DataInputAssociation": { id: true, scalars: ["id"], containment: {}, references: { sourceRef: ["bpmn:DataObjectReference", "bpmn:DataInput"], targetRef: ["bpmn:Property"] } },
    "bpmn:DataOutputAssociation": { id: true, scalars: ["id"], containment: {}, references: { targetRef: ["bpmn:DataObjectReference"] } },
    "bpmn:TextAnnotation": { id: true, scalars: ["id", "text"], containment: { documentation: ["bpmn:Documentation"] }, references: {} },
    "bpmn:Association": {
      id: true, scalars: ["id", "associationDirection"], containment: {},
      references: { sourceRef: ["bpmn:DataStoreReference", "bpmn:TextAnnotation"], targetRef: ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity"] },
    },
    "bpmn:InputOutputSpecification": { id: false, scalars: [], containment: { dataInputs: ["bpmn:DataInput"], inputSets: ["bpmn:InputSet"] }, references: {} },
    "bpmn:DataInput": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
    "bpmn:InputSet": { id: true, scalars: ["id", "name"], containment: {}, references: { dataInputRefs: ["bpmn:DataInput"] } },
    "bpmn:Documentation": { id: false, scalars: ["text", "textFormat"], containment: {}, references: {} },
  },
};

function baseFields() {
  const fields = [];
  for (const [type, d] of Object.entries(descriptorDocument.types)) {
    for (const field of d.scalars) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "scalar" });
    for (const field of Object.keys(d.containment)) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "containment" });
    for (const field of Object.keys(d.references)) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "reference" });
  }
  return fields;
}
export const baseDocument = {
  id: "ui-neutral-base/1",
  version: "lot5-2",
  descriptor: "ui-neutral-descriptors/1",
  types: Object.keys(descriptorDocument.types),
  producerPolicy: "fixture-explicit",
  idRefScalars: ["bpmn:CallActivity.calledElement"],
  fields: baseFields(),
};
export const metricsDocument = {
  id: "ui-neutral-metrics/1", textPolicy: "engine-scalar-A/1", unicode: "15.0.0", unit: "micro-point",
  defaultAdvance: 600, spaceAdvance: 300, ascent: 800, descent: 200,
};

// Fixture files are written as pretty JSON plus LF; pins use raw SHA-256 (B).
export const fileText = value => `${JSON.stringify(value, null, 2)}\n`;
export const descriptorPin = { id: descriptorDocument.id, version: descriptorDocument.version, sha256: B(fileText(descriptorDocument)) };
export const basePin = { id: baseDocument.id, version: baseDocument.version, sha256: B(fileText(baseDocument)) };
export const metricsSha256 = B(fileText(metricsDocument));

// ---------------------------------------------------------------- AST helpers
export const TRUE = { op: "true" }, FALSE = { op: "false" };
export const T = (binding, type, mode = "exact") => ({ op: "typeIs", binding, type, mode });
const any = (...args) => ({ op: "any", args });
const all = (...args) => ({ op: "all", args });
const not = arg => ({ op: "not", arg });
const param = name => ({ op: "param", name });
const read = (binding, path) => ({ op: "read", binding, path });
const idOf = binding => ({ op: "id", binding });
const lit = value => ({ op: "literal", value });
const concat = (...values) => ({ op: "concat", values });
const present = value => ({ op: "present", value });
const equal = (left, right) => ({ op: "equal", left, right });
const prefix = (value, text) => ({ op: "textPrefix", value, prefix: text, trim: "none" });
const count = (select, min, max) => ({ op: "count", select, min, ...(max === undefined ? {} : { max }) });
const sel = (from, via, where = TRUE, extra = {}) => ({ from, via, ...extra, where, order: "id" });
const p = (name, type) => ({ name, type, required: true });
const w = (binding, path, mode) => ({ binding, path, mode });
const field = (name, value) => ({ name, value });
const create = (as, type, parent, property, slot, owner, fields = []) =>
  ({ op: "create", as, type, parent, property, identity: "allocated", ownerId: idOf(owner), slot, key: param("key"), fields });
const assign = (target, path, binding) => ({ op: "assignRef", target, path, values: [idOf(binding)], mode: "replace" });
const bindOne = (as, select) => ({ op: "bind", as, select, cardinality: "one" });
const refuse = (code, target) => ({ op: "refuse", code, target });
const recipe = (id, phase, parameters, select, writes, steps, when = TRUE) => ({ id, phase, parameters, select, when, writes, steps });
const isProcess = T("self", "bpmn:Process");
const anyTask = binding => T(binding, "bpmn:Task", "assignable");
const flowSource = binding => any(anyTask(binding), T(binding, "bpmn:StartEvent"), T(binding, "bpmn:ExclusiveGateway"), T(binding, "bpmn:CallActivity"));
const flowTarget = binding => any(anyTask(binding), T(binding, "bpmn:EndEvent"), T(binding, "bpmn:ExclusiveGateway"), T(binding, "bpmn:CallActivity"));
const activity = binding => any(anyTask(binding), T(binding, "bpmn:CallActivity"));
const aidText = binding => all(T(binding, "bpmn:TextAnnotation"), prefix(read(binding, "/text"), "[Aid]"));
const noteText = binding => all(T(binding, "bpmn:TextAnnotation"), not(prefix(read(binding, "/text"), "[Aid]")));
export const AID_MARKER = "[Aid] ";
export const LOCKED = "[Locked]", HIDDEN = "[Hidden]", BANDED = "Banded";

// ---------------------------------------------------------------- recipes
const simpleCreate = (id, type, slot) => recipe(id, "create", [p("owner", "element"), p("key", "string"), p("name", "string")],
  sel("owner", "self", isProcess), [w("owner", "/flowElements", "create")],
  [create("created", type, "owner", "flowElements", slot, "owner", [field("name", param("name"))])]);
const link = (id, slot, direction, when) => recipe(id, "reference",
  [p("owner", "element"), p("source", "element"), p("target", "element"), p("key", "string")], sel("owner", "self", isProcess),
  [w("owner", "/artifacts", "create"), w("link", "/sourceRef", "reference"), w("link", "/targetRef", "reference")],
  [create("link", "bpmn:Association", "owner", "artifacts", slot, "owner", [field("associationDirection", lit(direction))]),
    assign("link", "/sourceRef", "source"), assign("link", "/targetRef", "target")], when);
const append = (id, type, as, slot) => recipe(id, "create",
  [p("owner", "element"), p("anchor", "element"), p("key", "string"), p("name", "string")], sel("owner", "self", isProcess),
  [w("owner", "/flowElements", "create"), w("flow", "/sourceRef", "reference"), w("flow", "/targetRef", "reference")],
  [create(as, type, "owner", "flowElements", slot, "owner", [field("name", param("name"))]),
    create("flow", "bpmn:SequenceFlow", "owner", "flowElements", "flow", "owner"),
    assign("flow", "/sourceRef", "anchor"), assign("flow", "/targetRef", as)]);
// Type-changing replace (harmonization D7, DESIGN §2.4 L163/L171, §8.3 L651):
// mechanism 1 has no retype action, so the replacement is a new allocated
// element appended to the container and the original is removed with an
// explicit empty dependents selector; a referenced original refuses.
const keepNothing = sel("target", "inverseReference", FALSE, { property: "sourceRef" });
const retype = (id, from, to) => recipe(id, "convert", [p("target", "element"), p("key", "string")],
  sel("target", "self", T("self", from)), [w("container", "/flowElements", "create"), w("target", "", "remove")],
  [bindOne("container", sel("self", "owner")),
    create("replacement", to, "container", "flowElements", "replace", "container", [field("name", read("self", "/name"))]),
    { op: "remove", target: "target", dependents: keepNothing, policy: "refuseIfReferenced" }]);
const setField = (id, path, paramName, type, value, select = sel("target", "self"), when = TRUE) => recipe(id, "edit",
  [p("target", "element"), p(paramName, type)], select, [w("self", path, "set")], [{ op: "set", target: "self", path, value }], when);

export const recipes = [
  simpleCreate("create-task", "bpmn:Task", "task"),
  simpleCreate("create-user-task", "bpmn:UserTask", "user-task"),
  simpleCreate("create-start", "bpmn:StartEvent", "start"),
  simpleCreate("create-end", "bpmn:EndEvent", "end"),
  simpleCreate("create-gateway", "bpmn:ExclusiveGateway", "gateway"),
  simpleCreate("create-call", "bpmn:CallActivity", "call"),
  // OPEN-EXTERNAL gate (harmonization H4): the external entry refuses profile-open atomically.
  recipe("create-external-call", "create", [p("owner", "element"), p("key", "string"), p("name", "string")], sel("owner", "self", isProcess),
    [], [refuse("profile-open", "owner")]),
  recipe("create-reference", "create", [p("owner", "element"), p("key", "string"), p("name", "string")], sel("owner", "self", isProcess),
    [w("root", "/rootElements", "create"), w("owner", "/flowElements", "create"), w("reference", "/dataStoreRef", "reference")],
    [create("store", "bpmn:DataStore", "root", "rootElements", "store", "owner", [field("name", param("name"))]),
      create("reference", "bpmn:DataStoreReference", "owner", "flowElements", "reference", "owner"),
      assign("reference", "/dataStoreRef", "store")]),
  recipe("create-item", "create", [p("owner", "element"), p("key", "string"), p("name", "string")], sel("owner", "self", isProcess),
    [w("owner", "/flowElements", "create"), w("item", "/dataObjectRef", "reference")],
    [create("backing", "bpmn:DataObject", "owner", "flowElements", "data-object", "owner"),
      create("item", "bpmn:DataObjectReference", "owner", "flowElements", "item", "owner", [field("name", param("name"))]),
      assign("item", "/dataObjectRef", "backing")]),
  recipe("create-input", "create", [p("owner", "element"), p("set", "element"), p("key", "string"), p("name", "string")], sel("owner", "self", isProcess),
    [w("io", "/dataInputs", "create"), w("set", "/dataInputRefs", "reference")],
    [bindOne("io", sel("owner", "children", TRUE, { property: "ioSpecification" })),
      create("input", "bpmn:DataInput", "io", "dataInputs", "data-input", "owner", [field("name", param("name"))]),
      { op: "assignRef", target: "set", path: "/dataInputRefs", values: [idOf("input")], mode: "appendUnique" }]),
  recipe("create-input-loose", "create", [p("owner", "element"), p("key", "string"), p("name", "string")], sel("owner", "self", isProcess),
    [w("io", "/dataInputs", "create")],
    [bindOne("io", sel("owner", "children", TRUE, { property: "ioSpecification" })),
      create("input", "bpmn:DataInput", "io", "dataInputs", "data-input", "owner", [field("name", param("name"))])]),
  recipe("create-aid", "create", [p("owner", "element"), p("key", "string"), p("body", "string")], sel("owner", "self", isProcess),
    [w("owner", "/artifacts", "create")],
    [create("note", "bpmn:TextAnnotation", "owner", "artifacts", "aid", "owner", [field("text", concat(lit(AID_MARKER), param("body")))])]),
  append("append-task", "bpmn:Task", "task", "task"),
  append("append-end", "bpmn:EndEvent", "end", "end"),
  recipe("append-aid", "create", [p("owner", "element"), p("anchor", "element"), p("key", "string"), p("body", "string")], sel("owner", "self", isProcess),
    [w("owner", "/artifacts", "create"), w("link", "/sourceRef", "reference"), w("link", "/targetRef", "reference")],
    [create("note", "bpmn:TextAnnotation", "owner", "artifacts", "aid", "owner", [field("text", concat(lit(AID_MARKER), param("body")))]),
      create("link", "bpmn:Association", "owner", "artifacts", "aid-link", "owner", [field("associationDirection", lit("None"))]),
      assign("link", "/sourceRef", "note"), assign("link", "/targetRef", "anchor")]),
  recipe("connect-flow", "reference", [p("owner", "element"), p("source", "element"), p("target", "element"), p("key", "string")], sel("owner", "self", isProcess),
    [w("owner", "/flowElements", "create"), w("flow", "/sourceRef", "reference"), w("flow", "/targetRef", "reference")],
    [create("flow", "bpmn:SequenceFlow", "owner", "flowElements", "flow", "owner"), assign("flow", "/sourceRef", "source"), assign("flow", "/targetRef", "target")],
    flowTarget("target")),
  link("link-reference", "reference-link", "One", activity("target")),
  recipe("link-item-input", "reference", [p("source", "element"), p("target", "element"), p("key", "string")], sel("target", "self"),
    [w("target", "/properties", "create"), w("target", "/dataInputAssociations", "create"), w("association", "/sourceRef", "reference"), w("association", "/targetRef", "reference")],
    [create("port", "bpmn:Property", "target", "properties", "port", "target"),
      create("association", "bpmn:DataInputAssociation", "target", "dataInputAssociations", "input-association", "target"),
      assign("association", "/sourceRef", "source"), assign("association", "/targetRef", "port")],
    anyTask("target")),
  recipe("link-item-output", "reference", [p("source", "element"), p("target", "element"), p("key", "string")], sel("source", "self"),
    [w("source", "/dataOutputAssociations", "create"), w("association", "/targetRef", "reference")],
    [create("association", "bpmn:DataOutputAssociation", "source", "dataOutputAssociations", "output-association", "source"),
      assign("association", "/targetRef", "target")],
    T("target", "bpmn:DataObjectReference")),
  link("link-aid", "aid-link", "None", activity("target")),
  retype("replace-with-user-task", "bpmn:Task", "bpmn:UserTask"),
  retype("replace-with-task", "bpmn:UserTask", "bpmn:Task"),
  recipe("convert-reference-to-item", "convert", [p("target", "element"), p("key", "string")], sel("target", "self", T("self", "bpmn:DataStoreReference")),
    [w("container", "/flowElements", "create"), w("replacement", "/dataObjectRef", "reference"), w("target", "", "remove")],
    [bindOne("container", sel("self", "owner")),
      bindOne("store", sel("self", "reference", TRUE, { property: "dataStoreRef" })),
      create("backing", "bpmn:DataObject", "container", "flowElements", "data-object", "container"),
      create("replacement", "bpmn:DataObjectReference", "container", "flowElements", "replace", "container", [field("name", read("store", "/name"))]),
      assign("replacement", "/dataObjectRef", "backing"),
      { op: "remove", target: "target", dependents: keepNothing, policy: "refuseIfReferenced" }]),
  // Same-type conversion (D7): the ID survives, no replacement map.
  recipe("convert-note-to-aid", "convert", [p("target", "element")], sel("target", "self", T("self", "bpmn:TextAnnotation")),
    [w("self", "/text", "set")], [{ op: "set", target: "self", path: "/text", value: concat(lit(AID_MARKER), read("self", "/text")) }],
    not(prefix(read("target", "/text"), "[Aid]"))),
  recipe("delete-element", "edit", [p("target", "element")], sel("target", "self"), [w("target", "", "remove")],
    [{ op: "remove", target: "target", dependents: sel("target", "inverseReference", TRUE, { property: "sourceRef" }), policy: "includeDeclared" }]),
  recipe("paste-gate", "create", [p("owner", "element"), p("key", "string")], sel("owner", "self", isProcess), [],
    [bindOne("container", sel("owner", "self"))]),
  setField("rename", "/name", "name", "string", param("name")),
  // Content conditions live in recipe `when` (evaluated after the type-only
  // surface predicate admitted the target), never in ui.when: see aidText().
  setField("edit-aid", "/text", "body", "string", concat(lit(AID_MARKER), param("body")), sel("target", "self", T("self", "bpmn:TextAnnotation")),
    prefix(read("target", "/text"), "[Aid]")),
  setField("edit-note", "/text", "text", "string", param("text"), sel("target", "self", T("self", "bpmn:TextAnnotation")),
    not(prefix(read("target", "/text"), "[Aid]"))),
  // Reference widgets submit IDs as typed string values (DESIGN §8.3 L655, L659).
  setField("link-call", "/calledElement", "process", "string", param("process"), sel("target", "self", T("self", "bpmn:CallActivity"))),
  recipe("relink-aid", "edit", [p("target", "element"), p("activity", "string")], sel("target", "self", T("self", "bpmn:Association")),
    [w("self", "/targetRef", "reference")], [{ op: "assignRef", target: "self", path: "/targetRef", values: [param("activity")], mode: "replace" }]),
  recipe("unlink-call", "edit", [p("target", "element")], sel("target", "self", T("self", "bpmn:CallActivity")),
    [w("self", "/calledElement", "unset")], [{ op: "unset", target: "self", path: "/calledElement" }], present(read("target", "/calledElement"))),
  setField("set-process-kind", "/processType", "kind", "string", param("kind"), sel("target", "self", isProcess)),
  recipe("complete-process", "complete", [], sel("root", "all", isProcess), [w("self", "/isExecutable", "set")],
    [{ op: "set", target: "self", path: "/isExecutable", value: lit(false) }]),
  // C refusal through profile data (DESIGN §7.1 L547): a DataInput no InputSet
  // covers, while two or more InputSets exist, refuses io-set-selection-required.
  recipe("require-input-set", "complete", [], { from: "root", via: "all", where: T("self", "bpmn:InputOutputSpecification"), order: "id" }, [],
    [refuse("io-set-selection-required", "self")],
    all(count(sel("self", "children", TRUE, { property: "inputSets" }), 2),
      count(sel("self", "children", count(sel("self", "inverseReference", TRUE, { property: "dataInputRefs" }), 0, 0), { property: "dataInputs" }), 1))),
  // OPEN-RESERVED-N witness (harmonization H2): N ensures a bound Collaboration
  // support for a Process whose name starts with the fixture marker. The
  // candidates are root elements only (every root type admits /name), so the
  // non-short-circuit `all` never reads an undeclared field (§2.3 L141).
  recipe("ensure-collaboration", "normalize", [], sel("root", "children", all(isProcess, prefix(read("self", "/name"), BANDED)), { property: "rootElements" }),
    [w("root", "/rootElements", "create"), w("envelope", "/bindings", "binding")],
    [{ op: "ensure", as: "collaboration", type: "bpmn:Collaboration", parent: "root", property: "rootElements", owner: "self", role: "collaboration",
      slot: "collaboration", key: idOf("self"), fields: [], ownerId: idOf("root") }]),
  recipe("export-pages", "export", [], { from: "render", via: "pages", where: TRUE, order: "page-occurrence" }, [w("self", "", "artifact")],
    [{ op: "emit", as: "page", kind: "page", fields: [field("id", { op: "outputId", binding: "self", domain: "page" }), field("name", read("self", "/name"))] }]),
  recipe("export-nodes", "export", [], { from: "render", via: "occurrences", where: equal(read("self", "/emittedType"), lit("node")), order: "page-occurrence" },
    [w("self", "", "artifact")],
    [{ op: "emit", as: "node", kind: "node", fields: [field("id", { op: "outputId", binding: "self", domain: "node" }), field("name", read("self", "/label/text"))] }]),
];

// ---------------------------------------------------------------- notions
const GLYPHS = ["process", "task", "user-task", "start", "end", "gateway", "flow", "call", "reference", "store", "item", "input", "aid", "note", "link"];
const fill = { plain: "#ffffff", contrast: "#000000" };
const nameLabel = read("self", "/name");
const bindings = (glyph, label = nameLabel) => ["plain", "contrast"].map(theme => ({ theme, glyph, tokens: [{ name: "fill", value: fill[theme] }], label }));
const fieldRecord = (id, path, widget, label, command, parameters, extra = {}) => ({
  id, path, widget, label, visible: TRUE, mutable: command ? TRUE : FALSE, ...(command ? { command, parameters } : {}),
  choices: [], targetTypes: [], message: "field.invalid", ...extra,
});
const nameField = (id = "name", label = "field.name", widget = "text", extra = {}) =>
  fieldRecord(id, "/name", widget, label, "rename", [{ name: "target", source: "target" }, { name: "name", source: "value" }], extra);
const notion = (id, nativeTypes, recognition, glyph, fields = [], extra = {}) => ({
  id, labels: [{ name: "en", value: id }], citations: [], nativeTypes, recognition, exclusiveGroup: "primary",
  ai: { description: "Synthetic lot-5 UI notion; no customer vocabulary.", examples: [], counterexamples: [], producers: ["editor", "import"], evidenceRequired: false },
  ...extra, referenceRecipes: extra.referenceRecipes ?? [], renderBindings: glyph ? bindings(glyph, extra.label) : [], fields,
});
const stripLabel = { op: "stripPrefix", value: read("self", "/text"), prefix: AID_MARKER, trim: "none" };
export const UPPER_CHOICE = { op: "case", value: read("self", "/name"), mode: "upper", unicode: "15.0.0" };
export const notions = [
  notion("process", ["bpmn:Process"], T("self", "bpmn:Process"), null, [
    nameField(),
    fieldRecord("kind", "/processType", "enum", "field.kind", "set-process-kind", [{ name: "target", source: "target" }, { name: "kind", source: "value" }],
      { choices: [{ name: "none", value: "None" }, { name: "public", value: "Public" }, { name: "private", value: "Private" }] }),
    fieldRecord("executable", "/isExecutable", "readonly", "field.executable", null, null),
  ]),
  notion("task", ["bpmn:Task"], T("self", "bpmn:Task"), "task", [nameField()], { createRecipe: "create-task" }),
  notion("user-task", ["bpmn:UserTask"], T("self", "bpmn:UserTask"), "user-task", [nameField()], { createRecipe: "create-user-task" }),
  notion("start", ["bpmn:StartEvent"], T("self", "bpmn:StartEvent"), "start", [nameField("situations", "field.situations", "multiline")], { createRecipe: "create-start" }),
  notion("end", ["bpmn:EndEvent"], T("self", "bpmn:EndEvent"), "end", [nameField()], { createRecipe: "create-end" }),
  notion("gateway", ["bpmn:ExclusiveGateway"], T("self", "bpmn:ExclusiveGateway"), "gateway", [nameField("question", "field.question")], { createRecipe: "create-gateway" }),
  notion("flow", ["bpmn:SequenceFlow"], T("self", "bpmn:SequenceFlow"), "flow", [nameField("choice", "field.choice", "text", { display: UPPER_CHOICE })], { referenceRecipes: ["connect-flow"] }),
  notion("call", ["bpmn:CallActivity"], T("self", "bpmn:CallActivity"), "call", [
    nameField(),
    fieldRecord("target", "/calledElement", "reference", "field.call-target", "link-call", [{ name: "target", source: "target" }, { name: "process", source: "value" }],
      { targetTypes: ["bpmn:Process"], visible: not(prefix(read("self", "/name"), HIDDEN)), mutable: not(prefix(read("self", "/name"), LOCKED)) }),
  ], { createRecipe: "create-call" }),
  notion("reference", ["bpmn:DataStoreReference"], T("self", "bpmn:DataStoreReference"), "reference", [nameField("override", "field.override")],
    { createRecipe: "create-reference", referenceRecipes: ["link-reference"] }),
  notion("store", ["bpmn:DataStore"], T("self", "bpmn:DataStore"), null, [nameField("title", "field.title")]),
  notion("item", ["bpmn:DataObjectReference"], T("self", "bpmn:DataObjectReference"), "item", [nameField()],
    { createRecipe: "create-item", referenceRecipes: ["link-item-input"] }),
  notion("input", ["bpmn:DataInput"], T("self", "bpmn:DataInput"), "input", [nameField()], { createRecipe: "create-input" }),
  notion("aid", ["bpmn:TextAnnotation"], aidText("self"), "aid", [
    fieldRecord("body", "/text", "multiline", "field.body", "edit-aid", [{ name: "target", source: "target" }, { name: "body", source: "value" }], { display: stripLabel }),
  ], { createRecipe: "create-aid", referenceRecipes: ["link-aid"], label: stripLabel }),
  notion("note", ["bpmn:TextAnnotation"], noteText("self"), "note", [
    fieldRecord("text", "/text", "multiline", "field.text", "edit-note", [{ name: "target", source: "target" }, { name: "text", source: "value" }]),
  ], { label: read("self", "/text") }),
  notion("reference-link", ["bpmn:Association"], all(T("self", "bpmn:Association"), equal(read("self", "/associationDirection"), lit("One"))), "link", [], { label: lit("") }),
  notion("aid-link", ["bpmn:Association"], all(T("self", "bpmn:Association"), equal(read("self", "/associationDirection"), lit("None"))), "link", [
    fieldRecord("target", "/targetRef", "reference", "field.anchor", "relink-aid", [{ name: "target", source: "target" }, { name: "activity", source: "value" }],
      { targetTypes: ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity"] }),
  ], { label: lit("") }),
];
// The notion helper only spreads createRecipe/referenceRecipes; strip the
// helper-only label key so every record stays schema-closed.
for (const n of notions) delete n.label;

// ---------------------------------------------------------------- rules and validation
const STAGES = ["import", "pre-normalize", "post-normalize", "post-layout", "release"];
const ruleId = stage => stage === "post-normalize" ? "activity-named" : `activity-named-${stage}`;
export const ruleCode = stage => stage === "post-normalize" ? "activity-name-missing" : `activity-name-missing-${stage}`;
export const RULE_MESSAGE = "rule.activity-name";
export const ruleFor = ruleId;
export const rules = STAGES.map(stage => ({
  id: ruleId(stage), phase: stage,
  select: { from: "root", via: "all", where: anyTask("self"), order: "id" },
  assert: all(present(read("self", "/name")), not(equal(read("self", "/name"), lit("")))),
  code: ruleCode(stage), message: RULE_MESSAGE, classification: "readiness",
}));
export const STANDARD_RULES = [
  "ad-hoc-sub-process", "conditional-flows", "end-event-required", "event-based-gateway", "event-sub-process-typed-start-event",
  "fake-join", "global", "label-required", "link-event", "no-bpmndi", "no-complex-gateway", "no-disconnected",
  "no-duplicate-sequence-flows", "no-gateway-join-fork", "no-implicit-split", "no-implicit-end", "no-implicit-start",
  "no-inclusive-gateway", "no-overlapping-elements", "single-blank-start-event", "single-event-definition",
  "start-event-required", "sub-process-blank-start-event", "superfluous-gateway", "superfluous-label", "superfluous-termination",
];
export const validation = STAGES.flatMap(stage => ["draft", "accept"].map(policy => ({
  id: stage, policy, extends: ["bpmnlint:recommended"],
  settings: [
    ...STANDARD_RULES.map(rule => ({ rule, severity: "off", classification: "integrity" })),
    { rule: `profile:${ruleId(stage)}`, severity: policy === "draft" ? "warn" : "error", classification: "readiness" },
  ],
  profileRule: "profile-mechanism/profile",
})));

// ---------------------------------------------------------------- themes
const glyphs = GLYPHS.map(id => ({
  id, kind: "native", nativeType: {
    "process": "bpmn:Process", task: "bpmn:Task", "user-task": "bpmn:UserTask", start: "bpmn:StartEvent", end: "bpmn:EndEvent",
    gateway: "bpmn:ExclusiveGateway", flow: "bpmn:SequenceFlow", call: "bpmn:CallActivity", reference: "bpmn:DataStoreReference",
    store: "bpmn:DataStore", item: "bpmn:DataObjectReference", input: "bpmn:DataInput", aid: "bpmn:TextAnnotation",
    note: "bpmn:TextAnnotation", link: "bpmn:Association",
  }[id], viewBox: [0, 0, 100, 80], commands: [],
}));
export const themes = [
  { id: "plain", aliases: [], tokens: [{ name: "fill", value: "#ffffff" }, { name: "stroke", value: "#000000" }], glyphs: clone(glyphs),
    metricsResource: "ui-neutral-metrics", geometry: "shared", syntheticOccurrences: [] },
  { id: "contrast", aliases: [], tokens: [{ name: "fill", value: "#000000" }, { name: "stroke", value: "#ffffff" }], glyphs: clone(glyphs),
    metricsResource: "ui-neutral-metrics", geometry: "shared", fallback: "plain", syntheticOccurrences: [] },
];

// ---------------------------------------------------------------- UI surfaces
const src = (...pairs) => pairs.map(([name, source]) => ({ name, source }));
const entry = (id, surface, group, order, upstreamEntries, recipe, parameters, when, glyph) =>
  ({ id, surface, label: `entry.${id}`, when, recipe, group, order, upstreamEntries, parameters, icon: { theme: "plain", glyph } });
const createParams = valueName => src(["owner", "owner"], ["key", "key"], [valueName, "value"]);
const appendParams = valueName => src(["owner", "owner"], ["anchor", "source"], ["key", "key"], [valueName, "value"]);
const deletable = any(anyTask("self"), T("self", "bpmn:StartEvent"), T("self", "bpmn:EndEvent"), T("self", "bpmn:ExclusiveGateway"),
  T("self", "bpmn:SequenceFlow"), T("self", "bpmn:CallActivity"), T("self", "bpmn:DataStoreReference"), T("self", "bpmn:DataObjectReference"),
  T("self", "bpmn:TextAnnotation"), T("self", "bpmn:Association"));
const renamable = any(anyTask("self"), T("self", "bpmn:StartEvent"), T("self", "bpmn:EndEvent"), T("self", "bpmn:ExclusiveGateway"),
  T("self", "bpmn:SequenceFlow"), T("self", "bpmn:CallActivity"), T("self", "bpmn:DataStoreReference"), T("self", "bpmn:DataObjectReference"));
// Array order is deliberately different from the rendered order: groups follow
// first appearance (notes, data, flow), then numeric order, then UTF-16 ID.
// Command subject (the ui.when self): owner for palette and paste, target for
// context, replace, delete and direct-edit, source for append and connect.
export const ui = [
  entry("aid-create", "palette", "notes", 0, [], "create-aid", createParams("body"), isProcess, "aid"),
  entry("reference-create", "palette", "data", 10, ["create.data-store"], "create-reference", createParams("name"), isProcess, "reference"),
  entry("start-create", "palette", "flow", 0, ["create.start-event"], "create-start", createParams("name"), isProcess, "start"),
  entry("task-create", "palette", "flow", 10, ["create.task"], "create-task", createParams("name"), isProcess, "task"),
  entry("item-create", "palette", "data", 10, ["create.data-object"], "create-item", createParams("name"), isProcess, "item"),
  entry("end-create", "palette", "flow", 9, ["create.end-event"], "create-end", createParams("name"), isProcess, "end"),
  entry("UserTask-create", "palette", "flow", 10, [], "create-user-task", createParams("name"), isProcess, "user-task"),
  entry("gateway-create", "palette", "flow", 20, ["create.exclusive-gateway"], "create-gateway", createParams("name"), isProcess, "gateway"),
  entry("input-create", "palette", "data", 20, [], "create-input", src(["owner", "owner"], ["set", "target"], ["key", "key"], ["name", "value"]), isProcess, "input"),
  entry("call-create", "palette", "flow", 40, [], "create-call", createParams("name"), isProcess, "call"),
  entry("external-call-create", "palette", "flow", 50, [], "create-external-call", createParams("name"), isProcess, "call"),
  entry("input-loose-create", "palette", "data", 30, [], "create-input-loose", createParams("name"), isProcess, "input"),
  entry("append-task", "append", "append", 0, ["append.append-task"], "append-task", appendParams("name"), flowSource("self"), "task"),
  entry("append-end", "append", "append", 10, ["append.end-event"], "append-end", appendParams("name"), flowSource("self"), "end"),
  entry("aid-attach", "append", "append", 20, ["append.text-annotation"], "append-aid", appendParams("body"), activity("self"), "aid"),
  entry("connect-flow", "connect", "connect", 0, ["connect", "global-connect-tool"], "connect-flow", src(["owner", "owner"], ["source", "source"], ["target", "target"], ["key", "key"]), flowSource("self"), "flow"),
  entry("connect-reference-link", "connect", "connect", 10, [], "link-reference", src(["owner", "owner"], ["source", "source"], ["target", "target"], ["key", "key"]), T("self", "bpmn:DataStoreReference"), "link"),
  entry("connect-item-input", "connect", "connect", 20, [], "link-item-input", src(["source", "source"], ["target", "target"], ["key", "key"]), T("self", "bpmn:DataObjectReference"), "item"),
  entry("connect-item-output", "connect", "connect", 30, [], "link-item-output", src(["source", "source"], ["target", "target"], ["key", "key"]), anyTask("self"), "item"),
  entry("connect-annotation-link", "connect", "connect", 40, [], "link-aid", src(["owner", "owner"], ["source", "source"], ["target", "target"], ["key", "key"]), T("self", "bpmn:TextAnnotation"), "link"),
  entry("to-user-task", "replace", "replace", 0, ["replace-with-user-task"], "replace-with-user-task", src(["target", "target"], ["key", "key"]), T("self", "bpmn:Task"), "user-task"),
  entry("to-task", "replace", "replace", 10, ["replace-with-task"], "replace-with-task", src(["target", "target"], ["key", "key"]), T("self", "bpmn:UserTask"), "task"),
  entry("reference-to-item", "replace", "replace", 20, ["replace-with-data-object-reference"], "convert-reference-to-item", src(["target", "target"], ["key", "key"]), T("self", "bpmn:DataStoreReference"), "item"),
  entry("note-to-aid", "replace", "replace", 30, [], "convert-note-to-aid", src(["target", "target"]), T("self", "bpmn:TextAnnotation"), "aid"),
  entry("delete-element", "delete", "edit", 10, ["delete", "removeSelection"], "delete-element", src(["target", "target"]), deletable, "note"),
  entry("paste-elements", "paste", "edit", 20, ["paste"], "paste-gate", src(["owner", "owner"], ["key", "key"]), isProcess, "process"),
  entry("rename-direct", "direct-edit", "edit", 30, ["directEditing"], "rename", src(["target", "target"], ["name", "value"]), renamable, "task"),
  entry("aid-direct-edit", "direct-edit", "edit", 40, [], "edit-aid", src(["target", "target"], ["body", "value"]), T("self", "bpmn:TextAnnotation"), "aid"),
  entry("note-direct-edit", "direct-edit", "edit", 50, [], "edit-note", src(["target", "target"], ["text", "value"]), T("self", "bpmn:TextAnnotation"), "note"),
  entry("call-unlink", "context", "edit", 0, [], "unlink-call", src(["target", "target"]), T("self", "bpmn:CallActivity"), "call"),
];

// ---------------------------------------------------------------- messages
const en = {
  "entry.aid-create": "Aid note", "entry.reference-create": "Reserved band", "entry.start-create": "Start",
  "entry.task-create": "Task", "entry.item-create": "Item", "entry.end-create": "End", "entry.UserTask-create": "User task",
  "entry.gateway-create": "Decision", "entry.input-create": "Process input", "entry.call-create": "Call",
  "entry.external-call-create": "External call", "entry.input-loose-create": "Unassigned input",
  "entry.append-task": "Append task", "entry.append-end": "Append end", "entry.aid-attach": "Attach aid",
  "entry.connect-flow": "Connect", "entry.connect-reference-link": "Use reference", "entry.connect-item-input": "Read item",
  "entry.connect-item-output": "Write item", "entry.connect-annotation-link": "Link annotation", "entry.to-user-task": "Change to user task",
  "entry.to-task": "Change to task", "entry.reference-to-item": "Convert to item", "entry.note-to-aid": "Change to aid", "entry.delete-element": "Delete",
  "entry.paste-elements": "Paste", "entry.rename-direct": "Rename", "entry.aid-direct-edit": "Edit aid",
  "entry.note-direct-edit": "Edit note", "entry.call-unlink": "Unlink call",
  "field.name": "Name", "field.kind": "Kind", "field.executable": "Executable", "field.situations": "Start situations",
  "field.question": "Question", "field.choice": "Choice", "field.call-target": "Called process", "field.override": "Local name",
  "field.title": "Title", "field.body": "Tools", "field.text": "Text", "field.anchor": "Anchor activity", "field.invalid": "Invalid value.",
  [RULE_MESSAGE]: "Every activity needs a name.",
};
const fr = { "entry.task-create": "Tâche", "entry.reference-create": "Document de référence", "field.name": "Nom" };
export const messages = Object.keys(en).map(id => ({ id, texts: [{ name: "en", value: en[id] }, ...(fr[id] ? [{ name: "fr", value: fr[id] }] : [])] }));
export const MESSAGE_TEXT = { en, fr };

// ---------------------------------------------------------------- profile
export const profile = {
  $schema: "urn:profile-mechanism:1:profile",
  schemaVersion: "1.0.0",
  mechanismVersion: "1",
  profile: "ui-neutral/1",
  version: "1.1.0",
  base: basePin,
  descriptors: [descriptorPin],
  capabilities: ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"],
  policies: {
    canonical: "profile-c14n/2", allocator: "stable-id/1", whitespace: "ecma262-2024", textFit: "engine-scalar-A/1",
    unknownFields: "reject", compatibility: "exact-or-explicit-migration/1", localeFallback: "en",
  },
  producerDelta: [],
  notions,
  rules,
  recipes,
  placements: [],
  themes,
  ui,
  validation,
  providerDialects: [],
  "exports": [{
    id: "drawing", format: "drawio", recipes: ["export-pages", "export-nodes"],
    capabilities: [{ when: TRUE, class: "structural", losses: [] }],
    idPolicy: "counter", counterOrigin: 0, metadata: [],
    serializer: { version: "fixture-1", encoding: "UTF-8", newline: "LF", indent: 0, compression: "none", attributeOrder: [], emptyElement: "short" },
  }],
  migrations: [],
  resources: [{
    id: "ui-neutral-metrics", kind: "metrics", mediaType: "application/json", sha256: metricsSha256,
    assetKey: "ui-neutral-metrics.json", license: "CC0-1.0", attribution: "Synthetic CC0 metric fixture for the lot-5 UI expectations.",
  }],
  messages,
  compatibilityAliases: [],
};
// Compiler registry inputs (data): the operator groups, signature records and
// standard-rule manifest the harness passes to compileProfile for every case.
const OPERATOR_GROUPS = {
  "predicates/1": ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId", "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "boundRole", "recognizes"],
  "selectors/1": ["count", "reachable"],
  "recipes/1": ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"],
  "export-ir/1": ["emit", "loss"],
};
export const PROFILE_SCHEMA = { path: "schemas/profile/profile-mechanism-1.schema.json", sha256: "c97cfba64560ec0e7098294a5e185187de9d1f2207b272c2f002f576865692da" };
export const registryDocument = {
  format: "lot5-ui-registry/1",
  capabilities: [...Object.keys(OPERATOR_GROUPS), "profile-lint/1", "render-data/1"],
  signatures: Object.fromEntries(Object.entries(OPERATOR_GROUPS).flatMap(([capability, ops]) => ops.map(op => [op, { capability, version: "1", argumentSchemaDigest: "0".repeat(64) }]))),
  requiredStandardRules: [...STANDARD_RULES].sort(),
  lintAllowlist: ["bpmnlint:recommended"],
  compilerRuleTable: { format: "profile-compiler-rule-table/1", revision: "R3.3", sha256: "a684ac82bbf6a94dedd53e97c72055b4fb2110b27fd75774bbe2fd1944ffd1e1" },
  schema: PROFILE_SCHEMA,
  digestDomains: { base: "raw", descriptors: "raw" },
  assets: [{ assetKey: "ui-neutral-metrics.json", path: "fixtures/ui-neutral-metrics.json" }],
};
export const identityOf = value => ({
  mechanismVersion: "1", schemaVersion: "1.0.0", profile: value.profile, version: value.version,
  sha256: H(value), base: clone(value.base), descriptors: clone(value.descriptors),
});
export const profileSha256Canonical = H(profile);
export const profileIdentity = identityOf(profile);
export const profileFileSha256 = B(fileText(profile));
