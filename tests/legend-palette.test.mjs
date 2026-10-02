import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = process.env.LEGEND_DIST ?? `${root}dist`;

// palette.js imports bpmn-js internals, which Node cannot load as ESM (extensionless
// internal imports). Stub the two imports so the data and the updater logic run in Node.
// Real bpmn-js behaviour is covered by the browser smoke.
const stubbed = readFileSync(`${dist}/profiles/legend/palette.js`, "utf8")
  .replace(/import BpmnUpdater from "[^"]+";/, "class BpmnUpdater { static $inject = ['eventBus','bpmnFactory','connectionDocking']; updateSemanticParent() { globalThis.__upstreamCalled = true; } }")
  .replace(/import \{ is \} from "[^"]+";/, "const is = (el, type) => el?.$type === type;");
const palette = await import(`data:text/javascript;base64,${Buffer.from(stubbed).toString("base64")}`);
const index = await import(pathToFileURL(`${dist}/profiles/legend/tokens.js`).href);

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

test("palette entries: unique ids, an icon each, create-flow metadata", () => {
  const ids = palette.PALETTE_ENTRIES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(id.startsWith("legend."), id);
    assert.ok(palette.PALETTE_ICONS[id], `${id} has an icon`);
  }
  const byId = Object.fromEntries(palette.PALETTE_ENTRIES.map((e) => [e.id, e]));
  assert.equal(byId["legend.external-input"].bpmnType, "bpmn:DataInput");
  assert.equal(byId["legend.process-output"].bpmnType, "bpmn:DataOutput");
  assert.equal(byId["legend.document"].preset.text, "[Doc] ");
  assert.equal(byId["legend.application"].preset.text, "[App] ");
  assert.equal(byId["legend.sequence-flow"].tool, "connect");
  assert.equal(byId["legend.subprocess"].preset.collapsed, true);
});

test("the updater is a per-instance service, not a prototype patch", () => {
  const mod = palette.LegendPaletteModule;
  assert.deepEqual(mod.bpmnUpdater[0], "type");
  assert.equal(mod.bpmnUpdater[1], palette.LegendBpmnUpdater);
  assert.deepEqual(palette.LegendBpmnUpdater.$inject, ["eventBus", "bpmnFactory", "connectionDocking"]);
});

test("DataInput creation builds an ioSpecification WITH inputSet and outputSet (O12)", () => {
  const updater = new palette.LegendBpmnUpdater({}, bpmnFactory, {});
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
  const updater = new palette.LegendBpmnUpdater({}, bpmnFactory, {});
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
  const updater = new palette.LegendBpmnUpdater({}, bpmnFactory, {});
  const proc = make("bpmn:Process");
  const participant = make("bpmn:Participant", { processRef: proc });
  participant.processRef = proc;
  const out = make("bpmn:DataOutput");
  updater.updateSemanticParent(out, participant, null);
  assert.deepEqual(proc.ioSpecification.get("dataOutputs"), [out]);
});

test("other types are delegated to upstream", () => {
  delete globalThis.__upstreamCalled;
  const updater = new palette.LegendBpmnUpdater({}, bpmnFactory, {});
  updater.updateSemanticParent(make("bpmn:Task"), make("bpmn:Process"), null);
  assert.equal(globalThis.__upstreamCalled, true);
});

test("exported action ids are exactly the palette entry ids, stable and prefixed", () => {
  assert.deepEqual([...palette.LEGEND_ACTION_IDS], palette.PALETTE_ENTRIES.map((e) => e.id));
  assert.ok(Object.isFrozen(palette.LEGEND_ACTION_IDS));
  assert.equal(palette.LEGEND_ACTION_IDS.length, 16);
});

test("tokens module is independent of bpmn-js and neutral", () => {
  assert.equal(index.DEFAULT_LEGEND_TOKENS.fill, "#ffffff");
});
