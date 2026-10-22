/** Fix round 4, J5: late canvas refusals (post-layout, release) must return the
 * merged entries in canonical report order, deduplicated, instead of draft
 * pre/post entries appended after the accept entries. */
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
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistryFn, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const GATES = ["complete", "pre-normalize", "normalize", "post-normalize", "post-layout", "release"];

async function canvasWithLateFailure(failPhase, warnPhases) {
  const uiRegistry = uiRegistryFn();
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  const rule = profile.rules.find(r => r.phase === failPhase);
  rule.assert = { op: "false" };
  rule.code = `review-stop-${failPhase}`;
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
  assert.equal(loaded.status, "ok", `canvas witness profile loads (fail ${failPhase})`);
  const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compilePublic(loaded.payload, { ...uiRegistry, descriptors });
  assert.equal(compiled.status, "ok", `canvas witness profile compiles (fail ${failPhase})`);
  const metrics = profile.resources.find(r => r.kind === "metrics");
  const canvas = new Lot5Canvas({
    compiled: compiled.payload, profileDocument: profile, descriptorTypes: descriptors,
    metricsId: "ui-neutral-metrics", metricsSha256: metrics.sha256, unicodeCase: UNICODE_CASE,
    metricBytes: new Map([[metrics.id, uiRead("fixtures/ui-neutral-metrics.json")]]),
  });
  const snap = JSON.parse(uiRead("fixtures/documents/basic.snapshot.json"));
  const identity = compiled.payload.identity;
  snap.envelope.profileIdentity = identity;
  snap.envelope.semanticRevision = semanticRevision(snap.envelope.tree, identity, snap.envelope.bindings);
  canvas.loadSnapshot(snap);
  return { canvas, themeId: snap.presentation.themeId };
}

for (const failPhase of ["post-layout", "release"]) {
  test(`J5 canvas retains earlier warnings in canonical order on ${failPhase}`, async () => {
    const warn = ["pre-normalize", "post-normalize", "post-layout"].filter(s => GATES.indexOf(s) < GATES.indexOf(failPhase));
    const { canvas, themeId } = await canvasWithLateFailure(failPhase, warn);
    try {
      const before = canvas.getSnapshot();
      const out = (await canvas.workshopExport({ label: "Review", themeId, formatId: "drawing" })).download.prepared;
      assert.equal(out.status, "refused");
      assert.equal(out.code, `review-stop-${failPhase}`);
      for (const phase of warn) {
        assert.ok(out.report.entries.some(e => e.stage === phase && e.severity === "warn"), `earlier warning lost at ${phase}`);
      }
      assert.deepEqual(out.diagnostics, out.report.entries);
      const pos = out.report.entries.map(e => GATES.indexOf(e.stage)).filter(i => i >= 0);
      assert.deepEqual(pos, [...pos].sort((a, b) => a - b), "merged entries are not in canonical report order");
      assert.deepEqual(canvas.getSnapshot(), before, "preparation mutated its input");
    } finally {
      canvas.dispose();
    }
  });
}
