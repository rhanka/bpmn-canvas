import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BpmnModdle } from "bpmn-moddle";
import { JSDOM } from "jsdom";
import { replaceType, io, descriptor, model, info, pages, outputs, refuses, freezeGraph, fixture, text } from "./helpers/semantic.mjs";

test("shared descriptor is packaged verbatim with checksum and subpath", async () => {
  const packed = readFileSync(new URL("../dist/io/semantics.json", import.meta.url));
  assert.deepEqual(JSON.parse(packed), descriptor);
  assert.equal(io.semanticsChecksum, createHash("sha256").update(packed).digest("hex"));
  const sub = await import("@sentropic/bpmn-canvas/semantics.json", { with: { type: "json" } });
  assert.deepEqual(sub.default, descriptor);
});
test("all six attributes round-trip as typed moddle references without warnings", async () => {
  const m = await model("C2");
  const c4 = await model("C4");
  for (const sample of [m, c4]) {
    const bytes = await io.export(sample.definitions, "bpmn");
    const parsed = await io.parseDefinitions(text(bytes));
    const original = sample === m ? "Quote_preparation" : "Request_file";
    const v = info(parsed.elementsById[original]);
    const expected = info(sample.elementsById[original]);
    for (const key of ["order", "direction", "label"]) assert.equal(v[key], expected[key]);
    for (const key of ["laneRef", "primaryAssociationRef", "processRef"]) if (expected[key]) assert.equal(v[key], parsed.elementsById[expected[key].id]);
    assert.deepEqual(parsed.warnings, []);
  }
  const r = await io.parseDefinitions(text(await io.export(c4.definitions, "bpmn")));
  assert.equal(info(r.elementsById.Out_Prepare_Request_file).label, "draft");
});
test("process IO uses standard DataInput/DataOutput and sets", async () => {
  const m = await model();
  const p = m.elementsById.Order_handling;
  const input = replaceType(m, "Order_form", "bpmn:DataInput"), output = replaceType(m, "Shipping_note", "bpmn:DataOutput");
  const ioSpec = m.moddle.create("bpmn:InputOutputSpecification", { dataInputs: [input], dataOutputs: [output], inputSets: [m.moddle.create("bpmn:InputSet", { dataInputRefs: [input] })], outputSets: [m.moddle.create("bpmn:OutputSet", { dataOutputRefs: [output] })] });
  p.ioSpecification = ioSpec;
  p.flowElements = p.flowElements.filter((e) => e !== input && e !== output && !["Order_form_obj", "Shipping_note_obj"].includes(e.id));
  delete info(input).direction; delete info(output).direction;
  assert.deepEqual([pages(m)[0].nodes.get(input.id).type, pages(m)[0].nodes.get(output.id).type], ["EXTERNAL_INPUT", "PROCESS_OUTPUT"]);
  await outputs(m);
});
test("unlinked explicit input and output roles survive without attachments", async () => {
  const m = await model();
  m.elementsById.Check_order.dataInputAssociations = [];
  m.elementsById.Check_order.properties = [];
  m.elementsById.Ship_order.dataOutputAssociations = [];
  for (const id of ["Order_form", "Shipping_note"]) delete info(m.elementsById[id]).primaryAssociationRef;
  const p = pages(m)[0];
  assert.deepEqual([p.nodes.get("Order_form").type, p.nodes.get("Shipping_note").type], ["TASK_INPUT", "TASK_OUTPUT"]);
  assert.equal(p.nodes.get("Order_form").task, undefined);
  await outputs(m);
});
test("dual role separates declared role from primary attachment and preserves every link", async () => {
  const m = await model("C4");
  info(m.elementsById.Request_file).direction = "in";
  const p = pages(m)[0], n = p.nodes.get("Request_file");
  assert.deepEqual([n.type, n.task, n.dir], ["TASK_INPUT", "Prepare", "out"]);
  assert.equal(p.connections.filter((c) => c.kind === "DATA").length, 2);
  const out = await outputs(m);
  const dom = new JSDOM(out.drawio, { contentType: "application/xml" });
  try {
    const item = [...dom.window.document.querySelectorAll("mxCell")].find((c) => c.getAttribute("value") === "Request file");
    assert.match(item.getAttribute("style"), /bpmnTransferType=input;/);
    const app = [...dom.window.document.querySelectorAll("mxCell")].find((c) => c.getAttribute("value") === "File tool");
    assert.ok([...dom.window.document.querySelectorAll('mxCell[edge="1"]')].some((c) => c.getAttribute("source") === app.getAttribute("id") && c.getAttribute("target") === item.getAttribute("id")));
  } finally { dom.window.close(); }
});
test("shared document selects explicit primary and keeps both endpoint orders", async () => {
  const m = await model("C4");
  info(m.elementsById.Doc_Guide).primaryAssociationRef = m.elementsById.DocLink_Guide_Review;
  const p = pages(m)[0];
  assert.equal(p.nodes.get("Doc_Guide").task, "Review");
  assert.deepEqual(p.connections.filter((c) => c.kind === "DOC").map((c) => [c.source, c.target]), [["Doc_Guide", "Prepare"], ["Doc_Guide", "Review"]]);
  await outputs(m);
});
test("artifact lane membership follows IDs despite homonymous lanes and host", async () => {
  const m = await model("C3");
  info(m.elementsById.Spec).laneRef = m.elementsById.Team;
  assert.equal(pages(m)[0].nodes.get("Spec").laneIndex, 0);
  assert.equal(pages(m)[0].nodes.get("Build").laneIndex, 2);
  await outputs(m);
});
test("relation labels and endpoints survive contradictory waypoints", async () => {
  const m = await model("C4");
  for (const e of m.definitions.diagrams[0].plane.planeElement) if (e.waypoint) e.waypoint.reverse();
  const p = pages(m)[0];
  assert.deepEqual(p.connections.filter((c) => c.kind === "DOC").map((c) => [c.source, c.target, c.label]), [["Doc_Guide", "Prepare", "see part 4"], ["Doc_Guide", "Review", ""]]);
  assert.equal(p.connections.find((c) => c.kind === "DATA").label, "draft");
  await outputs(m);
});
test("FLOW precedes DATA/DOC regardless of relation metadata and DI order", async () => {
  const m = await model("C4");
  info(m.elementsById.Out_Prepare_Request_file).order = 99;
  m.definitions.diagrams[0].plane.planeElement.reverse();
  assert.deepEqual(pages(m)[0].connections.map((c) => c.kind), ["FLOW", "FLOW", "FLOW", "DATA", "DATA", "DOC", "DOC"]);
  await outputs(m);
});
test("node grouping uses semantic order despite scrambled DI", async () => {
  const m = await model("C7");
  m.definitions.diagrams[0].plane.planeElement.reverse();
  assert.deepEqual(pages(m)[0].order, ["Go", "Assemble", "Doc_Doc_two", "Doc_Doc_one", "Doc_Doc_three", "In_two", "In_one", "Out_one", "Out_two", "Stop"]);
  assert.deepEqual(await outputs(m), { drawio: fixture("C7", "expected.drawio"), sparx: fixture("C7", "expected.sparx.xml") });
});
test("navigation follows exact Process IDs across homonyms, Unicode digits, rename and reparse", async () => {
  const m = await model("C2");
  m.elementsById.Quote_preparation.name = "Stage ٢.١";
  m.elementsById.Quote_preparation_2.name = "Same page";
  m.elementsById.Archive_records.name = "Same page";
  const r = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  const p = readPages(r);
  assert.equal(p[0].nodes.get("Quote_preparation").targetProcessId, "Quote_preparation_2");
  assert.equal(p[0].nodes.get("Run_2_1_checks").targetProcessId, "Process_2_1_Credit_check");
  assert.equal(r.elementsById.Quote_preparation.$type, "bpmn:SubProcess");
  const d = text(await io.export(r.rootElement, "drawio"));
  assert.match(d, /value="Stage ٢.١"[^>]*link="data:page\/id,diagram-1"/);
});
const readPages = (r) => pages({ definitions: r.rootElement });
test("frozen model exports deterministically without semantic or DI mutation", async () => {
  const m = await model();
  const before = (await m.moddle.toXML(m.definitions)).xml;
  freezeGraph(m.definitions);
  const first = await outputs(m);
  assert.deepEqual(await outputs(m), first);
  assert.equal(text(await io.export(m.definitions, "bpmn")), text(await io.export(m.definitions, "bpmn")));
  assert.equal((await m.moddle.toXML(m.definitions)).xml, before);
});
test("formatted export runs in Node without DOM", async () => {
  const m = await model();
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, get() { throw new Error("DOM forbidden"); } });
  Object.defineProperty(globalThis, "document", { configurable: true, get() { throw new Error("DOM forbidden"); } });
  try { assert.equal((await outputs(m)).drawio, fixture("C1", "expected.drawio")); }
  finally { delete globalThis.DOMParser; delete globalThis.document; }
});
test("all root processes export in semantic order independently of diagrams", async () => {
  const m = await model("C2");
  m.definitions.diagrams.reverse();
  assert.deepEqual(pages(m).map((p) => p.processId), ["Sales_overview", "Quote_preparation_2", "Process_2_1_Credit_check", "Archive_records"]);
  assert.equal((await outputs(m)).drawio, fixture("C2", "expected.drawio"));
});
test("missing DI on one page refuses the whole formatted export", async () => {
  const m = await model("C2");
  m.definitions.diagrams.pop();
  await refuses(m, "missing-di", ["Archive_records"]);
});

for (const [id, role, host] of [["Order_form", "in", "Check_order"], ["Shipping_note", "out", "Ship_order"]]) test(`standard associations derive ${role} without direction`, async () => {
  const m = await model(); delete info(m.elementsById[id]).direction;
  const p = pages(m)[0], n = p.nodes.get(id);
  assert.deepEqual([n.type, n.dir, n.task], [role === "in" ? "TASK_INPUT" : "TASK_OUTPUT", role, host]);
  assert.deepEqual(await outputs(m), { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") });
});
for (const id of ["Request_file", "Doc_Guide"]) test(`${id}: absent primary uses semantic relation order against DI`, async () => {
  const m = await model("C4"); delete info(m.elementsById[id]).primaryAssociationRef;
  if (id === "Request_file") info(m.elementsById.In_Request_file_Review).order = 90;
  else info(m.elementsById.DocLink_Guide_Review).order = 90;
  // DI still places Prepare and its attachment first and points toward it.
  const p = pages(m)[0], n = p.nodes.get(id);
  assert.deepEqual([n.task, n.dir], ["Review", id === "Request_file" ? "in" : "doc"]);
  assert.ok(p.order.indexOf(id) > p.order.indexOf("Review"));
  assert.equal(p.connections.filter((c) => c.source === id || c.target === id).length, 2);
  const out = await outputs(m);
  assert.equal((out.drawio.match(/edge="1"/g) ?? []).length, 7);
  assert.equal((out.sparx.match(/<bpmn:association /g) ?? []).length, 4); // all DATA/DOC links; applications are child elements
});

const invalid = [
  ["duplicate Info", "invalid-semantics", "Order_form", (m) => m.elementsById.Order_form.extensionElements.values.push(m.moddle.create("sem:Info", { order: 25 }))],
  ...[-1, 1.5, "1"].map((order) => [`invalid order ${order}`, "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).order = order; }]),
  ["duplicate order", "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).order = 0; }],
  ["invalid direction", "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).direction = "both"; }],
  ["unresolved lane", "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).laneRef = m.moddle.create("bpmn:Lane", { id: "absent" }); }],
  ["wrong-type lane", "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).laneRef = m.elementsById.Check_order; }],
  ["cross-process lane", "invalid-semantics", "Order_form", (m) => { const lane = m.moddle.create("bpmn:Lane", { id: "Other_lane" }); m.definitions.rootElements.push(m.moddle.create("bpmn:Process", { id: "Other", laneSets: [m.moddle.create("bpmn:LaneSet", { lanes: [lane] })] })); info(m.elementsById.Order_form).laneRef = lane; }],
  ["unresolved primary", "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).primaryAssociationRef = m.moddle.create("bpmn:Association", { id: "absent" }); }],
  ["nonincident primary", "invalid-semantics", "Order_form", (m) => { info(m.elementsById.Order_form).primaryAssociationRef = m.elementsById.Out_Ship_order_Shipping_note; }],
  ["unresolved process", "invalid-semantics", "Check_order", (m) => { info(m.elementsById.Check_order).processRef = m.moddle.create("bpmn:Process", { id: "absent" }); }],
  ["non-root process", "invalid-semantics", "Check_order", (m) => { const p = m.moddle.create("bpmn:Process", { id: "Nested" }); m.elementsById.Check_order.flowElements = [p]; info(m.elementsById.Check_order).processRef = p; }],
  ["wrong-type process", "invalid-semantics", "Check_order", (m) => { info(m.elementsById.Check_order).processRef = m.elementsById.Ship_order; }],
  ["missing ambiguous direction", "missing-semantics", "Order_form", (m) => { m.elementsById.Check_order.dataInputAssociations = []; delete info(m.elementsById.Order_form).primaryAssociationRef; delete info(m.elementsById.Order_form).direction; }],
  ["missing artifact lane", "missing-semantics", "Order_form", (m) => { delete info(m.elementsById.Order_form).laneRef; }],
  ["wrong owner", "invalid-semantics", "Check_order", (m) => { info(m.elementsById.Check_order).direction = "in"; }],
  ["duplicate ID", "duplicate-id", "Ship_order", (m) => { m.elementsById.Check_order.id = "Ship_order"; }],
  ["inconsistent flow", "invalid-semantics", "Flow_Order_received_Check_order", (m) => { m.elementsById.Check_order.incoming = []; }],
  ["invalid data target", "invalid-semantics", "In_Order_form_Check_order", (m) => { m.elementsById.In_Order_form_Check_order.targetRef = m.elementsById.Check_order; }],
  ["missing data source", "invalid-semantics", "In_Order_form_Check_order", (m) => { m.elementsById.In_Order_form_Check_order.sourceRef = []; }],
  ["nested content", "nested-subprocess", "Check_order", (m) => { replaceType(m, "Check_order", "bpmn:SubProcess"); m.elementsById.Check_order.flowElements = [m.moddle.create("bpmn:Task", { id: "Inner" })]; }],
  ["free annotation", "free-annotation", "Doc_Shipping_policy", (m) => { m.elementsById.Doc_Shipping_policy.text = "Free text"; }],
  ["orphan application", "orphan-application", "App_Check_order", (m) => { m.elementsById.Order_handling.artifacts = m.elementsById.Order_handling.artifacts.filter((e) => e.id !== "AppLink_Check_order"); }],
  ["invalid geometry", "invalid-geometry", "Check_order", (m) => { m.definitions.diagrams[0].plane.planeElement.find((e) => e.bpmnElement?.id === "Check_order").bounds.width = NaN; }],
  ["missing edge DI", "element-without-di", "In_Order_form_Check_order", (m) => { m.definitions.diagrams[0].plane.planeElement = m.definitions.diagrams[0].plane.planeElement.filter((e) => e.bpmnElement?.id !== "In_Order_form_Check_order"); }],
  ["expanded subprocess", "unsupported-element", "Request_details", (m) => { replaceType(m, "Request_details", "bpmn:SubProcess"); m.definitions.diagrams[0].plane.planeElement.find((e) => e.bpmnElement?.id === "Request_details").isExpanded = true; }],
  ["missing shape DI", "element-without-di", "Check_order", (m) => { m.definitions.diagrams[0].plane.planeElement = m.definitions.diagrams[0].plane.planeElement.filter((e) => e.bpmnElement?.id !== "Check_order"); }],
  ...[NaN, Infinity, -Infinity].map((x) => [`invalid waypoint ${x}`, "invalid-geometry", "In_Order_form_Check_order", (m) => { m.definitions.diagrams[0].plane.planeElement.find((e) => e.bpmnElement?.id === "In_Order_form_Check_order").waypoint[0].x = x; }]),
];
for (const [name, code, id, change] of invalid) test(`invalid metadata refuses: ${name}`, async () => { const m = await model(); change(m); await refuses(m, code, [id]); });
test("unknown semantic namespace version refuses with owner ID", async () => {
  await assert.rejects(() => io.parseDefinitions(fixture("C1").replaceAll(descriptor.uri, descriptor.uri.replace(/1$/, "2"))), (e) => e instanceof io.IoError && e.code === "unknown-semantics-version" && e.ids.includes("Order_received"));
});
test("direct-model export rejects a typed extension registered under an unknown URI", async () => {
  const uri = descriptor.uri.replace(/1$/, "2");
  const moddle = new BpmnModdle({ sem: { ...descriptor, uri } });
  const parsed = await moddle.fromXML(fixture("C1").replaceAll(descriptor.uri, uri));
  assert.deepEqual(parsed.warnings, []);
  assert.equal(info(parsed.elementsById.Order_received).$type, "sem:Info");
  await refuses({ definitions: parsed.rootElement }, "unknown-semantics-version", ["Order_received"]);
});
for (const order of ["1016.5", "1016junk"]) test(`malformed XML order ${order} refuses with owner ID`, async () => {
  const m = await model();
  for (const e of Object.values(m.elementsById)) if (info(e)?.order === 1016) info(e).order = 9999;
  info(m.elementsById.Order_form).order = 1016;
  const xml = text(await io.export(m.definitions, "bpmn")).replace('order="1016"', `order="${order}"`);
  assert.ok(xml.includes(`order="${order}"`));
  await assert.rejects(() => io.parseDefinitions(xml), (e) => {
    assert.ok(e instanceof io.IoError);
    assert.equal(e.code, "invalid-semantics");
    assert.deepEqual(e.ids, ["Order_form"]);
    return true;
  });
});
for (const type of ["StandardLoopCharacteristics", "MultiInstanceLoopCharacteristics"]) test(`${type}: formatted exports refuse; BPMN preserves activity content`, async () => {
  const m = await model();
  const values = type === "StandardLoopCharacteristics" ? { loopMaximum: 3 } : { isSequential: true };
  m.elementsById.Check_order.loopCharacteristics = m.moddle.create(`bpmn:${type}`, values);
  const serialized = text(await io.export(m.definitions, "bpmn"));
  const parsed = await io.parseDefinitions(serialized);
  assert.equal(parsed.elementsById.Check_order.loopCharacteristics.$type, `bpmn:${type}`);
  for (const [key, value] of Object.entries(values)) assert.equal(parsed.elementsById.Check_order.loopCharacteristics[key], value);
  assert.deepEqual(parsed.warnings, []);
  await refuses(m, "unsupported-element", ["Check_order"]);
});

const exclusions = [
  ["inclusive gateway", "unsupported-element", ["Order_complete"], (m) => { replaceType(m, "Order_complete", "bpmn:InclusiveGateway"); }],
  ["boundary event", "unsupported-element", ["Boundary"], (m) => m.elementsById.Order_handling.flowElements.push(m.moddle.create("bpmn:BoundaryEvent", { id: "Boundary", attachedToRef: m.elementsById.Check_order }))],
  ["catching event", "unsupported-element", ["Catch"], (m) => m.elementsById.Order_handling.flowElements.push(m.moddle.create("bpmn:IntermediateCatchEvent", { id: "Catch" }))],
  ["message flow", "unsupported-element", ["Message"], (m) => { m.elementsById.Order_handling_collab.messageFlows = [m.moddle.create("bpmn:MessageFlow", { id: "Message", sourceRef: m.elementsById.Check_order, targetRef: m.elementsById.Ship_order })]; }],
  ["several participants", "multiple-participants", ["Order_handling_pool", "Second"], (m) => m.elementsById.Order_handling_collab.participants.push(m.moddle.create("bpmn:Participant", { id: "Second", processRef: m.elementsById.Order_handling }))],
  ["nested lanes", "unsupported-element", ["Sales"], (m) => { m.elementsById.Sales.childLaneSet = m.moddle.create("bpmn:LaneSet", { id: "Children", lanes: [m.moddle.create("bpmn:Lane", { id: "Child" })] }); }],
];
for (const [name, code, ids, change] of exclusions) test(`reference vocabulary refuses ${name}; BPMN preserves it`, async () => {
  const m = await model(); change(m);
  await refuses(m, code, ids);
  const bytes = await io.export(m.definitions, "bpmn");
  assert.match(text(bytes), /sem:info/);
  const r = await io.parseDefinitions(text(bytes));
  for (const id of ids) assert.ok(r.elementsById[id]);
});
