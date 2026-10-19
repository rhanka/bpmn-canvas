import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { microfixSourcePin, phase2SourcePin } from "./helpers/block-a-phase2-pins.mjs";

const load = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const receipt = load("docs/design/receipts/block-a-phase2-reseal.json");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pin = bytes => ({ bytes: bytes.length, sha256: digest(bytes) });

test("Block A phase 2 should preserve every job ledger entry and historical receipt", () => {
  const union = receipt.historyGuardUnion;
  const ledger = load(union.path);
  assert.deepEqual(ledger.supersedesFiles, union.entries);
  assert.equal(ledger.predecessorInventorySha256, union.predecessorInventorySha256);
  assert.equal(digest(JSON.stringify(ledger.supersedesFiles.map(({ path, old }) => ({ path, ...old })))), union.predecessorInventorySha256);
  for (const { path, ...expected } of receipt.retainedLedgers) {
    assert.deepEqual(pin(readFileSync(new URL(`../${path}`, import.meta.url))), expected, path);
  }
});

test("Block A phase 2 should verify integrated successors from both lint branches", () => {
  const fix3 = load("docs/design/receipts/block-a-fix3-reseal.json");
  const successor = (path) => fix3.files.find((candidate) => candidate.path === path);
  for (const entry of receipt.files) {
    const current = microfixSourcePin(entry.path, entry.current);
    const next = successor(entry.path);
    if (next) assert.deepEqual({ bytes: next.old.bytes, sha256: next.old.sha256 }, current, `${entry.path} fix3 predecessor`);
    assert.deepEqual(pin(readFileSync(new URL(`../${entry.path}`, import.meta.url))), next ? { bytes: next.new.bytes, sha256: next.new.sha256 } : current, entry.path);
    for (const previous of entry.predecessors) assert.deepEqual(phase2SourcePin(entry.path, previous), current, entry.path);
    assert.throws(() => phase2SourcePin(entry.path, { bytes: 0, sha256: "0".repeat(64) }), /phase 2 reseal predecessor/);
  }
});

test("Block A microfix should retain predecessor checks and verify every targeted successor", () => {
  const followup = load("docs/design/receipts/block-a-microfix-reseal.json");
  const fix3 = load("docs/design/receipts/block-a-fix3-reseal.json");
  const successor = (path) => fix3.files.find((candidate) => candidate.path === path);
  for (const entry of followup.files) {
    const next = successor(entry.path);
    if (next) assert.deepEqual({ bytes: next.old.bytes, sha256: next.old.sha256 }, entry.current, `${entry.path} fix3 predecessor`);
    assert.deepEqual(pin(readFileSync(new URL(`../${entry.path}`, import.meta.url))), next ? { bytes: next.new.bytes, sha256: next.new.sha256 } : entry.current, entry.path);
    assert.deepEqual(microfixSourcePin(entry.path, entry.old), entry.current, entry.path);
    assert.throws(() => microfixSourcePin(entry.path, { bytes: 0, sha256: "0".repeat(64) }), /microfix reseal predecessor/);
  }
});

test("Block A phase 2 should reject missing or altered J1 and phase 1 predecessors", () => {
  const path = "src/profile/lint-contracts.ts";
  for (const commit of [receipt.baseCommit, receipt.j1Head, receipt.phase1Head]) {
    for (const damage of ["remove", "alter"]) {
      const mutated = structuredClone(receipt);
      const entry = mutated.files.find(entry => entry.path === path);
      const previous = entry.predecessors.find(entry => entry.commit === commit);
      if (damage === "remove") entry.predecessors = entry.predecessors.filter(entry => entry.commit !== commit);
      else previous.sha256 = "0".repeat(64);
      assert.throws(() => phase2SourcePin(path, entry.predecessors[0], mutated), /phase 2 (?:J1|phase 1)/);
    }
  }
});
