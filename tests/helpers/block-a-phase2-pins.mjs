import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = name => JSON.parse(readFileSync(new URL(`../../docs/design/receipts/${name}`, import.meta.url)));
const pin = value => ({ bytes: value.bytes, sha256: value.sha256 });

/** Targeted successors retain the phase-one and phase-two historical pins. */
export function microfixSourcePin(path, previous, receipt = load("block-a-microfix-reseal.json")) {
  assert.equal(receipt.format, "block-a-microfix-reseal/1");
  assert.match(receipt.baseCommit, /^05f7378[0-9a-f]{33}$/);
  const entry = receipt.files.find(candidate => candidate.path === path);
  if (!entry) return previous;
  assert.deepEqual(pin(previous), entry.old, `${path} microfix reseal predecessor`);
  return entry.current;
}

/** Both lint branches retain their seals before converging on integrated bytes. */
export function phase2SourcePin(path, previous, receipt = load("block-a-phase2-reseal.json")) {
  assert.equal(receipt.format, "block-a-phase2-reseal/1");
  assert.equal(receipt.baseCommit, "bfed4a302446a3abbfec8b6bba46843dec432eca");
  const entry = receipt.files.find(candidate => candidate.path === path);
  if (!entry) return microfixSourcePin(path, previous);
  const predecessor = commit => entry.predecessors.find(candidate => candidate.commit === commit);
  const phase1 = load("block-a-phase1-reseal.json").files.find(candidate => candidate.path === path);
  if (phase1) {
    assert.deepEqual(pin(predecessor(receipt.phase1Head) ?? {}), phase1.current, `${path} phase 2 phase 1 predecessor`);
  }
  const j1 = load("lot0-history-guard-2.json").supersedesFiles.find(candidate => candidate.path === path);
  if (receipt.historyGuardUnion.j1Paths.includes(path)) {
    assert.ok(j1, `${path} phase 2 J1 ledger present`);
    assert.deepEqual(pin(predecessor(receipt.baseCommit) ?? {}), j1.old, `${path} phase 2 J1 predecessor`);
    assert.deepEqual(pin(predecessor(receipt.j1Head) ?? {}), j1.new, `${path} phase 2 J1 successor`);
  }
  assert.ok(entry.predecessors.some(candidate => candidate.bytes === previous.bytes && candidate.sha256 === previous.sha256), `${path} phase 2 reseal predecessor`);
  return microfixSourcePin(path, entry.current);
}
