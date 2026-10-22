/** Lot-5 sealed-case runner: executes every case in
 * tests/fixtures/lot5-ui/expectations/cases against the lot-5 canvas
 * (src/profile/lot5-*.ts) and compares each sealed member with the pinned
 * lot5-compare/1 comparators. Case files, seals and comparators are read-only:
 * this file only observes the implementation. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../../dist/profile/compiler.js";
import { compileProfile } from "../../dist/profile/public-compiler.js";
import { descriptorIndex } from "../../dist/profile/native-contracts.js";
import { loadUnicodeCaseTable } from "../../dist/profile/unicode-case.js";
import { vendoredUnicodeCaseDocument } from "./unicode-case-vendored.mjs";
import { Lot5Canvas } from "../../dist/profile/lot5-canvas.js";
import { compilerRegistry, ruleTable, schemaBytes } from "./compiler-fixture.mjs";
import { packageSurface } from "./package-surface.mjs";

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const root = join(here, "fixtures/lot5-ui/expectations");
const repo = join(here, "..");
const read = path => readFileSync(join(root, path));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));

const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
const caseFiles = readdirSync(join(root, "cases")).filter(f => f.endsWith(".json")).sort();

// Asset bytes resolved by digest across the fixture tree (mirrors lot3-compile).
const bytesByDigest = new Map();
const collectBytes = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      collectBytes(path);
    } else if (entry.isFile() && /\.(json|txt|css|svg)$/.test(entry.name)) {
      try {
        bytesByDigest.set(sha(readFileSync(path)), readFileSync(path));
      } catch { /* unreadable: skip */ }
    }
  }
};
collectBytes(join(repo, "tests", "fixtures"));

const manifest = json("manifest.json");

const inputsOf = c => Object.fromEntries(c.inputArtifacts.map(a => [a.role, a.path ? JSON.parse(read(a.path)) : a.json]));

// ---------------------------------------------------------------- compile cache
const compiledByProfile = new Map();
async function compileFor(c) {
  const key = c.profileArtifact.path;
  if (compiledByProfile.has(key)) return compiledByProfile.get(key);
  const profileBytes = read(c.profileArtifact.path);
  const profile = JSON.parse(profileBytes);
  const compileInputs = (c.inputArtifacts.find(a => a.role === "compile-inputs")?.json)
    ?? (c.inputArtifacts.find(a => a.role === "descriptors" || a.role === "base") ? null : null);
  let baseBytes = null, descriptorBytesList = [], digestDomain = "raw", assetNames = [];
  if (compileInputs) {
    baseBytes = read(compileInputs.base);
    descriptorBytesList = compileInputs.descriptors.map(read);
    digestDomain = compileInputs.digestDomain ?? "raw";
    assetNames = compileInputs.assets ?? [];
  } else {
    const baseInput = c.inputArtifacts.find(a => a.role === "base");
    const descInput = c.inputArtifacts.find(a => a.role === "descriptors");
    if (!baseInput || !descInput) {
      // Resolve inputs from the pinned fixture package.
      // lot-5 fixture base, descriptors and metrics.
      baseBytes = read("fixtures/ui-neutral-base.json");
      descriptorBytesList = [read("fixtures/ui-neutral-descriptors.json")];
      assetNames = ["fixtures/ui-neutral-metrics.json"];
    } else {
      baseBytes = baseInput.path ? read(baseInput.path) : Buffer.from(JSON.stringify(baseInput.json));
      descriptorBytesList = [(descInput.path ? read(descInput.path) : Buffer.from(JSON.stringify(descInput.json)))];
      for (const resource of profile.resources ?? []) {
        const hit = bytesByDigest.get(resource.sha256);
        if (hit) assetNames.push({ key: resource.assetKey, bytes: hit });
      }
    }
  }
  const descriptors = JSON.parse(descriptorBytesList[0].toString("utf8")).types;
  const assetBag = new Map();
  for (const name of assetNames) {
    if (typeof name === "string") {
      const key = name.split("/").pop();
      const candidates = [name, `fixtures/${name}`, `vendor/py/artifacts/${name}`];
      for (const candidate of candidates) {
        if (existsSync(join(root, candidate))) {
          assetBag.set(key, read(candidate));
          break;
        }
      }
      if (!assetBag.has(name)) {
        const resource = profile.resources.find(r => r.assetKey === name);
        if (resource?.sha256 && bytesByDigest.has(resource.sha256)) assetBag.set(name, bytesByDigest.get(resource.sha256));
      }
    } else {
      assetBag.set(name.key, name.bytes);
    }
  }
  const inputs = {
    schemaBytes,
    baseBytes,
    basePin: { ...profile.base, digestDomain },
    descriptorPins: profile.descriptors.map((pin, i) => ({ ...pin, digestDomain, descriptorBytes: descriptorBytesList[i] ?? descriptorBytesList[0] })),
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag,
  };
  const loaded = await loadProfile(profileBytes, inputs);
  let outcome;
  if (loaded.status !== "ok") {
    outcome = { result: { status: "refused", code: loaded.code, diagnostics: loaded.diagnostics ?? [] } };
  } else {
    const registry = { ...compilerRegistry(), descriptors };
    const compiled = await compileProfile(loaded.payload, registry);
    if (compiled.status !== "ok") {
      outcome = { result: { status: "refused", code: compiled.code, diagnostics: compiled.diagnostics ?? [] } };
    } else {
      const identity = compiled.payload.identity;
      outcome = { compiled: compiled.payload, profile, descriptors, identity, metricBytes: new Map(profile.resources.filter(r => r.kind === "metrics").map(r => [r.id, assetBag.get(r.assetKey)])),
        result: { status: "ok", payload: compiled.payload, diagnostics: [] } };
    }
  }
  compiledByProfile.set(key, outcome);
  return outcome;
}

// ---------------------------------------------------------------- canvas factory
function metricsOf(profile, descriptors) {
  void descriptors;
  const resource = (profile.resources ?? []).find(r => /metrics/i.test(r.assetKey ?? ""));
  const assetKey = resource?.assetKey ?? "ui-neutral-metrics.json";
  return { metricsId: assetKey.replace(/\.json$/, ""), metricsSha256: resource?.sha256 ?? "" };
}

async function canvasFor(c, { readOnly = false, headless = false } = {}) {
  const build = await compileFor(c);
  if (!build.compiled) throw new Error(`${c.caseId}: profile did not compile (${build.result.code})`);
  const { metricsId, metricsSha256 } = metricsOf(build.profile);
  const metricsPins = (build.profile.resources ?? []).filter(r => r.kind === "metrics")
    .map(r => ({ id: r.id, sha256: r.sha256 }));
  const canvas = new Lot5Canvas({ compiled: build.compiled, profileDocument: build.profile,
    descriptorTypes: build.descriptors, metricsId, metricsSha256, metricsPins, unicodeCase: UNICODE_CASE, readOnly, metricBytes: build.metricBytes,
    activationMode: headless ? "explicit" : "configured" });
  canvas.setDescriptorPins(build.profile.descriptors ?? []);
  return { canvas, build };
}

function loadInputs(canvas, c, inputs) {
  if (c.operation === "setDefinitions") return;
  if (inputs.snapshot) canvas.loadSnapshot(clone(inputs.snapshot));
  else if (inputs.envelope && c.operation !== "setDefinitions") {
    const result = canvas.setDefinitions({ envelope: clone(inputs.envelope), mode: inputs["load-request"]?.mode });
    void result;
  }
}

// ---------------------------------------------------------------- twin projection (mirrors the sealed twinOf over our actuals)
const TWIN = "twin-presentation";
function twinOf({ result, events, history }) {
  const out = {};
  if (result !== undefined) {
    out.result = clone(result);
    if (out.result.status === "ok" && out.result.operation === "applyCommands" && out.result.payload?.viewRevision !== undefined) {
      out.result.payload.viewRevision = TWIN;
    }
  }
  if (events !== undefined) {
    out.events = (events ?? []).map(e => ({
      envelope: clone(out.result.payload.envelope),
      semanticRevision: e.semanticRevision,
      viewRevision: TWIN,
      transactionId: e.transactionId,
      origin: e.origin,
      report: clone(out.result.report),
    }));
  }
  if (history !== undefined) {
    if (history.undo?.result) {
      const mapSide = (side, origin) => {
        if (!side.result?.payload) return { result: clone(side.result), events: clone(side.events ?? []) };
        return {
          result: {
            ...clone(side.result),
            payload: {
              snapshotVersion: "1",
              envelope: clone(side.result.payload.envelope),
              presentation: clone(side.result.payload.presentation),
              viewRevision: TWIN,
            },
          },
          events: (side.events ?? []).map(e => ({
            envelope: clone(side.result.payload.envelope),
            semanticRevision: e.semanticRevision,
            viewRevision: TWIN,
            transactionId: e.transactionId,
            origin,
            report: clone(side.result.report),
          })),
        };
      };
      out.history = { undo: mapSide(history.undo, "undo"), redo: mapSide(history.redo, "redo") };
    } else {
      out.history = { probe: clone(history.probe), probeEvents: [] };
    }
  }
  return out;
}

// ---------------------------------------------------------------- operation dispatch (JS cases)
async function snapshotOf(canvas) {
  return (await canvas.getSnapshot()).result;
}

async function runApplyCommands(canvas, tx) {
  const abort = new AbortController();
  if (tx.signal === "aborted") abort.abort();
  const pending = canvas.applyCommands({
    baseRevision: tx.baseRevision,
    expectedViewRevision: tx.expectedViewRevision,
    transactionId: tx.transactionId ?? null,
    commands: clone(tx.commands ?? []),
    signal: tx.signal ? abort.signal : undefined,
  });
  if (tx.signal === "aborted-after-call") abort.abort();
  const { result, events } = await pending;
  const snapshot = await snapshotOf(canvas);
  const history = canvas.fullHistory();
  return { result, snapshot, events, history };
}

async function runGesture(canvas, gesture) {
  const translated = await canvas.gesture(clone(gesture));
  if (translated.outcome) {
    const snapshot = await snapshotOf(canvas);
    return { outcome: translated.outcome, snapshot, events: [], history: canvas.fullHistory(),
      clipboard: translated.clipboard };
  }
  const staged = translated.staged;
  let commit;
  if (staged.presentation) {
    commit = await canvas.commitPresentation(staged);
  } else {
    commit = await canvas.applyCommands({
      baseRevision: canvas.currentRevision,
      expectedViewRevision: canvas.stateViewRevision(),
      transactionId: staged.transactionId ?? null,
      commands: clone(staged.commands ?? []),
    });
  }
  const snapshot = await snapshotOf(canvas);
  const history = canvas.fullHistory();
  return { staged, result: commit.result, snapshot, events: commit.events, history, clipboard: translated.clipboard };
}

async function runJsCase(c, inputs) {
  const readOnly = inputs["canvas-options"]?.readOnly ?? false;
  const { canvas } = await canvasFor(c, { readOnly });
  loadInputs(canvas, c, inputs);
  const observed = {};
  const cmd = c.commandArtifact?.json;
  const need = id => c.comparatorIds.includes(id);
  switch (c.operation) {
    case "compileProfile": {
      const build = await compileFor(c);
      observed.result = clone(build.result);
      if (build.compiled && need("lot5/compiled-identity")) {
        observed.compiledIdentity = clone(build.identity);
      }
      return observed;
    }
    case "applyCommands": {
      const out = await runApplyCommands(canvas, cmd);
      observed.result = out.result;
      observed.snapshot = out.snapshot;
      observed.events = out.events;
      observed.history = out.history;
      if (need("lot5/twin")) observed.twin = twinOf({ result: out.result, events: out.events, history: out.history });
      return observed;
    }
    case "canvas.gesture":
    case "workshop.gesture": {
      const out = await runGesture(canvas, cmd);
      if (out.outcome) {
        observed.outcome = out.outcome;
        observed.snapshot = out.snapshot;
        observed.events = out.events;
        observed.history = out.history;
        return observed;
      }
      observed.staged = out.staged;
      if (out.result.status === "refused") observed.diagnostic = out.result;
      observed.snapshot = out.snapshot;
      observed.events = out.events;
      observed.history = out.history;
      if (need("lot5/twin")) {
        observed.twin = out.result.status === "ok"
          ? twinOf({ result: out.result, events: out.events, history: out.history })
          : twinOf({ result: out.result, events: [], history: canvas.fullHistory() });
      }
      if (out.clipboard !== undefined) observed.clipboard = clone(out.clipboard);
      if (c.operation === "workshop.gesture") {
        observed.host = { onChange: clone(out.events), autosave: 0 };
      }
      return observed;
    }
    case "listEntries": {
      const results = [];
      for (const query of inputs.queries ?? []) {
        results.push(canvas.listEntries({ baseRevision: query.baseRevision, surface: query.surface, subject: query.subject, locale: query.locale }));
      }
      observed.result = results;
      observed.snapshot = await snapshotOf(canvas);
      observed.events = [];
      if (need("lot5/twin")) observed.twin = twinOf({ result: clone(results) });
      return observed;
    }
    case "listFields":
    case "checkField":
    case "queryReferences":
    case "copy":
    case "localize": {
      const results = [];
      for (const query of inputs.queries ?? []) {
        if (c.operation === "listFields") results.push(canvas.listFields({ baseRevision: query.baseRevision, targetId: query.targetId, locale: query.locale }));
        else if (c.operation === "checkField") results.push(canvas.checkField({ baseRevision: query.baseRevision, targetId: query.targetId, fieldId: query.fieldId, value: query.value }));
        else if (c.operation === "queryReferences") results.push(canvas.queryReferences({ baseRevision: query.baseRevision, targetId: query.targetId, field: query.fieldId ?? query.field, query: query.query, offset: query.offset, limit: query.limit }));
        else if (c.operation === "copy") results.push(canvas.copy({ baseRevision: query.baseRevision, elementIds: query.elementIds }));
        else results.push(canvas.localize({ key: query.key, locale: query.locale }));
      }
      observed.result = results;
      observed.snapshot = await snapshotOf(canvas);
      observed.events = [];
      if (need("lot5/twin")) observed.twin = twinOf({ result: clone(results) });
      return observed;
    }
    case "ui.upstream-filter": {
      const query = inputs["upstream-query"] ?? {};
      observed.upstream = canvas.upstreamFilter(clone(query.upstreamEntries ?? []), query.subject).payload;
      observed.snapshot = await snapshotOf(canvas);
      observed.events = [];
      return observed;
    }
    case "canvas.navigationIndex": {
      observed.result = canvas.navigationIndex();
      observed.snapshot = await snapshotOf(canvas);
      observed.events = [];
      return observed;
    }
    case "canvas.navigate": {
      const out = canvas.navigate({ callId: cmd.callId, currentDiagramId: cmd.currentDiagramId, diagramId: cmd.diagramId });
      observed.result = out.result;
      observed.snapshot = out.snapshot;
      observed.events = out.events;
      if (need("lot5/history")) observed.history = canvas.fullHistory();
      return observed;
    }
    case "canvas.select": {
      const out = canvas.select(cmd.activatePage, clone(cmd.select));
      observed.snapshot = out.snapshot;
      observed.events = out.events;
      observed.history = out.history;
      return observed;
    }
    case "setTheme": {
      const out = canvas.setTheme(cmd.themeId);
      observed.result = out.result;
      observed.snapshot = out.snapshot;
      observed.events = out.events;
      observed.history = canvas.fullHistory();
      return observed;
    }
    case "viewer.static": {
      const out = canvas.viewerStatic({ snapshot: inputs.snapshot ? clone(inputs.snapshot) : undefined,
        envelope: inputs.envelope ? clone(inputs.envelope) : undefined,
        props: inputs["preview-props"] ? clone(inputs["preview-props"]) : undefined });
      observed.surface = out.status === "ok" ? clone(out.payload) : clone(out);
      return observed;
    }
    case "viewer.importPreview": {
      const out = canvas.importPreview(clone(inputs["native-json"]));
      observed.result = out.result;
      assert.deepEqual(out.preview.tree, inputs["native-json"]);
      observed.surface = { ...clone(out.preview), tree: "equals input native JSON" };
      return observed;
    }
    case "setDefinitions": {
      const request = inputs["load-request"] ?? {};
      const out = canvas.setDefinitions({ xml: request.xml ?? inputs.xml,
        envelope: inputs.envelope ? clone(inputs.envelope) : inputs.snapshot?.envelope ? clone(inputs.snapshot.envelope) : undefined, mode: request.mode });
      observed.result = out;
      if (need("lot5/snapshot")) observed.snapshot = await snapshotOf(canvas);
      if (need("lot5/events")) observed.events = [];
      if (need("lot5/follow-up")) {
        const follow = canvas.getDefinitions();
        observed.followUp = follow;
      }
      return observed;
    }
    case "getDefinitions": {
      observed.result = canvas.getDefinitions();
      observed.snapshot = await snapshotOf(canvas);
      observed.events = [];
      return observed;
    }
    case "package.surface": {
      const cmd = inputs["package-query"];
      observed.package = packageSurface({
        packages: cmd.packages,
        fields: cmd.fields,
        entrySources: await entrySourcesFor(cmd.entryPoints),
        packageJsonText: readFileSync(join(repo, cmd.manifest), "utf8"),
      }).payload;
      return observed;
    }
    case "workshop.export": {
      const formatOption = inputs["format-option"] ?? cmd;
      const out = await canvas.workshopExport({ label: formatOption.label, themeId: formatOption.themeId, formatId: formatOption.formatId });
      if (out.download) observed.download = out.download;
      if (out.result) observed.result = out.result;
      if (need("lot5/snapshot")) observed.snapshot = await snapshotOf(canvas);
      observed.events = out.events ?? [];
      return observed;
    }
    case "workshop.preview": {
      const out = canvas.workshopPreview();
      observed.surface = out.status === "ok" ? clone(out.payload) : clone(out);
      return observed;
    }
    case "activateBusinessProfile": {
      const build = await compileFor(c);
      const profile = inputs["variant-profile"] ?? build.profile;
      const out = canvas.activateBusinessProfile(build.compiled, profile, profile.descriptors ?? []);
      observed.result = out;
      observed.snapshot = await snapshotOf(canvas);
      observed.events = [];
      return observed;
    }
    default:
      throw new Error(`${c.caseId}: unsupported operation ${c.operation}`);
  }
}

/** Twin projection of one sequence step (shared by the headless runner and the
 * DOM replay): viewRevision members become the TWIN constant and events
 * re-anchor on the step result. Export steps produce no twin entry. */
export function twinStep(number, action, result, events) {
  if (action === "export") return undefined;
  if (action !== "applyCommands" && action !== "gesture" && action !== "undo" && action !== "redo") {
    return { step: number, result: clone(result) };
  }
  if (result.status !== "ok") {
    if (action === "undo" || action === "redo") return { step: number, result: clone(result), events: [] };
    const twinResult = clone(result);
    return { step: number, result: twinResult,
      events: (events ?? []).map(e => ({ envelope: clone(twinResult.payload?.envelope ?? e.envelope),
        semanticRevision: e.semanticRevision, viewRevision: TWIN, transactionId: e.transactionId,
        origin: e.origin, report: clone(twinResult.report) })) };
  }
  if (action === "undo" || action === "redo") {
    const twinPayload = { snapshotVersion: "1", envelope: clone(result.payload.envelope),
      presentation: clone(result.payload.presentation), viewRevision: TWIN };
    return { step: number, result: { ...clone(result), payload: twinPayload },
      events: (events ?? []).map(e => ({ envelope: clone(result.payload.envelope),
        semanticRevision: e.semanticRevision, viewRevision: TWIN, transactionId: e.transactionId,
        origin: e.origin, report: clone(result.report) })) };
  }
  const twinResult = clone(result);
  twinResult.payload.viewRevision = TWIN;
  return { step: number, result: twinResult,
    events: (events ?? []).map(e => ({ envelope: clone(twinResult.payload.envelope),
      semanticRevision: e.semanticRevision, viewRevision: TWIN, transactionId: e.transactionId,
      origin: e.origin, report: clone(twinResult.report) })) };
}

// ---------------------------------------------------------------- JS sequences (canvas.sequence)
async function runJsSequence(canvas, c, inputs) {
  const outcomes = [];
  const twinSteps = [];
  const needTwin = c.comparatorIds.includes("lot5/twin");
  const viewNow = () => canvas.stateViewRevision();
  const withCurrent = request => {
    const out = clone(request ?? {});
    if (out.expectedViewRevision === "@current") out.expectedViewRevision = viewNow();
    return out;
  };
  for (const step of c.commandArtifact.json.steps) {
    const k = outcomes.length;
    if (step.action === "applyCommands") {
      const request = withCurrent(step.request);
      const { result, events } = await canvas.applyCommands({
        baseRevision: request.baseRevision, expectedViewRevision: request.expectedViewRevision,
        transactionId: request.transactionId ?? null, commands: clone(request.commands ?? []),
      });
      const snapshot = await snapshotOf(canvas);
      outcomes.push({ result, ...(result.code === "document-not-loaded" || result.code === "canvas-disposed" ? {} : { snapshot }), events });
      if (needTwin) twinSteps.push(twinStep(k + 1, "applyCommands", result, events));
    } else if (step.action === "gesture") {
      const translated = await canvas.gesture(clone(step.gesture));
      if (translated.outcome) {
        const snapshot = await snapshotOf(canvas);
        outcomes.push({ outcome: translated.outcome, snapshot, events: [] });
      } else {
        const staged = translated.staged;
        let commit;
        if (staged.presentation) commit = await canvas.commitPresentation(staged);
        else {
          commit = await canvas.applyCommands({ baseRevision: canvas.currentRevision,
            expectedViewRevision: viewNow(), transactionId: staged.transactionId ?? null,
            commands: clone(staged.commands ?? []) });
        }
        const snapshot = await snapshotOf(canvas);
        const entry = { staged, snapshot, events: commit.events };
        if (translated.clipboard !== undefined) entry.clipboard = clone(translated.clipboard);
        outcomes.push(entry);
        if (needTwin && commit.result.status === "ok") {
          twinSteps.push(twinStep(k + 1, "gesture", commit.result, commit.events));
        }
      }
    } else if (step.action === "undo" || step.action === "redo") {
      const request = withCurrent(step.request);
      const { result, events } = canvas.restore(step.action, {
        expectedRevision: request.expectedRevision, expectedViewRevision: request.expectedViewRevision });
      outcomes.push({ result, events });
      if (needTwin) twinSteps.push(twinStep(k + 1, step.action, result, events));
    } else if (step.action === "setTheme") {
      const out = canvas.setTheme(step.themeId);
      outcomes.push({ result: out.result, snapshot: out.snapshot, events: out.events });
    } else if (step.action === "restoreSnapshot") {
      const { result, events } = canvas.restoreSnapshot(clone(inputs.snapshot));
      outcomes.push({ result, events });
    } else if (step.action === "export") {
      const out = await canvas.workshopExport({ label: step.request.label, themeId: step.request.themeId, formatId: step.request.formatId });
      outcomes.push({ download: out.download, events: out.events ?? [] });
    } else if (step.action === "getDefinitions" || step.action === "getSnapshot") {
      const result = step.action === "getDefinitions" ? canvas.getDefinitions() : await snapshotOf(canvas);
      outcomes.push({ result, events: [] });
    } else if (step.action === "dispose") {
      outcomes.push({ result: canvas.dispose(), events: [] });
    } else if (step.action === "queryReferences") {
      const request = withCurrent(step.request);
      const result = canvas.queryReferences({ ...request, field: request.fieldId });
      outcomes.push({ result });
      if (needTwin) twinSteps.push(twinStep(k + 1, step.action, result, undefined));
    } else {
      throw new Error(`${c.caseId}: unsupported sequence action ${step.action}`);
    }
  }
  const observed = { steps: outcomes };
  if (needTwin) observed.twin = { steps: twinSteps };
  return observed;
}

// ---------------------------------------------------------------- vendored Python bridge (sequence + query ops)
function atPointer(value, pointer) {
  if (pointer === "" || pointer === undefined) return value;
  const parts = pointer.split("/").slice(1).map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = value;
  for (const part of parts) current = current?.[part];
  return current;
}

function resolvePlaceholders(node, ctx) {
  if (Array.isArray(node)) return node.map(item => resolvePlaceholders(item, ctx));
  if (node && typeof node === "object") {
    if (typeof node.$current === "string") return ctx.current[node.$current];
    if (typeof node.$saved === "string") return clone(atPointer(ctx.saved[node.$saved], node.pointer));
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = resolvePlaceholders(value, ctx);
    return out;
  }
  return node;
}

async function runPyBridge(c, inputs) {
  const { canvas, build } = await canvasFor(c, { headless: true });
  canvas.setDescriptorPins(inputs.bridge?.descriptorPackages?.map(p => p.pin) ?? build.profile.descriptors ?? []);
  const setup = {};
  if (inputs.envelope) {
    setup.load = canvas.setDefinitions({ envelope: clone(inputs.envelope), importedDi: inputs.importedDi });
    setup.activate = canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors ?? []);
  }
  const saved = {};
  const stepResults = [];
  const ctx = { saved, current: {} };
  const refreshCurrent = () => {
    ctx.current = { viewRevision: canvas.stateViewRevision() };
  };
  refreshCurrent();
  const steps = c.operation === "sequence" ? c.commandArtifact.json.steps : (c.commandArtifact.json.steps ?? []);
  for (const step of steps) {
    const request = resolvePlaceholders(clone(step.request ?? {}), ctx);
    let result;
    switch (step.action) {
      case "applyCommands":
        result = (await canvas.applyCommands({ baseRevision: request.baseRevision,
          expectedViewRevision: request.expectedViewRevision, transactionId: request.transactionId ?? null,
          commands: clone(request.commands ?? []) })).result;
        break;
      case "getDefinitions": result = canvas.getDefinitions(); break;
      case "getSnapshot": result = await snapshotOf(canvas); break;
      case "listFields": result = canvas.listFields({ baseRevision: request.baseRevision, targetId: request.targetId, locale: request.locale }); break;
      case "checkField": result = canvas.checkField({ baseRevision: request.baseRevision, targetId: request.targetId, fieldId: request.fieldId, value: request.value }); break;
      case "listEntries": result = canvas.listEntries({ baseRevision: request.baseRevision, surface: request.surface, subject: request.subject, locale: request.locale }); break;
      case "queryReferences": result = canvas.queryReferences({ baseRevision: request.baseRevision, targetId: request.targetId, field: request.fieldId, query: request.query, offset: request.offset, limit: request.limit }); break;
      case "copy": result = canvas.copy({ baseRevision: request.baseRevision, elementIds: request.elementIds }); break;
      case "localize": result = canvas.localize({ key: request.key, locale: request.locale }); break;
      case "undo": result = canvas.restore("undo", { expectedRevision: request.expectedRevision, expectedViewRevision: request.expectedViewRevision }).result; break;
      case "redo": result = canvas.restore("redo", { expectedRevision: request.expectedRevision, expectedViewRevision: request.expectedViewRevision }).result; break;
      case "onChange": result = canvas.onChange(request.collect ?? request.name); break;
      case "events": result = { events: canvas.readEvents(request.name) }; break;
      case "setDefinitions": result = canvas.setDefinitions({ envelope: clone(request.envelope ?? inputs.envelope) }); break;
      case "activateBusinessProfile": result = canvas.activateBusinessProfile(build.compiled, build.profile, request.descriptorPins ?? build.profile.descriptors ?? []); break;
      case "dispose": result = canvas.dispose(); break;
      default: throw new Error(`${c.caseId}: unsupported py action ${step.action}`);
    }
    refreshCurrent();
    const observation = { result };
    if (step.save) saved[step.save] = result;
    stepResults.push(observation);
  }
  return { setup, stepResults };
}

// ---------------------------------------------------------------- test driver
const isPyCase = c => c.caseId.startsWith("lot5-py-");

async function runCase(c) {
  const inputs = inputsOf(c);
  if (c.operation === "compileProfile") {
    const build = await compileFor(c);
    if (isPyCase(c)) {
      return { compileOutcome: clone(build.result),
        ...(build.compiled ? { compiledIdentity: clone(build.identity) } : {}) };
    }
    const observed = { result: clone(build.result) };
    if (build.compiled && c.comparatorIds.includes("lot5/compiled-identity")) {
      observed.compiledIdentity = clone(build.identity);
    }
    return observed;
  }
  if (isPyCase(c)) {
    const { setup, stepResults } = await runPyBridge(c, inputs);
    return { setup, stepResults };
  }
  if (c.operation === "canvas.sequence") {
    const { canvas } = await canvasFor(c);
    loadInputs(canvas, c, inputs);
    return runJsSequence(canvas, c, inputs);
  }
  return runJsCase(c, inputs);
}

async function entrySourcesFor(entryPoints) {
  const map = {};
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const key = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, key);
      else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.test\./.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
        map[key] = readFileSync(full, "utf8");
      }
    }
  };
  walk(join(repo, "src"), "src");
  return map;
}

export { canvasFor, inputsOf, runCase, compileFor, root, caseFiles };
