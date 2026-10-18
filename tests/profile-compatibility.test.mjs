import { test } from "node:test";
import assert from "node:assert/strict";
import { expectations } from "./helpers/profile-step3.mjs";
import { checkCompatibility } from "../dist/profile/compatibility.js";

for (const v of expectations.filter(v => v.family === "compatibility")) {
  test(`should match ordered compatibility ${v.caseId}`, () => {
    const input = v.inputArtifacts[0].json;
    const before = JSON.stringify(input);
    assert.deepEqual(checkCompatibility(input), {
      verdict: v.expectedArtifacts.find(a => a.role === "verdict").json,
      output: v.expectedArtifacts.find(a => a.role === "output").json
    });
    assert.equal(JSON.stringify(input), before);
  });
}

test("should require validated migration results before accepting a different identity", () => {
  const input = structuredClone(expectations.find(v => v.caseId === "s2b-compat-patch-up").inputArtifacts[0].json);
  input.selectedMigration = true;
  assert.equal(checkCompatibility(input).verdict.code, "profile-patch-migration-required");
  input.sourcePackage = "unavailable";
  assert.deepEqual(checkCompatibility(input), { verdict: { status: "refused", code: "profile-source-unavailable" },
    output: { acceptedUnderInjectedProfile: false, sourcePreserved: true, migrationExecuted: false } });
});

test("should refuse invalid exact envelopes and schema identity disagreement", () => {
  const input = structuredClone(expectations.find(v => v.caseId === "s2b-compat-exact").inputArtifacts[0].json);
  input.envelopeValid = false;
  assert.deepEqual(checkCompatibility(input).verdict, { status: "refused" });
  input.envelopeValid = true;
  input.runtime.schemas.push("1.1.0");
  input.document.profileIdentity.schemaVersion = "1.1.0";
  assert.deepEqual(checkCompatibility(input).verdict, { status: "refused", code: "profile-schema-migration-required" });
});
