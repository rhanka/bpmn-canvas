import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Finding 17: `resolveTarget` is the published workshop prop name (OPEN-LEGACY).
// The prop was renamed to `lookupTarget` in the block B squash, breaking the
// public API. The internal planning helper keeps its own name; only the
// published surface is restored here.
test("f17 published workshop prop is resolveTarget", () => {
  const types = readFileSync(new URL("../dist/react/workshop.d.ts", import.meta.url), "utf8");
  assert.match(types, /readonly resolveTarget\?:/, "published BpmnWorkshopProps must declare resolveTarget");
  assert.doesNotMatch(types, /readonly lookupTarget\?:/, "published BpmnWorkshopProps must not declare lookupTarget");
});

test("f17 workshop harness passes resolveTarget", () => {
  const harness = readFileSync(new URL("./browser/page-workshop.mjs", import.meta.url), "utf8");
  assert.match(harness, /\{\s*resolveTarget:/, "browser harness must set the published resolveTarget prop");
  assert.doesNotMatch(harness, /\{\s*lookupTarget:/, "browser harness must not set the renamed prop");
});
