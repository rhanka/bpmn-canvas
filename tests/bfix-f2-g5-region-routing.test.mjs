// G5: region expansion recomputes every incident link affected by it, not
// just the anchor links of the placed elements.
// Red on 7703290: layout recomputes only anchorAssociationId links, so an
// additional link incident to a moved region item keeps its stale route.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { runLayout } from "../dist/profile/lot4-layout.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const art = join(fixtures, "lot4-layout-export/expectations/artifacts");
const readArtifact = (p) => JSON.parse(readFileSync(join(art, p), "utf8"));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const manifest = JSON.parse(readFileSync(join(fixtures, "lot4-layout-export/expectations/manifest.json"), "utf8"));
const pkg = manifest.packages.find((p) => p.profile.path.endsWith("neutral-lot4-profile.json"));
const descriptorJson = JSON.parse(readFileSync(join(fixtures, pkg.descriptors.path), "utf8"));

const profile = readArtifact("neutral-lot4-profile.json");
const envelope = readArtifact("main.envelope.json");
// Region placements are N output records (the profile's own top-level
// placements are fixed to []); the sealed layout-001 pairing uses these.
const placements = readArtifact("main.placements.json");

function layoutContext() {
  return {
    profile,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    notions: new Map((profile.notions ?? []).map((n) => [n.id, n])),
    unicodeCase: UNICODE_CASE,
  };
}

// Base geometry plus one additional non-anchor link from the moved
// Input_Order node to the unmoved Task_Ship node, carrying stale waypoints.
function geometryWithExtraLink() {
  const base = readArtifact("main.base-geometry.json");
  const extra = {
    pageId: "Page_Main",
    occurrenceKey: "Extra_Link_di",
    semanticId: "Extra_Link",
    role: "content",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    sourceOccurrence: { pageId: "Page_Main", occurrenceKey: "Input_Order_di" },
    targetOccurrence: { pageId: "Page_Main", occurrenceKey: "Task_Ship_di" },
    waypoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  };
  return { pages: base.pages, geometry: [...base.geometry, extra] };
}

const byKey = (geometry, pageId, occurrenceKey) =>
  geometry.find((g) => g.pageId === pageId && g.occurrenceKey === occurrenceKey);
const bboxOf = (waypoints) => {
  const xs = waypoints.map((p) => p.x), ys = waypoints.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

// The recomputed link follows the layout straight-link rule: its endpoints
// sit on the facing edges of the moved source and the target boxes.
function assertIncidentReroute(geometry, linkKey, sourceKey, targetKey) {
  const link = byKey(geometry, "Page_Main", linkKey);
  const source = byKey(geometry, "Page_Main", sourceKey);
  const target = byKey(geometry, "Page_Main", targetKey);
  assert.ok(link && source && target, "link and endpoints present on the page");
  assert.notDeepEqual(link.waypoints, [{ x: 0, y: 0 }, { x: 10, y: 10 }], "stale waypoints are gone");
  assert.deepEqual(link.bounds, bboxOf(link.waypoints), "link bounds fit the recomputed waypoints");
  const [first, last] = [link.waypoints[0], link.waypoints[link.waypoints.length - 1]];
  const onSourceEdge = first.y === source.bounds.y + source.bounds.height || first.y === source.bounds.y;
  const onTargetEdge = last.y === target.bounds.y + target.bounds.height || last.y === target.bounds.y;
  assert.ok(onSourceEdge, `link starts on a facing edge of the moved source (y=${first.y})`);
  assert.ok(onTargetEdge, `link ends on a facing edge of the target (y=${last.y})`);
  assert.ok(first.x >= source.bounds.x && first.x <= source.bounds.x + source.bounds.width, "link starts within the source width");
  assert.ok(last.x >= target.bounds.x && last.x <= target.bounds.x + target.bounds.width, "link ends within the target width");
}

test("G5: anchor link of a placed region item is recomputed (control)", () => {
  const out = runLayout(layoutContext(), {
    envelope, placements, baseGeometry: geometryWithExtraLink(), themeId: "plain",
  });
  assert.equal(out.status, "ok");
  const geometry = out.payload.geometry;
  const anchor = byKey(geometry, "Page_Main", "Input_Link_di");
  const stale = readArtifact("main.base-geometry.json").geometry.find((g) => g.occurrenceKey === "Input_Link_di");
  assert.notDeepEqual(anchor.waypoints, stale.waypoints, "anchor link follows the moved endpoint");
});

test("G5: non-anchor link incident to a moved region item is rerouted", () => {
  const out = runLayout(layoutContext(), {
    envelope, placements, baseGeometry: geometryWithExtraLink(), themeId: "plain",
  });
  assert.equal(out.status, "ok");
  assertIncidentReroute(out.payload.geometry, "Extra_Link_di", "Input_Order_di", "Task_Ship_di");
});

test("G5: links between two unmoved nodes keep their authored route", () => {
  const out = runLayout(layoutContext(), {
    envelope, placements, baseGeometry: geometryWithExtraLink(), themeId: "plain",
  });
  assert.equal(out.status, "ok");
  const geometry = out.payload.geometry;
  const kept = byKey(geometry, "Page_Main", "Flow_Ship_di");
  const stale = readArtifact("main.base-geometry.json").geometry.find((g) => g.occurrenceKey === "Flow_Ship_di");
  assert.deepEqual(kept.waypoints, stale.waypoints, "uninvolved link untouched");
  assert.deepEqual(kept.bounds, stale.bounds, "uninvolved link bounds untouched");
});
