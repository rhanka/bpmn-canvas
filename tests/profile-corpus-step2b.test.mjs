// Oracle inventory and seal checks only. Never load a profile implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyExpectations, verifyDesignProvenance } from "./helpers/profile-seal.mjs";

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/profile-lot0/${name}`, import.meta.url)));
const vectors = () => load("expectations.json").vectors;
const family = name => vectors().filter(v => v.family === name);
const verdict = v => v.expectedArtifacts.find(a => a.role === "verdict").json;
const cites = (v, lines) => {
  for (const line of lines) assert.ok(v.provenance.includes(`DESIGN.md:${line}`), `${v.caseId} missing defining line ${line}`);
};

test("should retain all 84 prior vectors under R3.3 provenance", () => {
  const ascii = JSON.stringify(vectors().slice(0, 84)).replace(/[\u007f-\uffff]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  assert.equal(createHash("sha256").update(ascii).digest("hex"),
    "8ea0e79e781c4f3a3df70eec3cee39e9d7786bc6b1d763f037fb598d8ad15afd");
});

test("should seal positive controls and every static-rule rejection code", () => {
  const codes = [
    ["profile-capability"], ["profile-value-context", "profile-type"],
    ["profile-selector-order", "profile-selector-property", "profile-type"],
    ["profile-bounds"], ["profile-symbol", "profile-cycle", "lint-config-cycle"],
    ["profile-write-set", "profile-producer", "profile-type"], ["profile-create-identity"],
    ["lint-config-incomplete", "lint-config-unknown", "profile-schema"],
    ["profile-notion-kind", "profile-glyph-shape", "profile-type"],
    ["profile-ui-parameters", "profile-type"], ["profile-export-field", "profile-type"],
    ["profile-migration-endpoint"], ["profile-bind-fallbacks"], ["profile-action-phase"]
  ];
  codes.forEach((expected, i) => {
    const rule = `CR-${String(i + 1).padStart(2, "0")}`;
    const cases = family("static-rules").filter(v => v.ruleId === rule);
    assert.ok(cases.some(v => v.expectedStatus === "ok"), `${rule} positive control`);
    for (const code of expected) assert.ok(cases.some(v => verdict(v).code === code), `${rule} ${code}`);
    for (const v of cases) {
      assert.equal(v.operation, "static-rule-check");
      cites(v, [182, 186 + i]);
      assert.ok(v.inputArtifacts.length);
    }
  });
});

test("should cover each ordered compatibility row including both version directions", () => {
  const codes = [
    [302, "document-version-unsupported"], [303, "profile-metadata-missing"],
    [304, "profile-metadata-conflict"], [305, "profile-schema-version"],
    [306, "mechanism-version-unsupported"], [307, "document-mechanism-unsupported"],
    [308, "document-schema-unsupported"], [310, "profile-schema-migration-required"],
    [309, "mechanism-migration-required"], [311, "profile-capability"],
    [311, "profile-resource-missing"], [312, "base-mismatch"], [312, "descriptor-mismatch"],
    [313, "profile-major-mismatch"], [314, "profile-digest-mismatch"],
    [315, "profile-patch-migration-required"], [316, "profile-patch-downgrade-required"],
    [317, "profile-minor-migration-required"], [318, "profile-minor-downgrade-required"],
    [319, "profile-source-unavailable"], [320, "ok"]
  ];
  for (const [line, code] of codes) {
    const cases = family("compatibility").filter(v => v.matrixRow === line && v.expectedStatus === (code === "ok" ? "ok" : `refused:${code}`));
    assert.ok(cases.length, `compatibility row ${line} ${code}`);
    for (const v of cases) cites(v, [296, line, 322]);
  }
  assert.ok(family("compatibility").filter(v => v.caseId.includes("precedence")).length >= 3);
});

const requiredScenarios = {
  "envelope-revisions": ["valid", "unknown-field", "null", "duplicate-binding", "binding-order",
    "revision-mismatch", "semantic-change", "profile-change", "theme-switch", "di-only",
    "semantic-extension", "import-json-spacing", "import-xml-spacing", "parse-failure", "undo-revision"],
  "identity-lifecycle": ["root-first", "idless-parent", "containment", "imported-id", "collision",
    "missing-siblings", "reorder", "rename", "owner-remap", "delete-no-need", "recreate", "undo",
    "live-reference", "binding-recovery", "multi-process", "rollback"]
};
for (const [name, scenarios] of Object.entries(requiredScenarios)) {
  test(`should seal exact ${name} artifacts for every lifecycle boundary`, () => {
    for (const scenario of scenarios) {
      const v = family(name).find(v => v.scenario === scenario);
      assert.ok(v, `missing ${name}/${scenario}`);
      assert.ok(v.inputArtifacts.length);
      assert.ok(v.expectedArtifacts.some(a => a.role !== "verdict"), `exact output missing: ${v.caseId}`);
      cites(v, name === "envelope-revisions" ? [260, 264, 430] : [276, 280, 284, 288]);
    }
  });
}

test("should seal the added vectors and pin their complete citation inventory", () => {
  const all = verifyExpectations();
  assert.ok(all.vectors.length > 84, "missing step-2b vectors");
  const evidence = load("design-provenance.json");
  for (const v of all.vectors.slice(84)) {
    assert.equal(v.method, "hand-derived");
    assert.equal(v.author, "gpt-6-astra / xhigh");
    assert.equal(v.canonicalPath, undefined);
    assert.ok(v.derivation.length > 30);
    assert.equal(v.review.status, "pending-independent-review");
    for (const ref of v.provenance) {
      const line = evidence.lines.find(l => l.ref === ref);
      assert.ok(line, `${v.caseId}: ${ref}`);
      assert.doesNotMatch(line.text, /^\s*#|^\|\s*(?:---|Compile rule|Action\s*\||Condition\s*\||Field\s*\|)/);
    }
  }
});

for (const name of ["static-rules", "compatibility", "envelope-revisions", "identity-lifecycle"]) {
  test(`should reject an incomplete ${name} citation set after a byte reseal`, () => {
    const all = load("expectations.json");
    const v = all.vectors.find(v => v.family === name);
    assert.ok(v, `missing ${name}`);
    v.provenance = v.provenance.slice(1);
    assert.throws(() => verifyDesignProvenance(all), /provenance/);
  });
}
