// Ephemeral formatting projection of one immutable moddle Definitions snapshot.
// Semantic identity, membership, ordering and attachment never come from DI.
import { IoError } from "./errors.js";
import type { BpmnDefinitions, ModdleElement } from "../types.js";
import semantics from "./semantics.json" with { type: "json" };
type E = ModdleElement;
export interface RefBox { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export type RefPoint = readonly [number, number];
export interface RefNode {
  readonly id: string; type: string; readonly subtype?: "AND" | "OR"; readonly label: string;
  readonly box: RefBox; readonly labelBox?: RefBox; laneIndex?: number; laneName?: string;
  appLabel?: string; task?: string; dir?: "in" | "out" | "doc"; readonly targetProcessId?: string;
  readonly semanticOrder: number;
}
export interface RefConnection {
  readonly id: string; readonly source: string; readonly target: string;
  readonly kind: "FLOW" | "DATA" | "DOC"; readonly label: string; readonly points: readonly RefPoint[];
  readonly semanticOrder: number;
}
export interface RefPage {
  readonly processId: string; readonly index: number; readonly name: string; readonly pool: RefBox;
  readonly lanes: ReadonlyArray<{ readonly id: string; readonly name: string; readonly box: RefBox }>;
  readonly nodes: ReadonlyMap<string, RefNode>; readonly order: readonly string[]; readonly flowOrder: readonly string[];
  readonly apps: ReadonlyMap<string, { readonly box: RefBox; readonly text: string }>; readonly connections: readonly RefConnection[];
}
const FLOW_TAG: Readonly<Record<string, string>> = {
  StartEvent: "START", EndEvent: "END", Task: "TASK", SubProcess: "SUB-PROCESS", CallActivity: "EXTERNAL_PROCESS",
  ExclusiveGateway: "GATEWAY", ParallelGateway: "GATEWAY", IntermediateThrowEvent: "EVENT",
};
export const FLOW_TYPES: ReadonlySet<string> = new Set(Object.values(FLOW_TAG));
export const ITEM_TYPES: ReadonlySet<string> = new Set(["TASK_INPUT", "TASK_OUTPUT", "EXTERNAL_INPUT", "PROCESS_OUTPUT", "DATA_OBJECT", "EXTERNAL_DATA_OBJECT"]);
const ACTIVITIES = new Set(["TASK", "SUB-PROCESS", "EXTERNAL_PROCESS"]);
const kind = (e: E): string => e.$type.split(":")[1] ?? "";
const artifact = (e: E): boolean => ["DataObjectReference", "DataInput", "DataOutput", "TextAnnotation"].includes(kind(e));
function fail(code: ConstructorParameters<typeof IoError>[0], e: E, message: string): never { throw new IoError(code, message, [e.id ?? ""]); }
const list = (e: Partial<E>, key: string): E[] => e[key] ?? [];
export const semanticInfo = (e: E): E | undefined => list(e.extensionElements ?? {}, "values").find((v) => v.$type === "sem:Info");

function validateIoSpecification(owner: E): void {
  const io = owner.ioSpecification;
  if (!io) return;
  if (io.$type !== "bpmn:InputOutputSpecification") fail("invalid-semantics", owner, "Invalid IO specification");
  const inputs = list(io, "dataInputs"), outputs = list(io, "dataOutputs");
  const inputSets = list(io, "inputSets"), outputSets = list(io, "outputSets");
  if (!inputSets.length || !outputSets.length) fail("invalid-semantics", owner, "IO specification requires input and output sets");
  for (const [elements, type] of [[inputs, "DataInput"], [outputs, "DataOutput"], [inputSets, "InputSet"], [outputSets, "OutputSet"]] as const) {
    if (elements.some((e) => e.$type !== `bpmn:${type}`)) fail("invalid-semantics", owner, "Invalid IO member type");
  }
  for (const [sets, fields] of [
    [inputSets, [["dataInputRefs", inputs], ["optionalInputRefs", inputs], ["whileExecutingInputRefs", inputs], ["outputSetRefs", outputSets]]],
    [outputSets, [["dataOutputRefs", outputs], ["optionalOutputRefs", outputs], ["whileExecutingOutputRefs", outputs], ["inputSetRefs", inputSets]]],
  ] as const) for (const set of sets) for (const [field, targets] of fields) {
    if (list(set, field).some((ref) => !targets.includes(ref))) fail("invalid-semantics", owner, "IO set reference must belong to this specification");
  }
  for (const [sets, elements, membership, optional, executing] of [
    [inputSets, inputs, "dataInputRefs", "optionalInputRefs", "whileExecutingInputRefs"],
    [outputSets, outputs, "dataOutputRefs", "optionalOutputRefs", "whileExecutingOutputRefs"],
  ] as const) {
    for (const set of sets) for (const field of [optional, executing]) {
      if (list(set, field).some((ref) => !list(set, membership).includes(ref))) fail("invalid-semantics", owner, "Optional and executing IO references must belong to their own set");
    }
    if (elements.some((e) => !sets.some((set) => list(set, membership).includes(e)))) fail("invalid-semantics", owner, "Every IO item must belong to a set");
  }
}

/** Walk containment only: references cannot resurrect deleted elements or create pages. */
export function containedElements(definitions: E): E[] {
  const result: E[] = [], seen = new Set<E>();
  const visit = (e: E): void => {
    if (!e || !e.$type || seen.has(e)) return;
    seen.add(e); result.push(e);
    for (const p of e.$descriptor?.properties ?? []) {
      if (p.isReference || p.isVirtual || p.isAttr) continue;
      const value = e[p.name];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
    // Opaque extension elements have no property descriptors for their children.
    for (const child of e.$children ?? []) visit(child);
  };
  visit(definitions); return result;
}

/** The projection records use, then audits the entire graph. New descriptor properties
 * and extension types are closed by default, including children of consumed scaffolding.
 * References are checked as properties, but never followed to resurrect removed content. */
class ProjectionConsumption {
  private readonly used = new Map<E, Set<string>>();
  consume(e: E, ...properties: string[]): void {
    const fields = this.used.get(e) ?? new Set<string>();
    properties.forEach((p) => fields.add(p));
    this.used.set(e, fields);
  }
  info(e: E): E | undefined {
    const v = semanticInfo(e);
    if (v) {
      this.consume(e, "extensionElements");
      this.consume(e.extensionElements, "values");
      this.consume(v, "laneRef", "primaryAssociationRef", "processRef");
    }
    return v;
  }
  io(owner: E): void {
    const io = owner.ioSpecification;
    if (!io || ![...list(io, "dataInputs"), ...list(io, "dataOutputs")].length) return;
    this.consume(owner, "ioSpecification");
    this.consume(io, "dataInputs", "dataOutputs", "inputSets", "outputSets");
    for (const [sets, items, membership] of [
      [list(io, "inputSets"), list(io, "dataInputs"), "dataInputRefs"],
      [list(io, "outputSets"), list(io, "dataOutputs"), "dataOutputRefs"],
    ] as const) for (const set of sets) {
      // One empty set is required for an absent direction; redundant empty sets
      // have no projected endpoint and must not disappear as successful exports.
      if (list(set, membership).length || (!items.length && sets.length === 1)) this.consume(set,
        "dataInputRefs", "optionalInputRefs", "whileExecutingInputRefs", "outputSetRefs",
        "dataOutputRefs", "optionalOutputRefs", "whileExecutingOutputRefs", "inputSetRefs");
    }
  }
  assertComplete(definitions: E): void {
    const di = new Set<E>();
    for (const diagram of list(definitions, "diagrams")) for (const e of containedElements(diagram)) {
      if (["bpmndi", "di", "dc"].includes(e.$type.split(":")[0]!)) di.add(e);
    }
    for (const e of containedElements(definitions)) {
      if (di.has(e)) continue;
      const fields = this.used.get(e);
      if (!fields) fail("unsupported-element", e, `${e.$type} is not consumed by the projection`);
      for (const p of e.$descriptor?.properties ?? []) {
        if (p.isVirtual || fields.has(p.name)) continue;
        const value = e[p.name], children = Array.isArray(value) ? value : [value];
        const child = children.find((v) => v?.$type && !di.has(v));
        if (!child) continue;
        if (p.isReference) throw new IoError("unsupported-element", `${e.$type}.${p.name} is not consumed`, [e.$type === "bpmn:Process" ? "" : e.id ?? ""]);
        // Preserve the historical owner diagnostic for anonymous activity loops.
        if (p.name === "loopCharacteristics" && !child.id) fail("unsupported-element", e, "Activity loops are not exported");
        fail("unsupported-element", child, `${e.$type}.${p.name} is not consumed`);
      }
    }
  }
}
/** Integrity checks shared by parsing and formatted export. No mutations or repairs. */
export function validateSemantics(definitions: E): Map<string, E> {
  if (definitions?.$type !== "bpmn:Definitions") throw new IoError("not-bpmn", "Expected moddle bpmn:Definitions");
  const all = containedElements(definitions), byId = new Map<string, E>(), contained = new Set(all);
  for (const e of all) if (e.id) {
    if (byId.has(e.id)) fail("duplicate-id", e, "Duplicate semantic ID");
    byId.set(e.id, e);
  }
  const processes = list(definitions, "rootElements").filter((e) => e.$type === "bpmn:Process");
  const processOf = new Map<E, E>();
  for (const p of processes) for (const e of containedElements(p)) processOf.set(e, p);
  // Collaboration artifacts share the semantic page of its sole participant.
  // Resolve ownership before checking lane references and process-wide orders.
  for (const c of list(definitions, "rootElements").filter((e) => e.$type === "bpmn:Collaboration")) {
    const artifacts = list(c, "artifacts");
    if (!artifacts.length) continue;
    const parts = list(c, "participants");
    if (parts.length > 1) throw new IoError("multiple-participants", "Ambiguous Collaboration artifact ownership", parts.map((p) => p.id));
    const process = parts[0]?.processRef;
    if (!processes.includes(process)) fail("unsupported-structure", c, "Artifact pool has no root process");
    for (const artifact of artifacts) for (const e of containedElements(artifact)) processOf.set(e, process);
  }
  const orders = new Map<E, Set<number>>();
  for (const e of all) {
    validateIoSpecification(e);
    const values = list(e.extensionElements ?? {}, "values");
    const infos = values.filter((v) => v.$type === "sem:Info");
    const unknown = values.find((v) => {
      // Typed descriptors carry the URI on their registered package, not on ns.
      const uri = v.$descriptor?.$pkg?.uri ?? v.$descriptor?.ns?.uri ?? v.$attrs?.xmlns ?? "";
      return v.$type === "sem:Info" ? uri !== semantics.uri : uri.startsWith("https://sentropic.com/schema/bpmn/semantics/");
    });
    if (unknown) fail("unknown-semantics-version", e, "Unknown semantic namespace version");
    if (infos.length > 1) fail("invalid-semantics", e, "Duplicate sem:Info");
    const v = infos[0]; if (!v) continue;
    const k = kind(e), item = artifact(e);
    if (v.order !== undefined) {
      if (!Number.isSafeInteger(v.order) || v.order < 0) fail("invalid-semantics", e, "Order must be a nonnegative integer");
      const p = processOf.get(e);
      if (p) { const used = orders.get(p) ?? new Set<number>(); if (used.has(v.order)) fail("invalid-semantics", e, "Duplicate semantic order"); used.add(v.order); orders.set(p, used); }
    }
    if (v.direction !== undefined && (k !== "DataObjectReference" || !["in", "out"].includes(v.direction))) fail("invalid-semantics", e, "Invalid direction or owner");
    if (v.label !== undefined && !["Association", "DataInputAssociation", "DataOutputAssociation"].includes(k)) fail("invalid-semantics", e, "Relation label on wrong owner");
    if (v.laneRef !== undefined && (!item || v.laneRef.$type !== "bpmn:Lane" || !contained.has(v.laneRef) || processOf.get(v.laneRef) !== processOf.get(e))) fail("invalid-semantics", e, "Lane reference must belong to this process");
    if (v.primaryAssociationRef !== undefined && (!item || !contained.has(v.primaryAssociationRef) || !["Association", "DataInputAssociation", "DataOutputAssociation"].includes(kind(v.primaryAssociationRef)))) fail("invalid-semantics", e, "Invalid primary association");
    if (v.processRef !== undefined && (!["Task", "SubProcess"].includes(k) || !processes.includes(v.processRef))) fail("invalid-semantics", e, "Navigation target must be a root Process");
  }
  return byId;
}
const boxOf = (shape: E | undefined, e: E): RefBox => {
  const b = shape?.bounds;
  if (!b) return fail("element-without-di", e, "Element without bounds");
  if (![b.x, b.y, b.width, b.height].every((n) => typeof n === "number" && Number.isFinite(n)) || b.width < 0 || b.height < 0) return fail("invalid-geometry", e, "Invalid bounds");
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
export function readReferencePages(definitions: BpmnDefinitions): RefPage[] {
  const byId = validateSemantics(definitions);
  const roots = definitions.rootElements ?? [];
  for (const c of roots) if (c.$type === "bpmn:Collaboration" && c.messageFlows?.length) fail("unsupported-element", c.messageFlows[0], "Message flows are not exported");
  const unsupportedRoot = roots.find((e) => !["bpmn:Process", "bpmn:Collaboration"].includes(e.$type));
  if (unsupportedRoot) {
    // Preserve existing unsupported-reference diagnostics when a supported page
    // refers to an unsupported root's content. Neither reference nor root may
    // reach projection filtering; an independent unsupported page names itself.
    const targets = new Set(containedElements(unsupportedRoot));
    for (const root of roots) if (["bpmn:Process", "bpmn:Collaboration"].includes(root.$type)) for (const e of containedElements(root)) {
      for (const p of e.$descriptor?.properties ?? []) {
        if (!p.isReference || p.isVirtual) continue;
        const value = e[p.name], refs = Array.isArray(value) ? value : [value];
        if (refs.some((ref) => targets.has(ref))) throw new IoError("unsupported-element", "Reference to unsupported root content", [e.$type === "bpmn:Process" ? "" : e.id ?? ""]);
      }
    }
    fail("unsupported-element", unsupportedRoot, "Unsupported root element or page");
  }
  const consumed = new ProjectionConsumption();
  consumed.consume(definitions, "rootElements");
  const processes = roots.filter((e) => e.$type === "bpmn:Process");
  const participants = new Map<E, { collaboration: E; participant: E }>();
  for (const c of roots.filter((e) => e.$type === "bpmn:Collaboration")) {
    const parts = list(c, "participants");
    if (parts.length > 1) throw new IoError("multiple-participants", "One pool per page", parts.map((p) => p.id));
    const part = parts[0];
    if (!part || !processes.includes(part.processRef)) fail("unsupported-structure", c, "Pool has no root process");
    if (participants.has(part.processRef)) fail("multiple-participants", part, "Process has several pools");
    participants.set(part.processRef, { collaboration: c, participant: part });
    consumed.consume(c, "participants", "artifacts");
    consumed.consume(part, "processRef");
  }
  if (!processes.length) throw new IoError("no-pages", "No root process");
  const pages = processes.map((process, index) => readPage(definitions, process, index, participants.get(process), byId, consumed));
  consumed.assertComplete(definitions);
  return pages;
}
function readPage(definitions: E, process: E, index: number, poolOwner: { collaboration: E; participant: E } | undefined, byId: Map<string, E>, consumed: ProjectionConsumption): RefPage {
  consumed.consume(process, "flowElements", "artifacts", "laneSets");
  consumed.io(process);
  const semantic = [...list(process, "flowElements"), ...list(process, "artifacts"), ...list(process.ioSpecification ?? {}, "dataInputs"), ...list(process.ioSpecification ?? {}, "dataOutputs"), ...list(poolOwner?.collaboration ?? {}, "artifacts")];
  const laneEls = list(process, "laneSets").flatMap((s) => list(s, "lanes"));
  for (const set of list(process, "laneSets")) if (list(set, "lanes").length) consumed.consume(set, "lanes");
  for (const lane of laneEls) if (lane.childLaneSet) fail("unsupported-element", lane, "Nested lanes are not exported");
  for (const e of semantic) {
    const k = kind(e);
    if (!(k in FLOW_TAG) && !["DataObject", "DataObjectReference", "DataInput", "DataOutput", "SequenceFlow", "Association", "TextAnnotation"].includes(k)) fail("unsupported-element", e, `${k} is not exported`);
    if (e.flowElements?.length || e.artifacts?.length || e.laneSets?.length) fail(k === "SubProcess" ? "nested-subprocess" : "unsupported-element", e, "Nested content is not exported");
  }
  const diagram = list(definitions, "diagrams").find((d) => d.plane?.bpmnElement === (poolOwner?.collaboration ?? process) || d.plane?.bpmnElement === process);
  if (!diagram) fail("missing-di", process, "Process without DI");
  const plane = diagram.plane;
  const shapes = new Map<E, E>(), edges = new Map<E, E>();
  for (const d of list(plane, "planeElement")) {
    if (!d.bpmnElement || byId.get(d.bpmnElement.id) !== d.bpmnElement) continue; // cached DI of a removed relation supplies no semantic fact
    if (d.$type === "bpmndi:BPMNShape") {
      const e = d.bpmnElement, k = kind(e);
      if (!(k in FLOW_TAG) && !artifact(e) && !["Lane", "Participant"].includes(k)) fail("unsupported-element", e, `${k} is not exported`);
      shapes.set(e, d);
    } else if (d.$type === "bpmndi:BPMNEdge") {
      const e = d.bpmnElement, k = kind(e);
      if (!["SequenceFlow", "Association", "DataInputAssociation", "DataOutputAssociation"].includes(k)) fail("unsupported-element", e, `${k} is not exported`);
      edges.set(e, d);
    }
  }
  const lanes = laneEls.map((l) => ({ id: l.id, name: l.name ?? "", box: boxOf(shapes.get(l), l) }));
  const laneOf = new Map<E, number>();
  laneEls.forEach((l, i) => list(l, "flowNodeRef").forEach((n) => {
    if (!(kind(n) in FLOW_TAG) || !semantic.includes(n) || laneOf.has(n)) fail("invalid-semantics", l, "Invalid flow-node lane membership");
    laneOf.set(n, i);
  }));
  for (const lane of laneEls) consumed.consume(lane, "flowNodeRef");
  const rank = new Map<E, number>();
  semantic.forEach((e, i) => {
    if (kind(e) !== "DataObject") rank.set(e, consumed.info(e)?.order ?? i);
  });
  const nodes = new Map<string, RefNode>(), appAnnotations = new Map<string, { box: RefBox; text: string }>();
  const drawable = semantic.filter((e) => kind(e) in FLOW_TAG || artifact(e));
  for (const e of drawable) {
    const k = kind(e), v = consumed.info(e), shape = shapes.get(e), box = boxOf(shape, e);
    consumed.consume(e);
    if (k in FLOW_TAG) {
      consumed.consume(e, "incoming", "outgoing");
      for (const [field, endpoint] of [["incoming", "targetRef"], ["outgoing", "sourceRef"]] as const) for (const ref of list(e, field)) {
        if (ref.$type !== "bpmn:SequenceFlow" || !semantic.includes(ref) || ref[endpoint] !== e) fail("invalid-semantics", e, "Flow-node references must agree with contained flows");
      }
      if (ACTIVITIES.has(FLOW_TAG[k]!)) consumed.io(e);
    }
    if (k === "DataObjectReference" && e.dataObjectRef) {
      if (e.dataObjectRef.$type !== "bpmn:DataObject" || !semantic.includes(e.dataObjectRef)) fail("invalid-semantics", e, "Data object declaration must belong to the process");
      consumed.consume(e, "dataObjectRef");
      consumed.consume(e.dataObjectRef);
    }
    if (k === "SubProcess" && shape?.isExpanded) fail("unsupported-element", e, "Expanded subprocess is not exported");
    let label = e.name ?? "", type = FLOW_TAG[k] ?? (k === "DataInput" ? "EXTERNAL_INPUT" : k === "DataOutput" ? "PROCESS_OUTPUT" : "DATA_OBJECT");
    if (k === "TextAnnotation") {
      const t = (e.text ?? "").trim();
      if (t.startsWith("[App]")) { appAnnotations.set(e.id, { box, text: t.slice(5).trim() }); continue; }
      if (!t.startsWith("[Doc]")) fail("free-annotation", e, "Only [App] and [Doc] annotations are exported");
      type = "DOCUMENT"; label = t.slice(5).trim();
    }
    const li = artifact(e) ? laneEls.indexOf(v?.laneRef) : laneOf.get(e);
    if (artifact(e) && (li === undefined || li < 0)) fail("missing-semantics", e, "Artifact lane is required");
    let target = v?.processRef;
    if (k === "CallActivity" && e.calledElement !== undefined) {
      target = list(definitions, "rootElements").find((p) => p.$type === "bpmn:Process" && p.id === e.calledElement);
      if (!target) fail("invalid-semantics", e, "calledElement must identify a root Process");
    }
    const n: RefNode = { id: e.id, type, label, box, semanticOrder: rank.get(e)!, ...(k.endsWith("Gateway") ? { subtype: k === "ParallelGateway" ? "AND" : "OR" } : {}), ...(target ? { targetProcessId: target.id } : {}), ...(shape?.label?.bounds ? { labelBox: boxOf(shape.label, e) } : {}) };
    if (li !== undefined && li >= 0) { n.laneIndex = li; n.laneName = lanes[li]!.name; }
    nodes.set(e.id, n);
  }
  const apps = new Map<string, { box: RefBox; text: string }>(), usedApps = new Set<string>();
  const relations = semantic.filter((e) => ["SequenceFlow", "Association"].includes(kind(e)));
  const ownerOf = new Map<E, E>();
  for (const e of semantic) if (ACTIVITIES.has(FLOW_TAG[kind(e)]!)) {
    consumed.consume(e, "dataInputAssociations", "dataOutputAssociations");
    for (const a of [...list(e, "dataInputAssociations"), ...list(e, "dataOutputAssociations")]) { relations.push(a); ownerOf.set(a, e); }
  }
  relations.forEach((e, i) => rank.set(e, consumed.info(e)?.order ?? i));
  relations.sort((a, b) => rank.get(a)! - rank.get(b)!);
  const connections: RefConnection[] = [];
  for (const a of relations) {
    const k = kind(a), owner = ownerOf.get(a);
    if (k === "Association") for (const endpoint of [a.sourceRef, a.targetRef]) {
      if (endpoint && byId.get(endpoint.id) !== endpoint) fail("invalid-semantics", a, "Association endpoint must be the canonical contained object");
    }
    consumed.consume(a, "sourceRef", "targetRef");
    let s = a.sourceRef, t = a.targetRef;
    let ck: RefConnection["kind"] = k === "SequenceFlow" ? "FLOW" : k === "Association" ? "DOC" : "DATA";
    if (owner) {
      if (k === "DataInputAssociation") {
        if (!Array.isArray(s) || s.length !== 1 || !semantic.includes(s[0]) || !ITEM_TYPES.has(nodes.get(s[0].id)?.type ?? "")) fail("invalid-semantics", a, "Input association needs one item source");
        if (!t || !["Property", "DataInput"].includes(kind(t)) || !containedElements(owner).includes(t)) fail("invalid-semantics", a, "Input target must be an activity-owned item");
        consumed.consume(t);
        if (kind(t) === "Property") consumed.consume(owner, "properties");
        s = s[0]; t = owner;
      } else {
        if (!t || !semantic.includes(t) || !ITEM_TYPES.has(nodes.get(t.id)?.type ?? "")) fail("invalid-semantics", a, "Output association needs an item target");
        if (s?.length && (s.length !== 1 || !["Property", "DataOutput"].includes(kind(s[0])) || !containedElements(owner).includes(s[0]))) fail("invalid-semantics", a, "Output source must be activity-owned");
        if (s?.length) {
          consumed.consume(s[0]);
          if (kind(s[0]) === "Property") consumed.consume(owner, "properties");
        }
        s = owner;
      }
    }
    if (k === "SequenceFlow") {
      if (!semantic.includes(s) || !semantic.includes(t) || !list(s, "outgoing").includes(a) || !list(t, "incoming").includes(a)) fail("invalid-semantics", a, "Flow endpoints and incoming/outgoing must agree");
    }
    if (k === "Association" && (appAnnotations.has(s?.id) || appAnnotations.has(t?.id))) {
      const ann = appAnnotations.has(s?.id) ? s : t, host = ann === s ? t : s;
      if (!ACTIVITIES.has(nodes.get(host?.id)?.type ?? "")) fail("orphan-application", ann, "Application needs an activity");
      if (usedApps.has(ann.id) || apps.has(host.id)) fail("unsupported-element", a, "Multiple application attachments are not exported");
      usedApps.add(ann.id); if (!apps.has(host.id)) { apps.set(host.id, appAnnotations.get(ann.id)!); nodes.get(host.id)!.appLabel = appAnnotations.get(ann.id)!.text; }
      continue;
    }
    if (!nodes.has(s?.id) || !nodes.has(t?.id)) fail("missing-endpoint", a, "Relation endpoint is not exported");
    if (ck === "DOC" && nodes.get(s.id)!.type !== "DOCUMENT" && nodes.get(t.id)!.type !== "DOCUMENT") fail("unsupported-element", a, "Association must attach a document");
    const edge = edges.get(a);
    if (!edge || edge.waypoint?.length < 2 || !edge.waypoint) fail("element-without-di", a, "Relation requires DI with two waypoints");
    const points: RefPoint[] = edge.waypoint.map((p: E) => {
      if (![p.x, p.y].every((n) => typeof n === "number" && Number.isFinite(n))) fail("invalid-geometry", a, "Invalid waypoints");
      return [p.x, p.y] as const;
    });
    connections.push({ id: a.id, source: s.id, target: t.id, kind: ck, label: ck === "FLOW" ? a.name ?? "" : semanticInfo(a)?.label ?? "", points, semanticOrder: rank.get(a)! });
  }
  for (const id of appAnnotations.keys()) if (!usedApps.has(id)) fail("orphan-application", byId.get(id)!, "Application is not attached");
  connections.sort((a, b) => Number(a.kind !== "FLOW") - Number(b.kind !== "FLOW") || a.semanticOrder - b.semanticOrder);
  for (const e of drawable.filter(artifact)) {
    const n = nodes.get(e.id); if (!n) continue;
    const v = semanticInfo(e), incident = connections.filter((c) => c.kind !== "FLOW" && (c.source === n.id || c.target === n.id));
    const role = (c: RefConnection): "in" | "out" => c.source === n.id ? "in" : "out";
    const roles = new Set(incident.filter((c) => c.kind === "DATA").map(role));
    if (kind(e) === "DataObjectReference") {
      const direction = v?.direction ?? (roles.size === 1 ? [...roles][0] : undefined);
      if (!direction) fail("missing-semantics", e, "Ambiguous or unlinked item requires direction");
      n.type = direction === "in" ? "TASK_INPUT" : "TASK_OUTPUT";
    }
    const primary = v?.primaryAssociationRef;
    const c = primary ? incident.find((a) => a.id === primary.id) : incident[0];
    if (primary && !c) fail("invalid-semantics", e, "Primary association must be incident");
    if (c) {
      const host = c.source === n.id ? c.target : c.source;
      if (!ACTIVITIES.has(nodes.get(host)?.type ?? "")) fail("invalid-semantics", e, "Attachment requires an activity");
      n.task = host; n.dir = n.type === "DOCUMENT" ? "doc" : role(c);
    } else n.dir = n.type === "DOCUMENT" ? "doc" : ["TASK_INPUT", "EXTERNAL_INPUT"].includes(n.type) ? "in" : "out";
  }
  const seq = [...nodes.values()].sort((a, b) => a.semanticOrder - b.semanticOrder);
  const flowOrder = seq.filter((n) => FLOW_TYPES.has(n.type)).map((n) => n.id), order: string[] = [];
  for (const host of flowOrder) {
    const docs = seq.filter((n) => n.task === host && n.dir === "doc").map((n) => n.id), half = Math.ceil(docs.length / 2);
    order.push(host, ...docs.slice(0, half).reverse(), ...docs.slice(half), ...seq.filter((n) => n.task === host && n.dir === "in").map((n) => n.id).reverse(), ...seq.filter((n) => n.task === host && n.dir === "out").map((n) => n.id));
  }
  const loose = new Map<number, string[]>();
  for (const n of seq.filter((n) => !FLOW_TYPES.has(n.type) && !n.task)) { const li = n.laneIndex ?? -1; const a = loose.get(li) ?? []; a.push(n.id); loose.set(li, a); }
  for (const a of loose.values()) order.push(...a);
  const boxes = [...lanes.map((l) => l.box), ...seq.map((n) => n.box)];
  const x = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0, y = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const pool = poolOwner ? boxOf(shapes.get(poolOwner.participant), poolOwner.participant) : { x, y, w: boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) - x : 0, h: boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) - y : 0 };
  return { processId: process.id, index, name: poolOwner?.participant.name || process.name || `Process ${index + 1}`, pool, lanes, nodes, order, flowOrder, apps, connections };
}
