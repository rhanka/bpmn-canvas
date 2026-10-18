import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hydrate, project, serializeBpmn } from "../../dist/io/index.js";
import { hash, freeze, snapshot } from "./workbench.mjs";
import { corpus, load, index, config, comparators, codecConfig, canonical, model, nativeFixture, manifestHash } from "./workbench-parity.mjs";
import { xmlDocument, xmlStructure, xmlText } from "./workbench-xml.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) => execFileSync("rtk", ["proxy", "git", ...args], { cwd: root, encoding: "utf8" }).trim();
const fileHash = name => hash(readFileSync(new URL(name, corpus)));
const structural = bytes => canonical(xmlStructure(xmlDocument(bytes)));
async function proof() {
  const G1 = {}, G2 = {};
  for (const name of [...index.validF1, "W01", "W07", "W01"]) {
    const j = freeze(load(`cases/${name}.json`)), before = hash(canonical(j)), expected = canonical(load(`expected/${name}.json`));
    const m = hydrate(j, codecConfig), nativeBefore = hash(snapshot(m)), q = project(m, codecConfig), output = canonical(q);
    assert.equal(output, expected); assert.equal(hash(snapshot(m)), nativeBefore); assert.equal(hash(canonical(j)), before);
    assert.equal(canonical(project(hydrate(JSON.parse(expected), codecConfig), codecConfig)), expected);
    assert.equal(canonical(project(hydrate(q, codecConfig), codecConfig)), expected);
    const sample = { inputFileSha256: fileHash(`cases/${name}.json`), inputBeforeSha256: before, inputAfterSha256: hash(canonical(j)), expectedFileSha256: fileHash(`expected/${name}.json`), expectedCanonicalSha256: hash(expected), jsOutputSha256: hash(output), pythonOutputSha256: null, modelBeforeSha256: nativeBefore, modelAfterSha256: hash(snapshot(m)), mixedFixedPoint: "passed against frozen Python-lane expected projection", firstDifference: null, result: "passed" };
    if (G1[name]) assert.deepEqual(sample, G1[name]); G1[name] = sample;
  }
  for (const name of index.invalidF1) {
    const j = freeze(load(`cases/${name}.json`)), before = hash(canonical(j)), expected = load(`expected/${name}.diagnostic.json`);
    let diagnostic, ids;
    assert.throws(() => hydrate(j, codecConfig), e => { diagnostic = e.diagnostic; ids = e.ids; assert.deepEqual(diagnostic, expected); return true; });
    assert.equal(hash(canonical(j)), before);
    G1[name] = { inputFileSha256: fileHash(`cases/${name}.json`), inputBeforeSha256: before, inputAfterSha256: hash(canonical(j)), expectedCanonicalSha256: hash(canonical(expected)), jsOutputSha256: hash(canonical(diagnostic)), pythonOutputSha256: null, diagnostic, ids, firstDifference: null, result: "passed" };
  }
  for (const name of [...index.validF7, "W01", "W07", "W01"]) for (const [i, options] of config.xmlOptions.entries()) {
    const m = model(), native = freeze(nativeFixture(load(`cases/${name}.json`), m)), before = hash(snapshot(native));
    const out = await serializeBpmn(native, options), expectedBytes = readFileSync(new URL(`expected/${name}.bpmn`, corpus)), expected = structural(expectedBytes);
    assert.equal(structural(out), expected); assert.equal(hash(snapshot(native)), before);
    const once = await serializeBpmn((await m.fromXML(xmlText(out))).rootElement, options);
    assert.deepEqual(await serializeBpmn((await m.fromXML(xmlText(once))).rootElement, options), once);
    const mixed = await serializeBpmn((await m.fromXML(xmlText(expectedBytes))).rootElement, options);
    assert.equal(structural(mixed), expected);
    const key = `${name}/${i}`, sample = { inputFileSha256: fileHash(`cases/${name}.json`), inputBeforeSha256: before, inputAfterSha256: hash(snapshot(native)), expectedFileSha256: fileHash(`expected/${name}.bpmn`), expectedStructureSha256: hash(expected), jsOutputSha256: hash(out), jsStructureSha256: hash(structural(out)), pythonOutputSha256: null, jsFixedPointSha256: hash(once), mixedFixedPointSha256: hash(mixed), firstDifference: null, result: "passed" };
    if (G2[key]) assert.deepEqual(sample, G2[key]); G2[key] = sample;
  }
  return { G1, G2 };
}
if (process.argv[2] === "--worker") process.stdout.write(JSON.stringify(await proof()));
else {
  const [stage, redPath, greenPath] = process.argv.slice(2);
  const runs = Array.from({ length: config.repeatCount }, () => JSON.parse(execFileSync("node", [fileURLToPath(import.meta.url), "--worker"], { cwd: root, encoding: "utf8" })));
  for (const run of runs) assert.deepEqual(run, runs[0]);
  for (const [gate, file] of [["G1", "g1-f1.json"], ["G2", "g2-f7.json"]]) {
    const path = root + "docs/design/receipts/" + file, receipt = JSON.parse(readFileSync(path));
    receipt.parityStatus = "passed against immutable Python-lane expected corpus; executed Python receipt hashes pending";
    receipt.twinGateResult = "corpus comparisons passed; Python execution receipt audit pending";
    receipt.sharedCorpusManifestSha256 = manifestHash;
    receipt.pythonTwinRevision = "d2e8a1de81147d0a1fdb5f819d78ec149817ec80";
    receipt.parity = { stage, sourceRevision: git("rev-parse", "HEAD"), sourceDiffSha256: hash(git("diff", "HEAD", "--", "src/io/moddle-json.ts", "src/io/serialize-bpmn.ts", "src/io/errors.ts")), sourceFilesSha256: Object.fromEntries(["src/io/moddle-json.ts", "src/io/serialize-bpmn.ts", "src/io/errors.ts"].map(f => [f, hash(readFileSync(root + f))])), configSha256: fileHash("config.json"), comparatorsSha256: fileHash("comparators.json"), comparisonRule: comparators[gate === "G1" ? "json" : "xml"], diagnosticTuple: comparators.diagnostics, repeatCount: config.repeatCount, freshRuntimeCount: runs.length, caseOrder: "index then W01 W07 W01; both writer options", freshRunOutputHashes: runs.map(run => hash(canonical(run[gate]))), samples: runs[0][gate], redLogSha256: hash(readFileSync(redPath)), greenLogSha256: hash(readFileSync(greenPath)), firstDifference: null };
    writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  }
}
