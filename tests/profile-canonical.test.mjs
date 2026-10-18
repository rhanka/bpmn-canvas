import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expectations, readCase } from "./helpers/profile-step3.mjs";
import { canonicalize, canonicalDigest, rawDigest, stableId } from "../dist/profile/canonical.js";

for (const vector of expectations.filter(v => v.caseId.startsWith("jcs-"))) {
  test(`should match sealed ${vector.caseId} bytes`, () => {
    const inputs = readCase(vector).inputArtifacts;
    assert.deepEqual(inputs.map(input => canonicalize(input.json)), vector.expectedArtifacts.map(a => a.text));
  });
}

test("should match all four sealed stable-id allocation tuples", async () => {
  const vector = expectations.find(v => v.caseId === "identity-stable-id");
  const tuples = readCase(vector).inputArtifacts[0].json;
  assert.deepEqual(await Promise.all(tuples.map(t => stableId(t.owner, t.slot, t.key))), vector.expectedArtifacts[0].json);
});

test("should preserve numeric-looking key order and array order under JCS", () => {
  // UTF-16 order is the sealed comparator; numeric property enumeration must not replace it.
  const object = { 2: "two", 10: "ten", a: "last" };
  assert.equal(canonicalize(object), '{"10":"ten","2":"two","a":"last"}');
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
});

test("should distinguish raw bytes from canonical JSON hashes", async () => {
  const a = '{ "b":1, "a":2 }\n', b = '{"a":2,"b":1}';
  assert.equal(await canonicalDigest(JSON.parse(a)), await rawDigest(b));
  assert.notEqual(await rawDigest(a), await rawDigest(b));
  assert.equal(await rawDigest(a), createHash("sha256").update(a).digest("hex"));
});

for (const [name, value] of [
  ["nonfinite", Infinity], ["NaN", NaN], ["surrogate value", "\ud800"],
  ["surrogate key", { ["\udc00"]: 1 }], ["undefined", undefined],
  ["function", () => 0], ["bigint", 1n], ["sparse array", new Array(1)]
]) {
  test(`should refuse non-JSON ${name} in canonical data`, () => {
    assert.throws(() => canonicalize(value));
  });
}

test("should refuse cycles and executable objects without invoking callbacks", () => {
  const cycle = {}; cycle.self = cycle;
  let invoked = false;
  const accessor = { get value() { invoked = true; return 1; } };
  const executable = { toJSON() { invoked = true; return {}; } };
  for (const value of [cycle, accessor, executable, new Date()]) assert.throws(() => canonicalize(value));
  assert.equal(invoked, false);
});

test("should keep the new comparator private and the legacy comparator unchanged", () => {
  const exports = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).exports;
  assert.ok(!Object.keys(exports).some(key => key.includes("profile")));
  const source = readFileSync(new URL("../src/io/moddle-json.ts", import.meta.url), "utf8");
  assert.ok(!source.includes("profile/canonical"));
});
