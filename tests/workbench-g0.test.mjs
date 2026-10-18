import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { corpus, load, canonical, manifestHash, comparators } from "./helpers/workbench-parity.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("G0 should verify the immutable manifest and every mirrored byte", () => {
  const bytes = readFileSync(new URL("MANIFEST.sha256", corpus));
  assert.equal(sha(bytes), manifestHash);
  const entries = bytes.toString().trim().split("\n"); assert.equal(entries.length, 69);
  for (const entry of entries) {
    const [digest, name] = entry.split("  ");
    assert.equal(sha(readFileSync(new URL(name, corpus))), digest, name);
  }
  assert.deepEqual(readdirSync(corpus, { recursive: true }).filter(n => !["cases", "descriptors", "expected", "MANIFEST.sha256"].includes(n)).sort(), entries.map(e => e.split("  ")[1]).sort());
});
test("G0 should implement the frozen finite-number canonical vectors", () => {
  assert.equal(comparators.tolerance, 0);
  for (const vector of load("canonical-vectors.json")) assert.equal(canonical(vector.input), vector.expected);
});
