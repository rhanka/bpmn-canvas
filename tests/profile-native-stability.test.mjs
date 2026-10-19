import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as io from "../dist/io/index.js";
import { createHash } from "node:crypto";
import { nativeProofContext } from "./helpers/native-proof-context.mjs";
import { requireSingleContext } from "../dist/profile/descriptor-context.js";
import { canonicalize, canonicalDigest } from "../dist/profile/canonical.js";
import { previewNativeJson, buildPortableManifest, readPortableManifest } from "../dist/profile/native-bridge.js";

const fixture = readFileSync(new URL("./fixtures/profile-native/stable.bpmn", import.meta.url), "utf8");
const taskFixture = readFileSync(new URL("./fixtures/profile-native/stable-task.bpmn", import.meta.url), "utf8");

const configuration = { contractVersion: "1", defaults: "explicit", descriptors: { sem: io.semanticDescriptor } };
const writerOptions = { format: false, preamble: true };
const digest = value => createHash("sha256").update(value).digest("hex");

async function stability(source, targetId) {
  const parsed = await io.parseF1Xml(source, configuration);
  assert.deepEqual(parsed.diagnostics, []);
  const context = nativeProofContext(parsed.rootElement.$model);
  const json = io.project(parsed.rootElement, configuration);
  const before = canonicalize(json);
  const admitted = previewNativeJson(before, context.descriptors, []);
  assert.equal(admitted.status, "ok", admitted.code);
  assert.equal(admitted.payload.extractedPresentation.diagrams.length, 1);
  const edited = structuredClone(admitted.payload.tree);
  function find(value) {
    if (!value || typeof value !== "object") return;
    if (value.id === targetId) return value;
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) { for (const item of child) { const hit = find(item); if (hit) return hit; } }
      else { const hit = find(child); if (hit) return hit; }
    }
  }
  const target = find(edited);
  assert.ok(target);
  target.name = "Renamed by an unrelated edit";
  const model = io.hydrate(edited, configuration);
  assert.strictEqual(requireSingleContext(context, nativeProofContext(model.$model)), context);
  assert.equal(digest(canonicalize(io.project(model, configuration))), digest(canonicalize(edited)), "new codec preserves every retained field before writing");
  const bytes = await io.serializeBpmn(model, writerOptions);
  const reloaded = await io.parseF1Xml(bytes, configuration);
  const saved = io.project(reloaded.rootElement, configuration);
  // Compare the entire saved native projection with the unchanged upstream
  // writer on the independently parsed source plus the same one-field edit.
  // This permits only native first-pass deltas, not a name/prefix-only summary.
  const originalTarget = parsed.rootElement.rootElements.flatMap(root => root.flowElements ?? []).find(element => element.id === targetId);
  originalTarget.name = target.name;
  const referenceXml = (await parsed.rootElement.$model.toXML(parsed.rootElement, writerOptions)).xml;
  const reference = await io.parseF1Xml(referenceXml, configuration);
  assert.equal(digest(canonicalize(saved)), digest(canonicalize(io.project(reference.rootElement, configuration))), "entire saved result matches literal upstream");
  assert.deepEqual(reloaded.diagnostics, reference.diagnostics);
  assert.equal(find(saved).name, target.name);
  assert.equal(digest(canonicalize(json)), digest(before), "original JSON remains immutable");
  const restored = previewNativeJson(canonicalize(saved), context.descriptors, []);
  assert.equal(restored.status, "ok", restored.code);
  assert.strictEqual(requireSingleContext(context, nativeProofContext(reloaded.rootElement.$model)), context);
}

test("J5 #25 should keep process extension data through native admission and an unrelated edit", async () => {
  await stability(fixture, "StableTask");
});

test("J5 #25 should keep task extension data through native admission and an unrelated edit", async () => {
  await stability(taskFixture, "StableTaskStart");
});

const synthetic = {
  "bpmn:Definitions": { id: true, scalars: ["id", "targetNamespace", "exporterVersion"], containment: { rootElements: ["bpmn:Process"] }, references: {} },
  "bpmn:Process": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
};

test("should preview a native import with projection and base revision", async () => {
  const source = canonicalize({ $type: "bpmn:Definitions", id: "Preview_1", targetNamespace: "urn:neutral:preview", exporterVersion: "native/1", rootElements: [] });
  const preview = await previewNativeJson(source, synthetic, []);
  assert.equal(preview.status, "ok");
  assert.equal(preview.payload.tree.id, "Preview_1");
  assert.ok(preview.payload.baseRevision);
  assert.equal(preview.payload.sourceDigest, await canonicalDigest(JSON.parse(source)));
});

test("should carry portable identity beside xml without guessing", async () => {
  const identity = {
    mechanismVersion: "1", schemaVersion: "1.0.0", profile: "neutral/1", version: "1.1.0",
    sha256: "0".repeat(64), base: { id: "base", version: "1.0.0", sha256: "1".repeat(64) },
    descriptors: [{ id: "neutral-descriptors", version: "1.1.0", sha256: "2".repeat(64) }],
  };
  const envelope = { documentVersion: "1", profileIdentity: identity, tree: { $type: "bpmn:Definitions" }, bindings: [], semanticRevision: "2".repeat(64) };
  const manifest = buildPortableManifest(envelope);
  assert.deepEqual(Object.keys(manifest).sort(), ["bindings", "profileIdentity", "semanticRevision"]);
  assert.deepEqual(readPortableManifest(JSON.parse(canonicalize(manifest))), manifest);
  assert.throws(() => readPortableManifest({ ...manifest, bindings: [{ ownerId: "a", role: "r", targetId: "b" }, { ownerId: "a", role: "r", targetId: "c" }] }), /support-binding-conflict/);
});
