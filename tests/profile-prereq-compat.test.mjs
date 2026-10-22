import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../dist/profile/validate.js";
import { lot3Compile } from "./helpers/lot3-compile.mjs";

const { compiled } = await lot3Compile("main");
assert.equal(compiled.status, "ok");
const envelope = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/cases/l3-call-internal.json", import.meta.url))).inputArtifacts.find(a => a.role === "envelope").json;
const selector = { phase: "post-normalize", readinessPolicy: "accept" };

test("should refuse a known digest conflict with profile-digest-mismatch", () => {
  const tweaked = structuredClone(envelope);
  tweaked.profileIdentity.sha256 = "f".repeat(64);
  const result = validate(compiled.payload, tweaked, selector);
  assert.equal(result.status, "refused");
  assert.equal(result.code, "profile-digest-mismatch");
  assert.deepEqual(result.profileIdentity, tweaked.profileIdentity);
  assert.equal(result.baseRevision, tweaked.semanticRevision);
});

test("should refuse an older minor without source with profile-source-unavailable", () => {
  const tweaked = structuredClone(envelope);
  tweaked.profileIdentity.version = "1.0.0";
  tweaked.profileIdentity.sha256 = "e".repeat(64);
  const result = validate(compiled.payload, tweaked, selector);
  assert.equal(result.status, "refused");
  assert.equal(result.code, "profile-source-unavailable");
});

test("should not refuse a matching identity with profile-metadata-conflict", () => {
  const result = validate(compiled.payload, envelope, selector);
  if (result.status === "refused") assert.notEqual(result.code, "profile-metadata-conflict");
});
