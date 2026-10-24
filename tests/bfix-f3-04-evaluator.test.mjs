// F3 finding #4: export/capability evaluation must delegate to the shared
// evaluator (DESIGN L107-L117, L132, L136-L150, L774).
// Red on 25a66ed: a valid concat emit field refuses export-field-invalid;
// a textPrefix capability matches nothing while the equal form matches.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilerRegistry } from "./helpers/compiler-fixture.mjs";

import { loadProfile, compileProfile } from "../dist/profile/compiler.js";
import { compilerRelease } from "../dist/profile/compiler-authority.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { resolveTheme } from "../dist/profile/lot4-render.js";
import { mapExport } from "../dist/profile/lot4-export.js";
import { canonicalDigest } from "../dist/profile/canonical.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const root = join(fixtures, "lot4-layout-export/expectations");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const H = (value) => canonicalDigest(value);
const caseOf = (id) => json(join(root, "cases", `${id}.json`));
const manifest = json(join(root, "manifest.json"));
const packages = new Map(manifest.packages.map((p) => [p.profile.path, p]));

const PREDICATE_OPS = ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId",
  "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "count", "boundRole",
  "recognizes", "reachable", "bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place",
  "emit", "loss", "remove", "refuse"];
const capabilityOf = (op) => op === "count" || op === "reachable" ? "selectors/1"
  : ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"].includes(op) ? "recipes/1"
  : ["emit", "loss"].includes(op) ? "export-ir/1" : "predicates/1";
const SIGNATURES = Object.fromEntries(PREDICATE_OPS.map((op) =>
  [op, { capability: capabilityOf(op), version: "1", argumentSchemaDigest: "0".repeat(64) }]));
const CAPABILITIES = ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"];
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const readPinned = (ref) => {
  const bytes = readFileSync(join(fixtures, ref.path));
  assert.equal(sha(bytes), ref.sha256, `hash of ${ref.path}`);
  return bytes;
};
const resolveArtifact = (a) => {
  if (a.json !== undefined) return structuredClone(a.json);
  const bytes = readPinned(a);
  const text = bytes.toString("utf8");
  return text.trim().startsWith("{") || text.trim().startsWith("[") ? JSON.parse(text) : bytes;
};
const inputOf = (c) => Object.fromEntries(c.inputArtifacts.map((a) => [a.role, resolveArtifact(a)]));

function lot4Context(profileRef, mutate) {
  const profile = JSON.parse(readPinned(profileRef).toString("utf8"));
  if (mutate) mutate(profile);
  const pkg = packages.get(profileRef.path);
  const descriptorJson = json(join(fixtures, pkg.descriptors.path));
  const assetBytes = new Map(pkg.assets.map((a) => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))]));
  const metricBytes = new Map();
  for (const resource of profile.resources ?? []) {
    metricBytes.set(resource.id, assetBytes.get((resource.assetKey ?? "").split("/").pop()));
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
      capabilities: CAPABILITIES,
      signatures: SIGNATURES,
      descriptors: descriptorJson.types,
    },
    package: pkg,
  };
}

async function compileCtx(ctx) {
  const pkg = ctx.package;
  const descriptorBytes = readFileSync(join(fixtures, pkg.descriptors.path));
  const loaded = await loadProfile(JSON.stringify(ctx.profile), {
    schemaBytes: readFileSync(join(fixtures, pkg.schema.path)),
    compilerRuleTable: compilerRelease.rules,
    baseBytes: readFileSync(join(fixtures, pkg.base.path)),
    basePin: { ...ctx.profile.base, digestDomain: "raw" },
    descriptorPins: ctx.profile.descriptors.map((d) => ({ ...d, digestDomain: "raw", descriptorBytes })),
    capabilities: { capabilities: CAPABILITIES, signatures: SIGNATURES },
    assetBag: new Map(pkg.assets.map((a) => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))])),
  });
  if (loaded.status !== "ok") return loaded;
  return compileProfile(loaded.payload, ctx.registry);
}

const sortedBindings = (bindings) => [...bindings].sort((a, b) =>
  a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1
  : a.role < b.role ? -1 : a.role > b.role ? 1
  : a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);
const rebind = (envelope, profile) => {
  const profileIdentity = {
    mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
    profile: profile.profile, version: profile.version, base: profile.base,
    descriptors: profile.descriptors, sha256: H(profile),
  };
  return {
    ...structuredClone(envelope),
    profileIdentity,
    semanticRevision: H({ tree: envelope.tree, profileIdentity, bindings: sortedBindings(envelope.bindings) }),
  };
};

test("finding #4: a valid concat emit field evaluates through the shared grammar", async () => {
  const x = caseOf("export-001-main-drawio");
  const xi = inputOf(x);
  const ri = inputOf(caseOf("render-001-main-plain"));
  const ctx = lot4Context(x.profileArtifact, (p) => {
    const recipe = p.recipes.find((r) => r.id === "export-pages");
    recipe.steps[0].fields.find((f) => f.name === "name").value =
      { op: "concat", values: [{ op: "literal", value: "P-" }, { op: "read", binding: "self", path: "/name" }] };
  });
  assert.equal((await compileCtx(ctx)).status, "ok", "concat page name compiles");
  const env = rebind(xi.envelope, ctx.profile);
  const rendered = resolveTheme(ctx, { envelope: env, layout: xi.layout, themeId: ri.themeId, overrides: ri.overrides, diStyles: ri.diStyles });
  assert.equal(rendered.status, "ok", JSON.stringify(rendered.code ?? null));
  const mapped = mapExport(ctx, { envelope: env, layout: xi.layout, render: rendered.payload, format: xi.format });
  assert.equal(mapped.status, "ok", JSON.stringify(mapped.code ?? null));
  const names = mapped.payload.ir.filter((r) => r.kind === "page").map((r) => r.name);
  assert.ok(names.length > 0 && names.every((n) => n.startsWith("P-")), `page names carry the concat prefix: ${JSON.stringify(names)}`);
});

test("finding #4: a textPrefix capability matches like its equal form", async () => {
  const x = caseOf("export-001-main-drawio");
  const xi = inputOf(x);
  const ri = inputOf(caseOf("render-001-main-plain"));
  const names = [];
  const collect = (n) => {
    if (n && typeof n === "object") {
      if (typeof n.name === "string" && n.$type === "bpmn:Task") names.push(n.name);
      for (const v of Object.values(n)) collect(v);
    }
  };
  collect(xi.envelope.tree);
  assert.ok(names.length > 0, "fixture has named tasks");
  const prefix = names[0].slice(0, 1);
  const capability = (where) => ({
    when: { op: "count", min: 1, select: { from: "self", via: "semantic", where, order: "id" } },
    class: "structural",
    losses: ["appearance"],
  });
  const run = async (which) => {
    const ctx = lot4Context(x.profileArtifact, (p) => {
      p.exports.find((e) => e.format === "drawio").capabilities.push(which === "prefix"
        ? capability({ op: "textPrefix", value: { op: "read", binding: "self", path: "/name" }, prefix, trim: "none" })
        : capability({ op: "equal", left: { op: "read", binding: "self", path: "/name" }, right: { op: "literal", value: names[0] } }));
    });
    assert.equal((await compileCtx(ctx)).status, "ok", `${which} capability compiles`);
    const env = rebind(xi.envelope, ctx.profile);
    const rendered = resolveTheme(ctx, { envelope: env, layout: xi.layout, themeId: ri.themeId, overrides: ri.overrides, diStyles: ri.diStyles });
    assert.equal(rendered.status, "ok", JSON.stringify(rendered.code ?? null));
    const mapped = mapExport(ctx, { envelope: env, layout: xi.layout, render: rendered.payload, format: xi.format });
    assert.equal(mapped.status, "ok", JSON.stringify(mapped.code ?? null));
    return mapped.payload.report.entries.filter((e) => e.lossClass === "appearance").length;
  };
  const byEqual = await run("equal");
  const byPrefix = await run("prefix");
  assert.ok(byEqual > 0, "equal capability emits appearance losses");
  assert.equal(byPrefix, byEqual, "textPrefix capability emits the same appearance losses");
});
