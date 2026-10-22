// x24 derivation helper (CLI): writes literal-set.json, the hashed literal set of the seal hygiene: one
// record per distinct text of the ledger occurrences, recovered from the base tree at each row's span (path
// rows from the base paths) and checked against the row's literal SHA-256. Usage, from the repository root:
//   git ls-tree -r --name-only -z <base> > files.lst
//   node tests/fixtures/x24-externalization/expectations/derive/literal-set.mjs --files files.lst \
//     --root <checkout or extracted tree of the base> [--out <path>]
// Imports: node:fs, node:path and the pure x24 helpers only. The texts stay in memory; the output holds
// SHA-256 values, lengths, edge classes and prefilters only.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodeMember, sha256, splitLines } from "./scan.mjs";
import { LONG_MIN, PREFILTER_BITS, hashedLiteral } from "./literals.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = arg("root", ".");
const ledger = JSON.parse(readFileSync(join(here, "../ledger.json"), "utf8"));
const files = readFileSync(arg("files"), "utf8").split("\0").filter(Boolean);
const byPathSha = new Map(files.map((p) => [sha256(p), p]));
const lines = new Map();

/** The exact text of one ledger row at its base span, checked against its literal SHA-256. */
function rowText(row) {
  const path = byPathSha.get(ledger.files[row.file]?.pathSha256);
  if (!path) throw new Error(`${row.id}: base path of ${row.file} not listed`);
  let text;
  if (row.line === 0) text = path.slice(row.column, row.endColumn);
  else {
    if (row.form !== "raw" || row.endLine !== row.line) throw new Error(`${row.id}: not a single-line raw row`);
    if (!lines.has(path)) lines.set(path, splitLines(decodeMember(readFileSync(join(root, path)))));
    text = lines.get(path)[row.line - 1].slice(row.column, row.endColumn);
  }
  if (sha256(text) !== row.literal) throw new Error(`${row.id}: base span does not hash to its literal`);
  return text;
}

const records = new Map();
for (const row of ledger.occurrences) {
  const text = rowText(row);
  if (!records.has(row.literal)) records.set(row.literal, hashedLiteral(text, row.entry));
}
const literals = [...records.values()].sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1));
const set = {
  format: "x24-literal-set/1",
  note: "Hashed literal set of the seal hygiene (README \"Literal-free seal\"): one record per distinct exact text of the ledger occurrences, derived by derive/literal-set.mjs from the base tree at each row's span and checked against the row's literal SHA-256. A record holds the SHA-256 and the length (UTF-16 units) of the text, the entry of its first ledger row, the word class of its first and last unit (W for [A-Za-z0-9_], N otherwise) and, from longMin units, a prefilter; no text, part or encoding of a text is written.",
  ledger: "ledger.json",
  longMin: LONG_MIN,
  prefilter: { hash: "base-257 polynomial over UTF-16 units, modulo 2^32", bits: PREFILTER_BITS, appliesTo: `literals of ${LONG_MIN} or more units; a shorter literal is matched at whole-token windows only` },
  count: literals.length,
  literals,
};
const text = `${JSON.stringify(set, null, 1)}\n`;
const out = arg("out");
if (out) writeFileSync(out, text);
console.log(`${literals.length} distinct literals from ${ledger.occurrences.length} rows; sha256 ${sha256(text)}`);
