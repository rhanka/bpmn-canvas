import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { finalCorpusPin, historyGuardPin, j5SourcePin } from "./helpers/lot0-history-pins.mjs";

const repo = new URL("../", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, repo)));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const receiptPath = "docs/design/receipts/lot0-corpus-pin-final.json";

test("should explicitly reseal every final provenance update without local history resolution", () => {
  const receipt = load(receiptPath);
  assert.equal(receipt.format, "lot0-corpus-pin-final/1");
  assert.equal(receipt.initialHead, "b671050b5f1c32e0f58687dcb9ee90da70e01822");
  assert.equal(receipt.status, "final");
  assert.equal(receipt.source.repository, "bpmn-moddle-py");
  assert.equal(receipt.source.sourceCommit, "cb46b3b8f893996a83c056f31f8aa92aa2364bd3");
  assert.equal(receipt.source.sourceTreeId, "0c6bf891f147079e175a46d0d34f42ff308d235c");
  assert.deepEqual(receipt.source.resolutionKeys, ["sourceCommit", "sourceTreeId"]);
  assert.equal(receipt.source.tagAccepted, true);
  assert.equal(receipt.source.tagMetadataOnly, true);
  const predecessors = receipt.supersedesFiles.map(entry => ({ path: entry.path, ...entry.old }));
  assert.equal(digest(JSON.stringify(predecessors)), "2173460c46cd8e2d577c63b2e872e489fad8109b0d06d52a5b17ebf1186a33ac");
  assert.equal(receipt.predecessorInventorySha256, digest(JSON.stringify(predecessors)));
  const paths = receipt.supersedesFiles.map(entry => entry.path);
  assert.deepEqual(paths, [...new Set(paths)].sort());
  for (const entry of [...receipt.supersedesFiles, ...receipt.addedFiles.map(({ path, ...pin }) => ({ path, new: pin }))]) {
    assert.ok(entry.path.startsWith("tests/") || entry.path.startsWith("docs/design/"));
    assert.ok(!entry.path.startsWith("tests/fixtures/profile-parity-corpus/"));
    const bytes = readFileSync(new URL(entry.path, repo));
    assert.deepEqual({ bytes: bytes.length, sha256: digest(bytes) }, historyGuardPin(entry.path, entry.new), entry.path);
    if (entry.old) assert.notDeepEqual(entry.old, entry.new, entry.path);
  }
  const pin = load("tests/fixtures/profile-parity-corpus.pin.json");
  assert.equal(pin.sourceCommit, receipt.source.sourceCommit);
  assert.equal(pin.sourceTreeId, receipt.source.sourceTreeId);
  assert.deepEqual(pin.manifest, receipt.manifest);
  // The old corpus receipt retains its historical seal entries.
  for (const entry of load("docs/design/receipts/lot0-corpus-v1-revendor.json").supersedesFiles) {
    const replacement = receipt.supersedesFiles.find(record => record.path === entry.path);
    if (replacement) assert.deepEqual(replacement.old, entry.new, entry.path);
    const bytes = readFileSync(new URL(entry.path, repo));
    assert.deepEqual(finalCorpusPin(entry.path, entry.new), { bytes: bytes.length, sha256: digest(bytes) });
  }
  for (const path of ["docs/design/receipts/lot0-s12.json", "docs/design/receipts/lot0-s2-r32.json",
    "docs/design/receipts/lot0-s2b.json", "docs/design/receipts/lot0-s4-expect.json",
    "docs/design/receipts/lot0-s3.json", "tests/fixtures/profile-lot0/inputs.json"]) {
    const obj = load(path);
    const corpus = obj.corpusPin ?? obj.neutralContracts ?? obj.inputs?.corpus ?? obj.corpus;
    assert.equal(corpus.sourceCommit, pin.sourceCommit, path);
    assert.equal(corpus.sourceTreeId, pin.sourceTreeId, path);
    if (Object.hasOwn(corpus, "tagAccepted")) assert.equal(corpus.tagAccepted, true, path);
    if (Object.hasOwn(corpus, "status")) assert.equal(corpus.status, "final", path);
  }
});

test("should bind every history guard successor to explicit predecessor and current byte seals", () => {
  const receipt = load("docs/design/receipts/lot0-history-guard-2.json");
  assert.equal(receipt.format, "lot0-history-guard/2");
  assert.equal(receipt.initialHead, "9c7f2eac858f1b4b8c51449cc3214e3a571f2460");
  assert.deepEqual(receipt.closedAllowance, ["07be09e", "45aa690"]);
  const predecessors = receipt.supersedesFiles.map(({ path, old }) => ({ path, ...old }));
  assert.equal(receipt.predecessorInventorySha256, "10d67fdb8d37a4b7df31bb42f14a1efb5063749cc6313399ddd65c8232d1f324");
  assert.equal(digest(JSON.stringify(predecessors)), receipt.predecessorInventorySha256);
  const paths = receipt.supersedesFiles.map(entry => entry.path);
  assert.deepEqual(paths, [...new Set(paths)].sort());
  for (const entry of [...receipt.supersedesFiles, ...receipt.addedFiles.map(({ path, ...pin }) => ({ path, new: pin }))]) {
    assert.ok(/^(?:tests\/|docs\/design\/)/.test(entry.path) || entry.path === "src/profile/lint-contracts.ts");
    const bytes = readFileSync(new URL(entry.path, repo));
    assert.deepEqual({ bytes: bytes.length, sha256: digest(bytes) }, j5SourcePin(entry.path, entry.new), entry.path);
    if (entry.old) {
      assert.notDeepEqual(entry.old, entry.new, entry.path);
      assert.deepEqual(historyGuardPin(entry.path, entry.old), j5SourcePin(entry.path, entry.new), entry.path);
      assert.throws(() => historyGuardPin(entry.path, { ...entry.old, sha256: "0".repeat(64) }), /history guard reseal predecessor/);
    }
  }
});
