import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { replaceType, io, model, config, text, outputs, fixture, refuses } from "./helpers/semantic.mjs";
test("XML export shortcut is removed", () => assert.equal(io.exportDiagram, undefined));
test("stale served/inputXml/facts cannot supply export bytes", async () => {
  const m = await model();
  io.initializeCodecs(config);
  const expected = await outputs(m);
  assert.equal(text(await io.export(m.definitions, "drawio", { inputXml: "stale", touched: false, facts: {}, served: { drawio: { bytes: "stale" } } })), expected.drawio);
});
test("served files cannot bypass unsupported semantics", async () => {
  const m = await model();
  replaceType(m, "Order_complete", "bpmn:InclusiveGateway");
  await refuses(m, "unsupported-element", ["Order_complete"]);
});
test("listDiagrams naming remains available", () => {
  const dom = new JSDOM();
  globalThis.DOMParser = dom.window.DOMParser;
  try {
    assert.deepEqual(io.listDiagrams(fixture("C2")).map((d) => d.name), ["Sales overview", "Quote preparation", "2.1 Credit check", "Archive records"]);
    const unnamed = fixture("C1").replace(/(<bpmndi:BPMNDiagram id="[^"]*") name="[^"]*"/, "$1");
    assert.deepEqual(io.listDiagrams(unnamed), [{ id: "Order_handling_diagram", name: "Order handling" }]);
    const bare = unnamed.replace(/(<bpmn:process id="Order_handling") name="Order handling"/, "$1");
    assert.deepEqual(io.listDiagrams(bare).map((d) => d.name), ["Diagram 1"]);
    const named = bare.replace('<bpmndi:BPMNDiagram id="Order_handling_diagram"', '<bpmndi:BPMNDiagram name="Explicit title" id="Order_handling_diagram"');
    assert.deepEqual(io.listDiagrams(named).map((d) => d.name), ["Explicit title"]);
  } finally { delete globalThis.DOMParser; dom.window.close(); }
});
test("all semantic pages appear in actual formatted output", async () => {
  const m = await model("C2");
  m.definitions.diagrams.reverse();
  const out = await outputs(m);
  const drawio = new JSDOM(out.drawio, { contentType: "application/xml" });
  const sparx = new JSDOM(out.sparx, { contentType: "application/xml" });
  try {
    assert.deepEqual([...drawio.window.document.querySelectorAll("diagram")].map((e) => e.getAttribute("name")), ["Sales overview", "Quote preparation", "2.1 Credit check", "Archive records"]);
    const processes = [...sparx.window.document.getElementsByTagName("bpmn:process")];
    assert.deepEqual(processes.map((e) => e.getAttribute("name")), ["Sales overview", "Quote preparation", "2.1 Credit check", "Archive records"]);
    assert.equal(sparx.window.document.getElementsByTagName("bpmndi:BPMNDiagram").length, 4);
  } finally { drawio.window.close(); sparx.window.close(); }
});
