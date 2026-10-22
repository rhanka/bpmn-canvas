// G2: both export preparation paths run the full DESIGN stage order
// (C, pre-normalize, N, post-normalize, layout, post-layout, release,
// then R/map) under accept, keeping accumulated reports.
// Red on 7703290: independently compiled profiles failing at post-N,
// post-layout or release still prepare successfully on both paths.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilerRegistry } from "./helpers/compiler-fixture.mjs";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile } from "../dist/profile/public-compiler.js";
import { compilerRelease } from "../dist/profile/compiler-authority.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { prepareExport } from "../dist/profile/lot4-export.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const art = join(fixtures, "lot4-layout-export/expectations/artifacts");
const read = (p) => readFileSync(join(art, p), "utf8");
const H = (await import("../dist/profile/canonical.js")).canonicalDigest;
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const CAPS = ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"];
const OPS = ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId",
  "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "count", "boundRole",
  "recognizes", "reachable", "bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place",
  "emit", "loss", "remove", "refuse"];
const capOf = (op) => op === "count" || op === "reachable" ? "selectors/1"
  : ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"].includes(op) ? "recipes/1"
  : ["emit", "loss"].includes(op) ? "export-ir/1" : "predicates/1";
const SIGS = Object.fromEntries(OPS.map((op) => [op, { capability: capOf(op), version: "1", argumentSchemaDigest: "0".repeat(64) }]));

const manifest = JSON.parse(readFileSync(join(fixtures, "lot4-layout-export/expectations/manifest.json"), "utf8"));
const pkg = manifest.packages.find((p) => p.profile.path.endsWith("neutral-lot4-profile.json"));
const descriptorJson = JSON.parse(readFileSync(join(fixtures, pkg.descriptors.path), "utf8"));
const schemaBytes = readFileSync(join(fixtures, pkg.schema.path));
const baseBytes = readFileSync(join(fixtures, pkg.base.path));
const descriptorBytes = readFileSync(join(fixtures, pkg.descriptors.path));
const assetBag = new Map(pkg.assets.map((a) => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))]));
const metricByFile = new Map(pkg.assets.map((a) => [a.path.split("/").pop(), join(fixtures, a.path)]));

function lot4Context(profile) {
  const metricBytes = new Map();
  for (const r of profile.resources ?? []) {
    const f = (r.assetKey ?? "").split("/").pop();
    if (metricByFile.has(f)) metricBytes.set(r.id, readFileSync(metricByFile.get(f)));
  }
  return {
    profile,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    notions: new Map((profile.notions ?? []).map((n) => [n.id, n])),
    unicodeCase: UNICODE_CASE,
    metricBytes,
    registry: {
      ...compilerRegistry(),
      compilerRuleTable: compilerRelease.rules,
      capabilities: CAPS,
      signatures: SIGS,
      descriptors: descriptorJson.types,
    },
  };
}

const sortedBindings = (b) => [...b].sort((a, c) => a.ownerId < c.ownerId ? -1 : a.ownerId > c.ownerId ? 1
  : a.role < c.role ? -1 : a.role > c.role ? 1 : a.targetId < c.targetId ? -1 : a.targetId > c.targetId ? 1 : 0);

// An independently compiled witness profile: valid load + compile, with the
// rule of exactly one accept stage forced to fail.
async function compiledWitness({ failPhases, warnPreNormalize = false, envelopeName = "main.envelope.json" }) {
  const profile = JSON.parse(read("neutral-lot4-profile.json"));
  for (const phase of failPhases) profile.rules.find((r) => r.phase === phase).assert = { op: "false" };
  if (warnPreNormalize) {
    // A non-blocking pre-N finding: the pre-N rule also fails, but its
    // accept severity is warn, so preparation must continue (and keep the
    // warn entry) instead of refusing at pre-N.
    profile.rules.find((r) => r.phase === "pre-normalize").assert = { op: "false" };
    const record = profile.validation.find((v) => v.id === "pre-normalize" && v.policy === "accept");
    record.settings.find((s) => s.rule === "profile:task-named-pre-normalize").severity = "warn";
  }
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes, baseBytes,
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map((d) => ({ ...d, digestDomain: "raw", descriptorBytes })),
    compilerRuleTable: compilerRelease.rules,
    capabilities: { capabilities: CAPS, signatures: SIGS },
    assetBag,
  });
  assert.equal(loaded.status, "ok", `witness profile loads (${failPhases})`);
  const compiled = await compileProfile(loaded.payload, {
    ...compilerRegistry(),
    capabilities: CAPS, signatures: SIGS, descriptors: descriptorJson.types,
    compilerRuleTable: compilerRelease.rules,
  });
  assert.equal(compiled.status, "ok", `witness profile compiles (${failPhases})`);
  const identity = {
    mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
    profile: profile.profile, version: profile.version, base: profile.base,
    descriptors: profile.descriptors, sha256: H(profile),
  };
  const baseEnvelope = JSON.parse(read(envelopeName));
  const envelope = { ...structuredClone(baseEnvelope), profileIdentity: identity };
  envelope.semanticRevision = H({ tree: envelope.tree, profileIdentity: identity, bindings: sortedBindings(envelope.bindings) });
  const ctx = lot4Context(profile);
  ctx.compiled = compiled.payload;
  return { ctx, envelope };
}

const prepOptions = {
  format: "drawio", themeId: "plain",
  overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] },
  baseGeometry: JSON.parse(read("main.base-geometry.json")),
};

test("G2 path 1: failing post-normalize assertion refuses preparation", async () => {
  const { ctx, envelope } = await compiledWitness({ failPhases: ["post-normalize"] });
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "refused");
  assert.equal(out.code, "task-name-missing");
  assert.ok(out.report.entries.some((e) => e.stage === "post-normalize" && e.severity === "error"));
});

test("G2 path 1: failing post-layout assertion refuses preparation", async () => {
  const { ctx, envelope } = await compiledWitness({ failPhases: ["post-layout"] });
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "refused");
  assert.equal(out.code, "task-name-missing-post-layout");
});

test("G2 path 1: failing release assertion refuses preparation", async () => {
  const { ctx, envelope } = await compiledWitness({ failPhases: ["release"] });
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "refused");
  assert.equal(out.code, "task-name-missing-release");
});

test("G2 path 1: stages run in DESIGN order (post-N refusal wins over release)", async () => {
  const { ctx, envelope } = await compiledWitness({ failPhases: ["post-normalize", "release"] });
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "refused");
  assert.equal(out.code, "task-name-missing");
});

test("G2 path 1: refused report keeps earlier non-blocking entries in stage order", async () => {
  const { ctx, envelope } = await compiledWitness({
    failPhases: ["post-normalize"], warnPreNormalize: true,
  });
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "refused");
  assert.equal(out.code, "task-name-missing");
  const stages = out.report.entries.map((e) => e.stage);
  assert.ok(stages.includes("pre-normalize") && stages.includes("post-normalize"));
  assert.ok(stages.indexOf("pre-normalize") < stages.indexOf("post-normalize"));
  assert.equal(out.report.entries[0].severity, "warn");
  assert.deepEqual(out.diagnostics, out.report.entries);
});

// ---------------------------------------------------------- path 2 (canvas)
// The Lot5Canvas preparation path (workshopExport): C + accept gates + N,
// then layout, R, map. Post-layout and release accept gates are missing on
// 7703290: a failing post-layout/release assertion still downloads.
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { compileProfile as compileLot5 } from "../dist/profile/public-compiler.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { compilerRegistry as uiRegistry, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = (p) => readFileSync(join(uiDir, p));

async function canvasWithFailingStage(failPhases) {
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  for (const phase of failPhases) profile.rules.find((r) => r.phase === phase).assert = { op: "false" };
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes: uiSchemaBytes,
    baseBytes: uiRead("fixtures/ui-neutral-base.json"),
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map((p) => ({ ...p, digestDomain: "raw", descriptorBytes: uiRead("fixtures/ui-neutral-descriptors.json") })),
    compilerRuleTable: uiRuleTable,
    capabilities: { capabilities: uiRegistry().capabilities, signatures: uiRegistry().signatures },
    assetBag: new Map([["ui-neutral-metrics.json", uiRead("fixtures/ui-neutral-metrics.json")]]),
  });
  assert.equal(loaded.status, "ok", `canvas witness profile loads (${failPhases})`);
  const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compileLot5(loaded.payload, { ...uiRegistry(), descriptors });
  assert.equal(compiled.status, "ok", `canvas witness profile compiles (${failPhases})`);
  const metrics = profile.resources.find((r) => r.kind === "metrics");
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

test("G2 path 2: failing post-layout assertion refuses workshop export", { timeout: 120000 }, async () => {
  const { canvas, themeId } = await canvasWithFailingStage(["post-layout"]);
  const { download } = await canvas.workshopExport({ label: "Drawing", themeId, formatId: "drawing" });
  assert.equal(download.prepared.status, "refused");
  assert.equal(download.prepared.code, "activity-name-missing-post-layout");
});

test("G2 path 2: failing release assertion refuses workshop export", { timeout: 120000 }, async () => {
  const { canvas, themeId } = await canvasWithFailingStage(["release"]);
  const { download } = await canvas.workshopExport({ label: "Drawing", themeId, formatId: "drawing" });
  assert.equal(download.prepared.status, "refused");
  assert.equal(download.prepared.code, "activity-name-missing-release");
});

test("G2 path 2: post-layout refusal wins over release (DESIGN order)", { timeout: 120000 }, async () => {
  const { canvas, themeId } = await canvasWithFailingStage(["post-layout", "release"]);
  const { download } = await canvas.workshopExport({ label: "Drawing", themeId, formatId: "drawing" });
  assert.equal(download.prepared.status, "refused");
  assert.equal(download.prepared.code, "activity-name-missing-post-layout");
});
