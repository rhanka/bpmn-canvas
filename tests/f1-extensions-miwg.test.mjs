import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import * as io from "../dist/io/index.js";
import { canonicalize } from "../dist/profile/canonical.js";
import { previewNativeJson } from "../dist/profile/native-bridge.js";
import { requireSingleContext } from "../dist/profile/descriptor-context.js";
import { nativeProofContext } from "./helpers/native-proof-context.mjs";

const root = new URL("./fixtures/f1-extensions/miwg/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root)));
const hashes = [
  "cf3764f7a15a7f3402eabcc0a90dd67c81d29a3512e3cf959792dd1d27fe77e2",
  "7edfadee4c488f7192bca9313613e2b3fb14634c073bc9d759823d0cc8a7faf7",
  "f8c125a7c492d218d1f6962fe03920bec4b1e4a9c2efae0746926667a67f44cc",
  "c2d2fd90db5f6fd71d942918bf935ab393d0826c3e354c7e32f065b902899755",
];
const configuration = { contractVersion: "1", defaults: "explicit", descriptors: { sem: io.semanticDescriptor } };
const options = { format: false, preamble: true };
const digest = value => createHash("sha256").update(value).digest("hex");
const ids = json => {
  const result = [];
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (value.$type && value.$type !== "$any" && value.id) result.push(value.id);
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(walk); else walk(child);
  }
  walk(json); return result.sort();
};

test("J5 #25 should verify all unchanged MIWG originals and license offline", () => {
  assert.equal(manifest.commit, "386baa55bf9a200f13ce26bef18557eceb19031f");
  assert.equal(manifest.license, "CC-BY-3.0");
  assert.deepEqual(manifest.files.map(file => file.sha256), hashes);
  assert.deepEqual(readdirSync(new URL("Reference/", root)).sort(), ["B.1.0.bpmn", "C.4.0.bpmn", "C.5.0.bpmn"]);
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(file.path, root));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  }
});

for (const name of ["C.5.0", "B.1.0", "C.4.0", "B.1.0"]) {
  test(`J5 #25 should carry MIWG ${name} through F1, native admission, edit and F7`, async () => {
    const bytes = readFileSync(new URL(`Reference/${name}.bpmn`, root));
    const parsed = await io.parseF1Xml(bytes, configuration);
    assert.deepEqual(parsed.diagnostics, []);
    const context = nativeProofContext(parsed.rootElement.$model);
    const json = io.project(parsed.rootElement, configuration);
    const source = canonicalize(json);
    const preview = previewNativeJson(source, context.descriptors, []);
    assert.equal(preview.status, "ok", preview.code);
    const native = io.hydrate(json, configuration);
    assert.strictEqual(requireSingleContext(context, nativeProofContext(native.$model)), context);
    assert.equal(digest(canonicalize(io.project(native, configuration))), digest(source), "exact codec fixed point");
    // The unchanged literal writer is the byte oracle for first-pass deltas.
    const reference = await native.$model.toXML(native, options);
    const emitted = await io.serializeBpmn(native, options);
    assert.equal(digest(emitted), digest(reference.xml), "exact literal-writer bytes for the same native input");
    const reloaded = await io.parseF1Xml(emitted, configuration);
    assert.deepEqual(reloaded.diagnostics, []);
    assert.deepEqual(ids(io.project(reloaded.rootElement, configuration)), ids(json));
    native.name = "Unrelated edit";
    parsed.rootElement.name = "Unrelated edit";
    const edited = await io.serializeBpmn(native, options);
    const editedReference = await native.$model.toXML(native, options);
    assert.equal(digest(edited), digest(editedReference.xml), "exact edited literal-writer bytes");
    const saved = await io.parseF1Xml(edited, configuration);
    assert.equal(saved.rootElement.name, "Unrelated edit");
    assert.deepEqual(ids(io.project(saved.rootElement, configuration)), ids(json));
    assert.equal(digest(canonicalize(json)), digest(source), "source remains immutable");
  });
}
