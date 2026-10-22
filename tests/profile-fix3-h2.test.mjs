/** Fix round 3, H2 (sol G2): standalone preparation executes the real C and N
 * on the staged copy instead of admission/support checks; canvas preparation
 * runs pre-N before N; accumulated reports are kept through every refusal in
 * DESIGN stage order and refusal precedence. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile as compilePublic } from "../dist/profile/public-compiler.js";
import { compilerRelease } from "../dist/profile/compiler-authority.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { prepareExport } from "../dist/profile/lot4-export.js";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistry, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const art = join(fixtures, "lot4-layout-export/expectations/artifacts");
const read = p => readFileSync(join(art, p), "utf8");
const H = (await import("../dist/profile/canonical.js")).canonicalDigest;
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const CAPS = ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"];
const OPS = ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId",
  "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "count", "boundRole",
  "recognizes", "reachable", "bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place",
  "emit", "loss", "remove", "refuse"];
const capOf = op => op === "count" || op === "reachable" ? "selectors/1"
  : ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"].includes(op) ? "recipes/1"
  : ["emit", "loss"].includes(op) ? "export-ir/1" : "predicates/1";
const SIGS = Object.fromEntries(OPS.map(op => [op, { capability: capOf(op), version: "1", argumentSchemaDigest: "0".repeat(64) }]));

const manifest = JSON.parse(readFileSync(join(fixtures, "lot4-layout-export/expectations/manifest.json"), "utf8"));
const pkg = manifest.packages.find(p => p.profile.path.endsWith("neutral-lot4-profile.json"));
const descriptorJson = JSON.parse(readFileSync(join(fixtures, pkg.descriptors.path), "utf8"));
const schemaBytes = readFileSync(join(fixtures, pkg.schema.path));
const baseBytes = readFileSync(join(fixtures, pkg.base.path));
const descriptorBytes = readFileSync(join(fixtures, pkg.descriptors.path));
const assetBag = new Map(pkg.assets.map(a => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))]));
const metricByFile = new Map(pkg.assets.map(a => [a.path.split("/").pop(), join(fixtures, a.path)]));

function lot4Context(profile, compiled) {
  const metricBytes = new Map();
  for (const r of profile.resources ?? []) {
    const f = (r.assetKey ?? "").split("/").pop();
    if (metricByFile.has(f)) metricBytes.set(r.id, readFileSync(metricByFile.get(f)));
  }
  return {
    profile,
    compiled,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    notions: new Map((profile.notions ?? []).map(n => [n.id, n])),
    unicodeCase: UNICODE_CASE,
    metricBytes,
    registry: {
      ...uiRegistry(),
      compilerRuleTable: compilerRelease.rules,
      capabilities: CAPS,
      signatures: SIGS,
      descriptors: descriptorJson.types,
    },
  };
}

const sortedBindings = b => [...b].sort((a, c) => a.ownerId < c.ownerId ? -1 : a.ownerId > c.ownerId ? 1
  : a.role < c.role ? -1 : a.role > c.role ? 1 : a.targetId < c.targetId ? -1 : a.targetId > c.targetId ? 1 : 0);

async function compiledWitness({ mutateProfile } = {}) {
  const profile = JSON.parse(read("neutral-lot4-profile.json"));
  mutateProfile?.(profile);
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes, baseBytes,
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map(d => ({ ...d, digestDomain: "raw", descriptorBytes })),
    compilerRuleTable: compilerRelease.rules,
    capabilities: { capabilities: CAPS, signatures: SIGS },
    assetBag,
  });
  assert.equal(loaded.status, "ok", "witness profile loads");
  const compiled = await compilePublic(loaded.payload, {
    ...uiRegistry(),
    capabilities: CAPS, signatures: SIGS, descriptors: descriptorJson.types,
    compilerRuleTable: compilerRelease.rules,
  });
  assert.equal(compiled.status, "ok", "witness profile compiles");
  const identity = {
    mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
    profile: profile.profile, version: profile.version, base: profile.base,
    descriptors: profile.descriptors, sha256: H(profile),
  };
  const baseEnvelope = JSON.parse(read("main.envelope.json"));
  const envelope = { ...structuredClone(baseEnvelope), profileIdentity: identity };
  envelope.semanticRevision = H({ tree: envelope.tree, profileIdentity: identity, bindings: sortedBindings(envelope.bindings) });
  return { ctx: lot4Context(profile, compiled.payload), envelope };
}

const prepOptions = {
  format: "drawio", themeId: "plain",
  overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] },
  baseGeometry: JSON.parse(read("main.base-geometry.json")),
};

function refuseN(profile) {
  const template = profile.recipes.find(r => r.phase === "normalize");
  profile.recipes.push({
    ...structuredClone(template), id: "review-refuse-normalize",
    select: { from: "root", via: "self", where: { op: "true" }, order: "id" },
    when: { op: "true" }, writes: [],
    steps: [{ op: "refuse", code: "review-normalize-refused", target: "self" }],
  });
}

const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));

async function canvasWithFailingStage(failPhases, mutateProfile) {
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  for (const phase of failPhases) profile.rules.find(r => r.phase === phase).assert = { op: "false" };
  mutateProfile?.(profile);
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes: uiSchemaBytes,
    baseBytes: uiRead("fixtures/ui-neutral-base.json"),
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map(p => ({ ...p, digestDomain: "raw", descriptorBytes: uiRead("fixtures/ui-neutral-descriptors.json") })),
    compilerRuleTable: uiRuleTable,
    capabilities: { capabilities: uiRegistry().capabilities, signatures: uiRegistry().signatures },
    assetBag: new Map([["ui-neutral-metrics.json", uiRead("fixtures/ui-neutral-metrics.json")]]),
  });
  assert.equal(loaded.status, "ok", `canvas witness profile loads (${failPhases})`);
  const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compilePublic(loaded.payload, { ...uiRegistry(), descriptors });
  assert.equal(compiled.status, "ok", `canvas witness profile compiles (${failPhases})`);
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

test("H2 standalone: export executes an independently compiled N refusal", async () => {
  const { ctx, envelope } = await compiledWitness({ mutateProfile: refuseN });
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "refused", "standalone preparation skipped the normalize recipe");
  assert.equal(out.code, "review-normalize-refused");
});

test("H2 order: canvas pre-normalize error wins over N refusal", async () => {
  const { canvas, themeId } = await canvasWithFailingStage(["pre-normalize"], refuseN);
  const out = await canvas.workshopExport({ label: "Review", themeId, formatId: "drawing" });
  assert.equal(out.download.prepared.code, "activity-name-missing-pre-normalize");
  canvas.dispose();
});

test("H2 accumulation: warning survives N refusal in canvas preparation", async () => {
  const { canvas, themeId } = await canvasWithFailingStage(["pre-normalize"], p => {
    refuseN(p);
    p.validation.find(v => v.id === "pre-normalize" && v.policy === "accept")
      .settings.find(s => s.rule === "profile:activity-named-pre-normalize").severity = "warn";
  });
  const out = await canvas.workshopExport({ label: "Review", themeId, formatId: "drawing" });
  assert.equal(out.download.prepared.code, "review-normalize-refused");
  assert.ok(
    out.download.prepared.report.entries.some(e => e.stage === "pre-normalize" && e.severity === "warn"),
    "earlier pre-normalize report is absent",
  );
  canvas.dispose();
});
