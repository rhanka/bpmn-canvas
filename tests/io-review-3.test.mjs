import { test } from "node:test";
import assert from "node:assert/strict";
import { config, descriptor, fixture, io, model, outputs, refuses, text } from "./helpers/semantic.mjs";
import { choreographyXml, namespaceCases, splitIo } from "./helpers/review-3.mjs";
import { validateBpmnXsd } from "./helpers/xsd.mjs";
io.initializeCodecs(config);

test("mixed Process/Choreography: refuse the unsupported page; BPMN preserves its participants, flow and DI", async () => {
  const xml = await choreographyXml();
  assert.deepEqual(await validateBpmnXsd(xml), { valid: true, errors: [] });
  const parsed = await io.parseDefinitions(xml);
  assert.deepEqual(parsed.warnings, []);
  const preserved = await io.parseDefinitions(text(await io.export(parsed.rootElement, "bpmn")));
  assert.equal(preserved.elementsById.Exchange_page.$type, "bpmn:Choreography");
  assert.deepEqual(preserved.elementsById.Exchange_page.participants.map((p) => p.id), ["Exchange_A", "Exchange_B"]);
  assert.equal(preserved.elementsById.Exchange_message.sourceRef, preserved.elementsById.Exchange_A);
  assert.equal(preserved.elementsById.Exchange_plane.bpmnElement, preserved.elementsById.Exchange_page);
  assert.equal(preserved.elementsById.Exchange_message_di.bpmnElement, preserved.elementsById.Exchange_message);
  await refuses({ definitions: parsed.rootElement }, "unsupported-element", ["Exchange_page"]);
  await refuses({ definitions: preserved.rootElement }, "unsupported-element", ["Exchange_page"]);
});

for (const direction of ["Input", "Output"]) for (const ownerId of ["Check_order", "Order_handling"]) {
  for (const field of [`optional${direction}Refs`, `whileExecuting${direction}Refs`, "omitted membership"]) test(`${ownerId} ${direction}: reject ${field} outside its own set on parse and export`, async () => {
    const m = await model();
    const { setA, setB, b, membership } = splitIo(m, direction, ownerId);
    if (field === "omitted membership") setB[membership] = [];
    else setA[field] = [b];
    const xml = text(await io.export(m.definitions, "bpmn"));
    assert.deepEqual(await validateBpmnXsd(xml), { valid: true, errors: [] });
    await assert.rejects(() => io.parseDefinitions(xml), (e) => e instanceof io.IoError && e.code === "invalid-semantics" && e.ids.join() === ownerId);
    await refuses(m, "invalid-semantics", [ownerId]);
  });
}
for (const direction of ["Input", "Output"]) test(`valid activity ${direction}: subsets and complete multi-set coverage retain every relation`, async () => {
  const m = await model();
  const { setA, setB, a, b } = splitIo(m, direction);
  setA[`optional${direction}Refs`] = [a];
  setB[`whileExecuting${direction}Refs`] = [b];
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  assert.deepEqual(parsed.warnings, []);
  const out = await outputs({ definitions: parsed.rootElement });
  assert.equal((out.drawio.match(/edge="1"/g) ?? []).length, direction === "Input" ? 10 : 11);
  assert.notEqual(out.drawio, fixture("C1", "expected.drawio"));
});

for (const [name, xml] of namespaceCases) test(`resolved namespaces: ${name} keeps C1 goldens`, async () => {
  const parsed = await io.parseDefinitions(xml);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.elementsById.Order_received.extensionElements.values[0].$type, "sem:Info");
  assert.deepEqual(await outputs({ definitions: parsed.rootElement }), { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") });
});
for (const tag of ["info", "Info"]) test(`resolved namespaces: an actual scoped unknown ${tag} refuses with owner ID`, async () => {
  const xml = fixture("C1").replace('<sem:info order="0"', `<future:${tag} xmlns:future="${descriptor.uri.replace(/1$/, "2")}" order="0"`);
  await assert.rejects(() => io.parseDefinitions(xml), (e) => e instanceof io.IoError && e.code === "unknown-semantics-version" && e.ids.join() === "Order_received");
});

for (const [ownerId, property, type] of [
  ["Flow_Order_received_Check_order", "conditionExpression", "FormalExpression"],
  ["In_Order_form_Check_order", "transformation", "FormalExpression"],
  ["In_Order_form_Check_order", "assignment", "Assignment"],
  ["Order_form_obj", "dataState", "DataState"],
  ["Order_handling_pool", "participantMultiplicity", "ParticipantMultiplicity"],
  ["Sales", "partitionElement", "Property"],
  ["Order_received", "eventDefinitions", "MessageEventDefinition"],
  ["Order_handling_lanes", "documentation", "Documentation"],
]) test(`closed world: ${ownerId}.${property} refuses with child ID and survives BPMN`, async () => {
  const m = await model();
  const child = m.moddle.create(`bpmn:${type}`, { id: "Unconsumed_child" });
  const p = m.elementsById[ownerId].$descriptor.properties.find((p) => p.name === property);
  m.elementsById[ownerId][property] = p.isMany ? [child] : child;
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  const value = parsed.elementsById[ownerId][property];
  assert.equal((p.isMany ? value[0] : value).$type, child.$type);
  await refuses(m, "unsupported-element", [child.id ?? ""]);
  await refuses({ definitions: parsed.rootElement }, "unsupported-element", [child.id ?? ""]);
});
test("closed world: generic nested extension content survives BPMN and refuses with its ID", async () => {
  const xml = fixture("C1").replace('<sem:info order="0" />', '<sem:info order="0" /><extra:envelope xmlns:extra="urn:extra" id="Opaque_extension"><extra:child id="Opaque_child"/></extra:envelope>');
  const parsed = await io.parseDefinitions(xml);
  assert.match(text(await io.export(parsed.rootElement, "bpmn")), /Opaque_child/);
  await refuses({ definitions: parsed.rootElement }, "unsupported-element", ["Opaque_extension"]);
});
for (const type of ["DataObject", "Property"]) test(`closed world: unreferenced ${type} declaration refuses with its ID`, async () => {
  const m = await model();
  const child = m.moddle.create(`bpmn:${type}`, { id: "Unused_declaration" });
  if (type === "DataObject") m.elementsById.Order_handling.flowElements.push(child);
  else m.elementsById.Check_order.properties.push(child);
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  assert.ok(parsed.elementsById.Unused_declaration);
  await refuses(m, "unsupported-element", [child.id]);
});
