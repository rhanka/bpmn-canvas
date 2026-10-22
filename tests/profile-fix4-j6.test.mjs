/** Fix round 4, J6: upstreamFilter preserves predicate refusals in the
 * mapped-entry and derived-replace paths instead of converting them into
 * disabled UI. A refused predicate outside notion recognition surfaces with
 * its original code. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileUiNeutralProfile } from "./helpers/fix2-compile.mjs";
import { viewOf, subjectScope } from "../dist/profile/lot5-eval.js";
import * as queries from "../dist/profile/lot5-queries.js";
import { TreeIndex } from "../dist/profile/lot5-support.js";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const fixture = name => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const tree = { $type: "bpmn:Definitions", id: "D",
  rootElements: [{ $type: "bpmn:Process", id: "P", isExecutable: false, flowElements: [] }] };
// A value error outside notion recognition: reading an absent path inside a
// value operator refuses instead of returning a boolean.
const bad = { op: "present", value: { op: "concat", values: [{ op: "literal", value: "v:" },
  { op: "read", binding: "self", path: "/name" }] } };

async function uiView(mutator) {
  const doc = fixture("fixtures/ui-neutral-profile.json");
  mutator(doc);
  const built = await compileUiNeutralProfile(doc);
  return viewOf(doc, built.compiled, built.descriptors);
}

test("J6: mapped-entry upstream filter surfaces a when refusal", async () => {
  const view = await uiView(profile => {
    profile.ui.find(entry => entry.upstreamEntries.length).when = structuredClone(bad);
  });
  const entry = view.entries.find(entry => entry.upstreamEntries.length);
  const scope = subjectScope(view, tree, new TreeIndex(tree), "P");
  const out = queries.upstreamFilter(view, [entry.upstreamEntries[0]], scope);
  assert.equal(out.status, "refused");
  assert.equal(out.code, "profile-type");
});

test("J6: derived-replace upstream filter surfaces a when refusal", async () => {
  const view = await uiView(profile => {
    for (const entry of profile.ui.filter(entry => entry.surface === "replace")) entry.when = structuredClone(bad);
  });
  const scope = subjectScope(view, tree, new TreeIndex(tree), "P");
  const out = queries.upstreamFilter(view, ["replace"], scope);
  assert.equal(out.status, "refused");
  assert.equal(out.code, "profile-type");
});

test("J6: valid predicates still filter to boolean outcomes", async () => {
  const view = await uiView(profile => {
    profile.ui[0].when = { op: "true" };
  });
  const scope = subjectScope(view, tree, new TreeIndex(tree), "P");
  const out = queries.upstreamFilter(view, ["replace"], scope);
  assert.equal(out.status, "ok");
});
