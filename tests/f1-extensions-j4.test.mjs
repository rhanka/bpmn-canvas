import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as io from "../dist/io/index.js";
import { configuration } from "./helpers/workbench.mjs";
import { loadSealedVectors, runSealedVector } from "./helpers/f1-sealed.mjs";

const empty = { contractVersion: "1", defaults: "explicit", descriptors: {} };
const options = { format: false, preamble: false };
const doc = (child) => ({ $type: "bpmn:Definitions", id: "D", rootElements: [{ $type: "bpmn:Process", id: "P", ...child }] });
const generic = () => doc({ extensionElements: { $type: "bpmn:ExtensionElements", values: [{ $type: "$any", $name: { qname: "x:note", uri: "urn:example:x" }, $attrs: {} }] } });
const note = (model) => model.rootElements[0].extensionElements.values[0];
const xml = (body) => `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="urn:example:x" id="D" targetNamespace="urn:example:target"><bpmn:process id="P">${body}</bpmn:process></bpmn:definitions>`;
const tuple = (d) => ({ code: d.code, path: d.path, target: d.target });

for (const entity of ["foo_bar", "a.b", "é", "a:b", "nbsp"]) {
  test(`microfix #21 should locate unsupported entity &${entity}; at its public XML boundary`, async () => {
    const source = xml("").replace('<bpmn:process id="P">', `<bpmn:process id="P" name="&${entity};">`);
    await assert.rejects(io.parseF1Xml(source, empty), error => {
      assert.equal(error.code, "xml-entity-reference-unsupported");
      assert.equal(error.diagnostic.path, "/rootElements/0/name");
      assert.deepEqual(error.ids, ["P"]);
      return true;
    });
  });
}

for (const entity of ["#12a", "#x", "#", "#xZZ"]) {
  test(`microfix numeric rule should locate malformed reference &${entity}; at its public XML boundary`, async () => {
    const source = xml("").replace('<bpmn:process id="P">', `<bpmn:process id="P" name="&${entity};">`);
    await assert.rejects(io.parseF1Xml(source, empty), error => {
      assert.equal(error.code, "xml-entity-reference-unsupported");
      assert.equal(error.diagnostic.path, "/rootElements/0/name");
      assert.deepEqual(error.ids, ["P"]);
      return true;
    });
  });
}

test("J4 #13 should accept an empty injected extension map across F1 boundaries", async () => {
  assert.equal(io.hydrate({ $type: "bpmn:Definitions" }, empty).$type, "bpmn:Definitions");
  const model = io.hydrate(doc({}), empty);
  assert.equal(io.project(model, empty).rootElements[0].id, "P");
  assert.deepEqual((await io.parseF1Xml(xml(""), empty)).diagnostics, []);
});

test("J4 #13 should derive collection multiplicity from descriptors", () => {
  const input = doc({ extensionElements: { $type: "bpmn:ExtensionElements", values: [{ $type: "sem:Info" }, { $type: "sem:Info" }] } });
  assert.equal(io.project(io.hydrate(input, configuration), configuration).rootElements[0].extensionElements.values.length, 2);
});

for (const drift of ["uri", "inheritance", "xml"]) test(`J4 #14 should refuse effective descriptor ${drift} drift`, () => {
  const descriptor = { name: "Example", prefix: "ex", uri: "urn:example:a", types: [{ name: "Empty", superClass: ["Element"] }] };
  const a = { ...configuration, descriptors: { ...configuration.descriptors, ex: descriptor } };
  const model = io.hydrate(doc({ extensionElements: { $type: "bpmn:ExtensionElements", values: [{ $type: "ex:Empty" }] } }), a);
  const changed = structuredClone(descriptor);
  if (drift === "uri") changed.uri = "urn:example:b";
  if (drift === "inheritance") changed.types[0].superClass = [];
  if (drift === "xml") changed.xml = { tagAlias: "lowerCase", typePrefix: "t" };
  const b = { ...a, descriptors: { ...a.descriptors, ex: changed } };
  assert.throws(() => io.project(model, b), (e) => e.code === "descriptor-mismatch");
  assert.equal(io.project(model, a).rootElements[0].extensionElements.values[0].$type, "ex:Empty");
});

for (const key of ["a.b", "a~b", "a/b", "a[0]"]) test(`J4 #21 should preserve attribute pointer segment ${key}`, () => {
  const input = doc({ $attrs: { [key]: 7 } });
  assert.throws(() => io.hydrate(input, configuration), (e) => {
    assert.equal(e.diagnostic.path, `/rootElements/0/$attrs/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`);
    assert.deepEqual(e.ids, ["P"]);
    return true;
  });
});

test("J4 #21 should retain ancestor targets for primitive failures", () => {
  assert.throws(() => io.hydrate(doc({ documentation: [{ $type: "bpmn:Documentation", text: 7 }] }), configuration), (e) => {
    assert.equal(e.diagnostic.path, "/rootElements/0/documentation/0/text");
    assert.deepEqual(e.ids, ["P"]);
    return true;
  });
});
test("J4 #21 should locate F7 geometry failures with an ancestor target", async () => {
  const model = io.hydrate({ $type: "bpmn:Definitions", id: "D", diagrams: [{ $type: "bpmndi:BPMNDiagram", id: "Diagram", plane: { $type: "bpmndi:BPMNPlane", id: "Plane", planeElement: [{ $type: "bpmndi:BPMNShape", id: "Shape", bounds: { $type: "dc:Bounds", x: 0, y: 0, width: 10, height: 10 } }] } }] }, configuration);
  model.diagrams[0].plane.planeElement[0].bounds.width = NaN;
  await assert.rejects(io.serializeBpmn(model, options), (e) => {
    assert.equal(e.diagnostic?.path, "/diagrams/0/plane/planeElement/0/bounds/width");
    assert.deepEqual(e.ids, ["Shape"]);
    return true;
  });
});

test("J4 #21 should preserve ancestor targets on native warnings", async () => {
  const parsed = await io.parseF1Xml(xml('<bpmn:documentation w="q">hello</bpmn:documentation>'), configuration);
  assert.deepEqual(parsed.diagnostics.map(tuple), [{ code: "moddle-warning", path: "/rootElements/0/documentation/0/$attrs/w", target: "P" }]);
});

const coordinateIds = /^(reserved-xml-|entity-mixed-case-refused|entity-unknown-nbsp-refused|numeric-hex-supplementary-truncated|numeric-decimal-supplementary-truncated|numeric-nul|numeric-lone-surrogate)/;
for (const { vector } of loadSealedVectors().filter(({ vector }) => coordinateIds.test(vector.caseId))) {
  test(`J4 #21 should satisfy sealed coordinates for ${vector.caseId}`, async () => {
    const result = await runSealedVector(vector, { ...io, configuration, freeze: (v) => v });
    const actual = result.status === "refused" ? [{ code: result.code, pointer: result.pointer }] : result.diagnostics;
    assert.deepEqual(actual, vector.expected.diagnostics, vector.caseId);
  });
}

test("J4 #22 should refuse misplaced reserved typed fields with reserved-name", () => {
  assert.throws(() => io.hydrate(doc({ $parent: "D" }), configuration), (e) => e.code === "reserved-name");
});
for (const key of ["get", "set"]) test(`J4 #22 should refuse own generic ${key} in project and F7`, async () => {
  const model = io.hydrate(generic(), configuration);
  note(model)[key] = "foreign";
  assert.throws(() => io.project(model, configuration), (e) => e.code === "reserved-name");
  await assert.rejects(io.serializeBpmn(model, options), (e) => e.code === "reserved-name");
});

test("J4 #22 should enforce every independently sealed reserved name", async () => {
  const { names } = JSON.parse(readFileSync(new URL("./fixtures/f1-extensions/expectations/reserved-names.json", import.meta.url)));
  for (const name of names) {
    assert.throws(() => io.hydrate(doc({ $attrs: { [name]: "foreign" } }), configuration), (e) => e.code === "reserved-name", name);
    if (["$type", "$attrs", "$body", "$children", "$parent", "$descriptor", "$model", "$instanceOf"].includes(name)) continue;
    const model = io.hydrate(generic(), configuration);
    Object.defineProperty(note(model), name, { value: "foreign", enumerable: true, configurable: true });
    assert.throws(() => io.project(model, configuration), (e) => e.code === "reserved-name", name);
    await assert.rejects(io.serializeBpmn(model, options), (e) => e.code === "reserved-name", name);
  }
});

test("J4 #23 should expose mixed content loss at the XML boundary", async () => {
  const parsed = await io.parseF1Xml(xml('<bpmn:extensionElements><x:note>hello<x:child/>world</x:note></bpmn:extensionElements>'), configuration);
  assert.deepEqual(parsed.diagnostics.map(tuple), [{ code: "moddle-content-normalized", path: "/rootElements/0/extensionElements/values/0", target: "P" }]);
  assert.equal(note(parsed.rootElement).$body, "helloworld");
});
test("J4 #23 should expose native integer coercion without changing the value", async () => {
  const parsed = await io.parseF1Xml(xml('<bpmn:task id="T" completionQuantity="1.5"/>'), configuration);
  assert.equal(parsed.rootElement.rootElements[0].flowElements[0].completionQuantity, 1);
  assert.deepEqual(parsed.diagnostics.map(tuple), [{ code: "moddle-content-normalized", path: "/rootElements/0/flowElements/0/completionQuantity", target: "T" }]);
});
test("J4 #23 should refuse an unbound foreign writer attribute before writing", async () => {
  const model = io.hydrate(doc({ $attrs: { "ghost:level": "high" } }), configuration);
  await assert.rejects(io.serializeBpmn(model, options), (e) => e.code === "unbound-prefix");
});
test("J4 #23 should preserve upstream prefix-loss bytes and expose a diagnostic", async () => {
  const model = io.hydrate(generic(), configuration);
  note(model)["x:level"] = "high";
  const native = new TextEncoder().encode((await model.$model.toXML(model, options)).xml);
  const result = io.serializeBpmnWithDiagnostics ? await io.serializeBpmnWithDiagnostics(model, options) : { bytes: await io.serializeBpmn(model, options), diagnostics: [] };
  assert.deepEqual(result.bytes, native);
  assert.deepEqual(result.diagnostics.map(tuple), [{ code: "moddle-content-normalized", path: "/rootElements/0/extensionElements/values/0/$attrs/x:level", target: "P" }]);
});

test("J4 #23 should adapt normalization to Report/2 with exact presence and source", async () => {
  const parsed = await io.parseF1Xml(xml('<bpmn:task id="T" completionQuantity="1.5"/>'), empty);
  const entry = io.f1DiagnosticEntry(parsed.diagnostics[0], {
    stage: "import", sourceDomain: "tree", lossClass: "metadata",
    beforePresent: true, before: "1.5", afterPresent: true, after: 1,
    originalType: "bpmn:Task", property: "completionQuantity",
  });
  assert.deepEqual(entry.source, { domain: "tree", pointer: "/rootElements/0/flowElements/0/completionQuantity", targetId: "T", provenance: "exact" });
  assert.equal(entry.legacyCode, "moddle-content-normalized");
  assert.equal(entry.lossClass, "metadata");
  assert.equal(entry.beforePresent, true);
  assert.equal(entry.before, "1.5");
  assert.equal(entry.afterPresent, true);
  assert.equal(entry.after, 1);
});
