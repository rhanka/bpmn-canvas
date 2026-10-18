import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { finalCorpusPin } from "./helpers/lot0-history-pins.mjs";
import { verifyCorpus, verifyExpectations } from "./helpers/profile-seal.mjs";

const repo = new URL("../", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, repo)));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const receiptPath = "docs/design/receipts/lot0-corpus-v1-revendor.json";
const payload = artifact => Object.hasOwn(artifact, "json") ? artifact.json : artifact.text;
const predecessorText = () => readFileSync(new URL("tests/fixtures/profile-corpus-predecessors.pin.json", repo), "utf8");
const loadPredecessors = (text = predecessorText()) => {
  assert.equal(digest(text), "1c4f858478b0103a435c5a04cebf51373d0c11bb6aa1c1ae5842bdc761dadf9b", "corpus predecessor pin digest");
  const pins = JSON.parse(text);
  assert.equal(pins.format, "corpus-predecessors-pin/1");
  return pins;
};

test("should preserve every sealed vector while checking the expanded canonical overlap", () => {
  assert.deepEqual(verifyCorpus(), { files: 198, cases: 176 });
  const vectors = verifyExpectations().vectors;
  const receipt = load(receiptPath);
  const audit = receipt.vectorConsistency;
  assert.equal(vectors.length, 486);
  assert.deepEqual(audit.vectors.map(row => row.caseId), vectors.map(vector => vector.caseId));
  assert.equal(digest(readFileSync(new URL("tests/fixtures/profile-lot0/expectations.json", repo))),
    "b6ee671974e399fefeb1ff105978969ef95db9dc75ca5f6c8f361dcb1f278d2d");
  assert.deepEqual(audit.changedInputOrOutcomeDependencies, []);
  assert.deepEqual(audit.disputes, []);
  const manifest = load("tests/fixtures/profile-parity-corpus/profile-parity-corpus/1/manifest.json");
  const cases = new Map(Object.keys(manifest.files).map(path => {
    const vector = load(`tests/fixtures/profile-parity-corpus/${path}`);
    return [vector.caseId, { path, vector }];
  }));
  let original = 0, added = 0;
  for (const [index, vector] of vectors.entries()) {
    const row = audit.vectors[index];
    assert.equal(row.expectedOutcomeChanged, false, vector.caseId);
    assert.deepEqual(row.changedInputOrOutcomeDependencies, [], vector.caseId);
    const canonical = cases.get(vector.caseId);
    assert.equal(row.canonicalPath, canonical?.path ?? null, vector.caseId);
    if (!canonical) continue;
    assert.equal(vector.expectedStatus, canonical.vector.expectedStatus, vector.caseId);
    if (vector.canonicalPath) {
      original++;
      assert.deepEqual(vector.expectedArtifacts, canonical.vector.expectedArtifacts, vector.caseId);
    } else {
      added++;
      // The public matrix names these roles matrixInput/outcome; the local
      // seal uses input/output. Compare the values without rewriting either.
      assert.equal(vector.operation, "compatibility-decision");
      assert.equal(canonical.vector.operation, "check_compatibility");
      assert.deepEqual(vector.inputArtifacts.map(payload), canonical.vector.inputArtifacts.map(payload), vector.caseId);
      assert.deepEqual(vector.expectedArtifacts.map(payload), canonical.vector.expectedArtifacts.map(payload), vector.caseId);
    }
  }
  assert.equal(original, 23);
  assert.equal(added, 45);
});

test("should bind every corpus reseal to its predecessor and final bytes", () => {
  const receipt = load(receiptPath);
  const pins = loadPredecessors();
  assert.equal(receipt.initialHead, pins.initialHead);
  assert.deepEqual(receipt.supersedesFiles.map(entry => entry.path), pins.predecessors.map(entry => entry.path));
  const pin = bytes => ({ bytes: bytes.length, sha256: digest(bytes) });
  const seen = new Set();
  for (const entry of receipt.supersedesFiles) {
    assert.ok(!seen.has(entry.path), entry.path); seen.add(entry.path);
    const { path, ...predecessor } = pins.predecessors.find(previous => previous.path === entry.path);
    assert.deepEqual(predecessor, entry.old, path);
    assert.deepEqual(pin(readFileSync(new URL(entry.path, repo))), finalCorpusPin(entry.path, entry.new), entry.path);
  }
  assert.ok(seen.has("tests/fixtures/profile-parity-corpus.pin.json"));
  assert.ok(seen.has("tests/fixtures/profile-lot0/freeze.seal.json"));
});

test("should reject substitutions of predecessor paths, sizes and digests", () => {
  const pins = loadPredecessors();
  for (const change of [{ path: "tests/missing.json" }, { bytes: 0 }, { sha256: "0".repeat(64) }]) {
    const changed = structuredClone(pins);
    Object.assign(changed.predecessors[0], change);
    assert.throws(() => loadPredecessors(JSON.stringify(changed, null, 2) + "\n"), /corpus predecessor pin digest/);
  }
});
