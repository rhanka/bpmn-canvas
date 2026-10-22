import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSchema } from "../dist/profile/contracts.js";
import { semanticRevision, validateEnvelope } from "../dist/profile/envelope.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

const schema = JSON.parse(readFileSync(new URL("../schemas/profile/document-envelope-1.schema.json", import.meta.url)));
const syntax = await compileSchema(schema);
const cnDescriptors = JSON.parse(readFileSync(new URL("../tests/fixtures/lot3-cn/expectations/profile/neutral-cn-descriptors.json", import.meta.url)));

const identity = {
  mechanismVersion: "1",
  schemaVersion: "1.0.0",
  profile: "neutral-cn/1",
  version: "1.1.0",
  sha256: "0".repeat(64),
  base: { id: "neutral-cn-base/1", version: "fixture-cn-1", sha256: "0".repeat(64) },
  descriptors: [{ id: "neutral-cn-descriptors/1", version: "1", sha256: "0".repeat(64) }],
};

const tree = (extra = {}) => ({ $type: "bpmn:Definitions", id: "Definitions_1", targetNamespace: "urn:example:1", rootElements: [], ...extra });
const envelope = async (node, descriptors) => {
  const bindings = [];
  return { documentVersion: "1", profileIdentity: identity, tree: node, bindings, semanticRevision: await semanticRevision(node, identity, bindings) };
};
const withoutExporter = () => {
  const types = structuredClone(cnDescriptors.types);
  types["bpmn:Definitions"].scalars = types["bpmn:Definitions"].scalars.filter(s => s !== "exporterVersion");
  return descriptorIndex({ types });
};

test("should admit a tree without exporterVersion when descriptors do not admit it", async () => {
  const descriptors = withoutExporter();
  const value = await envelope(tree());
  const before = JSON.stringify(value);
  const admitted = await validateEnvelope(value, { syntax, descriptors, supportRoles: [], storageValidator: () => true });
  assert.deepEqual(admitted.tree, value.tree);
  assert.equal(JSON.stringify(value), before);
});

test("should still require an admitted targetNamespace", async () => {
  const descriptors = withoutExporter();
  const node = tree();
  delete node.targetNamespace;
  const value = await envelope(node);
  await assert.rejects(validateEnvelope(value, { syntax, descriptors, supportRoles: [], storageValidator: () => true }));
});

test("should still require exporterVersion when descriptors admit it", async () => {
  const descriptors = descriptorIndex({ types: cnDescriptors.types });
  const value = await envelope(tree());
  await assert.rejects(validateEnvelope(value, { syntax, descriptors, supportRoles: [], storageValidator: () => true }));
  const full = await envelope(tree({ exporterVersion: "fixture-cn-1" }));
  assert.deepEqual((await validateEnvelope(full, { syntax, descriptors, supportRoles: [], storageValidator: () => true })).tree, full.tree);
});
