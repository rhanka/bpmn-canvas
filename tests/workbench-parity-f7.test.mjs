import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serializeBpmn } from "../dist/io/index.js";
import { freeze, snapshot } from "./helpers/workbench.mjs";
import { corpus, load, index, config, model, nativeFixture } from "./helpers/workbench-parity.mjs";
import { xmlDocument, xmlStructure, xmlText } from "./helpers/workbench-xml.mjs";

function readerEvidence(parsed, name) {
  assert.deepEqual(parsed.warnings.map(w => ({ message: w.message, id: w.element?.id, property: w.property, value: w.value })), name === "W06" ? [{ message: "unknown attribute <inventedNote>", id: "Task_Review", property: "inventedNote", value: '01 & "é"' }] : []);
  if (name === "W06") assert.equal(parsed.elementsById.Task_Review.$attrs.inventedNote, '01 & "é"');
}

for (const name of index.validF7) for (const [option, options] of config.xmlOptions.entries()) test(`G2 Python/JS parity ${name}/${option}: XML and mixed parse/write fixed point`, async () => {
  const expectedBytes = readFileSync(new URL(`expected/${name}.bpmn`, corpus)), expected = xmlStructure(xmlDocument(expectedBytes));
  const m = model(), root = freeze(nativeFixture(load(`cases/${name}.json`), m)), before = snapshot(root);
  let first;
  for (let repeat = 0; repeat < config.repeatCount; repeat++) {
    const output = await serializeBpmn(root, options);
    assert.deepEqual(xmlStructure(xmlDocument(output)), expected);
    if (first) assert.deepEqual(output, first); first = output;
    const parsed = await m.fromXML(xmlText(output)); readerEvidence(parsed, name);
    const once = await serializeBpmn(parsed.rootElement, options);
    const again = await m.fromXML(xmlText(once)); readerEvidence(again, name);
    assert.deepEqual(await serializeBpmn(again.rootElement, options), once);
    assert.deepEqual(xmlStructure(xmlDocument(once)), expected);
    const pythonParsed = await m.fromXML(xmlText(expectedBytes)); readerEvidence(pythonParsed, name);
    const mixed = await serializeBpmn(pythonParsed.rootElement, options);
    assert.deepEqual(xmlStructure(xmlDocument(mixed)), expected);
    assert.deepEqual(await serializeBpmn((await m.fromXML(xmlText(mixed))).rootElement, options), mixed);
    assert.equal(snapshot(root), before);
  }
});
