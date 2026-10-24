import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";
import { H, normalizeOverrides, normalizeDiStyles } from "../dist/profile/lot5-support.js";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));

test("f18 stored overrides feed viewRevision", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas, build } = await canvasFor(c);
  const snap = JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));
  const occurrence = snap.presentation.layout.geometry.find(g => g.semanticId && !g.waypoints);
  assert.ok(occurrence, "snapshot must carry a node occurrence");
  const over = structuredClone(snap);
  over.presentation.overrides = { semantic: [], occurrence: [{ pageId: occurrence.pageId,
    occurrenceKey: occurrence.occurrenceKey, tokens: [{ name: "fill", value: "#ff0000" }] }] };
  canvas.loadSnapshot(over);
  const staged = { baseRevision: canvas.currentRevision, expectedViewRevision: canvas.stateViewRevision(),
    transactionId: "tx-drag", presentation: { gesture: "drag", pageId: occurrence.pageId,
      occurrenceKey: occurrence.occurrenceKey, delta: { x: 100000, y: 0 } } };
  const out = await canvas.commitPresentation(staged);
  assert.equal(out.result.status, "ok", out.result.code);
  const state = canvas.getSnapshot().result.payload;
  const theme = build.profile.themes.find(t => t.id === state.presentation.themeId);
  const chain = [];
  for (let current = theme; current; current = build.profile.themes.find(x => x.id === current.fallback)) chain.unshift(current);
  const metrics = build.profile.resources.find(r => r.kind === "metrics");
  const expected = H({ semanticRevision: state.envelope.semanticRevision, layoutDigest: H(state.presentation.layout),
    themeId: theme.id, themeDigest: H({ themeId: theme.id, themes: chain }),
    overridesDigest: H(normalizeOverrides(state.presentation.overrides)),
    diStylesDigest: H(normalizeDiStyles(state.presentation.diStyles)),
    metricsDigest: H([{ id: metrics.id, sha256: metrics.sha256 }]) });
  assert.equal(canvas.stateViewRevision(), expected,
    "the committed view revision must follow DESIGN 9.2 over the stored overrides");
  canvas.dispose();
});

test("f18 override token order normalizes identically", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas: first } = await canvasFor(c);
  const { canvas: second } = await canvasFor(c);
  const snap = JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));
  const occurrence = snap.presentation.layout.geometry.find(g => g.semanticId && !g.waypoints);
  const tokens = [{ name: "stroke", value: "#00ff00" }, { name: "fill", value: "#ff0000" }];
  const a = structuredClone(snap);
  a.presentation.overrides = { semantic: [], occurrence: [{ pageId: occurrence.pageId,
    occurrenceKey: occurrence.occurrenceKey, tokens }] };
  const b = structuredClone(snap);
  b.presentation.overrides = { semantic: [], occurrence: [{ pageId: occurrence.pageId,
    occurrenceKey: occurrence.occurrenceKey, tokens: [...tokens].reverse() }] };
  first.loadSnapshot(a);
  second.loadSnapshot(b);
  assert.equal(first.stateViewRevision(), second.stateViewRevision(),
    "override records must normalize by token name");
  first.dispose();
  second.dispose();
});
