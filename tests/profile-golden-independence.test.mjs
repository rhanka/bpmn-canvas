import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));

test("should seal hand-derived verdicts with per-vector normative provenance", async () => {
  const { verifyExpectations } = await import("./helpers/profile-seal.mjs");
  const seal = verifyExpectations();
  assert.ok(seal.vectors.length >= 23);
  for (const vector of seal.vectors) {
    assert.ok(vector.provenance.every(ref => /^DESIGN\.md:[1-9][0-9]*$/.test(ref)));
    assert.equal(vector.method, "hand-derived");
    assert.ok(vector.derivation.length > 30);
    assert.ok(vector.author);
    assert.ok(vector.review.status);
  }
});

test("should detect every changed expectation byte including IDs, pointers and reports", async () => {
  const { verifyExpectedBytes } = await import("./helpers/profile-seal.mjs");
  const seal = load("./fixtures/profile-lot0/expectations.seal.json");
  const bytes = readFileSync(new URL("./fixtures/profile-lot0/expectations.json", import.meta.url));
  verifyExpectedBytes(bytes, seal);
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] <= 32) continue;
    const damaged = Buffer.from(bytes); damaged[i] ^= 1;
    assert.throws(() => verifyExpectedBytes(damaged, seal), `byte ${i}`);
  }
});

test("should freeze all fourteen static rules and precedence without executing them", () => {
  const rules = load("../docs/design/profile-compiler-rules.json");
  assert.deepEqual(rules.rules.map(rule => rule.id), Array.from({ length: 14 }, (_, i) => `CR-${String(i + 1).padStart(2, "0")}`));
  assert.deepEqual(rules.precedence, ["lexical", "schema", "static", "compatibility", "integrity", "evaluation"]);
  for (const rule of rules.rules) {
    assert.ok(rule.codes.length);
    assert.match(rule.provenance, /^DESIGN\.md:\d+$/);
  }
  assert.deepEqual(rules.lexicalCodes, ["profile-json", "profile-json-duplicate-key", "profile-unicode", "profile-number"]);
});
