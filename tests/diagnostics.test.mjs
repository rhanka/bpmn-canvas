import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { analyzeXml, hasXmlComment } = await import(root + "dist/internal/diagnostics.js");
const read = (rel) => readFileSync(root + rel, "utf8");
const corpus = (name) => read(`tests/fixtures/corpus/${name}`);
const e3 = (name) => read(`experiments/e3/corpus/${name}`);
const codes = (r) => r.diagnostics.map((d) => d.code).sort();

test("hasXmlComment ignores CDATA and processing instructions", () => {
  assert.equal(hasXmlComment("<a><!-- x --></a>"), true);
  assert.equal(hasXmlComment("<a><![CDATA[ <!-- not a comment --> ]]></a>"), false);
  assert.equal(hasXmlComment('<?xml version="1.0"?><?pi <!-- ?><a/>'), false);
  assert.equal(hasXmlComment("<a/>"), false);
});

test("rogue element outside extensionElements is lossy and carries its name", async () => {
  const r = await analyzeXml(corpus("rogue-extension.bpmn"));
  assert.deepEqual(codes(r), ["unparsable-content"]);
  assert.equal(r.lossy, true);
  assert.deepEqual(r.diagnostics[0].ids, ["acme:rogue"]);
});

test("XML comment is lossy", async () => {
  const r = await analyzeXml(corpus("comments.bpmn"));
  assert.deepEqual(codes(r), ["comments-present"]);
  assert.equal(r.lossy, true);
});

test("unresolved reference is lossy and names both ids", async () => {
  const r = await analyzeXml(corpus("unresolved-reference.bpmn"));
  assert.deepEqual(codes(r), ["unresolved-reference"]);
  assert.equal(r.lossy, true);
  assert.ok(r.diagnostics[0].ids.includes("GONE"));
});

test("duplicate id is lossy", async () => {
  const r = await analyzeXml(corpus("duplicate-id.bpmn"));
  assert.deepEqual(codes(r), ["duplicate-id"]);
  assert.equal(r.lossy, true);
  assert.deepEqual(r.diagnostics[0].ids, ["T"]);
});

test("no DI: missing-di, not lossy", async () => {
  const r = await analyzeXml(corpus("no-di.bpmn"));
  assert.deepEqual(codes(r), ["missing-di"]);
  assert.equal(r.lossy, false);
  assert.deepEqual(r.diagnostics[0].ids, ["T"]);
});

test("partial DI lists exactly the undrawn ids, not lossy", async () => {
  const r = await analyzeXml(corpus("partial-di.bpmn"));
  assert.deepEqual(codes(r), ["partial-di"]);
  assert.equal(r.lossy, false);
  assert.deepEqual([...r.diagnostics[0].ids].sort(), ["F", "U"]);
});

test("extension attributes and extensionElements are preserved, so no diagnostic", async () => {
  const r = await analyzeXml(corpus("extension-ok.bpmn"));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.lossy, false);
});

test("malformed XML is invalid-xml", async () => {
  const r = await analyzeXml("<bpmn:definitions");
  assert.deepEqual(codes(r), ["invalid-xml"]);
});

test("E3 corpus CE1, CE3, CE4, CE5 are clean (editable)", async () => {
  for (const f of readdirSync(root + "experiments/e3/corpus")) {
    const r = await analyzeXml(e3(f));
    assert.deepEqual(r.diagnostics, [], f);
    assert.equal(r.lossy, false, f);
  }
});

test("notation corpus has full DI", async () => {
  const r = await analyzeXml(corpus("notation.bpmn"));
  assert.equal(r.lossy, false);
  assert.ok(!codes(r).includes("missing-di"));
});

test("ioSpecification without inputSet/outputSet is reported, not fixed, not lossy", async () => {
  const r = await analyzeXml(corpus("io-specification-incomplete.bpmn"));
  assert.deepEqual(codes(r), ["incomplete-io-specification"]);
  assert.equal(r.lossy, false);
  assert.deepEqual(r.diagnostics[0].ids, ["P"]);
});
