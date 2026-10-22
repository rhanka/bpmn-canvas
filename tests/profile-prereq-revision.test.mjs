import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSchema } from "../dist/profile/contracts.js";
import { semanticRevision, validateEnvelope } from "../dist/profile/envelope.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { validate } from "../dist/profile/validate.js";
import { lot3Compile } from "./helpers/lot3-compile.mjs";

const schema = JSON.parse(readFileSync(new URL("../schemas/profile/document-envelope-1.schema.json", import.meta.url)));
const syntax = await compileSchema(schema);
const cnDescriptors = JSON.parse(readFileSync(new URL("../tests/fixtures/lot3-cn/expectations/profile/neutral-cn-descriptors.json", import.meta.url)));
const descriptors = descriptorIndex({ types: cnDescriptors.types });

const identity = {
  mechanismVersion: "1",
  schemaVersion: "1.0.0",
  profile: "neutral-cn/1",
  version: "1.1.0",
  sha256: "0".repeat(64),
  base: { id: "neutral-cn-base/1", version: "fixture-cn-1", sha256: "0".repeat(64) },
  descriptors: [{ id: "neutral-cn-descriptors/1", version: "1", sha256: "0".repeat(64) }],
};
const node = { $type: "bpmn:Definitions", id: "Definitions_1", targetNamespace: "urn:example:1", exporterVersion: "fixture-cn-1", rootElements: [] };

test("should refuse a revision mismatch with profile-schema in validateEnvelope", async () => {
  const value = { documentVersion: "1", profileIdentity: identity, tree: node, bindings: [],
    semanticRevision: await semanticRevision(node, identity, []) };
  await validateEnvelope(value, { syntax, descriptors, supportRoles: [], storageValidator: () => true });
  await assert.rejects(
    validateEnvelope({ ...value, semanticRevision: "0".repeat(64) }, { syntax, descriptors, supportRoles: [], storageValidator: () => true }),
    { code: "profile-schema" });
});

test("should refuse a revision mismatch with profile-schema in validate", async () => {
  const { compiled } = await lot3Compile("main");
  assert.equal(compiled.status, "ok");
  const envelope = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/cases/l3-c-topology.json", import.meta.url))).inputArtifacts.find(a => a.role === "envelope").json;
  const result = validate(compiled.payload, { ...envelope, semanticRevision: "0".repeat(64) },
    { phase: "post-normalize", readinessPolicy: "accept" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "profile-schema");
});
