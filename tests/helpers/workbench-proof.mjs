// Reproducible, JS-local receipts. Shared corpus and Python fields deliberately remain unverified.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as io from "../../dist/io/index.js";
import { configuration, freeze, localJson, canon, hash, snapshot } from "./workbench.mjs";
import { nativeModel, xmlOptions } from "./workbench-native.mjs";
import { xmlText, xmlDocument, xmlStructure } from "./workbench-xml.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const counts = (log) => Object.fromEntries(["tests", "pass", "fail", "skipped", "cancelled", "todo"].map((k) => [k, Number(log.match(new RegExp(`^# ${k} (\\d+)$`, "m"))?.[1] ?? NaN)]));

function f1Proof() {
  const cases = [];
  const a = localJson(), b = localJson(); b.rootElements[0].flowElements[1].name = "Review lantern"; b.diagrams.reverse();
  for (const [name, j] of [["local-A", a], ["local-B", b], ["local-A", a]]) {
    freeze(j);
    const before = hash(j), model = io.hydrate(j, configuration), modelBefore = hash(snapshot(model));
    const out = io.project(model, configuration);
    assert.equal(canon(out), canon(j));
    assert.equal(canon(io.project(io.hydrate(out, configuration), configuration)), canon(out));
    assert.equal(hash(j), before); assert.equal(hash(snapshot(model)), modelBefore);
    cases.push({ name, inputSha256: before, inputBeforeSha256: before, inputAfterSha256: hash(j), modelBeforeSha256: modelBefore, modelAfterSha256: hash(snapshot(model)), jsOutputSha256: hash(out), expectedOutputSha256: hash(j), pythonOutputSha256: null, firstDifference: null });
  }
  for (const [name, mutation, code] of [
    ["duplicate-id", (j) => { j.rootElements[0].flowElements[1].id = "Flow_First"; }, "duplicate-id"],
    ["dangling-reference", (j) => { j.rootElements[0].flowElements[0].targetRef = "Missing"; }, "dangling-reference"],
    ["wrong-type", (j) => { j.rootElements[0].flowElements[1].extensionElements.values[0].laneRef = "Task_Fold"; }, "invalid-reference"],
  ]) {
    const j = localJson(); mutation(j); freeze(j); const before = hash(j);
    let diagnostic;
    try { io.hydrate(j, configuration); assert.fail("Expected refusal"); }
    catch (e) { assert.ok(e instanceof io.IoError); assert.equal(e.code, code); diagnostic = { code: e.code, ids: e.ids, path: e.path, message: e.message }; }
    assert.equal(hash(j), before);
    cases.push({ name, inputSha256: before, inputBeforeSha256: before, inputAfterSha256: hash(j), jsOutputSha256: hash(diagnostic), diagnostic, pythonOutputSha256: null, firstDifference: null });
  }
  return cases;
}

async function f7Proof() {
  const cases = [];
  for (const [name, options] of [["local-A-formatted", xmlOptions], ["local-B-compact", freeze({ format: false, preamble: false })], ["local-A-formatted", xmlOptions]]) {
    const { definitions } = nativeModel(); freeze(definitions);
    const before = hash(snapshot(definitions)), out = await io.serializeBpmn(definitions, options);
    assert.equal(hash(snapshot(definitions)), before);
    const parsed = await io.createModdle().fromXML(xmlText(out)); assert.equal(parsed.warnings.length, 0);
    const twice = await io.serializeBpmn(parsed.rootElement, options);
    const reparsed = await io.createModdle().fromXML(xmlText(twice)); assert.equal(reparsed.warnings.length, 0);
    const thrice = await io.serializeBpmn(reparsed.rootElement, options);
    assert.deepEqual(xmlStructure(xmlDocument(out)), xmlStructure(xmlDocument(twice))); assert.deepEqual(twice, thrice);
    const doc = xmlDocument(out);
    assert.equal(doc.querySelector('[id="Flow_First"]').getAttribute("targetRef"), "Task_Fold");
    assert.equal(doc.querySelector('[id="Task_Fold"]').getAttribute("name"), "Fold é 🪁\n1.0 01 ٢ & < > \"");
    assert.ok(doc.querySelector('[id="Diagram_Lantern"]'));
    cases.push({ name, configurationSha256: hash(options), inputSha256: before, inputBeforeSha256: before, inputAfterSha256: hash(snapshot(definitions)), jsOutputSha256: hash(out), outputStructureSha256: hash(xmlStructure(doc)), parseWriteOutputSha256: hash(twice), parseWriteAgainOutputSha256: hash(thrice), pythonOutputSha256: null, firstDifference: null });
  }
  for (const [name, mutation, code] of [
    ["duplicate-id", (n) => { n.task.id = n.start.id; }, "duplicate-id"],
    ["dangling-reference", (n) => { n.first.targetRef = n.m.create("bpmn:Task", { id: "Missing" }); }, "dangling-reference"],
    ["wrong-type", (n) => { n.info.laneRef = n.task; }, "invalid-reference"],
  ]) {
    const n = nativeModel(); mutation(n); freeze(n.definitions); const before = hash(snapshot(n.definitions));
    let diagnostic;
    try { await io.serializeBpmn(n.definitions, xmlOptions); assert.fail("Expected refusal"); }
    catch (e) { assert.ok(e instanceof io.IoError); assert.equal(e.code, code); diagnostic = { code: e.code, ids: e.ids, message: e.message }; }
    assert.equal(hash(snapshot(n.definitions)), before);
    cases.push({ name, inputSha256: before, inputBeforeSha256: before, inputAfterSha256: hash(snapshot(n.definitions)), jsOutputSha256: hash(diagnostic), diagnostic, pythonOutputSha256: null, firstDifference: null });
  }
  return cases;
}

if (process.argv[2] === "--worker") {
  process.stdout.write(JSON.stringify(process.argv[3] === "G2" ? await f7Proof() : f1Proof()));
} else {
  const [gate, fullLogPath, redLogPath, greenLogPath, baseLogPath, defaultLogPath, browserLogPath] = process.argv.slice(2);
  assert.ok(["G1", "G2"].includes(gate));
  const f1 = gate === "G1", functionId = f1 ? "F1" : "F7", testFile = `tests/workbench-${functionId.toLowerCase()}.test.mjs`;
  const workers = Array.from({ length: 3 }, () => JSON.parse(execFileSync("node", [fileURLToPath(import.meta.url), "--worker", gate], { cwd: root, encoding: "utf8" })));
  assert.deepEqual(workers[0], workers[1]); assert.deepEqual(workers[0], workers[2]);
  const sourceFiles = f1 ? ["src/io/index.ts", "src/io/errors.ts", "src/io/moddle-json.ts"] : ["src/io/index.ts", "src/io/serialize-bpmn.ts"];
  const descriptorFiles = ["src/io/semantics.json", ...["bpmn", "bpmndi", "dc", "di"].map((n) => `node_modules/bpmn-moddle/resources/bpmn/json/${n}.json`), "node_modules/bpmn-moddle/resources/bpmn-io/json/bioc.json", "node_modules/bpmn-moddle/dist/index.js"];
  const fileHashes = (files) => Object.fromEntries(files.map((f) => [f, hash(readFileSync(root + f))]));
  const fullLog = readFileSync(fullLogPath, "utf8"), redLog = readFileSync(redLogPath, "utf8"), greenLog = readFileSync(greenLogPath, "utf8");
  const failures = (log) => [...log.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]).sort();
  const baseLog = readFileSync(baseLogPath, "utf8");
  assert.deepEqual(failures(fullLog), failures(baseLog));
  const receipt = {
    gate, function: functionId, jsLocalResult: "passed", twinGateResult: "unverified", parityStatus: "awaiting G0 manifest",
    sourceRevision: git("rev-parse", "HEAD").trim(), sourceState: "implementation staged atop red checkpoint; receipt included in green commit",
    sourceDiffSha256: hash(git("diff", "HEAD", "--no-ext-diff", "--", ...sourceFiles)), sourceFilesSha256: fileHashes(sourceFiles),
    versions: { package: JSON.parse(readFileSync(root + "package.json")).version, node: process.version, ...Object.fromEntries(["bpmn-moddle", "moddle", "moddle-xml", "typescript"].map((p) => [p, JSON.parse(readFileSync(root + `node_modules/${p}/package.json`)).version])) },
    descriptorFilesSha256: fileHashes(descriptorFiles), descriptorSetSha256: hash(fileHashes(descriptorFiles)), configuration: f1 ? configuration : { xmlOptions, descriptors: "native input factory, built with the shipped descriptor set" }, configurationSha256: hash(f1 ? configuration : xmlOptions),
    localCorpusFilesSha256: fileHashes(f1 ? ["tests/fixtures/io/workbench/local-model.json"] : ["tests/helpers/workbench-native.mjs"]), sharedCorpusManifestSha256: null,
    authoredAssertionSourceSha256: fileHashes([testFile]),
    comparisonRule: f1 ? "canonical JSON: recursively sorted object keys; unchanged array/string contents; finite ECMAScript number representation; explicit descriptor defaults" : "namespace-expanded XML structure, QName xsi:type expanded, exact text/CDATA content, ordered elements/refs/DI/colors; ignore declaration, prefix spelling, attribute order and nontext whitespace between elements only; repeated and parse-write fixed-point bytes exact within one configuration",
    repeatCount: 3, freshRuntimeCount: 3, caseOrder: "A B A then independent invalid cases in each fresh runtime", executions: workers,
    red: { command: `node --test ${testFile}`, ...counts(redLog), logSha256: hash(redLog), reason: f1 ? "hydrate/project not exported" : "serializeBpmn not exported" },
    green: { command: `node --test ${testFile}`, ...counts(greenLog), logSha256: hash(greenLog) },
    fullSuite: { command: f1 ? "npm test" : "node --test --test-concurrency=4 tests/*.test.mjs (after npm run build)", ...counts(fullLog), logSha256: hash(fullLog), inheritedFailuresUnchanged: true, inheritedFailures: failures(fullLog), baseCounts: counts(baseLog), baseLogSha256: hash(baseLog) },
    staticChecks: ["npm run typecheck", "npm run typecheck:compat", "all six built strict consumers in npm test", "brand and attribution guards in npm test"],
    limitations: ["No Python executed or compared", "Local invented corpus only; no shared-manifest claim", "Shared descriptor/default/numeric policy awaits G0", "Unknown optional attrs/extensions refused until supported", "Inherited red retained for G7; suite is not wholly green"],
  };
  if (!f1) {
    const defaultLog = readFileSync(defaultLogPath, "utf8"), browserLog = readFileSync(browserLogPath, "utf8");
    receipt.additionalCampaigns = [
      { command: "npm test", ...counts(defaultLog), logSha256: hash(defaultLog), failures: failures(defaultLog), result: "28 inherited failures plus two viewport assertion failures and their two parents; retained, not accepted as green" },
      { command: "node --test tests/render-looks.browser.test.mjs tests/v02.browser.test.mjs", ...counts(browserLog), logSha256: hash(browserLog), result: "both viewport files pass in isolation; assertions and timeouts unchanged" },
    ];
    receipt.limitations.push("Default file-concurrency campaign had two additional browser viewport assertion failures; bounded campaign runs every same test. No non-AI flaky waiver is claimed.", "Peer consensus review unavailable: exact author model/effort metadata not exposed; see workbench-review.md");
  }
  assert.equal(receipt.fullSuite.tests, f1 ? 1346 : 1366); assert.equal(receipt.fullSuite.pass, f1 ? 1318 : 1338); assert.equal(receipt.fullSuite.fail, 28);
  assert.equal(receipt.green.tests, f1 ? 26 : 20); assert.equal(receipt.green.pass, f1 ? 26 : 20); assert.equal(receipt.green.fail, 0);
  mkdirSync(root + "docs/design/receipts", { recursive: true });
  writeFileSync(root + `docs/design/receipts/${gate.toLowerCase()}-${functionId.toLowerCase()}.json`, JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(`${gate} receipt: three fresh runtimes, equal outputs and unchanged inputs\n`);
}
