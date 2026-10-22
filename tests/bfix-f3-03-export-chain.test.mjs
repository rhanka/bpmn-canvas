// F3 finding #3: public export chain (§10.2).
// Red on 25a66ed: prepareExport is sync and resolves a layout Result;
// sparx serializes as operation-error; draw.io bytes carry no geometry or
// style; the workshop prepared report drops mapExport losses and idMap links.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilerRegistry } from "./helpers/compiler-fixture.mjs";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile as compilePublic } from "../dist/profile/public-compiler.js";
import { compilerRelease } from "../dist/profile/compiler-authority.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { resolveTheme } from "../dist/profile/lot4-render.js";
import { mapExport, prepareExport, serializePrepared } from "../dist/profile/lot4-export.js";
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

function lot4Context(profileRef) {
  const profile = JSON.parse(readPinned(profileRef).toString("utf8"));
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
  };
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

test("finding #3: prepareExport is async and resolves a PreparedArtifact", async () => {
  const x = caseOf("export-001-main-drawio");
  const xi = inputOf(x);
  const ri = inputOf(caseOf("render-001-main-plain"));
  const ctx = lot4Context(x.profileArtifact);
  const pkg = packages.get(x.profileArtifact.path);
  const loaded = await loadProfile(readPinned(x.profileArtifact).toString("utf8"), {
    schemaBytes: readFileSync(join(fixtures, pkg.schema.path)),
    baseBytes: readFileSync(join(fixtures, pkg.base.path)),
    basePin: { ...ctx.profile.base, digestDomain: "raw" },
    descriptorPins: ctx.profile.descriptors.map((d) => ({ ...d, digestDomain: "raw", descriptorBytes: readFileSync(join(fixtures, pkg.descriptors.path)) })),
    compilerRuleTable: compilerRelease.rules,
    capabilities: { capabilities: CAPABILITIES, signatures: SIGNATURES },
    assetBag: new Map(pkg.assets.map((a) => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))])),
  });
  assert.equal(loaded.status, "ok", JSON.stringify(loaded.code ?? null));
  const compiled = await compilePublic(loaded.payload, { ...ctx.registry });
  assert.equal(compiled.status, "ok", JSON.stringify(compiled.code ?? null));
  ctx.compiled = compiled.payload;
  const returned = prepareExport(ctx, {
    envelope: xi.envelope,
    options: { format: "drawio", themeId: ri.themeId, overrides: ri.overrides, diStyles: ri.diStyles, baseGeometry: xi.layout },
  });
  assert.ok(returned instanceof Promise, "prepareExport must be async per DESIGN L240/L803");
  const settled = await returned;
  assert.equal(settled.status, "ok", JSON.stringify(settled.code ?? null));
  assert.equal(settled.operation, "prepareExport");
  for (const key of ["format", "profileIdentity", "semanticRevision", "viewRevision", "ir", "renderBinding", "report", "capability", "idMap"]) {
    assert.ok(Object.hasOwn(settled.payload, key), `PreparedArtifact.${key}`);
  }
  assert.equal(settled.payload.report.operation, "prepareExport");
});

test("finding #3: sparx without a serializer refuses export-format-unsupported", () => {
  const x = caseOf("export-002-main-sparx-native");
  const xi = inputOf(x);
  const ri = inputOf(caseOf("render-001-main-plain"));
  const ctx = lot4Context(x.profileArtifact);
  const env = rebind(xi.envelope, ctx.profile);
  const rendered = resolveTheme(ctx, { envelope: env, layout: xi.layout, themeId: ri.themeId, overrides: ri.overrides, diStyles: ri.diStyles });
  assert.equal(rendered.status, "ok", JSON.stringify(rendered.code ?? null));
  const mapped = mapExport(ctx, { envelope: env, layout: xi.layout, render: rendered.payload, format: "sparx" });
  assert.equal(mapped.status, "ok", JSON.stringify(mapped.code ?? null));
  const serialized = serializePrepared({ prepared: mapped.payload, writerOptions: xi.writerOptions ?? { version: "lot4-2" } });
  assert.equal(serialized.status, "refused");
  assert.equal(serialized.code, "export-format-unsupported");
});

test("finding #3: draw.io bytes serialize bounds, waypoints, label and style", () => {
  const c = caseOf("serialize-001-main-drawio");
  const inputs = inputOf(c);
  const serialized = serializePrepared({ prepared: inputs.prepared, writerOptions: inputs.writerOptions });
  assert.equal(serialized.status, "ok", JSON.stringify(serialized.code ?? null));
  const text = Buffer.from(serialized.payload.bytes).toString("utf8");
  assert.ok((text.match(/<mxCell /g) ?? []).length > 0, "cells present");
  assert.ok((text.match(/mxGeometry/g) ?? []).length > 0, "geometry present");
  assert.ok((text.match(/ style=/g) ?? []).length > 0, "style present");
});

test("finding #3: workshop prepared report carries mapExport losses and idMap links", { timeout: 120000 }, async () => {
  const { Lot5Canvas } = await import("../dist/profile/lot5-canvas.js");
  const { compileProfile: compileLot5, compiledState } = await import("../dist/profile/public-compiler.js");
  const { compilerRegistry, ruleTable, schemaBytes } = await import("./helpers/compiler-fixture.mjs");
  const { semanticRevision } = await import("../dist/profile/envelope.js");
  const { complete } = await import("../dist/profile/completion.js");
  const { normalize } = await import("../dist/profile/normalize.js");
  const ui = join(fixtures, "lot5-ui/expectations");
  const read = (p) => readFileSync(join(ui, p));
  const profile = JSON.parse(read("fixtures/ui-neutral-profile.json"));
  profile.exports[0].capabilities.push({ when: { op: "true" }, class: "structural", losses: ["appearance"] });
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes,
    baseBytes: read("fixtures/ui-neutral-base.json"),
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map((p) => ({ ...p, digestDomain: "raw", descriptorBytes: read("fixtures/ui-neutral-descriptors.json") })),
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag: new Map([["ui-neutral-metrics.json", read("fixtures/ui-neutral-metrics.json")]]),
  });
  assert.equal(loaded.status, "ok", JSON.stringify(loaded.code ?? null));
  const descriptors = JSON.parse(read("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compileLot5(loaded.payload, { ...compilerRegistry(), descriptors });
  assert.equal(compiled.status, "ok", JSON.stringify(compiled.code ?? null));
  const metrics = profile.resources.find((r) => r.kind === "metrics");
  const canvas = new Lot5Canvas({
    compiled: compiled.payload, profileDocument: profile, descriptorTypes: descriptors,
    metricsId: "ui-neutral-metrics", metricsSha256: metrics.sha256, unicodeCase: UNICODE_CASE,
    metricBytes: new Map([[metrics.id, read("fixtures/ui-neutral-metrics.json")]]),
  });
  const snap = JSON.parse(read("fixtures/documents/basic.snapshot.json"));
  const identity = compiled.payload.identity;
  snap.envelope.profileIdentity = identity;
  snap.envelope.semanticRevision = semanticRevision(snap.envelope.tree, identity, snap.envelope.bindings);
  canvas.loadSnapshot(snap);
  const themeId = snap.presentation.themeId;
  const { download } = await canvas.workshopExport({ label: "Drawing", themeId, formatId: "drawing" });
  assert.ok(download.prepared, "workshop prepares a download");
  assert.equal(download.prepared.status, "ok", JSON.stringify(download.prepared.code ?? null));
  const preparedEntries = download.prepared.payload.report.entries ?? [];
  const preparedLosses = preparedEntries.filter((e) => e.classification === "loss").length;
  const staged = {
    documentVersion: "1", profileIdentity: identity,
    tree: structuredClone(snap.envelope.tree), bindings: structuredClone(snap.envelope.bindings),
    semanticRevision: snap.envelope.semanticRevision,
  };
  const done = await complete(compiled.payload, staged, "retained", undefined);
  assert.equal(done.status, "ok");
  const normalized = await normalize(compiled.payload, done.payload, "edit", undefined);
  assert.equal(normalized.status, "ok");
  const env = normalized.payload.envelope;
  const ctx = {
    profile, descriptors: canvas.profileView.descriptors,
    notions: new Map(canvas.profileView.notions.map((x) => [x.id, x])),
    unicodeCase: UNICODE_CASE, metricBytes: canvas.metricBytes,
    registry: compiledState(compiled.payload).registry,
  };
  const layout = canvas.renderLayout(env, themeId);
  const directRender = resolveTheme(ctx, { envelope: env, layout, themeId, overrides: snap.presentation.overrides, diStyles: snap.presentation.diStyles });
  assert.equal(directRender.status, "ok");
  const direct = mapExport(ctx, { envelope: env, layout, render: directRender.payload, format: "drawio" });
  assert.equal(direct.status, "ok");
  const directLosses = direct.payload.report.entries.filter((e) => e.classification === "loss").length;
  assert.ok(directLosses > 0, "direct mapExport sees the declared loss");
  assert.equal(preparedLosses, directLosses, "prepared report keeps every mapExport loss");
  const preparedReport = download.prepared.payload.report;
  const linked = new Set((preparedReport.artifacts ?? []).flatMap((a) => a.entryIndexes ?? []));
  preparedEntries.forEach((entry, index) => {
    if (entry.classification === "loss") assert.ok(linked.has(index), `loss entry ${index} reachable through entryIndexes`);
  });
  assert.ok(linked.size > 0, "prepared artifacts link entries");
  assert.deepEqual(preparedReport.idMap, direct.payload.report.idMap, "prepared report keeps the mapExport idMap");
  const hostReport = download.callbacks?.[0]?.report;
  assert.ok(hostReport, "host callback carries a report");
  assert.equal(hostReport.entries.filter((e) => e.classification === "loss").length, directLosses, "host callback keeps the losses");
});
