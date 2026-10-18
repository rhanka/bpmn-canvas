// Code-side regressions from DESIGN R3.3 §3.3 (P1/P2), §3.1 and §9.
// These supplement the independently sealed vectors; they never reseal them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as compatibility from "../dist/profile/compatibility.js";
import { compileSchema } from "../dist/profile/contracts.js";
import { expectations } from "./helpers/profile-step3.mjs";

const facts = () => structuredClone(expectations.find(v => v.caseId === "s2b-compat-exact").inputArtifacts[0].json);
const refused = code => ({ verdict: { status: "refused", code },
  output: { acceptedUnderInjectedProfile: false, sourcePreserved: true, migrationExecuted: false } });
const dependentRows = [
  ["mechanism-migration-required", f => { f.runtime.mechanisms.push("other"); f.document.profileIdentity.mechanismVersion = "other"; }],
  ["profile-schema-migration-required", f => { f.runtime.schemas.push("1.1.0"); f.document.profileIdentity.schemaVersion = "1.1.0"; }],
  ["base-mismatch", f => { f.document.profileIdentity.base.sha256 = "3".repeat(64); }],
  ["descriptor-mismatch", f => { f.document.profileIdentity.descriptors[0].sha256 = "3".repeat(64); }],
  ["profile-major-mismatch", f => { f.document.profileIdentity.profile = "other-neutral"; }],
  ["profile-major-mismatch", f => { f.document.profileIdentity.version = "2.0.0"; }]
];
for (const [index, [code, change]] of dependentRows.entries()) {
  for (const source of ["known-and-available", "unknown", "unavailable", "unknown-version", "unknown-digest"]) {
    test(`should apply P1 at row ${index} ${code} with ${source}`, () => {
      const f = facts(); change(f);
      f.sourcePackage = ["unknown", "unavailable"].includes(source) ? source : "known-and-available";
      if (source === "unknown-version") f.document.profileIdentity.version = "unknown";
      if (source === "unknown-digest") f.document.profileIdentity.sha256 = "";
      f.selectedMigration = true;
      const before = structuredClone(f);
      assert.deepEqual(compatibility.checkCompatibility(f), refused(source === "known-and-available" ? code : "profile-source-unavailable"));
      assert.deepEqual(f, before);
    });
  }
}

const independentRows = [
  ["document-version-unsupported", f => { f.document.documentVersion = "2"; }],
  ["profile-metadata-conflict", f => { f.hostIdentity = structuredClone(f.injected); f.hostIdentity.sha256 = "3".repeat(64); }],
  ["profile-schema-version", f => { f.injected.schemaVersion = "unsupported"; }],
  ["mechanism-version-unsupported", f => { f.injected.mechanismVersion = "unsupported"; }],
  ["document-mechanism-unsupported", f => { f.document.profileIdentity.mechanismVersion = "unsupported"; }],
  ["document-schema-unsupported", f => { f.document.profileIdentity.schemaVersion = "unsupported"; }],
  ["profile-capability", f => { f.requiredCapabilities.push("missing"); }],
  ["profile-resource-missing", f => { f.requiredAssets.push("missing"); }],
  ["profile-digest-mismatch", f => { f.document.profileIdentity.sha256 = "3".repeat(64); }]
];
for (const [code, change] of independentRows) for (const sourcePackage of ["unknown", "unavailable"]) {
  test(`should retain ${code} ahead of ${sourcePackage} source`, () => {
    const f = facts(); change(f); f.sourcePackage = sourcePackage;
    assert.deepEqual(compatibility.checkCompatibility(f), refused(code));
  });
}

for (const sha256 of ["", "unknown"]) for (const version of ["1.0.0", "1.0.1", "1.1.0"]) {
  test(`should require a known source digest for version ${version} and digest ${JSON.stringify(sha256)}`, () => {
    const f = facts(); f.document.profileIdentity.sha256 = sha256; f.document.profileIdentity.version = version;
    assert.deepEqual(compatibility.checkCompatibility(f), refused("profile-source-unavailable"));
  });
}

test("should preserve matrix order when unsupported axes and source-dependent remedies overlap", () => {
  const f = facts(); f.sourcePackage = "unavailable";
  f.injected.mechanismVersion = "unsupported";
  f.document.profileIdentity.schemaVersion = "unsupported";
  assert.deepEqual(compatibility.checkCompatibility(f), refused("mechanism-version-unsupported"));
  f.injected.mechanismVersion = f.document.profileIdentity.mechanismVersion;
  assert.deepEqual(compatibility.checkCompatibility(f), refused("document-schema-unsupported"));
  f.runtime.schemas.push("unsupported");
  f.requiredCapabilities.push("missing");
  assert.deepEqual(compatibility.checkCompatibility(f), refused("profile-source-unavailable"));
  f.sourcePackage = "known-and-available";
  assert.deepEqual(compatibility.checkCompatibility(f), refused("profile-schema-migration-required"));
  f.runtime.mechanisms.push("other"); f.document.profileIdentity.mechanismVersion = "other";
  assert.deepEqual(compatibility.checkCompatibility(f), refused("mechanism-migration-required"));
});

test("should validate every sealed compatibility verdict against the R3.3 schema and registry", async () => {
  const schemaBytes = readFileSync(new URL("../schemas/profile/compatibility-verdict.schema.json", import.meta.url));
  assert.deepEqual(schemaBytes, readFileSync(new URL("./fixtures/profile-lot0/compatibility-verdict.schema.json", import.meta.url)));
  const schema = JSON.parse(schemaBytes);
  const registry = JSON.parse(readFileSync(new URL("./fixtures/profile-lot0/compatibility-codes.json", import.meta.url)));
  assert.equal(registry.revision, "R3.3");
  assert.deepEqual(schema.$defs.refusalCode.enum, registry.codes.map(row => row.code));
  const validate = await compileSchema(schema);
  for (const v of expectations.filter(v => v.operation === "compatibility-decision")) {
    assert.equal(validate(compatibility.checkCompatibility(v.inputArtifacts[0].json).verdict).valid, true, v.caseId);
  }
  assert.equal(validate({ status: "refused" }).valid, true);
  for (const code of ["document-schema-unsupported", "profile-schema-migration-required"]) {
    assert.equal(validate({ status: "refused", code }).valid, true);
  }
  for (const value of [{ status: "ok", code: "profile-capability" }, { status: "refused", code: "invented" },
    { status: "refused", phase: "compatibility" }, { status: "refused", code: null }]) assert.equal(validate(value).valid, false);
});

test("should require migration and a new history epoch for changed activation identities only", () => {
  const f = facts(), before = structuredClone(f);
  assert.deepEqual(compatibility.profileActivationRequirements(f.document.profileIdentity, f.injected),
    { explicitMigrationRequired: false, newHistoryEpoch: false });
  for (const [, change] of [...dependentRows, ["digest", f => { f.document.profileIdentity.sha256 = "3".repeat(64); }]]) {
    const changed = facts(); change(changed);
    assert.deepEqual(compatibility.profileActivationRequirements(changed.document.profileIdentity, changed.injected),
      { explicitMigrationRequired: true, newHistoryEpoch: true });
  }
  assert.deepEqual(f, before);
});
