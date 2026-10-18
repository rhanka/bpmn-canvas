// Data-only coverage gate: safe to run before any library execution.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyExpectations, verifyDesignProvenance } from "./helpers/profile-seal.mjs";

const root = new URL("./fixtures/profile-lot0/", import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const data = json("expectations.json");
const added = data.vectors.slice(391);
const groups = {
  S1: [
    ...["patch-up", "patch-down", "minor-up", "minor-down"].flatMap(direction =>
      ["unknown", "unavailable"].map(source => `s123-s1-${direction}-${source}`)),
    "s123-s1-digest-unknown", "s123-s1-digest-unavailable"
  ],
  S2: [
    "s123-s2-injected-schema-unknown", "s123-s2-injected-schema-unavailable",
    "s123-s2-document-schema-supported-unknown", "s123-s2-document-schema-supported-unavailable",
    "s123-s2-document-schema-unsupported-unknown", "s123-s2-document-schema-unsupported-unavailable",
    "s123-s2-document-schema-supported-available", "s123-s2-envelope-invalid-available",
    "s123-s2-envelope-invalid-unavailable"
  ],
  S3: [
    ...["pages", "occurrences-render", "occurrences-page", "semantic", "source-reference", "target-reference"].flatMap(traversal =>
      ["export", "render", "validation", "absent", "create", "edit", "complete", "normalize", "reference", "convert", "migrate"].map(context =>
        `s123-s3-${traversal}-${context}`)),
    ...["render", "page"].flatMap(source => ["export", "render"].map(context =>
      `s123-s3-occurrences-${source}-${context}-wrong-order`))
  ],
  S5: ["parent", "grandparent"].flatMap(depth => ["string", "number", "boolean"].map(type =>
    `s123-s5-${depth}-${type}`))
};

test("should retain all 391 previously sealed vectors under R3.3 provenance", () => {
  assert.equal(hash(data.vectors.slice(0, 391)), "b5b594cfecf27bd21e3c9008eff513318ff5cd59e8651196bdee7d300ddbb075");
});

for (const [finding, ids] of Object.entries(groups)) {
  test(`should seal every independent ${finding} scenario`, () => {
    assert.deepEqual(added.filter(v => v.finding === finding).map(v => v.caseId), ids);
    for (const id of ids) {
      const vector = added.find(v => v.caseId === id);
      assert.equal(vector.method, "hand-derived");
      assert.equal(vector.author, "gpt-6-astra / xhigh");
      assert.ok(vector.provenance.length >= 3);
      assert.ok(vector.provenance.every(ref => /^DESIGN\.md:[1-9][0-9]*$/.test(ref)));
      assert.ok(vector.derivation.length > 40);
    }
  });
}

test("should preserve the available-source controls already sealed in step 2b", () => {
  for (const direction of ["patch-up", "patch-down", "minor-up", "minor-down"]) {
    const vector = data.vectors.find(v => v.caseId === `s2b-compat-${direction}`);
    assert.equal(vector.inputArtifacts[0].json.sourcePackage, "known-and-available");
  }
});

test("should include precisely the additional scenario inventory", () => {
  assert.deepEqual(added.map(v => v.caseId), Object.values(groups).flat());
  assert.equal(data.vectors.length, 486);
});

test("should verify all expectation seals and pinned per-case provenance", () => {
  verifyExpectations();
  verifyDesignProvenance(data);
});

test("should reject removal of a required S123 citation even after byte resealing", () => {
  assert.equal(added.length, 95);
  const mutated = structuredClone(data);
  mutated.vectors.at(-1).provenance.pop();
  assert.throws(() => verifyDesignProvenance(mutated), /extension provenance citations/);
});
