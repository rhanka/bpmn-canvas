/** Fix round 2, G7: a drag must apply the N placements through layout
 * correction on the stage, then commit the corrected geometry atomically.
 * A reference dragged near the band must land row-aligned in the band, not
 * at the raw drop point. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { runLayout } from "../dist/profile/lot4-layout.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { revisionOf } from "../dist/profile/lot5-support.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compileNeutralLot5Profile } from "./helpers/fix2-compile.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, root)));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

async function bandProfile() {
  const profile = structuredClone(json("vendor/py/artifacts/profiles/neutral-lot5.json"));
  profile.version = "9.9.9";
  for (const [name, value] of [["region.reference-band.headerWidth", 0], ["region.reference-band.padding", 8],
      ["region.reference-band.gap", 8], ["region.reference-band.minHeight", 40]]) {
    profile.themes[0].tokens.push({ name, value });
  }
  const placeTask = profile.recipes.find(r => r.id === "place-task");
  const placeRef = structuredClone(placeTask);
  placeRef.id = "place-ref";
  placeRef.select.where.type = "bpmn:DataStoreReference";
  placeRef.steps.find(s => s.op === "place").region = "reference-band";
  profile.recipes.push(placeRef);
  return profile;
}

async function bandCanvas() {
  const profile = await bandProfile();
  const build = await compileNeutralLot5Profile(profile);
  const descTypes = json("vendor/py/artifacts/neutral-descriptors.lot5.json").types;
  const metricsBytes = readFileSync(new URL("../../profile-parity-corpus/profile-mechanism/1/neutral-metrics.json", root));
  const resource = profile.resources.find(r => r.kind === "metrics");
  const canvas = new Lot5Canvas({ compiled: build.compiled, profileDocument: profile,
    descriptorTypes: descTypes, metricsId: resource.assetKey.replace(/\.json$/, ""),
    metricsSha256: resource.sha256, metricsPins: [{ id: resource.id, sha256: resource.sha256 }],
    unicodeCase: UNICODE_CASE, metricBytes: new Map([[resource.id, metricsBytes]]) });
  canvas.setDescriptorPins(profile.descriptors ?? []);
  const tree = { $type: "bpmn:Definitions", id: "D1",
    rootElements: [
      { $type: "bpmn:Process", id: "P1", isExecutable: false,
        flowElements: [{ $type: "bpmn:DataStoreReference", id: "Ref1", name: "Archive", dataStoreRef: "Store1" }] },
      { $type: "bpmn:DataStore", id: "Store1", name: "Archive" },
      { $type: "bpmn:Collaboration", id: "C1",
        participants: [{ $type: "bpmn:Participant", id: "Band1", name: "References" }] },
    ] };
  const bindings = [{ ownerId: "P1", role: "reference-band", targetId: "Band1" }];
  const envelope = { documentVersion: "1", profileIdentity: build.identity, tree, bindings,
    semanticRevision: revisionOf(tree, build.identity, bindings) };
  const layout = { layoutVersion: "1",
    pages: [{ pageId: "page-main", name: "main", order: 0, semanticRootId: "P1",
      bounds: { x: 0, y: 0, width: 2000000, height: 1000000 } }],
    geometry: [
      { pageId: "page-main", occurrenceKey: "occ:Band1", semanticId: "Band1", role: "reference-band",
        bounds: { x: 100000, y: 700000, width: 1500000, height: 120000 } },
      { pageId: "page-main", occurrenceKey: "occ:Ref1", semanticId: "Ref1", role: "content",
        bounds: { x: 600000, y: 180000, width: 100000, height: 80000 } },
    ] };
  canvas.loadSnapshot({ envelope: structuredClone(envelope),
    presentation: { layout: structuredClone(layout), themeId: "plain",
      overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] },
      importedDi: { descriptorDigest: "x", diagrams: [], sha256: "y" },
      selection: [], activePageId: "page-main" },
    viewRevision: "seed" });
  return { canvas, profile, build, envelope, descTypes };
}

test("G7: dragging a reference into the band commits the corrected DI", async () => {
  const { canvas, profile, build, envelope, descTypes } = await bandCanvas();
  const staged = { baseRevision: canvas.currentRevision,
    expectedViewRevision: canvas.stateViewRevision(), transactionId: "tx-band",
    presentation: { gesture: "drag", pageId: "page-main", occurrenceKey: "occ:Ref1",
      delta: { x: 0, y: 400000 } } };
  const out = await canvas.commitPresentation(staged);
  assert.equal(out.result.status, "ok", out.result.code);
  // Independent correction oracle: N placements through the lot-4 primitive.
  const { normalize } = await import("../dist/profile/normalize.js");
  const normalized = await normalize(build.compiled, envelope, "edit", [{ elementId: "Ref1" }]);
  assert.equal(normalized.status, "ok");
  assert.deepEqual(normalized.payload.placements.map(p => p.regionKey), ["reference-band"]);
  const patched = { layoutVersion: "1",
    pages: [{ pageId: "page-main", name: "main", order: 0, semanticRootId: "P1",
      bounds: { x: 0, y: 0, width: 2000000, height: 1000000 } }],
    geometry: [
      { pageId: "page-main", occurrenceKey: "occ:Band1", semanticId: "Band1", role: "reference-band",
        bounds: { x: 100000, y: 700000, width: 1500000, height: 120000 } },
      { pageId: "page-main", occurrenceKey: "occ:Ref1", semanticId: "Ref1", role: "content",
        bounds: { x: 600000, y: 580000, width: 100000, height: 80000 } },
    ] };
  const laid = runLayout(
    { profile, descriptors: descriptorIndex({ types: descTypes }),
      notions: new Map((profile.notions ?? []).map(n => [n.id, n])), unicodeCase: UNICODE_CASE },
    { envelope, placements: normalized.payload.placements, baseGeometry: patched, themeId: "plain" });
  assert.equal(laid.status, "ok", laid.code);
  const expected = laid.payload.geometry.find(g => g.occurrenceKey === "occ:Ref1");
  assert.notDeepEqual(expected.bounds, { x: 600000, y: 580000, width: 100000, height: 80000 });
  const committed = canvas.getSnapshot().result.payload.presentation.layout.geometry
    .find(g => g.occurrenceKey === "occ:Ref1");
  assert.deepEqual(committed.bounds, expected.bounds);
  assert.equal(committed.role, "reference-band");
  canvas.dispose();
});
