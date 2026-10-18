import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkCompatibility } from "../dist/profile/compatibility.js";
import { verifyExpectations } from "./helpers/profile-seal.mjs";

const repo = new URL("../", import.meta.url);
const vendor = "tests/fixtures/profile-parity-corpus/";
const matrixPath = `${vendor}profile-mechanism/1/r33-matrix-vectors.public.json`;
const receiptPath = "docs/design/receipts/lot0-twin-proof.json";
const revendorPath = "docs/design/receipts/lot0-corpus-v1-revendor.json";
const manifestSha256 = "01b81fd9fb69f110a7f302631d6da92126bcb1672c67bea3ea68ff802df39faf";
const bytes = path => readFileSync(new URL(path, repo));
const load = path => JSON.parse(bytes(path));
const digest = value => createHash("sha256").update(value).digest("hex");
const pin = load("tests/fixtures/profile-parity-corpus.pin.json");
const matrix = load(matrixPath);
// Existing rows retain historical assertions as well as the published R3.3
// decision. Added rows publish that decision under expected.
const cases = [
  ...matrix.existing.map(row => ({ ...row, published: row.expectedR33 })),
  ...matrix.added.map(row => ({ ...row, published: row.expected }))
];

test("should cover every public R3.3 case exactly once", () => {
  assert.equal(matrix.revision, "R3.3");
  assert.equal(matrix.existing.length, 66);
  assert.equal(matrix.added.length, 85);
  assert.equal(cases.length, 151, "full public matrix; 45 is the sealed overlap only");
  assert.equal(new Set(cases.map(row => row.caseId)).size, 151);
  for (const row of cases) {
    assert.equal(typeof row.caseId, "string");
    assert.ok(row.caseId.length > 0);
    assert.ok(row.published?.verdict && row.published?.output, row.caseId);
  }
});

test("should match the reviewed manifest identity and every listed file hash", () => {
  assert.equal(pin.manifest.sha256, manifestSha256);
  const manifestBytes = bytes(`${vendor}${pin.manifest.path}`);
  assert.equal(digest(manifestBytes), manifestSha256);
  assert.equal(manifestBytes.length, pin.manifest.bytes);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(Object.keys(manifest.files).length, 176);
  for (const [path, sha256] of Object.entries(manifest.files)) {
    assert.equal(digest(bytes(`${vendor}${path}`)), sha256, path);
  }
  // The manifest lists cases only. The pin also covers mechanism dependencies,
  // including the public matrix itself, and the manifest: 198 files in total.
  assert.equal(pin.files.length, 198);
  for (const entry of pin.files) {
    const content = bytes(`${vendor}${entry.path}`);
    assert.equal(content.length, entry.bytes, entry.path);
    assert.equal(digest(content), entry.sha256, entry.path);
  }
});

for (const row of cases) {
  test(`should match public runtime twin proof ${row.caseId}`, () => {
    const input = structuredClone(row.input);
    const actual = checkCompatibility(input);
    assert.deepEqual(actual, row.published, `twin-proof-runtime:${row.caseId}`);
    assert.deepEqual(input, row.input, `input preservation:${row.caseId}`);
  });
}

test("should record every runtime case and the unchanged sealed consistency evidence", () => {
  const receipt = load(receiptPath);
  assert.equal(receipt.format, "lot0-twin-proof/1");
  assert.equal(receipt.initialHead, "e5839c3");
  assert.equal(receipt.status, "pass");
  assert.deepEqual(receipt.manifestIdentity, {
    result: "pass",
    pinPath: "tests/fixtures/profile-parity-corpus.pin.json",
    manifestPath: `${vendor}${pin.manifest.path}`,
    sha256: manifestSha256,
    manifestListedFiles: 176,
    manifestListedMatches: 176,
    vendoredFiles: 198,
    vendoredMatches: 198,
    disputes: []
  });
  assert.equal(receipt.runtime.matrixPath, matrixPath);
  assert.equal(receipt.runtime.matrixSha256, digest(bytes(matrixPath)));
  assert.equal(receipt.runtime.count, 151);
  assert.deepEqual(receipt.runtime.sections, { existing: 66, added: 85 });
  assert.equal(receipt.runtime.matches, 151);
  assert.deepEqual(receipt.runtime.disputes, []);
  assert.deepEqual(receipt.runtime.cases, cases.map(row => {
    const actual = checkCompatibility(structuredClone(row.input));
    assert.deepEqual(actual, row.published, `twin-proof-runtime:${row.caseId}`);
    return { caseId: row.caseId, result: "match", verdict: actual.verdict, outcome: actual.output };
  }));

  const revendor = load(revendorPath);
  assert.equal(verifyExpectations().vectors.length, 486);
  assert.equal(revendor.vectorConsistency.total, 486);
  assert.deepEqual(revendor.vectorConsistency.disputes, []);
  assert.deepEqual(revendor.vectorConsistency.changedInputOrOutcomeDependencies, []);
  for (const artifact of [revendor.vectorConsistency.expectationFile, revendor.vectorConsistency.expectationSeal]) {
    assert.equal(digest(bytes(artifact.path)), artifact.sha256, artifact.path);
  }
  assert.deepEqual(receipt.sealedConsistency, {
    result: "pass",
    receiptPath: revendorPath,
    receiptSha256: digest(bytes(revendorPath)),
    count: 486,
    publicMatrixOverlap: 45,
    disputes: [],
    expectationFile: revendor.vectorConsistency.expectationFile,
    expectationSeal: revendor.vectorConsistency.expectationSeal
  });
  assert.deepEqual(receipt.pythonReference, {
    manifestSha256,
    contractsPath: "contracts/",
    contractsTree: "0c6bf891f147079e175a46d0d34f42ff308d235c",
    commit: pin.sourceCommit,
    tagName: pin.tagName,
    tagStatus: "final",
    tagAccepted: true,
    tagObject: pin.tagObject,
    provenance: "Canonical tree identity supplied by the conductor; local tests verify vendored bytes and canvas runtime decisions."
  });
});
