import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSealedVectors } from "./helpers/f1-sealed.mjs";
import { assertDisputed } from "./helpers/f1-disputes.mjs";

const disputes = JSON.parse(readFileSync(new URL("../docs/design/receipts/block-a-f1-disputes.json", import.meta.url)));
const vectors = loadSealedVectors();
test("J5 #25 should reject retained-data mutations in default-namespace disputes", () => {
  const { file, vector } = vectors.find(({ vector }) => vector.caseId === "generic-default-namespace");
  const json = structuredClone(vector.expected.json);
  const element = json.rootElements[0].flowElements[0].extensionElements.values[0];
  element.$name.qname = "ns0:thing";
  element.$children[0].$name.qname = "ns0:child";
  const id = `${file}#${vector.caseId}`;
  const observed = { status: "ok", json, diagnostics: [] };
  assertDisputed(id, vector, observed, disputes);
  for (const change of [
    e => { e.$name.uri = "urn:changed"; },
    e => { e.$children[0].$body = "lost body"; },
    e => { e.$children[0].$name.qname = "ns8:child"; },
  ]) {
    const mutation = structuredClone(observed);
    change(mutation.json.rootElements[0].flowElements[0].extensionElements.values[0]);
    assert.throws(() => assertDisputed(id, vector, mutation, disputes));
  }
});

test("J5 #25 should reject middle-diagnostic and tree mutations in the presence dispute", () => {
  const dispute = disputes.disputes.find(d => d.id === "D-02-presence");
  const id = dispute.vectors[0];
  const { vector } = vectors.find(({ file, vector }) => `${file}#${vector.caseId}` === id);
  const observed = { status: "ok", json: structuredClone(vector.expected.json), diagnostics: structuredClone(vector.expected.diagnostics) };
  delete observed.json.rootElements[0].flowElements;
  assertDisputed(id, vector, observed, disputes);
  const diagnostic = structuredClone(observed);
  diagnostic.diagnostics[500].pointer = "/changed";
  assert.throws(() => assertDisputed(id, vector, diagnostic, disputes));
  const tree = structuredClone(observed);
  tree.json.rootElements[0].name = "changed";
  assert.throws(() => assertDisputed(id, vector, tree, disputes));
});
