import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { annotationKind, selectLook, lookTokens, paletteEntries, navigationTarget } from "../dist/internal/legacy-policy.js";
import { differences, substitution } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const input = (c, role) => {
  const a = c.inputArtifacts.find(a => a.role === role);
  if (!a) return undefined;
  if (!a.path) return a.json;
  const bytes = readFileSync(new URL(a.path, root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
  return JSON.parse(bytes);
};
const operations = new Set(["x24.classify.kind", "x24.tokens.resolve", "x24.theme.select", "x24.palette", "x24.navigation"]);
function observe(c, policy) {
  const vectors = input(c, "vectors");
  if (c.operation === "x24.palette") return paletteEntries(policy);
  return vectors.map(v => {
    if (c.operation === "x24.classify.kind") return { text: v.text, kind: annotationKind(v.text, input(c, "family"), policy) };
    if (c.operation === "x24.theme.select") return selectLook(v, policy);
    if (c.operation === "x24.navigation") {
      const data = v.navigation ? { ...policy, navigation: v.navigation } : policy;
      const result = navigationTarget(v, input(c, "index") ?? { processes: [], entries: [] }, data);
      return v.navigation ? { rules: v.navigation.rules, ...result } : result;
    }
    const selector = input(c, "look");
    const look = selector.first ? policy.presentation.looks[0] : policy.presentation.looks.find(l => l.alias === selector);
    const resolved = lookTokens(look, v.overrides);
    return selector.first ? { look: look.alias, ...v, ...resolved } : resolved;
  });
}
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (!operations.has(c.operation)) continue;
  test(`${c.caseId} sealed policy consumer`, () => {
    if (c.inputArtifacts.some(a => a.role === "policy-a")) {
      const runs = Object.fromEntries(["a", "b"].map(suffix => [suffix, { status: "success", artifacts: { results: observe(c, input(c, `policy-${suffix}`)) } }]));
      const result = substitution(c, { runs });
      assert.deepEqual(result.failures, [], c.caseId);
    } else {
      const actual = observe(c, input(c, "policy"));
      const expected = c.expectedArtifacts.find(a => a.role === "results").json;
      assert.deepEqual(differences(actual, expected), [], c.caseId);
    }
  });
}
