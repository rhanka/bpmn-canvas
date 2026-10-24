// Lot-4 sealed-case runner: executes every sealed case in
// tests/fixtures/lot4-layout-export/expectations against the lot-4
// production modules and checks it with the sealed comparators.
// Cases whose expectation is UNSEALED are recorded, never executed.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile, compileProfile, evaluateValue } from "../dist/profile/compiler.js";
import { compilerRelease } from "../dist/profile/compiler-authority.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { layoutTicks, layoutRegions, runLayout } from "../dist/profile/lot4-layout.js";
import { renderDigests, templateGeometry, resolveTheme, verifyRenderData, viewRevisionOf } from "../dist/profile/lot4-render.js";
import { resolveLegacyTheme, checkThemeSwitch, adapterManifest, mapLegacyDiagnostics } from "../dist/profile/lot4-legacy.js";
import { exportIdPlan, mapExport, prepareExport, serializePrepared, serializeBpmn } from "../dist/profile/lot4-export.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { compilerRegistry } from "./helpers/compiler-fixture.mjs";
import * as CMP from "./fixtures/lot4-layout-export/expectations/comparators/lot4-compare.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "fixtures/lot4-layout-export/expectations");
const fixtures = join(here, "fixtures");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = p => JSON.parse(readFileSync(p, "utf8"));
const cases = readdirSync(join(root, "cases")).sort().map(f => json(join(root, "cases", f)));
const manifest = json(join(root, "manifest.json"));
const packages = new Map(manifest.packages.map(p => [p.profile.path, p]));

const readPinned = ref => {
  const bytes = readFileSync(join(fixtures, ref.path));
  assert.equal(sha(bytes), ref.sha256, `hash of ${ref.path}`);
  return bytes;
};
// The published manifest's fallback inventories are injected profile data
// (sealed artifact, never source literals): read once from the pinned
// legacy-adapter manifest artifact and pass to adapterManifest().
let manifestCodes = null;
const legacyManifestCodes = () => {
  if (!manifestCodes) {
    const artifact = json(join(root, "artifacts/legacy-adapter-manifest.json"));
    const byId = new Map(artifact.adapters.map(a => [a.id, a]));
    manifestCodes = {
      fallbackCodes: byId.get("js-legacy-export").fallbackInventory,
      workshopCodes: byId.get("js-workshop-export").fallbackInventory,
      provenance: {
        reviewedAgainst: artifact.reviewedAgainst,
        pythonTwinEntry: byId.get("python-twin-legacy-export").entry,
      },
    };
  }
  return manifestCodes;
};
const resolveArtifact = a => {
  if (a.json !== undefined) return structuredClone(a.json);
  if (a.path !== undefined) {
    const bytes = readPinned(a);
    const text = bytes.toString("utf8");
    return text.trim().startsWith("{") || text.trim().startsWith("[") ? JSON.parse(text) : bytes;
  }
  throw new Error(`unresolvable artifact ${JSON.stringify(a).slice(0, 120)}`);
};
const expectedOf = c => Object.fromEntries(c.expectedArtifacts.map(a => [a.role, resolveArtifact(a)]));
const inputOf = c => Object.fromEntries(c.inputArtifacts.map(a => [a.role, resolveArtifact(a)]));

const PREDICATE_OPS = ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId",
  "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "count", "boundRole",
  "recognizes", "reachable", "bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place",
  "emit", "loss", "remove", "refuse"];
const capabilityOf = op => op === "count" || op === "reachable" ? "selectors/1"
  : ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"].includes(op) ? "recipes/1"
  : ["emit", "loss"].includes(op) ? "export-ir/1" : "predicates/1";
const SIGNATURES = Object.fromEntries(PREDICATE_OPS.map(op =>
  [op, { capability: capabilityOf(op), version: "1", argumentSchemaDigest: "0".repeat(64) }]));
const CAPABILITIES = ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"];
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

// Build the evaluation context lot-4 operations need from a profile artifact.
function lot4Context(profileRef) {
  const profileBytes = readPinned(profileRef);
  const profile = JSON.parse(profileBytes.toString("utf8"));
  const pkg = packages.get(profileRef.path);
  assert.ok(pkg, `no package inputs for ${profileRef.path}`);
  const descriptorJson = json(join(fixtures, pkg.descriptors.path));
  const assetBytes = new Map(pkg.assets.map(a => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))]));
  const metricBytes = new Map();
  for (const resource of profile.resources ?? []) {
    const file = (resource.assetKey ?? "").split("/").pop();
    assert.ok(assetBytes.has(file), `missing asset ${resource.assetKey}`);
    metricBytes.set(resource.id, assetBytes.get(file));
  }
  // The sealed package pins the render-token registry beside the profile:
  // pass its symbolic font/dash enums as injected render data (finding 2).
  const registryJson = json(join(fixtures, pkg.registry.path));
  return {
    profile, profileBytes,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    descriptorJson,
    notions: new Map((profile.notions ?? []).map(n => [n.id, n])),
    unicodeCase: UNICODE_CASE,
    metricBytes,
    renderTokens: registryJson.renderTokens,
    registry: {
      ...compilerRegistry(),
      compilerRuleTable: compilerRelease.rules,
      capabilities: CAPABILITIES,
      signatures: SIGNATURES,
      descriptors: descriptorJson.types,
    },
    package: pkg,
  };
}

function compileInputs(ctx) {
  const profile = ctx.profile;
  const schemaBytes = readFileSync(join(fixtures, ctx.package.schema.path));
  const baseBytes = readFileSync(join(fixtures, ctx.package.base.path));
  const descriptorBytes = readFileSync(join(fixtures, ctx.package.descriptors.path));
  return {
    schemaBytes,
    compilerRuleTable: compilerRelease.rules,
    baseBytes,
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map(d => ({ ...d, digestDomain: "raw", descriptorBytes })),
    capabilities: { capabilities: CAPABILITIES, signatures: SIGNATURES },
    assetBag: new Map(ctx.package.assets.map(a => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))])),
  };
}

const keyOf = seg => (/^(0|[1-9][0-9]*)$/.test(seg) ? Number(seg) : seg);
const applyMutation = (profile, mutation) => {
  const clone = structuredClone(profile);
  const path = mutation.pointer.split("/").filter(Boolean);
  let node = clone;
  for (const seg of path.slice(0, -1)) node = node[keyOf(seg)];
  const last = keyOf(path[path.length - 1]);
  if (mutation.value === null && Array.isArray(node)) node.splice(last, 1);
  else node[last] = mutation.value;
  return clone;
};

// UNSEALED expectations: recorded, never executed.
const UNSEALED = new Map();
for (const c of cases) {
  const unsealed = (c.expectedArtifacts ?? []).filter(a => a.unsealed === true);
  if (unsealed.length) UNSEALED.set(c.caseId, unsealed.map(a => `${a.role}${a.json?.pointer ?? ""}`).join(", "));
}

async function runCase(c, inputs = inputOf(c)) {
  switch (c.operation) {
    case "layoutTicks": return layoutTicks(inputs.points ?? inputs["ticks-input"]);
    case "layoutRegions": return layoutRegions(inputs["region-input"]);
    case "templateGeometry": {
      return templateGeometry(inputs["template-input"] ?? { glyph: inputs.glyph, bounds: inputs.bounds, labelBounds: inputs.labelBounds, badgeSize: inputs.badgeSize });
    }
    case "layout": {
      const ctx = lot4Context(c.profileArtifact);
      return runLayout(ctx, { envelope: inputs.envelope, placements: inputs.placements, baseGeometry: inputs["base-geometry"] ?? inputs.baseGeometry, themeId: inputs.themeId });
    }
    case "resolveTheme": {
      const ctx = lot4Context(c.profileArtifact);
      return resolveTheme(ctx, { envelope: inputs.envelope, layout: inputs.layout, themeId: inputs.themeId, overrides: inputs.overrides, diStyles: inputs.diStyles });
    }
    case "renderDigests": return renderDigests(inputs.record);
    case "verifyRenderData": {
      const ctx = lot4Context(c.profileArtifact);
      return verifyRenderData(ctx, { envelope: inputs.envelope, layout: inputs.layout, render: inputs.render ?? inputs.r, themeId: inputs.themeId, overrides: inputs.overrides, diStyles: inputs.diStyles });
    }
    case "resolveLegacyTheme": {
      const ctx = lot4Context(c.profileArtifact);
      return resolveLegacyTheme(ctx.profile, inputs.look ?? inputs.legacyName);
    }
    case "checkThemeSwitch": {
      const ctx = lot4Context(c.profileArtifact);
      return checkThemeSwitch(ctx, inputs.from, inputs.to);
    }
    case "legacy-adapter-manifest": return adapterManifest(legacyManifestCodes());
    case "mapLegacyDiagnostics": {
      return mapLegacyDiagnostics({ adapterId: inputs.adapter, legacy: inputs.legacy, sourceIndex: inputs.sourceIndex, manifest: inputs.manifest ?? adapterManifest(legacyManifestCodes()) });
    }
    case "exportIdPlan": return exportIdPlan(inputs["plan-input"]);
    case "mapExport": {
      const ctx = lot4Context(c.profileArtifact);
      return mapExport(ctx, { envelope: inputs.envelope, layout: inputs.layout, render: inputs.render ?? inputs.r, format: inputs.format });
    }
    case "mapExportSequence": {
      const outputs = [];
      for (const step of inputs.steps) {
        const ctx = lot4Context(step.profileArtifact);
        const stepInputs = Object.fromEntries(step.inputArtifacts.map(a => [a.role, a.json !== undefined ? structuredClone(a.json) : resolveArtifact(a)]));
        outputs.push(mapExport(ctx, { envelope: stepInputs.envelope, layout: stepInputs.layout, render: stepInputs.render ?? stepInputs.r, format: stepInputs.format }));
      }
      return outputs;
    }
    case "prepareExport": {
      const ctx = lot4Context(c.profileArtifact);
      return prepareExport(ctx, { envelope: inputs.envelope, options: inputs.options });
    }
    case "serializePrepared": {
      return serializePrepared({ prepared: inputs.prepared, writerOptions: inputs.writerOptions });
    }
    case "serializePrepared-sequence": {
      const first = serializePrepared({ prepared: inputs["prepared-a"], writerOptions: inputs.writerOptions });
      const second = serializePrepared({ prepared: inputs["prepared-b"], writerOptions: inputs.writerOptions });
      const third = serializePrepared({ prepared: inputs["prepared-a"], writerOptions: inputs.writerOptions });
      const runs = [
        { label: inputs.order[0], bytes: (inputs.order[0] === "a" ? first : second).payload.bytes },
        { label: inputs.order[1], bytes: (inputs.order[1] === "a" ? first : second).payload.bytes },
        { label: inputs.order[2], bytes: (inputs.order[2] === "a" ? first : second).payload.bytes },
        { label: inputs.order[3], bytes: (inputs.order[3] === "a" ? first : second).payload.bytes },
      ];
      return runs;
    }
    case "serializeBpmn": {
      return serializeBpmn(undefined, { envelope: inputs.envelope, writerOptions: inputs.writerOptions });
    }
    case "evaluateValue": {
      const ctx = lot4Context(c.profileArtifact);
      return inputs.values.map(v => evaluateValue(v, {
        descriptors: ctx.descriptors, tree: { $type: "bpmn:Definitions", id: "empty" },
        bindings: {}, supportBindings: [], notions: ctx.notions, unicodeCase: ctx.unicodeCase,
      }));
    }
    case "theme-sequence": {
      const ctx = lot4Context(c.profileArtifact);
      const outputs = [];
      for (const step of inputs.steps) {
        const r = resolveTheme(ctx, { envelope: inputs.envelope, layout: inputs.layout, themeId: step.themeId, overrides: step.overrides ?? { semantic: [], occurrence: [] }, diStyles: step.diStyles ?? { native: [], bioc: [] } });
        assert.equal(r.status, "ok", `theme-sequence step ${step.themeId} refused`);
        const b = r.payload.binding;
        outputs.push({
          themeId: b.themeId, semanticRevision: b.semanticRevision, layoutDigest: b.layoutDigest,
          themeDigest: b.themeDigest, overridesDigest: b.overridesDigest, payloadDigest: b.payloadDigest,
          viewRevision: viewRevisionOf(b),
        });
      }
      return outputs;
    }
    case "compileProfile": {
      const profileBytes = readPinned(c.profileArtifact);
      let profile = JSON.parse(profileBytes.toString("utf8"));
      const mutation = (c.inputArtifacts ?? []).find(a => a.role === "mutation")?.json;
      if (mutation) profile = applyMutation(profile, mutation);
      const ctx = lot4Context(c.profileArtifact);
      const loaded = await loadProfile(JSON.stringify(profile), compileInputs({ ...ctx, profile }));
      if (loaded.status !== "ok") return loaded;
      return compileProfile(loaded.payload, ctx.registry);
    }
    default: throw new Error(`no runner for operation ${c.operation}`);
  }
}

const check = (id, expected, actual, ...rest) => {
  const compare = CMP.COMPARATORS[id];
  assert.ok(compare, `unknown comparator ${id}`);
  const verdict = compare(expected, actual, ...rest);
  assert.equal(verdict.ok, true, `${verdict.failures?.join("; ")}`);
};

for (const c of cases) {
  test(`lot 4: ${c.caseId}`, async () => {
    const inputs = inputOf(c);
    const snapshots = Object.values(inputs);
    const before = structuredClone(snapshots);
    const actual = await runCase(c, inputs);
    const expected = expectedOf(c);
    for (const id of c.comparatorIds) {
      if (id === "source-immutability/1") { check(id, {}, { before, after: Object.values(inputs) }); continue; }
      if (id === "determinism/1") { check(id, expected, actual); continue; }
      if (id === "drawio-structure/1") {
        const again = c.operation === "serializePrepared"
          ? serializePrepared({ prepared: inputOf(c).prepared, writerOptions: inputOf(c).writerOptions })
          : undefined;
        check(id, expected, actual, again);
        continue;
      }
      if (id === "serialize-bytes/1") { check(id, expected, actual); continue; }
      if (id === "bpmn-structure/1") { check(id, expected, actual); continue; }
      check(id, expected, actual);
    }
  });
}

// Finding 34: no shipped commit SHA in src. The adapter provenance strings
// (reviewed-against record and twin entry) are injected profile data, never
// source literals: the manifest output is unchanged, but its provenance comes
// from the caller-passed artifact.
test("lot 4: adapter provenance comes from injected data, not source literals", () => {
  const src = readFileSync(join(here, "../src/profile/lot4-legacy.ts"), "utf8");
  assert.doesNotMatch(src, /\b[0-9a-f]{40}\b/, "no shipped full commit SHA in src");
  assert.ok(!src.includes("5ba04e0") && !src.includes("1254d9a"), "no shipped commit SHA in src");
  const injected = legacyManifestCodes();
  assert.deepEqual(adapterManifest(injected), json(join(root, "artifacts/legacy-adapter-manifest.json")));
  const altered = adapterManifest({ ...injected, provenance: { reviewedAgainst: "reviewed-against", pythonTwinEntry: "python-twin-entry" } });
  assert.equal(altered.reviewedAgainst, "reviewed-against", "reviewedAgainst is injected");
  assert.equal(altered.adapters.find(a => a.id === "python-twin-legacy-export").entry, "python-twin-entry", "twin entry is injected");
});

// Finding 19 (DESIGN 14.2 lot 4 exit gate "immutable source"): the
// source-immutability/1 check must observe the inputs object the operation
// actually executed on, not two fresh copies. This witness proves the runner
// executes the caller-passed inputs: with a different valid input the sealed
// output must change.
test("lot 4: the runner executes the caller-passed inputs object", async () => {
  const c = cases.find(x => x.caseId === "ticks-001-half-even");
  const fresh = await runCase(c, inputOf(c));
  check("result-exact/1", expectedOf(c), fresh);
  const inputs = inputOf(c);
  inputs.points = [0.0015];
  const altered = await runCase(c, inputs);
  assert.notDeepEqual(altered, fresh, "runCase must execute the passed inputs object");
});

