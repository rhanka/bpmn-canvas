/** Fix round 2, G8: group order must derive from the profile array before
 * evaluating `when`, not from the filtered entries. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewOf } from "../dist/profile/lot5-eval.js";
import { listEntries } from "../dist/profile/lot5-queries.js";
import { TreeIndex } from "../dist/profile/lot5-support.js";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);

function entry(id, group, order, when) {
  return { id, surface: "palette", group, order, when,
    label: `label.${id}`, icon: { theme: "plain", glyph: "task" }, upstreamEntries: [] };
}

test("G8: group order follows the profile array, not the when filter", async () => {
  const descriptorTypes = JSON.parse(
    readFileSync(new URL("fixtures/ui-neutral-descriptors.json", root))).types;
  const profileDocument = { notions: [], recipes: [], messages: [], themes: [], resources: [],
    policies: { localeFallback: "en" },
    ui: [
      entry("a-first", "alpha", 0, { op: "false" }),
      entry("b-only", "beta", 0, { op: "true" }),
      entry("a-second", "alpha", 1, { op: "true" }),
    ] };
  const view = viewOf(profileDocument, {} /* literal when needs no compiled notions */, descriptorTypes);
  const tree = { $type: "bpmn:Definitions", id: "D",
    rootElements: [{ $type: "bpmn:Process", id: "P", flowElements: [] }] };
  const out = listEntries(view, tree, new TreeIndex(tree), "palette", "P", "en", "rev1");
  assert.equal(out.status, "ok");
  assert.deepEqual(out.payload.groups.map(g => g.group), ["alpha", "beta"]);
  assert.deepEqual(out.payload.groups.find(g => g.group === "alpha").entries.map(e => e.id), ["a-second"]);
  assert.deepEqual(out.payload.groups.find(g => g.group === "beta").entries.map(e => e.id), ["b-only"]);
});
