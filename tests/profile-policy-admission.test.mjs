import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBusinessPolicy } from "../dist/internal/policy-admission.js";
import { annotationRole } from "../dist/internal/business-policy.js";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (c.operation !== "x24.policy.validate") continue;
  test(`${c.caseId} sealed policy admission`, () => {
    const a = c.inputArtifacts.find(a => a.role === "policy-text" || a.role === "policy");
    const text = a.path ? readFileSync(new URL(a.path, root), "utf8") : a.json.text;
    const result = validateBusinessPolicy(text);
    assert.deepEqual(result, c.expectedArtifacts.find(a => a.role === (c.expectedStatus === "success" ? "policy" : "refusal")).json, c.caseId);
  });
}
test("x24-S-009 sealed recognition ambiguity", () => {
  const c = load("cases/x24-S-009-overlapping-prefix.json");
  const policy = JSON.parse(c.inputArtifacts.find(a => a.role === "policy-text").json.text);
  const vectors = c.inputArtifacts.find(a => a.role === "vectors").json;
  let result;
  for (const [vector, input] of vectors.entries()) {
    try { annotationRole(input.text, policy); }
    catch (error) { result = { status: "refused", code: error.code, stage: "recognize", vector }; break; }
  }
  assert.deepEqual(result, c.expectedArtifacts.find(a => a.role === "refusal").json);
});
