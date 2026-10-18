// Independent data-only R3.3 gate. No library imports or execution.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyExpectations, verifyFreeze, verifyDesignProvenance } from "./helpers/profile-seal.mjs";

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/profile-lot0/${name}`, import.meta.url)));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pin = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const changed = [
  ...["minor-up", "minor-down"].flatMap(direction => ["unknown", "unavailable"].map(source =>
    [`s123-s1-${direction}-${source}`, "profile-source-unavailable"])),
  ...["unknown", "unavailable"].map(source =>
    [`s123-s2-document-schema-unsupported-${source}`, "document-schema-unsupported"]),
  ["s123-s2-document-schema-supported-available", "profile-schema-migration-required"]
];

test("should pin the verified R3.3 authority and all 46 companion entries", () => {
  assert.deepEqual(verifyFreeze().design, { revision: "R3.3", sha256: pin });
  assert.equal(verifyFreeze().companionManifest.sha256, "dbdbdbb8a61e87e76ea8e198561b86ffa1bbe86ea71a09261ab70ca31ef43dd3");
  assert.equal(verifyFreeze().companions.length, 46);
  assert.equal(verifyExpectations().designSha256, pin);
});

for (const [caseId, code] of changed) {
  test(`should supersede ${caseId} with its R3.3 diagnostic`, () => {
    const vector = load("expectations.json").vectors.find(v => v.caseId === caseId);
    assert.equal(vector.expectedStatus, `refused:${code}`);
    assert.deepEqual(vector.expectedArtifacts.find(a => a.role === "verdict").json, { status: "refused", code });
    assert.ok(vector.provenance.includes(code === "document-schema-unsupported" ? "DESIGN.md:308"
      : code === "profile-schema-migration-required" ? "DESIGN.md:310" : "DESIGN.md:298"));
  });
}

test("should account for every sealed matrix vector and the additional matrix citation", () => {
  const audit = load("r33-matrix-review.json");
  const data = verifyExpectations();
  const matrix = data.vectors.filter(v => v.operation === "compatibility-decision");
  assert.equal(matrix.length, 45);
  assert.deepEqual(audit.vectors.map(v => v.caseId), matrix.map(v => v.caseId));
  assert.deepEqual(audit.vectors.filter(v => v.changed).map(v => v.caseId).sort(), changed.map(([id]) => id).sort());
  assert.equal(audit.vectors.filter(v => v.disputed).length, 9);
  for (const row of audit.vectors) {
    const vector = matrix.find(v => v.caseId === row.caseId);
    assert.equal(hash(vector.inputArtifacts), row.inputSha256, row.caseId);
    assert.deepEqual(vector.expectedArtifacts, row.new.expectedArtifacts, row.caseId);
    assert.equal(vector.expectedStatus, row.new.expectedStatus, row.caseId);
    assert.deepEqual(vector.provenance, row.provenance, row.caseId);
    assert.equal(row.changed, hash(row.old) !== hash(row.new), row.caseId);
  }
  const cited = data.vectors.filter(v => v.provenance.some(ref => {
    const line = Number(ref.split(":")[1]); return line >= 296 && line <= 326;
  })).map(v => v.caseId);
  assert.deepEqual(cited.sort(), [...matrix.map(v => v.caseId), "s2b-envelope-profile-change"].sort());
  assert.deepEqual(audit.additionalMatrixCitations.map(v => v.caseId), ["s2b-envelope-profile-change"]);
  assert.equal(audit.inventory.total, 66);
  assert.equal(audit.inventory.unsealed, 21);
  assert.equal(audit.inventory.sha256, "79c25e5370bc2976b19728468d3614bb43713e1464bce808a4ee5c8ac3890a3e");
  const codes = load("compatibility-codes.json").codes.map(entry => entry.code);
  assert.deepEqual(load("compatibility-verdict.schema.json").$defs.refusalCode.enum, codes);
  assert.equal(codes.length, 20);
  for (const vector of matrix) {
    const verdict = vector.expectedArtifacts.find(a => a.role === "verdict").json;
    if (verdict.code) assert.ok(codes.includes(verdict.code), vector.caseId);
    else assert.ok(["s2b-compat-exact", "s123-s2-envelope-invalid-available"].includes(vector.caseId));
  }
});

test("should preserve all vector identities, inputs and unaffected expected outputs", () => {
  const audit = load("r33-matrix-review.json");
  const vectors = load("expectations.json").vectors;
  assert.equal(vectors.length, 486);
  assert.equal(hash(vectors.map(v => ({ caseId: v.caseId, inputArtifacts: v.inputArtifacts }))), audit.preservation.inputs);
  assert.equal(hash(vectors.filter(v => !changed.some(([id]) => id === v.caseId)).map(v =>
    ({ caseId: v.caseId, expectedStatus: v.expectedStatus, expectedArtifacts: v.expectedArtifacts }))), audit.preservation.unaffectedOutputs);
});

test("should reject missing P1 or schema-row provenance after consistent expectation resealing", () => {
  for (const [caseId, code] of changed) {
    const data = load("expectations.json");
    const line = code === "document-schema-unsupported" ? 308 : code === "profile-schema-migration-required" ? 310 : 298;
    const vector = data.vectors.find(v => v.caseId === caseId);
    vector.provenance = vector.provenance.filter(ref => ref !== `DESIGN.md:${line}`);
    assert.throws(() => verifyDesignProvenance(data), /provenance/);
  }
});
