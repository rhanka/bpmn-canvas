import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = process.env.ANNOTATED_DIST ?? `${root}dist`;

// palette.js imports bpmn-js internals, which Node cannot load as ESM (extensionless
// internal imports). Stub the two imports so the data and the updater logic run in Node.
// Real bpmn-js behaviour is covered by the browser smoke.
const stubbed = readFileSync(`${dist}/presentation/annotated/palette.js`, "utf8")
  .replace(/import BpmnUpdater from "[^"]+";/, "class BpmnUpdater { static $inject = ['eventBus','bpmnFactory','connectionDocking']; updateSemanticParent() { globalThis.__upstreamCalled = true; } }")
  .replace(/import \{ is \} from "[^"]+";/, "const is = (el, type) => el?.$type === type;")
  .replace(/from "(\.\.?\/[^"]+)";/g, (_, spec) => `from "${new URL(spec, pathToFileURL(`${dist}/presentation/annotated/palette.js`)).href}";`);
const palette = await import(`data:text/javascript;base64,${Buffer.from(stubbed).toString("base64")}`);
const index = await import(pathToFileURL(`${dist}/presentation/annotated/tokens.js`).href);

// Minimal moddle-like objects.
const make = (type, props = {}) => {
  const data = { ...props };
  return {
    $type: type,
    $parent: null,
    get: (k) => (data[k] ??= []),
    set: (k, v) => { data[k] = v; },
    get ioSpecification() { return data.ioSpecification; },
    set ioSpecification(v) { data.ioSpecification = v; },
  };
};
const bpmnFactory = { create: (type) => make(type) };

test("the updater is a per-instance service, not a prototype patch", () => {
  const mod = palette.AnnotatedPaletteModule;
  assert.deepEqual(mod.bpmnUpdater[0], "type");
  assert.equal(mod.bpmnUpdater[1], palette.AnnotatedBpmnUpdater);
  assert.deepEqual(palette.AnnotatedBpmnUpdater.$inject, ["eventBus", "bpmnFactory", "connectionDocking", "config.bpmnCanvas"]);
});

test("DataInput creation builds an ioSpecification WITH inputSet and outputSet (O12)", () => {
  const updater = new palette.AnnotatedBpmnUpdater({}, bpmnFactory, {}, {});
  const proc = make("bpmn:Process");
  const input = make("bpmn:DataInput");
  updater.updateSemanticParent(input, proc, null);
  const spec = proc.ioSpecification;
  assert.equal(spec.$type, "bpmn:InputOutputSpecification");
  assert.equal(spec.$parent, proc);
  assert.equal(spec.get("inputSets").length, 1, "inputSet present");
  assert.equal(spec.get("outputSets").length, 1, "outputSet present");
  assert.deepEqual(spec.get("dataInputs"), [input]);
  assert.equal(input.$parent, spec);
  assert.deepEqual(spec.get("inputSets")[0].get("dataInputRefs"), [input], "item belongs to a set");

  const output = make("bpmn:DataOutput");
  updater.updateSemanticParent(output, proc, null);
  assert.deepEqual(spec.get("dataOutputs"), [output]);
  assert.deepEqual(spec.get("outputSets")[0].get("dataOutputRefs"), [output]);
  assert.equal(spec.get("inputSets").length, 1, "sets are not duplicated");
});

test("DataInput removal detaches it from the set and the spec (undo of a create)", () => {
  const updater = new palette.AnnotatedBpmnUpdater({}, bpmnFactory, {}, {});
  const proc = make("bpmn:Process");
  const input = make("bpmn:DataInput");
  updater.updateSemanticParent(input, proc, null);
  const spec = proc.ioSpecification;
  updater.updateSemanticParent(input, null, null);
  assert.deepEqual(spec.get("dataInputs"), []);
  assert.deepEqual(spec.get("inputSets")[0].get("dataInputRefs"), []);
  assert.equal(input.$parent, null);
});

test("a participant target resolves to its process", () => {
  const updater = new palette.AnnotatedBpmnUpdater({}, bpmnFactory, {}, {});
  const proc = make("bpmn:Process");
  const participant = make("bpmn:Participant", { processRef: proc });
  participant.processRef = proc;
  const out = make("bpmn:DataOutput");
  updater.updateSemanticParent(out, participant, null);
  assert.deepEqual(proc.ioSpecification.get("dataOutputs"), [out]);
});

test("other types are delegated to upstream", () => {
  delete globalThis.__upstreamCalled;
  const updater = new palette.AnnotatedBpmnUpdater({}, bpmnFactory, {}, {});
  updater.updateSemanticParent(make("bpmn:Task"), make("bpmn:Process"), null);
  assert.equal(globalThis.__upstreamCalled, true);
});
