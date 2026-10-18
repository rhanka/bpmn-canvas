// Independent expected-data coverage and seals only; no runtime profile imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyExpectations, verifyDesignProvenance, verifyExpectedBytes } from "./helpers/profile-seal.mjs";

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/profile-lot0/${name}`, import.meta.url)));
const sha = value => createHash("sha256").update(value).digest("hex");
const all = () => load("expectations.json");
const inventory = {
  snapshot: ["empty", "repeated-selection", "duplicate-identity", "unknown-field", "null", "profile-conflict", "base-conflict", "descriptor-conflict", "archived-di-damage", "stale-layout", "stale-view", "invalid-selection", "duplicate-selection", "active-page", "navigation-only"],
  "render-contract": ["complete-binding", "page-order", "occurrence-order", "repeated-semantic", "synthetic", "edge", "endpoint-missing", "waypoints-short", "nonedge-endpoint", "coverage-missing", "fractional-geometry", "negative-size", "duplicate-key", "null", "unknown-field"],
  "render-digests": ["empty-bags", "normalized-bags", "metric-byte", "page-name", "payload-change", "theme-switch", "override-change", "profile-package", "token-invalid", "duplicate-target"],
  "result-unions": ["pure-ok", "pure-refused", "get-definitions", "get-snapshot", "not-loaded", "cancelled", "disposed", "operation-error", "failure-candidate", "unknown-key", "signature-contract", "prepared-artifact"],
  reports: ["all-stages", "total-order", "exact-duplicate", "presence-null", "escaped-pointer", "long-deep-pointer", "idless-child", "deletion-source-stable", "generated-port", "direction-reversal", "coarse-legacy", "unknown-legacy", "repeated-idmap", "artifact-indexes", "unknown-field", "phase-field", "loss-class-required", "raw-preserved"],
  "lint-contract": ["numeric-0", "numeric-1", "numeric-2", "numeric-3", "info-restoration", "profile-warning", "rule-missing", "rule-thrown", "config-missing", "config-thrown", "allowlist", "cycle", "options-replacement", "off-stage", "compiled-tampering", "draft-integrity", "release-barrier", "off-subrule", "malformed-custom", "unresolved-id"],
  "export-losses": ["semantic-type", "relation-kind", "navigation", "appearance", "layout", "metadata", "unsupported-feature", "provenance-unavailable", "worst-capability", "unsupported-necessary", "legacy-format", "legacy-reference", "legacy-id", "unknown-class"]
};

test("should retain all 211 previous vectors under R3.3 provenance", () => {
  const ascii = JSON.stringify(all().vectors.slice(0, 211)).replace(/[\u007f-\uffff]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  assert.equal(sha(ascii), "e3161b2aa6b4d8a0be91bb864fea56797f0bf2b3ed96e8bfa3a9a73066a9af9f");
});

for (const [family, scenarios] of Object.entries(inventory)) {
  test(`should seal independent ${family} boundary witnesses`, () => {
    const vectors = all().vectors.filter(v => v.family === family);
    for (const scenario of scenarios) {
      const v = vectors.find(v => v.scenario === scenario);
      assert.ok(v, `missing ${family}/${scenario}`);
      assert.ok(v.inputArtifacts.length);
      assert.ok(v.expectedArtifacts.some(a => a.role !== "verdict"), `missing concrete contract: ${v.caseId}`);
      assert.equal(v.author, "gpt-6-astra / xhigh");
      assert.equal(v.method, "hand-derived");
      assert.equal(v.review.status, "pending-independent-review");
      assert.ok(v.provenance.length && v.derivation.length > 30);
    }
  });
}

test("should pin all twenty neutral stage and policy tables from profile source", () => {
  const tables = all().vectors.filter(v => v.family === "lint-contract" && v.scenario === "policy-table");
  assert.equal(tables.length, 20);
  assert.equal(new Set(tables.map(v => v.tableKey)).size, 20);
  for (const v of tables) {
    assert.ok(v.provenance.includes("DESIGN.md:491"));
    const output = v.expectedArtifacts.find(a => a.role === "compiled-policy").json;
    assert.equal(output.transport[0], "error");
    assert.equal(output.settings.length, 27);
    assert.match(output.compiledOptions.severityPolicyDigest, /^[a-f0-9]{64}$/);
  }
});

test("should seal step 4 and pin every complete citation set", () => {
  const data = verifyExpectations();
  const vectors = data.vectors.slice(211, 391);
  assert.ok(vectors.length >= 140, "missing step-4 expectations");
  const policy = load("step4-provenance-policy.json");
  assert.deepEqual(vectors.map(v => [v.caseId, v.family, v.provenance]),
    policy.vectors.map(v => [v.caseId, v.family, v.required]));
  const freeze = load("freeze.seal.json");
  for (const path of ["author-step4.mjs", "step4-digests.json", "step4-provenance-policy.json", "step4-inputs.json"]) {
    assert.ok(freeze.files.some(f => f.path === path), `unsealed ${path}`);
  }
});

for (const family of Object.keys(inventory)) {
  test(`should reject incomplete ${family} provenance after a byte reseal`, () => {
    const data = all();
    const vector = data.vectors.find(v => v.family === family);
    assert.ok(vector, `missing ${family}`);
    vector.provenance = vector.provenance.slice(1);
    const bytes = Buffer.from(JSON.stringify(data));
    verifyExpectedBytes(bytes, { bytes: bytes.length, sha256: sha(bytes) });
    assert.throws(() => verifyDesignProvenance(data), /provenance/);
  });
}

test("should pin exact report bytes and every digest calculation", () => {
  const vectors = all().vectors.slice(211);
  assert.ok(vectors.length, "missing step-4 expectations");
  for (const v of vectors) for (const a of v.expectedArtifacts.filter(a => a.role === "report")) {
    assert.equal(a.json.reportVersion, "2");
    assert.deepEqual(JSON.parse(a.canonical), a.json);
    assert.equal(sha(a.canonical), a.sha256);
    assert.equal(a.canonical.endsWith("\n"), false);
  }
  const ledger = load("step4-digests.json");
  assert.ok(ledger.calculations.length >= 30);
  for (const entry of ledger.calculations) {
    if (entry.domain === "JCS") assert.deepEqual(JSON.parse(entry.canonical), entry.value);
    assert.equal(sha(entry.domain === "JCS" ? entry.canonical : entry.utf8), entry.sha256, entry.id);
  }
});
