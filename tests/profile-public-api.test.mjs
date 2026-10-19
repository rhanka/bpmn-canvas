import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { loadProfile as internalLoad } from "../dist/profile/compiler.js";
import { createDescriptorContext as internalContext } from "../dist/profile/descriptor-context.js";
import { rawDigest } from "../dist/profile/canonical.js";
import { recommendedRuleNames } from "../dist/profile/lint-bridge.js";
import { compilerInputs, compilerRegistry } from "./helpers/compiler-fixture.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const root = new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/", import.meta.url);
const schemaBytes = readFileSync(new URL("../schemas/profile/profile-mechanism-1.schema.json", import.meta.url));
const profileBytes = readFileSync(new URL("neutral-profile.json", root));
const descriptorBytes = readFileSync(new URL("neutral-descriptors.json", root));
const assetBag = new Map([["neutral-metrics.json", readFileSync(new URL("neutral-metrics.json", root))]]);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function setup(change = () => {}, inputs = compilerInputs()) {
  const api = await import(`${pkg.name}/profile`);
  const io = await import(`${pkg.name}/io`);
  const document = JSON.parse(profileBytes);
  for (const table of document.validation) {
    table.extends = [];
    table.settings = [
      ...recommendedRuleNames().map(rule => table.settings.find(s => s.rule === rule && rule === "label-required")
        ?? { rule, severity: "off", classification: "integrity" }),
      ...table.settings.filter(s => s.rule.startsWith("profile:")),
    ];
  }
  change(document);
  const validated = api.loadProfile(JSON.stringify(document), inputs);
  assert.equal(validated.status, "ok", validated.code);
  const groups = {
    "predicates/1": ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId", "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "boundRole", "recognizes"],
    "selectors/1": ["count", "reachable"],
    "recipes/1": ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"],
    "export-ir/1": ["emit", "loss"],
  };
  const signatures = Object.fromEntries(Object.entries(groups).flatMap(([capability, ops]) => ops.map(op => [op, { capability, version: "1", argumentSchemaDigest: "0".repeat(64) }])));
  const compiled = api.compileProfile(validated.payload, { ...compilerRegistry(), capabilities: document.capabilities, signatures,
    descriptors: JSON.parse(descriptorBytes).types, requiredStandardRules: ["label-required"],
    codecConfiguration: { contractVersion: "1", defaults: "explicit", descriptors: { sem: io.semanticDescriptor } } });
  assert.equal(compiled.status, "ok", compiled.code);
  const tree = { $type: "bpmn:Definitions", id: "D", targetNamespace: "urn:neutral:test",
    rootElements: [{ $type: "bpmn:Process", id: "P", name: "Process", flowElements: [{ $type: "bpmn:Task", id: "T" }] }] };
  const envelope = { documentVersion: "1", profileIdentity: compiled.payload.identity, tree, bindings: [],
    semanticRevision: api.semanticRevision(tree, compiled.payload.identity, []) };
  return { api, compiled: compiled.payload, envelope };
}

async function scalarReferenceSetup(reference = false) {
  const inputs = compilerInputs();
  const base = JSON.parse(inputs.baseBytes);
  base.idRefScalars = ["bpmn:Task.name"];
  inputs.baseBytes = Buffer.from(JSON.stringify(base));
  inputs.basePin.sha256 = hash(inputs.baseBytes);
  return setup(profile => {
    profile.base.sha256 = inputs.basePin.sha256;
    for (const rule of profile.rules) rule.assert = { op: "true" };
    if (reference) {
      profile.rules[0].bindings = [{ op: "bind", as: "named", cardinality: "one", select: {
        from: "self", via: "reference", property: "name", order: "id", where: { op: "true" },
      } }];
    }
  }, inputs);
}

test("microfix #11 should refuse a dangling base-declared ID scalar through public validate", async () => {
  const { api, compiled, envelope } = await scalarReferenceSetup();
  envelope.tree.rootElements[0].flowElements[0].name = "MISSING";
  envelope.semanticRevision = api.semanticRevision(envelope.tree, envelope.profileIdentity, []);
  const result = api.validate(compiled, envelope, { phase: "post-normalize", readinessPolicy: "draft" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "reference-dangling");
});

test("microfix #11 should compile and validate a reference selector on a base-declared ID scalar", async () => {
  const { api, compiled, envelope } = await scalarReferenceSetup(true);
  envelope.tree.rootElements[0].flowElements[0].name = "P";
  envelope.semanticRevision = api.semanticRevision(envelope.tree, envelope.profileIdentity, []);
  const result = api.validate(compiled, envelope, { phase: "post-normalize", readinessPolicy: "draft" });
  assert.equal(result.status, "ok", result.code);
  assert.deepEqual(result.report.entries.filter(entry => entry.ruleId === "task-named"), []);
});

for (const operation of ["count", "reachable"]) {
  test(`microfix schema names should compile and validate ${operation} through the public facade`, async () => {
    const select = (from, via, where = { op: "true" }) => ({ from, via, where, order: "id" });
    const task = { op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" };
    const namedTask = id => ({ op: "all", args: [task, {
      op: "equal", left: { op: "id", binding: "self" }, right: { op: "literal", value: id },
    }] });
    const { api, compiled, envelope } = await setup(profile => {
      for (const rule of profile.rules) rule.assert = { op: "true" };
      profile.rules[0].select = select("root", "all", namedTask("T"));
      profile.rules[0].assert = operation === "count"
        ? { op: "count", select: select("root", "all", task), min: 1, max: 1 }
        : { op: "reachable", from: select("self", "self"), to: select("root", "all", namedTask("U")),
          edgeTypes: ["bpmn:SequenceFlow"], minHops: 1, maxHops: 1 };
    });
    const elements = envelope.tree.rootElements[0].flowElements;
    if (operation === "reachable") elements.push(
      { $type: "bpmn:Task", id: "U" },
      { $type: "bpmn:SequenceFlow", id: "F", sourceRef: "T", targetRef: "U" },
    );
    const validate = () => {
      envelope.semanticRevision = api.semanticRevision(envelope.tree, envelope.profileIdentity, []);
      const result = api.validate(compiled, envelope, { phase: "post-normalize", readinessPolicy: "draft" });
      assert.equal(result.status, "ok", result.code);
      return result.report.entries.filter(entry => entry.ruleId === "task-named");
    };
    assert.deepEqual(validate(), []);
    if (operation === "count") elements.push({ $type: "bpmn:Task", id: "U" });
    else elements.pop();
    const findings = validate();
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "task-name-missing");
  });
}

test("J5 #5 should deliver pure profile operations synchronously", () => {
  const loaded = internalLoad(profileBytes, compilerInputs());
  assert.equal(loaded.status, "ok", "loadProfile must return PureResult synchronously");
  const context = internalContext([{ id: "neutral-descriptors", version: "1.1.0", sha256: hash(descriptorBytes), descriptorBytes }]);
  assert.equal(context.status, "ok", "createDescriptorContext must return PureResult synchronously");
});

test("J5 #5 should publish profile and compiler facades", async () => {
  for (const path of ["profile", "profile/compiler"]) {
    assert.ok(pkg.exports[`./${path}`], `public ${path} export`);
    const api = await import(`${pkg.name}/${path}`);
    assert.equal(typeof api.loadProfile, "function");
    assert.equal(typeof api.compileProfile, "function");
    assert.equal(typeof api.evaluatePredicate, "function");
    assert.equal(typeof api.select, "function");
    assert.equal(api.runLint, undefined, "transport stays internal to the facade");
  }
});

test("J5 #5 should preserve the raw SHA-256 domain synchronously", () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 127, 128, 10000]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251);
    assert.equal(rawDigest(bytes), hash(bytes), `SHA-256 length ${size}`);
  }
  assert.equal(rawDigest("é😀"), hash("é😀"));
});

test("J5 #5 should load synchronously from a browser bundle without host crypto", async () => {
  const bundle = await build({ entryPoints: ["src/profile/index.ts"], bundle: true, platform: "browser", format: "iife",
    globalName: "profileApi", minify: true, write: false, logLevel: "silent" });
  const inputs = compilerInputs();
  const authority = JSON.stringify({ basePin: inputs.basePin, compilerRuleTable: inputs.compilerRuleTable,
    capabilities: inputs.capabilities, descriptorPins: inputs.descriptorPins.map(({ descriptorBytes, ...pin }) => pin) });
  const scope = { TextEncoder, TextDecoder, Uint8Array, schemaBytes, assetBag,
    baseBytes: inputs.baseBytes, descriptorBytes, authority, profileText: profileBytes.toString("utf8") };
  runInNewContext(bundle.outputFiles[0].text, scope, { timeout: 10000 });
  const loaded = runInNewContext(`profileApi.loadProfile(profileText, { ...JSON.parse(authority), schemaBytes, assetBag,
    baseBytes, descriptorPins: JSON.parse(authority).descriptorPins.map(pin => ({ ...pin, descriptorBytes })) })`, scope, { timeout: 10000 });
  assert.equal(loaded.status, "ok", loaded.code);
  assert.equal(typeof scope.profileApi.validate, "function");
});

test("J5 #5 should validate compiled rules with identity, revisions, reports and summary", async () => {
  const { api, compiled, envelope } = await setup();
  const before = JSON.stringify(envelope);
  for (const [readinessPolicy, level] of [["draft", "warn"], ["accept", "error"]]) {
    const result = api.validate(compiled, envelope, { phase: "post-normalize", readinessPolicy });
    assert.equal(result.status, "ok", result.code);
    assert.deepEqual(Object.keys(result).sort(), ["status", "operation", "profileIdentity", "baseRevision", "revision", "report", "payload"].sort());
    assert.deepEqual(result.profileIdentity, envelope.profileIdentity);
    assert.equal(result.baseRevision, envelope.semanticRevision);
    assert.equal(result.revision, result.baseRevision);
    assert.equal(result.report.reportVersion, "2");
    const custom = result.report.entries.find(e => e.ruleId === "task-named");
    assert.equal(custom.code, "task-name-missing");
    assert.equal(custom.severity, level);
    assert.deepEqual(custom.source, { domain: "tree", pointer: "/rootElements/0/flowElements/0", targetId: "T", provenance: "exact" });
    assert.equal(result.report.rawStandardFindings.length, 1);
    assert.deepEqual(result.payload, { ok: level !== "error", counts: { info: 0, warn: level === "warn" ? 2 : 0, error: level === "error" ? 2 : 0 } });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
  assert.equal(JSON.stringify(envelope), before);
});

test("J5 #5 should interpret substituted rules and keep repeated calls isolated", async () => {
  const first = await setup();
  const second = await setup(profile => { profile.rules.forEach(rule => { rule.assert = { op: "true" }; }); });
  const options = { phase: "post-normalize", readinessPolicy: "draft" };
  const a = first.api.validate(first.compiled, first.envelope, options);
  const b = second.api.validate(second.compiled, second.envelope, options);
  assert.equal(a.report.entries.filter(e => e.ruleId === "task-named").length, 1);
  assert.equal(b.report.entries.filter(e => e.ruleId === "task-named").length, 0);
  assert.deepEqual(first.api.validate(first.compiled, first.envelope, options), a);
});

test("J1 #6 and J5 #5 should refuse incomplete lint coverage synchronously through the public facade", async () => {
  const { api, compiled, envelope } = await setup(profile => {
    for (const table of profile.validation) table.settings = table.settings.filter(setting => setting.rule !== "global");
  });
  const result = api.validate(compiled, envelope, { phase: "post-normalize", readinessPolicy: "draft" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "lint-config-incomplete");
  assert.equal(Object.hasOwn(result, "payload"), false);
  assert.equal(Object.hasOwn(result, "revision"), false);
});

test("J5 #5 should return typed refusals without rejected promises or candidate payloads", async () => {
  const { api, compiled, envelope } = await setup();
  const cases = [
    [compiled, { ...envelope, semanticRevision: "0".repeat(64) }, { phase: "post-normalize", readinessPolicy: "draft" }, "document-revision-mismatch"],
    [compiled, envelope, { phase: "post-normalize" }, "lint-config-incomplete"],
    [structuredClone(compiled), envelope, { phase: "post-normalize", readinessPolicy: "draft" }, "profile-context-unknown"],
  ];
  for (const [handle, input, options, code] of cases) {
    const result = api.validate(handle, input, options);
    assert.equal(result.status, "refused");
    assert.equal(result.code, code);
    assert.equal(Object.hasOwn(result, "payload"), false);
    assert.equal(Object.hasOwn(result, "revision"), false);
    assert.deepEqual(result.diagnostics, []);
  }
});
