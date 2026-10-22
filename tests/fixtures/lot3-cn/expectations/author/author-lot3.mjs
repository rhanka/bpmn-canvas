// Lot-3 C/N expectation authoring helper (seal fix round, block-B parity sync, unicode-names fix, Unicode literal restoration, l3-tx real-canvas rebind). Manual tool: CI never
// runs it and it has no update-from-actual input. Standalone by construction: it
// imports only node:crypto, node:fs, node:path and node:url. It does not load,
// compile or evaluate a profile, run completion, normalization, lint, layout, a
// codec, an exporter or a command. Every expected tree, binding, placement,
// report entry and trace below is a hand-authored literal or a hand-declared
// change list; the code only computes JCS/SHA-256 digests (profile-c14n/2,
// stable-id/1, revisions), reads values at JSON pointers of those literals,
// sorts records by the DESIGN orders and checks the author's own literals for
// internal consistency before writing them.
//
// Usage (from the repository root):
//   node tests/fixtures/lot3-cn/expectations/author/author-lot3.mjs <DESIGN.md path> [previous seal.json path]
// The DESIGN argument is only hashed and compared with the pinned R3.3 digest.
// The optional previous seal is read to write the reseal ledger (old/new values).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "..", "..");
const repo = join(fixtures, "..", "..");
const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const DESIGN_LINES = 1162;
// The Unicode literal restoration seal and its commit; the l3-tx real-canvas rebind reseals from them.
// History: the literal restoration resealed the unicode-names fix seal, which resealed the
// parity sync seal, which resealed the seal fix round seal, which superseded the first seal.
const PREVIOUS_SEAL_SHA256 = "45560aaf66a7192b359c9877b7cd2959b00f50c5166b706ac7e93cc8971a2376";
const PREVIOUS_SEAL_COMMIT = "25a66edebc46ac2504b20cc970cf97eb82b0c170";
const UNICODE_NAMES_SEAL_SHA256 = "3d98de1dcdc79134e85a85531ae406d0b9633901cfc641ba6668be69ff10d0d1";
const PARITY_SYNC_SEAL_SHA256 = "1adc160ccd3c2567c5f45b1a1b92322a21f0dcccaf9676f3a7901b0642259934";
const SEAL_FIX_SEAL_SHA256 = "6b807ee2c219f614d0f434cb8568c8d15acc0cc425a11bfdaa5cf027d86e8b06";
const FIRST_SEAL_SHA256 = "986190925108a03e1996342638aaf9f3bcef9d37ddd6f3c6c5ae6246b0ab2904";
const PREVIOUS_MAIN_IDENTITY = "ef1473cc4371388afc2261e51a27d36c2a38dee772387dadc1aa11a95079dcea";

// ---------------------------------------------------------------- digests
function jcs(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { const d = value.charCodeAt(i + 1); if (!(d >= 0xdc00 && d <= 0xdfff)) throw Error("lone surrogate"); i++; }
      else if (c >= 0xdc00 && c <= 0xdfff) throw Error("lone surrogate");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") { if (!Number.isFinite(value)) throw Error("nonfinite"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
  throw Error(`unsupported ${typeof value}`);
}
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const H = value => sha(Buffer.from(jcs(value), "utf8"));
const B = bytes => sha(bytes);
const clone = value => JSON.parse(JSON.stringify(value));
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const ledger = { stableIds: [], contentSignatures: [], revisions: [], transport: [], views: [] };
function stableId(ownerId, slot, key, label) {
  const tuple = ["profile-mechanism/1", ownerId, slot, key];
  const canonical = jcs(tuple), id = `g_${sha(Buffer.from(canonical, "utf8"))}`;
  if (!ledger.stableIds.some(e => e.canonical === canonical)) ledger.stableIds.push({ label, value: tuple, canonical, id });
  return id;
}
function withoutIds(value) {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "id").map(([k, v]) => [k, withoutIds(v)]));
  return value;
}
// Birth-only signature of a raw missing-ID node (DESIGN L292): id fields removed,
// no generated defaults added, references and source text retained.
function contentSignature(rawNode, label) {
  const value = withoutIds(rawNode), canonical = jcs(value), digest = sha(Buffer.from(canonical, "utf8"));
  if (!ledger.contentSignatures.some(e => e.canonical === canonical)) ledger.contentSignatures.push({ label, value, canonical, sha256: digest });
  return digest;
}
const birthKey = (signature, ordinal) => jcs([signature, ordinal]);

// ---------------------------------------------------------------- pointers
const esc = key => String(key).replace(/~/g, "~0").replace(/\//g, "~1");
const unesc = s => s.replace(/~1/g, "/").replace(/~0/g, "~");
const segs = pointer => pointer === "" ? [] : pointer.slice(1).split("/").map(unesc);
const ptr = segments => segments.map(s => `/${esc(s)}`).join("");
function at(tree, pointer) {
  let cur = tree;
  for (const key of segs(pointer)) {
    if (cur === null || typeof cur !== "object" || !own(cur, key)) return { present: false };
    cur = cur[key];
  }
  return { present: true, value: cur };
}
// Self-check of the author's literals: reverting every declared written location
// in the expected tree must give back the input tree byte for byte.
function revertCheck(before, after, locations, label) {
  const work = clone(after);
  const ordered = [...locations].sort((x, y) => segs(y).length - segs(x).length || cmp(y, x));
  for (const location of ordered) {
    const keys = segs(location), last = keys.pop();
    let parent = work;
    for (const k of keys) parent = parent[k];
    const b = at(before, location);
    if (b.present) parent[last] = clone(b.value);
    else if (Array.isArray(parent)) parent.splice(Number(last), 1);
    else delete parent[last];
    // A container created only to hold generated children is reverted as well.
    if (keys.length && Array.isArray(parent) && parent.length === 0 && !at(before, ptr(keys)).present) {
      let grand = work;
      for (const k of keys.slice(0, -1)) grand = grand[k];
      delete grand[keys.at(-1)];
    }
  }
  if (jcs(work) !== jcs(before)) throw Error(`revert check failed: ${label}`);
}

// ---------------------------------------------------------------- shared constants
const NS = "urn:neutral-cn:1";
const EXPORTER = "fixture-cn-1";
const MARKER = "text/x-neutral-call-kind";
const PROFILE_VERSION = "1.1.0";
const EXPECT = "lot3-cn/expectations";
const PATHS = {
  descriptors: `${EXPECT}/profile/neutral-cn-descriptors.json`,
  base: `${EXPECT}/profile/neutral-cn-base.json`,
  main: `${EXPECT}/profile/neutral-cn.json`,
  stale: `${EXPECT}/profile/neutral-cn-stale.json`,
  conflict: `${EXPECT}/profile/neutral-cn-conflict.json`,
  coalesce: `${EXPECT}/profile/neutral-cn-coalesce.json`,
  outport: `${EXPECT}/profile/neutral-cn-outport.json`,
  flip: `${EXPECT}/profile/neutral-cn-flip.json`,
  dirconflict: `${EXPECT}/profile/neutral-cn-dirconflict.json`,
  ensureconflict: `${EXPECT}/profile/neutral-cn-ensureconflict.json`,
  extraction: `${EXPECT}/profile/neutral-cn-extraction.json`,
  abort: `${EXPECT}/profile/neutral-cn-abort.json`,
  lot0NeutralFixture: "profile-parity-corpus/profile-mechanism/1/neutral-fixture.json",
  lot0GridFixture: "profile-parity-corpus/profile-mechanism/1/neutral-grid-fixture.json",
  comparators: `${EXPECT}/comparators/lot3-comparators.mjs`,
  schema: "profile-parity-corpus/profile-mechanism/1/profile-mechanism-1.schema.json",
  metrics: "profile-parity-corpus/profile-mechanism/1/neutral-metrics.json",
  lint: "profile-parity-corpus/profile-mechanism/1/bpmnlint-11.15.0-recommended.json",
  lot0Neutral: "profile-parity-corpus/profile-mechanism/1/neutral-profile.json",
  lot0Grid: "profile-parity-corpus/profile-mechanism/1/neutral-grid-profile.json",
  lot0Base: "profile-parity-corpus/profile-mechanism/1/neutral-base.json",
  lot0Descriptors: "profile-parity-corpus/profile-mechanism/1/neutral-descriptors.json",
  lot0Manifest: "profile-parity-corpus/profile-parity-corpus/1/manifest.json",
};
const fixtureBytes = path => readFileSync(join(fixtures, path));
const fixtureJson = path => JSON.parse(fixtureBytes(path).toString("utf8"));

// ---------------------------------------------------------------- descriptor slice
const FLOW_NODES = ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:IntermediateCatchEvent", "bpmn:ExclusiveGateway", "bpmn:ParallelGateway"];
const LINKABLE = ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:TextAnnotation", "bpmn:DataStoreReference", "bpmn:DataObjectReference",
  "bpmn:DataInput", "bpmn:DataOutput", "bpmn:ComplexGateway"];
const t = (id, scalars, containment = {}, references = {}, extra = {}) => ({ id, scalars, containment, references, ...extra });
function descriptorSlice() {
  return {
    id: "neutral-cn-descriptors/1",
    scope: "Synthetic lot-3 descriptor slice; not the complete BPMN descriptor set.",
    types: {
      "bpmn:Definitions": t(true, ["id", "name", "targetNamespace", "exporterVersion"], { rootElements: ["bpmn:Process", "bpmn:Collaboration", "bpmn:DataStore", "bpmn:GlobalTask"], diagrams: ["bpmndi:BPMNDiagram"] }),
      "bpmn:Process": t(true, ["id", "name", "isExecutable"], {
        flowElements: [...FLOW_NODES, "bpmn:ComplexGateway", "bpmn:SequenceFlow", "bpmn:DataObject", "bpmn:DataObjectReference", "bpmn:DataStoreReference", "neutral:LegacyItem"],
        artifacts: ["bpmn:TextAnnotation", "bpmn:Association"], documentation: ["bpmn:Documentation"], laneSets: ["bpmn:LaneSet"], ioSpecification: ["bpmn:InputOutputSpecification"],
      }),
      "bpmn:GlobalTask": t(true, ["id", "name"]),
      "bpmn:Collaboration": t(true, ["id", "name"], { participants: ["bpmn:Participant"] }),
      "bpmn:Participant": t(true, ["id", "name"], {}, { processRef: ["bpmn:Process"] }),
      "bpmn:LaneSet": t(true, ["id", "name"], { lanes: ["bpmn:Lane"] }),
      "bpmn:Lane": t(true, ["id", "name"], {}, { flowNodeRef: FLOW_NODES }),
      "bpmn:Task": t(true, ["id", "name"], { documentation: ["bpmn:Documentation"], properties: ["bpmn:Property"], dataInputAssociations: ["bpmn:DataInputAssociation"], dataOutputAssociations: ["bpmn:DataOutputAssociation"], extensionElements: ["bpmn:ExtensionElements"] }, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:UserTask": t(true, [], {}, {}, { extends: ["bpmn:Task"] }),
      "bpmn:CallActivity": t(true, ["id", "name", "calledElement"], { documentation: ["bpmn:Documentation"] }, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:StartEvent": t(true, ["id", "name"], { documentation: ["bpmn:Documentation"], eventDefinitions: ["bpmn:TimerEventDefinition"] }, { outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:EndEvent": t(true, ["id", "name"], { documentation: ["bpmn:Documentation"] }, { incoming: ["bpmn:SequenceFlow"] }),
      "bpmn:IntermediateCatchEvent": t(true, ["id", "name"], { eventDefinitions: ["bpmn:TimerEventDefinition"] }, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:TimerEventDefinition": t(true, ["id"], { timeDuration: ["bpmn:FormalExpression"], timeDate: ["bpmn:FormalExpression"], timeCycle: ["bpmn:FormalExpression"] }),
      "bpmn:ExclusiveGateway": t(true, ["id", "name", "gatewayDirection"], {}, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:ParallelGateway": t(true, ["id", "name", "gatewayDirection"], {}, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:ComplexGateway": t(true, ["id", "name", "gatewayDirection"], {}, { incoming: ["bpmn:SequenceFlow"], outgoing: ["bpmn:SequenceFlow"] }),
      "bpmn:SequenceFlow": t(true, ["id", "name"], { conditionExpression: ["bpmn:FormalExpression"] }, {
        sourceRef: ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:IntermediateCatchEvent", "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:ComplexGateway"],
        targetRef: ["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:EndEvent", "bpmn:IntermediateCatchEvent", "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:ComplexGateway"],
      }),
      "bpmn:TextAnnotation": t(true, ["id", "text"]),
      "bpmn:Association": t(true, ["id", "associationDirection"], {}, { sourceRef: LINKABLE, targetRef: LINKABLE }),
      "bpmn:Documentation": t(false, ["text", "textFormat"]),
      "bpmn:FormalExpression": t(false, ["body", "language"]),
      "bpmn:DataObject": t(true, ["id", "name"]),
      "bpmn:DataObjectReference": t(true, ["id", "name"], {}, { dataObjectRef: ["bpmn:DataObject"] }),
      "bpmn:DataStore": t(true, ["id", "name"]),
      "bpmn:DataStoreReference": t(true, ["id", "name"], {}, { dataStoreRef: ["bpmn:DataStore"] }),
      "bpmn:DataInputAssociation": t(true, ["id"], {}, { sourceRef: ["bpmn:DataObjectReference", "bpmn:DataStoreReference", "bpmn:DataInput", "neutral:LegacyItem"], targetRef: ["bpmn:Property"] }),
      "bpmn:DataOutputAssociation": t(true, ["id"], {}, { sourceRef: ["bpmn:Property"], targetRef: ["bpmn:DataObjectReference", "bpmn:DataOutput", "neutral:LegacyItem"] }),
      "bpmn:Property": t(true, ["id", "name"]),
      "bpmn:InputOutputSpecification": t(false, [], { dataInputs: ["bpmn:DataInput"], dataOutputs: ["bpmn:DataOutput"], inputSets: ["bpmn:InputSet"], outputSets: ["bpmn:OutputSet"] }),
      "bpmn:DataInput": t(true, ["id", "name"]),
      "bpmn:DataOutput": t(true, ["id", "name"]),
      "bpmn:InputSet": t(true, ["id", "name"], {}, { dataInputRefs: ["bpmn:DataInput"] }),
      "bpmn:OutputSet": t(true, ["id", "name"], {}, { dataOutputRefs: ["bpmn:DataOutput"] }),
      "bpmn:ExtensionElements": t(false, [], { values: ["neutral:Opaque"] }),
      "neutral:Opaque": t(false, ["payload"]),
      "neutral:LegacyItem": t(true, ["id", "name"]),
      "bpmndi:BPMNDiagram": t(true, ["id", "name"], { plane: ["bpmndi:BPMNPlane"] }),
      "bpmndi:BPMNPlane": t(true, ["id"], { planeElement: ["bpmndi:BPMNShape", "bpmndi:BPMNEdge"] }, { bpmnElement: ["bpmn:Process", "bpmn:Collaboration"] }),
      "bpmndi:BPMNShape": t(true, ["id"], { bounds: ["dc:Bounds"] }, { bpmnElement: [...FLOW_NODES, "bpmn:Participant", "bpmn:Lane", "bpmn:DataStoreReference", "bpmn:DataObjectReference", "bpmn:TextAnnotation"] }),
      "bpmndi:BPMNEdge": t(true, ["id"], { waypoint: ["dc:Point"] }, { bpmnElement: ["bpmn:SequenceFlow", "bpmn:Association", "bpmn:DataInputAssociation", "bpmn:DataOutputAssociation"] }),
      "dc:Bounds": t(false, ["x", "y", "width", "height"]),
      "dc:Point": t(false, ["x", "y"]),
    },
  };
}
// Presentation (DI/DC) types and the out-of-base projection witnesses are known
// to the descriptor slice but are not part of the effective base.
const NON_BASE = new Set(["bpmn:ComplexGateway", "neutral:LegacyItem", "bpmndi:BPMNDiagram", "bpmndi:BPMNPlane", "bpmndi:BPMNShape", "bpmndi:BPMNEdge", "dc:Bounds", "dc:Point"]);
function baseRecord(descriptors) {
  const types = Object.keys(descriptors.types).filter(name => !NON_BASE.has(name));
  const fields = [];
  for (const type of types) {
    const d = descriptors.types[type];
    const parent = d.extends ? descriptors.types[d.extends[0]] : undefined;
    const merged = parent ? { scalars: [...parent.scalars, ...d.scalars], containment: { ...parent.containment, ...d.containment }, references: { ...parent.references, ...d.references } } : d;
    for (const field of merged.scalars) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "scalar" });
    for (const field of Object.keys(merged.containment)) if (!(type === "bpmn:Definitions" && field === "diagrams")) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "containment" });
    for (const field of Object.keys(merged.references)) fields.push({ type, field, producers: ["code", "editor", "import"], kind: "reference" });
  }
  return { id: "neutral-cn-base/1", version: EXPORTER, descriptor: descriptors.id, types, producerPolicy: "fixture-explicit", fields, idRefScalars: ["bpmn:CallActivity.calledElement"] };
}
const prettyBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const DESCRIPTORS = descriptorSlice();
const idBearing = node => !!(node && typeof node === "object" && typeof node.$type === "string" && DESCRIPTORS.types[node.$type]?.id === true);

// ---------------------------------------------------------------- profile grammar literals
const lit = value => ({ op: "literal", value });
const read = (binding, path) => ({ op: "read", binding, path });
const idOf = binding => ({ op: "id", binding });
const param = name => ({ op: "param", name });
const ids = select => ({ op: "ids", select });
const TRUE = { op: "true" };
const FALSE = { op: "false" };
const all = (...args) => ({ op: "all", args });
const any = (...args) => ({ op: "any", args });
const not = arg => ({ op: "not", arg });
const is = (type, mode = "exact", binding = "self") => ({ op: "typeIs", binding, type, mode });
const present = value => ({ op: "present", value });
const eq = (left, right) => ({ op: "equal", left, right });
const count = (select, min, max) => ({ op: "count", select, min, ...(max === undefined ? {} : { max }) });
const recog = (notion, binding = "self") => ({ op: "recognizes", binding, notion });
const reach = (from, to) => ({ op: "reachable", from, to, edgeTypes: ["bpmn:SequenceFlow"], minHops: 1 });
const sel = (from, via, where = TRUE, property) => ({ from, via, ...(property ? { property } : {}), where, order: "id" });
const bind = (as, select, cardinality = "one", fallbacks) => ({ op: "bind", as, select, cardinality, ...(fallbacks ? { fallbacks } : {}) });
const w = (binding, path, mode) => ({ binding, path, mode });
const recipe = (id, phase, select, steps, writes, { when = TRUE, parameters = [] } = {}) => ({ id, phase, parameters, select, when, writes, steps });
const ensure = (as, type, parent, property, owner, role, ownerId, slot, key, name) =>
  ({ op: "ensure", as, type, parent, property, owner, role, ownerId, slot, key, fields: [{ name: "name", value: lit(name) }] });
const create = (as, type, parent, property, ownerId, slot, key, fields = []) =>
  ({ op: "create", as, type, parent, property, identity: "allocated", ownerId, slot, key, fields });
const elementParam = name => ({ name, type: "element", required: true });
const stringParam = name => ({ name, type: "string", required: true });

// Shared selector fragments.
const MARKERS = (extra = TRUE) => sel("self", "children", all(eq(read("self", "/textFormat"), lit(MARKER)), extra), "documentation");
const FLOWS_IN = sel("self", "inverseReference", is("bpmn:SequenceFlow"), "targetRef");
const FLOWS_OUT = sel("self", "inverseReference", is("bpmn:SequenceFlow"), "sourceRef");
const SAME_CONTAINER = all(is("bpmn:SequenceFlow"), count(sel("self", "owner", eq(idOf("self"), idOf("container"))), 1));
const GATEWAY = any(is("bpmn:ExclusiveGateway"), is("bpmn:ParallelGateway"));
const ORDINARY = any(is("bpmn:Task", "assignable"), is("bpmn:CallActivity"), is("bpmn:ExclusiveGateway"), is("bpmn:ParallelGateway"));
// Only recognized external calls carrying at least one descriptive Association are exempt.
const EXEMPT = all(recog("call-external"), any(
  count(sel("self", "inverseReference", is("bpmn:Association"), "sourceRef"), 1),
  count(sel("self", "inverseReference", is("bpmn:Association"), "targetRef"), 1)));
const TOUCHING = binding => sel("root", "all", all(any(is("bpmn:Association"), is("bpmn:DataInputAssociation"), is("bpmn:DataOutputAssociation")), any(
  count(sel("self", "reference", eq(idOf("self"), idOf(binding)), "sourceRef"), 1),
  count(sel("self", "reference", eq(idOf("self"), idOf(binding)), "targetRef"), 1))));
const ASSOCIATIONS_TOUCHING = binding => sel("root", "all", all(is("bpmn:Association"), any(
  count(sel("self", "reference", eq(idOf("self"), idOf(binding)), "sourceRef"), 1),
  count(sel("self", "reference", eq(idOf("self"), idOf(binding)), "targetRef"), 1))));
const CONSUMING = sel("self", "inverseReference", is("bpmn:DataInputAssociation"), "sourceRef");
const PRODUCING = sel("self", "inverseReference", is("bpmn:DataOutputAssociation"), "targetRef");

// ---------------------------------------------------------------- recipes
// Owner bindings are narrowed to the only admitted flow container so that the
// conservative static typing of every bound type stays exact (DESIGN L214).
const ownerProcess = (as = "container", from = "self") => bind(as, sel(from, "owner", is("bpmn:Process")));
function completeRecipes(variant) {
  const topo = (id, path, types, property) => recipe(id, "complete", sel("root", "all", any(...types)), [
    ownerProcess(),
    { op: "assignRef", target: "self", path, mode: "replace", values: [ids(sel("self", "inverseReference", SAME_CONTAINER, property))] },
  ], [w("self", path, "reference")]);
  const inbound = variant === "stale" ? sel("self", "reference", TRUE, "incoming") : FLOWS_IN;
  const outbound = variant === "stale" ? sel("self", "reference", TRUE, "outgoing") : FLOWS_OUT;
  const direction = (id, value, inRange, outRange) => recipe(id, "complete",
    sel("root", "all", all(GATEWAY, count(inbound, ...inRange), count(outbound, ...outRange))),
    [{ op: "set", target: "self", path: "/gatewayDirection", value: lit(value) }], [w("self", "/gatewayDirection", "set")]);
  // The default IO sets are allocated under the explicit Definitions ownerId with
  // the Process ID as key, never under the nearest containing node (DESIGN L284).
  const io = (prefix, setType, ioField, setProperty, refPath) => {
    const sets = sel("self", "descendants", is(setType));
    const members = sel("self", "descendants", is(ioField.type));
    const uncovered = sel("self", "descendants", all(is(ioField.type), count(sel("self", "inverseReference", is(setType), refPath.slice(1)), 0, 0)));
    const ioSpec = bind("io", sel("self", "children", TRUE, "ioSpecification"));
    const slot = `${prefix.slice(5)}-set`;
    return [
      recipe(`${prefix}-default`, "complete", sel("root", "all", all(is("bpmn:Process"), count(sel("self", "children", TRUE, "ioSpecification"), 1), count(sets, 0, 0), count(members, 1))), [
        ioSpec,
        create("set", setType, "io", setProperty, idOf("root"), slot, idOf("self")),
        { op: "assignRef", target: "set", path: refPath, mode: "replace", values: [ids(sel("io", "children", TRUE, ioField.property))] },
      ], [w("io", `/${setProperty}`, "create"), w("set", refPath, "reference")]),
      recipe(`${prefix}-default-empty`, "complete", sel("root", "all", all(is("bpmn:Process"), count(sel("self", "children", TRUE, "ioSpecification"), 1), count(sets, 0, 0), count(members, 0, 0))), [
        ioSpec,
        create("set", setType, "io", setProperty, idOf("root"), slot, idOf("self")),
      ], [w("io", `/${setProperty}`, "create")]),
      recipe(`${prefix}-uncovered-single`, "complete", sel("root", "all", all(is("bpmn:Process"), count(sets, 1, 1), count(uncovered, 1))), [
        bind("set", sets),
        { op: "assignRef", target: "set", path: refPath, mode: "appendUnique", values: [ids(uncovered)] },
      ], [w("set", refPath, "reference")]),
      recipe(`${prefix}-uncovered-several`, "complete", sel("root", "all", all(is("bpmn:Process"), count(sets, 2), count(uncovered, 1))), [
        { op: "refuse", code: "io-set-selection-required", target: "self" },
      ], []),
    ];
  };
  const list = [
    recipe("c-definitions-namespace", "complete", sel("root", "self"), [{ op: "set", target: "self", path: "/targetNamespace", value: lit(NS) }],
      [w("self", "/targetNamespace", "set")], { when: not(present(read("self", "/targetNamespace"))) }),
    recipe("c-definitions-exporter", "complete", sel("root", "self"), [{ op: "set", target: "self", path: "/exporterVersion", value: lit(EXPORTER) }],
      [w("self", "/exporterVersion", "set")], { when: not(present(read("self", "/exporterVersion"))) }),
    recipe("complete-process", "complete", sel("root", "all", is("bpmn:Process")), [{ op: "set", target: "self", path: "/isExecutable", value: lit(false) }],
      [w("self", "/isExecutable", "set")]),
    topo("c-topology-incoming", "/incoming", [is("bpmn:Task", "assignable"), is("bpmn:CallActivity"), is("bpmn:IntermediateCatchEvent"), is("bpmn:ExclusiveGateway"), is("bpmn:ParallelGateway"), is("bpmn:EndEvent")], "targetRef"),
    topo("c-topology-outgoing", "/outgoing", [is("bpmn:Task", "assignable"), is("bpmn:CallActivity"), is("bpmn:IntermediateCatchEvent"), is("bpmn:ExclusiveGateway"), is("bpmn:ParallelGateway"), is("bpmn:StartEvent")], "sourceRef"),
    direction("c-gateway-mixed", "Mixed", [2], [2]),
    direction("c-gateway-converging", "Converging", [2], [0, 1]),
    direction("c-gateway-diverging", "Diverging", [0, 1], [2]),
    direction("c-gateway-unspecified", "Unspecified", [0, 1], [0, 1]),
    recipe("c-item-backing", "complete", sel("root", "all", all(is("bpmn:DataObjectReference"), not(present(read("self", "/dataObjectRef"))))), [
      ownerProcess(),
      create("backing", "bpmn:DataObject", "container", "flowElements", idOf("container"), "item-backing", idOf("self")),
      { op: "assignRef", target: "self", path: "/dataObjectRef", mode: "replace", values: [idOf("backing")] },
    ], [w("container", "/flowElements", "create"), w("self", "/dataObjectRef", "reference")]),
    recipe("c-input-port", "complete", sel("root", "all", all(is("bpmn:DataInputAssociation"), not(present(read("self", "/targetRef"))))), [
      bind("activity", sel("self", "owner")),
      create("port", "bpmn:Property", "activity", "properties", idOf("activity"), "input-port", idOf("self")),
      { op: "assignRef", target: "self", path: "/targetRef", mode: "replace", values: [idOf("port")] },
    ], [w("activity", "/properties", "create"), w("self", "/targetRef", "reference")]),
    ...io("c-io-input", "bpmn:InputSet", { type: "bpmn:DataInput", property: "dataInputs" }, "inputSets", "/dataInputRefs"),
    ...io("c-io-output", "bpmn:OutputSet", { type: "bpmn:DataOutput", property: "dataOutputs" }, "outputSets", "/dataOutputRefs"),
  ];
  if (variant === "conflict") list.splice(3, 0, recipe("complete-process-executable", "complete", sel("root", "all", is("bpmn:Process")),
    [{ op: "set", target: "self", path: "/isExecutable", value: lit(true) }], [w("self", "/isExecutable", "set")]));
  if (variant === "coalesce") list.splice(3, 0, recipe("complete-process-repeat", "complete", sel("root", "all", is("bpmn:Process")),
    [{ op: "set", target: "self", path: "/isExecutable", value: lit(false) }], [w("self", "/isExecutable", "set")]));
  // The OPEN-IO producer exception expressed as profile data: a missing output
  // source port keyed by its association (DESIGN L546; gate H2 OPEN-IO).
  if (variant === "outport") list.push(recipe("c-output-port", "complete",
    sel("root", "all", all(is("bpmn:DataOutputAssociation"), count(sel("self", "reference", TRUE, "sourceRef"), 0, 0))), [
      bind("activity", sel("self", "owner")),
      create("port", "bpmn:Property", "activity", "properties", idOf("activity"), "output-port", idOf("self")),
      { op: "assignRef", target: "self", path: "/sourceRef", mode: "replace", values: [idOf("port")] },
    ], [w("activity", "/properties", "create"), w("self", "/sourceRef", "reference")]));
  return list;
}
function normalizeRecipes(variant) {
  const collaboration = ensure("collaboration", "bpmn:Collaboration", "root", "rootElements", "self", "collaboration", idOf("root"), "collaboration", idOf("self"), "collaboration");
  const laneSetFor = owner => ensure("laneSet", "bpmn:LaneSet", owner, "laneSets", owner, "lane-set", idOf(owner), "lane-set", lit("lane-set"), "lane-set");
  const laneFor = owner => ensure("lane", "bpmn:Lane", "laneSet", "lanes", owner, "external-lane", idOf(owner), "external-lane", lit("external-lane"), "external-lane");
  const band = name => ensure("band", "bpmn:Participant", "collaboration", "participants", "self", "reference-band", idOf("self"), "reference-band", lit("reference-band"), name);
  const place = (id, select, region, anchored, ownerSteps, related) => recipe(id, "normalize", select, [
    ...ownerSteps,
    bind("item", sel("self", "self")),
    ...(anchored ? [anchored] : []),
    { op: "place", target: "self", owner: "proc", region, ...(anchored ? { anchor: "anchor" } : {}), related: related("item") },
  ], [w("self", "", "placement")]);
  const ownerOf = [ownerProcess("proc")];
  const ioOwner = [bind("io", sel("self", "owner", is("bpmn:InputOutputSpecification"))), ownerProcess("proc", "io")];
  const reverse = (id, sourceTest, targetTest) => recipe(id, "normalize",
    sel("root", "all", all(is("bpmn:Association"), count(sel("self", "reference", sourceTest, "sourceRef"), 1), count(sel("self", "reference", targetTest, "targetRef"), 1))), [
      { op: "assignRef", target: "self", path: "/sourceRef", mode: "replace", values: [read("self", "/targetRef")] },
      { op: "assignRef", target: "self", path: "/targetRef", mode: "replace", values: [read("self", "/sourceRef")] },
      { op: "set", target: "self", path: "/associationDirection", value: lit("One") },
    ], [w("self", "/sourceRef", "reference"), w("self", "/targetRef", "reference"), w("self", "/associationDirection", "set")]);
  const referenceBand = (id, name) => recipe(id, "normalize", sel("root", "all", all(is("bpmn:Process"), count(sel("self", "children", is("bpmn:DataStoreReference"), "flowElements"), 1))), [
    collaboration, band(name),
  ], [w("root", "/rootElements", "create"), w("envelope", "/bindings", "binding"), w("collaboration", "/participants", "create")]);
  const list = [
    recipe("n-structure", "normalize", sel("root", "all", is("bpmn:Process")), [
      collaboration,
      ensure("main", "bpmn:Participant", "collaboration", "participants", "self", "main-participant", idOf("self"), "main-participant", lit("main-participant"), "main-participant"),
      { op: "assignRef", target: "main", path: "/processRef", mode: "replace", values: [idOf("self")] },
    ], [w("root", "/rootElements", "create"), w("envelope", "/bindings", "binding"), w("collaboration", "/participants", "create"), w("main", "/processRef", "reference")]),
    recipe("n-external-lane", "normalize", sel("root", "all", all(is("bpmn:Process"), any(
      count(sel("self", "children", recog("call-external"), "flowElements"), 1),
      count(sel("self", "descendants", any(is("bpmn:DataInput"), is("bpmn:DataOutput"))), 1)))), [
      laneSetFor("self"), laneFor("self"),
    ], [w("self", "/laneSets", "create"), w("envelope", "/bindings", "binding"), w("laneSet", "/lanes", "create")]),
    referenceBand("n-reference-band", "reference-band"),
    ...(variant === "ensureconflict" ? [referenceBand("n-reference-band-renamed", "documents")] : []),
    // DESIGN L559: remove only conflicting Lane.flowNodeRef entries of external
    // calls; the library OPEN-SHARING gate and the responsibility check (L410)
    // decide whether the removal may proceed (harmonization H2, H3).
    recipe("n-external-release", "normalize", sel("root", "all", all(is("bpmn:Lane"), not(recog("external-lane")),
      count(sel("self", "reference", recog("call-external"), "flowNodeRef"), 1))), [
      { op: "assignRef", target: "self", path: "/flowNodeRef", mode: "remove", values: [ids(sel("self", "reference", recog("call-external"), "flowNodeRef"))] },
    ], [w("self", "/flowNodeRef", "reference")]),
    recipe("n-external-membership", "normalize", sel("root", "all", all(is("bpmn:CallActivity"), recog("call-external"))), [
      ...ownerOf, laneSetFor("proc"), laneFor("proc"),
      { op: "assignRef", target: "lane", path: "/flowNodeRef", mode: "appendUnique", values: [idOf("self")] },
    ], [w("proc", "/laneSets", "create"), w("envelope", "/bindings", "binding"), w("laneSet", "/lanes", "create"), w("lane", "/flowNodeRef", "reference")]),
    // Reference anchors use every link touching the reference, so that a direction
    // reversal in the same run cannot change the anchor on the second run (L569).
    place("n-place-reference-anchored", sel("root", "all", all(is("bpmn:DataStoreReference"), any(
      count(sel("self", "inverseReference", is("bpmn:Association"), "sourceRef"), 1), count(sel("self", "inverseReference", is("bpmn:Association"), "targetRef"), 1)))), "reference-band",
      bind("anchor", ASSOCIATIONS_TOUCHING("item"), "first"), ownerOf, ASSOCIATIONS_TOUCHING),
    place("n-place-reference-plain", sel("root", "all", all(is("bpmn:DataStoreReference"),
      count(sel("self", "inverseReference", is("bpmn:Association"), "sourceRef"), 0, 0), count(sel("self", "inverseReference", is("bpmn:Association"), "targetRef"), 0, 0))), "reference-band",
      null, ownerOf, ASSOCIATIONS_TOUCHING),
    ...["bpmn:DataInput", "bpmn:DataOutput"].flatMap(type => {
      const stem = type === "bpmn:DataInput" ? "input" : "output";
      return [
        place(`n-place-${stem}-anchored`, sel("root", "all", all(is(type), any(count(CONSUMING, 1), count(PRODUCING, 1)))), "external-io",
          bind("anchor", CONSUMING, "first", [PRODUCING]), ioOwner, TOUCHING),
        place(`n-place-${stem}-plain`, sel("root", "all", all(is(type), count(CONSUMING, 0, 0), count(PRODUCING, 0, 0))), "external-io",
          null, ioOwner, TOUCHING),
      ];
    }),
    place("n-place-item-anchored", sel("root", "all", all(is("bpmn:DataObjectReference"), any(count(CONSUMING, 1), count(PRODUCING, 1)))), "item",
      bind("anchor", CONSUMING, "first", [PRODUCING]), ownerOf, TOUCHING),
    place("n-place-item-plain", sel("root", "all", all(is("bpmn:DataObjectReference"), count(CONSUMING, 0, 0), count(PRODUCING, 0, 0))), "item",
      null, ownerOf, TOUCHING),
    place("n-place-external-call", sel("root", "all", all(is("bpmn:CallActivity"), recog("call-external"))), "external",
      null, ownerOf, ASSOCIATIONS_TOUCHING),
    reverse("n-reverse-trigger-in", is("bpmn:StartEvent"), recog("call-external")),
    reverse("n-reverse-trigger-out", recog("call-external"), is("bpmn:EndEvent")),
    reverse("n-reverse-supplier", is("bpmn:DataInput"), recog("call-external")),
    reverse("n-reverse-reference", is("bpmn:Task", "assignable"), is("bpmn:DataStoreReference")),
  ];
  // A second recipe reversing the permitted reference pair back: its first run
  // reverses, the bounded second evaluation reverses again (DESIGN L176).
  if (variant === "flip") list.push(reverse("n-reverse-back", is("bpmn:DataStoreReference"), is("bpmn:Task", "assignable")));
  // A second recipe writing another direction on the same reversed association.
  // An explicit refusal planned after every ensure of the run (DESIGN L573).
  if (variant === "abort") list.push(recipe("n-fixture-abort", "normalize", sel("root", "all", is("bpmn:Process")), [
    { op: "refuse", code: "fixture-abort", target: "self" },
  ], []));
  if (variant === "dirconflict") list.push(recipe("n-direction-both", "normalize",
    sel("root", "all", all(is("bpmn:Association"), count(sel("self", "reference", is("bpmn:Task", "assignable"), "sourceRef"), 1), count(sel("self", "reference", is("bpmn:DataStoreReference"), "targetRef"), 1))), [
      { op: "set", target: "self", path: "/associationDirection", value: lit("Both") },
    ], [w("self", "/associationDirection", "set")]));
  return list;
}
function commandRecipes(neutral) {
  const keep = ["create-task", "create-aid", "rename", "link", "add-note", "migrate-process", "export-pages", "export-nodes"];
  const kept = keep.map(id => clone(neutral.recipes.find(r => r.id === id)));
  const owned = (id, type, slot) => recipe(id, "create", sel("owner", "self"), [
    create("created", type, "owner", "flowElements", idOf("owner"), slot, param("key"), [{ name: "name", value: param("name") }]),
  ], [w("owner", "/flowElements", "create")], { parameters: [elementParam("owner"), stringParam("key"), stringParam("name")] });
  const input = (id, withSet) => recipe(id, "create", sel("owner", "self"), [
    bind("io", sel("owner", "children", TRUE, "ioSpecification")),
    create("created", "bpmn:DataInput", "io", "dataInputs", idOf("owner"), "process-input", param("key"), [{ name: "name", value: param("name") }]),
    ...(withSet ? [{ op: "assignRef", target: "set", path: "/dataInputRefs", mode: "appendUnique", values: [idOf("created")] }] : []),
  ], [w("io", "/dataInputs", "create"), ...(withSet ? [w("set", "/dataInputRefs", "reference")] : [])],
  { parameters: [elementParam("owner"), stringParam("key"), stringParam("name"), ...(withSet ? [elementParam("set")] : [])] });
  return [
    ...kept.slice(0, 5),
    owned("create-start", "bpmn:StartEvent", "start"),
    owned("create-end", "bpmn:EndEvent", "end"),
    recipe("connect", "create", sel("owner", "self"), [
      create("flow", "bpmn:SequenceFlow", "owner", "flowElements", idOf("owner"), "flow", param("key")),
      { op: "assignRef", target: "flow", path: "/sourceRef", mode: "replace", values: [idOf("source")] },
      { op: "assignRef", target: "flow", path: "/targetRef", mode: "replace", values: [idOf("target")] },
    ], [w("owner", "/flowElements", "create"), w("flow", "/sourceRef", "reference"), w("flow", "/targetRef", "reference")],
    { parameters: [elementParam("owner"), elementParam("source"), elementParam("target"), stringParam("key")] }),
    input("create-process-input", true),
    input("create-process-input-unassigned", false),
    // Explicit dependency-checked deletion of a lane (DESIGN L171, L565): no
    // declared dependents; a retained inbound reference refuses.
    recipe("remove-lane", "edit", sel("target", "self"), [
      { op: "remove", target: "self", dependents: sel("self", "self", FALSE), policy: "refuseIfReferenced" },
    ], [w("self", "", "remove")], { when: is("bpmn:Lane"), parameters: [elementParam("target")] }),
    ...kept.slice(5),
  ];
}

// ---------------------------------------------------------------- notions, rules, validation, UI
const aiRecord = { description: "Synthetic lot-3 C/N profile example; no customer vocabulary.", examples: [], counterexamples: [], producers: ["editor", "import"], evidenceRequired: false };
const notion = (id, label, nativeTypes, recognition, kind) => ({ id, labels: [{ name: "en", value: label }], citations: [], nativeTypes, recognition,
  ...(kind === "facet" ? { facet: true } : { exclusiveGroup: kind }), ai: aiRecord, referenceRecipes: [], renderBindings: [], fields: [] });
function notions(neutral) {
  return [
    ...clone(neutral.notions),
    notion("call-external", "external call", ["bpmn:CallActivity"], all(is("bpmn:CallActivity"), count(MARKERS(), 1, 1),
      count(MARKERS(eq(read("self", "/text"), lit("external"))), 1), not(present(read("self", "/calledElement")))), "primary"),
    notion("external-lane", "bound external lane", ["bpmn:Lane"], { op: "boundRole", binding: "self", owner: "bindingOwner", role: "external-lane" }, "facet"),
  ];
}
const rule = (id, code, classification, select, assert, bindings) => ({ id, phase: "post-normalize", select, ...(bindings ? { bindings } : {}), assert, code, message: code, classification });
const containerBinding = [ownerProcess()];
const firstMarker = [bind("first", MARKERS(), "first")];
const CALLS = extra => sel("root", "all", all(is("bpmn:CallActivity"), ...extra));
const TRIGGERS = sel("self", "inverseReference", all(is("bpmn:Association"), count(sel("self", "reference", recog("call-external"), "sourceRef"), 1)), "targetRef");
const IO_ITEM = any(is("bpmn:DataInput"), is("bpmn:DataOutput"));
const SRC = test => count(sel("self", "reference", test, "sourceRef"), 1);
const TGT = test => count(sel("self", "reference", test, "targetRef"), 1);
const NO_SRC = test => count(sel("self", "reference", test, "sourceRef"), 0, 0);
const NO_TGT = test => count(sel("self", "reference", test, "targetRef"), 0, 0);
const PAIR = (s, t2) => all(SRC(s), TGT(t2));
// Settled descriptive link pairs (DESIGN §4 L348, L353-L354, §4.3 L397-L401, §16
// item 9). External call -> Process DataOutput is the gated external-producer
// candidate (OPEN-RELATIONS, U6): it is never an integrity finding here.
const LINK_PERMITTED = any(
  PAIR(is("bpmn:CallActivity"), is("bpmn:StartEvent")),
  PAIR(is("bpmn:EndEvent"), is("bpmn:CallActivity")),
  PAIR(is("bpmn:DataStoreReference"), is("bpmn:Task", "assignable")),
  PAIR(is("bpmn:CallActivity"), is("bpmn:DataInput")),
  PAIR(is("bpmn:DataOutput"), is("bpmn:CallActivity")),
  PAIR(is("bpmn:CallActivity"), is("bpmn:DataOutput")),
  SRC(is("bpmn:TextAnnotation")));
const OWNED_BY_CONTAINER = binding => count(sel(binding, "owner", eq(idOf("self"), idOf("container"))), 1);
function lot3Rules() {
  const ordinary = sel("root", "all", ORDINARY);
  return [
    rule("ordinary-incoming", "ordinary-incoming-required", "readiness", ordinary, any(EXEMPT, count(FLOWS_IN, 1))),
    rule("ordinary-outgoing", "ordinary-outgoing-required", "readiness", ordinary, any(EXEMPT, count(FLOWS_OUT, 1))),
    rule("ordinary-from-start", "ordinary-start-unreachable", "readiness", ordinary,
      any(EXEMPT, reach(sel("container", "children", is("bpmn:StartEvent"), "flowElements"), sel("self", "self"))), containerBinding),
    rule("ordinary-to-end", "ordinary-end-unreachable", "readiness", ordinary,
      any(EXEMPT, reach(sel("self", "self"), sel("container", "children", is("bpmn:EndEvent"), "flowElements"))), containerBinding),
    rule("call-ambiguous", "call-kind-ambiguous", "integrity", CALLS([count(MARKERS(), 2)]),
      count(MARKERS(not(eq(read("self", "/text"), read("first", "/text")))), 0, 0), firstMarker),
    rule("call-duplicate", "call-kind-marker-duplicate", "integrity", CALLS([count(MARKERS(), 2)]),
      count(MARKERS(not(eq(read("self", "/text"), read("first", "/text")))), 1), firstMarker),
    rule("call-marker-invalid", "call-kind-marker-invalid", "integrity", CALLS([count(MARKERS(), 1, 1)]),
      count(MARKERS(eq(read("self", "/text"), lit("external"))), 1)),
    rule("call-conflict", "call-kind-conflict", "integrity", CALLS([count(MARKERS(), 1, 1), count(MARKERS(eq(read("self", "/text"), lit("external"))), 1)]),
      not(present(read("self", "/calledElement")))),
    rule("call-target-empty", "call-target-empty", "readiness", CALLS([count(MARKERS(), 0, 0)]),
      not(eq(read("self", "/calledElement"), lit("")))),
    // Value-based: no root element other than a Process carries the target ID. It
    // never traverses calledElement, so a dangling target is left to the graph
    // index integrity entry (harmonization C2) instead of failing evaluation.
    rule("call-target-type", "call-target-type", "integrity", CALLS([count(MARKERS(), 0, 0), present(read("self", "/calledElement")), not(eq(read("self", "/calledElement"), lit("")))]),
      count(sel("root", "children", all(not(is("bpmn:Process")), eq(idOf("self"), read("call", "/calledElement"))), "rootElements"), 0, 0), [bind("call", sel("self", "self"))]),
    rule("call-target-required", "call-target-required", "readiness", CALLS([count(MARKERS(), 0, 0)]),
      present(read("self", "/calledElement"))),
    rule("trigger-branch", "trigger-branch-required", "readiness", sel("root", "all", all(is("bpmn:StartEvent"), count(TRIGGERS, 2))),
      reach(sel("self", "self"), sel("container", "children", is("bpmn:ExclusiveGateway"), "flowElements")), containerBinding),
    rule("input-supplier", "input-supplier-required", "readiness", sel("root", "all", is("bpmn:DataInput")),
      count(sel("self", "inverseReference", all(is("bpmn:Association"), count(sel("self", "reference", recog("call-external"), "sourceRef"), 1)), "targetRef"), 1)),
    rule("input-consumer", "input-consumer-required", "readiness", sel("root", "all", is("bpmn:DataInput")),
      count(sel("self", "inverseReference", all(is("bpmn:DataInputAssociation"), present(read("self", "/targetRef"))), "sourceRef"), 1)),
    rule("output-producer", "output-producer-required", "readiness", sel("root", "all", is("bpmn:DataOutput")),
      count(PRODUCING, 1)),
    rule("output-consumer", "output-consumer-required", "readiness", sel("root", "all", is("bpmn:DataOutput")),
      count(sel("self", "inverseReference", all(is("bpmn:Association"), count(sel("self", "reference", recog("call-external"), "targetRef"), 1)), "sourceRef"), 1)),
    rule("link-endpoint", "link-endpoint-invalid", "integrity", sel("root", "all", is("bpmn:Association")), LINK_PERMITTED),
    rule("link-owner", "link-owner-invalid", "integrity", sel("root", "all", all(is("bpmn:Association"), NO_SRC(IO_ITEM), NO_TGT(IO_ITEM))),
      all(OWNED_BY_CONTAINER("source"), OWNED_BY_CONTAINER("target")),
      [ownerProcess(), bind("source", sel("self", "reference", TRUE, "sourceRef")), bind("target", sel("self", "reference", TRUE, "targetRef"))]),
    rule("link-owner-io", "link-owner-invalid", "integrity", sel("root", "all", all(is("bpmn:Association"), any(all(SRC(IO_ITEM), NO_TGT(IO_ITEM)), all(NO_SRC(IO_ITEM), TGT(IO_ITEM))))),
      all(OWNED_BY_CONTAINER("spec"), OWNED_BY_CONTAINER("other")),
      [ownerProcess(), bind("item", sel("self", "reference", IO_ITEM, "sourceRef"), "first", [sel("self", "reference", IO_ITEM, "targetRef")]),
        bind("spec", sel("item", "owner")),
        bind("other", sel("self", "reference", not(IO_ITEM), "sourceRef"), "first", [sel("self", "reference", not(IO_ITEM), "targetRef")])]),
    rule("flow-container", "flow-cross-container", "integrity", sel("root", "all", is("bpmn:SequenceFlow")),
      all(count(sel("source", "owner", eq(idOf("self"), idOf("container"))), 1), count(sel("target", "owner", eq(idOf("self"), idOf("container"))), 1)),
      [ownerProcess(), bind("source", sel("self", "reference", TRUE, "sourceRef")), bind("target", sel("self", "reference", TRUE, "targetRef"))]),
  ];
}
const MESSAGES = {
  "ordinary-incoming-required": "An ordinary activity or gateway needs an incoming sequence flow.",
  "ordinary-outgoing-required": "An ordinary activity or gateway needs an outgoing sequence flow.",
  "ordinary-start-unreachable": "An ordinary activity or gateway must be reachable from a start event of its process.",
  "ordinary-end-unreachable": "An ordinary activity or gateway must reach an end event of its process.",
  "call-kind-ambiguous": "Several call-kind markers carry different texts.",
  "call-kind-marker-duplicate": "Several identical call-kind markers are present.",
  "call-kind-marker-invalid": "The call-kind marker text is not a known kind.",
  "call-kind-conflict": "A marked external call must not name a called element.",
  "call-target-empty": "The called element is empty.",
  "call-target-type": "The called element is not a process.",
  "call-target-required": "The call has neither a called process nor a call-kind marker.",
  "trigger-branch-required": "Several incoming triggers need a downstream exclusive branch.",
  "input-supplier-required": "A process input needs a supplier link from an external call.",
  "input-consumer-required": "A process input needs a consuming data association.",
  "output-producer-required": "A process output needs a producing data association.",
  "output-consumer-required": "A process output needs a consumer link to an external call.",
  "link-endpoint-invalid": "A descriptive link connects endpoints of a type or in a direction that is not permitted.",
  "link-owner-invalid": "A descriptive link connects an endpoint owned by another process.",
  "flow-cross-container": "A sequence flow must stay inside its flow container.",
};
const STAGES = ["import", "pre-normalize", "post-normalize", "post-layout", "release"];
function validation(neutral, rules) {
  const manifest = fixtureJson(PATHS.lint);
  const standard = Object.keys(manifest.rules);
  const classOf = Object.fromEntries(neutral.validation[0].settings.filter(s => !s.rule.startsWith("profile:")).map(s => [s.rule, s.classification]));
  const records = [];
  for (const stage of STAGES) for (const policy of ["draft", "accept"]) {
    const settings = standard.map(name => ({ rule: name, severity: "off", classification: classOf[name] }));
    for (const r of rules.filter(r => r.phase === stage)) {
      settings.push({ rule: `profile:${r.id}`, severity: policy === "accept" || r.classification === "integrity" ? "error" : "warn", classification: r.classification });
    }
    records.push({ id: stage, policy, extends: ["bpmnlint:recommended"], settings, profileRule: "profile-mechanism/profile" });
  }
  return records;
}
// Surface entries for the transaction scripts (lot-5 command records, I3).
const uiEntry = (id, surface, group, order, recipeId, parameters) => ({ id, surface, group, order, upstreamEntries: [], label: "label", when: TRUE, recipe: recipeId,
  parameters: parameters.map(([name, source]) => ({ name, source })), icon: { theme: "plain", glyph: "task" } });
function uiEntries(neutral) {
  return [
    ...clone(neutral.ui),
    uiEntry("start-create", "palette", "basic", 1, "create-start", [["owner", "owner"], ["key", "key"], ["name", "value"]]),
    uiEntry("end-create", "palette", "basic", 2, "create-end", [["owner", "owner"], ["key", "key"], ["name", "value"]]),
    uiEntry("input-create", "palette", "basic", 3, "create-process-input", [["owner", "owner"], ["key", "key"], ["name", "value"], ["set", "target"]]),
    uiEntry("input-create-unassigned", "palette", "basic", 4, "create-process-input-unassigned", [["owner", "owner"], ["key", "key"], ["name", "value"]]),
    uiEntry("flow-connect", "connect", "basic", 0, "connect", [["owner", "owner"], ["source", "source"], ["target", "target"], ["key", "key"]]),
    uiEntry("lane-delete", "delete", "edit", 0, "remove-lane", [["target", "target"]]),
  ];
}
// A paint-only second theme sharing geometry: switching changes viewRevision only.
const CONTRAST = { id: "contrast", aliases: [], tokens: [{ name: "stroke", value: "#202020" }], glyphs: [], metricsResource: "neutral-metrics", geometry: "shared", fallback: "plain", syntheticOccurrences: [] };
const PROFILE_NAMES = { main: "neutral-cn/1", stale: "neutral-cn-stale/1", conflict: "neutral-cn-conflict/1", coalesce: "neutral-cn-coalesce/1",
  outport: "neutral-cn-outport/1", flip: "neutral-cn-flip/1", dirconflict: "neutral-cn-dirconflict/1", ensureconflict: "neutral-cn-ensureconflict/1", extraction: "neutral-cn-extraction/1",
  abort: "neutral-cn-abort/1" };
const EXTRACTION_DELTA = [["bpmn:Definitions", "/rootElements"], ["bpmn:Process", "/name"], ["bpmn:Process", "/flowElements"], ["bpmn:Task", "/name"]]
  .map(([nativeType, path]) => ({ nativeType, path, from: "import", to: "ai", reason: "Synthetic extraction fixture: the ai actor authors this field." }));
function profileDocument(variant, pins) {
  const neutral = fixtureJson(PATHS.lot0Neutral);
  const rules = [...clone(neutral.rules), ...lot3Rules()];
  const commands = commandRecipes(neutral);
  const recipes = [...commands.slice(0, 11), ...completeRecipes(variant), ...normalizeRecipes(variant), ...commands.slice(11)];
  return {
    $schema: neutral.$schema, schemaVersion: neutral.schemaVersion, mechanismVersion: neutral.mechanismVersion,
    profile: PROFILE_NAMES[variant], version: PROFILE_VERSION, base: pins.base, descriptors: [pins.descriptors],
    capabilities: clone(neutral.capabilities), policies: clone(neutral.policies), producerDelta: variant === "extraction" ? clone(EXTRACTION_DELTA) : [],
    notions: notions(neutral), rules, recipes, placements: [], themes: [...clone(neutral.themes), clone(CONTRAST)], ui: uiEntries(neutral),
    validation: validation(neutral, rules), providerDialects: clone(neutral.providerDialects), exports: clone(neutral.exports),
    migrations: clone(neutral.migrations), resources: clone(neutral.resources),
    messages: [...clone(neutral.messages), ...Object.entries(MESSAGES).map(([id, value]) => ({ id, texts: [{ name: "en", value }] }))],
    compatibilityAliases: [],
  };
}
function identityOf(profile) {
  return { mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion, profile: profile.profile, version: profile.version,
    sha256: H(profile), base: clone(profile.base), descriptors: clone(profile.descriptors) };
}

// ---------------------------------------------------------------- materialized profiles
const out = {}; // relative path (from tests/fixtures/) -> bytes
function emit(path, bytes) { out[path] = bytes; return { path, sha256: B(bytes) }; }
const descriptorFile = emit(PATHS.descriptors, prettyBytes(DESCRIPTORS));
const BASE = baseRecord(DESCRIPTORS);
const baseFile = emit(PATHS.base, prettyBytes(BASE));
const PINS = { base: { id: BASE.id, version: BASE.version, sha256: baseFile.sha256 }, descriptors: { id: DESCRIPTORS.id, version: EXPORTER, sha256: descriptorFile.sha256 } };
const PROFILES = {};
const VARIANTS = ["main", "stale", "conflict", "coalesce", "outport", "flip", "dirconflict", "ensureconflict", "extraction", "abort"];
// The main profile is indented for review; the single-purpose variants are compact
// JSON (one line plus LF): their pins are raw SHA-256 of these exact bytes.
const compactBytes = value => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
for (const variant of VARIANTS) {
  const document = profileDocument(variant, PINS);
  const file = emit(PATHS[variant], variant === "main" ? prettyBytes(document) : compactBytes(document));
  PROFILES[variant] = { document, file, identity: identityOf(document) };
}
for (const [key, path] of [["neutral", PATHS.lot0Neutral], ["grid", PATHS.lot0Grid]]) {
  const document = fixtureJson(path);
  PROFILES[key] = { document, file: { path, sha256: B(fixtureBytes(path)) }, identity: identityOf(document) };
}

// ---------------------------------------------------------------- cross-lot consistency checks
// The helper must reproduce digests already sealed by lot 0 before it is trusted here.
function assertEq(actual, expected, label) { if (actual !== expected) throw Error(`${label}: ${actual} !== ${expected}`); }
assertEq(stableId("Definitions_support", "collaboration", "Process_A", "lot-0 collaboration"), "g_0a8caa16444f4c61e14ffc4d7b77eb0dd75f8764840be0d3d7b8be550c0923d1", "lot-0 collaboration id");
assertEq(stableId("Process_A", "reference-band", "reference-band", "lot-0 band"), "g_11a2781ef2229f47d2ae48d7b4cc3ad823a7f013eac7fa12d7cefd30f412d769", "lot-0 band id");
assertEq(stableId("document-root/1", "definitions", "root", "lot-0 root"), "g_ef5c144fe3bd7d1e6005468ef00b592d7bd71807c23675349a8c7d6fb228ba21", "lot-0 root id");
assertEq(PROFILES.neutral.identity.sha256, "51f1b7b7c69bc77d32e2d167f0a7b19c910ac2a1e5276cc836992487cb426c40", "lot-0 neutral profile digest");
{
  const lot0Tree = { $type: "bpmn:Definitions", id: "Definitions_A", targetNamespace: "urn:neutral:1", exporterVersion: "fixture-2", rootElements: [{ $type: "bpmn:Process", id: "Process_A", name: "Source", isExecutable: false,
    flowElements: [{ $type: "bpmn:Task", id: "Task_A", name: "Task", documentation: [{ $type: "bpmn:Documentation", text: "Source\nbytes", textFormat: "text/plain" }] }] }] };
  assertEq(H({ tree: lot0Tree, profileIdentity: PROFILES.neutral.identity, bindings: [] }), "851037164c3008d87d820ba45c9ee7ef81e234ae756faebaa20c2a6c74063c05", "lot-0 semantic revision");
  const sig = contentSignature({ $type: "bpmn:Task", name: "Same", documentation: [{ $type: "bpmn:Documentation", text: "Evidence", textFormat: "text/plain" }] }, "lot-0 sibling");
  assertEq(stableId("Process_A", "bpmn:Process.flowElements", birthKey(sig, 1), "lot-0 sibling 1"), "g_bfe487754e6b93e1be16ec6b7e56193ed82cfa1401b6cfb87e6a2c57b6de3085", "lot-0 sibling ordinal 1");
}
// §9.2 view digests over input records only (no layout engine): reproduce the lot-0 sealed values.
const themeChain = (profile, themeId) => {
  const themes = profile.document.themes, chain = [];
  for (let id = themeId; id !== undefined;) { const theme = themes.find(x => x.id === id); chain.unshift(theme); id = theme.fallback; }
  return chain;
};
const themeDigestOf = (profile, themeId) => H({ themeId, themes: themeChain(profile, themeId) });
const VIEW = {
  themeDigest: themeDigestOf(PROFILES.neutral, "plain"),
  overridesDigest: H({ semantic: [], occurrence: [] }),
  diStylesDigest: H({ native: [], bioc: [] }),
  metricsDigest: H([{ id: "neutral-metrics", sha256: B(fixtureBytes(PATHS.metrics)) }]),
};
assertEq(VIEW.themeDigest, "74b97e29ea96d07df5c44eb917733c2c870b7d1eb39b1969e0d05c3ce7a0741f", "lot-0 theme digest");
assertEq(VIEW.overridesDigest, "e5d14358eed3eebbde859d54222bab9b9054c681496ba84ac751e77adc932b8c", "lot-0 overrides digest");
assertEq(VIEW.diStylesDigest, "b9807dcc0243e9a28c1ca1e15b1b7858f334dd92bb76270ba1a8a097062599e4", "lot-0 diStyles digest");
assertEq(VIEW.metricsDigest, "4f02aa1a16d22d03bebaac92939210302637ba59a8a47504690986b40483d051", "lot-0 metrics digest");
const MAIN_THEMES = { plain: themeDigestOf(PROFILES.main, "plain"), contrast: themeDigestOf(PROFILES.main, "contrast") };
assertEq(MAIN_THEMES.plain, VIEW.themeDigest, "neutral-cn keeps the lot-0 plain theme record");
const viewRevision = (semanticRevision, layout, themeId = "plain", themeDigest = VIEW.themeDigest) => {
  const tuple = { semanticRevision, layoutDigest: H(layout), themeId, themeDigest, overridesDigest: VIEW.overridesDigest, diStylesDigest: VIEW.diStylesDigest, metricsDigest: VIEW.metricsDigest };
  const value = H(tuple);
  if (!ledger.views.some(v => v.value === value)) ledger.views.push({ tuple, value });
  return value;
};
{
  const lot0Layout = { layoutVersion: "1", pages: [{ pageId: "page_a", name: "Page A", order: 0, semanticRootId: "Process_A", bounds: { x: 0, y: 0, width: 1000, height: 800 } }],
    geometry: [{ pageId: "page_a", occurrenceKey: "task_a", semanticId: "Task_A", role: "content", bounds: { x: 0, y: 0, width: 100, height: 80 } }] };
  assertEq(H(lot0Layout), "d5debc5019c19cf636de6b8c5bd1ca019ee4c24494b14f1d5197279839efeaad", "lot-0 layout digest");
  assertEq(viewRevision("851037164c3008d87d820ba45c9ee7ef81e234ae756faebaa20c2a6c74063c05", lot0Layout), "d6956d94acb83b907919df9dfb6965fcd7a7cce38fdf2f1e6969255d2d4668b4", "lot-0 view revision");
}

// ---------------------------------------------------------------- envelopes
const sortBindings = list => [...list].sort((a, b) => cmp(a.ownerId, b.ownerId) || cmp(a.role, b.role) || cmp(a.targetId, b.targetId));
function envelopeWith(profileIdentity, tree, bindings = []) {
  const sorted = sortBindings(bindings).map(clone);
  const semanticRevision = H({ tree, profileIdentity, bindings: sorted });
  return { documentVersion: "1", profileIdentity: clone(profileIdentity), tree: clone(tree), bindings: sorted, semanticRevision };
}
const envelope = (profileKey, tree, bindings = []) => envelopeWith(PROFILES[profileKey].identity, tree, bindings);
const binding = (ownerId, role, targetId) => ({ ownerId, role, targetId });
const echoOf = e => ({ profileIdentity: clone(e.profileIdentity), baseRevision: e.semanticRevision });

// ---------------------------------------------------------------- placements (DESIGN §7.2 L565)
const sortPlacements = list => [...list].sort((a, b) => cmp(a.ownerProcessId, b.ownerProcessId) || cmp(a.regionKey, b.regionKey) || cmp(a.elementId, b.elementId)
  || (a.anchorAssociationId === undefined ? (b.anchorAssociationId === undefined ? 0 : -1) : b.anchorAssociationId === undefined ? 1 : cmp(a.anchorAssociationId, b.anchorAssociationId))
  || (() => { const [x, y] = [a.relatedAssociationIds, b.relatedAssociationIds]; for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return cmp(x[i], y[i]); return x.length - y.length; })());
const placement = (elementId, ownerProcessId, regionKey, relatedAssociationIds, anchorAssociationId) => {
  for (let i = 1; i < relatedAssociationIds.length; i++) if (!(relatedAssociationIds[i - 1] < relatedAssociationIds[i])) throw Error(`unsorted related ids for ${elementId}`);
  if (anchorAssociationId !== undefined && !relatedAssociationIds.includes(anchorAssociationId)) throw Error(`anchor outside related for ${elementId}`);
  return { elementId, ownerProcessId, regionKey, ...(anchorAssociationId === undefined ? {} : { anchorAssociationId }), relatedAssociationIds };
};
function placements(list) {
  if (jcs(sortPlacements(list)) !== jcs(list)) throw Error("placements literal is not in the DESIGN L565 order");
  return list;
}

// ---------------------------------------------------------------- Report/2 (DESIGN §10.1, harmonization B2, B4, B8, B9, B12, G2)
const STAGE_ORDER = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];
const nullFirst = (a, b) => a === null ? (b === null ? 0 : -1) : b === null ? 1 : cmp(a, b);
const optionalCmp = (x, y, key) => !own(x, key) ? (own(y, key) ? -1 : 0) : !own(y, key) ? 1 : cmp(x[key], y[key]);
const canonCmp = (x, y, key, flag) => !x[flag] ? (y[flag] ? -1 : 0) : !y[flag] ? 1 : cmp(jcs(x[key]), jcs(y[key]));
function compareEntries(x, y) {
  if (!STAGE_ORDER.includes(x.stage) || !STAGE_ORDER.includes(y.stage)) throw Error("unknown report stage");
  return STAGE_ORDER.indexOf(x.stage) - STAGE_ORDER.indexOf(y.stage)
    || cmp(x.ruleId, y.ruleId) || cmp(x.source.domain, y.source.domain) || nullFirst(x.source.pointer, y.source.pointer) || nullFirst(x.source.targetId, y.source.targetId)
    || cmp(x.code, y.code) || optionalCmp(x, y, "pageId") || optionalCmp(x, y, "occurrenceKey")
    || canonCmp(x, y, "before", "beforePresent") || canonCmp(x, y, "after", "afterPresent")
    || cmp(x.result.domain, y.result.domain) || nullFirst(x.result.pointer, y.result.pointer) || nullFirst(x.result.targetId, y.result.targetId)
    || optionalCmp(x, y, "property");
}
function sortEntries(list) {
  const sorted = [...list].sort(compareEntries);
  for (let i = 1; i < sorted.length; i++) if (jcs(sorted[i - 1]) === jcs(sorted[i])) throw Error("duplicate report entry in a literal");
  return sorted;
}
const idMapKey = r => [r.domain, own(r, "pageId") ? `1${r.pageId}` : "0", own(r, "occurrenceKey") ? `1${r.occurrenceKey}` : "0", r.sourceId, r.resultId];
const sortIdMap = list => [...list].sort((a, b) => { const [x, y] = [idMapKey(a), idMapKey(b)]; for (let i = 0; i < x.length; i++) { const c = cmp(x[i], y[i]); if (c) return c; } return 0; });
function report(operation, { source, target, inputRevision, outputRevision, entries = [], idMap = [] } = {}) {
  return { reportVersion: "2", operation, ...(source ? { sourceIdentity: clone(source) } : {}), ...(target ? { targetIdentity: clone(target) } : {}),
    ...(inputRevision !== undefined ? { inputRevision } : {}), ...(outputRevision !== undefined ? { outputRevision } : {}),
    entries: sortEntries(entries), rawStandardFindings: [], idMap: sortIdMap(idMap), artifacts: [] };
}
// Success: report header per B4; normalize payload carries the same report (B5).
function okResult(operation, input, payloadOf, output = input, entries = [], { idMap = [] } = {}) {
  const r = report(operation, { source: input.profileIdentity, target: output.profileIdentity, inputRevision: input.semanticRevision, outputRevision: output.semanticRevision, entries, idMap });
  return { status: "ok", operation, profileIdentity: clone(output.profileIdentity), baseRevision: input.semanticRevision, revision: output.semanticRevision, report: r,
    payload: typeof payloadOf === "function" ? payloadOf(r) : payloadOf };
}
// Refusal: echo per B3, diagnostics = report.entries = lint entries executed before the refusal (B2).
function refusedResult(operation, echo, code, entries = []) {
  const r = report(operation, echo ? { source: echo.profileIdentity, inputRevision: echo.baseRevision, entries } : { entries });
  return { status: "refused", operation, ...(echo ? { profileIdentity: clone(echo.profileIdentity), baseRevision: echo.baseRevision } : {}), code, diagnostics: clone(r.entries), report: r };
}
// C/N change entries (B8 vocabulary, B9 coordinates). A spec names the written
// location: {kind:"allocate", at} for an allocated ID; {kind:"set"|"assignRef",
// rule, at, property} for a property write; {kind:"create"|"ensure", rule, at}
// for a created element. `at` is the element pointer in the output tree.
function inputTargetId(tree, pointer) {
  const s = segs(pointer);
  for (let n = s.length; n >= 0; n--) { const node = at(tree, ptr(s.slice(0, n))); if (node.present && idBearing(node.value) && typeof node.value.id === "string") return node.value.id; }
  return null;
}
const outputTargetId = inputTargetId;
const containmentProperty = pointer => { const s = segs(pointer); return /^(0|[1-9][0-9]*)$/.test(s.at(-1)) ? s.at(-2) : s.at(-1); };
const locationOf = spec => spec.kind === "create" || spec.kind === "ensure" ? spec.at : `${spec.at}/${esc(spec.kind === "allocate" ? "id" : spec.property)}`;
function changeEntries(stage, input, output, specs, { createdElsewhere = [] } = {}) {
  const createdRoots = [...specs.filter(s => s.kind === "create" || s.kind === "ensure").map(s => s.at), ...createdElsewhere];
  const allocated = new Set(specs.filter(s => s.kind === "allocate").map(s => s.at));
  const under = (p, base) => p === base || p.startsWith(`${base}/`);
  const createdHere = p => createdRoots.some(base => under(p, base));
  return specs.map(spec => {
    const isCreate = spec.kind === "create" || spec.kind === "ensure";
    const action = spec.kind === "allocate" ? "allocate-id" : spec.kind;
    const location = locationOf(spec);
    const node = at(output, spec.at);
    if (!node.present || typeof node.value.$type !== "string") throw Error(`${stage} change at ${spec.at}: no output element`);
    const elementCreated = createdHere(spec.at);
    let source, before = { present: false };
    if (elementCreated) source = { domain: "none", pointer: null, targetId: null, provenance: "generated" };
    else {
      const old = at(input, spec.at);
      if (!old.present || old.value.$type !== node.value.$type || (typeof old.value.id === "string" && old.value.id !== node.value.id)) throw Error(`${stage} change at ${spec.at}: input element differs`);
      source = { domain: "tree", pointer: location, targetId: inputTargetId(input, spec.at), provenance: "exact" };
      before = at(input, location);
    }
    const after = at(output, location);
    if (before.present && after.present && jcs(before.value) === jcs(after.value)) throw Error(`${stage} change at ${location}: declared no-op`);
    const generated = elementCreated || allocated.has(spec.at);
    return { code: `${stage}/${action}`, severity: "info", classification: "repairable", stage, ruleId: spec.kind === "allocate" ? "stable-id/1" : spec.rule,
      messageKey: `${stage}.${action}`, disposition: "corrected", source,
      result: { domain: "tree", pointer: location, targetId: outputTargetId(output, spec.at), provenance: generated ? "generated" : "exact" },
      property: isCreate ? containmentProperty(spec.at) : spec.kind === "allocate" ? "id" : spec.property,
      beforePresent: before.present, ...(before.present ? { before: clone(before.value) } : {}), afterPresent: after.present, ...(after.present ? { after: clone(after.value) } : {}) };
  });
}
const A = at2 => ({ kind: "allocate", at: at2 });
const SET = (rule2, at2, property) => ({ kind: "set", rule: rule2, at: at2, property });
const REF = (rule2, at2, property) => ({ kind: "assignRef", rule: rule2, at: at2, property });
const CREATE = (rule2, at2) => ({ kind: "create", rule: rule2, at: at2 });
const ENSURE = (rule2, at2) => ({ kind: "ensure", rule: rule2, at: at2 });

// ---------------------------------------------------------------- unified lint entries (DESIGN §6.4, harmonization B12)
const RULES = Object.fromEntries(lot3Rules().map(r => [r.id, r]));
function pointerOf(tree, id) {
  let found;
  const walk = (node, pointer) => {
    if (Array.isArray(node)) node.forEach((child, i) => walk(child, `${pointer}/${i}`));
    else if (node && typeof node === "object") {
      if (node.id === id && node.$type) { if (found !== undefined) throw Error(`duplicate ${id}`); found = pointer; }
      for (const [k, v] of Object.entries(node)) if (v && typeof v === "object") walk(v, `${pointer}/${esc(k)}`);
    }
  };
  walk(tree, "");
  if (found === undefined) throw Error(`no node ${id}`);
  return found;
}
const UNAVAILABLE = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
function finding(tree, ruleId, targetId, policy, stage = "post-normalize") {
  const r = RULES[ruleId];
  return { code: r.code, severity: policy === "accept" || r.classification === "integrity" ? "error" : "warn", classification: r.classification, stage, ruleId,
    messageKey: r.message, disposition: "observed", source: { domain: "tree", pointer: pointerOf(tree, targetId), targetId, provenance: "exact" }, result: clone(UNAVAILABLE),
    beforePresent: false, afterPresent: false };
}
// Graph-index integrity entry for a dangling reference in validate (C2); library
// adapter convention of DESIGN L516-L518 (ruleId adapter, messageKey = code).
function danglingFinding(tree, elementId, property) {
  return { code: "reference-dangling", severity: "error", classification: "integrity", stage: "post-normalize", ruleId: "adapter", messageKey: "reference-dangling",
    disposition: "observed", source: { domain: "tree", pointer: `${pointerOf(tree, elementId)}/${esc(property)}`, targetId: elementId, provenance: "exact" }, result: clone(UNAVAILABLE),
    beforePresent: false, afterPresent: false };
}
const countsOf = entries => { const c = { info: 0, warn: 0, error: 0 }; for (const e of entries) c[e.severity]++; return c; };

// ---------------------------------------------------------------- case registry
const CASES = [];
const SECTIONS = {
  "§2.1": [44, 81], "§2.2": [103, 134], "§2.3": [136, 154], "§2.4": [156, 178], "§2.4.1": [180, 218], "§2.5": [220, 254], "§3.1": [258, 272], "§3.2": [274, 292], "§3.3": [294, 326], "§4": [332, 358],
  "§4.1": [360, 383], "§4.2": [385, 391], "§4.3": [393, 404], "§4.4": [406, 424], "§5.1": [428, 434], "§5.2": [436, 446], "§5.3": [448, 452],
  "§6.2": [466, 481], "§6.3": [483, 504], "§6.4": [506, 524], "§6.5": [526, 530], "§7.1": [534, 548], "§7.2": [550, 565], "§7.3": [567, 573], "§8.1": [577, 623],
  "§8.1.1": [608, 623], "§8.2": [625, 645], "§8.3": [647, 661], "§9.1": [665, 673], "§9.2": [675, 694], "§9.4": [719, 725], "§10.1": [733, 766], "§10.2": [768, 803], "§13": [903, 937], "§14.2": [945, 955], "§14.3": [957, 973], "§14.4": [975, 981], "§16": [1134, 1162],
};
const clause = (section, from, to = from) => {
  const range = SECTIONS[section];
  if (!range || from < range[0] || to > range[1] || from > to) throw Error(`bad clause ${section} L${from}-${to}`);
  return { section, lines: [from, to] };
};
const COMPARATOR_IDS = ["profile-c14n/2", "stable-id/1", "node-crypto", "python-hashlib", "result-1/lot3", "placements-order/lot3", "source-preservation/lot3", "transport-bytes/lot3", "transaction-trace/lot3",
  "fixed-point/lot3", "plan-apply/lot3", "compile/lot3"];
const artifact = (role, json) => ({ role, json });
const textArtifact = (role, text) => ({ role, text, sha256: sha(Buffer.from(text, "utf8")) });
const profileArtifact = key => key ? { path: PROFILES[key].file.path, sha256: PROFILES[key].file.sha256 } : null;
function addCase(meta, body) {
  if (CASES.some(c => c.meta.caseId === meta.caseId)) throw Error(`duplicate case ${meta.caseId}`);
  if (!meta.discriminates || meta.discriminates.length < 40) throw Error(`weak discrimination note ${meta.caseId}`);
  if (!/^ok$|^refused:[a-z][a-z0-9-]*$/.test(body.expectedStatus)) throw Error(`status ${meta.caseId}`);
  if (!body.expectedArtifacts.length) throw Error(`empty expectation ${meta.caseId}`);
  for (const id of body.comparatorIds) if (!COMPARATOR_IDS.includes(id)) throw Error(`unknown comparator ${id}`);
  const unsealed = body.unsealed ?? [];
  for (const u of unsealed) if (!u.artifact || typeof u.pointer !== "string" || !u.reason || u.reason.length < 20) throw Error(`bad unsealed record ${meta.caseId}`);
  const expectedArtifacts = [...body.expectedArtifacts, ...(unsealed.length ? [artifact("unsealed", unsealed)] : [])];
  // Vendored cases pin their profile file directly (`profileFile`, or null).
  const vector = { caseId: meta.caseId, operation: body.operation, phase: body.phase ?? null, profileArtifact: own(body, "profileFile") ? body.profileFile : profileArtifact(body.profile),
    inputArtifacts: body.inputArtifacts, ...(body.commandArtifact ? { commandArtifact: body.commandArtifact } : {}),
    expectedArtifacts, expectedStatus: body.expectedStatus, comparatorIds: body.comparatorIds };
  CASES.push({ meta: { runtimes: ["js", "python"], ...meta }, vector });
  return vector;
}
const activationArtifacts = activation => activation ? [artifact("activation", activation)] : [];
// One C or N run with the author's declared change list.
function cnCase(meta, { operation, profile = "main", input, expected, changes = [], placementsList, refusal, echo = true, mode = "retained", activation, placementIntent, extraInputs = [] }) {
  const phase = operation;
  const inputArtifacts = [artifact("envelope", input), ...(operation === "complete" ? [artifact("mode", mode)] : []), ...activationArtifacts(activation),
    ...(placementIntent ? [artifact("placement-intent", placementIntent)] : []), ...extraInputs];
  if (refusal) {
    const result = refusedResult(operation, echo ? echoOf(input) : null, refusal);
    addCase(meta, { operation, phase, profile, inputArtifacts, expectedStatus: `refused:${refusal}`,
      expectedArtifacts: [artifact("result", result), artifact("caller-state", input)],
      comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
    return { result };
  }
  revertCheck(input.tree, expected.tree, changes.map(locationOf), meta.caseId);
  if (operation === "complete" && jcs(input.bindings) !== jcs(expected.bindings)) throw Error(`C changed bindings ${meta.caseId}`);
  const entries = changeEntries(operation, input.tree, expected.tree, changes);
  const result = okResult(operation, input, r => operation === "complete" ? clone(expected) : { envelope: clone(expected), placements: clone(placementsList), report: clone(r) }, expected, entries);
  addCase(meta, { operation, phase, profile, inputArtifacts, expectedStatus: "ok",
    expectedArtifacts: [artifact("result", result), artifact("caller-state", input)],
    comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2", ...(operation === "normalize" ? ["placements-order/lot3"] : [])] });
  return { result, entries };
}
const SHARED = {}; // named expected states reused by later cases (fixed points, transport, scripts)
const birth = (owner, slot, raw, ordinal, label) => stableId(owner, slot, birthKey(contentSignature(raw, label), ordinal), label);
// DESIGN L292 duplicateOrdinal of siblings[i]: its zero-based original order among the
// ID-missing siblings of one ownerId/containment property with an equal birth signature.
const duplicateOrdinal = (siblings, i) => siblings.slice(0, i).filter(s => !own(s, "id") && jcs(withoutIds(s)) === jcs(withoutIds(siblings[i]))).length;

// Author self-check for C-complete trees: incoming/outgoing equal the ID-sorted
// SequenceFlows of the same flow container and gateway directions follow the
// DESIGN L544 thresholds. A failed check means a wrong literal, never a derivation.
function checkComplete(tree, label) {
  const IN = new Set(["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:IntermediateCatchEvent", "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:EndEvent"]);
  const OUT = new Set(["bpmn:Task", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:IntermediateCatchEvent", "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:StartEvent"]);
  if (tree.targetNamespace === undefined || tree.exporterVersion === undefined) throw Error(`${label}: Definitions defaults absent`);
  for (const p of tree.rootElements.filter(r => r.$type === "bpmn:Process")) {
    if (p.isExecutable !== false) throw Error(`${label}: ${p.id} isExecutable`);
    const nodes = p.flowElements ?? [], flows = nodes.filter(n => n.$type === "bpmn:SequenceFlow");
    for (const n of nodes) {
      const inc = flows.filter(f => f.targetRef === n.id).map(f => f.id).sort(), outg = flows.filter(f => f.sourceRef === n.id).map(f => f.id).sort();
      if (IN.has(n.$type) && jcs(n.incoming) !== jcs(inc)) throw Error(`${label}: ${n.id} incoming`);
      if (OUT.has(n.$type) && jcs(n.outgoing) !== jcs(outg)) throw Error(`${label}: ${n.id} outgoing`);
      if (["bpmn:ExclusiveGateway", "bpmn:ParallelGateway"].includes(n.$type)) {
        const every = [...nodes, ...tree.rootElements.flatMap(r => r.flowElements ?? [])].filter(f => f.$type === "bpmn:SequenceFlow");
        const i = new Set(every.filter(f => f.targetRef === n.id).map(f => f.id)).size, o = new Set(every.filter(f => f.sourceRef === n.id).map(f => f.id)).size;
        const want = i > 1 && o > 1 ? "Mixed" : i > 1 ? "Converging" : o > 1 ? "Diverging" : "Unspecified";
        if (n.gatewayDirection !== want) throw Error(`${label}: ${n.id} gatewayDirection`);
      }
      if (n.$type === "bpmn:DataObjectReference" && n.dataObjectRef === undefined) throw Error(`${label}: ${n.id} backing`);
      for (const a of n.dataInputAssociations ?? []) if (a.targetRef === undefined) throw Error(`${label}: ${a.id} port`);
    }
    const io = p.ioSpecification;
    if (io) for (const [items, sets, ref] of [[io.dataInputs ?? [], io.inputSets ?? [], "dataInputRefs"], [io.dataOutputs ?? [], io.outputSets ?? [], "dataOutputRefs"]]) {
      if (!sets.length) throw Error(`${label}: missing IO set`);
      for (const item of items) if (!sets.some(s => (s[ref] ?? []).includes(item.id))) throw Error(`${label}: uncovered ${item.id}`);
    }
  }
}
// ---------------------------------------------------------------- native literal builders (no defaults, no derivation)
const X = {
  defs: (id, rootElements, extra = {}) => ({ $type: "bpmn:Definitions", ...(id ? { id } : {}), targetNamespace: NS, exporterVersion: EXPORTER, rootElements, ...extra }),
  process: (id, name, parts = {}) => ({ $type: "bpmn:Process", id, name, isExecutable: false, ...parts }),
  task: (id, name, incoming, outgoing, extra = {}) => ({ $type: "bpmn:Task", id, name, incoming, outgoing, ...extra }),
  userTask: (id, name, incoming, outgoing, extra = {}) => ({ $type: "bpmn:UserTask", id, name, incoming, outgoing, ...extra }),
  call: (id, name, incoming, outgoing, extra = {}) => ({ $type: "bpmn:CallActivity", id, name, incoming, outgoing, ...extra }),
  start: (id, name, outgoing, extra = {}) => ({ $type: "bpmn:StartEvent", id, name, outgoing, ...extra }),
  end: (id, name, incoming, extra = {}) => ({ $type: "bpmn:EndEvent", id, name, incoming, ...extra }),
  xgw: (id, name, gatewayDirection, incoming, outgoing) => ({ $type: "bpmn:ExclusiveGateway", id, name, gatewayDirection, incoming, outgoing }),
  pgw: (id, name, gatewayDirection, incoming, outgoing) => ({ $type: "bpmn:ParallelGateway", id, name, gatewayDirection, incoming, outgoing }),
  flow: (id, sourceRef, targetRef, extra = {}) => ({ $type: "bpmn:SequenceFlow", id, sourceRef, targetRef, ...extra }),
  assoc: (id, sourceRef, targetRef, direction = "One") => ({ $type: "bpmn:Association", id, sourceRef, targetRef, ...(direction === null ? {} : { associationDirection: direction }) }),
  note: (id, text) => ({ $type: "bpmn:TextAnnotation", id, text }),
  doc: (text, textFormat = "text/plain") => ({ $type: "bpmn:Documentation", text, textFormat }),
  marker: (text = "external") => ({ $type: "bpmn:Documentation", text, textFormat: MARKER }),
  dstore: (id, name) => ({ $type: "bpmn:DataStore", id, name }),
  dsr: (id, dataStoreRef, name) => ({ $type: "bpmn:DataStoreReference", id, ...(name === undefined ? {} : { name }), ...(dataStoreRef === undefined ? {} : { dataStoreRef }) }),
  dobj: id => ({ $type: "bpmn:DataObject", id }),
  dor: (id, dataObjectRef, name) => ({ $type: "bpmn:DataObjectReference", id, ...(name === undefined ? {} : { name }), ...(dataObjectRef === undefined ? {} : { dataObjectRef }) }),
  dia: (id, sourceRef, targetRef) => ({ $type: "bpmn:DataInputAssociation", id, sourceRef, ...(targetRef === undefined ? {} : { targetRef }) }),
  doa: (id, sourceRef, targetRef) => ({ $type: "bpmn:DataOutputAssociation", id, ...(sourceRef === undefined ? {} : { sourceRef }), targetRef }),
  prop: id => ({ $type: "bpmn:Property", id }),
  io: (dataInputs, dataOutputs, inputSets, outputSets) => ({ $type: "bpmn:InputOutputSpecification", dataInputs, dataOutputs, ...(inputSets ? { inputSets } : {}), ...(outputSets ? { outputSets } : {}) }),
  din: (id, name) => ({ $type: "bpmn:DataInput", id, name }),
  dout: (id, name) => ({ $type: "bpmn:DataOutput", id, name }),
  iset: (id, dataInputRefs) => ({ $type: "bpmn:InputSet", id, ...(dataInputRefs ? { dataInputRefs } : {}) }),
  oset: (id, dataOutputRefs) => ({ $type: "bpmn:OutputSet", id, ...(dataOutputRefs ? { dataOutputRefs } : {}) }),
  collab: (id, name, participants) => ({ $type: "bpmn:Collaboration", id, name, participants }),
  participant: (id, name, processRef) => ({ $type: "bpmn:Participant", id, name, ...(processRef === undefined ? {} : { processRef }) }),
  laneSet: (id, name, lanes) => ({ $type: "bpmn:LaneSet", id, name, lanes }),
  lane: (id, name, flowNodeRef) => ({ $type: "bpmn:Lane", id, name, ...(flowNodeRef === undefined ? {} : { flowNodeRef }) }),
};
// Allocated support identities (DESIGN L284-L286); the stable keys are the role names.
const SUPPORT = (definitionsId, processId) => ({
  collaboration: stableId(definitionsId, "collaboration", processId, `collaboration for ${processId}`),
  main: stableId(processId, "main-participant", "main-participant", `main participant for ${processId}`),
  laneSet: stableId(processId, "lane-set", "lane-set", `lane set for ${processId}`),
  lane: stableId(processId, "external-lane", "external-lane", `external lane for ${processId}`),
  band: stableId(processId, "reference-band", "reference-band", `reference band for ${processId}`),
});
const ROLE_OF = { collaboration: "collaboration", main: "main-participant", laneSet: "lane-set", lane: "external-lane", band: "reference-band" };
const supportBindings = (processId, idsOf, roles = ["collaboration", "main", "laneSet", "lane", "band"]) => roles.map(role => binding(processId, ROLE_OF[role], idsOf[role]));

const RETAINED = "retained";
const QUALIFICATION = "qualification";
const fe = (p, i, rest = "") => `/rootElements/${p}/flowElements/${i}${rest}`;
const topologyOf = at2 => [REF("c-topology-incoming", at2, "incoming"), REF("c-topology-outgoing", at2, "outgoing")];

// ================================================================ GROUP identity (DESIGN §3.2)
{
  // First-seal keys restored (U+E000 and U+00A0 had been folded by a rewrite of this
  // helper); the decomposed twin of the precomposed U+00E9 key makes the NFC and NFD
  // claims observable, and NFKC also merges NBSP and space. ASCII source, braced escapes.
  const allocations = [
    { key: "cl\u{E9}-\u{E000}", owner: "Process_A", slot: "task" },
    { key: "cle\u{301}-\u{E000}", owner: "Process_A", slot: "task" },
    { key: "cl\u{E9}-\u{10000}", owner: "Process_A", slot: "task" },
    { key: " padded ", owner: "Process_A", slot: "task" },
    { key: "padded", owner: "Process_A", slot: "task" },
    { key: "a\u{A0}b", owner: "Process_A", slot: "task" },
    { key: "a b", owner: "Process_A", slot: "task" },
    { key: "root", owner: "document-root/1", slot: "definitions" },
  ];
  addCase({ caseId: "l3-id-stable-vectors", group: "identity", clause: clause("§3.2", 276, 282), cites: [clause("§3.1", 260, 264)],
    discriminates: "Fails an allocator that trims keys (merging ' padded '/'padded'), Unicode-normalizes them (NFC or NFD merges the precomposed U+00E9 and decomposed e+U+0301 keys, NFKC also NBSP and space), escapes non-ASCII as \\u sequences before hashing, or hashes a tuple other than [\"profile-mechanism/1\",owner,slot,key]." },
  { operation: "stable-id/1", inputArtifacts: [artifact("allocations", allocations)], expectedStatus: "ok",
    expectedArtifacts: [artifact("ids", allocations.map(a => stableId(a.owner, a.slot, a.key, `vector ${a.owner}/${a.slot}`)))], comparatorIds: ["stable-id/1", "node-crypto", "python-hashlib"] });
}
{
  const rawProcess = { $type: "bpmn:Process", name: "Intake", flowElements: [{ $type: "bpmn:Task", name: "Review" }, { $type: "bpmn:Task", name: "Approve" }], artifacts: [{ $type: "bpmn:TextAnnotation", text: "Check twice" }] };
  const rawStore = { $type: "bpmn:DataStore", name: "Archive" };
  const defsId = stableId("document-root/1", "definitions", "root", "missing Definitions");
  const procId = birth(defsId, "bpmn:Definitions.rootElements", rawProcess, 0, "missing Process Intake");
  const storeId = birth(defsId, "bpmn:Definitions.rootElements", rawStore, 0, "missing DataStore Archive");
  const reviewId = birth(procId, "bpmn:Process.flowElements", rawProcess.flowElements[0], 0, "missing Task Review");
  const approveId = birth(procId, "bpmn:Process.flowElements", rawProcess.flowElements[1], 0, "missing Task Approve");
  const noteId = birth(procId, "bpmn:Process.artifacts", rawProcess.artifacts[0], 0, "missing TextAnnotation");
  const input = envelope("main", { $type: "bpmn:Definitions", targetNamespace: NS, exporterVersion: EXPORTER, rootElements: [rawProcess, rawStore] });
  const tree = { $type: "bpmn:Definitions", id: defsId, targetNamespace: NS, exporterVersion: EXPORTER, rootElements: [
    { $type: "bpmn:Process", id: procId, name: "Intake", isExecutable: false, flowElements: [X.task(reviewId, "Review", [], []), X.task(approveId, "Approve", [], [])],
      artifacts: [X.note(noteId, "Check twice")] },
    X.dstore(storeId, "Archive")] };
  checkComplete(tree, "id-root-first");
  SHARED.rootFirstIn = input;
  SHARED.rootFirst = envelope("main", tree);
  cnCase({ caseId: "l3-id-root-first", group: "identity", clause: clause("§3.2", 284, 292), cites: [clause("§7.1", 542), clause("§2.5", 252), clause("§10.1", 764)],
    discriminates: "Fails an implementation that allocates children before the Definitions root (wrong owner domain), hashes content after stamping isExecutable or empty topology arrays, uses an undecorated containment name instead of the descriptor-qualified slot, gives the DataStore and Process one shared ordinal, or reports allocated IDs with exact instead of generated result provenance." },
  { operation: "complete", input, expected: SHARED.rootFirst, changes: [A(""), A("/rootElements/0"), A(fe(0, 0)), A(fe(0, 1)), A("/rootElements/0/artifacts/0"), A("/rootElements/1"),
    SET("complete-process", "/rootElements/0", "isExecutable"), ...topologyOf(fe(0, 0)), ...topologyOf(fe(0, 1))] });
}
{
  const rawSame = { $type: "bpmn:Task", name: "Same", documentation: [X.doc("Evidence")] };
  const id0 = birth("Process_A", "bpmn:Process.flowElements", rawSame, 0, "identical sibling ordinal 0");
  const id1 = birth("Process_A", "bpmn:Process.flowElements", rawSame, 1, "identical sibling ordinal 1");
  assertEq(id0, "g_86194e34f4b60bdd32455891cd64bfd11d52479237a2f0e3213e7ce9a3f1caf8", "lot-0 sibling ordinal 0");
  const input = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "Siblings", { flowElements: [clone(rawSame), clone(rawSame)] })]));
  const tree = X.defs("Definitions_cn", [X.process("Process_A", "Siblings", { flowElements: [
    { ...X.task(id0, "Same", [], []), documentation: [X.doc("Evidence")] }, { ...X.task(id1, "Same", [], []), documentation: [X.doc("Evidence")] }] })]);
  checkComplete(tree, "siblings");
  SHARED.siblings = envelope("main", tree);
  cnCase({ caseId: "l3-id-identical-siblings", group: "identity", clause: clause("§3.2", 292), cites: [clause("§3.2", 288)],
    discriminates: "Fails an allocator that omits the duplicate ordinal (both siblings collide or receive one ID), counts ordinals across the whole document, or orders ordinals by anything other than the original containment array; the IDs equal the lot-0 sealed sibling vectors." },
  { operation: "complete", input, expected: SHARED.siblings, changes: [A(fe(0, 0)), ...topologyOf(fe(0, 0)), A(fe(0, 1)), ...topologyOf(fe(0, 1))] });
  const swapped = clone(tree); swapped.rootElements[0].flowElements.reverse();
  const reordered = envelope("main", swapped);
  cnCase({ caseId: "l3-id-reorder-stable", group: "identity", clause: clause("§3.2", 292), cites: [clause("§7.1", 536), clause("§7.3", 569)],
    discriminates: "Fails an implementation that recomputes duplicate ordinals from current array positions (swapping the two surviving IDs) or reports any change for an already completed, reordered tree." },
  { operation: "complete", input: reordered, expected: reordered });
  const renamed = clone(tree); renamed.rootElements[0].flowElements[0].name = "Changed label";
  const renamedEnvelope = envelope("main", renamed);
  cnCase({ caseId: "l3-id-rename-stable", group: "identity", clause: clause("§3.2", 284), cites: [clause("§3.2", 292), clause("§7.1", 536)],
    discriminates: "Fails an implementation that re-derives content-signature IDs for surviving nodes after a label edit; the birth signature is used once only." },
  { operation: "complete", input: renamedEnvelope, expected: renamedEnvelope });
}
{
  // Harmonization D3: the duplicate ordinal counts ID-missing siblings only; an
  // ID-bearing sibling with the same content never shifts it (DESIGN L292).
  const raw = { $type: "bpmn:Task", name: "Same" };
  const m0 = birth("Process_A", "bpmn:Process.flowElements", raw, 0, "missing sibling beside an ID-bearing twin, ordinal 0");
  const m1 = birth("Process_A", "bpmn:Process.flowElements", raw, 1, "missing sibling beside an ID-bearing twin, ordinal 1");
  const input = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "Ordinals", { flowElements: [{ $type: "bpmn:Task", id: "Task_Same", name: "Same" }, clone(raw), clone(raw)] })]));
  const tree = X.defs("Definitions_cn", [X.process("Process_A", "Ordinals", { flowElements: [X.task("Task_Same", "Same", [], []), X.task(m0, "Same", [], []), X.task(m1, "Same", [], [])] })]);
  checkComplete(tree, "ordinal missing only");
  cnCase({ caseId: "l3-id-ordinal-missing-only", group: "identity", clause: clause("§3.2", 292), cites: [clause("§3.2", 288)],
    discriminates: "Fails an allocator that counts the ID-bearing sibling with the same content in the duplicate ordinal (the two missing IDs would use ordinals 1 and 2), or that rewrites the existing Task_Same ID." },
  { operation: "complete", input, expected: envelope("main", tree), changes: [...topologyOf(fe(0, 0)), A(fe(0, 1)), ...topologyOf(fe(0, 1)), A(fe(0, 2)), ...topologyOf(fe(0, 2))] });
}
{
  const raw = { $type: "bpmn:Task", name: "Same" };
  const a = birth("Process_A", "bpmn:Process.flowElements", raw, 0, "same task under Process_A");
  const b = birth("Process_B", "bpmn:Process.flowElements", raw, 0, "same task under Process_B");
  const input = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "First", { flowElements: [clone(raw)] }), X.process("Process_B", "Second", { flowElements: [clone(raw)] })]));
  const tree = X.defs("Definitions_cn", [X.process("Process_A", "First", { flowElements: [X.task(a, "Same", [], [])] }), X.process("Process_B", "Second", { flowElements: [X.task(b, "Same", [], [])] })]);
  checkComplete(tree, "two-owners");
  cnCase({ caseId: "l3-id-two-owners", group: "identity", clause: clause("§3.2", 292), cites: [clause("§3.2", 284)],
    discriminates: "Fails an allocator that scopes duplicate ordinals per document instead of per ownerId and containment property (the second task would get ordinal 1)." },
  { operation: "complete", input, expected: envelope("main", tree), changes: [A(fe(0, 0)), ...topologyOf(fe(0, 0)), A(fe(1, 0)), ...topologyOf(fe(1, 0))] });
}
{
  // Eight byte-distinct names: raw source text, no Unicode normalization (L260), so
  // every birth signature differs, every duplicate ordinal is 0 and the eight stable
  // keys and IDs differ (L292). The ordinal is computed, never a literal. The source
  // stays ASCII (braced escapes): an earlier rewrite folded U+E000, U+00A0 and U+2028.
  const names = ["Gestion \u{10000}", "Gestion \u{E000}", "Gestion\u{A0}", "Gestion ", "Ligne\u{2028}suivante", "Gestion\u{85}", "Gestion \u{E9}", "Gestion e\u{301}"];
  const raws = names.map(name => ({ $type: "bpmn:Task", name }));
  const idsOut = raws.map((raw, i) => birth("Process_A", "bpmn:Process.flowElements", raw, duplicateOrdinal(raws, i), `unicode name ${i}`));
  if (new Set(names).size !== names.length || new Set(idsOut).size !== names.length) throw Error("unicode names: distinct content must give distinct IDs");
  const input = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "Unicode", { flowElements: raws.map(clone) })]));
  const tree = X.defs("Definitions_cn", [X.process("Process_A", "Unicode", { flowElements: names.map((name, i) => X.task(idsOut[i], name, [], [])) })]);
  checkComplete(tree, "unicode");
  cnCase({ caseId: "l3-id-unicode-names", group: "identity", clause: clause("§3.2", 292), cites: [clause("§3.1", 260, 262), clause("§14.3", 967)],
    discriminates: "Fails an implementation that Unicode-normalizes (NFC or NFD merges the precomposed U+00E9 and decomposed e+U+0301 names, NFKC also NBSP and space), trims (NBSP, trailing space, U+0085) or line-splits (U+2028, U+0085) names before hashing, escapes U+E000/U+10000 in JCS, rewrites the stored names, or numbers duplicate ordinals across siblings of different content (the eight signatures differ, so every ordinal is 0 and the eight IDs differ)." },
  { operation: "complete", input, expected: envelope("main", tree), changes: names.flatMap((_, i) => [A(fe(0, i)), ...topologyOf(fe(0, i))]) });
}
{
  const raw = { $type: "bpmn:IntermediateCatchEvent", name: "Wait", eventDefinitions: [{ $type: "bpmn:TimerEventDefinition", timeDuration: { $type: "bpmn:FormalExpression", body: "PT1H" } }] };
  const e0 = birth("Process_A", "bpmn:Process.flowElements", raw, 0, "timer sibling ordinal 0");
  const e1 = birth("Process_A", "bpmn:Process.flowElements", raw, 1, "timer sibling ordinal 1");
  const t0 = birth(e0, "bpmn:IntermediateCatchEvent.eventDefinitions", raw.eventDefinitions[0], 0, "timer definition under sibling 0");
  const t1 = birth(e1, "bpmn:IntermediateCatchEvent.eventDefinitions", raw.eventDefinitions[0], 0, "timer definition under sibling 1");
  const ev = (id, timer) => ({ $type: "bpmn:IntermediateCatchEvent", id, name: "Wait", eventDefinitions: [{ $type: "bpmn:TimerEventDefinition", id: timer, timeDuration: { $type: "bpmn:FormalExpression", body: "PT1H" } }], incoming: [], outgoing: [] });
  const input = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "Timers", { flowElements: [clone(raw), clone(raw)] })]));
  const tree = X.defs("Definitions_cn", [X.process("Process_A", "Timers", { flowElements: [ev(e0, t0), ev(e1, t1)] })]);
  checkComplete(tree, "timers");
  SHARED.timers = envelope("main", tree);
  cnCase({ caseId: "l3-id-timer-siblings", group: "identity", clause: clause("§3.2", 288, 292), cites: [clause("§6.5", 528), clause("§7.3", 571)],
    discriminates: "Fails an implementation that assigns an ID to the ID-less FormalExpression, derives the timer definition owner from the Process instead of its own event, or uses one ordinal sequence for both timer definitions." },
  { operation: "complete", input, expected: SHARED.timers, changes: [0, 1].flatMap(i => [A(fe(0, i)), A(fe(0, i, "/eventDefinitions/0")), ...topologyOf(fe(0, i))]) });
  const swapped = clone(tree); swapped.rootElements[0].flowElements.reverse();
  const reordered = envelope("main", swapped);
  cnCase({ caseId: "l3-id-timer-reorder", group: "identity", clause: clause("§3.2", 292), cites: [clause("§7.3", 569, 571)],
    discriminates: "Fails an implementation that reallocates timer siblings or their definitions after a reorder, or reports changes on a completed tree." },
  { operation: "complete", input: reordered, expected: reordered });
}
{
  const fresh = { $type: "bpmn:Task", name: "Fresh" };
  const taken = birth("Process_A", "bpmn:Process.flowElements", fresh, 0, "computed ID already occupied");
  const input = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "Collision", { flowElements: [clone(fresh), X.task(taken, "Occupant", [], [])] })]));
  cnCase({ caseId: "l3-id-collision-computed", group: "identity", clause: clause("§3.2", 288), cites: [clause("§7.3", 569)],
    discriminates: "Fails an implementation that suffixes, overwrites or reidentifies when a computed stable-id/1 value is already used by a different object, commits a partial completion, or reports a refusal without the echoed identity and the empty diagnostics/report." },
  { operation: "complete", input, refusal: "id-collision" });
  const twice = envelope("main", X.defs("Definitions_cn", [X.process("Process_A", "Duplicate", { flowElements: [X.task("Task_Twice", "One", [], []), X.task("Task_Twice", "Two", [], [])] })]));
  cnCase({ caseId: "l3-id-duplicate-source", group: "identity", clause: clause("§3.2", 290), cites: [clause("§10.2", 781)],
    discriminates: "Fails an implementation that keeps the last duplicate, renames one of them or completes the document instead of refusing duplicate source IDs structurally." },
  { operation: "complete", input: twice, refusal: "id-collision" });
}

// ================================================================ GROUP completion (DESIGN §7.1)
{
  const neutralTree = isExecutable => ({ $type: "bpmn:Definitions", id: "Definitions_A", targetNamespace: "urn:neutral:1", rootElements: [{ $type: "bpmn:Process", id: "Process_A", name: "Source",
    ...(isExecutable === undefined ? {} : { isExecutable }), flowElements: [{ $type: "bpmn:Task", id: "Task_A", name: "Task" }] }] });
  for (const [key, value, caseId] of [["neutral", false, "l3-c-isexecutable-neutral"], ["grid", true, "l3-c-isexecutable-grid"]]) {
    cnCase({ caseId, group: "completion", clause: clause("§7.1", 538), cites: [clause("§7.1", 543)],
      discriminates: `Paired with the other neutral profile: fails a library that hard-codes the private completion default instead of executing the injected complete recipe (this profile writes isExecutable=${value}).` },
    { operation: "complete", profile: key, input: envelope(key, neutralTree()), expected: envelope(key, neutralTree(value)), changes: [SET("complete-process", "/rootElements/0", "isExecutable")] });
  }
  // The lot-0 neutral profile has no topology or gateway policy: stale references stay.
  const control = done => ({ $type: "bpmn:Definitions", id: "Definitions_A", targetNamespace: "urn:neutral:1", rootElements: [{ $type: "bpmn:Process", id: "Process_A", name: "Control",
    ...(done ? { isExecutable: false } : {}), flowElements: [{ $type: "bpmn:Task", id: "Task_A", name: "Work" },
      { $type: "bpmn:ExclusiveGateway", id: "Gateway_G", name: "Route", incoming: [], outgoing: [] },
      { $type: "bpmn:SequenceFlow", id: "Flow_1", sourceRef: "Task_A", targetRef: "Gateway_G" }] }] });
  cnCase({ caseId: "l3-c-gateway-direction-control", group: "completion", clause: clause("§7.1", 538), cites: [clause("§7.1", 544)],
    discriminates: "With the lot-0 neutral profile, which declares no topology or gateway recipe, fails a library that hard-codes topology repair (Gateway_G.incoming would become [Flow_1]) or stamps a gateway direction instead of executing only the injected recipes." },
  { operation: "complete", profile: "neutral", input: envelope("neutral", control(false)), expected: envelope("neutral", control(true)), changes: [SET("complete-process", "/rootElements/0", "isExecutable")] });
  const empty = envelope("main", X.defs("Definitions_cn", [{ $type: "bpmn:Process", id: "Process_Empty", name: "Empty" }]));
  const emptyDone = envelope("main", X.defs("Definitions_cn", [X.process("Process_Empty", "Empty")]));
  cnCase({ caseId: "l3-c-empty-process", group: "completion", clause: clause("§7.1", 543), cites: [clause("§7.2", 552)],
    discriminates: "Fails an implementation that skips empty processes, invents boundary events or activities, or lets C create structural supports (supports belong to N)." },
  { operation: "complete", input: empty, expected: emptyDone, changes: [SET("complete-process", "/rootElements/0", "isExecutable")] });
}
{
  const before = X.defs("Definitions_cn", [
    X.process("Process_A", "Topology", { flowElements: [
      X.start("Start_A", "Begin", ["Flow_2", "Flow_1"]), X.task("Task_1", "First", [], ["Flow_2"]), X.task("Task_2", "Second", ["Flow_2"], ["Flow_3"]),
      { $type: "bpmn:EndEvent", id: "End_A", name: "Finish" },
      X.flow("Flow_1", "Start_A", "Task_1"), X.flow("Flow_2", "Task_1", "Task_2"), X.flow("Flow_3", "Task_2", "End_A")] }),
    X.process("Process_B", "Elsewhere", { flowElements: [X.task("Task_B", "Remote", [], ["Flow_X"]), X.flow("Flow_X", "Task_B", "Task_1")] })]);
  const after = clone(before);
  after.rootElements[0].flowElements[0].outgoing = ["Flow_1"];
  after.rootElements[0].flowElements[1].incoming = ["Flow_1"];
  after.rootElements[0].flowElements[3].incoming = ["Flow_3"];
  checkComplete(after, "topology");
  SHARED.topologyIn = envelope("main", before); SHARED.topology = envelope("main", after);
  cnCase({ caseId: "l3-c-topology", group: "completion", clause: clause("§7.1", 544), cites: [clause("§2.2", 112), clause("§2.4", 166)],
    discriminates: "Fails an implementation that keeps stale or document-ordered incoming/outgoing arrays, merges the cross-container Flow_X into Task_1.incoming, retargets the invalid SequenceFlow instead of leaving it unchanged, or omits the absent-to-present End_A.incoming write." },
  { operation: "complete", input: SHARED.topologyIn, expected: SHARED.topology,
    changes: [REF("c-topology-outgoing", fe(0, 0), "outgoing"), REF("c-topology-incoming", fe(0, 1), "incoming"), REF("c-topology-incoming", fe(0, 3), "incoming")] });
}
const gatewayGraph = ({ split, mixed, join, pass, mixedIncoming = ["Flow_04", "Flow_05"] }) => X.defs("Definitions_cn", [X.process("Process_G", "Gateways", { flowElements: [
  X.start("Start_G", "Begin", ["Flow_01"]),
  { $type: "bpmn:ParallelGateway", id: "Gateway_Split", name: "Split", ...(split === undefined ? {} : { gatewayDirection: split }), incoming: ["Flow_01"], outgoing: ["Flow_02", "Flow_03"] },
  X.task("Task_A", "Branch A", ["Flow_02"], ["Flow_04"]), X.task("Task_B", "Branch B", ["Flow_03"], ["Flow_05"]),
  X.xgw("Gateway_Mixed", "Route", mixed, mixedIncoming, ["Flow_06", "Flow_07"]),
  X.task("Task_C", "Branch C", ["Flow_06"], ["Flow_08"]), X.task("Task_D", "Branch D", ["Flow_07"], ["Flow_09"]),
  X.xgw("Gateway_Join", "Join", join, ["Flow_08", "Flow_09"], ["Flow_10"]),
  X.xgw("Gateway_Pass", "Pass", pass, ["Flow_10"], ["Flow_11"]),
  X.end("End_G", "Finish", ["Flow_11"]),
  X.flow("Flow_01", "Start_G", "Gateway_Split"), X.flow("Flow_02", "Gateway_Split", "Task_A"), X.flow("Flow_03", "Gateway_Split", "Task_B"),
  X.flow("Flow_04", "Task_A", "Gateway_Mixed"), X.flow("Flow_05", "Task_B", "Gateway_Mixed"), X.flow("Flow_06", "Gateway_Mixed", "Task_C"),
  X.flow("Flow_07", "Gateway_Mixed", "Task_D"), X.flow("Flow_08", "Task_C", "Gateway_Join"), X.flow("Flow_09", "Task_D", "Gateway_Join"),
  X.flow("Flow_10", "Gateway_Join", "Gateway_Pass"), X.flow("Flow_11", "Gateway_Pass", "End_G")] })]);
{
  const done = gatewayGraph({ split: "Diverging", mixed: "Mixed", join: "Converging", pass: "Unspecified" });
  checkComplete(done, "gateways");
  SHARED.gateways = envelope("main", done);
  cnCase({ caseId: "l3-c-gateway-direction", group: "completion", clause: clause("§7.1", 544), cites: [clause("§2.1", 79)],
    discriminates: "Fails an implementation that treats the moddle default of an absent gatewayDirection as present, keeps an existing wrong direction, uses a threshold of one instead of more than one, or rewrites the already correct Converging join." },
  { operation: "complete", input: envelope("main", gatewayGraph({ mixed: "Converging", join: "Converging", pass: "Diverging" })), expected: SHARED.gateways,
    changes: [SET("c-gateway-diverging", fe(0, 1), "gatewayDirection"), SET("c-gateway-mixed", fe(0, 4), "gatewayDirection"), SET("c-gateway-unspecified", fe(0, 8), "gatewayDirection")] });
  const staleTree = gatewayGraph({ split: "Diverging", mixed: "Converging", join: "Converging", pass: "Unspecified", mixedIncoming: ["Flow_04"] });
  cnCase({ caseId: "l3-c-gateway-stale-topology", group: "completion", clause: clause("§2.5", 252), cites: [clause("§7.1", 544), clause("§2.4", 176)],
    discriminates: "With direction counted from sequence flows, a stale incoming array is repaired and the direction is Mixed in one bounded run; fails an implementation that derives the direction from the stale stored array or needs a second pass." },
  { operation: "complete", input: envelope("main", staleTree), expected: SHARED.gateways, changes: [REF("c-topology-incoming", fe(0, 4), "incoming"), SET("c-gateway-mixed", fe(0, 4), "gatewayDirection")] });
  cnCase({ caseId: "l3-c-gateway-phase-start", group: "completion", clause: clause("§2.4", 176), cites: [clause("§2.5", 252), clause("§7.3", 569)],
    discriminates: "The variant profile counts stored incoming references, so its first run sets Diverging from the phase-start snapshot and the bounded second evaluation sees Mixed; fails an implementation that lets one sibling read another sibling's writes (would return Mixed), retries without bound, or commits the non-fixed point." },
  { operation: "complete", profile: "stale", input: envelope("stale", staleTree), refusal: "normalization-not-fixed" });
}
{
  const before = X.defs("Definitions_cn", [X.process("Process_A", "Items", { flowElements: [
    X.dor("DataObjectReference_New", undefined, "Order form"), X.dor("DataObjectReference_Old", "DataObject_Old", "Archive copy"), X.dobj("DataObject_Old"),
    X.dsr("DataStoreReference_Orphan", undefined, "Ledger")] }), X.dstore("DataStore_Ledger", "Ledger")]);
  const backing = stableId("Process_A", "item-backing", "DataObjectReference_New", "backing DataObject");
  const after = clone(before);
  after.rootElements[0].flowElements.push(X.dobj(backing));
  after.rootElements[0].flowElements[0].dataObjectRef = backing;
  checkComplete(after, "items");
  cnCase({ caseId: "l3-c-item-backing", group: "completion", clause: clause("§7.1", 545), cites: [clause("§2.4", 163)],
    discriminates: "Fails an implementation that replaces or re-creates the valid backing of DataObjectReference_Old, reuses the first DataObject, keys the new backing by name or position, infers dataStoreRef for the orphan reference from the equal DataStore name, or reports the created backing with an input source pointer." },
  { operation: "complete", input: envelope("main", before), expected: envelope("main", after), changes: [CREATE("c-item-backing", fe(0, 4)), REF("c-item-backing", fe(0, 0), "dataObjectRef")] });
}
{
  const task = (associations, properties) => X.task("Task_Check", "Check", [], [], { properties, dataInputAssociations: associations, dataOutputAssociations: [X.doa("DOA_1", undefined, "DataObjectReference_X")] });
  const items = [X.dor("DataObjectReference_X", "DataObject_X"), X.dobj("DataObject_X"), X.dor("DataObjectReference_Y", "DataObject_Y"), X.dobj("DataObject_Y"), X.dor("DataObjectReference_Z", "DataObject_Z"), X.dobj("DataObject_Z")];
  const before = X.defs("Definitions_cn", [X.process("Process_A", "Ports", { flowElements: [...items,
    task([X.dia("DIA_2", ["DataObjectReference_Y"]), X.dia("DIA_1", ["DataObjectReference_X"]), X.dia("DIA_3", ["DataObjectReference_Z"], "Property_Existing")], [X.prop("Property_Existing")])] })]);
  const port1 = stableId("Task_Check", "input-port", "DIA_1", "input port for DIA_1"), port2 = stableId("Task_Check", "input-port", "DIA_2", "input port for DIA_2");
  const after = X.defs("Definitions_cn", [X.process("Process_A", "Ports", { flowElements: [...items,
    task([X.dia("DIA_2", ["DataObjectReference_Y"], port2), X.dia("DIA_1", ["DataObjectReference_X"], port1), X.dia("DIA_3", ["DataObjectReference_Z"], "Property_Existing")],
      [X.prop("Property_Existing"), X.prop(port1), X.prop(port2)])] })]);
  checkComplete(after, "ports");
  SHARED.ports = envelope("main", after);
  cnCase({ caseId: "l3-c-input-ports", group: "completion", clause: clause("§7.1", 546), cites: [clause("§7.1", 536), clause("§2.4", 158), clause("§10.1", 766)],
    discriminates: "Fails a first-port shortcut (both associations share one port), ports keyed by array position or created in array order (DIA_2 first), replacement of the valid Property_Existing target, creation of the missing DOA_1 output source port without an accepted code-creation authority, or generated ports reported without generated coordinates." },
  { operation: "complete", input: envelope("main", before), expected: SHARED.ports,
    changes: [CREATE("c-input-port", fe(0, 6, "/properties/1")), CREATE("c-input-port", fe(0, 6, "/properties/2")),
      REF("c-input-port", fe(0, 6, "/dataInputAssociations/0"), "targetRef"), REF("c-input-port", fe(0, 6, "/dataInputAssociations/1"), "targetRef")] });
}
{
  const before = X.defs("Definitions_cn", [X.process("Process_A", "Interface", { ioSpecification: X.io([X.din("DataInput_b", "B"), X.din("DataInput_a", "A")], [X.dout("DataOutput_1", "Result")]) })]);
  // Explicit ownerId (Definitions_cn) differs from the nearest containing node (Process_A).
  const inSet = stableId("Definitions_cn", "input-set", "Process_A", "default input set, explicit Definitions owner"), outSet = stableId("Definitions_cn", "output-set", "Process_A", "default output set, explicit Definitions owner");
  const after = X.defs("Definitions_cn", [X.process("Process_A", "Interface", { ioSpecification: X.io([X.din("DataInput_b", "B"), X.din("DataInput_a", "A")], [X.dout("DataOutput_1", "Result")],
    [X.iset(inSet, ["DataInput_a", "DataInput_b"])], [X.oset(outSet, ["DataOutput_1"])]) })]);
  checkComplete(after, "sets-default");
  SHARED.setsDefault = envelope("main", after);
  cnCase({ caseId: "l3-c-sets-default", group: "completion", clause: clause("§7.1", 547), cites: [clause("§3.2", 284), clause("§2.2", 123)],
    discriminates: "Fails an implementation that copies document order [b,a] instead of the selector ID order, allocates the sets under the nearest containing Process instead of the explicit Definitions ownerId (forbidden owner inference), or omits the default sets." },
  { operation: "complete", input: envelope("main", before), expected: SHARED.setsDefault,
    changes: [CREATE("c-io-input-default", "/rootElements/0/ioSpecification/inputSets/0"), REF("c-io-input-default", "/rootElements/0/ioSpecification/inputSets/0", "dataInputRefs"),
      CREATE("c-io-output-default", "/rootElements/0/ioSpecification/outputSets/0"), REF("c-io-output-default", "/rootElements/0/ioSpecification/outputSets/0", "dataOutputRefs")] });
  const io = (inputSets, inputs = ["DataInput_b", "DataInput_c", "DataInput_a"]) => X.defs("Definitions_cn", [X.process("Process_A", "Interface", {
    ioSpecification: X.io(inputs.map(id => X.din(id, id.slice(-1).toUpperCase())), [X.dout("DataOutput_1", "Result")], inputSets, [X.oset("OutputSet_1", ["DataOutput_1"])]) })]);
  cnCase({ caseId: "l3-c-sets-single-uncovered", group: "completion", clause: clause("§7.1", 547), cites: [clause("§2.4", 166), clause("§2.4", 176)],
    discriminates: "Fails an implementation that rebuilds the set in ID order (moving DataInput_b), appends the uncovered inputs in document order [c, a] instead of canonical ID order [a, c], or creates a second default set beside the existing one." },
  { operation: "complete", input: envelope("main", io([X.iset("InputSet_1", ["DataInput_b"])])), expected: envelope("main", io([X.iset("InputSet_1", ["DataInput_b", "DataInput_a", "DataInput_c"])])),
    changes: [REF("c-io-input-uncovered-single", "/rootElements/0/ioSpecification/inputSets/0", "dataInputRefs")] });
  const several = io([X.iset("InputSet_1", ["DataInput_a"]), X.iset("InputSet_2", ["DataInput_b"])], ["DataInput_a", "DataInput_b", "DataInput_c"]);
  cnCase({ caseId: "l3-c-sets-several-uncovered", group: "completion", clause: clause("§7.1", 547), cites: [clause("§16", 1154), clause("§2.4", 172)],
    discriminates: "Fails an implementation that silently updates the first input set (or any set) when several sets exist and DataInput_c is uncovered; the whole completion refuses atomically." },
  { operation: "complete", input: envelope("main", several), refusal: "io-set-selection-required" });
  const covered = envelope("main", io([X.iset("InputSet_1", ["DataInput_a"]), X.iset("InputSet_2", ["DataInput_b", "DataInput_c"])], ["DataInput_a", "DataInput_b", "DataInput_c"]));
  cnCase({ caseId: "l3-c-sets-several-covered", group: "completion", clause: clause("§7.1", 547), cites: [clause("§7.1", 536)],
    discriminates: "Fails an implementation that merges, reorders or re-creates sets once every input is covered by an explicit selection; the second set membership must be preserved untouched." },
  { operation: "complete", input: covered, expected: covered });
}
{
  const tree = X.defs("Definitions_cn", [X.process("Process_P", "Preserve", {
    ioSpecification: X.io([X.din("DataInput_P", "Request")], [X.dout("DataOutput_P", "Decision")], [X.iset("InputSet_P1", ["DataInput_P"]), X.iset("InputSet_P2", ["DataInput_P"])], [X.oset("OutputSet_P", ["DataOutput_P"])]),
    flowElements: [
      X.start("Start_P", "Start", ["Flow_P1"]),
      X.userTask("UserTask_Review", "Review", ["Flow_P1"], ["Flow_P2"], { documentation: [X.doc("  Source\u{A0}bytes\r\n\tkept  "), X.doc("{\"looks\":\"json\"}")],
        properties: [X.prop("Property_R")], dataInputAssociations: [X.dia("DIA_R", ["DataObjectReference_R"], "Property_R")] }),
      X.end("End_P", "Done", ["Flow_P2"]),
      X.flow("Flow_P1", "Start_P", "UserTask_Review"),
      X.flow("Flow_P2", "UserTask_Review", "End_P", { conditionExpression: { $type: "bpmn:FormalExpression", body: "amount > 100", language: "text/x-expression" } }),
      X.dor("DataObjectReference_R", "DataObject_R"), X.dobj("DataObject_R")] })]);
  checkComplete(tree, "preserve");
  const e = envelope("main", tree);
  cnCase({ caseId: "l3-c-preserve", group: "completion", clause: clause("§7.1", 536), cites: [clause("§7.1", 548), clause("§4", 341)],
    discriminates: "Fails an implementation that downgrades UserTask to Task, drops or rewrites the condition expression, normalizes the Documentation whitespace/NBSP/CRLF, parses JSON-looking text without a declared textFormat, rebuilds the two overlapping input sets, or replaces the valid port." },
  { operation: "complete", input: e, expected: e });
}
{
  const tree = () => X.defs("Definitions_cn", [{ $type: "bpmn:Process", id: "Process_W", name: "Writes" }]);
  cnCase({ caseId: "l3-c-write-conflict", group: "completion", clause: clause("§2.4", 176), cites: [clause("§2.5", 252)],
    discriminates: "The variant profile adds a sibling complete recipe writing isExecutable=true; fails a last-writer-wins or declaration-order winner implementation instead of refusing profile-write-conflict atomically." },
  { operation: "complete", profile: "conflict", input: envelope("conflict", tree()), refusal: "profile-write-conflict" });
  cnCase({ caseId: "l3-c-write-coalesce", group: "completion", clause: clause("§2.4", 176), cites: [clause("§10.1", 751)],
    discriminates: "The variant profile adds an identical sibling write; fails an implementation that refuses identical writes as a conflict, reports two change entries for one coalesced write, or attributes it to the second recipe instead of the first planning recipe." },
  { operation: "complete", profile: "coalesce", input: envelope("coalesce", tree()), expected: envelope("coalesce", X.defs("Definitions_cn", [X.process("Process_W", "Writes")])),
    changes: [SET("complete-process", "/rootElements/0", "isExecutable")] });
}
{
  const before = { $type: "bpmn:Definitions", id: "Definitions_ns", rootElements: [X.process("Process_A", "Defaults")] };
  cnCase({ caseId: "l3-c-namespace-defaults", group: "completion", clause: clause("§5.1", 434), cites: [clause("§7.1", 542)],
    discriminates: "Fails an implementation that leaves required generated Definitions defaults absent or stamps values other than the profile's declared namespace and base-contract version." },
  { operation: "complete", input: envelope("main", before), expected: envelope("main", { ...clone(before), targetNamespace: NS, exporterVersion: EXPORTER }),
    changes: [SET("c-definitions-namespace", "", "targetNamespace"), SET("c-definitions-exporter", "", "exporterVersion")] });
  const dangling = X.defs("Definitions_cn", [X.process("Process_A", "Dangling", { flowElements: [X.start("Start_D", "Start", ["Flow_D1"]),
    X.call("Call_D", "Remote", ["Flow_D1"], ["Flow_D2"], { calledElement: "Process_Missing" }), X.end("End_D", "End", ["Flow_D2"]),
    X.flow("Flow_D1", "Start_D", "Call_D"), X.flow("Flow_D2", "Call_D", "End_D")] })]);
  cnCase({ caseId: "l3-c-dangling-call", group: "completion", clause: clause("§4.1", 378), cites: [clause("§2.2", 132)],
    discriminates: "Fails an implementation that treats an unresolved nonempty calledElement as absent (incomplete call) or as an external call, or completes the document instead of refusing the dangling reference at the graph index." },
  { operation: "complete", input: envelope("main", dangling), refusal: "reference-dangling" });
}
{
  // Refusals ordered before any C write (harmonization C1, DESIGN §3.3 L296, §7.1 L542).
  const tree = X.defs("Definitions_cn", [X.process("Process_A", "Versions", { flowElements: [{ $type: "bpmn:Task", name: "Untouched" }] })]);
  const main = PROFILES.main.identity;
  const older = { ...clone(main), version: "1.0.0", sha256: PREVIOUS_MAIN_IDENTITY };
  cnCase({ caseId: "l3-c-version-mismatch-first", group: "completion", clause: clause("§3.3", 317, 319), cites: [clause("§3.3", 298), clause("§7.1", 542)],
    discriminates: "A document stored under the older minor 1.0.0 of the same profile, whose source package is not available to C: fails an implementation that allocates the missing Task ID or stamps defaults before the compatibility row, or that accepts a minor difference as compatible." },
  { operation: "complete", input: envelopeWith(older, tree), refusal: "profile-source-unavailable" });
  const decoy = { ...clone(main), sha256: H({ decoy: "same profile id and version, another package" }) };
  cnCase({ caseId: "l3-c-digest-mismatch-first", group: "completion", clause: clause("§3.3", 314), cites: [clause("§3.3", 298), clause("§7.1", 542)],
    discriminates: "Same profile ID and version with a known unequal digest: fails an implementation that completes the document, waives the conflict, or reports profile-source-unavailable instead of the identity conflict." },
  { operation: "complete", input: envelopeWith(decoy, tree), refusal: "profile-digest-mismatch" });
  const unknownVersion = { ...envelope("main", tree), documentVersion: "2" };
  cnCase({ caseId: "l3-c-document-version", group: "completion", clause: clause("§3.3", 302), cites: [clause("§10.1", 735)],
    discriminates: "Fails an implementation that reads an unknown envelope documentVersion as version 1, completes it, or fabricates profileIdentity/baseRevision in the refusal (an unknown documentVersion echoes neither)." },
  { operation: "complete", input: unknownVersion, refusal: "document-version-unsupported", echo: false });
  const foreign = X.defs("Definitions_cn", [X.process("Process_A", "Foreign", { flowElements: [{ ...X.task("Task_F", "Painted", [], []), color: "#ff0000" }] })]);
  cnCase({ caseId: "l3-c-descriptor-role-unknown", group: "completion", clause: clause("§3.1", 266), cites: [clause("§2.5", 252)],
    discriminates: "Fails an implementation that drops, keeps or completes around a member the descriptors do not classify, instead of refusing descriptor-role-unknown at the graph index before C." },
  { operation: "complete", input: envelope("main", foreign), refusal: "descriptor-role-unknown" });
  cnCase({ caseId: "l3-c-invalid-mode", group: "completion", clause: clause("§7.1", 536), cites: [clause("§2.5", 232)],
    discriminates: "The mode vocabulary is closed (extraction, retained); fails an implementation that accepts draft as a third mode or treats it as retained instead of refusing operation-error." },
  { operation: "complete", input: SHARED.rootFirstIn, refusal: "operation-error", mode: "draft" });
}
{
  // Extraction checks every present member against the ai actor (harmonization B7).
  const raw = { $type: "bpmn:Definitions", rootElements: [{ $type: "bpmn:Process", name: "Extracted", flowElements: [{ $type: "bpmn:Task", name: "Draft task" }] }] };
  const defsId = stableId("document-root/1", "definitions", "root", "extracted Definitions");
  const procId = birth(defsId, "bpmn:Definitions.rootElements", raw.rootElements[0], 0, "extracted Process");
  const taskId = birth(procId, "bpmn:Process.flowElements", raw.rootElements[0].flowElements[0], 0, "extracted Task");
  const done = { $type: "bpmn:Definitions", id: defsId, rootElements: [{ $type: "bpmn:Process", id: procId, name: "Extracted", flowElements: [X.task(taskId, "Draft task", [], [])], isExecutable: false }],
    targetNamespace: NS, exporterVersion: EXPORTER };
  checkComplete(done, "extraction");
  cnCase({ caseId: "l3-c-extraction-authorized", group: "completion", clause: clause("§7.1", 536), cites: [clause("§2.4.1", 214), clause("§2.4.1", 216)],
    discriminates: "The variant grants the ai actor exactly the four authored fields; fails an implementation that refuses authorized extraction content, checks C's own code writes against the ai actor, or skips identity allocation for extracted content." },
  { operation: "complete", profile: "extraction", input: envelope("extraction", raw), expected: envelope("extraction", done), mode: "extraction",
    changes: [A(""), A("/rootElements/0"), A(fe(0, 0)), SET("c-definitions-namespace", "", "targetNamespace"), SET("c-definitions-exporter", "", "exporterVersion"),
      SET("complete-process", "/rootElements/0", "isExecutable"), ...topologyOf(fe(0, 0))] });
  cnCase({ caseId: "l3-c-extraction-unauthorized", group: "completion", clause: clause("§7.1", 536), cites: [clause("§2.4.1", 214), clause("§2.4.1", 191)],
    discriminates: "Under the main profile no field admits the ai actor; fails an implementation that ignores the extraction mode, treats it as retained content, or completes before refusing profile-producer." },
  { operation: "complete", input: envelope("main", raw), refusal: "profile-producer", mode: "extraction" });
}
{
  // OPEN-IO gate on a C fill of an absent DataOutputAssociation.sourceRef (H2).
  const tree = withPort => X.defs("Definitions_cn", [X.process("Process_A", "Outputs", { flowElements: [
    X.task("Task_Make", "Make", [], [], { ...(withPort ? { properties: [X.prop(withPort)] } : {}),
      dataOutputAssociations: [X.doa("DOA_Out", withPort ? [withPort] : undefined, "DataObjectReference_O")] }),
    X.dor("DataObjectReference_O", "DataObject_O"), X.dobj("DataObject_O")] })]);
  checkComplete(tree(), "outport input");
  cnCase({ caseId: "l3-c-output-port-gated", group: "completion", clause: clause("§7.1", 546), cites: [clause("§13", 920), clause("§16", 1154)],
    discriminates: "In edit activation the missing-output-source producer exception is gated; fails an implementation that creates the port, commits the DataOutputAssociation.sourceRef fill, or refuses with another code than profile-open." },
  { operation: "complete", profile: "outport", input: envelope("outport", tree()), refusal: "profile-open" });
  const port = stableId("Task_Make", "output-port", "DOA_Out", "output port for DOA_Out");
  cnCase({ caseId: "l3-c-output-port-qualification", group: "completion", clause: clause("§7.1", 546), cites: [clause("§13", 920), clause("§7.2", 554)],
    discriminates: "Neutral qualification exercises the gated exception: fails an implementation that keys the output port by position or by the activity alone, reuses an input port, or refuses in qualification." },
  { operation: "complete", profile: "outport", input: envelope("outport", tree()), expected: envelope("outport", tree(port)), activation: QUALIFICATION,
    changes: [CREATE("c-output-port", fe(0, 0, "/properties/0")), REF("c-output-port", fe(0, 0, "/dataOutputAssociations/0"), "sourceRef")] });
}

// ================================================================ GROUP normalization (DESIGN §7.2, §5.2)
const S_A = SUPPORT("Definitions_support", "Process_A");
const S_B = SUPPORT("Definitions_support", "Process_B");
const collaborationOf = (idsOf, processId, withBand) => X.collab(idsOf.collaboration, "collaboration", [X.participant(idsOf.main, "main-participant", processId), ...(withBand ? [X.participant(idsOf.band, "reference-band")] : [])]);
const supportLaneSet = (idsOf, members) => [X.laneSet(idsOf.laneSet, "lane-set", [X.lane(idsOf.lane, "external-lane", members)])];
// Written locations of a support creation run (DESIGN L284, L573): Collaboration,
// main Participant and its processRef, band, LaneSet, reserved Lane, membership.
const SUPPORT_CHANGES = (collabIndex, processIndex, { band = true, lane = true, members = true } = {}) => [
  ENSURE("n-structure", `/rootElements/${collabIndex}`), ENSURE("n-structure", `/rootElements/${collabIndex}/participants/0`),
  REF("n-structure", `/rootElements/${collabIndex}/participants/0`, "processRef"),
  ...(band ? [ENSURE("n-reference-band", `/rootElements/${collabIndex}/participants/1`)] : []),
  ...(lane ? [ENSURE("n-external-lane", `/rootElements/${processIndex}/laneSets/0`), ENSURE("n-external-lane", `/rootElements/${processIndex}/laneSets/0/lanes/0`)] : []),
  ...(lane && members ? [REF("n-external-membership", `/rootElements/${processIndex}/laneSets/0/lanes/0`, "flowNodeRef")] : [])];
const fullProcess = ({ laneSets, extraArtifacts = [] } = {}) => X.process("Process_A", "Order handling", {
  ...(laneSets ? { laneSets } : {}),
  ioSpecification: X.io([X.din("DataInput_Order", "Order")], [X.dout("DataOutput_Invoice", "Invoice")], [X.iset("InputSet_A", ["DataInput_Order"])], [X.oset("OutputSet_A", ["DataOutput_Invoice"])]),
  flowElements: [
    X.start("StartEvent_A", "Order received", ["Flow_1"]),
    X.task("Task_Check", "Check order", ["Flow_1"], ["Flow_2"], { properties: [X.prop("Property_Check_in")], dataInputAssociations: [X.dia("DIA_Order", ["DataInput_Order"], "Property_Check_in")] }),
    X.task("Task_Bill", "Bill customer", ["Flow_2"], ["Flow_3"], { properties: [X.prop("Property_Bill_out")], dataOutputAssociations: [X.doa("DOA_Invoice", ["Property_Bill_out"], "DataOutput_Invoice")] }),
    X.end("EndEvent_A", "Order closed", ["Flow_3"]),
    X.call("Call_Customer", "Customer", [], [], { documentation: [X.doc("Partner system"), X.marker()] }),
    X.dsr("DataStoreReference_Catalog", "DataStore_Catalog"),
    X.flow("Flow_1", "StartEvent_A", "Task_Check"), X.flow("Flow_2", "Task_Check", "Task_Bill"), X.flow("Flow_3", "Task_Bill", "EndEvent_A")],
  artifacts: [X.assoc("Assoc_Trigger", "Call_Customer", "StartEvent_A"), X.assoc("Assoc_Supply", "Call_Customer", "DataInput_Order"),
    X.assoc("Assoc_Consume", "DataOutput_Invoice", "Call_Customer"), X.assoc("Assoc_Ref", "DataStoreReference_Catalog", "Task_Check"), ...extraArtifacts] });
const fullPlacements = (referenceRelated = ["Assoc_Ref"], referenceAnchor = "Assoc_Ref") => placements([
  placement("Call_Customer", "Process_A", "external", ["Assoc_Consume", "Assoc_Supply", "Assoc_Trigger"]),
  placement("DataInput_Order", "Process_A", "external-io", ["Assoc_Supply", "DIA_Order"], "DIA_Order"),
  placement("DataOutput_Invoice", "Process_A", "external-io", ["Assoc_Consume", "DOA_Invoice"], "DOA_Invoice"),
  placement("DataStoreReference_Catalog", "Process_A", "reference-band", referenceRelated, referenceAnchor)]);
{
  const before = X.defs("Definitions_support", [fullProcess(), X.dstore("DataStore_Catalog", "Catalog")]);
  checkComplete(before, "n-full input");
  const after = X.defs("Definitions_support", [fullProcess({ laneSets: supportLaneSet(S_A, ["Call_Customer"]) }), X.dstore("DataStore_Catalog", "Catalog"), collaborationOf(S_A, "Process_A", true)]);
  SHARED.fullIn = envelope("main", before);
  SHARED.full = envelope("main", after, supportBindings("Process_A", S_A));
  SHARED.fullPlacements = fullPlacements();
  SHARED.fullRun = cnCase({ caseId: "l3-n-full", group: "normalization", clause: clause("§7.2", 558, 565), cites: [clause("§3.2", 284, 286), clause("§5.2", 438), clause("§2.4", 176), clause("§2.4.1", 218), clause("§10.1", 764)],
    discriminates: "Fails an implementation that creates supports unconditionally or by label, allocates them outside stable-id/1, coalesces nothing (two Collaborations), places the DataStoreReference outside the bound band, writes Process IO into Lane.flowNodeRef, picks a non-minimal anchor, reorders the call's Documentation, emits unsorted placements, or reports the coalesced Collaboration ensure twice or under n-reference-band." },
  { operation: "normalize", input: SHARED.fullIn, expected: SHARED.full, changes: SUPPORT_CHANGES(2, 0), placementsList: SHARED.fullPlacements, activation: QUALIFICATION });
  cnCase({ caseId: "l3-n-full-edit", group: "normalization", clause: clause("§7.2", 554), cites: [clause("§13", 917), clause("§16", 1160)],
    discriminates: "Edit activation of the same input: the first effective change is the Collaboration creation, gated by OPEN-RESERVED-N; fails an implementation that creates supports in edit, refuses with another code, or commits part of the run." },
  { operation: "normalize", input: SHARED.fullIn, refusal: "profile-open" });
}
{
  const before = X.defs("Definitions_support", [fullProcess({ extraArtifacts: [X.assoc("Assoc_A_Ref", "DataStoreReference_Catalog", "Task_Bill")] }), X.dstore("DataStore_Catalog", "Catalog")]);
  const after = X.defs("Definitions_support", [fullProcess({ laneSets: supportLaneSet(S_A, ["Call_Customer"]), extraArtifacts: [X.assoc("Assoc_A_Ref", "DataStoreReference_Catalog", "Task_Bill")] }),
    X.dstore("DataStore_Catalog", "Catalog"), collaborationOf(S_A, "Process_A", true)]);
  cnCase({ caseId: "l3-n-inserted-link", group: "normalization", clause: clause("§4.4", 410), cites: [clause("§7.2", 563), clause("§7.3", 571)],
    discriminates: "An inserted reference link with a lower ID becomes the anchor and joins the related set while every support keeps the l3-n-full identity; fails an implementation that caches the previous anchor, drops the extra use link, or reallocates supports after an association insertion." },
  { operation: "normalize", input: envelope("main", before), expected: envelope("main", after, supportBindings("Process_A", S_A)), changes: SUPPORT_CHANGES(2, 0),
    placementsList: fullPlacements(["Assoc_A_Ref", "Assoc_Ref"], "Assoc_A_Ref"), activation: QUALIFICATION });
}
const salesProcess = () => X.process("Process_A", "Sales", { flowElements: [X.start("Start_SA", "Request", ["Flow_SA1"]), X.task("Task_SA", "Quote", ["Flow_SA1"], ["Flow_SA2"]), X.end("End_SA", "Quoted", ["Flow_SA2"]),
  X.flow("Flow_SA1", "Start_SA", "Task_SA"), X.flow("Flow_SA2", "Task_SA", "End_SA"), X.dsr("DataStoreReference_SA", "DataStore_Shared")], artifacts: [X.assoc("Assoc_RefSA", "DataStoreReference_SA", "Task_SA")] });
const billingProcess = () => X.process("Process_B", "Billing", { flowElements: [X.start("Start_SB", "Quote accepted", ["Flow_SB1"]), X.task("Task_SB", "Invoice", ["Flow_SB1"], ["Flow_SB2"]), X.end("End_SB", "Invoiced", ["Flow_SB2"]),
  X.flow("Flow_SB1", "Start_SB", "Task_SB"), X.flow("Flow_SB2", "Task_SB", "End_SB"), X.dsr("DataStoreReference_SB", "DataStore_Shared", "Stock partagé (copie locale)")],
  artifacts: [X.assoc("Assoc_RefSB", "DataStoreReference_SB", "Task_SB")] });
{
  const before = X.defs("Definitions_support", [salesProcess(), billingProcess(), X.dstore("DataStore_Shared", "Stock partagé")]);
  checkComplete(before, "n-two input");
  const after = X.defs("Definitions_support", [salesProcess(), billingProcess(), X.dstore("DataStore_Shared", "Stock partagé"), collaborationOf(S_A, "Process_A", true), collaborationOf(S_B, "Process_B", true)]);
  SHARED.twoIn = envelope("main", before);
  SHARED.two = envelope("main", after, [...supportBindings("Process_A", S_A, ["collaboration", "main", "band"]), ...supportBindings("Process_B", S_B, ["collaboration", "main", "band"])]);
  SHARED.twoPlacements = placements([placement("DataStoreReference_SA", "Process_A", "reference-band", ["Assoc_RefSA"], "Assoc_RefSA"),
    placement("DataStoreReference_SB", "Process_B", "reference-band", ["Assoc_RefSB"], "Assoc_RefSB")]);
  SHARED.twoRun = cnCase({ caseId: "l3-n-two-processes", group: "normalization", clause: clause("§3.2", 286), cites: [clause("§4.4", 408), clause("§5.2", 438), clause("§7.2", 558)],
    discriminates: "Fails an implementation that shares one Collaboration between processes, allocates both under one ownerId domain, deduplicates the shared store's references by title, synchronizes the local reference name with the store name, or attaches a band to the wrong owner." },
  { operation: "normalize", input: SHARED.twoIn, expected: SHARED.two, changes: [...SUPPORT_CHANGES(3, 0, { lane: false }), ...SUPPORT_CHANGES(4, 1, { lane: false })],
    placementsList: SHARED.twoPlacements, activation: QUALIFICATION });
}
const importedProcess = ({ extMembers = [], clerkMembers = ["Task_Log"] } = {}) => X.process("Process_A", "Intake", {
  laneSets: [X.laneSet("LaneSet_Imported", "Lanes", [X.lane("Lane_Ext_Imported", "Outside parties", extMembers), X.lane("Lane_Clerk", "Clerk", clerkMembers)])],
  flowElements: [X.start("Start_I", "Request", ["Flow_I1"]), X.task("Task_Log", "Log request", ["Flow_I1"], ["Flow_I2"]), X.end("End_I", "Logged", ["Flow_I2"]),
    X.flow("Flow_I1", "Start_I", "Task_Log"), X.flow("Flow_I2", "Task_Log", "End_I"),
    X.call("Call_Partner", "Partner", [], [], { documentation: [X.marker()] }), X.dsr("DataStoreReference_Policy", "DataStore_Policy")],
  artifacts: [X.assoc("Assoc_PartnerTrigger", "Call_Partner", "Start_I"), X.assoc("Assoc_PolicyRef", "DataStoreReference_Policy", "Task_Log")] });
const importedTree = options => X.defs("Definitions_import", [importedProcess(options), X.dstore("DataStore_Policy", "Policy"),
  X.collab("Collaboration_Imported", "Imported collaboration", [X.participant("Participant_Main_Imported", "Intake pool", "Process_A"), X.participant("Participant_Band_Imported", "Reference documents")])]);
const importedBindings = [binding("Process_A", "collaboration", "Collaboration_Imported"), binding("Process_A", "external-lane", "Lane_Ext_Imported"),
  binding("Process_A", "lane-set", "LaneSet_Imported"), binding("Process_A", "main-participant", "Participant_Main_Imported"), binding("Process_A", "reference-band", "Participant_Band_Imported")];
const importedPlacements = () => placements([placement("Call_Partner", "Process_A", "external", ["Assoc_PartnerTrigger"]),
  placement("DataStoreReference_Policy", "Process_A", "reference-band", ["Assoc_PolicyRef"], "Assoc_PolicyRef")]);
{
  checkComplete(importedTree(), "n-imported input");
  SHARED.importedIn = envelope("main", importedTree(), importedBindings);
  SHARED.imported = envelope("main", importedTree({ extMembers: ["Call_Partner"] }), importedBindings);
  SHARED.importedPlacements = importedPlacements();
  cnCase({ caseId: "l3-n-imported-supports", group: "normalization", clause: clause("§5.2", 440), cites: [clause("§7.2", 559), clause("§4", 338), clause("§7.3", 571)],
    discriminates: "Fails an implementation that re-creates generated supports beside correctly bound imported ones, renames reused supports to the ensure field literals, reorders the business lanes, removes the clerk membership, or reports the membership write with generated instead of exact coordinates." },
  { operation: "normalize", input: SHARED.importedIn, expected: SHARED.imported, changes: [REF("n-external-membership", "/rootElements/0/laneSets/0/lanes/0", "flowNodeRef")],
    placementsList: SHARED.importedPlacements, activation: QUALIFICATION });
  cnCase({ caseId: "l3-n-imported-supports-edit", group: "normalization", clause: clause("§7.2", 559), cites: [clause("§4.1", 364), clause("§13", 910)],
    discriminates: "Edit activation: reuse of every bound support is never gated, but the external-lane membership append is the external branch of N (OPEN-EXTERNAL); fails an implementation that appends in edit or reports a support conflict instead of profile-open." },
  { operation: "normalize", input: SHARED.importedIn, refusal: "profile-open" });
  const refusalInput = envelope("main", importedTree({ clerkMembers: ["Task_Log", "Call_Partner"] }), importedBindings);
  cnCase({ caseId: "l3-n-business-lane-refusal", group: "normalization", clause: clause("§4.4", 410), cites: [clause("§7.2", 559), clause("§16", 1146)],
    discriminates: "The external call sits in the unbound business lane and no accepted persisted responsibility representation exists: in qualification the library responsibility check refuses the removal; fails an implementation that removes that membership (moving the call), leaves the call in two lanes, or commits any support change." },
  { operation: "normalize", input: refusalInput, refusal: "responsibility-preservation-required", activation: QUALIFICATION });
  cnCase({ caseId: "l3-n-business-lane-refusal-edit", group: "normalization", clause: clause("§7.2", 559), cites: [clause("§13", 914), clause("§16", 1146)],
    discriminates: "Edit activation: the removal of an existing Lane.flowNodeRef member is gated by OPEN-SHARING before the responsibility check; fails an implementation that answers responsibility-preservation-required or relocates the call in edit." },
  { operation: "normalize", input: refusalInput, refusal: "profile-open" });
  const conflict = (mutate, caseId, discriminates) => {
    const tree = importedTree(); const bindings = clone(importedBindings);
    mutate(tree, bindings);
    cnCase({ caseId, group: "normalization", clause: clause("§5.2", 438, 440), cites: [clause("§5.1", 430), clause("§7.3", 573)], discriminates },
    { operation: "normalize", input: envelope("main", tree, bindings), refusal: "support-binding-conflict" });
  };
  conflict((tree, bindings) => { bindings.push(binding("Process_A", "collaboration", "Participant_Band_Imported")); }, "l3-n-binding-duplicate-role",
    "Fails an implementation that accepts two bindings for one owner and role (first or last wins) instead of refusing support-binding-conflict at envelope integrity, before any plan or gate.");
  conflict(tree => {
    tree.rootElements[2].participants.pop();
    tree.rootElements.push(X.collab("Collaboration_Other", "Other", [X.participant("Participant_Band_Imported", "Reference documents")]));
  }, "l3-n-binding-wrong-parent", "Fails an implementation that accepts a bound band whose parent is not the bound collaboration, or silently moves it into the bound collaboration.");
  conflict(tree => { tree.rootElements[2].participants[1].processRef = "Process_A"; }, "l3-n-binding-band-process-ref",
    "Fails an implementation that accepts a bound reference band carrying processRef (a band is a black-box Participant) or strips the reference silently.");
  conflict((tree, bindings) => { bindings.find(b => b.role === "external-lane").targetId = "Task_Log"; }, "l3-n-binding-wrong-type",
    "Fails an implementation that accepts an external-lane binding targeting a Task, or replaces the target by creating a new lane.");
}
{
  const poolTree = withPool => X.defs("Definitions_support", [
    X.process("Process_A", "Order handling", { flowElements: [X.start("Start_P", "Start", ["Flow_P1"]), X.task("Task_P", "Pack", ["Flow_P1"], ["Flow_P2"]), X.end("End_P", "Packed", ["Flow_P2"]),
      X.flow("Flow_P1", "Start_P", "Task_P"), X.flow("Flow_P2", "Task_P", "End_P"), X.dsr("DataStoreReference_P", "DataStore_P")], artifacts: [X.assoc("Assoc_RefP", "DataStoreReference_P", "Task_P")] }),
    X.dstore("DataStore_P", "Manual"),
    X.collab("Collaboration_Legacy", "collaboration", withPool),
  ]);
  const legacy = [X.participant("Participant_Legacy_Main", "main-participant", "Process_A"), X.participant("Participant_Pool", "reference-band")];
  const after = clone(poolTree(legacy)); after.rootElements.push(collaborationOf(S_A, "Process_A", true));
  cnCase({ caseId: "l3-n-black-box-pool-retained", group: "normalization", clause: clause("§5.2", 440, 442), cites: [clause("§13", 915), clause("§7.2", 558)],
    discriminates: "Without trusted bindings, fails an implementation that adopts the unbound collaboration, its main-named participant or the reference-band-named black-box pool by label or structure; N creates its own bound supports and retains the ordinary pool unchanged." },
  { operation: "normalize", input: envelope("main", poolTree(legacy)), expected: envelope("main", after, supportBindings("Process_A", S_A, ["collaboration", "main", "band"])),
    changes: SUPPORT_CHANGES(3, 0, { lane: false }), placementsList: placements([placement("DataStoreReference_P", "Process_A", "reference-band", ["Assoc_RefP"], "Assoc_RefP")]), activation: QUALIFICATION });
  const occupied = envelope("main", poolTree([X.participant(S_A.band, "Unrelated occupant")]));
  cnCase({ caseId: "l3-n-hash-shaped-occupant", group: "normalization", clause: clause("§5.2", 440), cites: [clause("§3.2", 288), clause("§7.3", 573)],
    discriminates: "An unbound participant already holds the exact band allocator ID; fails an implementation that reuses it because the ID is hash-shaped, suffixes the band ID, or commits the collaboration and main participant planned before the late collision." },
  { operation: "normalize", input: occupied, refusal: "id-collision", activation: QUALIFICATION });
  cnCase({ caseId: "l3-n-hash-shaped-occupant-edit", group: "normalization", clause: clause("§7.2", 554), cites: [clause("§13", 917)],
    discriminates: "Edit activation of the same input: the gated Collaboration creation precedes the late band collision in recipe order; fails an implementation that reports id-collision first or evaluates every recipe before applying the first gate." },
  { operation: "normalize", input: occupied, refusal: "profile-open" });
}
{
  const callTree = (call, extraRoots = [], extraArtifacts = []) => X.defs("Definitions_support", [
    X.process("Process_A", "Calls", { flowElements: [X.start("Start_K", "Start", ["Flow_K1"]), X.task("Task_K", "Work", ["Flow_K1"], ["Flow_K2"]), X.end("End_K", "End", ["Flow_K2"]),
      X.flow("Flow_K1", "Start_K", "Task_K"), X.flow("Flow_K2", "Task_K", "End_K"), call], ...(extraArtifacts.length ? { artifacts: extraArtifacts } : {}) }), ...extraRoots]);
  // Process IDs in selector (UTF-16 ID) order; each gets only its Collaboration and main Participant.
  const structureOnly = (caseId, tree, discriminates, cites, processIds = ["Process_A"]) => {
    checkComplete(tree, caseId);
    const after = clone(tree), changes = [];
    let bindings = [];
    processIds.forEach((pid, k) => {
      const idsOf = SUPPORT("Definitions_support", pid);
      after.rootElements.push(collaborationOf(idsOf, pid, false));
      changes.push(...SUPPORT_CHANGES(tree.rootElements.length + k, 0, { band: false, lane: false }));
      bindings = [...bindings, ...supportBindings(pid, idsOf, ["collaboration", "main"])];
    });
    cnCase({ caseId, group: "normalization", clause: clause("§4.1", 381, 383), cites, discriminates },
    { operation: "normalize", input: envelope("main", tree), expected: envelope("main", after, bindings), changes, placementsList: [], activation: QUALIFICATION });
  };
  structureOnly("l3-n-incomplete-call-untouched", callTree(X.call("Call_Draft", "Draft call", [], []), [], [X.assoc("Assoc_DraftTrigger", "Call_Draft", "Start_K")]),
    "Fails an implementation that gives a targetless unmarked call an external lane, membership, placement or reversal even though a descriptive Association links it to the start event.",
    [clause("§4", 344), clause("§16", 1140)]);
  structureOnly("l3-n-internal-call-untouched", callTree(X.call("Call_Sub", "Sub-process", [], [], { calledElement: "Process_Sub" }), [X.process("Process_Sub", "Sub-process body")]),
    "Fails an implementation that moves an internal call (calledElement resolving to an in-document Process) to the external lane or skips the collaboration of the called empty process.",
    [clause("§4", 342), clause("§4.1", 376)], ["Process_A", "Process_Sub"]);
  structureOnly("l3-n-legacy-marker-ignored", callTree(X.call("Call_Legacy", "Billing", [], [], { documentation: [X.doc("external")] }), [],
    [X.note("Note_Legacy", "[Legacy call] Billing"), X.assoc("Assoc_Note", "Note_Legacy", "Call_Legacy", "None")]),
    "Fails an implementation that classifies a call as external from Documentation text without the configured textFormat, from an annotation prefix, or from any other legacy marker.",
    [clause("§4.1", 366), clause("§5.3", 452)]);
}
{
  const tree = X.defs("Definitions_support", [X.process("Process_E", "Empty")]);
  const S_E = SUPPORT("Definitions_support", "Process_E");
  cnCase({ caseId: "l3-n-empty-process", group: "normalization", clause: clause("§7.2", 558), cites: [clause("§9.4", 725), clause("§14.3", 967)],
    discriminates: "Fails an implementation that skips an empty process or creates an external lane, lane set or reference band without a recognized need." },
  { operation: "normalize", input: envelope("main", tree), expected: envelope("main", X.defs("Definitions_support", [X.process("Process_E", "Empty"), collaborationOf(S_E, "Process_E", false)]),
    supportBindings("Process_E", S_E, ["collaboration", "main"])), changes: SUPPORT_CHANGES(1, 0, { band: false, lane: false }), placementsList: [], activation: QUALIFICATION });
}
{
  const tree = X.defs("Definitions_support", [X.process("Process_A", "Roles", {
    laneSets: [X.laneSet("LaneSet_Business", "Roles", [X.lane("Lane_Ops", "Operations (renamed)", ["Task_2"]), X.lane("Lane_Sales", "Sales", ["Task_1"])]), ...supportLaneSet(S_A, undefined)],
    flowElements: [X.start("Start_R", "Start", ["Flow_R1"]), X.task("Task_1", "Sell", ["Flow_R1"], ["Flow_R2"]), X.task("Task_2", "Ship", ["Flow_R2"], ["Flow_R3"]), X.end("End_R", "End", ["Flow_R3"]),
      X.flow("Flow_R1", "Start_R", "Task_1"), X.flow("Flow_R2", "Task_1", "Task_2"), X.flow("Flow_R3", "Task_2", "End_R")] }), collaborationOf(S_A, "Process_A", false)]);
  checkComplete(tree, "roles");
  const e = envelope("main", tree, supportBindings("Process_A", S_A, ["collaboration", "main", "laneSet", "lane"]));
  cnCase({ caseId: "l3-n-roles-and-empty-support", group: "normalization", clause: clause("§7.2", 565), cites: [clause("§4", 338), clause("§7.3", 571)],
    discriminates: "Edit activation with only bound supports to reuse (never gated): business lanes were reordered and renamed and the bound external lane is empty; fails an implementation that sorts or re-labels lanes, garbage-collects the empty bound support, gates a reuse, or reports any change." },
  { operation: "normalize", input: e, expected: e, placementsList: [] });
}
{
  const tree = X.defs("Definitions_support", [X.process("Process_A", "Partners", {
    laneSets: [X.laneSet(S_A.laneSet, "lane-set", [X.lane(S_A.lane, "Partners", ["Call_Partner"])])],
    flowElements: [X.start("Start_X", "Request", ["Flow_X1"]), X.task("Task_X", "Answer", ["Flow_X1"], ["Flow_X2"]), X.end("End_X", "Answered", ["Flow_X2"]),
      X.flow("Flow_X1", "Start_X", "Task_X"), X.flow("Flow_X2", "Task_X", "End_X"), X.call("Call_Partner", "Partner", [], [], { documentation: [X.marker()] })],
    artifacts: [X.assoc("Assoc_X", "Call_Partner", "Start_X")] }), collaborationOf(S_A, "Process_A", false)]);
  checkComplete(tree, "renamed lane");
  const e = envelope("main", tree, supportBindings("Process_A", S_A, ["collaboration", "main", "laneSet", "lane"]));
  cnCase({ caseId: "l3-n-reserved-lane-renamed", group: "normalization", clause: clause("§5.2", 438), cites: [clause("§2.4", 164), clause("§7.3", 571)],
    discriminates: "The generated reserved lane was renamed by the user: reuse validates type, parent, owner relationship and single binding only (harmonization C5); fails an implementation that compares the declared ensure field and refuses support-binding-conflict, renames the lane back, or creates a second lane." },
  { operation: "normalize", input: e, expected: e, placementsList: placements([placement("Call_Partner", "Process_A", "external", ["Assoc_X"])]) });
}
{
  const tree = X.defs("Definitions_support", [X.process("Process_A", "Shared item", { flowElements: [
    X.start("Start_S", "Start", ["Flow_S1"]),
    X.task("Task_1", "Read", ["Flow_S1"], ["Flow_S2"], { properties: [X.prop("Property_1")], dataInputAssociations: [X.dia("DIA_b", ["DataObjectReference_Doc"], "Property_1")] }),
    X.task("Task_2", "Check", ["Flow_S2"], ["Flow_S3"], { properties: [X.prop("Property_2")], dataInputAssociations: [X.dia("DIA_a", ["DataObjectReference_Doc"], "Property_2")] }),
    X.task("Task_3", "Update", ["Flow_S3"], ["Flow_S4"], { properties: [X.prop("Property_3")], dataOutputAssociations: [X.doa("DOA_z", ["Property_3"], "DataObjectReference_Doc")] }),
    X.end("End_S", "End", ["Flow_S4"]),
    X.flow("Flow_S1", "Start_S", "Task_1"), X.flow("Flow_S2", "Task_1", "Task_2"), X.flow("Flow_S3", "Task_2", "Task_3"), X.flow("Flow_S4", "Task_3", "End_S"),
    X.dor("DataObjectReference_Doc", "DataObject_Doc", "Dossier"), X.dobj("DataObject_Doc")] }), collaborationOf(S_A, "Process_A", false)]);
  checkComplete(tree, "shared item");
  const e = envelope("main", tree, supportBindings("Process_A", S_A, ["collaboration", "main"]));
  cnCase({ caseId: "l3-n-shared-item-anchor", group: "normalization", clause: clause("§4.4", 410), cites: [clause("§2.4.1", 218), clause("§7.2", 563, 565)],
    discriminates: "Fails an implementation that anchors to the first association in document order (DIA_b), to the producer DOA_z, or omits one of the three related associations; the tree itself is unchanged." },
  { operation: "normalize", input: e, expected: e, placementsList: placements([placement("DataObjectReference_Doc", "Process_A", "item", ["DIA_a", "DIA_b", "DOA_z"], "DIA_a")]) });
  // Both consuming associations deleted: the anchor falls back to the producing one.
  const removed = clone(tree);
  delete removed.rootElements[0].flowElements[1].dataInputAssociations;
  delete removed.rootElements[0].flowElements[2].dataInputAssociations;
  const r = envelope("main", removed, supportBindings("Process_A", S_A, ["collaboration", "main"]));
  cnCase({ caseId: "l3-n-anchor-after-link-removal", group: "normalization", clause: clause("§4.4", 410), cites: [clause("§2.4.1", 218), clause("§7.3", 571)],
    discriminates: "After both consuming associations of the shared item were deleted, fails an implementation that keeps a cached consuming anchor, keeps deleted associations in the related set, or leaves the item unanchored instead of falling back to the producing DOA_z." },
  { operation: "normalize", input: r, expected: r, placementsList: placements([placement("DataObjectReference_Doc", "Process_A", "item", ["DOA_z"], "DOA_z")]) });
}
{
  const reverseProcess = ({ artifacts, laneSets }) => X.process("Process_A", "Directions", {
    ...(laneSets ? { laneSets } : {}),
    ioSpecification: X.io([X.din("DataInput_R", "Request")], [], [X.iset("InputSet_R", ["DataInput_R"])], [X.oset("OutputSet_R")]),
    flowElements: [X.start("Start_R", "Start", ["Flow_R1"]),
      X.task("Task_R", "Handle", ["Flow_R1"], ["Flow_R2"], { properties: [X.prop("Property_R")], dataInputAssociations: [X.dia("DIA_R", ["DataInput_R"], "Property_R")] }),
      X.end("End_R", "End", ["Flow_R2"]), X.flow("Flow_R1", "Start_R", "Task_R"), X.flow("Flow_R2", "Task_R", "End_R"),
      X.call("Call_Party", "Party", [], [], { documentation: [X.marker()] }), X.dsr("DataStoreReference_R", "DataStore_R")],
    artifacts });
  const before = X.defs("Definitions_support", [reverseProcess({ artifacts: [X.assoc("Assoc_In", "Start_R", "Call_Party", "None"), X.assoc("Assoc_Out", "Call_Party", "End_R"),
    X.assoc("Assoc_Sup", "DataInput_R", "Call_Party", null), X.assoc("Assoc_RefR", "Task_R", "DataStoreReference_R")] }), X.dstore("DataStore_R", "Rules")]);
  checkComplete(before, "reverse input");
  const after = X.defs("Definitions_support", [reverseProcess({ laneSets: supportLaneSet(S_A, ["Call_Party"]), artifacts: [X.assoc("Assoc_In", "Call_Party", "Start_R"),
    X.assoc("Assoc_Out", "End_R", "Call_Party"), X.assoc("Assoc_Sup", "Call_Party", "DataInput_R"), X.assoc("Assoc_RefR", "DataStoreReference_R", "Task_R")] }),
    X.dstore("DataStore_R", "Rules"), collaborationOf(S_A, "Process_A", true)]);
  SHARED.reverseIn = envelope("main", before);
  SHARED.reverse = envelope("main", after, supportBindings("Process_A", S_A));
  SHARED.reversePlacements = placements([placement("Call_Party", "Process_A", "external", ["Assoc_In", "Assoc_Out", "Assoc_Sup"]),
    placement("DataInput_R", "Process_A", "external-io", ["Assoc_Sup", "DIA_R"], "DIA_R"),
    placement("DataStoreReference_R", "Process_A", "reference-band", ["Assoc_RefR"], "Assoc_RefR")]);
  const art = i => `/rootElements/0/artifacts/${i}`;
  cnCase({ caseId: "l3-n-direction-reversal", group: "normalization", clause: clause("§7.2", 562), cites: [clause("§4", 348, 353), clause("§10.1", 766), clause("§7.3", 569)],
    discriminates: "Fails an implementation that leaves wrong-direction descriptive links unchanged, reverses without setting associationDirection One, reallocates the association IDs, converts an Association into a data or sequence flow, computes the reference anchor from link direction (non-fixed second run), or reports the reversal without exact before/after coordinates." },
  { operation: "normalize", input: SHARED.reverseIn, expected: SHARED.reverse, activation: QUALIFICATION,
    changes: [...SUPPORT_CHANGES(2, 0),
      REF("n-reverse-trigger-in", art(0), "sourceRef"), REF("n-reverse-trigger-in", art(0), "targetRef"), SET("n-reverse-trigger-in", art(0), "associationDirection"),
      REF("n-reverse-trigger-out", art(1), "sourceRef"), REF("n-reverse-trigger-out", art(1), "targetRef"),
      REF("n-reverse-supplier", art(2), "sourceRef"), REF("n-reverse-supplier", art(2), "targetRef"), SET("n-reverse-supplier", art(2), "associationDirection"),
      REF("n-reverse-reference", art(3), "sourceRef"), REF("n-reverse-reference", art(3), "targetRef")], placementsList: SHARED.reversePlacements });
}
{
  // First-seal names restored: U+E000 (process, store), U+00A0 (task) and U+2028 (start)
  // had been folded by a rewrite of this helper. The reference name carries both the
  // precomposed U+00E9 and the decomposed e+U+0301, so NFC and NFD each rewrite it.
  // ASCII source, braced escapes.
  const unicodeProcess = laneSets => X.process("Process_A", "Gestion \u{10000} \u{E000}", { flowElements: [
    X.start("Start_U", "Situation A\nSituation B\r\nSituation C\u{2028}suite", ["Flow_U1"]),
    X.task("Task_U", "Contr\u{F4}le\u{A0}final ", ["Flow_U1"], ["Flow_U2"], { documentation: [X.doc("\u{FEFF}source\u{85}texte\t ")] }),
    X.end("End_U", "Fin\u{85}", ["Flow_U2"]), X.flow("Flow_U1", "Start_U", "Task_U"), X.flow("Flow_U2", "Task_U", "End_U"),
    X.dsr("DataStoreReference_U", "DataStore_U", "R\u{E9}fe\u{301}rence \u{1F4D8}")], artifacts: [X.assoc("Assoc_RefU", "DataStoreReference_U", "Task_U")] });
  const before = X.defs("Definitions_support", [unicodeProcess(), X.dstore("DataStore_U", "Registre \u{E000}\u{10000}")]);
  checkComplete(before, "unicode input");
  const after = X.defs("Definitions_support", [unicodeProcess(), X.dstore("DataStore_U", "Registre \u{E000}\u{10000}"), collaborationOf(S_A, "Process_A", true)]);
  SHARED.unicodeIn = envelope("main", before);
  SHARED.unicode = envelope("main", after, supportBindings("Process_A", S_A, ["collaboration", "main", "band"]));
  SHARED.unicodePlacements = placements([placement("DataStoreReference_U", "Process_A", "reference-band", ["Assoc_RefU"], "Assoc_RefU")]);
  SHARED.unicodeRun = cnCase({ caseId: "l3-n-unicode-names", group: "normalization", clause: clause("§4.2", 387), cites: [clause("§3.1", 260, 262), clause("§14.3", 967), clause("§7.1", 548)],
    discriminates: "Fails an implementation that Unicode-normalizes (NFC composes the decomposed e+U+0301, NFD decomposes U+00E9 and U+00F4, NFKC also folds NBSP), trims (NBSP, U+0085, BOM, trailing space) or re-splits the LF/CRLF/U+2028 start situations, rewrites astral (U+10000, U+1F4D8) or private-use (U+E000) characters, or escapes non-ASCII differently in canonical bytes." },
  { operation: "normalize", input: SHARED.unicodeIn, expected: SHARED.unicode, changes: SUPPORT_CHANGES(2, 0, { lane: false }), placementsList: SHARED.unicodePlacements, activation: QUALIFICATION });
}
{
  // Support lifecycle across deletion and owner remap (DESIGN L565, L571; py cases added to JS).
  const partnerProcess = (pid, { laneSets, extraCall } = {}) => X.process(pid, "Partners", {
    ...(laneSets ? { laneSets } : {}),
    flowElements: [X.start("Start_L", "Request", ["Flow_L1"]), X.task("Task_L", "Answer", ["Flow_L1"], ["Flow_L2"]), X.end("End_L", "Answered", ["Flow_L2"]),
      X.flow("Flow_L1", "Start_L", "Task_L"), X.flow("Flow_L2", "Task_L", "End_L"), ...(extraCall ? [X.call("Call_New", "New partner", [], [], { documentation: [X.marker()] })] : [])],
    ...(extraCall ? { artifacts: [X.assoc("Assoc_New", "Call_New", "Start_L")] } : {}) });
  const deleted = X.defs("Definitions_support", [partnerProcess("Process_A", { laneSets: [X.laneSet(S_A.laneSet, "lane-set", [])] }), collaborationOf(S_A, "Process_A", false)]);
  checkComplete(deleted, "deleted support");
  const d = envelope("main", deleted, supportBindings("Process_A", S_A, ["collaboration", "main", "laneSet"]));
  cnCase({ caseId: "l3-n-deleted-support-stays-absent", group: "normalization", clause: clause("§7.2", 565), cites: [clause("§7.3", 571)],
    discriminates: "The reserved lane and its binding were deleted explicitly and nothing needs the role: fails an implementation that resurrects the lane because its lane set is still bound, recreates every declared support role, or garbage-collects the empty bound lane set." },
  { operation: "normalize", input: d, expected: d, placementsList: [] });
  // After the owner remap Process_A -> Process_R (l3-imp-remap-owner) the surviving
  // supports keep their Process_A-derived IDs; a later need recreates the deleted
  // lane with the current ownerId.
  const remappedOwner = (lanes, extraCall) => X.defs("Definitions_support", [partnerProcess("Process_R", { laneSets: [X.laneSet(S_A.laneSet, "lane-set", lanes)], extraCall }),
    X.collab(S_A.collaboration, "collaboration", [X.participant(S_A.main, "main-participant", "Process_R")])]);
  const survivorBindings = [binding("Process_R", "collaboration", S_A.collaboration), binding("Process_R", "main-participant", S_A.main), binding("Process_R", "lane-set", S_A.laneSet)];
  const survivors = envelope("main", remappedOwner([]), survivorBindings);
  checkComplete(survivors.tree, "after remap");
  SHARED.afterRemap = survivors;
  cnCase({ caseId: "l3-n-after-owner-remap", group: "normalization", clause: clause("§7.2", 565), cites: [clause("§5.2", 444), clause("§7.3", 571)],
    discriminates: "Edit activation on the remapped document: fails an implementation that re-derives surviving support IDs from the current owner Process_R, refuses because a support ID no longer matches its allocator tuple, or re-creates any support." },
  { operation: "normalize", input: survivors, expected: survivors, placementsList: [] });
  const need = envelope("main", remappedOwner([], true), survivorBindings);
  checkComplete(need.tree, "recreate input");
  const newLane = stableId("Process_R", "external-lane", "external-lane", "external lane recreated under the current owner Process_R");
  const recreated = envelope("main", remappedOwner([X.lane(newLane, "external-lane", ["Call_New"])], true), [...survivorBindings, binding("Process_R", "external-lane", newLane)]);
  cnCase({ caseId: "l3-n-recreate-after-remap", group: "normalization", clause: clause("§7.2", 565), cites: [clause("§3.2", 284), clause("§7.3", 571)],
    discriminates: "A later need recreates the deleted reserved lane: fails an implementation that resurrects the old Process_A-derived lane ID, allocates under the old owner, reallocates the surviving lane set or collaboration, or creates a second lane set." },
  { operation: "normalize", input: need, expected: recreated, activation: QUALIFICATION,
    changes: [ENSURE("n-external-lane", "/rootElements/0/laneSets/0/lanes/0"), REF("n-external-membership", "/rootElements/0/laneSets/0/lanes/0", "flowNodeRef")],
    placementsList: placements([placement("Call_New", "Process_R", "external", ["Assoc_New"])]) });
  cnCase({ caseId: "l3-n-recreate-after-remap-edit", group: "normalization", clause: clause("§7.2", 554), cites: [clause("§7.2", 565), clause("§13", 917)],
    discriminates: "Recreation is a support creation: fails an implementation that treats the re-creation of a previously bound role as a reuse and proceeds in edit activation." },
  { operation: "normalize", input: need, refusal: "profile-open" });
}
{
  // Placement intent input of normalize (DESIGN L233, L631).
  cnCase({ caseId: "l3-n-placement-intent-di-only", group: "normalization", clause: clause("§8.2", 631), cites: [clause("§2.5", 233), clause("§3.1", 268)],
    discriminates: "A DI-only move of the reference: fails an implementation whose N changes the semantic tree, bindings or placements because of a placement intent, or ignores the intent record shape." },
  { operation: "normalize", input: SHARED.full, expected: SHARED.full, placementsList: SHARED.fullPlacements, placementIntent: [{ elementId: "DataStoreReference_Catalog" }] });
  cnCase({ caseId: "l3-n-placement-intent-unknown", group: "normalization", clause: clause("§8.2", 631), cites: [clause("§2.2", 132)],
    discriminates: "A placement intent naming no element: fails an implementation that ignores the stale intent or invents an element instead of refusing reference-dangling." },
  { operation: "normalize", input: SHARED.full, refusal: "reference-dangling", placementIntent: [{ elementId: "Task_Missing" }] });
}
{
  // Bounded fixed point, conflicting relation writes and conflicting ensure plans.
  const referenceTree = (assocSource, assocTarget, direction) => X.defs("Definitions_support", [X.process("Process_A", "References", { flowElements: [
    X.start("Start_F", "Start", ["Flow_F1"]), X.task("Task_F", "Apply rules", ["Flow_F1"], ["Flow_F2"]), X.end("End_F", "End", ["Flow_F2"]),
    X.flow("Flow_F1", "Start_F", "Task_F"), X.flow("Flow_F2", "Task_F", "End_F"), X.dsr("DataStoreReference_F", "DataStore_F")],
  artifacts: [X.assoc("Assoc_F", assocSource, assocTarget, direction)] }), X.dstore("DataStore_F", "Rules"), collaborationOf(S_A, "Process_A", true)]);
  const bound = supportBindings("Process_A", S_A, ["collaboration", "main", "band"]);
  cnCase({ caseId: "l3-n-not-fixed", group: "normalization", clause: clause("§2.4", 176), cites: [clause("§7.3", 569)],
    discriminates: "The variant adds a recipe reversing the permitted reference pair back: the first run reverses, the bounded second evaluation reverses again; fails an implementation that retries without bound, commits the first-run result, or skips the second evaluation." },
  { operation: "normalize", profile: "flip", input: envelope("flip", referenceTree("DataStoreReference_F", "Task_F", "One"), bound), refusal: "normalization-not-fixed" });
  cnCase({ caseId: "l3-n-relation-direction-conflict", group: "normalization", clause: clause("§7.2", 562), cites: [clause("§2.4", 176)],
    discriminates: "Two recipes plan different associationDirection values on one wrong-direction association; fails a last-writer-wins or declaration-order implementation instead of refusing profile-write-conflict atomically." },
  { operation: "normalize", profile: "dirconflict", input: envelope("dirconflict", referenceTree("Task_F", "DataStoreReference_F", "None"), bound), refusal: "profile-write-conflict" });
  const needsBand = X.defs("Definitions_support", [X.process("Process_A", "References", { flowElements: [
    X.start("Start_F", "Start", ["Flow_F1"]), X.task("Task_F", "Apply rules", ["Flow_F1"], ["Flow_F2"]), X.end("End_F", "End", ["Flow_F2"]),
    X.flow("Flow_F1", "Start_F", "Task_F"), X.flow("Flow_F2", "Task_F", "End_F"), X.dsr("DataStoreReference_F", "DataStore_F")],
  artifacts: [X.assoc("Assoc_F", "DataStoreReference_F", "Task_F")] }), X.dstore("DataStore_F", "Rules")]);
  cnCase({ caseId: "l3-n-ensure-conflicting-definition", group: "normalization", clause: clause("§2.4", 176), cites: [clause("§2.4", 164), clause("§7.2", 558)],
    discriminates: "Two ensure plans for the same owner and reference-band role differ in their declared name; fails an implementation that coalesces them, keeps the first or last definition, or creates two bands instead of refusing profile-write-conflict." },
  { operation: "normalize", profile: "ensureconflict", input: envelope("ensureconflict", needsBand), refusal: "profile-write-conflict", activation: QUALIFICATION });
}
{
  // Pure placement order vector (DESIGN L565, L262 U+10000 before U+E000).
  const shuffled = [
    { elementId: "Item_B", ownerProcessId: "Process_A", regionKey: "item", anchorAssociationId: "Assoc_2", relatedAssociationIds: ["Assoc_1", "Assoc_2"] },
    { elementId: "Item_C", ownerProcessId: "Process_B", regionKey: "external", relatedAssociationIds: ["Assoc_9"] },
    { elementId: "Item_B", ownerProcessId: "Process_A", regionKey: "item", relatedAssociationIds: ["Assoc_1", "Assoc_2"] },
    { elementId: "Item_D", ownerProcessId: "Process_A", regionKey: "\u{E000}-region", relatedAssociationIds: [] },
    { elementId: "Item_B", ownerProcessId: "Process_A", regionKey: "item", anchorAssociationId: "Assoc_1", relatedAssociationIds: ["Assoc_1", "Assoc_2", "Assoc_3"] },
    { elementId: "Item_A", ownerProcessId: "Process_A", regionKey: "reference-band", anchorAssociationId: "Assoc_1", relatedAssociationIds: ["Assoc_1"] },
    { elementId: "Item_D", ownerProcessId: "Process_A", regionKey: "\u{10000}-region", relatedAssociationIds: [] },
    { elementId: "Item_B", ownerProcessId: "Process_A", regionKey: "item", anchorAssociationId: "Assoc_1", relatedAssociationIds: ["Assoc_1", "Assoc_2"] },
  ];
  const sorted = [shuffled[2], shuffled[7], shuffled[4], shuffled[0], shuffled[5], shuffled[6], shuffled[3], shuffled[1]];
  if (jcs(sortPlacements(shuffled)) !== jcs(sorted)) throw Error("sortPlacements literal");
  addCase({ caseId: "l3-sort-placements", group: "normalization", clause: clause("§7.2", 565), cites: [clause("§3.1", 262)],
    discriminates: "Fails a sort that uses code points instead of UTF-16 units (the U+E000 region before U+10000), places a present anchor before an absent one, or compares relatedAssociationIds by length or by their last element." },
  { operation: "sortPlacements", inputArtifacts: [artifact("placements", shuffled)], expectedStatus: "ok", expectedArtifacts: [artifact("value", sorted)],
    comparatorIds: ["placements-order/lot3", "profile-c14n/2"] });
}
{
  // An explicit refusal after five ensures and the membership write rolls the whole run back.
  cnCase({ caseId: "l3-n-refusal-after-ensures", group: "normalization", clause: clause("§7.3", 573), cites: [clause("§2.4", 172), clause("§7.3", 569)],
    discriminates: "The variant appends a refuse step planned after every support ensure of l3-n-full: fails an implementation that commits the supports or bindings created before the refusal, reports a gate or another code, or mutates the caller envelope." },
  { operation: "normalize", profile: "abort", input: envelope("abort", SHARED.fullIn.tree), refusal: "fixture-abort", activation: QUALIFICATION });
}
{
  // Lot-0 neutral and grid placements: lot-0 pre-authored expectations reused unchanged (DESIGN L565, L218).
  const neutralFixture = fixtureJson(PATHS.lot0NeutralFixture), gridFixture = fixtureJson(PATHS.lot0GridFixture);
  const n = envelope("neutral", neutralFixture.expected.completed);
  cnCase({ caseId: "l3-n-place-neutral", group: "normalization", clause: clause("§7.2", 565), cites: [clause("§2.4", 168), clause("§14.3", 959)],
    discriminates: "On the lot-0 neutral completed tree, fails an implementation whose placements differ from the lot-0 sealed ones (content region, no anchor, empty related set) or that writes the tree during placement." },
  { operation: "normalize", profile: "neutral", input: n, expected: n, placementsList: placements(clone(neutralFixture.expected.placements)) });
  const g = envelope("grid", gridFixture.expected.completed);
  cnCase({ caseId: "l3-n-place-grid-shared-anchor", group: "normalization", clause: clause("§7.2", 563, 565), cites: [clause("§2.4.1", 218), clause("§4.4", 410)],
    discriminates: "On the lot-0 grid completed tree, fails an implementation whose anchors or related sets differ from the lot-0 sealed placements (first consuming association by ID, every touching association related)." },
  { operation: "normalize", profile: "grid", input: g, expected: g, placementsList: placements(clone(gridFixture.expected.placements)) });
  const inserted = clone(gridFixture.expected.completed);
  inserted.rootElements[0].artifacts.push({ $type: "bpmn:Association", id: "B-consumer", sourceRef: "Task_A", targetRef: "Task_B", associationDirection: "One" });
  const related4 = ["A-producer", "B-consumer", "Y-consumer", "Z-consumer"];
  cnCase({ caseId: "l3-n-place-grid-inserted-association", group: "normalization", clause: clause("§7.2", 563, 565), cites: [clause("§2.4.1", 218), clause("§7.3", 571)],
    discriminates: "An inserted consuming association with a lower ID becomes Task_A's anchor and joins both related sets; fails an implementation that keeps the previous anchor or omits the inserted link from Task_B's related set." },
  { operation: "normalize", profile: "grid", input: envelope("grid", inserted), expected: envelope("grid", inserted),
    placementsList: placements([placement("Task_A", "Process_1", "side", related4, "B-consumer"), placement("Task_B", "Process_1", "side", related4, "A-producer")]) });
  const deleted = clone(gridFixture.expected.completed);
  deleted.rootElements[0].artifacts = deleted.rootElements[0].artifacts.filter(a => a.id !== "Y-consumer" && a.id !== "Z-consumer");
  cnCase({ caseId: "l3-n-place-grid-deleted-association", group: "normalization", clause: clause("§7.2", 563, 565), cites: [clause("§2.4.1", 218), clause("§7.3", 571)],
    discriminates: "Both consuming associations of Task_A deleted: fails an implementation that keeps a deleted anchor, leaves Task_A unanchored instead of falling back to the producing association, or keeps deleted IDs in the related sets." },
  { operation: "normalize", profile: "grid", input: envelope("grid", deleted), expected: envelope("grid", deleted),
    placementsList: placements([placement("Task_A", "Process_1", "side", ["A-producer"], "A-producer"), placement("Task_B", "Process_1", "side", ["A-producer"], "A-producer")]) });
}

// ================================================================ GROUP support recovery and explicit binding (DESIGN §5.2 L440-L442; OPEN-MACHINE)
{
  // A trusted generated document whose bindings were lost: every support carries its allocator ID.
  const lost = envelope("main", SHARED.full.tree);
  const proposal = (caseId, provenance, proposals, discriminates, input = lost) => addCase({ caseId, group: "support-binding", clause: clause("§5.2", 440), cites: [clause("§5.2", 442), clause("§13", 915)], discriminates },
    { operation: "proposeSupportBindings", profile: "main", inputArtifacts: [artifact("envelope", input), artifact("provenance", provenance)], expectedStatus: "ok",
      expectedArtifacts: [artifact("result", { status: "ok", payload: { proposals }, diagnostics: [] }), artifact("caller-state", input)], comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
  const all5 = [S_A.collaboration, S_A.main, S_A.laneSet, S_A.lane, S_A.band];
  proposal("l3-propose-recovery-with-provenance", all5, sortBindings(supportBindings("Process_A", S_A)),
    "Exact allocator ID, expected type, parent and owner relationship, and creation provenance for each support: fails an implementation that proposes nothing, applies the bindings itself, proposes by name, or returns unsorted proposals.");
  proposal("l3-propose-recovery-without-provenance", [], [],
    "Without creation provenance a hash-shaped ID alone never authorizes reuse: fails an implementation that proposes the generated-looking supports or refuses instead of returning no proposal.");
  proposal("l3-propose-recovery-partial-provenance", [S_A.collaboration], [binding("Process_A", "collaboration", S_A.collaboration)],
    "Only the provenance-listed Collaboration qualifies: fails an implementation that also proposes the main Participant, lane set, lane or band whose IDs match but whose provenance is absent.");
  const pool = X.defs("Definitions_support", [
    X.process("Process_A", "Order handling", { flowElements: [X.start("Start_P", "Start", ["Flow_P1"]), X.task("Task_P", "Pack", ["Flow_P1"], ["Flow_P2"]), X.end("End_P", "Packed", ["Flow_P2"]),
      X.flow("Flow_P1", "Start_P", "Task_P"), X.flow("Flow_P2", "Task_P", "End_P"), X.dsr("DataStoreReference_P", "DataStore_P")], artifacts: [X.assoc("Assoc_RefP", "DataStoreReference_P", "Task_P")] }),
    X.dstore("DataStore_P", "Manual"), X.collab("Collaboration_Chosen", "Imported collaboration", [X.participant("Participant_Pool", "reference-band")])]);
  const unbound = envelope("main", pool);
  proposal("l3-propose-black-box-pool", [], [],
    "An imported collaboration and a black-box pool labelled like supports: fails an implementation that proposes them by label or structure (their IDs are not allocator IDs).", unbound);
  const chosen = envelope("main", pool, [binding("Process_A", "collaboration", "Collaboration_Chosen")]);
  const bindCase = (caseId, input, bindingsIn, { output, refusal, activation, discriminates }) => {
    const inputArtifacts = [artifact("envelope", input), artifact("bindings", bindingsIn), ...activationArtifacts(activation)];
    addCase({ caseId, group: "support-binding", clause: clause("§5.2", 442), cites: [clause("§5.2", 440), clause("§13", 915), clause("§5.1", 430)], discriminates },
      { operation: "bindSupports", profile: "main", inputArtifacts, expectedStatus: refusal ? `refused:${refusal}` : "ok",
        expectedArtifacts: [artifact("result", refusal ? refusedResult("bindSupports", echoOf(input), refusal) : okResult("bindSupports", input, clone(output), output, [])), artifact("caller-state", input)],
        comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
  };
  const selection = [binding("Process_A", "collaboration", "Collaboration_Chosen")];
  bindCase("l3-bind-supports-explicit-selection", unbound, selection, { output: chosen, activation: QUALIFICATION,
    discriminates: "An explicit support selection binds the imported Collaboration: fails an implementation that also binds the pool, edits the tree, reports change entries, or requires N to adopt the collaboration by label." });
  bindCase("l3-bind-supports-gated", unbound, selection, { refusal: "profile-open",
    discriminates: "Edit activation: the explicit binding transaction is gated by OPEN-MACHINE; fails an implementation that commits the binding in edit or reports another code." });
  bindCase("l3-bind-supports-conflict", chosen, selection, { refusal: "support-binding-conflict", activation: QUALIFICATION,
    discriminates: "The owner and role are already bound: fails an implementation that replaces or duplicates the binding instead of refusing support-binding-conflict." });
  const after = clone(pool);
  after.rootElements[2].participants.push(X.participant(S_A.main, "main-participant", "Process_A"), X.participant(S_A.band, "reference-band"));
  cnCase({ caseId: "l3-n-after-explicit-selection", group: "support-binding", clause: clause("§5.2", 442), cites: [clause("§7.2", 558), clause("§5.2", 440)],
    discriminates: "N after the explicit selection reuses the bound Collaboration and creates its own main Participant and band inside it: fails an implementation that adopts the ordinary pool labelled reference-band, creates a second Collaboration, or reallocates the selected one." },
  { operation: "normalize", input: chosen, expected: envelope("main", after, [binding("Process_A", "collaboration", "Collaboration_Chosen"), binding("Process_A", "main-participant", S_A.main), binding("Process_A", "reference-band", S_A.band)]),
    changes: [ENSURE("n-structure", "/rootElements/2/participants/1"), REF("n-structure", "/rootElements/2/participants/1", "processRef"), ENSURE("n-reference-band", "/rootElements/2/participants/2")],
    placementsList: placements([placement("DataStoreReference_P", "Process_A", "reference-band", ["Assoc_RefP"], "Assoc_RefP")]), activation: QUALIFICATION });
}

// ================================================================ GROUP fixed-point (DESIGN §7.3)
{
  const fixed = [
    ["l3-fp-n-full", "normalize", SHARED.full, SHARED.fullPlacements, "Fails an implementation whose second N run re-creates, re-binds or re-appends supports, re-adds the call membership, gates a no-op in edit, or returns a non-empty report."],
    ["l3-fp-n-two-processes", "normalize", SHARED.two, SHARED.twoPlacements, "Fails a second N run that merges or re-creates the per-process collaborations or reorders the shared-store placements."],
    ["l3-fp-n-imported-supports", "normalize", SHARED.imported, SHARED.importedPlacements, "Fails a second N run that appends the already present call membership again, gates the no-op append in edit, or rewrites imported support IDs."],
    ["l3-fp-n-direction-reversal", "normalize", SHARED.reverse, SHARED.reversePlacements, "Fails a second N run that reverses the corrected links back, or changes the reference anchor once link directions changed."],
    ["l3-fp-n-unicode-names", "normalize", SHARED.unicode, SHARED.unicodePlacements, "Fails a second N run that re-encodes or normalizes any non-ASCII or whitespace name byte."],
    ["l3-fp-c-root-first", "complete", SHARED.rootFirst, null, "Fails a second C run that reallocates birth-signature IDs from current content or re-stamps defaults."],
    ["l3-fp-c-topology", "complete", SHARED.topology, null, "Fails a second C run that still changes topology arrays or now pulls the cross-container flow into Task_1."],
    ["l3-fp-c-gateways", "complete", SHARED.gateways, null, "Fails a second C run that flips any gateway direction (sequential or stale-array evaluation)."],
    ["l3-fp-c-ports", "complete", SHARED.ports, null, "Fails a second C run that creates another port for an association that already has its keyed port."],
    ["l3-fp-c-sets-default", "complete", SHARED.setsDefault, null, "Fails a second C run that creates another default set or reorders the default membership."],
    ["l3-fp-c-timers", "complete", SHARED.timers, null, "Fails a second C run that touches timer definitions or ID-less expressions."],
    ["l3-fp-c-on-n-input", "complete", SHARED.fullIn, null, "Proves the l3-n-full input is a C fixed point; fails an implementation whose C rewrites topology, sets, ports or the call documentation of an already completed document."],
    ["l3-fp-c-after-n", "complete", SHARED.full, null, "Fails an implementation whose C rewrites N-owned supports, bindings or memberships of a normalized document."],
  ];
  for (const [caseId, operation, state, placementsList, discriminates] of fixed) {
    cnCase({ caseId, group: "fixed-point", clause: clause("§7.3", 569), cites: [clause("§2.4", 176)], discriminates },
    { operation, input: state, expected: state, placementsList: placementsList ?? undefined });
  }
}

// ================================================================ GROUP mixed-runtime transport (DESIGN §7.3, §14.3; harmonization A7)
{
  const scenarios = [["full", SHARED.fullIn, SHARED.full, SHARED.fullPlacements, SHARED.fullRun],
    ["two-processes", SHARED.twoIn, SHARED.two, SHARED.twoPlacements, SHARED.twoRun],
    ["unicode-names", SHARED.unicodeIn, SHARED.unicode, SHARED.unicodePlacements, SHARED.unicodeRun]];
  for (const [name, input, output, placementsList, firstRun] of scenarios) {
    const text = jcs(output), digest = sha(Buffer.from(text, "utf8"));
    ledger.transport.push({ scenario: name, sha256: digest, bytes: Buffer.byteLength(text, "utf8") });
    const fixedPointResult = okResult("normalize", output, r => ({ envelope: clone(output), placements: clone(placementsList), report: clone(r) }), output, []);
    for (const route of [["js", "python", "js"], ["python", "js", "python"]]) {
      const label = route.map(r => r === "python" ? "py" : r).join("-");
      const activations = [QUALIFICATION, "edit", "edit"];
      addCase({ caseId: `l3-mix-n-${name}-${label}`, group: "mixed-runtime", clause: clause("§7.3", 569), cites: [clause("§14.3", 963), clause("§3.1", 260)],
        discriminates: `Fails a twin pair whose ${route[0]} first run differs from the sealed N(x) result, whose ${route[1]} run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding.` },
      { operation: "normalize", phase: "normalize", profile: "main",
        inputArtifacts: [artifact("envelope", input), artifact("transport-route", { route, activations, encoding: "profile-c14n/2 UTF-8 bytes of DocumentEnvelope/1, no BOM, no trailing newline" })],
        expectedStatus: "ok",
        expectedArtifacts: [
          artifact("transport", { route, hops: route.map((runtime, hop) => ({ hop: hop + 1, runtime, activation: activations[hop], input: hop === 0 ? "envelope" : `hop-${hop}-transport-bytes`, outputSha256: digest })) }),
          textArtifact("transport-bytes", text),
          artifact("hop-results", [firstRun.result, fixedPointResult, fixedPointResult])],
        comparatorIds: ["transport-bytes/lot3", "node-crypto", "python-hashlib"] });
    }
  }
}

// ================================================================ validate cases (DESIGN §4.1-§4.3, §6.3; harmonization B12)
function lintCase(meta, { tree, policy, expected, extraEntries = [] }) {
  checkComplete(tree, meta.caseId);
  const input = envelope("main", tree);
  const entries = [...expected.map(([ruleId, targetId]) => finding(tree, ruleId, targetId, policy)), ...extraEntries];
  const result = okResult("validate", input, r => ({ ok: !r.entries.some(e => e.severity === "error"), counts: countsOf(r.entries) }), input, entries);
  addCase(meta, { operation: "validate", phase: "post-normalize", profile: "main",
    inputArtifacts: [artifact("envelope", input), artifact("options", { phase: "post-normalize", readinessPolicy: policy })], expectedStatus: "ok",
    expectedArtifacts: [artifact("result", result), artifact("caller-state", input)], comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
}

// ---------------------------------------------------------------- GROUP call-kind (DESIGN §4.1)
{
  const inFlow = (call, extraRoots = []) => X.defs("Definitions_cn", [X.process("Process_A", "Calls", { flowElements: [
    X.start("Start_C", "Start", ["Flow_C1"]), { ...call, incoming: ["Flow_C1"], outgoing: ["Flow_C2"] }, X.end("End_C", "End", ["Flow_C2"]),
    X.flow("Flow_C1", "Start_C", "Call_C"), X.flow("Flow_C2", "Call_C", "End_C")] }), ...extraRoots]);
  const call = extra => ({ $type: "bpmn:CallActivity", id: "Call_C", name: "Called work", ...extra });
  const sub = [X.process("Process_Sub", "Sub-process body")];
  const external = X.defs("Definitions_cn", [X.process("Process_A", "Calls", { flowElements: [
    X.start("Start_C", "Start", ["Flow_C1"]), X.task("Task_C", "Work", ["Flow_C1"], ["Flow_C2"]), X.end("End_C", "End", ["Flow_C2"]),
    X.flow("Flow_C1", "Start_C", "Task_C"), X.flow("Flow_C2", "Task_C", "End_C"), X.call("Call_C", "Partner", [], [], { documentation: [X.doc("Partner source text"), X.marker()] })],
    artifacts: [X.assoc("Assoc_C", "Call_C", "Start_C")] })]);
  const cases = [
    ["l3-call-external-valid", "accept", external, [], clause("§4.1", 374), "Fails an implementation that reports a finding for a valid marked external call, requires calledElement, or ignores the marker appended after source Documentation."],
    ["l3-call-internal", "accept", inFlow(call({ calledElement: "Process_Sub" }), sub), [], clause("§4.1", 376), "Fails an implementation that classifies a call resolving to an in-document Process as incomplete, external or dangling."],
    ["l3-call-ambiguous", "accept", inFlow(call({ documentation: [X.doc("Source"), X.marker("external"), X.marker("internal")] })), [["call-ambiguous", "Call_C"]], clause("§4.1", 370),
      "Fails an implementation that picks a winner among markers with different texts, reports duplicate or invalid instead, or treats the first marker as authoritative."],
    ["l3-call-duplicate", "accept", inFlow(call({ documentation: [X.marker("external"), X.marker("external")] })), [["call-duplicate", "Call_C"]], clause("§4.1", 371),
      "Fails an implementation that deduplicates identical markers silently and recognizes an external call instead of reporting the duplicate."],
    ["l3-call-marker-invalid", "accept", inFlow(call({ documentation: [X.marker("internal")] })), [["call-marker-invalid", "Call_C"]], clause("§4.1", 372),
      "Fails an implementation that accepts an unknown marker text as a call kind or falls back to the incomplete-call classification."],
    ["l3-call-conflict", "accept", inFlow(call({ calledElement: "Process_Sub", documentation: [X.marker()] }), sub), [["call-conflict", "Call_C"]], clause("§4.1", 373),
      "Fails an implementation that lets the internal target win over a valid external marker (or the reverse) instead of reporting the conflict."],
    ["l3-call-conflict-empty", "accept", inFlow(call({ calledElement: "", documentation: [X.marker()] })), [["call-conflict", "Call_C"]], clause("§4.1", 373),
      "Fails an implementation that treats an empty calledElement as absent next to a valid marker, or refuses it as a dangling reference before classification."],
    ["l3-call-target-empty-draft", "draft", inFlow(call({ calledElement: "" })), [["call-target-empty", "Call_C"]], clause("§4.1", 375),
      "Fails an implementation that refuses an empty calledElement as reference-dangling before classification, or reports it at error severity in draft."],
    ["l3-call-target-empty-accept", "accept", inFlow(call({ calledElement: "" })), [["call-target-empty", "Call_C"]], clause("§4.1", 375),
      "Fails an implementation that keeps the draft warning at acceptance or classifies the empty target as required-missing."],
    ["l3-call-target-type", "accept", inFlow(call({ calledElement: "GlobalTask_1" }), [{ $type: "bpmn:GlobalTask", id: "GlobalTask_1", name: "Global" }]), [["call-target-type", "Call_C"]], clause("§4.1", 377),
      "Fails an implementation that accepts any CallableElement as an internal call target or reports it as dangling."],
    ["l3-call-target-required-draft", "draft", inFlow(call({})), [["call-target-required", "Call_C"]], clause("§4.1", 379),
      "Fails an implementation that treats a targetless unmarked call as external, as an error in draft, or not at all."],
    ["l3-call-target-required-accept", "accept", inFlow(call({})), [["call-target-required", "Call_C"]], clause("§4.1", 379),
      "Fails an implementation that keeps the targetless unmarked call at warning severity for acceptance."],
    ["l3-call-source-doc-not-marker", "accept", inFlow(call({ documentation: [X.doc("external")] })), [["call-target-required", "Call_C"]], clause("§4.1", 366),
      "Fails an implementation that recognizes the marker by its text without the exact configured textFormat."],
  ];
  for (const [caseId, policy, tree, expected, primary, discriminates] of cases) {
    lintCase({ caseId, group: "call-kind", clause: primary, cites: [clause("§4.1", 368), clause("§6.4", 515)], discriminates }, { tree, policy, expected });
  }
  // Harmonization C2: validate reports a nonempty unresolved calledElement as an
  // integrity/error entry of the graph index and the operation succeeds.
  const dangling = inFlow(call({ calledElement: "Process_Missing" }));
  lintCase({ caseId: "l3-call-target-dangling-accept", group: "call-kind", clause: clause("§4.1", 378), cites: [clause("§2.2", 132), clause("§6.4", 510)],
    discriminates: "Fails an implementation that refuses validate for a dangling calledElement, classifies it as incomplete or as a wrong target type, omits the integrity entry, or reports it at warning severity." },
  { tree: dangling, policy: "accept", expected: [], extraEntries: [danglingFinding(dangling, "Call_C", "calledElement")] });
}

// ---------------------------------------------------------------- GROUP ordinary-path (DESIGN §6.3, §14.3)
{
  const path = ({ nodes = [], flows = [], artifacts = [], startOut = ["Flow_O1"], mainIn = ["Flow_O1"], endIn = ["Flow_O2"], mainTarget = "Task_Main" } = {}) =>
    X.defs("Definitions_cn", [X.process("Process_A", "Ordinary", { flowElements: [
      X.start("Start_O", "Start", startOut), X.task("Task_Main", "Main work", mainIn, ["Flow_O2"]), X.end("End_O", "End", endIn),
      X.flow("Flow_O1", "Start_O", mainTarget), X.flow("Flow_O2", "Task_Main", "End_O"),
      X.call("Call_Partner", "Partner", [], [], { documentation: [X.marker()] }), ...nodes, ...flows],
      artifacts: [X.assoc("Assoc_PT", "Call_Partner", "Start_O"), ...artifacts] })]);
  const loose = path({ nodes: [X.task("Task_Loose", "Loose", [], [])] });
  const all4 = id => [["ordinary-incoming", id], ["ordinary-outgoing", id], ["ordinary-from-start", id], ["ordinary-to-end", id]];
  const cases = [
    ["l3-path-disconnected-task-accept", "accept", loose, all4("Task_Loose"),
      "Fails an implementation whose external-call exemption also silences the disconnected ordinary Task, or that exempts every node once a linked external call exists."],
    ["l3-path-disconnected-task-draft", "draft", loose, all4("Task_Loose"),
      "Fails an implementation that refuses or errors on an incomplete draft instead of reporting readiness warnings."],
    ["l3-path-gateway-without-incoming-accept", "accept", path({ nodes: [X.xgw("Gateway_Orphan", "Orphan", "Diverging", [], ["Flow_G1", "Flow_G2"])],
      flows: [X.flow("Flow_G1", "Gateway_Orphan", "Task_Main"), X.flow("Flow_G2", "Gateway_Orphan", "End_O")], mainIn: ["Flow_G1", "Flow_O1"], endIn: ["Flow_G2", "Flow_O2"] }),
      [["ordinary-incoming", "Gateway_Orphan"], ["ordinary-from-start", "Gateway_Orphan"]],
      "Fails an implementation that checks only activities, or derives reachability from containment instead of resolved sourceRef->targetRef sequence flows."],
    ["l3-path-unreachable-component-accept", "accept", path({ nodes: [X.task("Task_X", "Island start", [], ["Flow_X1"]), X.task("Task_Y", "Island end", ["Flow_X1"], ["Flow_X2"])],
      flows: [X.flow("Flow_X1", "Task_X", "Task_Y"), X.flow("Flow_X2", "Task_Y", "End_O")], endIn: ["Flow_O2", "Flow_X2"] }),
      [["ordinary-incoming", "Task_X"], ["ordinary-from-start", "Task_X"], ["ordinary-from-start", "Task_Y"]],
      "Fails an implementation that accepts a component able to reach End but unreachable from Start, or reports only its first node."],
    ["l3-path-cannot-reach-end-accept", "accept", path({ nodes: [X.xgw("Gateway_Split", "Split", "Diverging", ["Flow_O1"], ["Flow_S1", "Flow_S2"]), X.task("Task_Dead", "Dead end", ["Flow_S2"], [])],
      flows: [X.flow("Flow_S1", "Gateway_Split", "Task_Main"), X.flow("Flow_S2", "Gateway_Split", "Task_Dead")], mainIn: ["Flow_S1"], mainTarget: "Gateway_Split" }),
      [["ordinary-outgoing", "Task_Dead"], ["ordinary-to-end", "Task_Dead"]],
      "Fails an implementation that checks reachability from Start only, or accepts a dead-end branch because another branch reaches End."],
    ["l3-path-incomplete-call-not-exempt-accept", "accept", path({ nodes: [X.call("Call_Draft", "Draft call", [], [])], artifacts: [X.assoc("Assoc_D", "Call_Draft", "Start_O")] }),
      [["call-target-required", "Call_Draft"], ...all4("Call_Draft")],
      "Fails an implementation that extends the external-call exemption to a linked but unmarked, targetless call."],
    ["l3-path-unlinked-external-not-exempt-accept", "accept", path({ nodes: [X.call("Call_Alone", "Lonely partner", [], [], { documentation: [X.marker()] })] }),
      all4("Call_Alone"),
      "Fails an implementation that exempts a recognized external call without any descriptive link; only recognized and linked calls are exempt."],
  ];
  for (const [caseId, policy, tree, expected, discriminates] of cases) {
    lintCase({ caseId, group: "ordinary-path", clause: clause("§6.3", 501), cites: [clause("§6.3", 499), clause("§14.3", 969)], discriminates }, { tree, policy, expected });
  }
  lintCase({ caseId: "l3-path-cross-container-flow-accept", group: "ordinary-path", clause: clause("§4", 347), cites: [clause("§6.3", 501), clause("§7.1", 544)],
    discriminates: "On the completed l3-c-topology tree, fails an implementation that accepts a SequenceFlow leaving its flow container, or lets that flow make Task_B reach an end event of another process." },
  { tree: SHARED.topology.tree, policy: "accept", expected: [["flow-container", "Flow_X"], ["ordinary-incoming", "Task_B"], ["ordinary-from-start", "Task_B"], ["ordinary-to-end", "Task_B"]] });
}

// ---------------------------------------------------------------- GROUP trigger-branch (DESIGN §4.2)
const triggerTree = ({ definitionsId = "Definitions_cn", calls = ["Call_T1", "Call_T2"], body }) => X.defs(definitionsId, [X.process("Process_A", "Triggers", {
  flowElements: [...body, ...calls.map(id => X.call(id, `Trigger ${id.slice(-1)}`, [], [], { documentation: [X.marker()] }))],
  artifacts: calls.map(id => X.assoc(`Assoc_${id.slice(-2)}`, id, "Start_T")) })]);
const straight = [X.start("Start_T", "Situation one\nSituation two", ["Flow_T1"]), X.task("Task_T", "Handle", ["Flow_T1"], ["Flow_T2"]), X.end("End_T", "Done", ["Flow_T2"]),
  X.flow("Flow_T1", "Start_T", "Task_T"), X.flow("Flow_T2", "Task_T", "End_T")];
{
  const downstream = [X.start("Start_T", "Situation one\nSituation two", ["Flow_T1"]), X.task("Task_Triage", "Triage", ["Flow_T1"], ["Flow_T2"]),
    X.xgw("Gateway_Route", "Which situation?", "Diverging", ["Flow_T2"], ["Flow_T3", "Flow_T4"]), X.task("Task_Fast", "Fast path", ["Flow_T3"], ["Flow_T5"]),
    X.task("Task_Slow", "Slow path", ["Flow_T4"], ["Flow_T6"]), X.end("End_T", "Done", ["Flow_T5", "Flow_T6"]),
    X.flow("Flow_T1", "Start_T", "Task_Triage"), X.flow("Flow_T2", "Task_Triage", "Gateway_Route"), X.flow("Flow_T3", "Gateway_Route", "Task_Fast"),
    X.flow("Flow_T4", "Gateway_Route", "Task_Slow"), X.flow("Flow_T5", "Task_Fast", "End_T"), X.flow("Flow_T6", "Task_Slow", "End_T")];
  const parallel = [X.start("Start_T", "Situation one\nSituation two", ["Flow_T1"]), X.pgw("Gateway_Fork", "Fork", "Diverging", ["Flow_T1"], ["Flow_T2", "Flow_T3"]),
    X.task("Task_P1", "Part one", ["Flow_T2"], ["Flow_T4"]), X.task("Task_P2", "Part two", ["Flow_T3"], ["Flow_T5"]),
    X.pgw("Gateway_Merge", "Merge", "Converging", ["Flow_T4", "Flow_T5"], ["Flow_T6"]), X.end("End_T", "Done", ["Flow_T6"]),
    X.flow("Flow_T1", "Start_T", "Gateway_Fork"), X.flow("Flow_T2", "Gateway_Fork", "Task_P1"), X.flow("Flow_T3", "Gateway_Fork", "Task_P2"),
    X.flow("Flow_T4", "Task_P1", "Gateway_Merge"), X.flow("Flow_T5", "Task_P2", "Gateway_Merge"), X.flow("Flow_T6", "Gateway_Merge", "End_T")];
  const cases = [
    ["l3-trig-single-trigger-accept", "accept", triggerTree({ calls: ["Call_T1"], body: straight }), [], "Fails an implementation that requires a branch after a single incoming trigger."],
    ["l3-trig-downstream-branch-accept", "accept", triggerTree({ body: downstream }), [],
      "Fails an implementation of the stricter candidate (Start->ExclusiveGateway adjacency with named outgoing flows), which is disabled until expressly adopted; a downstream exclusive branch satisfies the ratified default."],
    ["l3-trig-no-branch-accept", "accept", triggerTree({ body: straight }), [["trigger-branch", "Start_T"]], "Fails an implementation that accepts several triggers without any downstream exclusive branch at acceptance."],
    ["l3-trig-no-branch-draft", "draft", triggerTree({ body: straight }), [["trigger-branch", "Start_T"]], "Fails an implementation that blocks drafts or reports the missing branch at error severity in draft."],
    ["l3-trig-parallel-only-accept", "accept", triggerTree({ body: parallel }), [["trigger-branch", "Start_T"]], "Fails an implementation that counts a parallel gateway as the required exclusive branch."],
  ];
  for (const [caseId, policy, tree, expected, discriminates] of cases) {
    lintCase({ caseId, group: "trigger-branch", clause: clause("§4.2", 389), cites: [clause("§16", 1158), clause("§2.2", 132)], discriminates }, { tree, policy, expected });
  }
  const before = triggerTree({ definitionsId: "Definitions_support", body: straight });
  const after = clone(before);
  after.rootElements[0].laneSets = supportLaneSet(S_A, ["Call_T1", "Call_T2"]);
  after.rootElements.push(collaborationOf(S_A, "Process_A", false));
  cnCase({ caseId: "l3-trig-normalize-no-invention", group: "trigger-branch", clause: clause("§4.2", 389), cites: [clause("§7.2", 552), clause("§2.4", 176)],
    discriminates: "N on a start event with two triggers and no branch must not insert a gateway, flows or choice names; it only creates the declared supports and one coalesced membership write, and keeps the situations text." },
  { operation: "normalize", input: envelope("main", before), expected: envelope("main", after, supportBindings("Process_A", S_A, ["collaboration", "main", "laneSet", "lane"])),
    changes: SUPPORT_CHANGES(1, 0, { band: false }), activation: QUALIFICATION,
    placementsList: placements([placement("Call_T1", "Process_A", "external", ["Assoc_T1"]), placement("Call_T2", "Process_A", "external", ["Assoc_T2"])]) });
}

// ---------------------------------------------------------------- GROUP io-links (DESIGN §4.3)
{
  const ioTree = ({ supply = true, consume = true, produce = true, consumer = true, reversedSupplier = false, extraArtifacts = [] }) => X.defs("Definitions_cn", [X.process("Process_A", "Interface links", {
    ioSpecification: X.io([X.din("DataInput_In", "Request")], [X.dout("DataOutput_Out", "Answer")], [X.iset("InputSet_IO", ["DataInput_In"])], [X.oset("OutputSet_IO", ["DataOutput_Out"])]),
    flowElements: [X.start("Start_IO", "Start", ["Flow_IO1"]),
      X.task("Task_Use", "Use request", ["Flow_IO1"], ["Flow_IO2"], consume ? { properties: [X.prop("Property_Use")], dataInputAssociations: [X.dia("DIA_In", ["DataInput_In"], "Property_Use")] } : {}),
      X.task("Task_Make", "Make answer", ["Flow_IO2"], ["Flow_IO3"], produce ? { properties: [X.prop("Property_Make")], dataOutputAssociations: [X.doa("DOA_Out", ["Property_Make"], "DataOutput_Out")] } : {}),
      X.end("End_IO", "End", ["Flow_IO3"]), X.flow("Flow_IO1", "Start_IO", "Task_Use"), X.flow("Flow_IO2", "Task_Use", "Task_Make"), X.flow("Flow_IO3", "Task_Make", "End_IO"),
      X.call("Call_P", "Partner", [], [], { documentation: [X.marker()] })],
    artifacts: [X.assoc("Assoc_PT", "Call_P", "Start_IO"),
      ...(supply ? [reversedSupplier ? X.assoc("Assoc_Sup", "DataInput_In", "Call_P") : X.assoc("Assoc_Sup", "Call_P", "DataInput_In")] : []),
      ...(consumer ? [X.assoc("Assoc_Con", "DataOutput_Out", "Call_P")] : []), ...extraArtifacts] })]);
  const none = { supply: false, consume: false, produce: false, consumer: false };
  const missing = [["input-supplier", "DataInput_In"], ["input-consumer", "DataInput_In"], ["output-producer", "DataOutput_Out"], ["output-consumer", "DataOutput_Out"]];
  const reversed = [["input-supplier", "DataInput_In"], ["link-endpoint", "Assoc_Sup"]];
  const cases = [
    ["l3-io-complete-links-accept", "accept", ioTree({}), [], clause("§4.3", 397, 400), "Fails an implementation that requires links beyond the four evidenced relationships, treats the descriptive Associations as sequence flows, or flags a permitted link pair."],
    ["l3-io-missing-links-accept", "accept", ioTree(none), missing, clause("§4.3", 397, 400), "Fails an implementation that fabricates endpoints, reports one finding for several missing links, or uses the draft severity at acceptance."],
    ["l3-io-missing-links-draft", "draft", ioTree(none), missing, clause("§4.3", 397, 400), "Fails an implementation that blocks the draft or reports error severity for approved readiness rules in draft."],
    ["l3-io-wrong-direction-accept", "accept", ioTree({ reversedSupplier: true }), reversed, clause("§4.3", 401),
      "The supplier Association points from the DataInput to the external call: fails an implementation that ignores Association direction, counts the reversed link as the supplier, or reports only the readiness finding without the endpoint integrity error."],
    ["l3-io-wrong-direction-draft", "draft", ioTree({ reversedSupplier: true }), reversed, clause("§4.3", 401),
      "Fails an implementation that downgrades the endpoint integrity error to a warning in draft (only readiness rules warn in draft)."],
    ["l3-io-endpoint-type-accept", "accept", ioTree({ extraArtifacts: [X.assoc("Assoc_Bad", "Task_Make", "DataOutput_Out")] }), [["link-endpoint", "Assoc_Bad"]], clause("§4.3", 401),
      "An Association from an ordinary Task to the Process DataOutput: fails an implementation that accepts any Association to a DataOutput as a producer link, flags the valid data-association producer, or treats the gated external-producer candidate rule as covering an activity."],
  ];
  for (const [caseId, policy, tree, expected, primary, discriminates] of cases) {
    lintCase({ caseId, group: "io-links", clause: primary, cites: [clause("§4.3", 404), clause("§6.3", 502)], discriminates }, { tree, policy, expected });
  }
  // Cross-owner links: a trigger and a supplier Association stored in Process_A
  // whose other endpoint belongs to Process_B (settled ownership violations).
  const owners = X.defs("Definitions_cn", [
    X.process("Process_A", "Front", { flowElements: [X.start("Start_FA", "Request", ["Flow_FA1"]), X.task("Task_FA", "Take request", ["Flow_FA1"], ["Flow_FA2"]), X.end("End_FA", "Taken", ["Flow_FA2"]),
      X.flow("Flow_FA1", "Start_FA", "Task_FA"), X.flow("Flow_FA2", "Task_FA", "End_FA"), X.call("Call_FA", "Partner", [], [], { documentation: [X.marker()] })],
      artifacts: [X.assoc("Assoc_FA", "Call_FA", "Start_FA"), X.assoc("Assoc_X1", "Call_FA", "Start_FB"), X.assoc("Assoc_X2", "Call_FA", "DataInput_FB")] }),
    X.process("Process_B", "Back", { ioSpecification: X.io([X.din("DataInput_FB", "Order")], [], [X.iset("InputSet_FB", ["DataInput_FB"])], [X.oset("OutputSet_FB")]),
      flowElements: [X.start("Start_FB", "Order taken", ["Flow_FB1"]),
        X.task("Task_FB", "Process order", ["Flow_FB1"], ["Flow_FB2"], { properties: [X.prop("Property_FB")], dataInputAssociations: [X.dia("DIA_FB", ["DataInput_FB"], "Property_FB")] }),
        X.end("End_FB", "Processed", ["Flow_FB2"]), X.flow("Flow_FB1", "Start_FB", "Task_FB"), X.flow("Flow_FB2", "Task_FB", "End_FB")] })]);
  for (const policy of ["accept", "draft"]) {
    lintCase({ caseId: `l3-io-link-owner-${policy}`, group: "io-links", clause: clause("§4.3", 401), cites: [clause("§6.3", 502), clause("§4", 358)],
      discriminates: policy === "accept"
        ? "Fails an implementation that checks link endpoint types but not ownership, accepts a trigger or supplier Association whose endpoint belongs to another process, or reports the two violations under one finding."
        : "Fails an implementation that downgrades the cross-owner integrity errors to warnings in draft or blocks the draft validation itself." },
    { tree: owners, policy, expected: [["link-owner", "Assoc_X1"], ["link-owner-io", "Assoc_X2"]] });
  }
}

// ================================================================ GROUP import adapters (DESIGN §5.2, §5.3, §3.1; harmonization B14, B15, C2, C20, H9)
const descriptorDigest = H([{ id: PINS.descriptors.id, version: PINS.descriptors.version, sha256: PINS.descriptors.sha256 }]);
const importBase = sourceTree => H({ domain: "profile-import/1", format: "native-json", sourceDigest: H(sourceTree) });
const archived = diagrams => ({ descriptorDigest, diagrams: clone(diagrams), sha256: H({ descriptorDigest, diagrams }) });
const migrationCommand = (map, extra = {}, { approved = true } = {}) => ({ role: "migration", json: { kind: "id-remap", ...(approved ? { approved: true, approval: "technical" } : {}),
  map: map.map(([sourceId, resultId]) => ({ sourceId, resultId, domain: "migration" })), referenceFreeAttestations: [], ...extra } });
// The complete original->result map over the ID-bearing semantic elements of the input, identity rows included (B14).
function idRows(tree, map) {
  const m = new Map(map), rows = [];
  const walk = node => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") { if (idBearing(node) && typeof node.id === "string") rows.push({ sourceId: node.id, resultId: m.get(node.id) ?? node.id, domain: "migration" }); Object.values(node).forEach(walk); }
  };
  walk(tree);
  return rows;
}
// An unchanged reference reported by the migration (C2 dangling, external QName).
// Parity sync PS-32: source and result address the property location
// `<element>/<escaped property>` (DESIGN L510, L755; harmonization B9), the
// convention of the validate dangling entry; targetId stays the referencing element.
function remapObservation(code, input, output, elementPtr, property) {
  const location = `${elementPtr}/${esc(property)}`;
  const before = at(input, location), after = at(output, location);
  if (!before.present || jcs(before.value) !== jcs(after.value)) throw Error(`remap observation ${elementPtr}: value changed`);
  return { code, severity: "error", classification: "integrity", stage: "import", ruleId: "remap-ids", messageKey: code, disposition: "observed",
    source: { domain: "tree", pointer: location, targetId: inputTargetId(input, elementPtr), provenance: "exact" },
    result: { domain: "tree", pointer: location, targetId: outputTargetId(output, elementPtr), provenance: "exact" },
    property, beforePresent: true, before: clone(before.value), afterPresent: true, after: clone(after.value) };
}
function remapCase(meta, { input, importedDi = archived([]), map, extra, expectedTree, expectedBindings, expectedDiagrams, refusal, activation = QUALIFICATION, observations = [], approved = true }) {
  const inputArtifacts = [artifact("envelope", input), artifact("importedDi", importedDi), ...activationArtifacts(activation)];
  const commandArtifact = migrationCommand(map, extra, { approved });
  const callerState = artifact("caller-state", { envelope: input, importedDi });
  if (refusal) {
    addCase(meta, { operation: "remapIds", phase: "import", profile: "main", inputArtifacts, commandArtifact, expectedStatus: `refused:${refusal}`,
      expectedArtifacts: [artifact("result", refusedResult("remapIds", echoOf(input), refusal)), callerState],
      comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
    return;
  }
  const output = envelope("main", expectedTree, expectedBindings ?? []);
  const entries = observations.map(([code, elementPtr, property]) => remapObservation(code, input.tree, output.tree, elementPtr, property));
  const result = okResult("remapIds", input, { envelope: output, importedDi: archived(expectedDiagrams ?? importedDi.diagrams) }, output, entries, { idMap: idRows(input.tree, map) });
  addCase(meta, { operation: "remapIds", phase: "import", profile: "main", inputArtifacts, commandArtifact, expectedStatus: "ok",
    expectedArtifacts: [artifact("result", result), callerState], comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
  return output;
}
{
  // DI of the archived import: the main diagram and the called process's own view
  // (the persisted navigation input: calledElement -> Process -> its diagram).
  const di = (task, flow, sub) => [
    { $type: "bpmndi:BPMNDiagram", id: "Diagram_1", name: "Old diagram", plane: { $type: "bpmndi:BPMNPlane", id: "Plane_1", bpmnElement: "Collaboration_x", planeElement: [
      { $type: "bpmndi:BPMNShape", id: "Shape_task", bpmnElement: task, bounds: { $type: "dc:Bounds", x: 100, y: 80, width: 100, height: 80 } },
      { $type: "bpmndi:BPMNEdge", id: "Edge_flow", bpmnElement: flow, waypoint: [{ $type: "dc:Point", x: 50, y: 120 }, { $type: "dc:Point", x: 100, y: 120 }] }] } },
    { $type: "bpmndi:BPMNDiagram", id: "Diagram_sub", name: "Sub process view", plane: { $type: "bpmndi:BPMNPlane", id: "Plane_sub", bpmnElement: sub, planeElement: [] } }];
  const tree = ({ proc, sub, task, flow1 }) => X.defs("Definitions_old", [
    X.process(proc, "Old process", { laneSets: [X.laneSet("LaneSet_x", "Roles", [X.lane("Lane_x", "Clerk", [task])])], flowElements: [
      X.start("Start_old", "Start", [flow1]), X.task(task, "Handle", [flow1], ["Flow_old_2"]), X.end("End_old", "End", ["Flow_old_2"]),
      X.call("Call_old", "Sub", [], [], { calledElement: sub }), X.flow(flow1, "Start_old", task), X.flow("Flow_old_2", task, "End_old")] }),
    X.process(sub, "Sub process body"),
    X.collab("Collaboration_x", "Pool collaboration", [X.participant("Participant_x", "Old pool", proc)])]);
  const oldIds = { proc: "Process_old", sub: "Process_sub_old", task: "Task_old", flow1: "Flow_old_1" }, newIds = { proc: "Process_new", sub: "Process_sub_new", task: "Task_new", flow1: "Flow_new_1" };
  const input = envelope("main", tree(oldIds), [binding("Process_old", "collaboration", "Collaboration_x"), binding("Process_old", "main-participant", "Participant_x")]);
  const map = [["Process_old", "Process_new"], ["Task_old", "Task_new"], ["Flow_old_1", "Flow_new_1"], ["Process_sub_old", "Process_sub_new"]];
  const importedDi = archived(di("Task_old", "Flow_old_1", "Process_sub_old"));
  remapCase({ caseId: "l3-imp-remap-total", group: "import", clause: clause("§5.2", 444), cites: [clause("§3.1", 268), clause("§10.1", 753), clause("§8.1", 623)],
    discriminates: "Fails a partial or sequential map application, a remap that misses calledElement, Lane.flowNodeRef, processRef, binding ownerId, DI bpmnElement or the called process's view plane, rewrites DI-own or surviving support IDs, keeps the input revision, or emits an idMap without the identity rows of unchanged elements." },
  { input, importedDi, map, expectedTree: tree(newIds), expectedBindings: [binding("Process_new", "collaboration", "Collaboration_x"), binding("Process_new", "main-participant", "Participant_x")],
    expectedDiagrams: di("Task_new", "Flow_new_1", "Process_sub_new") });
  remapCase({ caseId: "l3-imp-remap-total-edit", group: "import", clause: clause("§5.2", 444), cites: [clause("§13", 921), clause("§16", 1138)],
    discriminates: "Edit activation: the approved ID remap is still gated by OPEN-ID; fails an implementation that applies the remap in edit or refuses with another code than profile-open." },
  { input, importedDi, map, activation: null, refusal: "profile-open" });
  remapCase({ caseId: "l3-imp-remap-unapproved", group: "import", clause: clause("§5.2", 444), cites: [clause("§13", 916)],
    discriminates: "The migration record carries no approval: fails an implementation that treats an ID remap as an implicit import normalization instead of refusing the invocation with operation-error." },
  { input, importedDi, map, approved: false, refusal: "operation-error" });
}
{
  const swapTree = (first, second) => X.defs("Definitions_swap", [X.process("Process_S", "Swap", { flowElements: [
    X.start("Start_S", "Start", ["Flow_S1"]), X.task(first, "First", ["Flow_S1"], ["Flow_S2"]), X.task(second, "Second", ["Flow_S2"], ["Flow_S3"]), X.end("End_S", "End", ["Flow_S3"]),
    X.flow("Flow_S1", "Start_S", first), X.flow("Flow_S2", first, second), X.flow("Flow_S3", second, "End_S")] })]);
  remapCase({ caseId: "l3-imp-remap-swap", group: "import", clause: clause("§5.2", 444), cites: [clause("§3.2", 288)],
    discriminates: "Fails an implementation that applies map entries one by one (the first rename collides with the second task) instead of building the total map first and applying it atomically." },
  { input: envelope("main", swapTree("Task_A", "Task_B")), map: [["Task_A", "Task_B"], ["Task_B", "Task_A"]], expectedTree: swapTree("Task_B", "Task_A") });
  const two = envelope("main", X.defs("Definitions_map", [X.process("Process_M", "Map", { flowElements: [X.task("Task_1", "One", [], []), X.task("Task_2", "Two", [], []), X.task("Task_taken", "Taken", [], [])] })]));
  remapCase({ caseId: "l3-imp-remap-collision", group: "import", clause: clause("§5.2", 444), cites: [clause("§3.2", 288)],
    discriminates: "Fails an implementation that merges Task_1 into the existing unmapped Task_taken, overwrites it, or suffixes the result ID." },
  { input: two, map: [["Task_1", "Task_taken"]], refusal: "id-collision" });
  remapCase({ caseId: "l3-imp-remap-duplicate-result", group: "import", clause: clause("§5.2", 444), cites: [clause("§3.2", 288)],
    discriminates: "Fails an implementation that accepts a non-injective map (two sources to one result) and keeps the last writer." },
  { input: two, map: [["Task_1", "Task_same"], ["Task_2", "Task_same"]], refusal: "id-collision" });
  remapCase({ caseId: "l3-imp-remap-unknown-source", group: "import", clause: clause("§5.2", 444), cites: [clause("§2.2", 132)],
    discriminates: "A map key naming no element of the document: fails an implementation that ignores the stale entry or reports a collision instead of refusing reference-dangling." },
  { input: two, map: [["Task_unknown", "Task_9"]], refusal: "reference-dangling" });
  remapCase({ caseId: "l3-imp-remap-target-grammar", group: "import", clause: clause("§3.2", 290), cites: [clause("§5.2", 444)],
    discriminates: "A result ID outside the authoring subset: fails an implementation that accepts the invalid ID or normalizes it silently instead of refusing profile-schema." },
  { input: two, map: [["Task_1", "1-bad"]], refusal: "profile-schema" });
}
{
  const opaqueTree = id => X.defs("Definitions_ext", [X.process("Process_X", "Extension", { flowElements: [X.task(id, "Carrier", [], [], {
    extensionElements: { $type: "bpmn:ExtensionElements", values: [{ $type: "neutral:Opaque", payload: "Task_old" }] } })] })]);
  remapCase({ caseId: "l3-imp-remap-opaque", group: "import", clause: clause("§5.2", 444), cites: [clause("§13", 916)],
    discriminates: "Fails an implementation that remaps around an opaque extension value without a pinned reference-free attestation, string-replaces inside it, or drops it." },
  { input: envelope("main", opaqueTree("Task_old")), map: [["Task_old", "Task_new"]], refusal: "migration-reference-opaque" });
  remapCase({ caseId: "l3-imp-remap-opaque-attested", group: "import", clause: clause("§5.2", 444), cites: [clause("§3.1", 266)],
    discriminates: "With the attested reference-free property the remap proceeds and the opaque payload stays byte-identical even though it spells the old ID; fails an implementation that rewrites look-alike text or loses the extension value." },
  { input: envelope("main", opaqueTree("Task_old")), map: [["Task_old", "Task_new"]], extra: { referenceFreeAttestations: [{ property: "neutral:Opaque.payload", referenceFree: true, descriptor: PINS.descriptors }] },
    expectedTree: opaqueTree("Task_new") });
  const dangling = X.defs("Definitions_dang", [X.process("Process_D", "Dangling", { flowElements: [X.call("Call_D", "Remote", [], [], { calledElement: "Process_missing" }), X.task("Task_D", "Work", [], [])] })]);
  const danglingOut = clone(dangling); danglingOut.rootElements[0].flowElements[1].id = "Task_E";
  remapCase({ caseId: "l3-imp-remap-dangling", group: "import", clause: clause("§5.2", 444), cites: [clause("§2.2", 132), clause("§4.1", 378)],
    discriminates: "A dangling calledElement stays unchanged and is reported once as an observed reference-dangling entry at its property location while the migration succeeds (harmonization C2, parity sync PS-32); fails an implementation that refuses, fetches or invents the target, rewrites the reference, omits the observation or points it at the element instead of /calledElement." },
  { input: envelope("main", dangling), map: [["Task_D", "Task_E"]], expectedTree: danglingOut, observations: [["reference-dangling", "/rootElements/0/flowElements/0", "calledElement"]] });
  const outside = id => X.defs("Definitions_ids", [X.process("Process_I", "Identifiers", { flowElements: [X.start("Start_I", "Start", ["Flow_I1"]), X.task(id, "Intake", ["Flow_I1"], []),
    X.flow("Flow_I1", "Start_I", id)] })]);
  remapCase({ caseId: "l3-imp-remap-nonsubset-id", group: "import", clause: clause("§3.2", 290), cites: [clause("§5.2", 444), clause("§13", 921)],
    discriminates: "Fails an implementation that normalizes the accepted out-of-subset ID at edit time, refuses the approved explicit migration, or misses the flow reference to the remapped ID." },
  { input: envelope("main", outside("1-intake")), map: [["1-intake", "Task_intake"]], expectedTree: outside("Task_intake") });
}
{
  // Namespace-aware references: QNames resolve through the namespace bindings the
  // import adapter captured (carried by the migration record); only in-document
  // targets are rewritten, preserving the prefix (DESIGN L444).
  const qtree = sub => X.defs("Definitions_q", [X.process("Process_Q", "Qualified", { flowElements: [
    X.call("Call_in", "Internal by QName", [], [], { calledElement: `tns:${sub}` }), X.call("Call_out", "Partner model", [], [], { calledElement: "ext:Process_remote" })] }),
    X.process(sub, "Sub process body")]);
  remapCase({ caseId: "l3-imp-remap-qname", group: "import", clause: clause("§5.2", 444), cites: [clause("§4.1", 378)],
    discriminates: "Fails an implementation that compares QName strings literally (missing tns:Process_sub_old), drops or rewrites the prefix, rewrites the external ext: reference, fetches it, refuses the migration, or omits the unsupported-namespace observation or reports it at the element instead of its property location (parity sync PS-32)." },
  { input: envelope("main", qtree("Process_sub_old")), map: [["Process_sub_old", "Process_sub_new"]],
    extra: { namespaces: [{ prefix: "ext", uri: "urn:external-partner:1" }, { prefix: "tns", uri: NS }] },
    expectedTree: qtree("Process_sub_new"), observations: [["unsupported-namespace", "/rootElements/0/flowElements/1", "calledElement"]] });
}
{
  // Owner remap: references and bindings follow the Process, support IDs survive.
  const partners = (pid, lanes) => X.defs("Definitions_support", [X.process(pid, "Partners", {
    laneSets: [X.laneSet(S_A.laneSet, "lane-set", lanes)],
    flowElements: [X.start("Start_L", "Request", ["Flow_L1"]), X.task("Task_L", "Answer", ["Flow_L1"], ["Flow_L2"]), X.end("End_L", "Answered", ["Flow_L2"]),
      X.flow("Flow_L1", "Start_L", "Task_L"), X.flow("Flow_L2", "Task_L", "End_L")] }),
    X.collab(S_A.collaboration, "collaboration", [X.participant(S_A.main, "main-participant", pid)])]);
  const before = envelope("main", partners("Process_A", []), supportBindings("Process_A", S_A, ["collaboration", "main", "laneSet"]));
  const output = remapCase({ caseId: "l3-imp-remap-owner", group: "import", clause: clause("§5.2", 444), cites: [clause("§7.2", 565), clause("§13", 921)],
    discriminates: "Owner remap Process_A -> Process_R: fails an implementation that leaves binding ownerIds or the main processRef on the old ID, or reallocates the surviving Collaboration, main Participant and LaneSet from the new owner." },
  { input: before, map: [["Process_A", "Process_R"]], expectedTree: partners("Process_R", []),
    expectedBindings: [binding("Process_R", "collaboration", S_A.collaboration), binding("Process_R", "main-participant", S_A.main), binding("Process_R", "lane-set", S_A.laneSet)] });
  if (jcs(output) !== jcs(SHARED.afterRemap)) throw Error("owner remap output must be the l3-n-after-owner-remap input");
}
{
  // Out-of-base projection with typed losses (DESIGN L450, L755, L766; B15).
  const source = X.defs("Definitions_proj", [X.process("Process_J", "Projection", {
    flowElements: [
      { $type: "bpmn:ComplexGateway", id: "ComplexGateway_X", name: "Complex", gatewayDirection: "Unspecified", incoming: ["Flow_a"], outgoing: ["Flow_b"] },
      X.start("Start_J", "Start", ["Flow_a", "Flow_d"]),
      X.task("Task_J", "Work", ["Flow_b", "Flow_d"], ["Flow_c"], { properties: [X.prop("Property_J1"), X.prop("Property_J2"), X.prop("Property_J3")],
        dataInputAssociations: [X.dia("DIA_drop", ["Legacy_1"], "Property_J1"), X.dia("DIA_keep", ["Legacy_1", "DataObjectReference_K"], "Property_J2")],
        dataOutputAssociations: [X.doa("DOA_drop", ["Property_J3"], "Legacy_1")] }),
      X.end("End_J", "End", ["Flow_c"]),
      X.flow("Flow_a", "Start_J", "ComplexGateway_X"), X.flow("Flow_b", "ComplexGateway_X", "Task_J"), X.flow("Flow_c", "Task_J", "End_J"), X.flow("Flow_d", "Start_J", "Task_J"),
      { $type: "neutral:LegacyItem", id: "Legacy_1", name: "Legacy form" },
      X.dor("DataObjectReference_K", "DataObject_K"), X.dobj("DataObject_K")],
    artifacts: [X.note("Note_J", "Complex rule"), X.assoc("Assoc_J", "Note_J", "ComplexGateway_X", "None"), X.assoc("Assoc_K", "Note_J", "Task_J", "None")] })]);
  const projected = X.defs("Definitions_proj", [X.process("Process_J", "Projection", {
    flowElements: [
      X.start("Start_J", "Start", ["Flow_d"]),
      X.task("Task_J", "Work", ["Flow_d"], ["Flow_c"], { properties: [X.prop("Property_J1"), X.prop("Property_J2"), X.prop("Property_J3")],
        dataInputAssociations: [X.dia("DIA_keep", ["DataObjectReference_K"], "Property_J2")], dataOutputAssociations: [] }),
      X.end("End_J", "End", ["Flow_c"]),
      X.flow("Flow_c", "Task_J", "End_J"), X.flow("Flow_d", "Start_J", "Task_J"),
      X.dor("DataObjectReference_K", "DataObject_K"), X.dobj("DataObject_K")],
    artifacts: [X.note("Note_J", "Complex rule"), X.assoc("Assoc_K", "Note_J", "Task_J", "None")] })]);
  const dropped = ["/rootElements/0/flowElements/0", "/rootElements/0/flowElements/4", "/rootElements/0/flowElements/5", "/rootElements/0/flowElements/8",
    "/rootElements/0/flowElements/2/dataInputAssociations/0", "/rootElements/0/flowElements/2/dataOutputAssociations/0", "/rootElements/0/artifacts/1"];
  const lossEntries = dropped.map(pointer => {
    const node = at(source, pointer);
    if (!node.present || !idBearing(node.value)) throw Error(`projection pointer ${pointer}`);
    return { code: "import-loss/unsupported-feature", severity: "warn", classification: "loss", stage: "import", ruleId: "adapter", messageKey: "import.loss.unsupported-feature",
      disposition: "dropped", source: { domain: "tree", pointer, targetId: node.value.id, provenance: "exact" }, result: clone(UNAVAILABLE),
      beforePresent: true, before: clone(node.value), afterPresent: false, lossClass: "unsupported-feature" };
  });
  const text = JSON.stringify(source);
  // Parity sync PS-21: the projection is read-only and commits nothing, so there is
  // no committed output envelope revision (DESIGN L268, L737): revision = baseRevision
  // and report.outputRevision = report.inputRevision.
  const identity = PROFILES.main.identity, baseRevision = importBase(source), revision = baseRevision;
  const r = report("importProjection", { target: identity, inputRevision: baseRevision, outputRevision: revision, entries: lossEntries });
  const result = { status: "ok", operation: "importProjection", profileIdentity: clone(identity), baseRevision, revision, report: r, payload: { tree: projected } };
  addCase({ caseId: "l3-imp-projection-out-of-base", group: "import", clause: clause("§5.3", 450), cites: [clause("§10.1", 755, 766), clause("§3.1", 268)],
    discriminates: "Fails an implementation that refuses the whole document because out-of-base types exist, keeps references to removed flows or to the removed item, removes the retained direct flow or the data association that keeps a retained source, keeps an emptied data-association shell or the Association to the removed gateway, recomputes source pointers after removal (index 0 removed), or reports a committed revision for the read-only projection (parity sync PS-21)." },
  { operation: "importProjection", phase: "import", profile: "main", inputArtifacts: [textArtifact("source", text)], expectedStatus: "ok",
    expectedArtifacts: [artifact("result", result), textArtifact("caller-state", text)], comparatorIds: ["result-1/lot3", "source-preservation/lot3", "profile-c14n/2"] });
}

// ================================================================ GROUP transaction adapter (DESIGN §8.1-§8.2; harmonization C8, C10, I1-I5, J1)
// No accepted lot-0 transaction prototype or receipt exists at the seal base, so
// these canvas scripts seal the programmatic contract only. Commands are lot-5
// command records (I3); a gesture's final intent enters through the
// `stageGesture` adapter seam; live pointer interception stays UNSEALED (OPEN-HOOK).
// The scripts run on the real canvas through the transaction-phase hook of the
// README ("Operations, inputs and seams"); every injected outcome is the value a real
// call returned, never a record the adapter writes itself. Change entries carry the
// coordinates of the transaction: source in its before-tree, result in its committed
// tree (DESIGN L751, L755, L766, §8.2 L629, L632-L633), so a write on an element that a
// command of the same transaction created has the generated source.
const TX = {
  start: stableId("Process_T", "start", "start", "draft start"), task: stableId("Process_T", "task", "review", "draft task"),
  flow1: stableId("Process_T", "flow", "start-review", "draft flow 1"), end: stableId("Process_T", "end", "done", "draft end"),
  flow2: stableId("Process_T", "flow", "review-done", "draft flow 2"),
  a: stableId("Process_T", "task", "a", "batch task a"), b: stableId("Process_T", "task", "b", "batch task b"), c: stableId("Process_T", "process-input", "c", "process input c"),
};
const txTree = (flowElements, processExtra = {}, extraRoots = [], participants) => X.defs("Definitions_tx", [X.process("Process_T", "Draft", { ...(flowElements.length ? { flowElements } : {}), ...processExtra }),
  ...extraRoots, X.collab("Collaboration_T", "Pool collaboration", participants ?? [X.participant("Participant_T", "Draft pool", "Process_T")])]);
const txBindings = [binding("Process_T", "collaboration", "Collaboration_T"), binding("Process_T", "main-participant", "Participant_T")];
const txEnvelope = (flowElements, processExtra, extraBindings = [], extraRoots, participants) => {
  const tree = txTree(flowElements, processExtra, extraRoots, participants); checkComplete(tree, "tx"); return envelope("main", tree, [...txBindings, ...extraBindings]);
};
const draftStates = [
  [],
  [X.start(TX.start, "Request received", [])],
  [X.start(TX.start, "Request received", []), X.task(TX.task, "Review request", [], [])],
  [X.start(TX.start, "Request received", [TX.flow1]), X.task(TX.task, "Review request", [TX.flow1], []), X.flow(TX.flow1, TX.start, TX.task)],
  [X.start(TX.start, "Request received", [TX.flow1]), X.task(TX.task, "Review request", [TX.flow1], []), X.flow(TX.flow1, TX.start, TX.task), X.end(TX.end, "Request closed", [])],
  [X.start(TX.start, "Request received", [TX.flow1]), X.task(TX.task, "Review request", [TX.flow1], [TX.flow2]), X.flow(TX.flow1, TX.start, TX.task),
    X.end(TX.end, "Request closed", [TX.flow2]), X.flow(TX.flow2, TX.task, TX.end)],
].map(list => txEnvelope(list));
const [E0, E1, E2, E3, E4, E5] = draftStates;
const Ea = txEnvelope([X.task(TX.a, "First", [], [])]);
const Eab = txEnvelope([X.task(TX.a, "First", [], []), X.task(TX.b, "Second", [], [])]);
const surface = (entry, context) => ({ command: "surface", entry, context });
const START_CMD = surface("start-create", { owner: "Process_T", key: "start", value: "Request received" });
const TASK_CMD = surface("task-create", { owner: "Process_T", key: "review", value: "Review request" });
const FLOW1_CMD = surface("flow-connect", { owner: "Process_T", source: TX.start, target: TX.task, key: "start-review" });
const END_CMD = surface("end-create", { owner: "Process_T", key: "done", value: "Request closed" });
const FLOW2_CMD = surface("flow-connect", { owner: "Process_T", source: TX.task, target: TX.end, key: "review-done" });
const TASK_A_CMD = surface("task-create", { owner: "Process_T", key: "a", value: "First" });
const TASK_B_CMD = surface("task-create", { owner: "Process_T", key: "b", value: "Second" });
const draftFindings = (e, list) => list.map(([ruleId, id]) => finding(e.tree, ruleId, id, "draft"));
const all4Draft = (e, id) => draftFindings(e, [["ordinary-incoming", id], ["ordinary-outgoing", id], ["ordinary-from-start", id], ["ordinary-to-end", id]]);
const cEntries = (before, after, specs, createdElsewhere = []) => changeEntries("complete", before.tree, after.tree, specs, { createdElsewhere });
const PAGE = "page_T";
const PLACEHOLDER = "unsealed";
const VIEW_PTR = "/result/payload/viewRevision";
const REPORT_PTR = "/result/report";
const same = (step, pointer) => ({ $same: { step, pointer } });
const differs = (step, pointer) => ({ $differs: { step, pointer } });
const refTo = (step, pointer) => ({ $ref: { step, pointer } });
const REASONS = {
  subscription: "Subscription IDs are session-local and excluded from parity (DESIGN L606).",
  loadView: "The first viewRevision of a canvas-laid-out document depends on lot-4 layout geometry; later steps compare to it by relation only.",
  report: "DESIGN L584-L599 and L641 define no report content for load, snapshot restore, theme, undo or redo results (source gap); the change event of the step carries this same report (L606, L633) and is compared with it by relation.",
  eventTx: "DESIGN L606 names transactionId in every change event but defines no value for load, snapshot, theme, undo or redo origins (source gap).",
  epoch: "History epochs are host counters excluded from parity (DESIGN L268, L594).",
  layoutPages: "Pages of a canvas-computed layout are lot-4 outputs (DESIGN L667, L723); the record is Layout/1 (L610, L667), so its layoutVersion is compared.",
  layoutGeometry: "Geometry and occurrence keys of a canvas-computed layout are lot-4 outputs (DESIGN L667, L723); restoring them is compared by relation.",
  selection: "Selection after a creation or deletion is not defined by DESIGN L629-L633 beyond preservation on refusal and no-op.",
  activePage: "The active page ID of a canvas-computed layout is a lot-4 output.",
  route: "Edge routing after a move is not pinned by DESIGN (L723 has no routing rule; harmonization K5, erratum E-11).",
  notice: "DESIGN L641 requires a correction notice but defines no Report/2 spelling for it (source gap); only its presence as the single entry is compared.",
};
function script() {
  const steps = [], trace = [], unsealed = [];
  return {
    steps, trace, unsealed,
    next: () => steps.length + 1,
    add(call, expected, unseal = []) {
      const step = steps.length + 1;
      steps.push({ step, ...call });
      trace.push({ step, ...expected });
      for (const [pointer, reason] of unseal) unsealed.push({ artifact: "trace", pointer: `/${step - 1}${pointer}`, reason: REASONS[reason] });
      return step;
    },
  };
}
const quiet = listeners => Object.fromEntries(listeners.map(l => [l, []]));
const changeEvent = (e, viewRevisionValue, transactionId, origin, reportValue) =>
  ({ envelope: clone(e), semanticRevision: e.semanticRevision, viewRevision: viewRevisionValue, transactionId, origin, report: reportValue });
const eventUnseal = (listeners, fields) => listeners.flatMap(l => fields.map(([f, reason]) => [`/events/${l}/0/${f}`, reason]));
function onChange(s, listener, listeners) {
  return s.add({ call: "onChange", listener }, { result: { status: "ok", payload: { subscriptionId: PLACEHOLDER }, diagnostics: [] }, events: quiet(listeners) },
    [["/result/payload/subscriptionId", "subscription"]]);
}
// A load, snapshot, theme, undo or redo event carries the report of its own committed
// result (DESIGN L606, L633, L735): a relation, since that report's content is a source gap.
function load(s, e, listeners = ["L1"]) {
  const step = s.next();
  return s.add({ call: "setDefinitions", envelope: e, options: { mode: "draft" } },
    { result: { status: "ok", operation: "setDefinitions", profileIdentity: clone(e.profileIdentity), baseRevision: e.semanticRevision, revision: e.semanticRevision, report: PLACEHOLDER,
        payload: { envelope: clone(e), semanticRevision: e.semanticRevision, viewRevision: PLACEHOLDER } },
      history: { past: 0, future: 0 },
      events: Object.fromEntries(listeners.map(l => [l, [changeEvent(e, same(step, VIEW_PTR), PLACEHOLDER, "load", same(step, REPORT_PTR))]])) },
    [[REPORT_PTR, "report"], [VIEW_PTR, "loadView"], ...eventUnseal(listeners, [["transactionId", "eventTx"]])]);
}
function restore(s, snapshot, listeners = ["L1"]) {
  const e = snapshot.envelope;
  const step = s.next();
  return s.add({ call: "restoreSnapshot", snapshot, options: {} },
    { result: { status: "ok", operation: "restoreSnapshot", profileIdentity: clone(e.profileIdentity), baseRevision: e.semanticRevision, revision: e.semanticRevision, report: PLACEHOLDER,
        payload: { envelope: clone(e), semanticRevision: e.semanticRevision, viewRevision: snapshot.viewRevision, historyEpoch: PLACEHOLDER } },
      history: { past: 0, future: 0 },
      events: Object.fromEntries(listeners.map(l => [l, [changeEvent(e, snapshot.viewRevision, PLACEHOLDER, "snapshot", same(step, REPORT_PTR))]])) },
    [[REPORT_PTR, "report"], ["/result/payload/historyEpoch", "epoch"], ...eventUnseal(listeners, [["transactionId", "eventTx"]])]);
}
function getDefinitions(s, e, listeners = ["L1"]) {
  return s.add({ call: "getDefinitions" }, { result: okResult("getDefinitions", e, clone(e), e, []), events: quiet(listeners) });
}
function getSnapshotExact(s, snapshot, listeners = ["L1"]) {
  return s.add({ call: "getSnapshot" }, { result: okResult("getSnapshot", snapshot.envelope, clone(snapshot), snapshot.envelope, []), events: quiet(listeners) });
}
// Snapshot of a canvas-laid-out state: semantic parts exact, the Layout/1 record with its
// version (DESIGN L610, L667), lot-4 pages and geometry by relation.
function getSnapshotCanvas(s, e, viewStep, { themeId = "plain", activePageId, listeners = ["L1"] } = {}) {
  const layout = { layoutVersion: "1", pages: PLACEHOLDER, geometry: PLACEHOLDER };
  const payload = { snapshotVersion: "1", envelope: clone(e), presentation: { layout, themeId, overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] },
    importedDi: archived([]), selection: PLACEHOLDER, activePageId: activePageId ?? PLACEHOLDER }, viewRevision: same(viewStep, VIEW_PTR) };
  return s.add({ call: "getSnapshot" }, { result: okResult("getSnapshot", e, payload, e, []), events: quiet(listeners) },
    [["/result/payload/presentation/layout/pages", "layoutPages"], ["/result/payload/presentation/layout/geometry", "layoutGeometry"], ["/result/payload/presentation/selection", "selection"],
      ...(activePageId ? [] : [["/result/payload/presentation/activePageId", "activePage"]])]);
}
function apply(s, { call = "applyCommands", before, after, txId, commands, gesture, entries = [], viewFrom, changed = true, history, listeners = ["L1"], signal, inject, injected, viewRevisionValue }) {
  const step = s.next();
  const request = { baseRevision: before.semanticRevision, expectedViewRevision: refTo(viewFrom, VIEW_PTR), transactionId: txId, ...(commands ? { commands } : {}), ...(gesture ? { gesture } : {}), ...(signal ? { signal } : {}) };
  const result = okResult("applyCommands", before, { envelope: clone(after), semanticRevision: after.semanticRevision, viewRevision: viewRevisionValue ?? differs(viewFrom, VIEW_PTR), transactionId: txId, changed }, after, entries);
  const events = changed ? Object.fromEntries(listeners.map(l => [l, [changeEvent(after, same(step, VIEW_PTR), txId, "command", clone(result.report))]])) : quiet(listeners);
  return s.add({ call, request, ...(inject ? { inject } : {}) }, { result, history, events, ...(injected ? { injected } : {}) });
}
function applyRefused(s, { before, code, txId, commands, viewFrom, history, listeners = ["L1"], signal, inject, injected, entries = [], echo = true, request }) {
  return s.add({ call: "applyCommands", request: request ?? { baseRevision: before.semanticRevision, expectedViewRevision: refTo(viewFrom, VIEW_PTR), transactionId: txId, commands, ...(signal ? { signal } : {}) }, ...(inject ? { inject } : {}) },
    { result: refusedResult("applyCommands", echo ? echoOf(before) : null, code, entries), ...(history ? { history } : {}), events: quiet(listeners), ...(injected ? { injected } : {}) });
}
function history(s, { call, from, to, viewFrom, payload, past, future, listeners = ["L1"] }) {
  const step = s.next();
  return s.add({ call, options: { expectedRevision: from.semanticRevision, expectedViewRevision: refTo(viewFrom, VIEW_PTR) } },
    { result: { status: "ok", operation: call, profileIdentity: clone(to.profileIdentity), baseRevision: from.semanticRevision, revision: to.semanticRevision, report: PLACEHOLDER, payload },
      history: { past, future },
      events: Object.fromEntries(listeners.map(l => [l, [changeEvent(to, same(step, "/result/payload/viewRevision"), PLACEHOLDER, call, same(step, REPORT_PTR))]])) },
    [[REPORT_PTR, "report"], ...eventUnseal(listeners, [["transactionId", "eventTx"]])]);
}
function historyRefused(s, { call, current, expectedRevision, viewFrom, past, future, listeners = ["L1"] }) {
  return s.add({ call, options: { expectedRevision, expectedViewRevision: refTo(viewFrom, VIEW_PTR) } },
    { result: refusedResult(call, echoOf(current), "operation-error"), history: { past, future }, events: quiet(listeners) });
}
const SESSION = { profile: PROFILES.main.file, descriptors: descriptorFile, metrics: { path: PATHS.metrics, sha256: B(fixtureBytes(PATHS.metrics)) }, mode: "business-profile", readiness: "draft", theme: "plain" };
function txCase(meta, s) {
  if (s.steps.length !== s.trace.length) throw Error(`script/trace mismatch ${meta.caseId}`);
  addCase({ runtimes: ["js"], ...meta }, { operation: "transaction-script", phase: null, profile: "main",
    inputArtifacts: [artifact("session", SESSION)],
    commandArtifact: { role: "script", json: { format: "lot3-transaction-script/2", steps: s.steps } },
    expectedStatus: "ok", expectedArtifacts: [artifact("trace", s.trace)], comparatorIds: ["transaction-trace/lot3", "profile-c14n/2"], unsealed: s.unsealed });
}
// Hand-authored Layout/1 records for restored snapshots (restore is not recomputation, L612).
const shape = (key, semanticId, x, y, width, height) => ({ pageId: PAGE, occurrenceKey: key, semanticId, role: "content", bounds: { x, y, width, height } });
const edge = (key, semanticId, from, to, points) => {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { pageId: PAGE, occurrenceKey: key, semanticId, role: "connection", bounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
    sourceOccurrence: { pageId: PAGE, occurrenceKey: from }, targetOccurrence: { pageId: PAGE, occurrenceKey: to }, waypoints: points };
};
const layoutOf = geometry => {
  const sorted = [...geometry].sort((a, b) => cmp(a.occurrenceKey, b.occurrenceKey));
  return { layoutVersion: "1", pages: [{ pageId: PAGE, name: "Draft", order: 0, semanticRootId: "Collaboration_T", bounds: { x: 0, y: 0, width: 600000, height: 240000 } }], geometry: sorted };
};
function snapshotOf(e, layout, { themeId = "plain", selection = [] } = {}) {
  return { snapshotVersion: "1", envelope: clone(e), presentation: { layout: clone(layout), themeId, overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] },
    importedDi: archived([]), selection: clone(selection), activePageId: PAGE }, viewRevision: viewRevision(e.semanticRevision, layout, themeId, MAIN_THEMES[themeId]) };
}
const POOL = shape("pool", "Participant_T", 50000, 30000, 500000, 160000);
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  const s3 = apply(s, { before: E0, after: E1, txId: "tx-start", commands: [START_CMD], viewFrom: loaded, history: { past: 1, future: 0 },
    entries: cEntries(E0, E1, [REF("c-topology-outgoing", fe(0, 0), "outgoing")], [fe(0, 0)]) });
  const s4 = apply(s, { before: E1, after: E2, txId: "tx-task", commands: [TASK_CMD], viewFrom: s3, history: { past: 2, future: 0 },
    entries: [...cEntries(E1, E2, topologyOf(fe(0, 1)), [fe(0, 1)]), ...all4Draft(E2, TX.task)] });
  const s5 = apply(s, { before: E2, after: E3, txId: "tx-flow-1", commands: [FLOW1_CMD], viewFrom: s4, history: { past: 3, future: 0 },
    entries: [...cEntries(E2, E3, [REF("c-topology-outgoing", fe(0, 0), "outgoing"), REF("c-topology-incoming", fe(0, 1), "incoming")], [fe(0, 2)]),
      ...draftFindings(E3, [["ordinary-outgoing", TX.task], ["ordinary-to-end", TX.task]])] });
  const s6 = apply(s, { before: E3, after: E4, txId: "tx-end", commands: [END_CMD], viewFrom: s5, history: { past: 4, future: 0 },
    entries: [...cEntries(E3, E4, [REF("c-topology-incoming", fe(0, 3), "incoming")], [fe(0, 3)]), ...draftFindings(E4, [["ordinary-outgoing", TX.task], ["ordinary-to-end", TX.task]])] });
  const snap4 = getSnapshotCanvas(s, E4, s6);
  const s8 = apply(s, { before: E4, after: E5, txId: "tx-flow-2", commands: [FLOW2_CMD], viewFrom: snap4, history: { past: 5, future: 0 },
    entries: cEntries(E4, E5, [REF("c-topology-outgoing", fe(0, 1), "outgoing"), REF("c-topology-incoming", fe(0, 3), "incoming")], [fe(0, 4)]) });
  const snap5 = getSnapshotCanvas(s, E5, s8);
  const undo = history(s, { call: "undo", from: E5, to: E4, viewFrom: snap5, payload: same(snap4, "/result/payload"), past: 4, future: 1 });
  history(s, { call: "redo", from: E4, to: E5, viewFrom: undo, payload: same(snap5, "/result/payload"), past: 5, future: 0 });
  SHARED.draftFinal = E5;
  txCase({ caseId: "l3-tx-incremental-draft", group: "transaction", clause: clause("§8.2", 632, 641), cites: [clause("§6.2", 474), clause("§16", 1144), clause("§7.1", 544), clause("§8.1", 595, 596)],
    discriminates: "Fails an adapter that creates more than one history entry per command, recomputes IDs or reruns C/N on undo/redo, returns anything but the exact restored Snapshot/1 (envelope, presentation, selection, viewRevision), emits raw or intermediate change events, refuses incomplete drafts instead of reporting draft lint entries, or omits the C topology entries of each step. Each C write carries the coordinates of its own transaction (DESIGN L751, L755): generated for an element created by that transaction, exact for one created by an earlier transaction; fails an adapter that reports the coordinates of its staged tree." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  const snap0 = getSnapshotCanvas(s, E0, loaded);
  const batch = apply(s, { before: E0, after: Eab, txId: "tx-batch", commands: [TASK_A_CMD, TASK_B_CMD], viewFrom: snap0, history: { past: 1, future: 0 },
    entries: [...cEntries(E0, Eab, [...topologyOf(fe(0, 0)), ...topologyOf(fe(0, 1))], [fe(0, 0), fe(0, 1)]), ...all4Draft(Eab, TX.a), ...all4Draft(Eab, TX.b)] });
  const snap1 = getSnapshotCanvas(s, Eab, batch);
  const undo = history(s, { call: "undo", from: Eab, to: E0, viewFrom: snap1, payload: same(snap0, "/result/payload"), past: 0, future: 1 });
  history(s, { call: "redo", from: E0, to: Eab, viewFrom: undo, payload: same(snap1, "/result/payload"), past: 1, future: 0 });
  txCase({ caseId: "l3-tx-batch-one-entry", group: "transaction", clause: clause("§8.2", 632), cites: [clause("§8.2", 641), clause("§2.4", 158)],
    discriminates: "Fails an adapter that records one history entry per command of a batch, so a single undo would leave the first task behind, emits one callback per command, or runs C/N between the two commands. The four C topology writes on the two created tasks carry the transaction coordinates (DESIGN L751, L755, L766): generated source and generated result; fails an adapter that reports them at the exact coordinates of its staged tree." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  applyRefused(s, { before: E0, code: "operation-cancelled", txId: "tx-cancel", commands: [TASK_A_CMD], viewFrom: loaded, signal: { aborted: true }, history: { past: 0, future: 0 } });
  getDefinitions(s, E0);
  txCase({ caseId: "l3-tx-cancelled", group: "transaction", clause: clause("§8.2", 629), cites: [clause("§8.1", 604), clause("§8.2", 633)],
    discriminates: "Fails an adapter that stages or commits a request whose signal is already aborted, rejects the Promise instead of returning operation-cancelled with the echoed identity and empty diagnostics, or emits a change event." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  applyRefused(s, { before: E0, code: "operation-cancelled", txId: "tx-cancel-late", commands: [TASK_A_CMD], viewFrom: loaded, signal: { aborted: false },
    inject: { phase: "staging", action: "abort-signal" }, history: { past: 0, future: 0 } });
  getDefinitions(s, E0);
  txCase({ caseId: "l3-tx-cancel-pending", group: "transaction", clause: clause("§8.2", 633), cites: [clause("§8.1", 604)],
    discriminates: "The signal aborts after the request is accepted and staging began: fails an adapter that finishes the staged transaction, commits part of it, pushes a history entry, emits an event, or reports a code other than operation-cancelled." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  const created = apply(s, { before: E0, after: Ea, txId: "tx-a", commands: [TASK_A_CMD], viewFrom: loaded, history: { past: 1, future: 0 },
    entries: [...cEntries(E0, Ea, topologyOf(fe(0, 0)), [fe(0, 0)]), ...all4Draft(Ea, TX.a)] });
  s.add({ call: "dispose" }, { result: { status: "ok", payload: { disposed: true }, diagnostics: [] }, events: quiet(["L1"]) });
  s.add({ call: "applyCommands", request: { baseRevision: Ea.semanticRevision, expectedViewRevision: refTo(created, VIEW_PTR), transactionId: "tx-b", commands: [TASK_B_CMD] } },
    { result: refusedResult("applyCommands", null, "canvas-disposed"), events: quiet(["L1"]) });
  s.add({ call: "getDefinitions" }, { result: refusedResult("getDefinitions", null, "canvas-disposed"), events: quiet(["L1"]) });
  s.add({ call: "onChange", listener: "L2" }, { result: { status: "refused", code: "canvas-disposed", diagnostics: [] }, events: quiet(["L1", "L2"]) });
  s.add({ call: "unsubscribe", listener: "L1" }, { result: { status: "refused", code: "canvas-disposed", diagnostics: [] }, events: quiet(["L1", "L2"]) });
  txCase({ caseId: "l3-tx-dispose-no-leak", group: "transaction", clause: clause("§8.2", 635), cites: [clause("§8.1", 604, 606)],
    discriminates: "Fails an adapter that keeps delivering callbacks after dispose, resolves later calls successfully, rejects instead of returning canvas-disposed, fabricates an identity echo after disposal, or keeps a subscription usable after disposal." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  applyRefused(s, { before: E0, code: "canvas-disposed", txId: "tx-a", commands: [TASK_A_CMD], viewFrom: loaded, echo: false,
    inject: { phase: "staging", action: "dispose" }, injected: { status: "ok", payload: { disposed: true }, diagnostics: [] } });
  s.add({ call: "getDefinitions" }, { result: refusedResult("getDefinitions", null, "canvas-disposed"), events: quiet(["L1"]) });
  txCase({ caseId: "l3-tx-dispose-pending", group: "transaction", clause: clause("§8.1", 604), cites: [clause("§8.2", 635), clause("§8.1", 619)],
    discriminates: "Disposal while a transaction is staging: fails an adapter that commits the pending transaction, emits a success event, leaves the guard in staging, or answers anything but canvas-disposed afterwards." }, s);
}
// A nested public applyCommands call made by the applying-phase hook (DESIGN L635). Its
// request is valid against the committed revision and view, so only the transaction guard
// can refuse it; nothing is committed before the root transaction ends (L632-L633), so the
// refusal echoes the committed identity and revision with an empty report (B2, B3).
const nestedTaskB = (loaded, transactionId) => ({ baseRevision: E0.semanticRevision, expectedViewRevision: refTo(loaded, VIEW_PTR), transactionId, commands: [TASK_B_CMD] });
const REENTRANT = refusedResult("applyCommands", echoOf(E0), "transaction-reentrant");
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  apply(s, { before: E0, after: Ea, txId: "tx-a", commands: [TASK_A_CMD], viewFrom: loaded, history: { past: 1, future: 0 },
    entries: [...cEntries(E0, Ea, topologyOf(fe(0, 0)), [fe(0, 0)]), ...all4Draft(Ea, TX.a)],
    inject: { phase: "applying", action: "reenter", request: nestedTaskB(loaded, "tx-nested") }, injected: clone(REENTRANT) });
  txCase({ caseId: "l3-tx-reentrant-refused", group: "transaction", clause: clause("§8.2", 635), cites: [clause("§8.2", 632, 633), clause("§8.1", 604), clause("§10.1", 735)],
    discriminates: "A public applyCommands call entering while the root transaction is applying, valid against the committed revision: fails an adapter that executes or queues it (task b committed, a second event or history entry), refuses it with a code other than transaction-reentrant, returns anything but the closed Result/1 refusal that echoes the committed identity and revision with an empty report, or records an outcome without a real nested call (a bare {status, code} record). The native modeling command entry is UNSEALED (U1, OPEN-HOOK)." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  // The hook first makes a nested call (refused transaction-reentrant: the guard is applying),
  // then throws. B2: the refusal report carries the lint entries of the stages run on the stage.
  applyRefused(s, { before: E0, code: "operation-error", txId: "tx-fail", commands: [TASK_A_CMD], viewFrom: loaded, history: { past: 0, future: 0 },
    inject: { phase: "applying", action: "reenter-and-throw", request: nestedTaskB(loaded, "tx-probe") }, injected: clone(REENTRANT), entries: all4Draft(Ea, TX.a) });
  apply(s, { before: E0, after: Ea, txId: "tx-retry", commands: [TASK_A_CMD], viewFrom: loaded, history: { past: 1, future: 0 },
    entries: [...cEntries(E0, Ea, topologyOf(fe(0, 0)), [fe(0, 0)]), ...all4Draft(Ea, TX.a)] });
  txCase({ caseId: "l3-tx-guard-recovery", group: "transaction", clause: clause("§8.2", 635), cites: [clause("§8.1", 604), clause("§10.1", 735)],
    discriminates: "An internal exception thrown by the applying-phase hook after its nested applyCommands call was refused transaction-reentrant (evidence that the guard was applying): fails an adapter that rejects instead of returning operation-error after rollback, drops the attempted candidate lint entries from the refusal report, commits part of the stage, emits an event, leaves the guard in applying so that the retry refuses transaction-reentrant, or returns the refusal without entering applying (no nested outcome)." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  const created = apply(s, { before: E0, after: Ea, txId: "tx-a", commands: [TASK_A_CMD], viewFrom: loaded, history: { past: 1, future: 0 },
    entries: [...cEntries(E0, Ea, topologyOf(fe(0, 0)), [fe(0, 0)]), ...all4Draft(Ea, TX.a)] });
  applyRefused(s, { before: Ea, code: "id-collision", txId: "tx-a-again", commands: [surface("task-create", { owner: "Process_T", key: "a", value: "First again" })], viewFrom: created, history: { past: 1, future: 0 } });
  getDefinitions(s, Ea);
  txCase({ caseId: "l3-tx-refusal-preserves", group: "transaction", clause: clause("§8.2", 633), cites: [clause("§3.2", 288)],
    discriminates: "Fails an adapter that suffixes or overwrites on a computed ID collision, commits a partial stage, pushes a history entry, or emits a change event for a refused command." }, s);
}
{
  const ioExtra = inputs => ({ laneSets: [X.laneSet("LaneSet_T", "Supports", [X.lane("Lane_T_ext", "Outside parties")])],
    ioSpecification: X.io(inputs.map(([id, name]) => X.din(id, name)), [],
      [X.iset("InputSet_1", ["DataInput_a"]), X.iset("InputSet_2", ["DataInput_b", ...inputs.slice(2).map(([id]) => id)])], [X.oset("OutputSet_1")]) });
  const laneBindings = [binding("Process_T", "lane-set", "LaneSet_T"), binding("Process_T", "external-lane", "Lane_T_ext")];
  const Eio = txEnvelope([], ioExtra([["DataInput_a", "A"], ["DataInput_b", "B"]]), laneBindings);
  const Eio2 = txEnvelope([], ioExtra([["DataInput_a", "A"], ["DataInput_b", "B"], [TX.c, "C"]]), laneBindings);
  // One InputSet covering every input: the control of the refusal below.
  const ioSingle = inputs => ({ laneSets: [X.laneSet("LaneSet_T", "Supports", [X.lane("Lane_T_ext", "Outside parties")])],
    ioSpecification: X.io(inputs.map(([id, name]) => X.din(id, name)), [], [X.iset("InputSet_1", inputs.map(([id]) => id))], [X.oset("OutputSet_1")]) });
  const Eio1 = txEnvelope([], ioSingle([["DataInput_a", "A"], ["DataInput_b", "B"]]), laneBindings);
  const Eio1c = txEnvelope([], ioSingle([["DataInput_a", "A"], ["DataInput_b", "B"], [TX.c, "C"]]), laneBindings);
  const ioDraft = (e, list) => draftFindings(e, list.flatMap(id => [["input-supplier", id], ["input-consumer", id]]));
  const UNASSIGNED_CMD = surface("input-create-unassigned", { owner: "Process_T", key: "c", value: "C" });
  {
    // The command stages DataInput C without a set; C then meets two InputSets and an
    // uncovered input and its recipe c-io-input-uncovered-several refuses (DESIGN L547,
    // L172): the refusal comes from C, before any lint stage. With one InputSet the same
    // command is completed by c-io-input-uncovered-single, which appends the input.
    const s = script();
    onChange(s, "L1", ["L1"]);
    const loaded = load(s, Eio);
    applyRefused(s, { before: Eio, code: "io-set-selection-required", txId: "tx-input", commands: [UNASSIGNED_CMD], viewFrom: loaded, history: { past: 0, future: 0 } });
    getDefinitions(s, Eio);
    const single = load(s, Eio1);
    apply(s, { before: Eio1, after: Eio1c, txId: "tx-input-single", commands: [UNASSIGNED_CMD], viewFrom: single, history: { past: 1, future: 0 },
      entries: [...cEntries(Eio1, Eio1c, [REF("c-io-input-uncovered-single", "/rootElements/0/ioSpecification/inputSets/0", "dataInputRefs")]), ...ioDraft(Eio1c, ["DataInput_a", "DataInput_b", TX.c])] });
    txCase({ caseId: "l3-tx-io-set-selection-required", group: "transaction", clause: clause("§7.1", 547), cites: [clause("§8.3", 651), clause("§16", 1154), clause("§2.4", 172)],
      discriminates: "Fails an adapter or C that silently appends the new input to the first set when several sets exist; the command refuses with io-set-selection-required, no lint stage ran (empty report) and tree, history and callbacks stay untouched. The refusal is the outcome of the C recipe on two sets: with a single InputSet the same unassigned command succeeds and C appends the input to that set (c-io-input-uncovered-single), so an adapter that refuses by entry name without running C fails the last step." }, s);
  }
  {
    const s = script();
    onChange(s, "L1", ["L1"]);
    const loaded = load(s, Eio);
    const snap0 = getSnapshotCanvas(s, Eio, loaded);
    const input = apply(s, { before: Eio, after: Eio2, txId: "tx-input", commands: [surface("input-create", { owner: "Process_T", key: "c", value: "C", target: "InputSet_2" })], viewFrom: snap0,
      history: { past: 1, future: 0 }, entries: ioDraft(Eio2, ["DataInput_a", "DataInput_b", TX.c]) });
    const snap1 = getSnapshotCanvas(s, Eio2, input);
    const undo = history(s, { call: "undo", from: Eio2, to: Eio, viewFrom: snap1, payload: same(snap0, "/result/payload"), past: 0, future: 1 });
    history(s, { call: "redo", from: Eio, to: Eio2, viewFrom: undo, payload: same(snap1, "/result/payload"), past: 1, future: 0 });
    txCase({ caseId: "l3-tx-io-set-explicit-selection", group: "transaction", clause: clause("§7.1", 547), cites: [clause("§8.2", 641), clause("§8.3", 651)],
      discriminates: "Fails an adapter that ignores the explicitly selected InputSet_2 (appending to InputSet_1 or to both), or whose undo/redo does not restore the exact sets and presentation." }, s);
  }
}
{
  // DI-only move of an occurrence whose geometry is fully authored (restored snapshot).
  const E = SHARED.draftFinal;
  const geometry = [POOL, shape("start", TX.start, 100000, 92000, 36000, 36000), shape("task", TX.task, 200000, 70000, 100000, 80000), shape("end", TX.end, 400000, 92000, 36000, 36000),
    edge("flow-1", TX.flow1, "start", "task", [{ x: 136000, y: 110000 }, { x: 200000, y: 110000 }]), edge("flow-2", TX.flow2, "task", "end", [{ x: 300000, y: 110000 }, { x: 400000, y: 110000 }])];
  const layout = layoutOf(geometry);
  const selection = [{ pageId: PAGE, occurrenceKey: "task" }];
  const restored = snapshotOf(E, layout, { selection });
  const moved = clone(layout);
  moved.geometry.find(g => g.occurrenceKey === "task").bounds.x += 40000;
  const s = script();
  onChange(s, "L1", ["L1"]);
  const r = restore(s, restored);
  const exact = getSnapshotExact(s, restored);
  const move = apply(s, { call: "stageGesture", before: E, after: E, txId: "tx-move", gesture: { kind: "move", pageId: PAGE, occurrenceKey: "task", delta: { x: 40000, y: 0 } }, viewFrom: exact, history: { past: 1, future: 0 } });
  const after = s.add({ call: "getSnapshot" }, { result: okResult("getSnapshot", E, { snapshotVersion: "1", envelope: clone(E), presentation: { ...clone(restored.presentation), layout: moved }, viewRevision: same(move, VIEW_PTR) }, E, []),
    events: quiet(["L1"]) }, moved.geometry.flatMap((g, i) => g.role === "connection" ? [[`/result/payload/presentation/layout/geometry/${i}/bounds`, "route"], [`/result/payload/presentation/layout/geometry/${i}/waypoints`, "route"]] : []));
  const undo = history(s, { call: "undo", from: E, to: E, viewFrom: after, payload: clone(restored), past: 0, future: 1 });
  history(s, { call: "redo", from: E, to: E, viewFrom: undo, payload: same(after, "/result/payload"), past: 1, future: 0 });
  if (r !== 2) throw Error("di move script order");
  txCase({ caseId: "l3-tx-di-only-move", group: "transaction", clause: clause("§8.2", 630, 631), cites: [clause("§3.1", 268), clause("§8.2", 641), clause("§8.1.1", 610, 612), clause("§9.2", 690)],
    discriminates: "Fails an adapter that skips a drag because semanticRevision is unchanged, changes semanticRevision for a DI-only move, moves the task by another delta or other shapes too, drops the selection, creates zero or two history entries, or whose undo does not restore the exact archived Snapshot/1 including viewRevision." }, s);
}
{
  // Corrected no-op: a region-placed reference dragged off its band snaps back (DESIGN L641, L723).
  const flows = draftStates[5].tree.rootElements[0].flowElements;
  const Eband = txEnvelope([...clone(flows), X.dsr("DataStoreReference_T", "DataStore_T")], { artifacts: [X.assoc("Assoc_RefT", "DataStoreReference_T", TX.task)] },
    [binding("Process_T", "reference-band", "Participant_Band")], [X.dstore("DataStore_T", "Rules")],
    [X.participant("Participant_T", "Draft pool", "Process_T"), X.participant("Participant_Band", "reference documents")]);
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, Eband);
  const snap = getSnapshotCanvas(s, Eband, loaded);
  const step = s.next();
  s.add({ call: "stageGesture", request: { baseRevision: Eband.semanticRevision, expectedViewRevision: refTo(snap, VIEW_PTR), transactionId: "tx-noop",
    gesture: { kind: "move", semanticId: "DataStoreReference_T", delta: { x: 50000, y: 0 } } } },
  { result: okResult("applyCommands", Eband, { envelope: clone(Eband), semanticRevision: Eband.semanticRevision, viewRevision: same(snap, VIEW_PTR), transactionId: "tx-noop", changed: false }, Eband,
    [{ code: PLACEHOLDER, severity: "info", classification: "repairable", stage: "normalize", ruleId: PLACEHOLDER, messageKey: PLACEHOLDER, disposition: "corrected",
      source: clone(UNAVAILABLE), result: clone(UNAVAILABLE), beforePresent: false, afterPresent: false }]),
    history: { past: 0, future: 0 }, events: quiet(["L1"]) }, [["/result/report/entries/0", "notice"]]);
  s.add({ call: "getSnapshot" }, { result: same(snap, "/result"), events: quiet(["L1"]) });
  if (step !== 4) throw Error("noop script order");
  txCase({ caseId: "l3-tx-corrected-noop", group: "transaction", clause: clause("§8.2", 641), cites: [clause("§8.2", 631), clause("§9.4", 723)],
    discriminates: "A nonzero drag of the anchored reference is corrected back to its region position: fails an adapter that keeps the dragged geometry, records a history entry, changes the view revision, emits a change event, or reports no correction notice for a gesture with no final semantic or visual difference." }, s);
}
{
  // Theme switch between a command and its undo: presentation, not semantic history (DESIGN L643).
  const layout = layoutOf([POOL, shape("task-a", TX.a, 200000, 70000, 100000, 80000)]);
  const selection = [{ pageId: PAGE, occurrenceKey: "task-a" }];
  const restored = snapshotOf(Ea, layout, { selection });
  const s = script();
  onChange(s, "L1", ["L1"]);
  const r = restore(s, restored);
  const created = apply(s, { before: Ea, after: Eab, txId: "tx-b", commands: [TASK_B_CMD], viewFrom: r, history: { past: 1, future: 0 },
    entries: [...cEntries(Ea, Eab, topologyOf(fe(0, 1)), [fe(0, 1)]), ...all4Draft(Eab, TX.a), ...all4Draft(Eab, TX.b)] });
  const themeStep = s.next();
  s.add({ call: "setTheme", themeId: "contrast" },
    { result: { status: "ok", operation: "setTheme", profileIdentity: clone(Eab.profileIdentity), baseRevision: Eab.semanticRevision, revision: Eab.semanticRevision, report: PLACEHOLDER,
        payload: { viewRevision: differs(created, VIEW_PTR) } },
      history: { past: 1, future: 0 }, events: { L1: [changeEvent(Eab, same(themeStep, VIEW_PTR), PLACEHOLDER, "theme", same(themeStep, REPORT_PTR))] } },
    [[REPORT_PTR, "report"], ...eventUnseal(["L1"], [["transactionId", "eventTx"]])]);
  const snap = getSnapshotCanvas(s, Eab, themeStep, { themeId: "contrast", activePageId: PAGE });
  const undo = history(s, { call: "undo", from: Eab, to: Ea, viewFrom: snap, payload: snapshotOf(Ea, layout, { themeId: "contrast", selection }), past: 0, future: 1 });
  history(s, { call: "redo", from: Ea, to: Eab, viewFrom: undo, payload: same(snap, "/result/payload"), past: 1, future: 0 });
  txCase({ caseId: "l3-tx-theme-history", group: "transaction", clause: clause("§8.2", 643), cites: [clause("§3.1", 264), clause("§9.2", 690), clause("§14.3", 967)],
    discriminates: "Fails an adapter that records the theme switch as a semantic history entry (undo would revert the theme instead of the task), replays native history to capture the theme snapshot (extra callbacks), changes semanticRevision on a theme switch, or whose undo does not keep the current theme with the restored layout and selection (exact viewRevision)." }, s);
}
{
  // Explicit deletion of an empty bound reserved lane, no resurrection, undo restores it (DESIGN L565).
  const laneSets = lanes => ({ laneSets: [X.laneSet("LaneSet_T", "Supports", lanes)] });
  const Elane = txEnvelope([], laneSets([X.lane("Lane_T_ext", "Outside parties")]), [binding("Process_T", "lane-set", "LaneSet_T"), binding("Process_T", "external-lane", "Lane_T_ext")]);
  const Edel = txEnvelope([], laneSets([]), [binding("Process_T", "lane-set", "LaneSet_T")]);
  const layout = layoutOf([POOL, shape("lane-ext", "Lane_T_ext", 80000, 30000, 470000, 160000)]);
  const selection = [{ pageId: PAGE, occurrenceKey: "lane-ext" }];
  const restored = snapshotOf(Elane, layout, { selection });
  const s = script();
  onChange(s, "L1", ["L1"]);
  const r = restore(s, restored);
  const deleted = apply(s, { before: Elane, after: Edel, txId: "tx-delete", commands: [surface("lane-delete", { target: "Lane_T_ext" })], viewFrom: r, history: { past: 1, future: 0 } });
  const snap = getSnapshotCanvas(s, Edel, deleted, { activePageId: PAGE });
  const undo = history(s, { call: "undo", from: Edel, to: Elane, viewFrom: snap, payload: clone(restored), past: 0, future: 1 });
  history(s, { call: "redo", from: Elane, to: Edel, viewFrom: undo, payload: same(snap, "/result/payload"), past: 1, future: 0 });
  txCase({ caseId: "l3-tx-delete-support-undo", group: "transaction", clause: clause("§7.2", 565), cites: [clause("§2.4", 171), clause("§8.2", 641), clause("§7.3", 571)],
    discriminates: "Fails an adapter whose N run after the deletion resurrects the reserved lane, that keeps the binding of the deleted lane, removes the empty bound lane set, or whose undo does not restore the actual deleted lane ID, binding and presentation." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  applyRefused(s, { before: E0, code: "operation-error", history: { past: 0, future: 0 },
    request: { baseRevision: Ea.semanticRevision, expectedViewRevision: refTo(loaded, VIEW_PTR), transactionId: "tx-stale", commands: [TASK_A_CMD] } });
  applyRefused(s, { before: E0, code: "operation-error", history: { past: 0, future: 0 },
    request: { baseRevision: E0.semanticRevision, expectedViewRevision: "0".repeat(64), transactionId: "tx-stale-view", commands: [TASK_A_CMD] } });
  const created = apply(s, { before: E0, after: Ea, txId: "tx-a", commands: [TASK_A_CMD], viewFrom: loaded, history: { past: 1, future: 0 },
    entries: [...cEntries(E0, Ea, topologyOf(fe(0, 0)), [fe(0, 0)]), ...all4Draft(Ea, TX.a)] });
  historyRefused(s, { call: "undo", current: Ea, expectedRevision: E0.semanticRevision, viewFrom: created, past: 1, future: 0 });
  getDefinitions(s, Ea);
  txCase({ caseId: "l3-tx-stale-revision", group: "transaction", clause: clause("§8.2", 629), cites: [clause("§8.1", 587, 596)],
    discriminates: "Fails an adapter that applies a command or an undo against a stale semantic or view revision, rebases it silently, or refuses with a code other than operation-error (harmonization C10)." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  historyRefused(s, { call: "undo", current: E0, expectedRevision: E0.semanticRevision, viewFrom: loaded, past: 0, future: 0 });
  historyRefused(s, { call: "redo", current: E0, expectedRevision: E0.semanticRevision, viewFrom: loaded, past: 0, future: 0 });
  txCase({ caseId: "l3-tx-empty-history", group: "transaction", clause: clause("§8.2", 641), cites: [clause("§8.1", 595, 596)],
    discriminates: "Fails an adapter that answers undo or redo on an empty history with ok, a no-op snapshot or a rejected Promise instead of operation-error (harmonization C10)." }, s);
}
{
  const s = script();
  onChange(s, "L1", ["L1"]);
  const loaded = load(s, E0);
  applyRefused(s, { before: E0, code: "transaction-entry-unsupported", txId: "tx-bare", viewFrom: loaded, history: { past: 0, future: 0 },
    commands: [{ recipe: "create-task", parameters: { owner: "Process_T", key: "a", name: "First" } }] });
  applyRefused(s, { before: E0, code: "transaction-entry-unsupported", txId: "tx-upstream", viewFrom: loaded, history: { past: 0, future: 0 },
    commands: [{ command: "upstream", upstream: "create.intermediate-event", context: { owner: "Process_T" } }] });
  getDefinitions(s, E0);
  txCase({ caseId: "l3-tx-bare-recipe-refused", group: "transaction", clause: clause("§8.2", 635), cites: [clause("§8.3", 657, 659)],
    discriminates: "Fails an adapter that executes a bare recipe command or an unlisted upstream entry as a second recipe authority instead of refusing transaction-entry-unsupported (harmonization C8)." }, s);
}

// ================================================================ vendored Python lot-3 parity cases (BLOCKB-PARITY-SYNC §1, §2.1, §2.2, §3.1)
// The Python seal owns these values. Its committed files are vendored raw under
// vendor/py/ with their paths relative to the Python tests/profile_cn/expected/: the
// seal manifest MANIFEST.sha256, the profile-parity-corpus/1 manifest, the imported
// parity records, every composed profile variant and the descriptor/base packages.
// The source is the Python seal resealed after its own parity-sync value changes
// (section 1.2: owning seals change values first, imports copy the resealed bytes);
// the only section-1 decisions that change an imported Python value, PS-25 and PS-35
// on the compile records, are therefore already applied by their owner and named in
// each case derivation. The helper checks every digest against the pinned Python
// seal, reproduces the compiled profile identities with node:crypto, then re-expresses
// each record in this corpus shape (roles, comparator ids, file layout) without
// recomputing or changing a value.
const PY_SEAL = { runtime: "python", commit: "1c2df3166480fe62a233fe91c3ae19bf8839cd2a", manifest: "tests/profile_cn/expected/MANIFEST.sha256",
  sha256: "0d3922f74fb71e19d305307a3153989dcdf4ba3685e8a6df06c28046cf15ad8e", parityManifest: "tests/profile_cn/expected/parity/manifest.json",
  parityManifestSha256: "2a195405f01458521ef951d5b7b14f554b62c9a20b87d83efdca69a6ff234f52" };
const PY_ROOT = "tests/profile_cn/expected/";
const PY_CONTRACTS = "contracts/profile-mechanism/1/";
const VENDOR = `${EXPECT}/vendor/py`;
// Python repository paths -> paths of this tree (relative to tests/fixtures/). The
// Python vendored lot-0 contracts are byte-identical to the lot-0 corpus files here.
function vendorPath(pyPath) {
  if (pyPath.startsWith(PY_ROOT)) return `${VENDOR}/${pyPath.slice(PY_ROOT.length)}`;
  if (pyPath.startsWith(PY_CONTRACTS)) return `profile-parity-corpus/profile-mechanism/1/${pyPath.slice(PY_CONTRACTS.length)}`;
  throw Error(`unvendored Python path ${pyPath}`);
}
const pySealBytes = fixtureBytes(`${VENDOR}/MANIFEST.sha256`);
assertEq(B(pySealBytes), PY_SEAL.sha256, "vendored Python seal manifest");
const PY_SEAL_FILES = Object.fromEntries(pySealBytes.toString("utf8").split("\n").filter(Boolean).map(line => {
  const match = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
  if (!match) throw Error(`Python seal manifest line ${line}`);
  return [match[2], match[1]];
}));
assertEq(PY_SEAL_FILES["parity/manifest.json"], PY_SEAL.parityManifestSha256, "Python parity manifest listed by the Python seal");
const pyParityBytes = fixtureBytes(`${VENDOR}/parity/manifest.json`);
assertEq(B(pyParityBytes), PY_SEAL.parityManifestSha256, "vendored Python parity manifest");
const PY_PARITY = JSON.parse(pyParityBytes.toString("utf8"));
assertEq(PY_PARITY.format, "profile-parity-corpus/1", "Python parity manifest format");
// A referenced Python byte sequence: its raw SHA-256 listed by the Python parity
// manifest (and by the seal manifest for a Python-tree file) equals this tree's file.
function pyFile(pyPath) {
  const listed = PY_PARITY.files[pyPath];
  if (!listed) throw Error(`not pinned by the Python parity manifest: ${pyPath}`);
  const path = vendorPath(pyPath), bytes = fixtureBytes(path);
  assertEq(B(bytes), listed, `vendored ${pyPath}`);
  if (pyPath.startsWith(PY_ROOT)) assertEq(PY_SEAL_FILES[pyPath.slice(PY_ROOT.length)], listed, `Python seal listing of ${pyPath}`);
  return { path, sha256: listed, bytes };
}
// Composed Python profile variants with their load inputs (the Python parity
// manifest's profile table); neutral and grid are the lot-0 profiles listed above.
const PY_PROFILES = PY_PARITY.profiles.filter(p => p.path.startsWith(PY_ROOT)).map(p => {
  const file = pyFile(p.path), descriptors = pyFile(p.descriptorBytes.path), base = pyFile(p.baseBytes.path);
  for (const [pin, f] of [[p, file], [p.descriptorBytes, descriptors], [p.baseBytes, base]]) assertEq(pin.sha256, f.sha256, `Python profile table ${p.variant}`);
  return { key: `python:${p.variant}`, path: file.path, sha256: file.sha256, identitySha256: H(JSON.parse(file.bytes.toString("utf8"))),
    inputs: { schema: { path: PATHS.schema, sha256: B(fixtureBytes(PATHS.schema)) }, base: { path: base.path, sha256: base.sha256 },
      descriptors: [{ path: descriptors.path, sha256: descriptors.sha256 }], assets: [{ key: "neutral-metrics.json", path: PATHS.metrics, sha256: B(fixtureBytes(PATHS.metrics)) }] } };
});
for (const p of PY_PARITY.profiles.filter(p => p.path.startsWith(PY_CONTRACTS))) {
  const key = { neutral: "neutral", grid: "grid" }[p.variant];
  if (!key) throw Error(`unexpected lot-0 Python variant ${p.variant}`);
  assertEq(pyFile(p.path).sha256, PROFILES[key].file.sha256, `lot-0 ${p.variant} profile bytes`);
}
// DESIGN anchors of the Python clause items (the first item is the primary clause).
const PY_ANCHORS = {
  grammar: clause("§2.4", 158, 172), bind: clause("§2.4", 162), create: clause("§2.4", 163), ensure: clause("§2.4", 164), setUnset: clause("§2.4", 165),
  assignRef: clause("§2.4", 166), reparent: clause("§2.4", 167), remove: clause("§2.4", 171), refuse: clause("§2.4", 172), removeIntent: clause("§2.4", 174),
  ensureRestriction: clause("§2.4", 174), writes: clause("§2.4", 176), compileRules: clause("§2.4.1", 182, 199), cr05: clause("§2.4.1", 190),
  cr05to07: clause("§2.4.1", 190, 192), cr06: clause("§2.4.1", 191), cr07: clause("§2.4.1", 192), cr14: clause("§2.4.1", 199), matrix: clause("§2.4.1", 201, 212),
  ensureWrite: clause("§2.4.1", 205), actorMatrix: clause("§2.4.1", 214), authority: clause("§2.4.1", 216), anchoring: clause("§2.4.1", 218),
  planApply: clause("§2.5", 230, 231), applyPlan: clause("§2.5", 231), completeSig: clause("§2.5", 232), order: clause("§2.5", 252), readContext: clause("§2.5", 254),
  param: clause("§2.2", 113), dangling: clause("§2.2", 132), missing: clause("§2.2", 134), profileDigest: clause("§3.1", 262), utf16: clause("§3.1", 262),
  unclassified: clause("§3.1", 266), diOnly: clause("§3.1", 268), allocator: clause("§3.2", 276, 282), ownerId: clause("§3.2", 284), multiProcess: clause("§3.2", 286),
  containment: clause("§3.2", 288), computedCollision: clause("§3.2", 288), subset: clause("§3.2", 290), p1: clause("§3.3", 298), row1: clause("§3.3", 302),
  digestRow: clause("§3.3", 314), emptyCall: clause("§4.1", 373, 375), callRows: clause("§4.1", 374, 379), anchors: clause("§4.4", 410), envelope: clause("§5.1", 430),
  supportAgreement: clause("§5.2", 438, 440), reuse: clause("§5.2", 440), importRules: clause("§5.2", 440, 442), remap: clause("§5.2", 444),
  extraction: clause("§7.1", 536), privatePolicy: clause("§7.1", 538), identityDefaults: clause("§7.1", 542), ports: clause("§7.1", 546),
  reservedN: clause("§7.2", 554), structure: clause("§7.2", 558), membership: clause("§7.2", 559), direction: clause("§7.2", 562), placements: clause("§7.2", 565),
  rollback: clause("§7.3", 569), witnesses: clause("§7.3", 571), supportFixture: clause("§7.3", 573), inputConflict: clause("§8.1", 619), stale: clause("§8.2", 629),
  intent: clause("§8.2", 631), parameters: clause("§8.3", 655), typedParameters: clause("§8.3", 659), refusalRecord: clause("§10.1", 735),
  openExternalSharing: clause("§13", 910, 914), openMachine: clause("§13", 915), openReservedN: clause("§13", 917), openIo: clause("§13", 920), openId: clause("§13", 921),
  neutralPolicies: clause("§14.4", 979), items2and4: clause("§16", 1140, 1146), item6: clause("§16", 1150), item8: clause("§16", 1154), item11: clause("§16", 1160),
};
// [caseId, BLOCKB-PARITY-SYNC import row, DESIGN anchors of the Python clause, the
// Python derivation copied verbatim from its harness record (the discrimination text)].
const PY_ROWS = [
  ["cn-plan-actor-mismatch", "PS-H08", ["grammar","matrix","planApply","authority"],
    "Explicit create/edit/reference/convert/migrate commands use the editor actor, complete/normalize use code (DESIGN §2.4.1 R3.1 bounded authority witness): planning create-task with actor code refuses profile-producer."],
  ["cn-plan-add-note-containment", "PS-H08", ["grammar","matrix","planApply","containment"],
    "add-note uses identity containment: the planned create carries no id (no ownerId, slot or key) and its descriptive fact (Task.documentation is multi-valued: cardinality many); the Documentation is appended to Task_B.documentation exactly as the vendored neutral-fixture created[0]; created lists only ID-bearing creations (empty here)."],
  ["cn-plan-ambiguous-binding", "PS-H08", ["grammar","matrix","planApply","bind"],
    "rename-only-task binds one Task among the owner's flowElements with cardinality one; Process_amb has two, so planning refuses profile-ambiguous-binding (array order never chooses a winner). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision."],
  ["cn-plan-append-remove-conflict", "PS-H08", ["grammar","matrix","planApply","writes"],
    "appendUnique and remove deltas on Lane_c.flowNodeRef coalesce by id, but appending and removing the same id Task_cmd refuses profile-write-conflict at application. Both planned writes carry the cn facts of Lane.flowNodeRef (cardinality many, the admitted flow-node targetTypes; spec §3.2). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision."],
  ["cn-plan-create-aid-grid", "PS-H08", ["grammar","matrix","planApply","allocator"],
    "create-aid on the vendored grid input: concat of the profile's marker literal '[Note] ' and the body gives '[Note] helper'; the allocated id is the pinned fixture vector stable-id(Process_1, aid, new-note) = g_61b2...800c; the planned create carries cardinality many (Process.artifacts multi-valued, spec §3.2)."],
  ["cn-plan-create-aid-neutral", "PS-H08", ["grammar","matrix","planApply","allocator"],
    "create-aid on the vendored neutral input: concat of the profile's marker literal '[Aid] ' and the body gives '[Aid] helper'; the allocated id is the pinned fixture vector stable-id(Process_1, aid, new-note) = g_61b2...800c; the planned create carries cardinality many (Process.artifacts multi-valued, spec §3.2)."],
  ["cn-plan-create-id-collision", "PS-H08", ["grammar","matrix","planApply","computedCollision"],
    "create-task with key k-dup plans stable-id(Process_1, task, k-dup), which an unrelated TextAnnotation already carries. A computed collision with a different object is id-collision (DESIGN §3.2): apply_plan refuses it and never suffixes, overwrites or reidentifies."],
  ["cn-plan-create-process-input", "PS-H08", ["grammar","matrix","planApply","ownerId"],
    "Input is the cn-remap-owner output. The ID-less ioSpecification is created by containment (no id) and addressed within the plan by its handle (index 0); the DataInput's ownerId is the explicitly evaluated owner id Process_X, never the ID-less parent: stable-id(Process_X, process-input, in-1). The two planned writes carry the cn slice facts apply needs: Process.ioSpecification is single-valued (cardinality single: an object, not an array) and dataInputs multi-valued (cardinality many); the LaneSet keeps its stored empty lanes array."],
  ["cn-plan-create-task-grid", "PS-H08", ["grammar","matrix","planApply","ownerId"],
    "create-task on the vendored grid input: one allocated create of bpmn:ServiceTask (the two profiles differ in task subtype) with ownerId = the owner parameter's id, slot task, key = the key parameter, appended to Process_1.flowElements. The planned write carries the descriptive fact apply needs (Process.flowElements is multi-valued: cardinality many; spec §3.2, DESIGN §2.5 applyPlan has no descriptor argument). Explicit commands report no Report/2 entry (spec §3.3); created lists the new id."],
  ["cn-plan-create-task-neutral", "PS-H08", ["grammar","matrix","planApply","ownerId"],
    "create-task on the vendored neutral input: one allocated create of bpmn:Task (the two profiles differ in task subtype) with ownerId = the owner parameter's id, slot task, key = the key parameter, appended to Process_1.flowElements. The planned write carries the descriptive fact apply needs (Process.flowElements is multi-valued: cardinality many; spec §3.2, DESIGN §2.5 applyPlan has no descriptor argument). Explicit commands report no Report/2 entry (spec §3.3); created lists the new id."],
  ["cn-plan-export-phase", "PS-H08", ["grammar","matrix","planApply","cr14"],
    "export-pages is an export recipe (emit actions on the render binding); export has no native write authority (DESIGN §2.4.1 R3.1 witness) and is planned by map_export (lot 4), so plan_recipe refuses profile-action-phase."],
  ["cn-plan-invalid-authority", "PS-H08", ["grammar","matrix","planApply"],
    "Authority.actor is the closed set editor or code (spec §3.1); 'ai' is not an explicit-command or C/N actor, so the invocation is invalid: operation-error (H C11) before any recipe check."],
  ["cn-plan-lane-member-cn", "PS-H08", ["grammar","matrix","planApply","readContext","assignRef"],
    "assign-lane-member on the cn-n profile. planRecipe reads the descriptor index of its own ReadContext and records it in the write: bpmn:Lane.flowNodeRef is many-valued with targetTypes ['bpmn:CallActivity', 'bpmn:ExclusiveGateway', 'bpmn:ServiceTask', 'bpmn:StartEvent', 'bpmn:Task'] in this profile's descriptors. applyPlan(plan, stagedTree, stagedEnvelope) has no descriptor argument (DESIGN §2.5) and applies the carried facts: the stored value is [\"Task_cmd\"]. The twin case on the other profile stores the other form, so a runtime resolving facts from ambient or global state fails one of them."],
  ["cn-plan-lane-member-support", "PS-H08", ["grammar","matrix","planApply","readContext","assignRef"],
    "assign-lane-member on the support-cmd profile. planRecipe reads the descriptor index of its own ReadContext and records it in the write: bpmn:Lane.flowNodeRef is single-valued with targetTypes ['bpmn:Task'] in this profile's descriptors. applyPlan(plan, stagedTree, stagedEnvelope) has no descriptor argument (DESIGN §2.5) and applies the carried facts: the stored value is \"Task_A\". The twin case on the other profile stores the other form, so a runtime resolving facts from ambient or global state fails one of them."],
  ["cn-plan-link", "PS-H08", ["grammar","matrix","planApply","assignRef"],
    "link creates one Association (allocated under Process_1, slot link, key l1) and assigns its single-valued sourceRef/targetRef to the element parameters; each assignRef carries cardinality single and the admitted targetTypes of the neutral descriptors (spec §3.2), which apply checks; reference writes never create an endpoint (both exist)."],
  ["cn-plan-link-wrong-target-type", "PS-H08", ["grammar","matrix","planApply","assignRef"],
    "link with target = Process_1: the element parameter exists, so planning succeeds and records the targetRef write with the neutral targetTypes ['bpmn:ServiceTask', 'bpmn:Task', 'bpmn:TextAnnotation']. Before assignment apply validates existence and target type (DESIGN §2.4 assignRef): a bpmn:Process is not admitted, so apply_plan refuses profile-type and stages nothing."],
  ["cn-plan-missing-parameter", "PS-H08", ["grammar","matrix","planApply","parameters"],
    "create-task declares the required string parameter name; omitting it refuses profile-ui-parameters before any evaluation (no parameter comes from a label or an ambient variable)."],
  ["cn-plan-optional-binding-missing", "PS-H08", ["grammar","matrix","planApply","missing","bind"],
    "rename-optional-task binds task with cardinality zeroOrOne over the owner's Task children; Process_opt has none, so task is MISSING (DESIGN §2.4 bind) and the set step is a required use of MISSING, which refuses (DESIGN §2.2): profile-type."],
  ["cn-plan-recipe-not-compiled", "PS-H08", ["grammar","matrix","planApply","cr05"],
    "The recipe argument keeps the id create-task but changes its allocation slot, so it differs (JCS) from compiled.recipes['create-task']: planning accepts only compiled recipes (CR-05 symbols; no recipe from outside the profile), so plan_recipe refuses profile-symbol before reading parameters."],
  ["cn-plan-remove-referenced", "PS-H08", ["grammar","matrix","planApply","remove"],
    "remove-element(Task_A) with policy refuseIfReferenced and no declared dependents: the inbound closure contains Assoc_1.sourceRef, a retained reference, so planning refuses reference-dangling; no cascading delete exists. The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision."],
  ["cn-plan-remove-without-intent", "PS-H08", ["removeIntent"],
    "The remove action requires actor authorization and explicit deletion intent; the authority carries deletionIntent false, so planning refuses profile-producer. The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision."],
  ["cn-plan-reparent-annotation", "PS-H08", ["grammar","matrix","planApply","reparent"],
    "move-annotation declares {self,'',reparent} and {process,/artifacts,reparent} (DESIGN §2.4.1 reparent row) and one reparent step with position last: Note_1 keeps its id and is appended after Note_2 in Process_2.artifacts; no reference names Note_1 and bpmn:TextAnnotation is admitted there. The source array is emptied and stays [] (H F1). Explicit edit; nothing is created or removed."],
  ["cn-plan-scalar-write-conflict", "PS-H08", ["grammar","matrix","planApply","writes"],
    "Planning records both declared set writes (scalar writes carry no descriptive fact); application detects two different scalar values for Task_cmd/name and refuses profile-write-conflict (no last-writer behaviour). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision."],
  ["cn-plan-undeclared-parameter", "PS-H08", ["grammar","matrix","planApply","parameters"],
    "create-task declares owner, key and name; an additional colour parameter is not a declared parameter (DESIGN §8.3: parameters bind declared names only), so planning refuses profile-ui-parameters."],
  ["cn-plan-unknown-element-parameter", "PS-H08", ["grammar","matrix","planApply","param"],
    "Element parameters bind existing element ids only; Process_ghost is absent, so planning refuses reference-dangling."],
  ["cn-plan-unset-name", "PS-H08", ["grammar","matrix","planApply","setUnset"],
    "clear-name declares {self,/name,unset} and one unset step: the edit plan has one unset write (single-segment scalar path, no value, no descriptive fact needed) and application removes Task_cmd.name (Task.name is an optional scalar of the cn base, editor-produced). Explicit commands report no Report/2 entry; nothing is created or removed."],
  ["cn-plan-wrong-parameter-type", "PS-H08", ["grammar","matrix","planApply","typedParameters"],
    "create-task declares name as a required string parameter; the call supplies the number 42. Parameters are validated in declaration order before evaluation, with no implicit coercion (DESIGN §8.3): a wrong JSON type refuses profile-type."],
  ["cn-apply-stale-plan", "PS-H08", ["applyPlan","stale"],
    "The plan (with its carried cardinality fact) is the cn-plan-create-task-neutral plan whose baseRevision is the revision of the neutral input; the staged envelope is the already-applied output (another revision) and its tree argument equals that envelope's tree, so apply_plan refuses operation-error (stale plan) and stages nothing."],
  ["cn-apply-input-conflict", "PS-H08", ["applyPlan","inputConflict"],
    "The plan and the staged envelope are those of cn-plan-create-task-neutral, but the staged tree argument differs from the staged envelope's tree (Task_B renamed): two inputs for one staged state (DESIGN §8.1 input-conflict), refused before the revision check and before staging."],
  ["cn-c-version-mismatch-first", "PS-H09", ["identityDefaults","p1"],
    "The envelope identity differs from the compiled neutral identity only by an older minor version (1.0.0 vs 1.1.0) and its digest. §3.3 rows apply before C (precedence step 3, H C1): the minor row is source-dependent and C/N never load another package, so P1 yields profile-source-unavailable before any id is allocated (§7.1 reject source version mismatch first). The input tree has missing ids that must stay missing. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-digest-mismatch-first", "PS-H09", ["identityDefaults","digestRow"],
    "Same profile id and version as the compiled grid profile, known unequal digests: the §3.3 identity-conflict row refuses profile-digest-mismatch (no P1 override) before any C write (precedence step 3). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-document-version", "PS-H09", ["row1","envelope","refusalRecord"],
    "documentVersion 2 is unknown: the first §3.3 row (and the closed §5.1 envelope check, precedence step 2) refuses document-version-unsupported. An unknown documentVersion is the H B3 no-echo case, so the refusal and its report carry neither profileIdentity/sourceIdentity nor baseRevision/inputRevision (§10.1: missing identity is omitted, not fabricated). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty; nothing is echoed."],
  ["cn-c-gateway-direction-control", "PS-H09", ["privatePolicy","neutralPolicies"],
    "The topology and GatewayDirection rules are private effective-base policy data, not library rules (§7.1). The neutral profile declares none, so C changes only isExecutable: the stale G_ctl incoming [F2], the absent S1 outgoing and the absent gatewayDirection stay exactly as imported. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-c-output-port-gated", "PS-H09", ["ports","openIo","item8"],
    "Filling the absent sourceRef of a DataOutputAssociation is the missing-output-source producer exception gated by OPEN-IO (technical gate open; §16 item 8 requires an explicitly accepted code-creation authority). With the default edit activation C refuses profile-open at that recipe step (the earlier ungated topology plans do not matter: nothing is applied) and commits nothing. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-output-port-qualification", "PS-H09", ["ports","openIo","item8"],
    "Same input as cn-c-output-port-gated under activation=qualification (§7.2/§13 neutral qualification may proceed): C creates stable-id(Task_O, output-port, DOA_missing) in Task_O.properties (absent before; the array is created) and assigns sourceRef, a multi-valued reference; the flowless Task_O receives empty incoming/outgoing arrays (H F1). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-c-not-fixed", "PS-H09", ["writes","rollback"],
    "suffix-task-name sets name := concat(name, '!'): the first pass gives 'A!' (and the empty topology arrays of Task_1), the bounded second evaluation succeeds but changes the name again to 'A!!', so C(C(x)) != C(x) and C refuses normalization-not-fixed, rolling back the whole stage (no candidate exposed). Witness of the 'second evaluation still changes a value' branch; the refusal branch is cn-c-second-pass-refused. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-extraction-authorized", "PS-H09", ["extraction","actorMatrix"],
    "The grid-extraction delta moves rootElements, flowElements and ServiceTask.name from import to ai, so every field present in the AI extraction is admitted to actor ai (spec §6.1). C then allocates the three missing ids and the grid default isExecutable=true. The fixed-point rerun uses mode retained (the output is retained content). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-c-extraction-unauthorized", "PS-H09", ["extraction","cr06"],
    "The neutral base grants no field to actor ai; in extraction mode the first present field (Definitions.rootElements) is not AI-producible, so C refuses profile-producer before identity allocation. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-descriptor-role-unknown", "PS-H09", ["unclassified","order"],
    "Task.colour is classified by no descriptor role of the neutral slice; the graph index check before C (precedence step 5, H C1) refuses descriptor-role-unknown (§3.1). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-invalid-mode", "PS-H09", ["completeSig","refusalRecord"],
    "mode accepts exactly extraction or retained (spec §3.4, H B7); 'draft' is a readiness policy, not a C mode, so the call refuses operation-error at precedence step 1 (H C1/C11). The envelope argument is itself a JSON object with documentVersion 1, a shape-valid identity and a semanticRevision, so the refusal echoes them (H B3: only an unknown documentVersion, an unparseable input or the not-loaded state omit the echo). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-band-process-ref", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement","rollback"],
    "Vendored negative 'reference band cannot carry processRef' under activation=qualification: refusal support-binding-conflict, the whole staged operation rolls back and the caller tree and bindings are unchanged. Reuse validation of the bound band fails on the no-processRef relationship (§5.2, H C5 keeps this check). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-creation-gated", "PS-H10", ["reservedN","openReservedN","item11"],
    "Same input as cn-n-support-one-process with the default edit activation: the first ensure would create a persisted support while the OPEN-RESERVED-N technical gate is open (§16 item 11 owner part ratified, twin proof pending), so N refuses profile-open and the caller tree and bindings are unchanged. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-duplicate-role", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement","rollback"],
    "Vendored negative 'duplicate imported role rolls back' under activation=qualification: refusal support-binding-conflict, the whole staged operation rolls back and the caller tree and bindings are unchanged. The duplicate (ownerId, role) binding is rejected by envelope integrity (precedence step 4, H C1), after the §3.3 compatibility row accepted the exact identity; the envelope still has documentVersion 1, a shape-valid identity and a semanticRevision, so the refusal echoes them (H B3; the revision string is echoed as given). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-imported-ids", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement","reuse"],
    "Vendored case 'imported support IDs survive': every role is correctly bound to an imported non-generated id (type, parent/property and declared fields agree), so N reuses all five, the processRef write is a no-op, no id is allocated and the report is empty (fixture changeCount 0). Reuse is not a gated mutation, so the qualification activation accepts it. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-support-imported-ids-edit", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement","reuse"],
    "Vendored case 'imported support IDs survive': every role is correctly bound to an imported non-generated id (type, parent/property and declared fields agree), so N reuses all five, the processRef write is a no-op, no id is allocated and the report is empty (fixture changeCount 0). Reuse is not a gated mutation, so the edit activation accepts it. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-support-late-band-collision", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement","rollback"],
    "Vendored negative 'late band ID collision rolls back four earlier supports' under activation=qualification: refusal id-collision, the whole staged operation rolls back and the caller tree and bindings are unchanged. The four earlier ensures plan creations; the band ensure's allocator id is occupied by an unrelated, unbound Participant (precedence step 8, §6.3). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-late-band-collision-edit", "PS-H10", ["reservedN","openReservedN","item11"],
    "Same input as cn-n-support-late-band-collision with the default edit activation: the first ensure (Collaboration) would create, so profile-open is reported before the fifth ensure's id-collision (refusals follow recipe/candidate/step order). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-one-process", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement"],
    "Exact vendored expectation of neutral-support-fixture.R31.json case 'complete support creation': five ensures (Collaboration under Definitions with ownerId Definitions_support and key Process_A; main Participant, LaneSet, reserved Lane and reference-band Participant in the Process_A domain) plus the main processRef assignment give exactly six change entries (fixture changeCount 6); creation order is the fixture createdIds order (Collaboration appended after the Process, main before band). Bindings sort by ownerId/role/targetId. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-support-refusal-after-five-ensures", "PS-H10", ["supportFixture","refuse"],
    "R3.1 check 'explicit refusal after five ensures rolls back': the support-abort variant appends {op:refuse, code:fixture-abort} after the five ensures and the processRef assignment; the refusal code is the profile's, nothing is committed and the caller tree and bindings are unchanged. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-support-two-processes", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement"],
    "Vendored case 'two processes have separate collaborations': each Process gets its own Collaboration (ownerId Definitions_support, keys Process_A and Process_B), bound to that Process, plus its own four Process-domain supports; twelve change entries (fixture changeCount 12), creation order Process_A then Process_B. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-support-wrong-parent", "PS-H10", ["structure","supportFixture","multiProcess","supportAgreement","rollback"],
    "Vendored negative 'imported band under wrong parent refuses' under activation=qualification: refusal support-binding-conflict, the whole staged operation rolls back and the caller tree and bindings are unchanged. The graph index accepts the misplaced Participant (Process.artifacts is a classified member; containment admission is not a graph-index check); reuse validation of the bound band then fails on parent/containment property (§5.2, H C5). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-place-grid-deleted-association", "PS-H11", ["placements","anchoring","anchors","witnesses"],
    "Without A-producer, Task_B has no association with sourceRef Task_B, so bind(first) falls back to the producing selector (targetRef Task_B) and picks its minimum id Y-consumer; both tasks relate to the remaining Y/Z associations. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-place-grid-inserted-association", "PS-H11", ["placements","anchoring","anchors","witnesses"],
    "Inserting X-consumer (Task_A -> Task_B) adds it to both related lists and, being the lowest consuming id for Task_A, makes it Task_A's anchor; Task_B still anchors on A-producer, its only consuming association. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-sort-placements", "PS-H11", ["placements","utf16"],
    "Order by UTF-16 (ownerProcessId, regionKey, elementId, anchorAssociationId with absent before present, relatedAssociationIds compared element-wise, prefix first). P_10 precedes P_2; for the same target the anchorless record comes first, then related [A1] < [A1,B2] < [A2]; U+10000 (surrogates D800 DC00) precedes U+E000 in UTF-16 although it follows it in code-point order."],
  ["cn-n-placement-intent-di-only", "PS-H11", ["intent","diOnly"],
    "Same as cn-n-place-neutral with placement intent [{elementId: Task_A}] for a DI-only move: the intent is validated but N's semantic outputs depend only on the tree, so envelope, placements and report are identical (a DI-only drag changes only viewRevision, which N does not compute). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-placement-intent-unknown", "PS-H11", ["intent"],
    "The intent names Task_ghost, absent from the tree: the validated intent refuses reference-dangling after envelope and compatibility checks. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-plan-remove-empty-support", "PS-H11", ["placements","witnesses","remove"],
    "remove-element on the empty external lane with explicit deletion intent: the closure is the lane alone (no retained inbound reference); application deletes it, keeps the emptied LaneSet.lanes array as [] (an emptied array is stored as written, H F1) and removes its envelope binding, the support's ownership record. removed lists the deleted id; explicit commands report no Report/2 entry."],
  ["cn-n-deleted-support-stays-absent", "PS-H11", ["placements","witnesses"],
    "Input is the cn-plan-remove-empty-support output (LaneSet.lanes stored as []). Nothing needs the external-lane role, so N does not recreate it and never removes the empty array: no change, edit activation accepted. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-recreate-after-remap", "PS-H11", ["placements","witnesses"],
    "Input is the cn-plan-create-process-input output: the new Process IO needs the external-lane role again. The bound LaneSet is reused; the deleted lane's identity ended, so ensure creates stable-id(Process_X, external-lane, external-lane) with the current ownerId (g_11a96576...), different from the deleted g_8cb2e97e..., and reports it; the recreated lane is appended to the LaneSet's stored empty lanes array. The DataInput is placed in region external-lane without anchor. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-n-reference-region-edit", "PS-H12", ["reservedN","openReservedN","item11"],
    "Same input as cn-n-reference-region-multi-process with the default edit activation: the Collaboration ensure would create a support, so N refuses profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-external-membership-edit", "PS-H12", ["membership","callRows","anchors","openExternalSharing","items2and4"],
    "Same input as cn-n-external-membership-append with the default edit activation: the appendUnique is an effective Lane.flowNodeRef change of the external branch of N, gated by OPEN-EXTERNAL (encoding proof) and OPEN-RESERVED-N, so N refuses profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-recreate-after-remap-edit", "PS-H12", ["reservedN","openReservedN","item11"],
    "Same input as cn-n-recreate-after-remap with the default edit activation: the lane recreation is a persisted support creation, refused profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-relation-direction-conflict", "PS-H12", ["direction","writes"],
    "The conflict variant adds a recipe setting the same reversed association's associationDirection to Both while reverse-reference-links sets One: two different scalar values for one target/path refuse profile-write-conflict; nothing is applied. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-ensure-conflicting-definition", "PS-H12", ["writes","structure"],
    "The variant appends a recipe ensuring (Process_A, reference-band) with name 'band' while ensure-reference-band declares 'reference-band': identical ensure plans coalesce, conflicting definitions refuse profile-write-conflict (qualification, so no gate intervenes). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-not-fixed", "PS-H12", ["writes","rollback"],
    "decorate-main-participant sets name := concat(name, '*') on every Participant with a processRef. First pass: Main_R becomes 'main-participant*' (with the Link_R reversal). The bounded second evaluation succeeds: the bound Main_R is reused unchanged (reuse validation compares no declared field, H C5), the reversed link no longer matches, but the recipe changes the name again to 'main-participant**'. N(N(x)) != N(x), so N refuses normalization-not-fixed and rolls back the whole stage (no partial reversal either). Witness of the 'second evaluation still changes a value' branch; the refusal branch is cn-n-second-pass-refused. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-reserved-lane-renamed", "PS-H12", ["supportAgreement","ensure","witnesses"],
    "The bound external lane carries a user-chosen name, not the ensure declaration's creation field (external-lane). Reuse validation checks only type, parent and containment property, the processRef/owner relationship and the single binding (DESIGN §5.2; H C5: declared ensure fields are creation fields, a renamed bound support is reused unchanged): the lane is reused, never renamed back, and supports are never found by name. The marked Call_ext is already its member, so the appendUnique is a no-op; no effective change is gated, so the edit activation accepts with no entry (fixed point). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-remap-owner", "PS-H13", ["remap","openId","placements"],
    "Input is the cn-n-deleted-support-stays-absent document plus its archived imported DI (one process diagram whose plane names Process_A). The approved command maps Process_A to Process_X; the total map is identity elsewhere. The main Participant's processRef, every binding ownerId and the DI plane bpmnElement follow, while the surviving supports keep their actual stable-id ids allocated under Process_A (never reallocated) and DI objects keep their own ids. Payload {envelope, importedDi} with the importedDi digest recomputed; report idMap is the complete original->result map of every ID-bearing element (identity rows included, domain migration, §10.1 order; H B14). No invalidation flag: the new revision implies it. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-remap-gated", "PS-H13", ["remap","openId"],
    "ID remapping is a separate approved import migration: the command record is valid and approved, but the OPEN-ID technical gate is open, so with the default edit activation remap_ids refuses profile-open (H H9: approval record and gate both apply). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-remap-unknown-source", "PS-H13", ["remap","openId"],
    "The map row sourceId Ghost names no element of the document: reference-dangling (H C20, py-only code adopted by both runtimes). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-remap-target-grammar", "PS-H13", ["remap","openId","subset"],
    "Result ids must satisfy the authoring subset ^[A-Za-z_][A-Za-z0-9_.-]{0,255}$; '9-bad' starts with a digit, so remap refuses profile-schema (H C20). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-propose-recovery-partial-provenance", "PS-H13", ["importRules","openMachine","item6"],
    "Provenance lists only the Collaboration: it alone is proposed; the other four roles keep no proposal (their ids are occupied but unattested)."],
  ["cn-propose-recovery-with-provenance", "PS-H13", ["importRules","openMachine","item6"],
    "The trusted generated tree of support case 1 lost its bindings. Every role's allocator id exists with the expected type, parent/property and declared fields, and the explicit creation provenance lists it, so the read-only adapter proposes the five original bindings; the envelope is not modified (activation still needs an explicit recovery transaction, bind_supports)."],
  ["cn-propose-recovery-without-provenance", "PS-H13", ["importRules","openMachine","item6"],
    "Same tree without provenance: matching allocator ids alone (hash-shaped ids) do not authorize reuse, so nothing is proposed."],
  ["cn-propose-black-box-pool", "PS-H13", ["importRules","openMachine","item6"],
    "Collab_X/Pool_X carry support labels but no allocator ids and no provenance: no proposal (labels never classify supports). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision."],
  ["cn-bind-supports-conflict", "PS-H13", ["importRules","openMachine","item6","envelope"],
    "The envelope already binds (Process_P, collaboration); supplying it again would duplicate owner+role, refused support-binding-conflict. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-bind-supports-explicit-selection", "PS-H13", ["importRules","openMachine","item6"],
    "The import plan explicitly selects Collab_X as Process_P's collaboration support (activation qualification). bind_supports validates owner and target existence and uniqueness and adds the binding; the tree is unchanged and the revision changes through the bindings. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-bind-supports-gated", "PS-H13", ["importRules","openMachine","item6"],
    "Import support binding is N/import activation gated by OPEN-MACHINE (technical gate open): the default edit activation refuses profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-after-explicit-selection", "PS-H13", ["importRules","openMachine","item6","structure"],
    "Input is the cn-bind-supports-explicit-selection output. The bound Collab_X passes reuse validation (Definitions.rootElements parent, declared name collaboration); the main Participant and band are created inside it after Pool_X, which stays an ordinary unbound participant. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-compile-create-identity-mismatch", "PS-H14", ["create","cr07"],
    "Hand review: create-task's create step is rewritten with identity containment and no ownerId/slot/key (schema-valid: containment forbids the allocator fields). The type bpmn:Task is known and ID-bearing (id true in the neutral descriptors, Task.id admitted by the base); DESIGN §2.4 'identity:containment ... the compiler must prove that the effective base excludes id for this type' and CR-07 'allocated/containment agree with effective id admission' fail; the declared write {owner,/flowElements,create} still matches. Expected: refused profile-create-identity. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}."],
  ["cn-compile-ensure-missing-binding-write", "PS-H14", ["cr06","ensureWrite"],
    "Hand review: every ensure demands {envelope,/bindings,binding} (DESIGN §2.4.1 action/write table: 'parent/property create and envelope /bindings binding'). The variant removes that declared write from ensure-supports; the per-step type, containment and producer checks pass exactly as for the support variant, and the recipe-level comparison finds a required write missing from the declared set (CR-06 'Every action maps to declared writes'). Expected: refused profile-write-set. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}."],
  ["cn-compile-ensure-non-support-type", "PS-H14", ["ensureRestriction","cr06"],
    "Hand review: the variant turns the lane ensure into an ensure of bpmn:Task under self.flowElements and replaces the declared {laneSet,/lanes,create} write by {self,/flowElements,create}, so the declared and required write sets still agree (no profile-write-set), the type is known and Process.flowElements admits Task (no profile-type), and the four earlier steps are unchanged. DESIGN §2.4: 'ensure is restricted to declared structural support roles and native Collaboration/Participant/LaneSet/Lane'; §2.4.1 action/write table: ensure needs 'declared structural type/role and ratified support authority', an authority condition of CR-06 whose authority code is profile-producer (the DESIGN fixture checker raises profile-producer for a non-support ensure). Expected: refused profile-producer. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}."],
  ["cn-compile-port-without-authority", "PS-H14", ["ports","openIo","item8","cr06"],
    "Hand review: the delta is valid (DataInputAssociation.targetRef exists and lists code in the cn base; DESIGN §2.4.1 'each producerDelta replaces its named from actor with to'), so the effective producers become {dropped, editor, import}. complete-input-port is a complete recipe (actor code) whose assignRef target self is a generic native binding (its select predicate is an all(...), not a bare typeIs): 'Generic native bindings conservatively check every admitted target type supporting the field', i.e. SequenceFlow, Association, DataInputAssociation and DataOutputAssociation targetRef; DataInputAssociation lacks code, and CR-06 'rejects a phase actor absent from the resulting field producer set'. No earlier recipe writes a DataInputAssociation field (link writes a typed Association targetRef with actor editor). Expected: refused profile-producer. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}."],
  ["cn-compile-support-profile", "PS-H14", ["cr05to07","supportFixture"],
    "Hand review against DESIGN §2.4/§2.4.1 (no compiler output used). Variant = neutral minus place-task plus the vendored ensure-supports recipe, pins re-pinned to the support slice (a superset of the neutral slice: Collaboration/Participant/LaneSet/Lane, Definitions.rootElements admitting Collaboration, Process.laneSets). CR-05: the five ensure handles are declared before use (main as assignRef target, collaboration and laneSet as parents). CR-06 write set: the required demands are {root,/rootElements,create}, {collaboration,/participants,create} (twice), {self,/laneSets,create}, {laneSet,/lanes,create}, {envelope,/bindings,binding} (once per ensure) and {main,/processRef,reference}; identical demands coalesce (§2.4 'Identical writes coalesce'), giving exactly the six declared writes. CR-06 authority: ensure types are the four support types, each parent containment admits the ensured type, the name fields are declared scalars, and every written field (ids, names, containments, processRef) lists actor code in the support base. CR-07: ensure allocates ID-bearing types with string ownerId values (id of root or self). CR-14: ensure and assignRef belong to normalize. The kept neutral recipes use only types/fields present in both slices. Expected: ok, identity = §5.1 record with sha256 = H(variant). Wire shape (parity sync PS-35): the PureResult {status: ok, payload, diagnostics: []} with payload UNSEALED (CompiledProfile has no wire shape; the member must exist); the compiled §5.1 identity is sealed apart as the compiled-identity artifact."],
  ["cn-compile-variants", "PS-H14", ["compileRules","profileDigest","envelope"],
    "Written CR-01..CR-14 review of every success-path variant (no compiler output used; spec §11.2): neutral and grid are the vendored profiles; support as in cn-compile-support-profile, support-abort adds a refuse step (no write); grid-extraction replaces import by ai on three base fields (valid deltas, no recipe writes them); the cn variants add recipes whose every action maps to its declared writes (identical demands coalesce), whose written fields list the phase actor (code for complete/normalize, editor for commands) in the cn base, whose created types are admitted by their containment and whose ID modes agree with id admission; count uses select and reachable from/to as pinned in the schema; inverseReference properties belong to the referencing type. The compiled identity is the §5.1 record whose sha256 is H(variant profile). Wire shape (parity sync PS-35): one PureResult {status: ok, payload, diagnostics: []} per variant in input order, payload UNSEALED (CompiledProfile has no wire shape; the member must exist); the identities are sealed apart as the compiled-identities artifact, one {variant, identity} per variant."],
  ["cn-c-empty-called-element", "PS-H15", ["emptyCall","dangling"],
    "An empty calledElement is classified by §4.1 (call-target-empty without marker, call-kind-conflict with one), a validate finding, never reference-dangling (H C3). The graph index therefore accepts it; no cn-c recipe applies to a CallActivity and the Process already carries isExecutable=false, so C is a no-op: ok, no entry. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision."],
  ["cn-c-second-pass-refused", "PS-H15", ["writes","rollback"],
    "mark-task-name sets name := 'marked' (idempotent) and refuse-marked-task refuses fixture-second-pass for a Task named 'marked'. First pass: every plan reads the phase-start snapshot (name 'A'), so the refuse recipe has no candidate and the pass succeeds with name 'marked' plus the empty topology arrays. The bounded second evaluation changes nothing but reaches the refuse step: the second run does not return the identical result, so the fixed-point proof fails with normalization-not-fixed (DESIGN §2.4), never with the second-pass code, and no candidate is exposed. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-c-wrong-type-reference", "PS-H15", ["dangling"],
    "Flow_1.targetRef names DO_1, an existing bpmn:DataObject, while the cn slice admits only bpmn:ExclusiveGateway and bpmn:Task as SequenceFlow targets. Wrong-type references are integrity errors before evaluation (DESIGN §2.2): the graph index refuses reference-dangling (H C1 step 5, C2) instead of completing topology. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-compat-before-integrity", "PS-H15", ["order","p1","envelope"],
    "The duplicate-role envelope of cn-n-support-duplicate-role with an older document minor (1.0.0 vs 1.1.0) and its digest: precedence step 3 (§3.3 compatibility, P1 because C/N never load another package) refuses profile-source-unavailable before step 4 would report the duplicate binding (H C1: compatibility before envelope integrity). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-dangling-reference", "PS-H15", ["dangling","rollback"],
    "Assoc_ghost.targetRef names no element. Dangling references are integrity errors before evaluation and never count as absent (DESIGN §2.2): the N graph index (precedence step 5, H C1/C2) refuses reference-dangling before any support plan; layout therefore only ever receives N outputs whose references resolve. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
  ["cn-n-second-pass-refused", "PS-H15", ["writes","rollback"],
    "mark-main-participant sets name := 'marked' (idempotent) on Participants with a processRef; refuse-marked-participant refuses fixture-second-pass for a Participant named 'marked'. First pass (edit, every support bound, nothing gated): plans read the phase-start snapshot, so Main_R is renamed 'marked', Link_R reversed and Ref_R placed, and the refuse recipe has no candidate. The bounded second evaluation changes nothing (Main_R reused, the rename a no-op) but reaches the refuse step: the fixed-point proof fails with normalization-not-fixed (DESIGN §2.4), not with the second-pass code, and no candidate is exposed. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision."],
];
const PY_GROUP = { planRecipe: "python-plan-apply", applyPlan: "python-plan-apply", complete: "python-completion", normalize: "python-normalization",
  sortPlacements: "python-normalization", proposeSupportBindings: "python-support-binding", bindSupports: "python-support-binding", remapIds: "python-import",
  compileProfile: "python-compile" };
const PY_ROLE = { placementIntent: "placement-intent" };
const PY_RECORD_KEYS = ["caseId", "comparatorIds", "expectedArtifacts", "expectedStatus", "inputArtifacts", "operation", "phase", "profileArtifact"];
const VENDORED = [];
const ALIASES = [];
// The compile records as resealed by their owner, checked against the decisions it
// applied (no value is changed here). PS-25: a refusal is exactly the PureResult
// {status: "refused", code, diagnostics: []}. PS-35: a success is {status: "ok",
// payload, diagnostics: []} whose payload is the marker {"$unsealed": reason}
// (CompiledProfile has no wire shape; the member must exist), and the §5.1 identity
// is the separate compiled-identity artifact (compiled-identities {identity, variant}
// for a profile list, in input order). Each identity is reproduced with node:crypto.
// Returns the decision note of the case derivation.
function checkCompileRecord(record, inputArtifacts) {
  const keysOf = value => jcs(Object.keys(value).sort());
  const profileOf = path => JSON.parse(fixtureBytes(path).toString("utf8"));
  const role = r => record.expectedArtifacts.find(a => a.role === r)?.json;
  const success = r => keysOf(r) === jcs(["diagnostics", "payload", "status"]) && r.status === "ok" && jcs(r.diagnostics) === "[]"
    && keysOf(r.payload) === jcs(["$unsealed"]) && typeof r.payload.$unsealed === "string" && r.payload.$unsealed.length > 0;
  const compile = role("compile");
  if (compile === undefined) throw Error(`${record.caseId}: no compile PureResult`);
  if (!Array.isArray(compile) && compile.status === "refused") {
    if (record.expectedArtifacts.length !== 1 || keysOf(compile) !== jcs(["code", "diagnostics", "status"]) || jcs(compile.diagnostics) !== "[]") throw Error(`${record.caseId}: PS-25 refusal shape`);
    return "PS-25 (a compile refusal is exactly {status, code, diagnostics: []})";
  }
  if (!Array.isArray(compile)) {
    if (record.expectedArtifacts.length !== 2 || !success(compile) || !role("compiled-identity")) throw Error(`${record.caseId}: PS-35 success shape`);
    assertEq(jcs(identityOf(profileOf(vendorPath(record.profileArtifact.path)))), jcs(role("compiled-identity")), `${record.caseId} compiled identity`);
    return "PS-35 (success payload UNSEALED by the marker {\"$unsealed\": reason}, identity in compiled-identity)";
  }
  const profiles = inputArtifacts.filter(a => a.role === "profile"), identities = role("compiled-identities");
  if (record.expectedArtifacts.length !== 2 || !Array.isArray(identities) || compile.length !== profiles.length || identities.length !== profiles.length || !compile.every(success)) throw Error(`${record.caseId}: PS-35 list shape`);
  identities.forEach((item, i) => {
    if (keysOf(item) !== jcs(["identity", "variant"])) throw Error(`${record.caseId}: compiled identities item ${i}`);
    assertEq(jcs(identityOf(profileOf(profiles[i].json.path))), jcs(item.identity), `${record.caseId} compiled identity ${item.variant}`);
  });
  return "PS-35 (one success PureResult per input profile with payload UNSEALED by the marker {\"$unsealed\": reason}, identities in compiled-identities {identity, variant})";
}
function vendorPyCase([caseId, row, anchorKeys, derivation]) {
  const sourcePath = `${PY_ROOT}parity/cases/${caseId}.json`, source = pyFile(sourcePath);
  const sourcePin = { path: sourcePath, vendored: source.path, sha256: source.sha256 };
  const record = JSON.parse(source.bytes.toString("utf8"));
  assertEq(jcs(Object.keys(record).filter(k => k !== "commandArtifact").sort()), jcs(PY_RECORD_KEYS), `${caseId} closed Python record`);
  assertEq(record.caseId, caseId, "Python case id");
  const harness = PY_SEAL_FILES[`${caseId}.json`];
  if (!harness) throw Error(`${caseId}: Python harness record not sealed`);
  let profileFile = null;
  if (record.profileArtifact !== null) { const f = pyFile(record.profileArtifact.path); assertEq(f.sha256, record.profileArtifact.sha256, `${caseId} profile`); profileFile = { path: f.path, sha256: f.sha256 }; }
  const inputArtifacts = record.inputArtifacts.map(a => {
    if (own(a, "path")) { const f = pyFile(a.path); assertEq(f.sha256, a.sha256, `${caseId} input ${a.role}`); return artifact(a.role, { path: f.path, sha256: f.sha256 }); }
    return artifact(PY_ROLE[a.role] ?? a.role, clone(a.json));
  });
  const decision = record.operation === "compileProfile" ? checkCompileRecord(record, inputArtifacts) : undefined;
  // Values unchanged: every expected artifact is JCS-equal to the source artifact.
  const expectedArtifacts = record.expectedArtifacts.map(a => artifact(a.role, clone(a.json)));
  for (const a of record.expectedArtifacts) assertEq(jcs(expectedArtifacts.find(x => x.role === a.role).json), jcs(a.json), `${caseId} ${a.role} unchanged`);
  // A refusal carries the caller state equal to the input envelope (the Python runners
  // assert every input unchanged; DESIGN L573).
  const envelopeInput = record.inputArtifacts.find(a => a.role === "envelope");
  if (record.expectedStatus.startsWith("refused:") && envelopeInput) expectedArtifacts.push(artifact("caller-state", clone(envelopeInput.json)));
  const roles = new Set(expectedArtifacts.map(a => a.role));
  for (const id of record.comparatorIds) if (!["profile-c14n/2", "fixed-point/lot3", "plan-apply/lot3", "compile/lot3"].includes(id)) throw Error(`${caseId}: unmapped Python comparator ${id}`);
  if (record.comparatorIds.includes("plan-apply/lot3") !== (record.operation === "planRecipe" && roles.has("apply"))) throw Error(`${caseId}: plan-apply chaining`);
  if (record.comparatorIds.includes("compile/lot3") !== (record.operation === "compileProfile")) throw Error(`${caseId}: compile comparator`);
  // The Python profile-c14n/2 maps to this lot's complete-artifact comparator of the
  // primary role plus profile-c14n/2; fixed-point/lot3, plan-apply/lot3 and
  // compile/lot3 keep their ids (a compile record carries compile/lot3 only).
  const primary = roles.has("result") ? "result-1/lot3" : roles.has("plan") || roles.has("apply") ? "plan-apply/lot3" : roles.has("compile") ? "compile/lot3"
    : roles.has("placements") ? "placements-order/lot3" : undefined;
  if (!primary) throw Error(`${caseId}: no primary role`);
  const comparatorIds = [primary, ...(roles.has("caller-state") ? ["source-preservation/lot3"] : []), ...(record.comparatorIds.includes("profile-c14n/2") ? ["profile-c14n/2"] : []),
    ...(record.comparatorIds.includes("fixed-point/lot3") ? ["fixed-point/lot3"] : [])];
  const anchors = anchorKeys.map(key => { if (!PY_ANCHORS[key]) throw Error(`${caseId}: anchor ${key}`); return PY_ANCHORS[key]; });
  if (derivation.includes("|")) throw Error(`${caseId}: table separator in the derivation`);
  const origin = `the Python seal ${PY_SEAL.sha256} (MANIFEST.sha256 at ${PY_SEAL.commit}), case file SHA-256 ${source.sha256}`;
  const statement = `vendored unchanged from ${origin}; values owned by that seal${decision ? `, which applied the parity-sync decision ${decision} to this record` : ""} (BLOCKB-HARMONIZATION §3, BLOCKB-PARITY-SYNC ${row})`;
  addCase({ caseId, group: PY_GROUP[record.operation], clause: anchors[0], cites: anchors.slice(1), discriminates: derivation,
    vendored: { row, source: { runtime: "python", ...sourcePin }, harness: { path: `${PY_ROOT}${caseId}.json`, sha256: harness }, derivation: statement } },
  { operation: record.operation, phase: record.phase, profileFile, inputArtifacts,
    commandArtifact: record.commandArtifact ? artifact(record.commandArtifact.role, clone(record.commandArtifact.json)) : undefined,
    expectedStatus: record.expectedStatus, expectedArtifacts, comparatorIds });
  VENDORED.push({ caseId, row, source: sourcePin });
}
for (const row of PY_ROWS) vendorPyCase(row);
// PS-37: byte-identical twins are one parity case each; no file is copied and the
// manifest lists the Python record digest beside the owning JS case.
for (const [caseId, aliasOf] of [["cn-n-place-neutral", "l3-n-place-neutral"], ["cn-n-place-grid-shared-anchor", "l3-n-place-grid-shared-anchor"]]) {
  const sha256 = PY_PARITY.files[`${PY_ROOT}parity/cases/${caseId}.json`];
  if (!sha256) throw Error(`alias ${caseId} not pinned by the Python parity manifest`);
  assertEq(PY_SEAL_FILES[`parity/cases/${caseId}.json`], sha256, `alias ${caseId} seal listing`);
  if (!CASES.some(c => c.meta.caseId === aliasOf)) throw Error(`alias target ${aliasOf}`);
  ALIASES.push({ caseId, aliasOf, sha256 });
}

// ================================================================ UNSEALED gates (owner OPENs and technical activation gates)
const UNSEALED = [
  { id: "U1", openIds: ["OPEN-HOOK"], clause: clause("§8.2", 637, 639), cites: [clause("§13", 923), clause("§14.2", 952), clause("§8.2", 635)],
    point: "Live pointer and keyboard gesture interception (capture at pointer-down or direct-edit start, preview geometry, interception before the upstream commit or the measured restore fallback) and the browser witnesses DI-only drag, resize, reconnect, palette drop, direct edit, keyboard delete/paste, cancellation during async layout, multi-page rollback, one undo/redo and no callback leak; and a native modeling command (a command-stack entry such as element.updateLabel) arriving while the root transaction is applying.",
    default: "Detached staging, one root profile.transaction command, final-only callbacks; an entry that cannot preserve pointer capture, selection, undo cursor and DI is disabled with transaction-entry-unsupported. No accepted lot-0 prototype or receipt exists at the seal base: only the programmatic contract (l3-tx-*) is sealed, and a gesture's final intent enters through the stageGesture adapter seam. DESIGN L635 refuses any unexpected command entry during applying with transaction-reentrant and disables unadapted mutation commands, but the headless canvas has no native modeling service and no caller-visible outcome of a refused native command is defined before the prototype receipt: l3-tx-reentrant-refused seals the public applyCommands re-entry only." },
  { id: "U2", openIds: ["OPEN-RESERVED-N"], clause: clause("§7.2", 554), cites: [clause("§13", 917), clause("§16", 1160)],
    point: "Activated N support creation in business-profile editing once both gates pass (owner ratified, conductor plus twin atomicity proof pending).",
    default: "Until both gates pass, an N ensure that would create a support refuses profile-open in edit activation (sealed: l3-n-full-edit, l3-n-hash-shaped-occupant-edit, l3-n-recreate-after-remap-edit); neutral qualification proceeds (sealed qualification vectors). The activated editing behavior is not sealed." },
  { id: "U3", openIds: ["OPEN-EXTERNAL", "OPEN-BASE"], clause: clause("§4.1", 362, 364), cites: [clause("§13", 909, 910), clause("§16", 1140, 1142), clause("§8.3", 651)],
    point: "Creation of an external call (palette or AI), migration of legacy external markers to the discriminator, and the activated external branch of N in editing.",
    default: "One dedicated native Documentation marker, absence means incomplete; external creation and migration stay unavailable until both libraries prove the encoding and the effective base admits CallActivity.documentation with a conditional calledElement. Sealed: recognition and the N external branch as qualification vectors with the neutral marker, and the edit refusal l3-n-imported-supports-edit (profile-open). The profile has no external creation entry." },
  { id: "U4", openIds: ["OPEN-SHARING"], clause: clause("§4.4", 410), cites: [clause("§7.2", 559), clause("§16", 1146), clause("§13", 914)],
    point: "Removal of a conflicting business-lane membership once an accepted persisted representation of the original responsibility or an approved concrete loss exists, and the explicit bulk name synchronization command.",
    default: "Preserve original memberships: qualification refuses responsibility-preservation-required (l3-n-business-lane-refusal), edit refuses profile-open (l3-n-business-lane-refusal-edit); never synchronize divergent reference names during N (l3-n-two-processes). The permitted removal and the bulk command are not sealed." },
  { id: "U5", openIds: ["OPEN-IO"], clause: clause("§7.1", 546), cites: [clause("§13", 920), clause("§16", 1154)],
    point: "Production activation of the missing-output-source producer exception and any completion that would remove or weaken a producer restriction.",
    default: "Preserve every valid port and set; the main profile has no output-port authority (l3-c-input-ports leaves DOA_1 unported); the variant expressing the authority refuses profile-open in edit (l3-c-output-port-gated) and creates the keyed port only in qualification (l3-c-output-port-qualification). Activation needs the owner's approval of the precise change." },
  { id: "U6", openIds: ["OPEN-RELATIONS"], clause: clause("§4.3", 404), cites: [clause("§13", 918), clause("§16", 1156), clause("§7.2", 562)],
    point: "External-producer substitution (an Association from an external call to a Process DataOutput), the activity-only producer restriction, the acceptance status of documents depending on them, and N's or validate's handling of that candidate link.",
    default: "Retain every evidenced supplier/consumer link with its direction, invent no endpoint, keep the substitution and the activity-only rule gated, refuse affected final acceptance with profile-open while unresolved. The link-endpoint rule never reports the candidate pair, no sealed vector contains it, and N has no reversal recipe for it." },
  { id: "U7", openIds: ["OPEN-RELATIONS"], variant: "situation/trigger branch variant, DESIGN §13 L919", clause: clause("§4.2", 389, 391), cites: [clause("§13", 919), clause("§16", 1158)],
    point: "The stricter immediate named-branch convention (start event followed directly by an exclusive gateway with named outgoing flows) and any acceptance status that depends on adopting it.",
    default: "Ratified default: a source-backed downstream exclusive branch, no invented adjacency or choice text, no gateway created by N; the strict candidate stays disabled until expressly adopted (sealed: l3-trig-downstream-branch-accept accepts a non-adjacent branch)." },
  { id: "U8", openIds: ["OPEN-MIGRATION"], clause: clause("§5.3", 452), cites: [clause("§13", 916), clause("§16", 1138), clause("§16", 1150)],
    point: "Every concrete behavior-changing or lossy migration: legacy evidence adapters (process-reference metadata, text markers, placement metadata, support labels) and the approval of a specific ID remap of accepted data.",
    default: "Evidence-based classification, complete loss and remap report, retained ambiguous source snapshot, activation refuses rather than discarding. Sealed: remap mechanics with an explicit approval record and the OPEN-ID gate (l3-imp-remap-*), legacy markers never classifying (l3-n-legacy-marker-ignored); no legacy adapter is sealed." },
  { id: "U9", openIds: ["OPEN-ID", "OPEN-MACHINE"], clause: clause("§3.2", 290), cites: [clause("§5.2", 440, 442), clause("§13", 915), clause("§13", 921)],
    point: "Owner restrictions on already accepted persisted data, the activated binding transaction in editing once the gates pass, and the persisted-loss policy for retained black-box participants the base does not permit.",
    default: "Explicit migration only, never edit-time normalization; recovery stays a proposal (sealed: l3-propose-*) until an explicit binding transaction, gated by OPEN-MACHINE (sealed: l3-bind-supports-gated refuses profile-open in edit, the qualification vectors bind); unrelated black-box participants are retained where the base permits them (l3-n-black-box-pool-retained), otherwise reported as normal import loss." },
];

// ================================================================ documents
const lineRef = l => l[0] === l[1] ? `L${l[0]}` : `L${l[0]}–${l[1]}`;
const cite = c => `${c.section} ${lineRef(c.lines)}`;
function groupCounts() { const groups = {}; for (const { meta } of CASES) groups[meta.group] = (groups[meta.group] ?? 0) + 1; return groups; }
const GROUP_CLAUSES = {
  identity: "§3.2 L276–L292", completion: "§7.1 L536–L548, §2.4 L176, §3.3 L298–L319, §5.1 L434", normalization: "§7.2 L554–L565, §5.2 L438–L442, §4.4 L410, §4.1 L381–L383, §8.2 L631",
  "fixed-point": "§7.3 L569", "mixed-runtime": "§7.3 L569, §14.3 L963", "call-kind": "§4.1 L366–L379", "ordinary-path": "§6.3 L499–L502, §14.3 L969, §4 L347",
  "trigger-branch": "§4.2 L389", "io-links": "§4.3 L397–L404, §6.3 L502", import: "§5.2 L444, §5.3 L450, §3.2 L290", transaction: "§8.1 L587–L606, §8.2 L629–L643, §7.2 L565",
  "support-binding": "§5.2 L440–L442, §13 L915",
  "python-plan-apply": "§2.4 L158–L176, §2.4.1 L201–L216, §2.5 L230–L231 (vendored, PS-H08, PS-H11)",
  "python-completion": "§7.1 L536–L546, §3.3 L298–L314, §2.4 L176, §2.2 L132 (vendored, PS-H09, PS-H15)",
  "python-normalization": "§7.2 L554–L565, §7.3 L569–L573, §5.2 L438–L440, §8.2 L631 (vendored, PS-H10–PS-H13, PS-H15)",
  "python-support-binding": "§5.2 L440–L442, §13 L915, §16 L1150 (vendored, PS-H13)",
  "python-import": "§5.2 L444, §13 L921 (vendored, PS-H13)",
  "python-compile": "§2.4.1 L182–L199, §5.1 L430 (vendored, PS-H14)",
};
function refusalCodesOf() {
  const codes = new Set(CASES.map(c => c.vector.expectedStatus).filter(s => s.startsWith("refused:")).map(s => s.slice(8)));
  for (const { vector } of CASES) for (const record of vector.expectedArtifacts.find(a => a.role === "trace")?.json ?? []) {
    if (record.result?.status === "refused") codes.add(record.result.code);
    if (record.injected?.status === "refused") codes.add(record.injected.code);
  }
  return [...codes].sort();
}
function readme() {
  const groups = groupCounts();
  const clauseRows = {};
  for (const { meta } of CASES) (clauseRows[meta.clause.section] ??= []).push(meta.caseId.replace(/^l3-/, ""));
  const refusalCodes = refusalCodesOf();
  return [
    "# Lot 3 sealed expectations: C/N, command authority and early history proof",
    "",
    "Status: resealed in the single seal fix round after the independent review",
    "(REWORK, six MAJOR and one MINOR findings) and the JS/Python harmonization",
    "decisions of 2026-10-18. The fix-round report maps every finding and decision",
    "to its outcome. Resealed for the block-B JS/Python parity sync of 2026-10-19",
    "(BLOCKB-PARITY-SYNC): the own-side value changes PS-21 and PS-32, the vendored",
    "Python lot-3 parity cases and the shared rules recorded under \"Parity sync\".",
    "Resealed again on 2026-10-19 for `l3-id-unicode-names` alone, after the lot-3",
    "code author reported that its sealed triple shared the ordinal-0 ID contrary to",
    "DESIGN L292: a rewrite of this helper had folded U+E000, U+00A0 and U+2028 of",
    "three input names into ASCII spaces, which made three siblings byte-identical,",
    "and the helper passed a literal ordinal 0. The names regain those code points",
    "and gain the canonically equivalent pair U+00E9 / e+U+0301; every ordinal is",
    "computed by the L292 rule (all eight are 0 and the eight IDs differ).",
    "Resealed once more on 2026-10-19 for the Unicode literals of six more case files,",
    "after an audit of every case against the first seal: the same rewrite had folded",
    "U+E000, U+00A0 and U+2028 in `l3-id-stable-vectors`, `l3-c-preserve` and the",
    "process shared by `l3-n-unicode-names`, `l3-fp-n-unicode-names` and the two",
    "`l3-mix-n-unicode-names-*` cases, which stayed green but no longer witnessed their",
    "stated property. The first-seal code points are restored (ASCII helper source,",
    "braced escapes) and a decomposed e+U+0301 key and reference name are added so that",
    "the NFC and NFD claims are observable; only those cases and the IDs, revisions and",
    "transport bytes derived from them change.",
    "Resealed on 2026-10-19 for the real-canvas rebind of the 18 `l3-tx-*` scripts (block B",
    "review, BLOCKER 1). They had run through a test double in `src/` that stored",
    "placeholder presentations, emitted change events without a report, wrote the",
    "re-entrancy outcome without a nested call and refused one entry by its name;",
    "replayed on the real canvas, the C writes on created tasks came out at the exact",
    "coordinates of the staged tree. Decision (DESIGN L751, L755, L766, §8.2 L629 and",
    "L632–L633): a transaction is one operation whose change entries have their source",
    "in its before-tree and their result in its committed tree, so the sealed generated",
    "coordinates stay and the canvas reports them; observed findings keep the coordinates",
    "of the linted candidate (L510, B12), as the lot-5 seal has them. Every `l3-tx-*` case",
    "now also rejects the double: change events carry the report of their own result",
    "(L606, L633), snapshots carry a Layout/1 record (L610, L667), the re-entrancy outcomes",
    "are the Result/1 refusals of real nested calls made by the transaction-phase hook",
    "(L604, L635) and the set-selection refusal of a new Process input comes from C, next",
    "to a single-set control (L547). Only the `l3-tx-*` cases change.",
    "",
    "- Spec author: Opus (owner exception while the usual spec author is unavailable).",
    "- Reviewer: gpt-6-astra, max effort (first seal reviewed; this reseal pending review).",
    "- Production code is written later, by another model, against these files. This",
    "  directory contains no implementation and none was read, imported or run to",
    "  obtain or confirm an expected value.",
    "",
    `Authority: DESIGN R3.3 (1162 lines, SHA-256 \`${DESIGN_SHA256}\`), in scope`,
    "§3.2 (L274–L292), §5.2–§5.3 (L436–L452) as consumed by import adapters, §7",
    "(L532–L573) and §8.2 (L625–L645), with §2.4, §3.3, §4.1–§4.4, §6.2–§6.4, §8.1,",
    "§10.1, §13, §14.3 and §16; then the harmonization decisions (precedence DESIGN >",
    "harmonization > review finding); the block A public API at the seal base",
    "(`src/profile/`, `src/io/`, `docs/design/`) read for contract shapes only; the",
    "lot-0 contracts and vendored corpus (profile-c14n/2, stable-id/1,",
    "DocumentEnvelope/1, Result/1, Report/2, Snapshot/1, profile-parity-corpus/1).",
    "",
    "## Layout",
    "",
    "| Path | Content |",
    "| --- | --- |",
    `| \`cases/*.json\` | ${CASES.length} cases in the closed profile-parity-corpus/1 shape \`{caseId, operation, phase, profileArtifact, inputArtifacts, commandArtifact?, expectedArtifacts, expectedStatus, comparatorIds}\` |`,
    "| `manifest.json` | corpus manifest: parent manifests, pinned comparator executables, comparators, profiles with their load inputs and identity digests, case file digests, the vendored Python seal, the source record digest of each vendored case and the PS-37 aliases; paths relative to `tests/fixtures/` |",
    "| `comparators/lot3-comparators.mjs` | the executable comparators (zero tolerance), pinned by SHA-256 in `manifest.json` and `seal.json` |",
    "| `index.json` | per case: group, operation, status, primary DESIGN clause, secondary citations, runtimes and the plausible wrong implementation it fails (for a vendored case: the Python derivation, its parity-sync row, source and harness record digests and the derivation statement); the section table; the UNSEALED list |",
    "| `profile/` | neutral-cn descriptor slice, base, the main profile and nine single-purpose variants |",
    `| \`vendor/py/\` | raw files of the Python lot-3 seal (commit \`${PY_SEAL.commit.slice(0, 7)}\`), paths relative to its \`tests/profile_cn/expected/\`: \`MANIFEST.sha256\` (the seal, SHA-256 \`${PY_SEAL.sha256}\`), \`parity/manifest.json\`, the ${VENDORED.length} imported \`parity/cases/*.json\` records, the ${PY_PROFILES.length} composed \`parity/profiles/*.json\` variants and the four \`artifacts/\` descriptor and base packages |`,
    "| `author/author-lot3.mjs` | the standalone derivation helper (manual tool, never run by CI) |",
    "| `author/digests.json` | every stable-id/1 tuple, birth content signature, revision, view tuple and transport digest the helper computed, with the canonical strings |",
    "| `seal.json` | SHA-256 and byte length of every file above, of the generated `docs/design/block-b-lot3-expectations.md` and of the consumed lot-0 inputs |",
    "",
    "A case cannot carry a citation field without breaking the closed corpus shape",
    "(DESIGN L959), so each citation lives in `index.json`; the clause → case table is",
    "`docs/design/block-b-lot3-expectations.md`. The reseal ledgers",
    "`docs/design/receipts/block-b-lot3-seal-fix.json` (seal fix round, kept as",
    "history), `docs/design/receipts/block-b-lot3-parity-sync.json` (parity sync,",
    "chained to it), `docs/design/receipts/block-b-lot3-unicode-names-fix.json`",
    "(unicode-names fix, chained to the parity sync),",
    "`docs/design/receipts/block-b-lot3-unicode-literals-fix.json` (Unicode literal",
    "restoration, chained to the unicode-names fix) and",
    "`docs/design/receipts/block-b-lot3-l3tx-rebind.json` (real-canvas rebind of the",
    "`l3-tx-*` scripts, chained to the literal restoration) record the previous and",
    "current seal digests and the old/new pin of every changed, added or removed file;",
    "the last three also list the old and new value of every changed name, key, ID,",
    "revision, transport digest and trace or script member.",
    "",
    "## Method",
    "",
    "1. Every expected tree, binding, placement and trace is a hand-authored literal,",
    "   and every change report is a hand-declared list of written locations with the",
    "   recipe that planned each write. The helper imports only `node:crypto`,",
    "   `node:fs`, `node:path` and `node:url`. It computes JCS (RFC 8785) and SHA-256",
    "   for stable-id/1 values, birth content signatures, revisions, view digests and",
    "   transport digests, reads values at JSON pointers of its own literals, fills the",
    "   Report/2 coordinates of the declared locations (B9), and sorts entries, idMap",
    "   rows and placements by the DESIGN orders. It loads, compiles or evaluates",
    "   nothing and runs no C, N, lint, layout, codec, exporter or command.",
    "2. Before writing, the helper checks its literals: reverting every declared",
    "   written location must give back the input tree byte for byte; a declared",
    "   location whose value does not change aborts; C-complete trees must have",
    "   ID-sorted same-container topology, gateway directions per DESIGN L544, covered",
    "   IO sets, ports and backings; placements must be in the DESIGN L565 order.",
    "3. The helper first reproduces digests already sealed by lot 0 (support IDs, the",
    "   root ID, a sibling ordinal ID, the neutral profile digest, a semantic revision,",
    "   the theme, overrides, styles and metrics digests, a layout digest and a view",
    "   revision). Any mismatch aborts.",
    "4. No runtime output became an expectation and no library run confirms one. The",
    "   first seal's input-admission test (which imported the block A loader and",
    "   asserted the profile identity) and its scratch compiler probe are withdrawn",
    "   from the evidence: profile identities are computed by the helper with",
    "   `node:crypto` only (`author/digests.json`), and compile admission is",
    "   justified by the written review below. Regenerating requires editing the",
    "   literals: `node tests/fixtures/lot3-cn/expectations/author/author-lot3.mjs <DESIGN.md>`.",
    "5. The vendored Python cases are not authored here: the helper reads the raw",
    "   Python seal files under `vendor/py/`, checks every digest against the pinned",
    "   Python seal manifest and parity manifest, and re-expresses each record (see",
    "   \"Parity sync\"). Their values are the Python seal's hand-derived values, never",
    "   an implementation output; the compile records carry the PS-25/PS-35 values",
    "   their owner applied before resealing, named in each case's derivation statement.",
    "",
    "## Written compile review (CR-01…CR-14)",
    "",
    "Each profile in `profile/` was reviewed against the compiler rule table",
    "(DESIGN §2.4.1 L184–L212) without running a compiler:",
    "",
    "- CR-01: the six lot-0 capabilities only; every operator used (count, reachable, recognizes, boundRole, typeIs, equal, present, ids, id, read, param, literal) belongs to them.",
    "- CR-02: `ids` appears only in assignRef values; create fields are scalar literals or string parameters.",
    "- CR-03: every selector uses order `id`; `property` appears only on reference, inverseReference and children traversals.",
    "- CR-04: every count has min ≤ max; reachable uses minHops 1 without maxHops.",
    "- CR-05: notion, recipe, rule, message, theme, glyph and binding names are unique and resolved; the recognition graph is acyclic (call-external, external-lane).",
    "- CR-06: every action has its declared write; complete writes code-produced fields of the base; normalize writes only supports, bindings, Lane.flowNodeRef, processRef and Association direction; the extraction variant replaces `import` by `ai` on four fields only.",
    "- CR-07: allocated creates and ensures carry explicit ownerId, slot and key values; ownerIds never rely on the nearest container (the default IO sets use the Definitions ID).",
    "- CR-08: ten validation records, every standard rule present and off, every profile rule in its post-normalize stage with integrity rules at error in both policies.",
    "- CR-09: notions declare one exclusive group or a facet; glyphs are native with positive viewBoxes; the second theme shares geometry and only changes paint.",
    "- CR-10: every required recipe parameter of a surface entry is bound exactly once from owner, target, source, value or key.",
    "- CR-11/CR-12: the export and migration records are the lot-0 neutral ones unchanged.",
    "- CR-13: fallbacks appear only with cardinality `first`.",
    "- CR-14: create/complete/normalize/edit actions respect the phase table (remove only in the edit recipe `remove-lane`).",
    "",
    "## Fixture world",
    "",
    "- `neutral-cn-descriptors/1` and `neutral-cn-base/1` (version `fixture-cn-1`):",
    "  the BPMN slice for calls, events, timers, gateways, data associations, ports,",
    "  Process IO and sets, Collaboration/Participant/LaneSet/Lane, DI/DC types,",
    "  `bpmn:ComplexGateway` and the extension item `neutral:LegacyItem`, which the",
    "  descriptors know but the base does not admit (presentation and out-of-base",
    "  projection witnesses). Every base field is produced by `code`, `editor` and",
    "  `import`; `calledElement` is the only ID-valued scalar.",
    `- \`neutral-cn/1\` ${PROFILE_VERSION} derives from \`neutral/1\` (themes, UI entry, exports,`,
    "  dialect, migration, resources, task/aid notions, the five task-name rules and",
    "  the command recipes are kept). It adds the notion `call-external` (exactly one",
    "  Documentation marker with textFormat `text/x-neutral-call-kind` and text",
    "  `external`, no calledElement) and the facet `external-lane` (bound role); 20",
    "  post-normalize rules (ordinary path, call kind, trigger branch, supplier and",
    "  consumer links, link endpoint type and direction, link ownership, sequence-flow",
    "  container); the complete recipes (Definitions defaults, isExecutable, topology,",
    "  gateway direction, item backing, input ports, IO sets); the normalize recipes",
    "  (structure, external lane, reference band, external-membership release and",
    "  append, placements, relation direction); the commands `create-start`,",
    "  `create-end`, `connect`, `create-process-input`, `create-process-input-unassigned`",
    "  and the edit recipe `remove-lane`; six surface entries for the scripts; and a",
    "  paint-only second theme `contrast` (fallback `plain`). Every standard bpmnlint",
    "  setting is off (the compensated policy family of DESIGN L499–L502); readiness",
    "  rules warn in draft and error at acceptance, integrity rules error in both.",
    "- Variants (one purpose each): `stale` counts stored references for gateway",
    "  direction; `conflict` and `coalesce` add a sibling isExecutable write (true /",
    "  identical); `outport` adds the output-port authority; `flip` adds a recipe",
    "  reversing the reference pair back; `dirconflict` adds a second direction write;",
    "  `ensureconflict` adds a second reference-band ensure with another name;",
    "  `extraction` grants the ai actor four fields; `abort` appends a refuse step",
    "  after every ensure.",
    "- The lot-0 `neutral/1` and `neutral-grid/1` profiles serve the paired",
    "  isExecutable vectors, the no-topology control and the lot-0 placement vectors",
    "  (their completed trees and placements are reused unchanged from the lot-0",
    "  fixtures).",
    "- Support roles, slots and keys repeat the lot-0 support fixture (DESIGN",
    "  L284–L286), so `Definitions_support`/`Process_A` supports have the lot-0 IDs.",
    "",
    "## Operations, inputs and seams",
    "",
    "| Operation | Contract |",
    "| --- | --- |",
    "| `complete` | `complete(compiled, envelope, mode)` (DESIGN L232); input artifacts `envelope`, `mode` (`retained` or `extraction`, B7) and optional `activation` (`qualification`; absent means `edit`, H1); expected Result/1 with the envelope payload |",
    "| `normalize` | `normalize(compiled, envelope, placementIntent?)` (L233); optional `activation` and `placement-intent` (`[{elementId}]`); payload `{envelope, placements, report}` with `payload.report` equal to `report` (B5) |",
    "| `validate` | `validate(compiled, envelope, {phase, readinessPolicy})` at `post-normalize`; payload `{ok, counts}`; complete unified entries (B12) |",
    "| `remapIds` | the approved import ID migration (B14, H9): input artifacts `envelope` (committed) and `importedDi` (Snapshot/1 record), `activation`; command `{kind: \"id-remap\", approved, approval, map, referenceFreeAttestations, namespaces?}`; payload `{envelope, importedDi}`; `report.idMap` is the complete original→result map |",
    "| `importProjection` | out-of-base projection of a strict native JSON source (B15): payload `{tree}`; one loss entry per dropped element |",
    "| `proposeSupportBindings`, `bindSupports` | recovery preview (input `provenance`: support IDs with creation provenance; PureResult `{proposals}`) and the explicit binding transaction (input `bindings`, `activation`; Result/1 with the envelope payload), DESIGN L440–L442 |",
    "| `stable-id/1`, `sortPlacements` | pure vectors (allocation tuples; L565 placement order); the vendored sortPlacements case keeps the Python roles `placements` (input and expected) |",
    "| `planRecipe` | vendored Python cases: `planRecipe(recipe, ReadContext, Params, Authority)` (L230) over the input `envelope` with `recipe` (a compiled recipe id, or a record), `params` and `authority` (`{actor, activation, deletionIntent}`); expected `plan` PureResult with WritePlan/1 and, when the case chains it, `apply` = applyPlan(plan.payload, envelope.tree, envelope) (PS-01) |",
    "| `applyPlan` | vendored Python cases: `applyPlan(plan, stagedTree, stagedEnvelope)` (L231) with input artifacts `plan`, `envelope` and optional `stagedTree` (else the envelope tree); expected `apply` PureResult with ChangeReport/1 |",
    "| `compileProfile` | vendored Python cases: `compileProfile(validated, RegistrySet)` (L227) on the pinned profile, or on each `profile` input record `{path, sha256}` of a list; expected `compile` PureResult (a list for a list) whose success payload is the marker `{\"$unsealed\": \"compiled-profile\"}`, and `compiled-identity` / `compiled-identities` (PS-25, PS-35) |",
    "| `transaction-script` | canvas only (JS), on the real canvas: `lot3-transaction-script/2` steps calling `onChange`, `unsubscribe`, `setDefinitions`, `restoreSnapshot`, `getDefinitions`, `getSnapshot`, `applyCommands` (lot-5 command records, I3), `stageGesture` (seam: the final intent of a gesture), `setTheme`, `undo`, `redo`, `dispose`; `{$ref: {step, pointer}}` anywhere in a step, an `inject` request included, resolves to the actual value of an earlier step; `inject` is one directive of a closed set run by the transaction-phase hook (section \"Transaction-phase hook\"): `{phase: \"staging\", action: \"abort-signal\"}`, `{phase: \"staging\", action: \"dispose\"}`, `{phase: \"applying\", action: \"reenter\", request}`, `{phase: \"applying\", action: \"reenter-and-throw\", request}`; `injected` is the value that the real call made by the hook returned |",
    "",
    "Every caller-visible input of a JS-owned case is compared after the call",
    "(`caller-state`), success or refusal (DESIGN L573: only a successful return",
    "exposes a candidate); a vendored Python refusal with an input envelope carries",
    "`caller-state` equal to that envelope (BLOCKB-PARITY-SYNC §2.2).",
    "",
    "### Transaction-phase hook",
    "",
    "The `l3-tx-*` scripts drive the real canvas through an adapter in `tests/helpers`",
    "that replaces the former test double and never writes an outcome itself. The",
    "adapter needs one internal hook of the canvas transaction, reachable from the test",
    "construction path of the canvas only, never from the public factory, its options",
    "or the package:",
    "",
    "- The canvas calls `hook(phase)` synchronously, once per accepted `applyCommands`",
    "  or gesture transaction: `staging` after the step-1 checks (disposed, not loaded,",
    "  read-only, aborted signal, stale `baseRevision` or `expectedViewRevision`, guard",
    "  not idle) and the guard change to `staging`, before C; `applying` after the",
    "  candidate is complete (C, pre-normalize lint, N, post-normalize lint) and the",
    "  guard change to `applying`, before any live envelope, presentation, selection,",
    "  history entry or change event changes (DESIGN L629–L635). It is never called for",
    "  a refused request, a load, a snapshot, a theme switch, undo or redo.",
    "- An exception thrown by the hook is an unexpected internal exception (L604): the",
    "  stage is discarded, the guard returns to `idle` (L635), no history entry or event",
    "  is produced, and the call returns `operation-error` echoing the committed identity",
    "  and revision, whose `diagnostics` and `report.entries` are the lint entries of the",
    "  stages already run on the candidate (L735, B2): none at `staging`, the",
    "  pre-normalize and post-normalize entries at `applying`.",
    "- A call made from the hook during `applying` re-enters the public API:",
    "  `applyCommands` refuses `transaction-reentrant` at entry, before its first await,",
    "  with the closed Result/1 refusal (echo of the committed identity and revision,",
    "  empty report; L604, L635, B2, B3) and has no effect. During `staging` the adapter",
    "  only aborts the signal or disposes the canvas; the canvas re-checks disposal",
    "  (`canvas-disposed`, no echo) and the signal (`operation-cancelled`) before it",
    "  commits.",
    "- Directives: `abort-signal` aborts the AbortSignal of the request inside the",
    "  `staging` hook; `dispose` calls `dispose()` there and records its PureResult as",
    "  `injected`; `reenter` calls `applyCommands(request)` once inside the `applying`",
    "  hook and records its resolved value; `reenter-and-throw` does the same, then",
    "  throws. A directive whose phase is not reached exactly once fails the step.",
    "- The adapter builds the canvas from the session artifacts (profile, descriptors",
    "  and metrics, each checked by digest; business-profile mode, draft readiness,",
    "  initial theme `session.theme`), reads history counts and change events through",
    "  the canvas test accessors and translates `stageGesture` through the canvas gesture",
    "  API.",
    "",
    "## Comparators",
    "",
    "`comparators/lot3-comparators.mjs` implements every comparator ID used by the",
    "cases; `manifest.json` pins its SHA-256 under `executables` and per comparator.",
    "Comparison is canonical-JSON equality of the complete artifact (Result/1 with",
    "its complete Report/2: header, entries in profile-report/2 order, idMap order,",
    "refusal diagnostics; payload; serialized bytes for transports). A member is",
    "excluded only through the case's `unsealed` artifact, which lists JSON pointers",
    "(`*` matches one key or index) with a reason; an UNSEALED member must still be",
    "present. Trace records may use `{$same: {step, pointer}}` and",
    "`{$differs: {step, pointer}}` markers that relate a value to the actual value of",
    "an earlier step. The golden test runs every comparator on the ideal actual",
    "values and on targeted mutations of them.",
    "",
    "The parity sync adds the vendored Python comparators with their Python manifest",
    "notes: `fixed-point/lot3` (the runner supplies the second-run Result/1 on the",
    "expected output as the actual role `fixed-point`: status ok, identical envelope",
    "and placements, no report entry, baseRevision = revision = the first revision)",
    "and `plan-apply/lot3` (the `plan` PureResult and, when expected, the `apply`",
    "PureResult of applyPlan chained on the actual plan); and `compile/lot3` (the",
    "compile PureResult, compared after each `{\"$unsealed\": reason}` marker is",
    "replaced by the actual member, which must exist, and the compiled identity;",
    "PS-25, PS-35). `placements-order/lot3` also reads the vendored `placements` role.",
    "",
    "## Harmonization decisions applied",
    "",
    "A2, A4, A5, A7, A8 (corpus records, operation names, transport, full artifacts);",
    "B1–B5, B7–B12, B14, B15 (Result/1, Report/2, payloads, mode, change entries and",
    "coordinates, remap, projection); C1–C6, C8, C10, C11, C20 (refusal precedence and",
    "codes); D1–D5 (identity slots and ordinals); F1, F2, F4 (emptied arrays); G1, G2,",
    "G4, G6 (orders); H1–H3, H9 (activation and gates); I1–I5 (transactions); J1",
    "(lint inside commands). The py-only cases added on JS fixtures are listed in the",
    "fix-round report.",
    "",
    "## Interpretations recorded (DESIGN default taken where a point would block)",
    "",
    "1. Change entries (B8–B11): one entry per distinct written location whose value",
    "   changes; `after` is the final value at that location, so a created element",
    "   shows its final subtree; coalesced writes are reported once under the first",
    "   planning recipe; placements and binding writes produce no entry. A write on",
    "   an element created in the same operation (by a recipe or by a command of the",
    "   same transaction) has the generated source `{none, null, null, generated}` and a",
    "   generated result. A transaction is one operation: its change entries have their",
    "   source in the before-tree of `baseRevision` and their result in the committed",
    "   tree (DESIGN L751, L755, L766; §8.2 L629, L632–L633), never in the staged tree of",
    "   one of its stages; observed findings keep the coordinates of the linted",
    "   candidate and an unavailable result (L510, B12).",
    "2. Emptied arrays stay `[]` and absent → `[]` is a change (F1); the out-of-base",
    "   projection likewise keeps an emptied containment array (`dataOutputAssociations: []`).",
    "3. C allocates missing IDs first (Definitions under `document-root/1`), from birth",
    "   signatures captured before any default; the slot is the descriptor key of the",
    "   containing `$type`, `.`, the containment property (D1); the duplicate ordinal",
    "   counts ID-missing siblings only (D3).",
    "4. Refusal precedence follows C1: invocation, envelope shape, §3.3 compatibility,",
    "   envelope integrity, graph index (duplicate IDs, unclassified members, dangling",
    "   references), extraction actor, identity, plans with gates at their step, apply,",
    "   bounded fixed point. Refusals echo identity and revision per B3 and carry",
    "   `diagnostics` equal to `report.entries`, the lint entries of stages executed",
    "   before the refusal (B2).",
    "5. Support reuse validates type, parent and containment property, processRef/owner",
    "   relationship and single binding; declared ensure fields are creation fields (C5).",
    "   An explicit deletion of a bound support removes its binding with it.",
    "6. A dangling calledElement refuses `reference-dangling` at the graph index of C",
    "   and N; `validate` reports it as an integrity/error entry of the graph index",
    "   (ruleId `adapter`, messageKey equal to the code, DESIGN L516–L518 convention);",
    "   `remapIds` keeps it and reports one observed entry (C2) whose source and result",
    "   pointers address the property location `<element>/<escaped property>` with",
    "   `property` kept, result provenance `exact` and `before` = `after` = the value",
    "   (parity sync PS-32, the convention of the `validate` entry). The call-target-type",
    "   rule is value-based so that no rule traverses a dangling reference.",
    "7. External-namespace QNames: the migration record carries the namespace bindings",
    "   the import adapter captured (`namespaces`); an in-document QName is rewritten",
    "   keeping its prefix; an external one stays unchanged with one observed",
    "   `unsupported-namespace` entry at the same property-location coordinates",
    "   (PS-32), by the same DESIGN L444 reading as C2.",
    "8. `importProjection` is read-only and commits nothing: `revision` = `baseRevision`",
    "   and `report.outputRevision` = `report.inputRevision` (L268, L737; parity sync",
    "   PS-21); loss entries carry ruleId `adapter` (L516–L518 convention, as",
    "   harmonization B24) and an emptied containment array stays `[]`.",
    "9. Unicode coverage is on values (names, situations, source text, keys); native",
    "   object keys are ASCII.",
    "10. A DI-only move inside its page changes only the moved occurrence's bounds;",
    "    page records stay as restored. Edge routes after a move are UNSEALED.",
    "11. A gesture transaction (`stageGesture`) commits through the same root",
    "    transaction and reports as `applyCommands` with origin `command`.",
    "12. A load, snapshot, theme, undo or redo change event carries the report of its",
    "    own committed result (DESIGN L606, L633, L735); that report's content stays a",
    "    source gap, so the event is compared with the actual result report (`$same`).",
    "13. The layout of a Snapshot/1 presentation is a Layout/1 record (DESIGN L610,",
    "    L667): its `layoutVersion` is compared; the pages and geometry of a",
    "    canvas-computed layout are UNSEALED.",
    "14. In a transaction, `io-set-selection-required` is the outcome of the C recipe",
    "    that meets several InputSets and an uncovered input (DESIGN L547, L172), never of",
    "    the command entry; the same script checks it against a single-set control.",
    "",
    "## Parity sync (BLOCKB-PARITY-SYNC, 2026-10-19)",
    "",
    "The block-B JS/Python parity sync reconciled the two lot-3 seals (precedence",
    "DESIGN > harmonization > parity sync). Applied to this seal:",
    "",
    "- Own values: PS-21 (interpretation 8) and PS-32 (interpretations 6 and 7).",
    "- PS-01 (B13 closed): the Python WritePlan/1 `{planVersion: \"1\", phase, actor,",
    "  activation, baseRevision, writes}`, whose planned writes carry the descriptive",
    "  facts (`cardinality` on create, ensure, reparent and assignRef, `targetTypes` on",
    "  assignRef), and ChangeReport/1 `{reportVersion: \"change/1\", tree, bindings,",
    "  entries, placements, created, removed}` are the shared shapes;",
    "  `applyPlan(plan, stagedTree, stagedEnvelope)` reads the facts only from the plan",
    "  (`cn-plan-*`, `cn-apply-*`).",
    "- PS-02: any refusal of the bounded second evaluation fails the fixed-point proof",
    "  with `normalization-not-fixed`; the second-pass code is never returned and no",
    "  candidate is exposed (`cn-c-second-pass-refused`, `cn-n-second-pass-refused`).",
    "- PS-04: remap `map` rows have unique `sourceId` values (else `operation-error`);",
    "  attested members are never rewritten; an invalid `importedDi` record refuses",
    "  `snapshot-schema` and a foreign `importedDi.descriptorDigest` refuses",
    "  `descriptor-mismatch`; a dangling DI `bpmnElement` is kept and reported with",
    "  domain `artifact`.",
    "- PS-05: an empty single-valued reference value is not a reference; dangling and",
    "  wrong-type checks apply to nonempty values only (`cn-c-empty-called-element`).",
    "- PS-11: `read` of a member the subject lacks yields MISSING; `textPrefix` and",
    "  `equal` of MISSING are false and `present` is false (the branch evaluation of",
    "  `all`/`any` is not decided: erratum candidate E-38).",
    "- PS-14: the copy fragment pre-order starts at Definitions, visits object members",
    "  in UTF-16 key order (the profile-c14n/2 order) and arrays by index, the same",
    "  traversal as the coverage order (harmonization G3).",
    "- PS-24: envelope integrity validates bindings generically (closed record, owner",
    "  and target exist, owner+role unique, target bound once); role-specific agreement",
    "  is checked by the reuse validation of an ensure that names the role (C5). The",
    "  neutral-cn profiles declare every bound role with an ensure recipe as a fixture",
    "  choice; the refusal code for an undeclared role is erratum candidate E-40.",
    "- PS-34: the `prepareExport` options record is closed `{format, themeId,",
    "  overrides, diStyles, importedDi?}`; `importedDi` (a Snapshot/1 record) is the",
    "  geometry source of a headless adapter, and a runtime that needs it while it is",
    "  absent refuses `operation-error` at the layout stage, never earlier; `signal?` is",
    "  a JS-only runtime member never written in a corpus file.",
    `- Vendored cases (PS-H08 to PS-H15): ${VENDORED.length} Python parity records under \`cases/\` with`,
    "  the Python spelling, values owned by the Python seal and copied unchanged",
    "  (JCS-equal) from that seal as resealed after its own parity-sync value changes",
    "  (section 1.2 of the reconciliation). The compile records carry PS-25 (refusal",
    "  `diagnostics: []`) and PS-35 (success payload marker",
    "  `{\"$unsealed\": \"compiled-profile\"}`, identity in `compiled-identity` or",
    "  `compiled-identities`) as their owner applied them; the helper checks those",
    "  shapes and reproduces each compiled identity with node:crypto before vendoring.",
    "  Re-expression only: role `placementIntent` becomes `placement-intent` and the",
    "  other Python roles are kept; a refusal with an input envelope adds",
    "  `caller-state`; the Python `profile-c14n/2` maps to the complete-artifact",
    "  comparator of the primary role (`result-1/lot3`, `plan-apply/lot3` or",
    "  `placements-order/lot3`) plus `profile-c14n/2`, and `fixed-point/lot3`,",
    "  `plan-apply/lot3` and `compile/lot3` keep their ids (a compile record carries",
    "  `compile/lot3` only).",
    "- Aliases (PS-37), one parity case each, listed in `manifest.json` `aliases` with",
    "  the Python record digest and not copied:",
    ...ALIASES.map((a, i) => `  \`${a.caseId}\` is \`${a.aliasOf}\`${i === ALIASES.length - 1 ? "." : ";"}`),
    "- The other Python lot-3 parity cases stay two-sided witnesses of behaviours this",
    "  seal witnesses with its own fixtures (BLOCKB-PARITY-SYNC §5); `cn-gates-table` and",
    "  `cn-c-uncompiled-context` are Python runtime-specific.",
    "",
    "## Gate interpretation",
    "",
    "The owner ratified the eleven §16 defaults on 2026-10-14; technical proof gates",
    "remain effective (L1136). Harmonization H1 adds an explicit `activation` input:",
    "`qualification` (neutral qualification, DESIGN L364, L554) runs gated effects;",
    "absent means `edit`, where the first gated effective change in recipe, candidate",
    "and step order refuses `profile-open` (H2: N support creation OPEN-RESERVED-N,",
    "N Lane.flowNodeRef change OPEN-EXTERNAL, N membership removal OPEN-SHARING with",
    "`responsibility-preservation-required` in qualification, C output-port fill",
    "OPEN-IO, remap OPEN-ID). Reuse and no-ops are never gated, so every fixed point",
    "runs in edit. Each gated path has a sealed edit refusal; activated behavior after",
    "the gates pass is UNSEALED below.",
    "",
    "## Groups",
    "",
    "| Group | Cases | Main clauses |",
    "| --- | --- | --- |",
    ...Object.entries(groups).map(([g, n]) => `| ${g} | ${n} | ${GROUP_CLAUSES[g]} |`),
    "",
    `Refusal codes sealed with their triggers: ${refusalCodes.map(c => `\`${c}\``).join(", ")}.`,
    "Classification codes sealed as findings: the §4.1 call-kind codes, the ordinary-path,",
    "trigger-branch, supplier/consumer readiness codes, `link-endpoint-invalid`,",
    "`link-owner-invalid`, `flow-cross-container` and the graph-index",
    "`reference-dangling` entry.",
    "",
    "## Clause index",
    "",
    "| Section | Cases |",
    "| --- | --- |",
    ...Object.entries(clauseRows).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([s, list]) => `| ${s} | ${list.join(", ")} |`),
    "",
    "Case IDs above omit the `l3-` prefix; line ranges per case are in `index.json`.",
    "",
    "## UNSEALED",
    "",
    "| Id | OPEN | Point | DESIGN default |",
    "| --- | --- | --- | --- |",
    ...UNSEALED.map(u => `| ${u.id} | ${u.openIds.join(", ")} (${cite(u.clause)}${u.variant ? `; ${u.variant}` : ""}) | ${u.point} | ${u.default} |`),
    "",
    "AI extraction and iteration paths (OPEN-ITERATION, OPEN-REFUSAL, OPEN-PROVIDER)",
    "belong to the private host lane and are not covered here.",
    "",
    "## Source gaps (not owner OPENs; UNSEALED pointers in the cases)",
    "",
    "- Report content of load, snapshot restore, theme, undo and redo results (their",
    "  change events carry the same report, compared by relation) and the transactionId",
    "  of their change events (DESIGN L584–L606, L641).",
    "- The Report/2 spelling of the correction notice of a corrected no-op (L641); only",
    "  its presence as the single entry is sealed.",
    "- Pages, geometry, occurrence keys, selection and active page of canvas-computed",
    "  layouts (lot-4 outputs; the Layout/1 record and its version are compared) and edge",
    "  routes after a move (L723, harmonization K5); restored states and the moved shape",
    "  are exact.",
    "- Session-local subscription IDs and history epochs (L606, L268).",
    "- The refusal code of a read-only mutation (L619, L629) is not sealed.",
    "",
    "## Block A admission findings (for the conductor)",
    "",
    "1. `count` is read as `selector`, but the pinned schema requires `select`.",
    "2. `reachable` is read as `source`/`target`, but the schema requires `from`/`to`.",
    "3. `ensure.ownerId` is read as a binding name, but the schema types it as a value.",
    "4. `remove.dependents` is read as an array, but the schema closes it to one selector.",
    "5. An empty `calledElement` is refused as `reference-dangling` by the reference",
    "   validator, contrary to `call-kind-conflict`/`call-target-empty` (L373, L375).",
    "6. Static typing does not narrow `any(...)` unions; the inputs narrow owner",
    "   bindings with `typeIs(bpmn:Process)`, with unchanged semantics.",
    "7. `validate` refuses any envelope/compiled identity difference with",
    "   `profile-metadata-conflict`; C1 requires the §3.3 matrix.",
    "",
    "## Verification",
    "",
    "- `tests/profile-lot3-golden-independence.test.mjs`: the reviewed seal pin and the",
    "  reseal ledgers chained from the first seal, every sealed byte, a one-byte change",
    "  in any sealed file, the closed case shape, comparator pins and discrimination",
    "  self-tests (the vendored comparators included), the rejection of every output of",
    "  the former transaction double and of staged-tree coordinates, the vendored records",
    "  against the pinned Python seal, citations, the UNSEALED list, and an AST-based",
    "  import guard over the helper and the comparator module with mutation tests for each",
    "  bypass family.",
    "",
    "## Per-case discrimination",
    "",
    "Each sealed vector and the plausible wrong implementation it fails (copied from",
    "`index.json`; the golden test keeps both identical).",
    "",
    "| Case | Fails against |",
    "| --- | --- |",
    ...CASES.filter(({ meta }) => !meta.vendored).map(({ meta }) => `| \`${meta.caseId}\` | ${meta.discriminates} |`),
    "",
    "## Vendored Python cases",
    "",
    "Each vendored case and the Python seal's derivation, copied verbatim as its",
    "discrimination text (`index.json`; BLOCKB-PARITY-SYNC §2.2). `index.json` also",
    "records the parity-sync row, the source and harness record digests and the",
    "derivation statement of each case.",
    "",
    "| Case | Python derivation |",
    "| --- | --- |",
    ...CASES.filter(({ meta }) => meta.vendored).map(({ meta }) => `| \`${meta.caseId}\` | ${meta.discriminates} |`),
    "",
  ].join("\n");
}
function designTable() {
  const groups = groupCounts();
  const rows = CASES.map(({ meta, vector }) => ({ section: meta.clause.section, lines: meta.clause.lines, caseId: meta.caseId, group: meta.group, operation: vector.operation, status: vector.expectedStatus }))
    .sort((a, b) => a.section.localeCompare(b.section, "en", { numeric: true }) || a.lines[0] - b.lines[0] || cmp(a.caseId, b.caseId));
  return [
    "# Block B lot 3 sealed expectations: clause to case table",
    "",
    "Sealed C/N, command authority and early history expectations under DESIGN R3.3",
    `(SHA-256 \`${DESIGN_SHA256}\`), resealed in the seal fix round, for the block-B parity sync, for the unicode-names fix, for the Unicode literal restoration and for the real-canvas rebind of the l3-tx scripts. Cases live in`,
    "`tests/fixtures/lot3-cn/expectations/cases/` in the closed profile-parity-corpus/1",
    "shape; `index.json` carries each case's primary clause, secondary citations,",
    "runtimes and the plausible wrong implementation it fails. The README in that",
    "directory records authorship, method, comparators, gate interpretation, the",
    "UNSEALED list and the source gaps. This table is generated by the sealed",
    "authoring helper from the same index; edit the helper, never this file.",
    "",
    `Cases: ${CASES.length}. Groups: ${Object.entries(groups).map(([g, n]) => `${g} ${n}`).join(", ")}.`,
    "",
    "| DESIGN clause | Lines | Case | Group | Operation | Expected status |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(r => `| ${r.section} | ${lineRef(r.lines)} | \`${r.caseId}\` | ${r.group} | ${r.operation} | \`${r.status}\` |`),
    "",
    "## UNSEALED points",
    "",
    "| Id | OPEN | Clause | Point |",
    "| --- | --- | --- | --- |",
    ...UNSEALED.map(u => `| ${u.id} | ${u.openIds.join(", ")}${u.variant ? ` (${u.variant})` : ""} | ${cite(u.clause)} | ${u.point} |`),
    "",
  ].join("\n");
}

// ================================================================ writers
function readTree(dir) {
  const files = [];
  const visit = (abs, rel) => {
    for (const name of readdirSync(abs).sort()) {
      const a = join(abs, name), r = rel ? `${rel}/${name}` : name;
      if (statSync(a).isDirectory()) visit(a, r); else files.push(r);
    }
  };
  visit(dir, "");
  return files;
}
const pinOf = bytes => ({ bytes: bytes.length, sha256: B(bytes) });
// Files outside the expectation tree pinned at the previous (Unicode literal restoration) seal.
// The seal fix round, parity sync, unicode-names and literal restoration ledgers stay as
// history; this round writes its own ledger.
const PREVIOUS_OUTSIDE = {
  "tests/profile-lot3-golden-independence.test.mjs": { bytes: 51213, sha256: "0f1a279285ba5b1753b1139809615189803da4684d0b183a263e524d58ec65f9" },
};
const SEAL_FIX_RECEIPT = "docs/design/receipts/block-b-lot3-seal-fix.json";
const PARITY_SYNC_RECEIPT = "docs/design/receipts/block-b-lot3-parity-sync.json";
const UNICODE_NAMES_RECEIPT = "docs/design/receipts/block-b-lot3-unicode-names-fix.json";
const LITERALS_RECEIPT = "docs/design/receipts/block-b-lot3-unicode-literals-fix.json";
const RECEIPT = "docs/design/receipts/block-b-lot3-l3tx-rebind.json";

// ---------------------------------------------------------------- l3-tx real-canvas rebind
// The decision of this round, with its DESIGN lines; written into the ledger.
const TX_DECISION = {
  id: "transaction-change-coordinates",
  question: "Coordinates of a C or N change entry of a transaction whose target element a command of the same transaction created.",
  decision: "A transaction is one operation with one Report/2 (inputRevision = baseRevision, outputRevision = the committed revision): a change entry has its source in the before-tree and its result in the committed tree. A target that a command or recipe of the same transaction created has no source location, so its source is {domain: none, pointer: null, targetId: null, provenance: generated} with no before value, and its result is the committed location with provenance generated; a target of the before-tree keeps exact coordinates, its before-tree pointer included when an earlier stage moved it. Observed findings keep the coordinates of the linted candidate and an unavailable result.",
  design: ["L629 (immutable before-tree)", "L632-L633 (one root transaction, one final report)", "L739 (Report/2 header)", "L751 (before from the immutable source, after from the final result)",
    "L755 (immutable source pointers, result pointers in the final output, never intermediate arrays)", "L764 (generated support entries)", "L766 (a removal does not shift a source pointer; generated port)", "L510 (findings resolved in the linted index)", "L744-L746 (closed provenance values)"],
  harmonization: ["B9 (a created element's source is the generated coordinate)", "B12 (findings: result unavailable)", "interpretation 1 of the lot-3 expectations README"],
  rejected: "Staged-tree coordinates (tree/exact source and exact result for the writes on a created task, as the canvas replay produced): the location does not exist in the document of inputRevision and the staged tree is an intermediate state, never published (L633, L637).",
  lot5: "The lot-5 seal has no change entry on a created target: its only change entries are six complete/set writes on Process elements of the input (exact on both sides, as here), and its findings on created tasks (for example lot5-context-001-append-task-programmatic) are observed entries at tree/exact source with an unavailable result, the convention these cases already use.",
};
// Values of the previous seal for every member this round changes (JSON pointers into the
// case trace or script, `absent` when the member did not exist), the UNSEALED pointers of the
// previous seal and the SHA-256 of each previous discrimination text that changes (the text
// itself stays in the previous index.json; the ledger pins both texts by digest).
const ABSENT = "absent";
const TX_BASIS = {
  event: "DESIGN L606, L633, L735: a change event carries the report of its own committed result",
  layout: "DESIGN L610, L667: the layout of a Snapshot/1 presentation is a Layout/1 record",
  reenter: "DESIGN L635, L604, L632-L633, L735; harmonization B2, B3: a real nested applyCommands call during applying is refused transaction-reentrant with the closed Result/1",
  throwing: "DESIGN L604, L635, L735; harmonization B2: the applying hook proves the guard state by a nested call, then throws",
  control: "DESIGN L547, L536, L172: single-set control, C appends the new input to the only InputSet",
};
const TX_OLD = {
  "l3-tx-incremental-draft": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/6/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/8/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/9/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/10/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report","/6/result/payload/presentation/layout","/6/result/payload/presentation/selection","/6/result/payload/presentation/activePageId","/8/result/payload/presentation/layout","/8/result/payload/presentation/selection","/8/result/payload/presentation/activePageId","/9/result/report","/9/events/L1/0/transactionId","/9/events/L1/0/report","/10/result/report","/10/events/L1/0/transactionId","/10/events/L1/0/report"],
    discriminatesSha256: "973a8e4211915425a48a2030c50a1f3d3dee4024d8563ee9e733878ff96844fb",
  },
  "l3-tx-batch-one-entry": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/2/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/4/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/5/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/6/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report","/2/result/payload/presentation/layout","/2/result/payload/presentation/selection","/2/result/payload/presentation/activePageId","/4/result/payload/presentation/layout","/4/result/payload/presentation/selection","/4/result/payload/presentation/activePageId","/5/result/report","/5/events/L1/0/transactionId","/5/events/L1/0/report","/6/result/report","/6/events/L1/0/transactionId","/6/events/L1/0/report"],
    discriminatesSha256: "4228f2937d04e8adbfa09a1c791ee28f58d11715970d98a9f3b9b7483515df16",
  },
  "l3-tx-cancelled": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-cancel-pending": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-dispose-no-leak": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-dispose-pending": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-reentrant-refused": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "script", pointer: "/2/inject", basis: TX_BASIS.reenter, value: {"phase":"applying","entry":"native-modeling-command","command":{"name":"element.updateLabel","target":"Process_T","text":"Injected"}} },
      { artifact: "trace", pointer: "/2/injected", basis: TX_BASIS.reenter, value: {"status":"refused","code":"transaction-reentrant"} },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
    discriminatesSha256: "2fceb73d0e8b4c6c4ffe494163981859e3afd0fb93cdf7929cae1e43ab440cce",
  },
  "l3-tx-guard-recovery": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "script", pointer: "/2/inject", basis: TX_BASIS.throwing, value: {"phase":"applying","action":"throw"} },
      { artifact: "trace", pointer: "/2/injected", basis: TX_BASIS.throwing, value: ABSENT },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
    discriminatesSha256: "7378e02e800384f3b8251b62c08d83f21b46ac47988677a1c05936871850bf44",
  },
  "l3-tx-refusal-preserves": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-io-set-selection-required": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "script", pointer: "/4", basis: TX_BASIS.control, value: ABSENT },
      { artifact: "trace", pointer: "/4", basis: TX_BASIS.control, value: ABSENT },
      { artifact: "script", pointer: "/5", basis: TX_BASIS.control, value: ABSENT },
      { artifact: "trace", pointer: "/5", basis: TX_BASIS.control, value: ABSENT },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
    discriminatesSha256: "8f56e236d6dc8356df6f2f2ab84fb992105496263f707f45d6bcecd8bbd37ee3",
  },
  "l3-tx-io-set-explicit-selection": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/2/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/4/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/5/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/6/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report","/2/result/payload/presentation/layout","/2/result/payload/presentation/selection","/2/result/payload/presentation/activePageId","/4/result/payload/presentation/layout","/4/result/payload/presentation/selection","/4/result/payload/presentation/activePageId","/5/result/report","/5/events/L1/0/transactionId","/5/events/L1/0/report","/6/result/report","/6/events/L1/0/transactionId","/6/events/L1/0/report"],
  },
  "l3-tx-di-only-move": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/5/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/6/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/historyEpoch","/1/events/L1/0/transactionId","/1/events/L1/0/report","/4/result/payload/presentation/layout/geometry/1/bounds","/4/result/payload/presentation/layout/geometry/1/waypoints","/4/result/payload/presentation/layout/geometry/2/bounds","/4/result/payload/presentation/layout/geometry/2/waypoints","/5/result/report","/5/events/L1/0/transactionId","/5/events/L1/0/report","/6/result/report","/6/events/L1/0/transactionId","/6/events/L1/0/report"],
  },
  "l3-tx-corrected-noop": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/2/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report","/2/result/payload/presentation/layout","/2/result/payload/presentation/selection","/2/result/payload/presentation/activePageId","/3/result/report/entries/0"],
  },
  "l3-tx-theme-history": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/3/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/4/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/5/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/6/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/historyEpoch","/1/events/L1/0/transactionId","/1/events/L1/0/report","/3/result/report","/3/events/L1/0/transactionId","/3/events/L1/0/report","/4/result/payload/presentation/layout","/4/result/payload/presentation/selection","/5/result/report","/5/events/L1/0/transactionId","/5/events/L1/0/report","/6/result/report","/6/events/L1/0/transactionId","/6/events/L1/0/report"],
  },
  "l3-tx-delete-support-undo": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/3/result/payload/presentation/layout", basis: TX_BASIS.layout, value: "unsealed" },
      { artifact: "trace", pointer: "/4/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
      { artifact: "trace", pointer: "/5/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/historyEpoch","/1/events/L1/0/transactionId","/1/events/L1/0/report","/3/result/payload/presentation/layout","/3/result/payload/presentation/selection","/4/result/report","/4/events/L1/0/transactionId","/4/events/L1/0/report","/5/result/report","/5/events/L1/0/transactionId","/5/events/L1/0/report"],
  },
  "l3-tx-stale-revision": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-empty-history": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
  "l3-tx-bare-recipe-refused": {
    members: [
      { artifact: "trace", pointer: "/1/events/L1/0/report", basis: TX_BASIS.event, value: "unsealed" },
    ],
    unsealed: ["/0/result/payload/subscriptionId","/1/result/report","/1/result/payload/viewRevision","/1/events/L1/0/transactionId","/1/events/L1/0/report"],
  },
};
// UNSEALED reasons of the previous seal that this round changes or removes.
const TX_REASONS_OLD = {
  report: "DESIGN L584-L599 and L641 define no report content for load, snapshot restore, theme, undo or redo results (source gap).",
  layout: "Layout geometry and occurrence keys of a canvas-computed layout are lot-4 outputs; restoring them is compared by relation.",
};
function txChanges() {
  const entryOf = caseId => CASES.find(c => c.meta.caseId === caseId);
  return Object.entries(TX_OLD).map(([caseId, old]) => {
    const { meta, vector } = entryOf(caseId);
    const trace = vector.expectedArtifacts.find(a => a.role === "trace").json, steps = vector.commandArtifact.json.steps;
    const unsealed = (vector.expectedArtifacts.find(a => a.role === "unsealed")?.json ?? []).filter(u => u.artifact === "trace").map(u => u.pointer);
    const members = old.members.map(({ artifact, pointer, basis, value }) => {
      const now = at(artifact === "script" ? steps : trace, pointer);
      if (!now.present && value === ABSENT) throw Error(`${caseId} ${artifact}${pointer}: absent on both sides`);
      if (now.present && value !== ABSENT && jcs(now.value) === jcs(value)) throw Error(`${caseId} ${artifact}${pointer}: declared change is a no-op`);
      return { artifact, pointer, basis, old: value === ABSENT ? ABSENT : clone(value), new: now.present ? clone(now.value) : ABSENT };
    });
    const removed = old.unsealed.filter(p => !unsealed.includes(p)), added = unsealed.filter(p => !old.unsealed.includes(p));
    const textSha = sha(Buffer.from(meta.discriminates, "utf8"));
    if (old.discriminatesSha256 !== undefined && old.discriminatesSha256 === textSha) throw Error(`${caseId}: discrimination text unchanged`);
    return { caseId, members, unsealed: { removed, added },
      ...(old.discriminatesSha256 !== undefined ? { discriminates: { old: { sha256: old.discriminatesSha256 }, new: { sha256: textSha } } } : {}) };
  });
}
// Old and new text of every UNSEALED reason this round changes, adds or removes.
function txReasonChanges() {
  return [...new Set([...Object.keys(TX_REASONS_OLD), "layoutPages", "layoutGeometry"])].sort().map(key => {
    const old = TX_REASONS_OLD[key] ?? ABSENT, now = REASONS[key] ?? ABSENT;
    if (old === now) throw Error(`reason ${key} unchanged`);
    return { key, old, new: now };
  });
}
// The literal restoration's value changes: its ledger (LITERALS_RECEIPT) is history and
// is not rewritten by this round; kept verbatim.
// The superseded values at the previous seal, as the seal fix round rewrite of this
// helper left them: U+E000 removed, U+00A0 and U+2028 replaced by an ASCII space. Case
// file SHA-256 at that seal: l3-id-stable-vectors 844f698327b3954d667fd9d3598297320686b80f4320c02f2a8fc973906db7e1,
// l3-c-preserve 7b0381e47cf676c89c3163c718200032f4c7117dfe71628aadea9f178e416f40,
// l3-n-unicode-names ee4fd2776d3637c96ffb2c362917beac9db9093b56fb7d046df3ae5e3c0bcaf9,
// l3-fp-n-unicode-names 874fb893adc012a080e2fe17271a4fb08ed1d81a3262a9d79b2a59e7684255a1,
// l3-mix-n-unicode-names-js-py-js f80e79a4a5c83db63d46accdc70531d5ef8763261bee9ffe8780522cab1b52b7,
// l3-mix-n-unicode-names-py-js-py 5255fb2d7a50cf47d8af73cd3e3b715361054cfc25997a0d4008490ff91b6ad5.
const LITERALS_OLD = {
  // Aligned to the new allocation order; the decomposed key at index 1 is new.
  allocations: [{ key: "cl\u{E9}-", id: "g_ce2ab3c4df534f59d41c1993b3eb1580088cb28e7b2e228dc6cc1f147096ee07" }, null,
    { key: "cl\u{E9}-\u{10000}", id: "g_344bf647bb3ae35f1f2e8db3ef5fe16035887d0d70c3e874da7a4036611d67bd" },
    { key: " padded ", id: "g_9531b9aa6fa3c4f9b62fe04a922a3b7cb14805318aec768350d82d1c6eb576c6" },
    { key: "padded", id: "g_f773537ad4f07c732b0a5281da100d755df92e10646388c19995b1df30419e7b" },
    { key: "a b", id: "g_d49381818aa39bcfb7b993eaabd91aebe5926d19b9b0778648bcf38872123b5d" },
    { key: "a b", id: "g_d49381818aa39bcfb7b993eaabd91aebe5926d19b9b0778648bcf38872123b5d" },
    { key: "root", id: "g_ef5c144fe3bd7d1e6005468ef00b592d7bd71807c23675349a8c7d6fb228ba21" }],
  preserve: { text: "  Source bytes\r\n\tkept  ", revision: "760c51b41e2a31391e44e655747477acb7599833913a89475844d019ef5c28b1" },
  // Element ID -> sealed name of the unicode-names process (input and output trees).
  names: { Process_A: "Gestion \u{10000} ", Start_U: "Situation A\nSituation B\r\nSituation C suite", Task_U: "Contr\u{F4}le final ",
    DataStoreReference_U: "R\u{E9}f\u{E9}rence \u{1F4D8}", DataStore_U: "Registre \u{10000}" },
  inputRevision: "2f4b72e4103185c857615e29df196d88f7ebead1061cb5cffe122484bb66f78a",
  revision: "c0b1886f9611263daedb10a1ada375a309e3e06a426acdacc6ae742be9480688",
  transport: { bytes: 2576, sha256: "00c0ec5b74113953880f80fcffcd7dd3f15245f2c13fdfbb0f52f8285eac7522" },
};
// Old/new value of every restored or added literal and of every value derived from it
// (DESIGN L260, L264, L276-L282, L967); strings shown with \u{...} for every code point
// outside printable ASCII.
function literalChanges() {
  const shown = s => [...s].map(c => { const cp = c.codePointAt(0); return cp >= 0x20 && cp <= 0x7e ? c : `\\u{${cp.toString(16)}}`; }).join("");
  const vectorOf = caseId => CASES.find(c => c.meta.caseId === caseId).vector;
  const role = (artifacts, r) => artifacts.find(a => a.role === r);
  const nodeOf = (tree, id) => { let found; const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") { if (n.id === id) found = n; Object.values(n).forEach(walk); } }; walk(tree); return found; };
  const RESTORED = "restored first-seal value (c6c6245)";
  const changes = [];
  {
    const v = vectorOf("l3-id-stable-vectors");
    const allocations = role(v.inputArtifacts, "allocations").json, ids = role(v.expectedArtifacts, "ids").json;
    if (allocations.length !== LITERALS_OLD.allocations.length) throw Error("stable vectors: old/new alignment");
    changes.push({ caseId: "l3-id-stable-vectors", clause: "DESIGN section 3.2 L276-L282, section 3.1 L260",
      allocations: allocations.map((a, i) => {
        const old = LITERALS_OLD.allocations[i];
        const origin = old === null ? "added: decomposed twin of index 0 (NFC and NFD witness)" : old.key === a.key ? "unchanged" : RESTORED;
        return { index: i, origin, old: old && { key: shown(old.key), id: old.id }, new: { key: shown(a.key), owner: a.owner, slot: a.slot, id: ids[i] } };
      }) });
  }
  {
    const v = vectorOf("l3-c-preserve");
    const input = role(v.inputArtifacts, "envelope").json, result = role(v.expectedArtifacts, "result").json;
    const text = nodeOf(input.tree, "UserTask_Review").documentation[0].text;
    changes.push({ caseId: "l3-c-preserve", clause: "DESIGN section 7.1 L536, section 3.1 L260",
      literals: [{ elementId: "UserTask_Review", property: "documentation/0/text", origin: RESTORED, old: shown(LITERALS_OLD.preserve.text), new: shown(text) }],
      revisions: { input: { old: LITERALS_OLD.preserve.revision, new: input.semanticRevision }, result: { old: LITERALS_OLD.preserve.revision, new: result.revision } } });
  }
  for (const caseId of ["l3-n-unicode-names", "l3-fp-n-unicode-names", "l3-mix-n-unicode-names-js-py-js", "l3-mix-n-unicode-names-py-js-py"]) {
    const v = vectorOf(caseId);
    const input = role(v.inputArtifacts, "envelope").json;
    const result = role(v.expectedArtifacts, "result")?.json ?? role(v.expectedArtifacts, "hop-results").json[0];
    // The fixed point's input is the N output, so its old input revision is the old N revision.
    const oldInput = caseId === "l3-fp-n-unicode-names" ? LITERALS_OLD.revision : LITERALS_OLD.inputRevision;
    const transport = role(v.expectedArtifacts, "transport-bytes");
    changes.push({ caseId, clause: "DESIGN section 4.2 L387, section 3.1 L260, section 14.3 L967",
      literals: Object.entries(LITERALS_OLD.names).map(([elementId, old]) => {
        const now = nodeOf(input.tree, elementId).name;
        return { elementId, property: "name", origin: elementId === "DataStoreReference_U" ? "changed: the second U+00E9 becomes e+U+0301 (NFC witness); the first seal had two U+00E9" : RESTORED, old: shown(old), new: shown(now) };
      }),
      revisions: { input: { old: oldInput, new: input.semanticRevision }, result: { old: LITERALS_OLD.revision, new: result.revision } },
      ...(transport ? { transport: { old: LITERALS_OLD.transport, new: { bytes: Buffer.byteLength(transport.text, "utf8"), sha256: transport.sha256 } } } : {}) });
  }
  return changes;
}
function previousPins() {
  // The first run reads the reviewed seal itself; later runs read the ledger it produced.
  const sealPath = join(root, "seal.json");
  const bytes = readFileSync(sealPath);
  if (B(bytes) === PREVIOUS_SEAL_SHA256) {
    const old = JSON.parse(bytes.toString("utf8"));
    const files = [...old.files.map(e => [`tests/fixtures/lot3-cn/expectations/${e.path}`, { bytes: e.bytes, sha256: e.sha256 }]),
      ...old.documents.map(e => [e.path, { bytes: e.bytes, sha256: e.sha256 }]), ...Object.entries(PREVIOUS_OUTSIDE)];
    return { seal: pinOf(bytes), files: Object.fromEntries(files) };
  }
  const ledgerFile = JSON.parse(readFileSync(join(repo, RECEIPT), "utf8"));
  return { seal: ledgerFile.previous.seal, files: Object.fromEntries(ledgerFile.previous.files.map(e => [e.path, { bytes: e.bytes, sha256: e.sha256 }])) };
}
function main() {
  const design = process.argv[2];
  if (design) {
    const bytes = readFileSync(design);
    assertEq(B(bytes), DESIGN_SHA256, "DESIGN R3.3 digest");
    assertEq(bytes.toString("utf8").split("\n").length - 1, DESIGN_LINES, "DESIGN line count");
  }
  const previous = previousPins();
  rmSync(join(root, "cases"), { recursive: true, force: true });
  const caseFiles = {};
  for (const { meta, vector } of CASES) {
    const path = `${EXPECT}/cases/${meta.caseId}.json`;
    caseFiles[path] = emit(path, prettyBytes(vector)).sha256;
  }
  const comparatorBytes = fixtureBytes(PATHS.comparators);
  const executable = { path: PATHS.comparators, sha256: B(comparatorBytes) };
  const exportOf = { "result-1/lot3": "compareResult", "transaction-trace/lot3": "compareTrace", "transport-bytes/lot3": "compareTransport", "placements-order/lot3": "comparePlacements",
    "source-preservation/lot3": "compareSourcePreservation", "stable-id/1": "compareStableIds", "node-crypto": "compareDigests", "python-hashlib": "compareDigests", "profile-c14n/2": "compareCanonical",
    "fixed-point/lot3": "compareFixedPoint", "plan-apply/lot3": "comparePlanApply", "compile/lot3": "compareCompile" };
  const comparatorNotes = [
    ["profile-c14n/2", "mechanism", "RFC 8785 canonical JSON of every expected json artifact; equality with the actual value of the same role after UNSEALED pointers (DESIGN §3.1)."],
    ["stable-id/1", "mechanism", "Recomputes g_ + SHA-256 of JCS [\"profile-mechanism/1\",ownerId,slot,stableKey] for the allocations and compares the ids exactly (DESIGN §3.2)."],
    ["node-crypto", "reference", "SHA-256 over the exact UTF-8 bytes of every text artifact, stable-id tuple and transport hop, with Node crypto."],
    ["python-hashlib", "reference", "The same digest procedure; the Python twin executes it with hashlib over the same bytes."],
    ["result-1/lot3", "format", "Closed Result/1 or PureResult shape, complete Report/2 (header, entries in profile-report/2 order, idMap in DESIGN L753 order, refusal diagnostics equal to report.entries) and payload, compared canonically after UNSEALED pointers."],
    ["placements-order/lot3", "format", "Placements in the DESIGN L565 UTF-16 tuple order with unique sorted relatedAssociationIds, equal to the expected array (the normalize payload placements, the `value` of sortPlacements, or its vendored `placements` role)."],
    ["source-preservation/lot3", "format", "The caller-visible input after the call (json canonically, text byte for byte) equals the caller-state artifact, on success and refusal."],
    ["transport-bytes/lot3", "format", "Each hop's output bytes equal the profile-c14n/2 UTF-8 bytes of the expected DocumentEnvelope/1 (sealed digest) and each hop's Result/1 equals its expected result."],
    ["transaction-trace/lot3", "format", "Per script step: the complete Result/1 or PureResult, history counters, every change event per listener and injected outcomes, with $same/$differs relations to actual earlier steps and UNSEALED pointers only."],
    // Python manifest notes (BLOCKB-PARITY-SYNC §2.2), with the actual role this runner supplies.
    ["fixed-point/lot3", "mechanism", "rerun the operation on the expected payload envelope (complete: mode retained; same activation and placement intent): status ok, identical envelope and placements, zero report entries, baseRevision = revision = the first revision (Python manifest note; actual role `fixed-point`: the second-run Result/1)."],
    ["plan-apply/lot3", "format", "planRecipe cases with an apply artifact also call applyPlan(plan.payload, envelope.tree, envelope) and compare that PureResult (Python manifest note); the closed `plan` PureResult and every expected `apply` PureResult are compared canonically, and an applyPlan case expects `apply` only."],
    ["compile/lot3", "format", "compileProfile (parity sync PS-25, PS-35): the compile PureResult (one per profile artifact, in order, for a variant list) is compared under profile-c14n/2 after each {\"$unsealed\": reason} marker is replaced by the actual member at the same position, which must exist (CompiledProfile has no wire shape); the compiled-identity (compiled-identities) artifact is compared under profile-c14n/2 with the compiled section 5.1 identity (Python manifest note; actual roles `compile` and `compiled-identity` or `compiled-identities`)."],
  ];
  const comparators = comparatorNotes.map(([id, kind, note]) => ({ id, kind, note, executable: { ...executable, export: exportOf[id] }, tolerance: "zero" }));
  const lot0Manifest = fixtureBytes(PATHS.lot0Manifest);
  const profiles = [...VARIANTS, "neutral", "grid"].map(key => ({
    key, path: PROFILES[key].file.path, sha256: PROFILES[key].file.sha256, identitySha256: PROFILES[key].identity.sha256,
    inputs: key === "neutral" || key === "grid"
      ? { schema: { path: PATHS.schema, sha256: B(fixtureBytes(PATHS.schema)) }, base: { path: PATHS.lot0Base, sha256: B(fixtureBytes(PATHS.lot0Base)) }, descriptors: [{ path: PATHS.lot0Descriptors, sha256: B(fixtureBytes(PATHS.lot0Descriptors)) }], assets: [{ key: "neutral-metrics.json", path: PATHS.metrics, sha256: B(fixtureBytes(PATHS.metrics)) }] }
      : { schema: { path: PATHS.schema, sha256: B(fixtureBytes(PATHS.schema)) }, base: baseFile, descriptors: [descriptorFile], assets: [{ key: "neutral-metrics.json", path: PATHS.metrics, sha256: B(fixtureBytes(PATHS.metrics)) }] },
  })).concat(PY_PROFILES);
  emit(`${EXPECT}/manifest.json`, prettyBytes({ format: "profile-parity-corpus/1", corpusVersion: "lot3-cn-2.1.0", pathBase: "tests/fixtures/", designSha256: DESIGN_SHA256,
    parentManifests: [{ path: PATHS.lot0Manifest, sha256: B(lot0Manifest), role: "lot-0 vendored profile-parity-corpus/1 manifest" }],
    designParentManifests: { js: "61903a61e2a6f258b506b4cdcd310a57787eee30845d6deb996afbb54abf33a9", python: "def4ffb25b6c60f963226fb62d9b433e10a1420f340a1835b8ac273711e29b3d", source: "DESIGN §14.3 L961" },
    executables: [{ file: PATHS.comparators, sha256: executable.sha256, tolerance: "zero", exports: [...new Set(Object.values(exportOf))].sort() }],
    comparators, profiles, files: caseFiles,
    // BLOCKB-PARITY-SYNC §2.1-§2.2: the Python seal that owns the vendored values, each
    // vendored case with its source record digest, and the PS-37 aliases (no copy).
    vendoredSeal: { runtime: PY_SEAL.runtime, commit: PY_SEAL.commit, manifest: { path: PY_SEAL.manifest, vendored: `${VENDOR}/MANIFEST.sha256`, sha256: PY_SEAL.sha256 },
      parityManifest: { path: PY_SEAL.parityManifest, vendored: `${VENDOR}/parity/manifest.json`, sha256: PY_SEAL.parityManifestSha256 } },
    vendored: VENDORED, aliases: ALIASES }));
  const groups = groupCounts();
  emit(`${EXPECT}/index.json`, prettyBytes({ format: "lot3-case-index/2", designRevision: "R3.3", designSha256: DESIGN_SHA256, designLines: DESIGN_LINES,
    sections: SECTIONS, groups, unsealed: UNSEALED,
    cases: CASES.map(({ meta, vector }) => ({ caseId: meta.caseId, file: `cases/${meta.caseId}.json`, group: meta.group, operation: vector.operation, expectedStatus: vector.expectedStatus,
      clause: meta.clause, cites: meta.cites ?? [], runtimes: meta.runtimes, discriminates: meta.discriminates, ...(meta.vendored ? { vendored: meta.vendored } : {}) })) }));
  // The digest ledger lists the revisions this helper authored; vendored values are not its own.
  for (const { meta, vector } of CASES.filter(c => !c.meta.vendored)) for (const a of [...vector.inputArtifacts, ...vector.expectedArtifacts]) {
    if (a.role === "envelope" && a.json?.semanticRevision) ledger.revisions.push({ caseId: meta.caseId, role: a.role, semanticRevision: a.json.semanticRevision });
  }
  emit(`${EXPECT}/author/digests.json`, prettyBytes({ format: "lot3-digest-ledger/2", note: "Every stable-id/1 tuple, birth content signature, input revision, view tuple and transport digest computed by author-lot3.mjs, with the exact canonical strings hashed.",
    profiles: Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, { path: v.file.path, raw: v.file.sha256, identity: v.identity.sha256 }])), view: VIEW, mainThemes: MAIN_THEMES, descriptorDigest, ...ledger }));
  emit(`${EXPECT}/README.md`, Buffer.from(readme(), "utf8"));
  writeFileSync(join(repo, "docs/design/block-b-lot3-expectations.md"), designTable());
  for (const [path, bytes] of Object.entries(out)) { mkdirSync(dirname(join(fixtures, path)), { recursive: true }); writeFileSync(join(fixtures, path), bytes); }
  // Seal every file of the expectation tree, the generated design table and the
  // consumed lot-0 inputs (the parent manifest included).
  const sealed = readTree(root).filter(p => p !== "seal.json").map(p => ({ path: p, ...pinOf(readFileSync(join(root, p))) }));
  const documents = ["docs/design/block-b-lot3-expectations.md"].map(p => ({ path: p, ...pinOf(readFileSync(join(repo, p))) }));
  const inputs = [PATHS.lot0Neutral, PATHS.lot0Grid, PATHS.lot0Base, PATHS.lot0Descriptors, PATHS.schema, PATHS.metrics, PATHS.lint, PATHS.lot0Manifest, PATHS.lot0NeutralFixture, PATHS.lot0GridFixture]
    .map(p => ({ path: `tests/fixtures/${p}`, ...pinOf(fixtureBytes(p)) }));
  writeFileSync(join(root, "seal.json"), prettyBytes({ format: "lot3-seal/2", designRevision: "R3.3", designSha256: DESIGN_SHA256, root: `tests/fixtures/${EXPECT}`,
    authoring: { method: "hand-authored literals and declared change lists; standalone digest helper", author: "Opus spec author", reviewer: "gpt-6-astra max",
      review: "first seal REWORK (six MAJOR, one MINOR); resealed in the single seal fix round; resealed for the block-B parity sync; resealed for the l3-id-unicode-names fix (DESIGN L292); resealed for the Unicode literal restoration (DESIGN L260, L967); resealed for the real-canvas rebind of the l3-tx scripts (DESIGN L547, L604, L606, L610, L635, L751, L755), pending review", previousSeal: { sha256: PREVIOUS_SEAL_SHA256, commit: PREVIOUS_SEAL_COMMIT } },
    caseCount: CASES.length, groups, comparators: [{ path: PATHS.comparators.slice(EXPECT.length + 1), sha256: executable.sha256 }], files: sealed, documents, inputs }));
  const sealBytes = readFileSync(join(root, "seal.json"));
  // Reseal ledger: old/new pin of every changed, added or removed file.
  const current = Object.fromEntries([
    ...readTree(root).map(p => [`tests/fixtures/${EXPECT}/${p}`, pinOf(readFileSync(join(root, p)))]),
    ...documents.map(d => [d.path, { bytes: d.bytes, sha256: d.sha256 }]),
    ...Object.keys(PREVIOUS_OUTSIDE).flatMap(p => { try { return [[p, pinOf(readFileSync(join(repo, p)))]]; } catch { return []; } }),
  ]);
  const previousFiles = { ...previous.files, [`tests/fixtures/${EXPECT}/seal.json`]: previous.seal };
  const paths = [...new Set([...Object.keys(previousFiles), ...Object.keys(current)])].sort();
  writeFileSync(join(repo, RECEIPT), prettyBytes({ format: "block-b-lot3-reseal/1", lot: "block B lot 3 (C/N, command authority and early history proof)",
    reviews: ["block B review of squash 25a66ed (BLOCKER 1) and the code author's report of 2026-10-19: the 18 l3-tx scripts ran through a test double in src/ that stored placeholder presentations, emitted change events without a report, wrote the re-entrancy outcome without a nested call and refused one entry by its name; replayed on the real canvas, the C writes on created tasks came out at the exact coordinates of the staged tree. Spec-author rebind from DESIGN (decisions), the canvas behaviour taken as no source; reseal of the l3-tx cases only, pending review"],
    decisions: [TX_DECISION],
    history: [{ ledger: LITERALS_RECEIPT, seal: { sha256: PREVIOUS_SEAL_SHA256 }, previousSeal: { sha256: UNICODE_NAMES_SEAL_SHA256 } },
      { ledger: UNICODE_NAMES_RECEIPT, seal: { sha256: UNICODE_NAMES_SEAL_SHA256 }, previousSeal: { sha256: PARITY_SYNC_SEAL_SHA256 } },
      { ledger: PARITY_SYNC_RECEIPT, seal: { sha256: PARITY_SYNC_SEAL_SHA256 }, previousSeal: { sha256: SEAL_FIX_SEAL_SHA256 } },
      { ledger: SEAL_FIX_RECEIPT, seal: { sha256: SEAL_FIX_SEAL_SHA256 }, previousSeal: { sha256: FIRST_SEAL_SHA256 } }],
    previous: { commit: PREVIOUS_SEAL_COMMIT, seal: previous.seal, files: Object.entries(previous.files).map(([path, pin]) => ({ path, ...pin })).sort((a, b) => cmp(a.path, b.path)) },
    current: { seal: pinOf(sealBytes) },
    valueChanges: txChanges(),
    unsealedReasons: txReasonChanges(),
    supersedesFiles: paths.filter(p => previousFiles[p] && current[p] && jcs(previousFiles[p]) !== jcs(current[p])).map(p => ({ path: p, old: previousFiles[p], new: current[p] })),
    addedFiles: paths.filter(p => !previousFiles[p] && current[p]).map(p => ({ path: p, ...current[p] })),
    removedFiles: paths.filter(p => previousFiles[p] && !current[p]).map(p => ({ path: p, ...previousFiles[p] })) }));
  console.log(JSON.stringify({ cases: CASES.length, groups, files: sealed.length, seal: B(sealBytes) }));
}
main();
