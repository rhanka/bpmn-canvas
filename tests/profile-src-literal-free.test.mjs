// Business-literal guard: the legacy fallback inventories published by
// adapterManifest() are injected profile data, never source literals. This
// test scans every file under src/ with the sealed x24 scanner and fails on
// any occurrence of any lexicon entry that pairs with no ledger row and no
// reviewed record (entries are referenced by id only, never by text).
// Occurrences recorded in the ledger before the base commit keep pairing and
// stay green, as do the reviewed records the scanner honours.
// Strict scan: reviewed bindings apply. No allowlist, no count tolerance.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { maskPath, scanBytes, sha256 } from "./fixtures/x24-externalization/expectations/derive/scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const x24 = join(here, "fixtures/x24-externalization/expectations");
const lexicon = JSON.parse(readFileSync(join(x24, "lexicon.json"), "utf8"));
const ledger = JSON.parse(readFileSync(join(x24, "ledger.json"), "utf8"));

const pairKey = (file, o, line) => [file, o.form, o.entry, o.literal, o.column, o.endColumn, o.endLine - o.line, line].join("\0");
const pools = new Map();
for (const row of ledger.occurrences) {
  const key = [row.file, row.form, row.entry, row.literal, row.column, row.endColumn, row.endLine - row.line, row.lineSha256].join("\0");
  pools.set(key, [...(pools.get(key) ?? []), row.id]);
}
const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
};

test("src/ contains no unpaired business literal", () => {
  const hits = [];
  for (const full of walk(join(repo, "src"))) {
    const path = relative(repo, full);
    const bytes = readFileSync(full);
    const file = maskPath(path, lexicon);
    const { lines, occurrences } = scanBytes(path, bytes, lexicon);
    for (const o of occurrences) {
      const key = pairKey(file, o, o.line === 0 ? sha256(path) : sha256(lines[o.line - 1]));
      const pool = pools.get(key);
      if (pool?.length) {
        pool.shift();
        continue;
      }
      hits.push(`${path}:${o.line}:${o.column}:${o.endColumn} ${o.form} ${o.entry}`);
    }
  }
  assert.deepEqual(hits, [], "business literals live in injected profile data, not in src/");
});
