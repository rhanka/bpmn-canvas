import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as annotations from "../dist/internal/annotations.js";
import { textWidth, wrapText } from "../dist/internal/textMetrics.js";
import { roleLabel } from "../dist/internal/business-policy.js";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const manifest = load("manifest.json");
const digest = text => createHash("sha256").update(text).digest("hex");
const functions = new Map(Object.entries(annotations).map(([name, fn]) => [digest(name), fn]));
const classifiers = Object.fromEntries(load("probe-expectations.json").probe1.functions.map(f => [f.role, functions.get(f.sha256)]));
const ledger = load("ledger.json").occurrences;
const textOf = text => {
  if (typeof text === "string") return text;
  return text.concat.map(part => {
    if (typeof part === "string") return part;
    for (const row of ledger.filter(r => r.literal === part.sha256 && r.form === "raw")) {
      try {
        const line = readFileSync(new URL(`../${row.file}`, import.meta.url), "utf8").split("\n")[row.line - 1];
        const value = line?.slice(row.column, row.endColumn);
        if (value && digest(value) === part.sha256) return value;
      } catch {}
    }
    assert.fail(`${part.literal} input witness unavailable`);
  }).join("");
};
const input = (c, role) => {
  const a = c.inputArtifacts.find(a => a.role === role);
  if (!a) return undefined;
  if (!a.path) return a.json;
  const bytes = readFileSync(new URL(a.path, root));
  assert.equal(digest(bytes), a.sha256, `${c.caseId} input digest`);
  return JSON.parse(bytes);
};
for (const entry of manifest.cases) {
  const c = load(entry.path);
  if (!["x24.classify", "x24.metrics"].includes(c.operation) || c.expectedStatus !== "success") continue;
  test(`${c.caseId} sealed consumer vectors`, () => {
    for (const suffix of c.inputArtifacts.some(a => a.role === "policy-a") ? ["a", "b"] : [""]) {
      const policy = input(c, suffix ? `policy-${suffix}` : "policy") ?? (input(c, "policy-text") ? JSON.parse(input(c, "policy-text").text) : undefined);
      const expected = c.expectedArtifacts.find(a => a.role === (suffix ? `results-${suffix}` : "results")).json;
      const actual = input(c, "vectors").map(v => {
        if (c.operation === "x24.metrics") return { ...v, result: v.measure === "text-width"
          ? textWidth(v.text, v.size, v.bold, policy)
          : wrapText(v.text, v.size, v.maxWidth, v.bold, policy) };
        const text = textOf(v.text);
        const document = classifiers.document(text, policy), application = classifiers.application(text, policy);
        const role = document ? "document" : application ? "application" : null;
        const layoutName = role ? roleLabel(text, policy, true) : null;
        const displayName = classifiers["display-name"](text, policy);
        if (c.caseId === "x24-R-007-no-policy-recognises-nothing") return { document, application, role, layoutName, displayNameUnchanged: displayName === text };
        return { text: v.text, document, application, role, displayName, layoutName };
      });
      assert.deepEqual(actual, expected, `${c.caseId} ${suffix || "legacy"}`);
    }
  });
}
