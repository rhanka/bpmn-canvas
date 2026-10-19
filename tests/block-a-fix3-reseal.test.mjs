import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const load = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pinOf = (path) => {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  return { bytes: bytes.length, sha256: digest(bytes) };
};

const successor = load("docs/design/receipts/block-a-fix3-reseal.json");

function historicalPin(path) {
  if (path === "docs/design/receipts/block-a-f1-disputes.json") {
    const receipt = load("docs/design/receipts/block-a-phase1-reseal.json");
    assert.equal(receipt.expectationReseals.path, path);
    return { bytes: receipt.expectationReseals.bytes, sha256: receipt.expectationReseals.sha256 };
  }
  if (path === "THIRD_PARTY_NOTICES.md") {
    const receipt = load("docs/design/receipts/block-a-j5-reseal.json");
    const entry = receipt.supersedesFiles.find((candidate) => candidate.path === path);
    assert.ok(entry, `${path} j5 reseal entry present`);
    return { bytes: entry.new.bytes, sha256: entry.new.sha256 };
  }
  const microfix = load("docs/design/receipts/block-a-microfix-reseal.json");
  const entry = microfix.files.find((candidate) => candidate.path === path);
  assert.ok(entry, `${path} microfix reseal entry present`);
  return { bytes: entry.current.bytes, sha256: entry.current.sha256 };
}

function verifySuccessor(path, candidate) {
  const entry = successor.files.find((candidate) => candidate.path === path);
  assert.ok(entry, `${path} fix3 reseal entry present`);
  assert.ok(typeof entry.clause === "string" && entry.clause.length > 0, `${path} fix3 clause present`);
  assert.deepEqual(candidate, entry.new, `${path} fix3 successor`);
  return entry;
}

test("Block A fix3 should reseal drifted pins with explicit successors", () => {
  assert.equal(successor.format, "block-a-fix3-reseal/1");
  for (const path of ["docs/design/receipts/block-a-f1-disputes.json", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(successor.files.some((entry) => entry.path === path), `${path} fix3 reseal entry present`);
  }
  for (const entry of successor.files) {
    assert.deepEqual({ bytes: entry.old.bytes, sha256: entry.old.sha256 }, historicalPin(entry.path), `${entry.path} fix3 predecessor`);
    assert.deepEqual(pinOf(entry.path), { bytes: entry.new.bytes, sha256: entry.new.sha256 }, entry.path);
    assert.deepEqual(verifySuccessor(entry.path, pinOf(entry.path)).old, historicalPin(entry.path), `${entry.path} successor predecessor`);
    assert.throws(() => verifySuccessor(entry.path, { bytes: 0, sha256: "0".repeat(64) }), /fix3 successor/);
  }
});
