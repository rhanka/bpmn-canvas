import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptor, fixture, io, model, outputs, refuses, text } from "./helpers/semantic.mjs";
import { validateBpmnXsd } from "./helpers/xsd.mjs";

for (const prefix of ["sem", "alias"]) for (const tag of ["info", "Info"]) for (const attribute of ["order", "sem:order", "alias:order"]) {
  test(`lexical order: ${prefix}:${tag} ${attribute} validates before coercion`, async () => {
    const wire = (value) => fixture("C1")
      .replace('xmlns:sem=', `xmlns:alias="${descriptor.uri}" xmlns:sem=`)
      .replace(/(<bpmn:dataObjectReference id="Order_form"[\s\S]*?)<sem:info[^>]*\/>/, (_, owner) =>
        `${owner}<${prefix}:${tag} ${attribute}="${value}" laneRef="Sales" direction="in" primaryAssociationRef="In_Order_form_Check_order"/>`);
    // A valid spelling must retain the registered reader's behavior and export bytes.
    const valid = await io.parseDefinitions(wire("9876"));
    assert.deepEqual(valid.warnings, []);
    assert.equal(valid.elementsById.Order_form.extensionElements.values[0].order, 9876);
    assert.deepEqual(await outputs({ definitions: valid.rootElement }), { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") });
    for (const value of ["9876junk", "9876.5", "9007199254740992"]) {
      await assert.rejects(() => io.parseDefinitions(wire(value)), (error) => {
        assert.ok(error instanceof io.IoError);
        assert.equal(error.code, "invalid-semantics");
        assert.deepEqual(error.ids, ["Order_form"]);
        return true;
      });
    }
  });
}

test("lexical order resolves scoped aliases and entities without reading comments or foreign attributes", async () => {
  const wire = fixture("C1").replace(/(<bpmn:dataObjectReference id="Order_form"[\s\S]*?)<sem:info[^>]*\/>/, (_, owner) =>
    `${owner}<!-- <sem:Info order="9876junk"/> --><local:Info xmlns:local="${descriptor.uri}" xmlns:other="urn:other" other:order="9876junk" local:order="&#57;876" laneRef="Sales" direction="in" primaryAssociationRef="In_Order_form_Check_order"/>`);
  const parsed = await io.parseDefinitions(wire);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.elementsById.Order_form.extensionElements.values[0].order, 9876);
  await outputs({ definitions: parsed.rootElement });
  await assert.rejects(() => io.parseDefinitions(wire.replace('local:order="&#57;876"', 'local:order="&#57;876junk"')), (e) => e.code === "invalid-semantics" && e.ids.join() === "Order_form");
});

function activityIo(m, type) {
  const task = m.elementsById.Check_order;
  const input = type === "DataInput";
  const endpoint = m.moddle.create(`bpmn:${type}`, { id: "Activity_item" });
  const inputSet = m.moddle.create("bpmn:InputSet", { id: "Activity_inputs", dataInputRefs: input ? [endpoint] : [] });
  const outputSet = m.moddle.create("bpmn:OutputSet", { id: "Activity_outputs", dataOutputRefs: input ? [] : [endpoint] });
  task.ioSpecification = m.moddle.create("bpmn:InputOutputSpecification", { id: "Activity_io", dataInputs: input ? [endpoint] : [], dataOutputs: input ? [] : [endpoint], inputSets: [inputSet], outputSets: [outputSet] });
  if (input) {
    task.dataInputAssociations[0].targetRef = endpoint;
    task.properties = [];
  }
  else {
    // Reuse C1's output relation, its semantic primary reference and its DI.
    const association = m.elementsById.Out_Ship_order_Shipping_note;
    m.elementsById.Ship_order.dataOutputAssociations = [];
    association.sourceRef = [endpoint];
    task.dataOutputAssociations = [association];
  }
  return { task, endpoint, inputSet, outputSet };
}

for (const type of ["DataInput", "DataOutput"]) test(`activity-owned ${type}: valid standard IO round-trips and both exports retain the relation`, async () => {
  const m = await model();
  activityIo(m, type);
  const xml = text(await io.export(m.definitions, "bpmn"));
  assert.deepEqual(await validateBpmnXsd(xml), { valid: true, errors: [] });
  const parsed = await io.parseDefinitions(xml);
  assert.deepEqual(parsed.warnings, []);
  const task = parsed.elementsById.Check_order;
  const association = type === "DataInput" ? task.dataInputAssociations[0] : task.dataOutputAssociations[0];
  assert.equal(type === "DataInput" ? association.targetRef : association.sourceRef[0], parsed.elementsById.Activity_item);
  const out = await outputs({ definitions: parsed.rootElement });
  assert.equal((out.drawio.match(/edge="1"/g) ?? []).length, 9);
  assert.equal((out.sparx.match(/<bpmn:association /g) ?? []).length, 3);
  if (type === "DataInput") assert.deepEqual(out, { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") });
  else assert.match(out.sparx, /sourceRef="Check_order" targetRef="Shipping_note"/);
});

for (const [name, change] of [
  ["missing input set", ({ task }) => { task.ioSpecification.inputSets = []; }],
  ["missing output set", ({ task }) => { task.ioSpecification.outputSets = []; }],
  ["foreign input reference", ({ inputSet }, m) => { inputSet.dataInputRefs = [m.moddle.create("bpmn:DataInput", { id: "Foreign_input" })]; }],
  ["wrong input type", ({ inputSet }, m) => { inputSet.dataInputRefs = [m.elementsById.Order_form]; }],
  ["foreign optional input", ({ inputSet }, m) => { inputSet.optionalInputRefs = [m.moddle.create("bpmn:DataInput", { id: "Foreign_input" })]; }],
  ["foreign executing input", ({ inputSet }, m) => { inputSet.whileExecutingInputRefs = [m.moddle.create("bpmn:DataInput", { id: "Foreign_input" })]; }],
  ["foreign output set", ({ inputSet }, m) => { inputSet.outputSetRefs = [m.moddle.create("bpmn:OutputSet", { id: "Foreign_set" })]; }],
  ["foreign output reference", ({ outputSet }, m) => { outputSet.dataOutputRefs = [m.moddle.create("bpmn:DataOutput", { id: "Foreign_output" })]; }],
  ["foreign optional output", ({ outputSet }, m) => { outputSet.optionalOutputRefs = [m.moddle.create("bpmn:DataOutput", { id: "Foreign_output" })]; }],
  ["foreign executing output", ({ outputSet }, m) => { outputSet.whileExecutingOutputRefs = [m.moddle.create("bpmn:DataOutput", { id: "Foreign_output" })]; }],
  ["foreign input set", ({ outputSet }, m) => { outputSet.inputSetRefs = [m.moddle.create("bpmn:InputSet", { id: "Foreign_set" })]; }],
]) test(`activity IO validates ${name}`, async () => {
  const m = await model();
  const ioSpec = activityIo(m, "DataInput");
  change(ioSpec, m);
  await refuses(m, "invalid-semantics", ["Check_order"]);
});

// 405cc37 PROCESS_CHILDREN: all typed containment outside its whitelist.
for (const [property, type, many] of [
  ["resources", "ResourceRole", true], ["auditing", "Auditing", false], ["monitoring", "Monitoring", false],
  ["ioBinding", "InputOutputBinding", true], ["correlationSubscriptions", "CorrelationSubscription", true],
]) test(`process ${type}: formatted exports refuse with child ID; BPMN preserves it`, async () => {
  const m = await model();
  const child = m.moddle.create(`bpmn:${type}`, type === "InputOutputBinding" ? {} : { id: `Extra_${type}` });
  m.elementsById.Order_handling[property] = many ? [child] : child;
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  assert.deepEqual(parsed.warnings, []);
  const preserved = parsed.elementsById.Order_handling[property];
  assert.equal((many ? preserved[0] : preserved).$type, child.$type);
  await refuses(m, "unsupported-element", [child.id ?? ""]);
  await refuses({ definitions: parsed.rootElement }, "unsupported-element", [child.id ?? ""]);
});

// 405cc37's shape and edge vocabulary checks must also run on DI outside the projection.
test("a drawn DataObject definition refuses instead of disappearing; BPMN keeps its DI", async () => {
  const m = await model();
  const shape = m.moddle.create("bpmndi:BPMNShape", { id: "Extra_shape", bpmnElement: m.elementsById.Order_form_obj, bounds: m.moddle.create("dc:Bounds", { x: 10, y: 10, width: 20, height: 30 }) });
  m.definitions.diagrams[0].plane.planeElement.push(shape);
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  assert.equal(parsed.elementsById.Extra_shape.bpmnElement, parsed.elementsById.Order_form_obj);
  await refuses(m, "unsupported-element", ["Order_form_obj"]);
});
test("an edge for a non-relation refuses instead of disappearing; BPMN keeps its DI", async () => {
  const m = await model();
  m.definitions.diagrams[0].plane.planeElement.push(m.moddle.create("bpmndi:BPMNEdge", { id: "Extra_edge", bpmnElement: m.elementsById.Check_order, waypoint: [m.moddle.create("dc:Point", { x: 0, y: 0 }), m.moddle.create("dc:Point", { x: 1, y: 1 })] }));
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  assert.equal(parsed.elementsById.Extra_edge.bpmnElement, parsed.elementsById.Check_order);
  await refuses(m, "unsupported-element", ["Check_order"]);
});

// Non-attribute references serialize as XML children too; they are not blanket exemptions.
for (const [ownerId, property, type] of [
  ["Order_handling", "supportedInterfaceRef", "Interface"],
  ["Order_handling", "supports", "Process"],
  ["Order_received", "eventDefinitionRef", "MessageEventDefinition"],
  ["Check_order", "categoryValueRef", "CategoryValue"],
]) test(`${ownerId} ${property}: unsupported reference child refuses; BPMN preserves it`, async () => {
  const m = await model();
  const ref = type === "Process" ? m.elementsById.Order_handling : m.moddle.create(`bpmn:${type}`, { id: "Extra_reference" });
  if (type !== "Process") m.definitions.rootElements.push(type === "CategoryValue" ? m.moddle.create("bpmn:Category", { id: "Extra_category", categoryValue: [ref] }) : ref);
  m.elementsById[ownerId][property] = [ref];
  const parsed = await io.parseDefinitions(text(await io.export(m.definitions, "bpmn")));
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.elementsById[ownerId][property][0], parsed.elementsById[ref.id]);
  // The old process reader reports the reference XML child's absent ID, not its target's ID.
  const ids = [ownerId === "Order_handling" ? "" : ownerId];
  await refuses(m, "unsupported-element", ids);
  await refuses({ definitions: parsed.rootElement }, "unsupported-element", ids);
});
for (const ownerId of ["Order_handling", "Check_order"]) test(`${ownerId}: unsupported extensionDefinitions reference refuses`, async () => {
  const m = await model();
  m.elementsById[ownerId].extensionDefinitions = [m.moddle.create("bpmn:ExtensionDefinition")];
  assert.match(text(await io.export(m.definitions, "bpmn")), /<bpmn:extensionDefinitions>/);
  await refuses(m, "unsupported-element", [ownerId === "Order_handling" ? "" : ownerId]);
});
