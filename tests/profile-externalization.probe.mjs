// Deliberately unresolved acceptance probe. Run explicitly; see the J5 report.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDocumentAnnotation } from "../dist/internal/annotations.js";

test("J5 #24 should require injected data for business classification", () => {
  assert.equal(isDocumentAnnotation("[Reference] example"), false,
    "generic classification must not activate implicit compatibility policy");
});

test("J5 #24 should inventory occurrences and distribution members", () => {
  const scope = JSON.parse(readFileSync(new URL("../docs/design/profile-externalization-scope.json", import.meta.url)));
  assert.ok(Array.isArray(scope.occurrences) && scope.occurrences.length > 0,
    "scope has no I-number occurrence ledger");
  assert.ok(Array.isArray(scope.distributionMembers) && scope.distributionMembers.length > 0,
    "scope has no distribution member inventory");
});
