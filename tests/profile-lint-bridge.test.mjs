import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Linter } from "bpmnlint";
import { createModdle } from "../dist/io/index.js";
import { canonicalize } from "../dist/profile/canonical.js";
import { compileLintPolicy } from "../dist/profile/lint-contracts.js";
import {
  LINT_BASELINE,
  PROFILE_PLUGIN_PACKAGE,
  PROFILE_RULE,
  checkEventMatrix,
  createPinnedRegistry,
  createProfileRule,
  indexModdleIds,
  recommendedRuleNames,
  runLint,
} from "../dist/profile/lint-bridge.js";

const require = createRequire(import.meta.url);
const baseline = require("bpmnlint/package.json");
const neutralProfile = JSON.parse(readFileSync(new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/neutral-profile.json", import.meta.url)));

const SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="urn:neutral:lint">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

async function moddleRoot(xml = SIMPLE) {
  const moddle = createModdle();
  const { rootElement } = await moddle.fromXML(xml);
  return rootElement;
}

function policiesFor(severity, classification = "readiness") {
  return { "label-required": { severity, classification } };
}

function standardFor(transport, options = {}) {
  return { "label-required": [transport, options] };
}

function emptyCompiledOptions(overrides = {}) {
  return {
    mechanismVersion: "1",
    profileDigest: "0".repeat(64),
    phase: "post-normalize",
    readinessPolicy: "accept",
    compiledRules: [],
    bindings: [],
    severityPolicyDigest: "1".repeat(64),
    ...overrides,
  };
}

async function selectedRequest({ settings = [], rules = [], parents = [], phase = "post-normalize", readinessPolicy = "accept", extraConfigs, evaluator } = {}) {
  const profile = structuredClone(neutralProfile);
  profile.rules = structuredClone(rules);
  profile.validation = [{ id: phase, policy: readinessPolicy, extends: parents, settings, profileRule: PROFILE_RULE }];
  const inherited = createPinnedRegistry({ configs: extraConfigs }).flatten(parents, {});
  const selected = await compileLintPolicy(profile, { phase, readinessPolicy }, inherited);
  return {
    profile, stage: phase, readinessPolicy, extends: parents,
    standard: selected.standard,
    policies: Object.fromEntries(selected.settings.map(setting => [setting.rule, {
      severity: setting.severity, classification: setting.classification ?? "integrity",
    }])),
    compiledOptions: selected.compiledOptions, extraConfigs, evaluator,
  };
}

const disabledStandard = () => recommendedRuleNames().map(rule => ({ rule, severity: "off", classification: "integrity" }));

// Existing transport/report scenarios author one complete source configuration.
async function lintFixture(root, fixture) {
  const rules = fixture.compiledOptions.compiledRules.map(rule => ({ ...structuredClone(neutralProfile.rules[0]), ...rule }));
  const settings = new Map(disabledStandard().map(setting => [setting.rule, setting]));
  for (const [name, policy] of Object.entries(fixture.policies)) {
    const rule = rules.some(rule => rule.id === name) ? `profile:${name}` : name;
    settings.set(rule, { rule, ...policy });
  }
  return runLint(root, await selectedRequest({
    settings: [...settings.values()], rules, parents: fixture.extends ?? [],
    phase: fixture.stage, readinessPolicy: fixture.readinessPolicy,
    evaluator: fixture.evaluator, extraConfigs: fixture.extraConfigs,
  }));
}

test("should apply flattened recommended settings as the execution source", async () => {
  const request = await selectedRequest({ parents: ["bpmnlint:recommended"] });
  delete request.standard;
  delete request.policies;
  const { report, rawStandardFindings } = await runLint(await moddleRoot(), request);
  assert.ok(rawStandardFindings.some(row => row.rule === "label-required"));
  assert.ok(report.entries.length > 0);
});

test("should refuse incomplete recommended coverage before evaluation", async () => {
  const request = await selectedRequest({ settings: [{ rule: "label-required", severity: "warn", classification: "readiness" }] });
  const root = await moddleRoot();
  await assert.rejects(() => runLint(root, request), /lint-config-incomplete/);
});

const configurationMutations = {
  "extra compiled option": request => { request.compiledOptions.extra = true; },
  "extra compiled rule key": request => { request.compiledOptions.compiledRules[0].extra = true; },
  "extra binding key": request => { request.compiledOptions.bindings = [{ ownerId: "Task_1", role: "support", targetId: "Process_1", extra: true }]; },
  "off-stage compiled rule": request => { request.compiledOptions.compiledRules[0].phase = "release"; },
  "alternative rule AST": request => { request.compiledOptions.compiledRules[0].assert = { op: "false" }; },
  "malformed profile digest": request => { request.compiledOptions.profileDigest = "bad"; },
  "stale profile digest": request => { request.compiledOptions.profileDigest = "f".repeat(64); },
  "stale policy digest": request => { request.compiledOptions.severityPolicyDigest = "f".repeat(64); },
  "missing subrule policy": request => { delete request.policies["profile:task-named"]; },
  "missing standard policy": request => { delete request.policies.global; },
  "missing readiness policy": request => { delete request.readinessPolicy; },
  "missing stage policy": request => { delete request.profile.validation[0].policy; },
  "missing subrule setting": request => { request.profile.validation[0].settings = disabledStandard(); },
  "off-stage profile setting": request => { request.profile.validation[0].settings.push({ rule: "profile:off-stage", severity: "off", classification: "readiness" }); },
  "transport disagrees with policy": request => { request.standard["label-required"] = ["off", {}]; },
  "caller standard options": request => { request.standard["label-required"][1].extra = true; },
  "profile-authored standard options": request => { request.profile.validation[0].settings[0].options = { extra: true }; },
};
for (const [name, mutate] of Object.entries(configurationMutations)) test(`should refuse ${name} before executing an evaluator`, async () => {
  let calls = 0;
  const settings = disabledStandard().map(setting => setting.rule === "label-required" ? { ...setting, severity: "warn" } : setting);
  settings.push({ rule: "profile:task-named", severity: "warn", classification: "readiness" });
  const request = await selectedRequest({ settings, rules: [neutralProfile.rules[0]], evaluator: () => { calls++; return []; } });
  mutate(request);
  const root = await moddleRoot();
  await assert.rejects(() => runLint(root, request), /lint-(?:rule-error|config-incomplete)/);
  assert.equal(calls, 0);
});

for (const name of ["constructor", "toString"]) test(`should treat ${name} as an unknown upstream rule`, async () => {
  assert.equal(createPinnedRegistry().resolveRule("bpmnlint", name), undefined);
  const request = await selectedRequest({ settings: [...disabledStandard(), { rule: name, severity: "error", classification: "integrity" }] });
  const root = await moddleRoot();
  await assert.rejects(() => runLint(root, request), /lint-rule-unknown/);
});

test("should refuse unrecognized options from a pinned host config", async () => {
  const extraConfigs = { "plugin:neutral/options": { extends: ["bpmnlint:recommended"], rules: { "label-required": { severity: "warn", options: { extra: true } } } } };
  const request = await selectedRequest({ parents: ["plugin:neutral/options"], extraConfigs });
  const root = await moddleRoot();
  await assert.rejects(() => runLint(root, request), /lint-rule-error/);
});

test("should replace inherited whole settings and reset options before numeric info transport", async () => {
  const extraConfigs = {
    "plugin:neutral/a": { extends: ["bpmnlint:recommended"], rules: { "label-required": ["error", { discarded: true }] } },
    "plugin:neutral/b": { rules: { "label-required": ["off", {}] } },
  };
  const request = await selectedRequest({
    parents: ["plugin:neutral/a", "plugin:neutral/b"], extraConfigs,
    settings: [...disabledStandard().filter(setting => setting.rule !== "label-required"), { rule: "label-required", severity: 3, classification: "advisory" }],
  });
  // Exercise generation at the boundary without caller transport/policy witnesses.
  delete request.standard;
  delete request.policies;
  delete request.compiledOptions;
  const result = await runLint(await moddleRoot(), request);
  assert.ok(result.report.entries.length > 0);
  assert.ok(result.report.entries.every(entry => entry.severity === "info" && entry.classification === "advisory"));
  assert.ok(result.rawStandardFindings.flatMap(row => row.reports).every(finding => finding.category === "warn"));
});

test("should reject an inherited off-stage profile setting before evaluation", async () => {
  const request = await selectedRequest({ settings: disabledStandard() });
  request.profile.validation[0].extends = ["plugin:neutral/off-stage"];
  request.extraConfigs = { "plugin:neutral/off-stage": { rules: { "profile:task-named": { severity: "off", classification: "readiness" } } } };
  const root = await moddleRoot();
  await assert.rejects(() => runLint(root, request), /lint-config-incomplete/);
});

test("should pin the published literal baseline", () => {
  assert.equal(`${LINT_BASELINE.engine}@${LINT_BASELINE.version}`, "bpmnlint@11.15.0");
  assert.equal(baseline.version, "11.15.0");
  assert.equal(PROFILE_PLUGIN_PACKAGE, "bpmnlint-plugin-profile-mechanism");
  assert.equal(PROFILE_RULE, "profile-mechanism/profile");
  assert.ok(recommendedRuleNames().includes("label-required"));
  assert.ok(recommendedRuleNames().includes("no-disconnected"));
});

test("should resolve and execute every rule in the recommended manifest", async () => {
  const registry = createPinnedRegistry();
  for (const name of recommendedRuleNames()) {
    assert.equal(typeof registry.resolveRule("bpmnlint", name), "function", name);
    const results = await new Linter({ resolver: registry }).lint(await moddleRoot(), { rules: { [name]: "error" } });
    assert.ok(Object.values(results).flat().every(finding => finding.category !== "rule-error"), name);
  }
});

test("should lint the complete neutral profile at every stage and policy", async () => {
  for (const table of neutralProfile.validation) {
    const selected = await compileLintPolicy(neutralProfile, { phase: table.id, readinessPolicy: table.policy }, {}, recommendedRuleNames());
    const result = await runLint(await moddleRoot(), {
      profile: neutralProfile, stage: table.id, readinessPolicy: table.policy,
      compiledOptions: selected.compiledOptions, evaluator: () => [],
    });
    assert.ok(result.report.entries.every(entry => !["lint-rule-unknown", "lint-rule-error"].includes(entry.code)), `${table.id}/${table.policy}`);
  }
});

test("should index sequence flows through containment rather than outgoing references", async () => {
  const root = await moddleRoot(SIMPLE.replaceAll("Start_1", "S").replaceAll("Task_1", "T").replaceAll("Flow_1", "F"));
  assert.equal(indexModdleIds(root).F, "/rootElements/0/flowElements/2");
});

test("should skip virtual and reference properties and retain prototype-like ids", () => {
  const child = id => ({ $type: "bpmn:Task", id, $descriptor: { properties: [] } });
  const inherited = { inherited: child("inherited") };
  const root = Object.assign(Object.create(inherited), {
    $type: "bpmn:Definitions", id: "__proto__",
    reference: child("reference"), virtual: child("virtual"), contained: child("kept"),
    $descriptor: { properties: [
      { name: "reference", isReference: true }, { name: "virtual", isVirtual: true },
      { name: "inherited" }, { name: "contained" },
    ] },
  });
  const index = indexModdleIds(root);
  assert.equal(Object.hasOwn(index, "__proto__"), true);
  assert.equal(index.__proto__, "");
  assert.equal(index.kept, "/contained");
  for (const name of ["reference", "virtual", "inherited"]) assert.equal(Object.hasOwn(index, name), false, name);
});

test("should index nested generic children at their containment pointers", async () => {
  const root = await moddleRoot(SIMPLE.replace('<bpmn:task id="Task_1">', '<bpmn:task id="Task_1"><bpmn:extensionElements><ext:outer xmlns:ext="urn:neutral:extension"><ext:inner id="Generic_1" /></ext:outer></bpmn:extensionElements>'));
  assert.equal(indexModdleIds(root).Generic_1, "/rootElements/0/flowElements/1/extensionElements/values/0/$children/0");
});

test("should refuse unknown and thrown lookups without invoking anything", async () => {
  const registry = createPinnedRegistry();
  assert.equal(registry.resolveRule("bpmnlint", "label-required")?.("x")?.check?.length, 2);
  assert.equal(registry.resolveRule("bpmnlint", "no-such-rule"), undefined);
  assert.equal(registry.resolveConfig("bpmnlint", "no-such-config"), undefined);
  assert.throws(() => registry.resolveRule("other-pkg", "label-required"), /lint-config-unknown/);
  await assert.rejects(
    async () =>
      lintFixture(await moddleRoot(), {
        stage: "post-normalize",
        readinessPolicy: "accept",
        standard: { "no-such-rule": ["error", {}] },
        policies: { "no-such-rule": { severity: "error", classification: "integrity" } },
        compiledOptions: emptyCompiledOptions(),
      }),
    /lint-rule-unknown/,
  );
});

test("should refuse an extends cycle before evaluation", async () => {
  const registry = createPinnedRegistry({
    configs: {
      "plugin:neutral/cycle-a": { extends: ["plugin:neutral/cycle-b"], rules: {} },
      "plugin:neutral/cycle-b": { extends: ["plugin:neutral/cycle-a"], rules: {} },
    },
  });
  await assert.rejects(
    async () =>
      lintFixture(await moddleRoot(), {
        stage: "post-normalize",
        readinessPolicy: "accept",
        extends: ["plugin:neutral/cycle-a"],
        standard: {},
        policies: {},
        compiledOptions: emptyCompiledOptions(),
        extraConfigs: {
          "plugin:neutral/cycle-a": { extends: ["plugin:neutral/cycle-b"], rules: {} },
          "plugin:neutral/cycle-b": { extends: ["plugin:neutral/cycle-a"], rules: {} },
        },
      }),
    /lint-config-cycle/,
  );
});

test("should replace whole settings and reset profile options", async () => {
  const registry = createPinnedRegistry({
    configs: {
      "plugin:neutral/a": { rules: { global: { severity: "error", options: { first: true } } } },
      "plugin:neutral/b": { rules: { global: { severity: "warn", options: { second: true } } } },
    },
  });
  const flat = registry.flatten(["plugin:neutral/a", "plugin:neutral/b"], { global: { severity: "off", options: { local: true } } });
  assert.deepEqual(flat.global, { rule: "global", severity: "off", options: {} });
});

test("should restore effective info sent over warn transport", async () => {
  const root = await moddleRoot();
  const { report, rawStandardFindings } = await lintFixture(root, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: standardFor("warn"),
    policies: policiesFor(3),
    compiledOptions: emptyCompiledOptions(),
  });
  const raw = rawStandardFindings.flatMap((entry) => entry.reports);
  assert.ok(raw.length > 0);
  assert.ok(raw.every((finding) => finding.category === "warn"));
  assert.ok(report.entries.length > 0);
  assert.ok(report.entries.every((entry) => entry.severity === "info"));
  assert.equal(report.operation, "validate");
});

test("should carry a profile warning through the error transport", async () => {
  const root = await moddleRoot();
  const index = indexModdleIds(root);
  const pointer = index.Task_1;
  assert.ok(pointer);
  const compiledOptions = emptyCompiledOptions({
    compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }],
  });
  const evaluator = () => [{ profileRuleId: "task-named", code: "task-name-missing", messageKey: "invalid", sourcePointer: pointer, id: "Task_1" }];
  const { report } = await lintFixture(root, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions,
    evaluator,
  });
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].ruleId, "task-named");
  assert.equal(report.entries[0].severity, "warn");
});

test("should merge duplicate subfindings and refuse malformed custom reports", async () => {
  const root = await moddleRoot();
  const index = indexModdleIds(root);
  const subfinding = { profileRuleId: "task-named", code: "task-name-missing", messageKey: "invalid", sourcePointer: index.Task_1, id: "Task_1" };
  const compiledOptions = emptyCompiledOptions({
    compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }],
  });
  const twice = await lintFixture(root, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions,
    evaluator: () => [subfinding, { ...subfinding }],
  });
  assert.equal(twice.report.entries.length, 1);
  const malformed = await lintFixture(root, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions,
    evaluator: () => [{ profileRuleId: "task-named", code: "wrong-code", messageKey: "invalid", sourcePointer: index.Task_1 }],
  });
  assert.equal(malformed.report.entries.length, 1);
  assert.equal(malformed.report.entries[0].code, "lint-rule-error");
  assert.equal(malformed.report.entries[0].classification, "integrity");
});

test("should refuse a subfinding that claims an unknown id", async () => {
  const root = await moddleRoot();
  const compiledOptions = emptyCompiledOptions({
    compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }],
  });
  const { report } = await lintFixture(root, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions,
    evaluator: () => [{ profileRuleId: "task-named", code: "task-name-missing", messageKey: "invalid", sourcePointer: "/no/such/pointer", id: "Missing_9" }],
  });
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].code, "lint-rule-error");
  assert.equal(report.entries[0].classification, "integrity");
});

test("should keep id-less subfindings on their own pointer", async () => {
  const root = await moddleRoot();
  const compiledOptions = emptyCompiledOptions({
    compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }],
  });
  const { report } = await lintFixture(root, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions,
    evaluator: () => [{ profileRuleId: "task-named", code: "task-name-missing", messageKey: "invalid", sourcePointer: "" }],
  });
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].source.pointer, "");
  assert.equal(report.entries[0].source.targetId, null);
  assert.equal(report.entries[0].source.provenance, "exact");
});

for (const finding of [
  { sourcePointer: "/no/such/object" },
  { sourcePointer: "/rootElements/0/no/such/object", id: "Process_1" },
  { sourcePointer: "/rootElements/0/flowElements/1", id: "Start_1" },
  { sourcePointer: "/rootElements/0", id: 42 },
]) test(`should refuse a custom coordinate absent from its original subtree: ${finding.sourcePointer}`, async () => {
  const result = await lintFixture(await moddleRoot(), {
    stage: "post-normalize", readinessPolicy: "accept", standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions: emptyCompiledOptions({ compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }] }),
    evaluator: () => [{ profileRuleId: "task-named", code: "task-name-missing", messageKey: "invalid", ...finding }],
  });
  assert.equal(result.report.entries.length, 1);
  assert.equal(result.report.entries[0].code, "lint-rule-error");
  assert.equal(result.report.entries[0].source.pointer, null);
  assert.equal(result.report.entries[0].source.provenance, "unavailable");
});

test("should accept an original id-less generic child and reject a node added by evaluation", async () => {
  const root = await moddleRoot(SIMPLE.replace('<bpmn:task id="Task_1">', '<bpmn:task id="Task_1"><bpmn:extensionElements><ext:outer xmlns:ext="urn:neutral:extension"><ext:inner /></ext:outer></bpmn:extensionElements>'));
  const parent = "/rootElements/0/flowElements/1/extensionElements/values/0";
  const subfinding = sourcePointer => ({ profileRuleId: "task-named", code: "task-name-missing", messageKey: "invalid", sourcePointer });
  const result = await lintFixture(root, {
    stage: "post-normalize", readinessPolicy: "accept", standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions: emptyCompiledOptions({ compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }] }),
    evaluator: () => {
      const outer = root.rootElements[0].flowElements[1].extensionElements.values[0];
      outer.$children.push(createModdle().createAny("ext:added", "urn:neutral:extension", {}));
      return [subfinding(`${parent}/$children/0`), subfinding(`${parent}/$children/1`)];
    },
  });
  const exact = result.report.entries.find(entry => entry.ruleId === "task-named");
  assert.equal(exact.source.pointer, `${parent}/$children/0`);
  assert.equal(exact.source.provenance, "exact");
  assert.equal(exact.source.targetId, null);
  assert.equal(result.report.entries.filter(entry => entry.code === "lint-rule-error").length, 1);
});

test("should refuse an unavailable evaluator as integrity error", async () => {
  const { report } = await lintFixture(await moddleRoot(), {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: {},
    policies: { "task-named": { severity: "warn", classification: "readiness" } },
    compiledOptions: emptyCompiledOptions({
      compiledRules: [{ id: "task-named", phase: "post-normalize", code: "task-name-missing", message: "invalid" }],
    }),
  });
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].code, "lint-rule-error");
  assert.equal(report.entries[0].classification, "integrity");
  assert.equal(report.entries[0].severity, "error");
});

test("should return identical results for A->B->A with fresh instances", async () => {
  const optionsA = emptyCompiledOptions();
  const optionsB = emptyCompiledOptions({ readinessPolicy: "draft", severityPolicyDigest: "2".repeat(64) });
  const request = (compiledOptions, severity, readinessPolicy) => ({
    stage: "post-normalize",
    readinessPolicy,
    standard: standardFor(severity),
    policies: policiesFor(severity === "warn" ? "warn" : "error"),
    compiledOptions,
  });
  const first = canonicalize((await lintFixture(await moddleRoot(), request(optionsA, "warn", "accept"))).report);
  const middle = canonicalize((await lintFixture(await moddleRoot(), request(optionsB, "error", "draft"))).report);
  const again = canonicalize((await lintFixture(await moddleRoot(), request(optionsA, "warn", "accept"))).report);
  assert.equal(first, again);
  assert.notEqual(first, middle);
});

test("should never mutate the input model", async () => {
  const moddle = createModdle();
  const before = await moddle.fromXML(SIMPLE);
  const beforeBytes = (await moddle.toXML(before.rootElement)).xml;
  await lintFixture(before.rootElement, {
    stage: "post-normalize",
    readinessPolicy: "accept",
    standard: standardFor("warn"),
    policies: policiesFor("warn"),
    compiledOptions: emptyCompiledOptions(),
  });
  const afterBytes = (await moddle.toXML(before.rootElement)).xml;
  assert.equal(afterBytes, beforeBytes);
});

test("should enforce the closed event matrix", () => {
  assert.equal(checkEventMatrix("StartEvent", [{ type: "TimerEventDefinition", timerBody: "PT1H" }]).ok, true);
  assert.equal(checkEventMatrix("StartEvent", [{ type: "TerminateEventDefinition" }]).ok, false);
  assert.equal(checkEventMatrix("StartEvent", [{ type: "TimerEventDefinition", timerBody: "PT1H" }, { type: "TimerEventDefinition", timerBody: "PT2H" }]).ok, false);
  assert.equal(checkEventMatrix("EndEvent", [{ type: "TerminateEventDefinition" }]).ok, true);
  assert.equal(checkEventMatrix("EndEvent", [{ type: "TimerEventDefinition", timerBody: "PT1H" }]).ok, false);
  assert.equal(checkEventMatrix("IntermediateThrowEvent", []).gate, "open-throw");
  assert.equal(checkEventMatrix("IntermediateThrowEvent", [{ type: "TerminateEventDefinition" }]).ok, false);
  assert.equal(checkEventMatrix("IntermediateCatchEvent", []).gate, "open-throw");
  assert.equal(checkEventMatrix("StartEvent", [{ type: "TimerEventDefinition", timerBody: "" }]).ok, false);
});

test("should keep lint bytes out of the root and browser entries", () => {
  for (const entry of ["src/index.ts", "src/browser/entry.ts"]) {
    const result = buildSync({ entryPoints: [entry], bundle: true, minify: true, platform: "browser", target: ["es2020"], write: false });
    assert.equal(result.outputFiles.length, 1);
    const bytes = result.outputFiles[0].text;
    assert.ok(!bytes.includes("profile-mechanism/profile"), `${entry} carries lint bytes`);
    assert.ok(!bytes.includes("bpmnlint-plugin-profile-mechanism"), `${entry} carries lint bytes`);
  }
});

test("should stay within the incremental browser budget without dynamic loads", () => {
  const result = buildSync({
    entryPoints: ["src/profile/lint-bridge.ts"],
    bundle: true,
    minify: true,
    platform: "browser",
    target: ["es2020"],
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
  });
  const bytes = result.outputFiles[0].text;
  assert.ok(!/import\s*\(/.test(bytes), "dynamic module load");
  assert.ok(!bytes.includes("fetch("), "network load");
  assert.ok(!bytes.includes("XMLHttpRequest"), "network load");
  const gzip = gzipSync(Buffer.from(bytes), { level: 9 }).length;
  assert.ok(gzip <= 150 * 1024, `incremental lint payload ${gzip} B exceeds 150 KiB gzip`);
});
