import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rawDigest } from "../dist/profile/canonical.js";
import { createDescriptorContext, requireSingleContext } from "../dist/profile/descriptor-context.js";

const neutralBytes = readFileSync(new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/neutral-descriptors.json", import.meta.url));
const neutral = JSON.parse(neutralBytes);

async function pinnedPackage(bytes = neutralBytes) {
  const sha256 = await rawDigest(bytes);
  return { id: "neutral-descriptors", version: "1.1.0", sha256, descriptorBytes: bytes };
}

test("should build an injected context from pinned package bytes", async () => {
  const result = await createDescriptorContext([await pinnedPackage()]);
  assert.equal(result.status, "ok");
  assert.equal(Object.keys(result.payload.descriptors).length, Object.keys(neutral.types).length);
  assert.ok(result.payload.digest);
  assert.deepEqual(result.payload.packages, [{ id: "neutral-descriptors", version: "1.1.0", sha256: (await pinnedPackage()).sha256 }]);
});

test("should refuse tampered bytes, duplicate ids and empty packages", async () => {
  const good = await pinnedPackage();
  const tampered = { ...good, descriptorBytes: Buffer.from(neutralBytes.toString("utf8").replace("bpmn:Task", "bpmn:Tasq")) };
  assert.equal((await createDescriptorContext([tampered])).code, "descriptor-mismatch");
  assert.equal((await createDescriptorContext([good, good])).code, "descriptor-mismatch");
  assert.equal((await createDescriptorContext([])).code, "descriptor-mismatch");
  assert.equal((await createDescriptorContext([{ ...good, sha256: "0".repeat(64) }])).code, "descriptor-mismatch");
});

test("should enforce required pins and single-context use", async () => {
  const good = await pinnedPackage();
  const ok = await createDescriptorContext([good], { requiredIds: ["neutral-descriptors"] });
  assert.equal(ok.status, "ok");
  assert.equal((await createDescriptorContext([good], { requiredIds: ["missing-pin"] })).code, "descriptor-mismatch");
  const first = await createDescriptorContext([good]);
  const second = await createDescriptorContext([await pinnedPackage(Buffer.from(JSON.stringify({ types: {} })))]);
  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.equal(requireSingleContext(first.payload, first.payload), first.payload);
  assert.throws(() => requireSingleContext(first.payload, second.payload), /descriptor-mismatch/);
});

test("should reject malformed descriptor documents without guessing", async () => {
  const good = await pinnedPackage();
  const notJson = { ...good, descriptorBytes: Buffer.from("nope{"), sha256: await rawDigest(Buffer.from("nope{")) };
  assert.equal((await createDescriptorContext([notJson])).code, "descriptor-mismatch");
  const noTypes = { ...good, descriptorBytes: Buffer.from(JSON.stringify({ scope: "x" })) };
  assert.equal((await createDescriptorContext([{ ...noTypes, sha256: await rawDigest(noTypes.descriptorBytes) }])).code, "descriptor-mismatch");
});
