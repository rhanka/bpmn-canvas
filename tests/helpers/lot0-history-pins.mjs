import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashOf } from "./brand.mjs";

// Historical digests were checked against the original objects before squash.
// Edited tests have explicit successor pins; earlier receipts stay intact.
export function loadHistoryPins(text = readFileSync(new URL("../fixtures/lot0-history.pin.json", import.meta.url), "utf8")) {
  assert.equal(hashOf(text), "3b79fe0d7dcfddf39e18b472414c32bbab875b0ce8560d9a4a7c18da59cd1fe3", "history pin digest");
  return JSON.parse(text);
}

export function predecessorPin(commit, path) {
  const entry = loadHistoryPins().predecessors.find(entry => entry.commit === commit && entry.path === path);
  assert.ok(entry, `${commit}:${path} missing predecessor pin`);
  return { bytes: entry.bytes, sha256: entry.sha256 };
}

export function loadPathReseal(text = readFileSync(new URL("../../docs/design/receipts/lot0-squash-paths-reseal.json", import.meta.url), "utf8")) {
  assert.equal(hashOf(text), "758a10870789384f0cebf0fec43b03f060d86c45a75c78a39c80f888d6b4a24c", "path reseal digest");
  return JSON.parse(text);
}

export function successorPin(path, previous) {
  const entry = loadHistoryPins().successors.find(entry => entry.path === path);
  if (entry) {
    assert.deepEqual(previous, entry.previous, `${path} successor predecessor`);
    previous = entry.current;
  }
  const reseal = loadPathReseal().supersedesFiles.find(entry => entry.path === path);
  if (reseal) {
    assert.deepEqual(previous, reseal.old, `${path} path reseal predecessor`);
    previous = reseal.new;
  }
  const corpus = JSON.parse(readFileSync(new URL("../../docs/design/receipts/lot0-corpus-v1-revendor.json", import.meta.url)))
    .supersedesFiles.find(entry => entry.path === path);
  if (corpus && (previous.bytes !== corpus.new.bytes || previous.sha256 !== corpus.new.sha256)) {
    assert.deepEqual({ bytes: previous.bytes, sha256: previous.sha256 }, corpus.old, `${path} corpus reseal predecessor`);
    previous = corpus.new;
  }
  return finalCorpusPin(path, previous);
}

export function finalCorpusPin(path, previous) {
  const final = JSON.parse(readFileSync(new URL("../../docs/design/receipts/lot0-corpus-pin-final.json", import.meta.url)))
    .supersedesFiles.find(entry => entry.path === path);
  if (final) assert.deepEqual({ bytes: previous.bytes, sha256: previous.sha256 }, final.old, `${path} final corpus reseal predecessor`);
  return historyGuardPin(path, final?.new ?? previous);
}

export function historyGuardPin(path, previous) {
  const entry = JSON.parse(readFileSync(new URL("../../docs/design/receipts/lot0-history-guard-2.json", import.meta.url)))
    .supersedesFiles.find(entry => entry.path === path);
  if (!entry) return previous;
  assert.deepEqual({ bytes: previous.bytes, sha256: previous.sha256 }, entry.old, `${path} history guard reseal predecessor`);
  return entry.new;
}
