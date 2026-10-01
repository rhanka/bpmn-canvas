import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateBpmnXsd } from "./helpers/xsd.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const list = (dir, suffix) =>
  readdirSync(root + dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => [`${dir}/${f}`, readFileSync(`${root}${dir}/${f}`, "utf8")]);

const NS =
  'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
const doc = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions ${NS} id="D" targetNamespace="http://example.org/t">${body}</bpmn:definitions>`;

const corpus = list("experiments/e3/corpus", ".bpmn");
const saved = list("tests/fixtures/e3-saved", ".saved.bpmn");

test("corpus and saved fixtures are all found", () => {
  assert.equal(corpus.length, 4);
  assert.equal(saved.length, 4);
});

for (const [name, xml] of [...corpus, ...saved]) {
  test(`XSD valid: ${name}`, async () => {
    const r = await validateBpmnXsd(xml);
    assert.deepEqual(r.errors, []);
    assert.equal(r.valid, true);
  });
}

test("XSD rejects a sequenceFlow without sourceRef", async () => {
  const r = await validateBpmnXsd(
    doc('<bpmn:process id="P"><bpmn:task id="T"/><bpmn:sequenceFlow id="F" targetRef="T"/></bpmn:process>'),
  );
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
});

test("XSD rejects an unknown element", async () => {
  const r = await validateBpmnXsd(doc('<bpmn:process id="P"><bpmn:notATask id="T"/></bpmn:process>'));
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
});

const io = (sets) =>
  doc(
    `<bpmn:process id="P"><bpmn:ioSpecification><bpmn:dataInput id="DI1"/>${sets}</bpmn:ioSpecification><bpmn:task id="T"/></bpmn:process>`,
  );

test("O12: ioSpecification without inputSet/outputSet is rejected", async () => {
  const r = await validateBpmnXsd(io(""));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /inputSet|outputSet/.test(e)), r.errors.join("\n"));
});

test("O12: ioSpecification with inputSet and outputSet is valid", async () => {
  const r = await validateBpmnXsd(
    io("<bpmn:inputSet><bpmn:dataInputRefs>DI1</bpmn:dataInputRefs></bpmn:inputSet><bpmn:outputSet/>"),
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
});
