import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { replaceType, io, model, info, pages, outputs, refuses } from "./helpers/semantic.mjs";
test("facts API is removed", () => assert.equal(io.readFacts, undefined));
test("live labels, types and lane IDs supply the export", async () => {
  const m = await model();
  m.elementsById.Check_order.name = "Current name";
  const task = replaceType(m, "Request_details", "bpmn:SubProcess");
  m.elementsById.Support.flowNodeRef = m.elementsById.Support.flowNodeRef.filter((e) => e !== task);
  m.elementsById.Sales.flowNodeRef.push(task);
  const out = await outputs(m);
  assert.match(out.drawio, /Current name/);
  assert.match(out.sparx, /Current name/);
  assert.equal(pages(m)[0].nodes.get("Check_order").type, "TASK");
  assert.deepEqual([pages(m)[0].nodes.get(task.id).type, pages(m)[0].nodes.get(task.id).laneIndex], ["SUB-PROCESS", 0]);
  const drawio = new JSDOM(out.drawio, { contentType: "application/xml" });
  const sparx = new JSDOM(out.sparx, { contentType: "application/xml" });
  try {
    const cells = [...drawio.window.document.querySelectorAll("mxCell")];
    const node = cells.find((c) => c.getAttribute("value") === "Request details");
    assert.match(node.getAttribute("style"), /isLoopSub=1;/);
    assert.equal(node.getAttribute("parent"), cells.find((c) => c.getAttribute("value") === "Sales").getAttribute("id"));
    const doc = sparx.window.document;
    const subprocess = [...doc.getElementsByTagName("bpmn:subProcess")].find((e) => e.getAttribute("name") === "Request details");
    assert.ok(subprocess);
    const lane = [...doc.getElementsByTagName("bpmn:lane")].find((e) => e.getAttribute("name") === "Sales");
    assert.ok([...lane.getElementsByTagName("bpmn:flowNodeRef")].some((e) => e.textContent === subprocess.getAttribute("id")));
  } finally { drawio.window.close(); sparx.window.close(); }
});
test("a new unlinked item needs a role and lane", async () => {
  const m = await model();
  const e = m.elementsById.Order_form;
  delete info(e).direction;
  m.elementsById.Check_order.dataInputAssociations = [];
  delete info(e).primaryAssociationRef;
  await refuses(m, "missing-semantics", [e.id]);
});
test("a deleted primary refuses instead of guessing", async () => {
  const m = await model("C4");
  m.elementsById.Prepare.dataOutputAssociations = [];
  await refuses(m, "invalid-semantics", ["Request_file"]);
});
test("DI neighbors cannot supply artifact lane membership", async () => {
  const m = await model();
  delete info(m.elementsById.Order_form).laneRef;
  await refuses(m, "missing-semantics", ["Order_form"]);
});
