import { test } from "node:test";
import assert from "node:assert/strict";
import * as io from "../dist/io/index.js";
import { freeze, snapshot } from "./helpers/workbench.mjs";
import { nativeModel, xmlOptions } from "./helpers/workbench-native.mjs";
import { xmlText as text, xmlDocument as document, xmlStructure as structure } from "./helpers/workbench-xml.mjs";

const byId = (doc, id) => doc.querySelector(`[id="${id}"]`);
const bpmn = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const sem = "https://sentropic.com/schema/bpmn/semantics/1";
const refuses = (model, code) => assert.rejects(() => io.serializeBpmn(model, xmlOptions), (e) => e instanceof io.IoError && e.code === code);

test("F7 should expose a dedicated XML writer", () => { assert.equal(typeof io.serializeBpmn, "function"); });
test("F7 should write standard BPMN UTF-8 bytes from a hand-built model without DI", async () => {
  const { definitions } = nativeModel(); delete definitions.diagrams;
  const bytes = await io.serializeBpmn(definitions, xmlOptions); assert.ok(bytes instanceof Uint8Array);
  const doc = document(bytes); assert.equal(doc.documentElement.namespaceURI, bpmn); assert.equal(doc.documentElement.localName, "definitions");
  assert.deepEqual([...doc.getElementsByTagNameNS(bpmn, "process")].map((p) => p.id), ["Process_Booklet", "Process_Lantern"]);
  assert.equal(doc.getElementsByTagNameNS("http://www.omg.org/spec/BPMN/20100524/DI", "BPMNDiagram").length, 0);
});
test("F7 should preserve IDs, shared links and endpoint order", async () => {
  const { definitions } = nativeModel(), doc = document(await io.serializeBpmn(definitions, xmlOptions));
  assert.equal(byId(doc, "Flow_First").getAttribute("sourceRef"), "Start_Booklet");
  assert.equal(byId(doc, "Flow_First").getAttribute("targetRef"), "Task_Fold");
  assert.deepEqual([...byId(doc, "Task_Fold").getElementsByTagNameNS(bpmn, "incoming")].map((e) => e.textContent), ["Flow_First"]);
  assert.deepEqual([...byId(doc, "Lane_Fold").getElementsByTagNameNS(bpmn, "flowNodeRef")].map((e) => e.textContent), ["Task_Fold", "Start_Booklet", "End_Booklet"]);
  assert.deepEqual([...byId(doc, "Process_Booklet").children].filter((e) => e.id && e.localName !== "laneSet").map((e) => e.id), ["Start_Booklet", "Task_Fold", "End_Booklet", "Flow_First", "Flow_Last"]);
});
test("F7 should preserve every hand-authored page, geometry and color", async () => {
  const { definitions } = nativeModel(), doc = document(await io.serializeBpmn(definitions, xmlOptions));
  assert.ok(byId(doc, "Diagram_Lantern")); assert.equal(byId(doc, "Plane_Lantern").getAttribute("bpmnElement"), "Process_Lantern");
  const bounds = byId(doc, "Shape_Fold").getElementsByTagNameNS("http://www.omg.org/spec/DD/20100524/DC", "Bounds")[0];
  assert.deepEqual(["x", "y", "width", "height"].map((k) => bounds.getAttribute(k)), ["12.5", "20.25", "100", "80"]);
  const shape = byId(doc, "Shape_Fold"); assert.equal(shape.getAttributeNS("http://bpmn.io/schema/bpmn/biocolor/1.0", "fill"), "#f0f8ff");
  assert.equal(shape.getAttributeNS("http://bpmn.io/schema/bpmn/biocolor/1.0", "stroke"), "#123456");
  assert.equal(shape.getAttributeNS("http://www.omg.org/spec/BPMN/non-normative/color/1.0", "background-color"), "#abcdef");
  assert.deepEqual([...byId(doc, "Edge_First").children].filter((e) => e.localName === "waypoint").map((e) => [e.getAttribute("x"), e.getAttribute("y")]), [["1.5", "2.5"], ["5", "8"]]);
});
test("F7 should retain sem fields, ID refs and registered namespace attrs", async () => {
  const { definitions } = nativeModel(), doc = document(await io.serializeBpmn(definitions, xmlOptions)), info = doc.getElementsByTagNameNS(sem, "info")[0];
  assert.ok(info); assert.deepEqual(["order", "laneRef", "direction", "label", "primaryAssociationRef", "processRef"].map((k) => info.getAttribute(k)), ["2", "Lane_Fold", "input", "01", "Flow_First", "Process_Lantern"]);
  assert.equal(doc.documentElement.lookupNamespaceURI("sem"), sem);
});
test("F7 should preserve exact Unicode, escaping, multiline text and CDATA", async () => {
  const { definitions, task, first } = nativeModel(), bytes = await io.serializeBpmn(definitions, xmlOptions), doc = document(bytes);
  assert.equal(byId(doc, "Task_Fold").getAttribute("name"), task.name);
  assert.equal(byId(doc, "Task_Fold").getElementsByTagNameNS(bpmn, "documentation")[0].textContent, task.documentation[0].text);
  assert.equal(byId(doc, "Flow_First").getElementsByTagNameNS(bpmn, "conditionExpression")[0].textContent, first.conditionExpression.body);
  assert.ok(text(bytes).includes("&amp;")); assert.ok(text(bytes).includes("&lt;"));
  // Native writer escapes text; the contract preserves CDATA content, not its lexical wrapper.
  const cdataXml = text(bytes).replace("x &lt; 2 &amp;&amp; y &gt; 0", "<![CDATA[x < 2 && y > 0]]>");
  assert.ok(cdataXml.includes("<![CDATA["));
  const fromCdata = await io.createModdle().fromXML(cdataXml); assert.equal(fromCdata.warnings.length, 0);
  const cdataWritten = document(await io.serializeBpmn(fromCdata.rootElement, xmlOptions));
  assert.equal(byId(cdataWritten, "Flow_First").getElementsByTagNameNS(bpmn, "conditionExpression")[0].textContent, first.conditionExpression.body);
});
test("F7 should honor descriptor defaults and retain nondefault values", async () => {
  const { definitions, task } = nativeModel(); task.startQuantity = 2;
  const bytes = await io.serializeBpmn(definitions, xmlOptions), parsed = await io.createModdle().fromXML(text(bytes));
  assert.equal(parsed.warnings.length, 0); const restored = parsed.elementsById.Task_Fold;
  assert.equal(restored.startQuantity, 2); assert.equal(restored.completionQuantity, 1); assert.equal(restored.isForCompensation, false);
});
test("F7 should produce identical bytes over three repeats and fresh models", async () => {
  const { definitions } = nativeModel(), first = await io.serializeBpmn(definitions, xmlOptions);
  for (let i = 0; i < 3; i++) { assert.deepEqual(await io.serializeBpmn(definitions, xmlOptions), first); assert.deepEqual(await io.serializeBpmn(nativeModel().definitions, xmlOptions), first); }
});
test("F7 should not mutate frozen native models or options", async () => {
  const { definitions } = nativeModel(), before = snapshot(definitions); freeze(definitions);
  await io.serializeBpmn(definitions, xmlOptions); assert.equal(snapshot(definitions), before); assert.deepEqual(xmlOptions, { format: true, preamble: true });
});
test("F7 should isolate format/preamble configuration in A B A order", async () => {
  const { definitions } = nativeModel(), a = await io.serializeBpmn(definitions, xmlOptions), bOptions = freeze({ format: false, preamble: false });
  const b = await io.serializeBpmn(definitions, bOptions); assert.notEqual(text(a), text(b)); assert.ok(!text(b).startsWith("<?xml"));
  assert.deepEqual(structure(document(a)), structure(document(b)));
  for (let i = 0; i < 3; i++) { await io.serializeBpmn(definitions, bOptions); assert.deepEqual(await io.serializeBpmn(definitions, xmlOptions), a); }
});
test("F7 should reach structural and writer byte fixed points after native parse/write", async () => {
  const first = await io.serializeBpmn(nativeModel().definitions, xmlOptions);
  const parsed = await io.createModdle().fromXML(text(first)); assert.equal(parsed.warnings.length, 0);
  const second = await io.serializeBpmn(parsed.rootElement, xmlOptions);
  const reparsed = await io.createModdle().fromXML(text(second)); assert.equal(reparsed.warnings.length, 0);
  const third = await io.serializeBpmn(reparsed.rootElement, xmlOptions);
  assert.deepEqual(structure(document(first)), structure(document(second))); assert.deepEqual(second, third);
});
test("F7 should refuse JSON objects and wrong native roots with typed codes", async () => {
  await refuses({ $type: "bpmn:Definitions", rootElements: [] }, "invalid-model");
  await refuses(io.createModdle().create("bpmn:Task"), "not-bpmn");
});
for (const [name, mutate, code] of [
  ["duplicate IDs", ({ task, start }) => { task.id = start.id; }, "duplicate-id"],
  ["detached endpoint objects", ({ m, first }) => { first.targetRef = m.create("bpmn:Task", { id: "Task_Fold" }); }, "invalid-reference"],
  ["dangling endpoints", ({ m, first }) => { first.targetRef = m.create("bpmn:Task", { id: "Missing" }); }, "dangling-reference"],
  ["wrong-type references", ({ info, task }) => { info.laneRef = task; }, "invalid-reference"],
  ["nonfinite geometry", ({ shape }) => { shape.bounds.x = Infinity; }, "invalid-value"],
  ["invalid containment", ({ process, lane }) => { process.flowElements.push(lane); }, "invalid-containment"],
  ["shared containment", ({ definitions, process }) => { definitions.rootElements.push(process); }, "invalid-containment"],
]) test(`F7 should reject ${name} without returning a partial file`, async () => { const native = nativeModel(); mutate(native); await refuses(native.definitions, code); });
test("F7 should reject unsupported XML options explicitly", async () => {
  const { definitions } = nativeModel();
  for (const options of [undefined, { format: "yes", preamble: true }, { format: true, preamble: true, mysterious: true }]) {
    await assert.rejects(() => io.serializeBpmn(definitions, options), (e) => e instanceof io.IoError && e.code === "invalid-configuration");
  }
});
