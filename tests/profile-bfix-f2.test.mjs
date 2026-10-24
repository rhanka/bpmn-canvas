// Block-B fix round F2 (render/layout): execution tests for findings 2, 5,
// 6, 7, 28 and 29. Each section first failed on the 25a66ed squash for the
// reason stated in OPUS-BLOCKB-REVIEW, then passed after the fix. Sealed
// fixtures are only read, never modified; second neutral profiles are built
// in memory by mutating the pinned profile with different values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { canonicalDigest } from "../dist/profile/canonical.js";
import { resolveTheme } from "../dist/profile/lot4-render.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const json = p => JSON.parse(readFileSync(p, "utf8"));
const H = v => canonicalDigest(v);
const UNICODE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const PROFILE_PATH = "lot4-layout-export/expectations/artifacts/neutral-lot4-profile.json";
const manifest = json(join(fixtures, "lot4-layout-export/expectations/manifest.json"));
const pkg = manifest.packages.find(p => p.profile.path === PROFILE_PATH);
assert.ok(pkg, "sealed package inputs for the neutral lot4 profile");

const descriptorJson = json(join(fixtures, pkg.descriptors.path));
const sealedRegistry = json(join(fixtures, pkg.registry.path));

function lot4Context(profile, renderTokens) {
  const assetBytes = new Map(pkg.assets.map(a => [a.path.split("/").pop(), readFileSync(join(fixtures, a.path))]));
  const metricBytes = new Map();
  for (const resource of profile.resources ?? []) {
    metricBytes.set(resource.id, assetBytes.get((resource.assetKey ?? "").split("/").pop()));
  }
  return {
    profile,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    notions: new Map((profile.notions ?? []).map(n => [n.id, n])),
    unicodeCase: UNICODE,
    metricBytes,
    ...(renderTokens === undefined ? {} : { renderTokens }),
  };
}

const identityOf = profile => ({ mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
  profile: profile.profile, version: profile.version, base: profile.base, descriptors: profile.descriptors, sha256: H(profile) });
const sortedBindings = b => [...b].sort((x, y) => x.ownerId < y.ownerId ? -1 : x.ownerId > y.ownerId ? 1 : x.role < y.role ? -1 : x.role > y.role ? 1 : x.targetId < y.targetId ? -1 : x.targetId > y.targetId ? 1 : 0);
function rebind(envelope, profile) {
  const profileIdentity = identityOf(profile);
  return { ...structuredClone(envelope), profileIdentity,
    semanticRevision: H({ tree: envelope.tree, profileIdentity, bindings: sortedBindings(envelope.bindings) }) };
}

function renderCaseInputs() {
  const c = json(join(fixtures, "lot4-layout-export/expectations/cases/render-001-main-plain.json"));
  const byRole = Object.fromEntries(c.inputArtifacts.map(a => [a.role,
    a.json !== undefined ? structuredClone(a.json) : json(join(fixtures, a.path))]));
  return byRole;
}

// ---- Finding 2a: font and dash vocabularies come from injected data ----

test("F2-02a: theme-declared font family resolves (second profile value)", () => {
  const profile = json(join(fixtures, PROFILE_PATH));
  for (const t of profile.themes) for (const tok of t.tokens ?? []) {
    if (tok.name === "fontFamily") tok.value = "Inter";
  }
  const inputs = renderCaseInputs();
  const ctx = lot4Context(profile, sealedRegistry.renderTokens);
  const r = resolveTheme(ctx, { envelope: rebind(inputs.envelope, profile), layout: inputs.layout,
    themeId: inputs.themeId, overrides: inputs.overrides, diStyles: inputs.diStyles });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
});

test("F2-02a: registry-declared font family resolves without profile declaration", () => {
  const profile = json(join(fixtures, PROFILE_PATH));
  const inputs = renderCaseInputs();
  const first = inputs.layout.geometry.find(g => g.semanticId);
  const registry = structuredClone(sealedRegistry.renderTokens);
  registry.find(e => e.name === "fontFamily").schema.enum.push("SecondSans");
  const ctx = lot4Context(profile, registry);
  const overrides = { semantic: [{ semanticId: first.semanticId, tokens: [{ name: "fontFamily", value: "SecondSans" }] }], occurrence: [] };
  const r = resolveTheme(ctx, { envelope: inputs.envelope, layout: inputs.layout,
    themeId: inputs.themeId, overrides, diStyles: inputs.diStyles });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
});

test("F2-02a: profile-declared dash style resolves without registry declaration", () => {
  const profile = json(join(fixtures, PROFILE_PATH));
  for (const n of profile.notions ?? []) for (const b of n.renderBindings ?? []) for (const tok of b.tokens ?? []) {
    if (tok.name === "dash") tok.value = "dotted";
  }
  const inputs = renderCaseInputs();
  const first = inputs.layout.geometry.find(g => g.semanticId);
  const ctx = lot4Context(profile, sealedRegistry.renderTokens);
  const overrides = { semantic: [{ semanticId: first.semanticId, tokens: [{ name: "dash", value: "dotted" }] }], occurrence: [] };
  const r = resolveTheme(ctx, { envelope: rebind(inputs.envelope, profile), layout: inputs.layout,
    themeId: inputs.themeId, overrides, diStyles: inputs.diStyles });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
});

test("F2-02a: registry-declared dash style resolves without profile declaration", () => {
  const profile = json(join(fixtures, PROFILE_PATH));
  const inputs = renderCaseInputs();
  const first = inputs.layout.geometry.find(g => g.semanticId);
  const registry = structuredClone(sealedRegistry.renderTokens);
  registry.find(e => e.name === "dash").schema.enum.push("dotted");
  const ctx = lot4Context(profile, registry);
  const overrides = { semantic: [{ semanticId: first.semanticId, tokens: [{ name: "dash", value: "dotted" }] }], occurrence: [] };
  const r = resolveTheme(ctx, { envelope: inputs.envelope, layout: inputs.layout,
    themeId: inputs.themeId, overrides, diStyles: inputs.diStyles });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
});

test("F2-02a: family in neither registry nor profile stays refused", () => {
  const profile = json(join(fixtures, PROFILE_PATH));
  const inputs = renderCaseInputs();
  const first = inputs.layout.geometry.find(g => g.semanticId);
  const ctx = lot4Context(profile, sealedRegistry.renderTokens);
  const overrides = { semantic: [{ semanticId: first.semanticId, tokens: [{ name: "fontFamily", value: "Arial" }] }], occurrence: [] };
  const r = resolveTheme(ctx, { envelope: inputs.envelope, layout: inputs.layout,
    themeId: inputs.themeId, overrides, diStyles: inputs.diStyles });
  assert.equal(r.status, "refused");
  assert.equal(r.code, "render-token-invalid");
});

// ---- Finding 2b: band processRef check derived from the ensure recipe ----

test("F2-02b: renamed band role carrying processRef is refused", async () => {
  const { lot3Compile } = await import("./helpers/lot3-compile.mjs");
  const { normalize } = await import("../dist/profile/normalize.js");
  const { semanticRevision } = await import("../dist/profile/envelope.js");
  const c = json(join(fixtures, "lot3-cn/expectations/cases/l3-n-binding-band-process-ref.json"));
  const env0 = structuredClone(c.inputArtifacts.find(a => a.role === "envelope").json);
  const { compiled } = await lot3Compile("main", profile => {
    profile.recipes = JSON.parse(JSON.stringify(profile.recipes).replaceAll("\"reference-band\"", "\"ref-zone\""));
    profile.rules = JSON.parse(JSON.stringify(profile.rules ?? []).replaceAll("\"reference-band\"", "\"ref-zone\""));
    profile.notions = JSON.parse(JSON.stringify(profile.notions ?? []).replaceAll("\"reference-band\"", "\"ref-zone\""));
  });
  assert.equal(compiled.status, "ok", `renamed profile must compile, got ${compiled.status}:${compiled.code ?? ""}`);
  const renamed = env0.bindings.map(b => (b.role === "reference-band" ? { ...b, role: "ref-zone" } : b))
    .sort((a, b) => a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
  const env = { ...structuredClone(env0), bindings: renamed, profileIdentity: compiled.payload.identity };
  env.semanticRevision = semanticRevision(env.tree, env.profileIdentity, env.bindings);
  const r = await normalize(compiled.payload, env, "qualification", undefined);
  assert.equal(r.status, "refused", `expected refusal, got ${r.status}`);
  assert.equal(r.code, "support-binding-conflict");
});

test("F2-02b guard: baseline band role carrying processRef stays refused", async () => {
  const { compileByPath } = await import("./helpers/lot3-compile.mjs");
  const { normalize } = await import("../dist/profile/normalize.js");
  const c = json(join(fixtures, "lot3-cn/expectations/cases/l3-n-binding-band-process-ref.json"));
  const env0 = structuredClone(c.inputArtifacts.find(a => a.role === "envelope").json);
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const r = await normalize(compiled.payload, env0, "qualification", undefined);
  assert.equal(r.status, "refused");
  assert.equal(r.code, "support-binding-conflict");
});

// ---- Finding 2c: draw.io serializer driven by writerOptions ----

function serializeCase() {
  const c = json(join(fixtures, "lot4-layout-export/expectations/cases/serialize-001-main-drawio.json"));
  return Object.fromEntries(c.inputArtifacts.map(a => [a.role,
    a.json !== undefined ? structuredClone(a.json) : json(join(fixtures, a.path))]));
}

test("F2-02c: mxfile version comes from writerOptions (second profile value)", async () => {
  const { serializePrepared } = await import("../dist/profile/lot4-export.js");
  const inputs = serializeCase();
  inputs.writerOptions.version = "custom-9";
  const r = serializePrepared({ prepared: inputs.prepared, writerOptions: inputs.writerOptions });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
  const text = new TextDecoder().decode(r.payload.bytes);
  assert.match(text, /^<mxfile version="custom-9">/);
});

test("F2-02c: sealed lot4-2 writerOptions version is honored", async () => {
  const { serializePrepared } = await import("../dist/profile/lot4-export.js");
  const inputs = serializeCase();
  assert.equal(inputs.writerOptions.version, "lot4-2");
  const r = serializePrepared({ prepared: inputs.prepared, writerOptions: inputs.writerOptions });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
  const text = new TextDecoder().decode(r.payload.bytes);
  assert.match(text, /^<mxfile version="lot4-2">/);
});

test("F2-02c: missing serializer version is refused", async () => {
  const { serializePrepared } = await import("../dist/profile/lot4-export.js");
  const inputs = serializeCase();
  const r = serializePrepared({ prepared: inputs.prepared, writerOptions: {} });
  assert.equal(r.status, "refused");
  assert.equal(r.code, "export-format-unsupported");
});

// ---- Finding 2d: paste rewriting driven by descriptors ----

function lot4Driver() {
  return import("../dist/profile/native-contracts.js").then(({ descriptorIndex }) => ({
    descriptors: descriptorIndex({ types: json(join(fixtures,
      "lot4-layout-export/expectations/artifacts/neutral-lot4-descriptors.json")).types }),
    idRefScalars: [],
  }));
}

test("F2-02d: paste rewriting follows descriptor reference members", async () => {
  const { rewriteRefs, danglingRefs } = await import("../dist/profile/lot5-support.js");
  const driver = await lot4Driver();
  const map = new Map([["Flow_2", "g_flow"], ["Flow_1", "g_1"], ["Task_A", "g_a"]]);
  const fragment = { $type: "bpmn:ExclusiveGateway", id: "Gw",
    default: "Flow_2", outgoing: ["Flow_2"], incoming: ["Flow_1"] };
  rewriteRefs(fragment, map, driver);
  // No descriptor declares gateway `default`: descriptor-driven rewriting
  // leaves it alone (data gap, reported separately).
  assert.equal(fragment.default, "Flow_2");
  assert.deepEqual(fragment.outgoing, ["g_flow"]);
  assert.deepEqual(fragment.incoming, ["g_1"]);
  const lane = { $type: "bpmn:Lane", id: "L", flowNodeRef: ["Task_A", "Unknown_9"] };
  rewriteRefs(lane, map, driver);
  assert.deepEqual(lane.flowNodeRef, ["g_a", "Unknown_9"]);
  assert.deepEqual(danglingRefs(lane, new Set(["Task_A", "L", "g_a"]), driver),
    [{ id: "L", member: "flowNodeRef", value: "Unknown_9" }]);
});

test("F2-02d: members no descriptor declares are left alone", async () => {
  const { rewriteRefs, danglingRefs } = await import("../dist/profile/lot5-support.js");
  const { descriptorIndex } = await import("../dist/profile/native-contracts.js");
  const types = json(join(fixtures, "lot5-ui/expectations/fixtures/ui-neutral-descriptors.json")).types;
  const driver = { descriptors: descriptorIndex({ types }), idRefScalars: ["bpmn:CallActivity.calledElement"] };
  const task = { $type: "bpmn:Task", id: "T", dataInputRefs: ["D1"] };
  rewriteRefs(task, new Map([["D1", "g_d"]]), driver);
  assert.deepEqual(task.dataInputRefs, ["D1"]);
  assert.deepEqual(danglingRefs(task, new Set(["T"]), driver), []);
  const call = { $type: "bpmn:CallActivity", id: "C", calledElement: "P1" };
  rewriteRefs(call, new Map([["P1", "g_p"]]), driver);
  assert.equal(call.calledElement, "g_p");
});

// ---- Finding 5: synthetic selector and label ----

function syntheticCaseInputs() {
  const c = json(join(fixtures, "lot4-layout-export/expectations/cases/synthetic-001-band-stripe.json"));
  return Object.fromEntries(c.inputArtifacts.map(a => [a.role,
    a.json !== undefined ? structuredClone(a.json) : json(join(fixtures, a.path))]));
}

function layoutContext(profile) {
  return {
    profile,
    descriptors: descriptorIndex({ types: descriptorJson.types }),
    notions: new Map((profile.notions ?? []).map(n => [n.id, n])),
    unicodeCase: UNICODE,
  };
}

const syntheticLabels = geometry => geometry.filter(g => g.semanticId === undefined).map(g => g.label?.text ?? null);

test("F2-05: assignable selector shape runs (second profile value)", async () => {
  const { runLayout } = await import("../dist/profile/lot4-layout.js");
  const profile = json(join(fixtures, PROFILE_PATH));
  for (const t of profile.themes) for (const s of t.syntheticOccurrences ?? []) {
    if (s.select?.where) s.select.where.mode = "assignable";
  }
  const inputs = syntheticCaseInputs();
  const r = runLayout(layoutContext(profile),
    { envelope: rebind(inputs.envelope, profile), placements: inputs.placements,
      baseGeometry: inputs["base-geometry"] ?? inputs.baseGeometry, themeId: inputs.themeId });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
  assert.ok(syntheticLabels(r.payload.geometry).length > 0, "expected synthetic records");
});

test("F2-05: conjunctive selector shape runs (second profile value)", async () => {
  const { runLayout } = await import("../dist/profile/lot4-layout.js");
  const profile = json(join(fixtures, PROFILE_PATH));
  for (const t of profile.themes) for (const s of t.syntheticOccurrences ?? []) {
    if (s.select?.where) s.select.where = { op: "all", args: [s.select.where, { op: "true" }] };
  }
  const inputs = syntheticCaseInputs();
  const r = runLayout(layoutContext(profile),
    { envelope: rebind(inputs.envelope, profile), placements: inputs.placements,
      baseGeometry: inputs["base-geometry"] ?? inputs.baseGeometry, themeId: inputs.themeId });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
  assert.ok(syntheticLabels(r.payload.geometry).length > 0, "expected synthetic records");
});

test("F2-29: created edge waypoints are even ticks with bbox bounds", async () => {
  const { runCase } = await import("./helpers/lot5-runtime.mjs");
  const c = json(join(fixtures, "lot5-ui/expectations/cases/connect-002-flow-gesture.json"));
  const mod = structuredClone(c);
  const snap = json(join(fixtures, "lot5-ui/expectations/fixtures/documents/basic.snapshot.json"));
  for (const record of snap.presentation.layout.geometry) {
    if (record.semanticId === "Task_A") record.bounds = { x: 200000, y: 180000, width: 100001, height: 80001 };
  }
  mod.inputArtifacts = [{ role: "snapshot", json: snap }];
  const before = new Set(snap.presentation.layout.geometry.map(g => g.semanticId).filter(id => id !== undefined));
  const observed = await runCase(mod);
  assert.ok(observed.staged, "expected the connect gesture to stage commands");
  const geometry = observed.snapshot.payload.presentation.layout.geometry;
  const created = geometry.filter(g => g.sourceOccurrence !== undefined && !before.has(g.semanticId));
  assert.equal(created.length, 1, "expected one created edge");
  const [edge] = created;
  for (const point of edge.waypoints) {
    assert.ok(Number.isInteger(point.x) && Number.isInteger(point.y), `fractional waypoint ${point.x},${point.y}`);
  }
  assert.deepEqual(edge.waypoints, [{ x: 250000, y: 220000 }, { x: 538000, y: 218000 }]);
  const xs = edge.waypoints.map(p => p.x), ys = edge.waypoints.map(p => p.y);
  assert.deepEqual(edge.bounds, { x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
});

test("F2-28: parent cycle terminates instead of looping forever", async () => {
  const { serializeDrawio } = await import("../dist/profile/lot4-export.js");
  const serializer = { version: "custom-9", encoding: "UTF-8", newline: "LF", indent: 0,
    compression: "none", attributeOrder: [], emptyElement: "short" };
  const ir = [
    { kind: "page", id: "p", name: "P" },
    { kind: "node", id: "a", name: "A", parent: "b" },
    { kind: "node", id: "b", name: "B", parent: "a" },
  ];
  const text = new TextDecoder().decode(serializeDrawio(ir, serializer));
  assert.match(text, /^<mxfile version="custom-9">/);
  assert.ok(!text.includes('id="a"') && !text.includes('id="b"'), "cyclic records are skipped");
});

test("F2-07: rerouted links land on integer ticks with odd widths", async () => {
  const { runLayout } = await import("../dist/profile/lot4-layout.js");
  const { validateLayout } = await import("../dist/profile/presentation-contracts.js");
  const c = json(join(fixtures, "lot4-layout-export/expectations/cases/layout-001-main.json"));
  const byRole = Object.fromEntries(c.inputArtifacts.map(a => [a.role,
    a.json !== undefined ? structuredClone(a.json) : json(join(fixtures, a.path))]));
  const profile = json(join(fixtures, PROFILE_PATH));
  const base = byRole["base-geometry"] ?? byRole.baseGeometry;
  for (const record of base.geometry) {
    if (record.sourceOccurrence === undefined && Number.isInteger(record.bounds?.width)) {
      record.bounds.width += 1;
    }
  }
  const r = runLayout(layoutContext(profile),
    { envelope: byRole.envelope, placements: byRole.placements, baseGeometry: base, themeId: byRole.themeId });
  assert.equal(r.status, "ok", `expected ok, got ${r.status}:${r.code ?? ""}`);
  const points = r.payload.geometry.filter(g => g.sourceOccurrence !== undefined)
    .flatMap(g => g.waypoints ?? []);
  assert.ok(points.length > 0, "expected rerouted links");
  for (const point of points) {
    assert.ok(Number.isInteger(point.x) && Number.isInteger(point.y), `fractional waypoint ${point.x},${point.y}`);
  }
  validateLayout({ layoutVersion: "1", pages: r.payload.pages, geometry: r.payload.geometry });
});

test("F2-06: two notions of one group matching refuse ambiguous", async () => {
  const { resolveTheme } = await import("../dist/profile/lot4-render.js");
  const profile = json(join(fixtures, PROFILE_PATH));
  const duplicate = structuredClone(profile.notions[0]);
  duplicate.id = "task-duplicate";
  profile.notions.unshift(duplicate);
  const inputs = renderCaseInputs();
  const r = resolveTheme(lot4Context(profile, sealedRegistry.renderTokens),
    { envelope: rebind(inputs.envelope, profile), layout: inputs.layout,
      themeId: inputs.themeId, overrides: inputs.overrides, diStyles: inputs.diStyles });
  assert.equal(r.status, "refused");
  assert.equal(r.code, "profile-ambiguous-notion");
});

test("F2-05: expression label is evaluated, not read as a literal", async () => {
  const { runLayout } = await import("../dist/profile/lot4-layout.js");
  const { resolveTheme } = await import("../dist/profile/lot4-render.js");
  const profile = json(join(fixtures, PROFILE_PATH));
  for (const t of profile.themes) for (const s of t.syntheticOccurrences ?? []) {
    s.label = { op: "concat", values: [{ op: "literal", value: "Band " }, { op: "literal", value: "A" }] };
  }
  const inputs = syntheticCaseInputs();
  const ctx = layoutContext(profile);
  const laid = runLayout(ctx,
    { envelope: rebind(inputs.envelope, profile), placements: inputs.placements,
      baseGeometry: inputs["base-geometry"] ?? inputs.baseGeometry, themeId: inputs.themeId });
  assert.equal(laid.status, "ok", `expected ok, got ${laid.status}:${laid.code ?? ""}`);
  assert.deepEqual(syntheticLabels(laid.payload.geometry), ["Band A"]);
  // Base-record notion labels are orthogonal to finding 5 (the layout
  // fixture labels are layout inputs, not render-verified labels), so the
  // verify step runs over the produced synthetic records only.
  const verifiable = { ...structuredClone(laid.payload),
    geometry: laid.payload.geometry.filter(g => g.semanticId === undefined) };
  const render = resolveTheme(lot4Context(profile, sealedRegistry.renderTokens),
    { envelope: rebind(inputs.envelope, profile), layout: verifiable,
      themeId: inputs.themeId, overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] } });
  assert.equal(render.status, "ok", `expected ok, got ${render.status}:${render.code ?? ""}`);
  assert.deepEqual(syntheticLabels(render.payload.occurrences), ["Band A"]);
});
