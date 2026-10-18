// Sealed data assertions only: no profile text is parsed or evaluated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyExpectations, verifyFreeze } from "./helpers/profile-seal.mjs";

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const designSha256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";

test("should pin R3.3 and retain all 23 canonical verdicts with refreshed provenance", () => {
  const freeze = verifyFreeze();
  assert.deepEqual(freeze.design, { revision: "R3.3", sha256: designSha256 });
  assert.equal(freeze.companions.length, 46);
  assert.ok(freeze.companions.some(entry => entry.path === "VALIDATION-R33.json"));
  const expectations = verifyExpectations();
  assert.equal(expectations.designSha256, designSha256);
  const refs = {
    "jcs-escapes": [260], "jcs-key-order": [260, 262], "jcs-numbers": [260, 969],
    "identity-stable-id": [276, 284], "lexical-duplicate-keys": [50, 85, 90, 97, 98, 99],
    "lexical-lone-surrogate": [50, 85, 91, 97, 98, 99], "lexical-negative-zero": [50, 85, 92, 97, 98, 99, 260],
    "lexical-nonfinite": [50, 85, 92, 97, 98, 99], "lexical-unsafe-integer": [50, 85, 92, 97, 98, 99],
    "schema-integer-one-zero": [65], "schema-integer-fraction": [65],
    "schema-id-newline": [52, 65], "schema-keyword-subset": [52],
    "schema-external-ref-pinned": [52, 69], "schema-external-ref-unknown": [52, 69],
    "lint-info-through-warn": [485, 487], "lint-warning-through-error": [487, 489],
    "lint-unknown-lookup-none": [460], "lint-unknown-lookup-thrown": [460],
    "lint-extends-cycle": [464], "lint-whitelist-escape": [464],
    "lint-pointer-escaping": [510, 755], "lint-alternating-profiles": [464, 491]
  };
  const canonical = expectations.vectors.filter(vector => vector.canonicalPath);
  assert.equal(canonical.length, 23);
  for (const vector of canonical) {
    assert.deepEqual(vector.provenance, refs[vector.caseId].map(line => `DESIGN.md:${line}`), vector.caseId);
    assert.doesNotMatch(vector.derivation, /forthcoming|instructed R3\.2|depends on|before binary64 rounding/i);
  }
  const rules = load("../docs/design/profile-compiler-rules.json");
  assert.equal(rules.revision, "R3.3");
  assert.equal(rules.designSha256, designSha256);
  assert.deepEqual(rules.rules.map(rule => rule.provenance), Array.from({ length: 14 }, (_, i) => `DESIGN.md:${186 + i}`));
  assert.deepEqual(Object.fromEntries(rules.actions.map(action => [action.action, action.provenance])), actionRefs);
  assert.deepEqual(rules.lexicalOrder, ["recursive-source-order", "key-decode", "key-unicode", "key-duplicate", "colon", "value", "remaining-tokens", "whole-text-json", "schema"]);
  assert.deepEqual(rules.lexicalProvenance, ["DESIGN.md:97", "DESIGN.md:98", "DESIGN.md:99"]);
});

const actionRefs = Object.fromEntries(Object.entries({
  bind: 203, refuse: 203, create: 204, ensure: 205, set: 206, unset: 206,
  assignRef: 207, reparent: 208, place: 209, emit: 210, loss: 211, remove: 212
}).map(([action, line]) => [action, `DESIGN.md:${line}`]));

test("should cite each action's defining authority row", () => {
  const rules = load("../docs/design/profile-compiler-rules.json");
  assert.deepEqual(Object.fromEntries(rules.actions.map(action => [action.action, action.provenance])), actionRefs);
});

// Literal hand-derived witnesses. "ok" means lexical acceptance only; the
// schema control uses "schema". These are expectations, never parser actuals.
const cases = [
  ["empty", "", "profile-json"],
  ["incomplete", '{"x":', "profile-json"],
  ["invalid-escape", String.raw`{"x":"\q"}`, "profile-json"],
  ["control-character", '{"x":"\n"}', "profile-json"],
  ["nonstring-key", '{1:0}', "profile-json"],
  ["missing-colon", '{"x" 0}', "profile-json"],
  ["missing-comma", '[0 1]', "profile-json"],
  ["missing-close", '[0', "profile-json"],
  ["nan", '{"x":NaN}', "profile-json"],
  ["infinity", '{"x":Infinity}', "profile-json"],
  ["negative-infinity", '{"x":-Infinity}', "profile-json"],
  ["comment", '{/*x*/"x":0}', "profile-json"],
  ["plus", '{"x":+1}', "profile-json"],
  ["leading-zero", '{"x":01}', "profile-json"],
  ["fraction-incomplete", '{"x":1.}', "profile-json"],
  ["exponent-incomplete", '{"x":1e}', "profile-json"],
  ["duplicate-nested", String.raw`{"outer":[{"x":0,"\u0078":1}]}`, "profile-json-duplicate-key"],
  ["unicode-key", String.raw`{"\ud800":0}`, "profile-unicode"],
  ["unicode-high-value", String.raw`{"x":"\ud800"}`, "profile-unicode"],
  ["unicode-low-value", String.raw`{"x":["\udc00"]}`, "profile-unicode"],
  ["unicode-literal", '{"x":"\ud800"}', "profile-unicode"],
  ["overflow", '{"x":1e400}', "profile-number"],
  ["negative-overflow", '{"x":-1e400}', "profile-number"],
  ["unsafe-integer", '{"x":9007199254740993}', "profile-number"],
  ["unsafe-negative", '{"x":-9007199254740992}', "profile-number"],
  ["unsafe-exponent", '{"x":9.007199254740992e15}', "profile-number"],
  ["rounded-fraction", '{"x":9007199254740991.5}', "profile-number"],
  ["key-decode-before-unicode", String.raw`{"\ud800\q":0}`, "profile-json"],
  ["key-decode-before-duplicate", String.raw`{"x":0,"x\q":1}`, "profile-json"],
  ["key-unicode-before-colon", String.raw`{"\ud800" 1e400}`, "profile-unicode"],
  ["duplicate-before-colon", '{"x":0,"x" 1e400}', "profile-json-duplicate-key"],
  ["duplicate-before-unicode-value", String.raw`{"x":0,"x":"\ud800"}`, "profile-json-duplicate-key"],
  ["unicode-before-duplicate", String.raw`{"x":"\ud800","x":0}`, "profile-unicode"],
  ["number-before-duplicate", '{"x":1e400,"x":0}', "profile-number"],
  ["duplicate-before-number", '{"x":0,"x":1e400}', "profile-json-duplicate-key"],
  ["number-before-unicode", String.raw`{"a":[1e400],"b":"\ud800"}`, "profile-number"],
  ["unicode-before-number", String.raw`{"a":["\ud800"],"b":1e400}`, "profile-unicode"],
  ["json-before-number", '{"x" 1e400}', "profile-json"],
  ["number-before-json", '{"x":1e400 "y":0}', "profile-number"],
  ["json-before-unicode", String.raw`{"x" "\ud800"}`, "profile-json"],
  ["unicode-before-json", String.raw`{"x":"\ud800" "y":0}`, "profile-unicode"],
  ["json-before-duplicate", '{"a" 0,"x":0,"x":1}', "profile-json"],
  ["duplicate-before-json", '{"x":0,"x":0,"a" 0}', "profile-json-duplicate-key"],
  ["trailing", '{"x":0} true', "profile-json"],
  ["number-before-trailing", '{"x":1e400} true', "profile-number"],
  ["unicode-before-trailing", String.raw`{"x":"\ud800"} true`, "profile-unicode"],
  ["duplicate-before-trailing", '{"x":0,"x":1} true', "profile-json-duplicate-key"],
  ["trailing-not-walked", String.raw`{} {"x":"\ud800"}`, "profile-json"],
  ["non-json-whitespace", '\u00a0{}', "profile-json"],
  ["number-before-final-grammar", '\u00a0{"x":1e400}', "profile-number"],
  ["schema-json", '{"id":false,"unknown":+1}', "profile-json"],
  ["schema-duplicate", '{"id":false,"unknown":{"x":0,"x":1}}', "profile-json-duplicate-key"],
  ["schema-unicode", String.raw`{"id":false,"unknown":"\ud800"}`, "profile-unicode"],
  ["schema-number", '{"id":false,"unknown":1e400}', "profile-number"],
  ["schema-null-control", 'null', "schema"],
  ["paired-surrogates", String.raw`{"\ud800\udc00":"\udbff\udfff"}`, "ok"],
  ["noncharacter", String.raw`{"x":"\uffff"}`, "ok"],
  ["fresh-key-sets", '{"x":0,"child":{"x":1},"list":[{"x":2},{"x":3}]}', "ok"],
  ["no-key-normalization", '{"é":0,"e\u0301":1}', "ok"],
  ["numeric-boundaries", '[-9007199254740991,9007199254740991,1.0,1e0,1.5,-0,1e-400,5e-324]', "ok"],
  ["json-whitespace", ' \t\r\n{} \t\r\n', "ok"]
];

// Rule classes follow the hand-authored outcome. Positive controls need an
// explicit rule because lexical acceptance alone does not identify that rule.
function assertLocalProvenance(vector, id, outcome) {
  const positiveRules = {
    "paired-surrogates": [91], "noncharacter": [91],
    "fresh-key-sets": [90], "no-key-normalization": [90],
    "numeric-boundaries": [92], "json-whitespace": [89, 96]
  };
  const refusalRules = {
    "profile-json": [89], "profile-json-duplicate-key": [90],
    "profile-unicode": [91], "profile-number": [92], "schema": []
  };
  const lines = outcome === "ok" ? positiveRules[id] : refusalRules[outcome];
  assert.ok(lines, `missing rule class for ${id}`);
  assert.deepEqual(vector.provenance,
    [85, ...lines, 97, 98, 99].map(line => `DESIGN.md:${line}`), id);
}

for (const [id, text, outcome] of cases) {
  test(`should seal the hand-derived R3.3 ${id} expectation`, () => {
    const all = load("./fixtures/profile-lot0/expectations.json").vectors;
    const vector = all.find(entry => entry.caseId === `r32-${id}`);
    assert.ok(vector, `missing r32-${id}`);
    assert.equal(vector.canonicalPath, undefined);
    assert.equal(vector.operation, outcome === "ok" ? "profile-lexical-parse" : "profile-text-load");
    assert.deepEqual(vector.inputArtifacts, [{ role: "profile-text", text }]);
    const code = outcome === "schema" ? "profile-schema" : outcome;
    assert.equal(vector.expectedStatus, outcome === "ok" ? "ok" : `refused:${code}`);
    const verdict = outcome === "ok" ? { status: "ok", phase: "lexical" }
      : { status: "refused", code, phase: outcome === "schema" ? "schema" : "lexical", schemaReached: outcome === "schema" };
    assert.deepEqual(vector.expectedArtifacts, [{ role: "verdict", json: verdict }]);
    assert.equal(vector.method, "hand-derived");
    assert.equal(vector.review.status, "pending-independent-review");
    assert.ok(vector.derivation.length > 30);
    assertLocalProvenance(vector, id, outcome);
  });
}

test("should seal precisely the local witness inventory alongside the final corpus", () => {
  const vectors = verifyExpectations().vectors.filter(vector => !vector.canonicalPath && !vector.family);
  assert.deepEqual(vectors.map(vector => vector.caseId).sort(), cases.map(([id]) => `r32-${id}`).sort());
  const scope = load("../docs/design/profile-externalization-scope.json");
  assert.ok(scope.paths.includes("tests/profile-r32-expectations.test.mjs"));
  assert.ok(scope.paths.includes("docs/design/receipts/lot0-s12.json"));
});

// Excerpts come from the complete hash-verified R3.3 authority, never from
// expectation verdicts or derivations.
test("should resolve every expectation citation to pinned R3.3 line text", async () => {
  const { verifyDesignProvenance } = await import("./helpers/profile-seal.mjs");
  const expectations = load("./fixtures/profile-lot0/expectations.json");
  const evidence = load("./fixtures/profile-lot0/design-provenance.json");
  verifyDesignProvenance(expectations, evidence);
});

for (const damage of ["line-text", "line-number", "design-pin", "missing-line"]) {
  test(`should reject ${damage} provenance evidence even with intact expectation bytes`, async () => {
    const { verifyDesignProvenance } = await import("./helpers/profile-seal.mjs");
    const expectations = load("./fixtures/profile-lot0/expectations.json");
    const evidence = load("./fixtures/profile-lot0/design-provenance.json");
    if (damage === "line-text") evidence.lines[0].text += " altered";
    if (damage === "line-number") evidence.lines[0].ref = "DESIGN.md:1";
    if (damage === "design-pin") evidence.designSha256 = "0".repeat(64);
    if (damage === "missing-line") evidence.lines.pop();
    assert.throws(() => verifyDesignProvenance(expectations, evidence), /provenance/);
  });
}

test("should reject a C1 citation error after a consistent byte reseal", async () => {
  const { createHash } = await import("node:crypto");
  const { verifyExpectedBytes } = await import("./helpers/profile-seal.mjs");
  const expectations = load("./fixtures/profile-lot0/expectations.json");
  const vector = expectations.vectors.find(v => v.caseId === "r32-paired-surrogates");
  vector.provenance = [85, 92, 97, 98, 99].map(line => `DESIGN.md:${line}`);
  const bytes = Buffer.from(JSON.stringify(expectations));
  verifyExpectedBytes(bytes, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  assert.throws(() => assertLocalProvenance(vector, "paired-surrogates", "ok"), /paired-surrogates/);
});

// Resealing proves byte integrity, but must not bless incomplete or imprecise
// citations. Keep other users of each line intact so inventory checks alone
// cannot detect a missing citation on one vector or a wrong grouped action row.
for (const caseId of ["lexical-duplicate-keys", "lexical-lone-surrogate", "lexical-nonfinite", "lexical-unsafe-integer", "lexical-negative-zero", "r32-overflow"]) {
  for (const line of [85, 97, 98, 99]) {
    test(`should reject missing line ${line} on ${caseId} after a consistent byte reseal`, async () => {
      const { createHash } = await import("node:crypto");
      const { verifyDesignProvenance, verifyExpectedBytes } = await import("./helpers/profile-seal.mjs");
      const expectations = load("./fixtures/profile-lot0/expectations.json");
      const vector = expectations.vectors.find(entry => entry.caseId === caseId);
      vector.provenance = vector.provenance.filter(ref => ref !== `DESIGN.md:${line}`);
      const bytes = Buffer.from(JSON.stringify(expectations));
      verifyExpectedBytes(bytes, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      assert.throws(() => verifyDesignProvenance(expectations), /lexical provenance/);
    });
  }
}

for (const action of Object.keys(actionRefs)) {
  test(`should reject a header-only citation for ${action}`, async () => {
    const { verifyDesignProvenance } = await import("./helpers/profile-seal.mjs");
    const expectations = load("./fixtures/profile-lot0/expectations.json");
    const rules = load("../docs/design/profile-compiler-rules.json");
    rules.actions.find(entry => entry.action === action).provenance = "DESIGN.md:201";
    assert.throws(() => verifyDesignProvenance(expectations, undefined, undefined, rules), /action provenance/);
  });
}

test("should reject a defining row that belongs to a different action", async () => {
  const { verifyDesignProvenance } = await import("./helpers/profile-seal.mjs");
  const expectations = load("./fixtures/profile-lot0/expectations.json");
  const rules = load("../docs/design/profile-compiler-rules.json");
  rules.actions.find(entry => entry.action === "bind").provenance = "DESIGN.md:206";
  assert.throws(() => verifyDesignProvenance(expectations, undefined, undefined, rules), /action provenance/);
});
