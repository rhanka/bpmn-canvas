import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { descriptorIndex, validateNativeReferences } from "../dist/profile/native-contracts.js";

const cn = JSON.parse(readFileSync(new URL("../tests/fixtures/lot3-cn/expectations/profile/neutral-cn-descriptors.json", import.meta.url)));
const descriptors = descriptorIndex({ types: cn.types });
const idRefScalars = ["bpmn:CallActivity.calledElement"];

const tree = calledElement => ({
  $type: "bpmn:Definitions",
  id: "Definitions_1",
  targetNamespace: "urn:example:1",
  exporterVersion: "fixture-cn-1",
  rootElements: [{
    $type: "bpmn:Process",
    id: "Process_1",
    flowElements: [{ $type: "bpmn:CallActivity", id: "Call_1", calledElement }],
  }],
});

test("should not refuse an empty calledElement as reference-dangling", () => {
  const before = JSON.stringify(tree(""));
  const index = validateNativeReferences(tree(""), descriptors, idRefScalars);
  assert.ok(index.byId.has("Call_1"));
  assert.equal(JSON.stringify(tree("")), before);
});

test("should still refuse a nonempty dangling calledElement", () => {
  assert.throws(() => validateNativeReferences(tree("Missing_Target"), descriptors, idRefScalars), { code: "reference-dangling" });
});

test("should still refuse a dangling declared reference", () => {
  const node = tree("Process_1");
  node.rootElements[0].flowElements[0].outgoing = ["Missing_Flow"];
  assert.throws(() => validateNativeReferences(node, descriptors, idRefScalars), { code: "reference-dangling" });
});
