import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyUnicodeCase, loadUnicodeCaseTable, UNICODE_CASE_VERSION } from "../dist/profile/unicode-case.js";
import { evaluateValue } from "../dist/profile/compiler.js";
import { vendoredUnicodeCaseDocument, verifyUnicodeCasePin } from "./helpers/unicode-case-vendored.mjs";
import { casePolicyViolations } from "./helpers/case-policy.mjs";

function profileSources(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...profileSources(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}

test("should ban platform case methods in every profile source", () => {
  const offenders = [];
  const root = fileURLToPath(new URL("../src/profile/", import.meta.url));
  for (const path of profileSources(root)) {
    if (casePolicyViolations(readFileSync(path, "utf8")).length) offenders.push(path.slice(root.length + 1));
  }
  assert.deepEqual(offenders, []);
});

test("should match the vendored 15.0.0 contract bytes offline", () => {
  const pin = verifyUnicodeCasePin();
  assert.equal(pin.provenance.branch, "blockA/lot2");
});

test("should load the vendored 15.0.0 table and refuse other versions", () => {
  assert.equal(UNICODE_CASE_VERSION, "15.0.0");
  const loaded = loadUnicodeCaseTable(vendoredUnicodeCaseDocument());
  assert.equal(loaded.status, "ok");
  assert.equal(loaded.payload.manifest.unicodeVersion, "15.0.0");
  assert.ok(loaded.payload.manifest.sources.length > 0);
  const wrong = loadUnicodeCaseTable({ ...vendoredUnicodeCaseDocument(), manifest: { sources: [], unicodeVersion: "16.0.0" } });
  assert.equal(wrong.status, "refused");
  assert.equal(wrong.code, "profile-resource-missing");
  assert.equal(loadUnicodeCaseTable(null).code, "profile-resource-missing");
  const { finalSigma, ...rest } = vendoredUnicodeCaseDocument();
  assert.equal(loadUnicodeCaseTable(rest).code, "profile-resource-missing");
  assert.equal(loadUnicodeCaseTable({ ...vendoredUnicodeCaseDocument(), finalSigma: { ...finalSigma, capital: -1 } }).code, "profile-resource-missing");
});

test("should apply all 10 published vectors", () => {
  const table = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
  const { vectors } = JSON.parse(readFileSync(new URL("./fixtures/unicode-case-15.0.0/vectors.json", import.meta.url), "utf8"));
  assert.equal(vectors.length, 10);
  for (const vector of vectors) {
    assert.equal(applyUnicodeCase(vector.input, "lower", table), vector.lower, `lower ${vector.input}`);
    assert.equal(applyUnicodeCase(vector.input, "upper", table), vector.upper, `upper ${vector.input}`);
  }
});

test("should lowercase U+0130 to i plus the combining dot", () => {
  const table = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
  const lowered = applyUnicodeCase("İ", "lower", table);
  assert.equal(lowered, `i${String.fromCodePoint(0x307)}`);
  assert.deepEqual([...lowered].map(c => c.codePointAt(0).toString(16)), ["69", "307"]);
});

test("should apply Final_Sigma on pure Cased and Case_Ignorable context", () => {
  const table = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
  assert.equal(applyUnicodeCase("ΟΣ", "lower", table), "ος");
  assert.equal(applyUnicodeCase("ΟΣΑ", "lower", table), "οσα");
  assert.equal(applyUnicodeCase("Σ", "lower", table), "σ");
  assert.equal(applyUnicodeCase("ς", "lower", table), "ς");
  assert.equal(applyUnicodeCase("ΣΑ", "lower", table), "σα");
  assert.equal(applyUnicodeCase("Α Σ", "lower", table), "α σ");
  // No apostrophe exception: U+0027 is Case_Ignorable in the pinned table,
  // so it is skipped exactly like any other ignorable, and the sigma is final.
  assert.equal(applyUnicodeCase("Ο'Σ", "lower", table), "ο'ς");
  assert.equal(applyUnicodeCase("Ο'ΣΑ", "lower", table), "ο'σα");
});

test("should keep U+0264 unchanged under the 15.0.0 pin", () => {
  const table = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
  assert.equal(applyUnicodeCase("ɤ", "upper", table), "ɤ");
  assert.equal(applyUnicodeCase("ɤ", "lower", table), "ɤ");
});

test("should wire the compiler case operator to the injected table", () => {
  const table = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
  const descriptors = { "bpmn:Definitions": { scalars: [], containment: {}, references: {} } };
  const context = { descriptors, tree: { $type: "bpmn:Definitions" }, bindings: {}, unicodeCase: table };
  assert.deepEqual(
    evaluateValue({ op: "case", value: { op: "literal", value: "first" }, mode: "upper" }, context, "test"),
    { status: "ok", payload: "FIRST", diagnostics: [] },
  );
  assert.deepEqual(
    evaluateValue({ op: "case", value: { op: "literal", value: "ΟΣ" }, mode: "lower" }, context, "test"),
    { status: "ok", payload: "ος", diagnostics: [] },
  );
  const missing = evaluateValue(
    { op: "case", value: { op: "literal", value: "first" }, mode: "upper" },
    { descriptors, tree: { $type: "bpmn:Definitions" }, bindings: {} }, "test");
  assert.equal(missing.status, "refused");
  assert.equal(missing.code, "profile-resource-missing");
});
