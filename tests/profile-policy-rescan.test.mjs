import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { scanBytes, maskPath } from "./fixtures/x24-externalization/expectations/derive/scan.mjs";

const root = new URL("../", import.meta.url);
const data = path => JSON.parse(readFileSync(new URL(`tests/fixtures/x24-externalization/expectations/${path}`, root)));
const lexicon = data("lexicon.json");
const zero = new Set(data("probe-expectations.json").rescan.zeroListEntries);
function files(path) {
  return readdirSync(new URL(path, root), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
test("C24 source contains no zero-list business policy", () => {
  const hits = files("src").flatMap(path => scanBytes(path, readFileSync(new URL(path, root)), lexicon).occurrences.filter(hit => zero.has(hit.entry)).map(hit => `${maskPath(path, lexicon)}:${hit.line}:${hit.column} ${hit.entry}`));
  assert.deepEqual(hits, []);
});
