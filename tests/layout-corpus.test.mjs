// Layout corpus (test list §10.1, 10.3, 10.4). Node + jsdom.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

globalThis.DOMParser = new JSDOM("").window.DOMParser;
const { layoutProcess, parseProcesses } = await import("../dist/layout/index.js");
const { normalize } = await import("../dist/internal/processModel.js");
const { sourcesSha256 } = await import("./fixtures/layout-corpus/build.mjs");

const dir = new URL("./fixtures/layout-corpus/", import.meta.url);
const raw = (f) => readFileSync(new URL(f, dir), "utf8");
const cases = JSON.parse(raw("cases.json"));
const expected = JSON.parse(raw("expected.json"));
const version = JSON.parse(raw("VERSION"));
const sha = (s) => createHash("sha256").update(s).digest("hex");

test("(kept) every ProcessLayout field equal on every corpus case", async () => {
  assert.deepEqual(Object.keys(cases), ["base-order", "base-review", "homonymous-lanes", "lane-block-boundary", "unnamed-lane", "shared-item", "duplicate-names"]);
  for (const [name, proc] of Object.entries(cases)) {
    const got = JSON.parse(JSON.stringify(await layoutProcess(normalize(structuredClone(proc)))));
    for (const field of ["pool", "lanes", "nodes", "labels", "apps", "edges", "edgeLabels", "connections"]) assert.deepEqual(got[field], expected[name][field], `${name}.${field}`);
  }
});

test("(kept) homonymous lanes on the canvas: lanes by index, never merged by name", () => {
  const xml = readFileSync(new URL("./fixtures/io/reference/C3/diagram.bpmn", import.meta.url), "utf8");
  const [{ proc }] = parseProcesses(xml);
  assert.deepEqual(proc.lanes.map((l) => l.name), ["Team", "Lane", "Team"], "the unnamed lane gets its display name, the two Team lanes stay apart");
  const laneOf = (label) => proc.lanes.findIndex((l) => l.nodes.some((n) => (n.text ?? n.label) === label));
  assert.deepEqual(["Kick-off", "Plan work", "Draft", "Build", "Delivered"].map(laneOf), [0, 0, 1, 2, 2]);
});

test("VERSION: format, hashes of both files and of the layout sources, dependency pins", () => {
  assert.deepEqual(Object.keys(version).sort(), ["bpmn-auto-layout", "bpmn-io", "casesSha256", "expectedSha256", "format", "sourcesSha256"]);
  assert.equal(version.casesSha256, sha(raw("cases.json")));
  assert.equal(version.expectedSha256, sha(raw("expected.json")));
  assert.equal(version["bpmn-auto-layout"], JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).dependencies["bpmn-auto-layout"]);
  assert.equal(version.sourcesSha256, sourcesSha256(), "a layout source changed: rebuild expected.json and VERSION (tests/fixtures/layout-corpus/build.mjs)");
});

test("dist/layout-corpus.json ships the corpus and its VERSION", () => {
  const file = new URL("../dist/layout-corpus.json", import.meta.url);
  assert.ok(existsSync(file), "dist/layout-corpus.json is built");
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { version, cases, expected });
});
