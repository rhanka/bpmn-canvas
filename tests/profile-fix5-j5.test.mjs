/** Fix round 5, J5: canvas render and map refusals must return the full merged
 * report in canonical Report/2 order, deduplicated. The draft pre/post
 * entries repeat the accept warnings, so the raw merge is unsorted with
 * duplicates; both late returns must apply canonicalEntries after adding any
 * current-stage entries. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile as compilePublic } from "../dist/profile/public-compiler.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { validateReport } from "../dist/profile/report.js";
import { canonicalize } from "../dist/profile/canonical.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistryFn, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

// A select predicate that errors once evaluated (read of an absent label
// part inside concat), so the map stage refuses with the evaluator code.
const failingSelect = () => ({
  op: "present",
  value: { op: "concat", values: [{ op: "literal", value: "v:" }, { op: "read", binding: "self", path: "/label/text" }] },
});

async function canvasWithExportFailure(stop, warnPhases) {
  const uiRegistry = uiRegistryFn();
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  if (stop === "map") {
    profile.recipes.find(r => r.id === "export-nodes").select.where = failingSelect();
  }
  for (const phase of warnPhases) {
    const target = profile.rules.find(r => r.phase === phase);
    target.assert = { op: "false" };
    target.code = `review-stop-${phase}`;
    profile.validation.find(v => v.id === phase && v.policy === "accept")
      .settings.find(s => s.rule === `profile:${target.id}`).severity = "warn";
  }
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes: uiSchemaBytes,
    baseBytes: uiRead("fixtures/ui-neutral-base.json"),
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map(p => ({ ...p, digestDomain: "raw", descriptorBytes: uiRead("fixtures/ui-neutral-descriptors.json") })),
    compilerRuleTable: uiRuleTable,
    capabilities: { capabilities: uiRegistry.capabilities, signatures: uiRegistry.signatures },
    assetBag: new Map([["ui-neutral-metrics.json", uiRead("fixtures/ui-neutral-metrics.json")]]),
  });
  assert.equal(loaded.status, "ok", `canvas witness profile loads (fail ${stop})`);
  const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compilePublic(loaded.payload, { ...uiRegistry, descriptors });
  assert.equal(compiled.status, "ok", `canvas witness profile compiles (fail ${stop})`);
  const metrics = profile.resources.find(r => r.kind === "metrics");
  const metricBytes = new Map([[metrics.id, uiRead("fixtures/ui-neutral-metrics.json")]]);
  if (stop === "render") metricBytes.clear();
  const canvas = new Lot5Canvas({
    compiled: compiled.payload, profileDocument: profile, descriptorTypes: descriptors,
    metricsId: "ui-neutral-metrics", metricsSha256: metrics.sha256, unicodeCase: UNICODE_CASE,
    metricBytes,
  });
  const snap = JSON.parse(uiRead("fixtures/documents/basic.snapshot.json"));
  const identity = compiled.payload.identity;
  snap.envelope.profileIdentity = identity;
  snap.envelope.semanticRevision = semanticRevision(snap.envelope.tree, identity, snap.envelope.bindings);
  canvas.loadSnapshot(snap);
  return { canvas, themeId: snap.presentation.themeId };
}

for (const [stop, code] of [["render", "render-stale"], ["map", "profile-type"]]) {
  test(`J5 canvas full report validates on ${stop} refusal`, async () => {
    const warn = ["pre-normalize", "post-normalize", "post-layout"];
    const { canvas, themeId } = await canvasWithExportFailure(stop, warn);
    try {
      const before = canvas.getSnapshot();
      const out = (await canvas.workshopExport({ label: "Review", themeId, formatId: "drawing" })).download.prepared;
      assert.equal(out.status, "refused");
      assert.equal(out.code, code);
      for (const phase of warn) {
        assert.ok(out.report.entries.some(e => e.stage === phase && e.severity === "warn"), `earlier warning lost at ${phase}`);
      }
      assert.deepEqual(out.diagnostics, out.report.entries);
      assert.deepEqual(validateReport(out.report), out.report, "returned report fails the Report/2 validator");
      assert.equal(new Set(out.report.entries.map(canonicalize)).size, out.report.entries.length, "returned report has duplicate entries");
      assert.deepEqual(canvas.getSnapshot(), before, "preparation mutated its input");
    } finally {
      canvas.dispose();
    }
  });
}
