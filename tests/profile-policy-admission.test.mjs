import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBusinessPolicy } from "../dist/internal/policy-admission.js";

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
