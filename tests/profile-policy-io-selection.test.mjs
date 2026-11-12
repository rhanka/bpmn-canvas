import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { policyModule } from "./helpers/policy-module.mjs";
import { differences } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const c = JSON.parse(readFileSync(new URL("./fixtures/x24-externalization/expectations/cases/x24-R-006-io-set-selection.json", import.meta.url)));
const module = (await policyModule("src/profiles/{LX-TH-1:ba29297b}/palette.ts")).module;
const updater = Object.values(module).find(value => typeof value === "function" && value.prototype.updateSemanticParent);
function make(type, attrs = {}) {
  const data = { ...attrs };
  return { $type: type, id: attrs.id, $parent: null, get: key => data[key] ??= [], set: (key, value) => { data[key] = value; }, get ioSpecification() { return data.ioSpecification; } };
}
test(`${c.caseId} sealed IO selection`, () => {
  const process = c.inputArtifacts.find(a => a.role === "process").json;
  const actual = c.inputArtifacts.find(a => a.role === "vectors").json.map((vector, index) => {
    const spec = make("bpmn:InputOutputSpecification", Object.fromEntries(Object.entries(process.ioSpecification).map(([key, ids]) => [key, ids.map(id => make(key === "inputSets" ? "bpmn:InputSet" : "bpmn:OutputSet", { id }))])));
    const owner = make("bpmn:Process", { ioSpecification: spec }); spec.$parent = owner;
    const item = make(vector.type, { id: `Port_${index}` });
    const selection = vector.inputSet ?? vector.outputSet;
    const config = { ioSetSelections: selection ? { [item.id]: selection } : {} };
    const instance = new updater({}, { create: type => make(type) }, {}, config);
    try {
      instance.updateSemanticParent(item, owner, null);
      const input = vector.type === "bpmn:DataInput";
      const set = spec.get(input ? "inputSets" : "outputSets").find(set => set.get(input ? "dataInputRefs" : "dataOutputRefs").includes(item));
      return { status: "ok", [input ? "inputSet" : "outputSet"]: set?.id };
    } catch (error) { return { status: "refused", code: error.code }; }
  });
  assert.deepEqual(differences(actual, c.expectedArtifacts[0].json), []);
});
