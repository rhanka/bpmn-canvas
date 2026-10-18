import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, info, io, model, outputs, refuses, text } from "./helpers/semantic.mjs";
import { artifactPlacements, associationEndpoints, detachEndpoint, moveArtifacts } from "./helpers/review-4.mjs";
import { validateBpmnXsd } from "./helpers/xsd.mjs";

const golden = { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") };
for (const [name, ids] of artifactPlacements) {
  test(`Collaboration ${name}: XSD-valid placement parses and retains both goldens`, async () => {
    const m = await model(); moveArtifacts(m, ids);
    const xml = text(await io.export(m.definitions, "bpmn"));
    assert.deepEqual(await validateBpmnXsd(xml), { valid: true, errors: [] });
    const parsed = await io.parseDefinitions(xml);
    assert.deepEqual(parsed.warnings, []);
    for (const id of ids) assert.ok(parsed.elementsById.Order_handling_collab.artifacts.includes(parsed.elementsById[id]));
    assert.equal(info(parsed.elementsById.Doc_Shipping_policy).laneRef, parsed.elementsById.Sales);
    assert.equal(parsed.elementsById.DocLink_Shipping_policy_Ship_order.sourceRef, parsed.elementsById.Doc_Shipping_policy);
    assert.equal(parsed.elementsById.Doc_Shipping_policy_di.bpmnElement, parsed.elementsById.Doc_Shipping_policy);
    assert.deepEqual(await outputs({ definitions: parsed.rootElement }), golden);
  });
  for (const format of ["drawio", "sparx"]) test(`Collaboration ${name}: direct ${format} equals unchanged golden`, async () => {
    const m = await model(); moveArtifacts(m, ids);
    assert.equal((await outputs(m))[format], golden[format]);
  });
}
for (const [name, associationId, field] of associationEndpoints) for (const format of ["drawio", "sparx"]) test(`detached same-ID ${name}: ${format} refuses before consuming the endpoint`, async () => {
  const m = await model(), canonical = detachEndpoint(m, associationId, field);
  assert.equal(m.elementsById[canonical.id], canonical);
  assert.notEqual(m.elementsById[associationId][field], canonical);
  await assert.rejects(() => io.export(m.definitions, format), (e) => {
    assert.ok(e instanceof io.IoError);
    assert.equal(e.code, "invalid-semantics");
    assert.deepEqual(e.ids, [associationId]);
    return true;
  });
});
for (const operation of ["parse", "drawio", "sparx"]) test(`Collaboration artifact ownership: ${operation} refuses multiple participants with a typed code`, async () => {
  const m = await model(); moveArtifacts(m, ["Doc_Shipping_policy"]);
  m.elementsById.Order_handling_collab.participants.push(m.moddle.create("bpmn:Participant", { id: "Second_pool", processRef: m.elementsById.Order_handling }));
  await assert.rejects(() => operation === "parse" ? io.export(m.definitions, "bpmn").then((xml) => io.parseDefinitions(text(xml))) : io.export(m.definitions, operation),
    (e) => e instanceof io.IoError && e.code === "multiple-participants" && e.ids.join() === "Order_handling_pool,Second_pool");
});
for (const id of ["Doc_Shipping_policy", "DocLink_Shipping_policy_Ship_order"]) test(`Collaboration ${id}: process-wide duplicate order refuses on parse and export`, async () => {
  const m = await model(); moveArtifacts(m, [id]);
  info(m.elementsById[id]).order = info(m.elementsById.Order_received).order;
  const xml = text(await io.export(m.definitions, "bpmn"));
  await assert.rejects(() => io.parseDefinitions(xml), (e) => e instanceof io.IoError && e.code === "invalid-semantics");
  // Root containment order determines which duplicate is encountered second.
  await refuses(m, "invalid-semantics", ["Order_received"]);
});
