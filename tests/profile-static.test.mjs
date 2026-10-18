import { test } from "node:test";
import assert from "node:assert/strict";
import { expectations, readJson } from "./helpers/profile-step3.mjs";
import { checkStaticRule, requiredWrites, checkActionPhase, verifyResourcePins } from "../dist/profile/static-contracts.js";
import { readFileSync } from "node:fs";
import { vendor } from "./helpers/profile-step3.mjs";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

const descriptors = readJson("profile-mechanism/1/neutral-descriptors.json");
const standardRules = Object.keys(readJson("profile-mechanism/1/bpmnlint-11.15.0-recommended.json").rules);
test("should verify injected resource bytes in their raw digest domain before use", async () => {
  const profile = readJson("profile-mechanism/1/neutral-profile.json");
  const bytes = readFileSync(new URL("profile-mechanism/1/neutral-metrics.json", vendor));
  const assets = new Map([[profile.resources[0].assetKey, bytes]]);
  await verifyResourcePins(profile.resources, assets);
  await assert.rejects(() => verifyResourcePins(profile.resources, new Map()), { code: "profile-resource-missing" });
  await assert.rejects(() => verifyResourcePins(profile.resources, new Map([[profile.resources[0].assetKey, Buffer.concat([bytes, Buffer.from("\n")])]])), error => error.code === undefined);
});
for (const v of expectations.filter(v => v.family === "static-rules")) {
  test(`should enforce sealed ${v.caseId}`, async () => {
    const { ruleId, subject, context } = v.inputArtifacts[0].json;
    const before = JSON.stringify(v);
    const expected = v.expectedArtifacts[0].json;
    // Sealed neutral inputs use phase and descriptor/superClass terminology.
    // Translate names only; production descriptorIndex must perform inheritance.
    const runtimeContext = { ...context, descriptors, standardRules };
    if (v.finding === "S3" && Object.hasOwn(context, "phase")) runtimeContext.location = context.phase;
    if (v.finding === "S5") {
      const native = structuredClone(context.descriptor);
      for (const type of Object.values(native.types)) {
        if (Object.hasOwn(type, "superClass")) {
          type.extends = type.superClass;
          delete type.superClass;
        }
      }
      runtimeContext.descriptors = { types: descriptorIndex(native) };
    }
    const run = () => checkStaticRule(ruleId, subject, runtimeContext);
    if (expected.status === "ok") await run();
    else await assert.rejects(run, { code: expected.code });
    assert.equal(JSON.stringify(v), before);
  });
}

const semantic = ["create", "edit", "reference", "complete", "normalize", "convert", "migrate"];
const explicit = ["create", "edit", "reference", "complete", "convert", "migrate"];
const phases = ["create", "edit", "complete", "normalize", "reference", "export", "convert", "migrate"];
const allowed = { bind: phases, refuse: phases, create: explicit, ensure: ["normalize"], set: semantic,
  unset: semantic, assignRef: semantic, reparent: ["edit", "convert", "migrate", "normalize"],
  place: ["normalize"], emit: ["export"], loss: ["export"], remove: ["edit", "convert", "migrate"] };
for (const [op, permitted] of Object.entries(allowed)) for (const phase of phases) {
  test(`should ${permitted.includes(phase) ? "admit" : "refuse"} ${op} in ${phase} at the phase boundary`, () => {
    if (permitted.includes(phase)) checkActionPhase(op, phase);
    else assert.throws(() => checkActionPhase(op, phase), { code: "profile-action-phase" });
  });
}

test("should require both reparent writes and explicit envelope/artifact writes", async () => {
  const step = { op: "reparent", target: "child", parent: "parent", property: "flowElements" };
  const writes = [{ binding: "child", path: "", mode: "reparent" }, { binding: "parent", path: "/flowElements", mode: "reparent" }];
  assert.deepEqual(requiredWrites(step), writes);
  await assert.rejects(() => checkStaticRule("CR-06", { steps: [step], writes: writes.slice(0, 1) }, { phase: "edit" }), { code: "profile-write-set" });
  assert.deepEqual(requiredWrites({ op: "ensure", parent: "p", property: "a/b" }), [
    { binding: "p", path: "/a~1b", mode: "create" }, { binding: "envelope", path: "/bindings", mode: "binding" }
  ]);
  assert.deepEqual(requiredWrites({ op: "emit" }), [{ binding: "self", path: "", mode: "artifact" }]);
});

test("should refuse ID edits, unknown operations and non-scalar create fields", async () => {
  await assert.rejects(() => checkStaticRule("CR-06", {
    steps: [{ op: "set", target: "self", path: "/id", value: { op: "literal", value: "new" } }],
    writes: [{ binding: "self", path: "/id", mode: "set" }]
  }, { phase: "edit" }), { code: "profile-producer" });
  assert.throws(() => requiredWrites({ op: "execute" }), { code: "profile-schema" });
  await assert.rejects(() => checkStaticRule("CR-02", { location: "create.fields", type: "bpmn:Task",
    fields: [{ name: "documentation", value: { op: "literal", value: "x" } }] }, { descriptors }), { code: "profile-type" });
});

test("should type nested values and selectors without accepting unknown bindings", async () => {
  for (const value of [
    { op: "concat", values: [{ op: "read", binding: "absent", path: "/name" }] },
    { op: "case", value: { op: "literal", value: false }, mode: "upper" }
  ]) await assert.rejects(() => checkStaticRule("CR-02", { location: "value", value }, { descriptors, bindings: {} }));
  await assert.rejects(() => checkStaticRule("CR-03", { from: "self", via: "reference", property: "name", order: "id" },
    { descriptors, bindings: { self: "bpmn:Task" } }), { code: "profile-selector-property" });
});
