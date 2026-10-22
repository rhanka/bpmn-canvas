/** Fix round 4, J3: a valid C correction changes the staged revision, so the
 * successful result must carry the final staged revision (result revision
 * and report output revision), keeping the input revision as the base. */
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
import { semanticRevision } from "../dist/profile/envelope.js";
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

async function compiledWitness() {
  const profile = JSON.parse(read("neutral-lot4-profile.json"));
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

test("J3 standalone C revision must identify the staged output", async () => {
  const { ctx, envelope } = await compiledWitness();
  const before = structuredClone(envelope);
  const process = envelope.tree.rootElements.find(n => n.$type === "bpmn:Process");
  delete process.isExecutable;
  envelope.semanticRevision = semanticRevision(envelope.tree, envelope.profileIdentity, envelope.bindings);
  const inputRevision = envelope.semanticRevision;
  const input = structuredClone(envelope);
  const { complete } = await import("../dist/profile/completion.js");
  const { normalize } = await import("../dist/profile/normalize.js");
  const completed = await complete(ctx.compiled, envelope, "retained", undefined);
  assert.equal(completed.status, "ok");
  const normalized = await normalize(ctx.compiled, completed.payload, "edit", undefined);
  assert.equal(normalized.status, "ok");
  assert.notEqual(normalized.payload.envelope.semanticRevision, inputRevision);
  const out = await prepareExport(ctx, { envelope, options: prepOptions });
  assert.equal(out.status, "ok", `valid staged correction was refused with ${out.code}`);
  assert.notEqual(out.payload.semanticRevision, inputRevision, "completion did not change the witness");
  assert.equal(out.revision, out.payload.semanticRevision, "result revision still identifies the source");
  assert.equal(out.report.inputRevision, inputRevision);
  assert.equal(out.report.outputRevision, out.payload.semanticRevision);
  assert.deepEqual(envelope, input, "preparation mutated its input");
  assert.deepEqual(before.profileIdentity, out.profileIdentity);
});
