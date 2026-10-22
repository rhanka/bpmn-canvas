/** Fix round 4, J2: standalone preparation requires a compiled handle.
 * Without a valid handle preparation refuses explicitly; there is no
 * reduced mode that skips the C/N stages and still returns success. */
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
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const art = join(fixtures, "lot4-layout-export/expectations/artifacts");
const read = p => readFileSync(join(art, p), "utf8");
const H = (await import("../dist/profile/canonical.js")).canonicalDigest;
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
const uiRegistry = compilerRegistry();

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

const sortedBindings = b => [...b].sort((a, c) => a.ownerId < c.ownerId ? -1 : a.ownerId > c.ownerId ? 1
  : a.role < c.role ? -1 : a.role > c.role ? 1 : a.targetId < c.targetId ? -1 : a.targetId > c.targetId ? 1 : 0);

async function compiledWitness({ failPhase } = {}) {
  const profile = JSON.parse(read("neutral-lot4-profile.json"));
  if (failPhase) {
    const template = profile.recipes.find(r => r.phase === failPhase);
    profile.recipes.push({
      ...structuredClone(template), id: `review-stop-${failPhase}`,
      select: { from: "root", via: "self", where: { op: "true" }, order: "id" },
      when: { op: "true" }, writes: [],
      steps: [{ op: "refuse", code: `review-stop-${failPhase}`, target: "self" }],
    });
  }
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
    ...uiRegistry,
    capabilities: CAPS, signatures: SIGS, descriptors: descriptorJson.types,
    compilerRuleTable: compilerRelease.rules,
  });
  assert.equal(compiled.status, "ok", "witness profile compiles");
  const metricBytes = new Map();
  for (const r of profile.resources ?? []) {
    const f = (r.assetKey ?? "").split("/").pop();
    if (metricByFile.has(f)) metricBytes.set(r.id, readFileSync(metricByFile.get(f)));
  }
  const identity = {
    mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
    profile: profile.profile, version: profile.version, base: profile.base,
    descriptors: profile.descriptors, sha256: H(profile),
  };
  const baseEnvelope = JSON.parse(read("main.envelope.json"));
  const envelope = { ...structuredClone(baseEnvelope), profileIdentity: identity };
  envelope.semanticRevision = H({ tree: envelope.tree, profileIdentity: identity, bindings: sortedBindings(envelope.bindings) });
  const ctx = {
    profile, compiled: compiled.payload,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    notions: new Map((profile.notions ?? []).map(n => [n.id, n])),
    unicodeCase: UNICODE_CASE, metricBytes,
    registry: {
      ...uiRegistry,
      compilerRuleTable: compilerRelease.rules,
      capabilities: CAPS, signatures: SIGS, descriptors: descriptorJson.types,
    },
  };
  return { ctx, envelope };
}

const prepOptions = {
  format: "drawio", themeId: "plain",
  overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] },
  baseGeometry: JSON.parse(read("main.base-geometry.json")),
};

for (const failPhase of ["complete", "normalize"]) {
  test(`J2 standalone without handle must refuse ${failPhase}`, async () => {
    const { ctx, envelope } = await compiledWitness({ failPhase });
    const before = structuredClone(envelope);
    delete ctx.compiled;
    const out = await prepareExport(ctx, { envelope, options: prepOptions });
    assert.equal(out.status, "refused", "no-handle preparation skipped a mandatory stage and exported");
    assert.equal(Object.hasOwn(out, "payload"), false);
    assert.deepEqual(envelope, before, "preparation mutated its input");
  });
}
