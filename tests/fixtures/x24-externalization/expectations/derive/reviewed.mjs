// x24 derivation helper (CLI): the integration zero-literal scan of the tracked tree and the binding of the
// reviewed tokens of lexicon.json#/reviewed (README "Reviewed occurrences"). Usage, from the repository root:
//   git ls-files -z > tracked.lst
//   node tests/fixtures/x24-externalization/expectations/derive/reviewed.mjs --files tracked.lst [--write]
// Every listed file is scanned with derive/scan.mjs in strict mode, reviewed records ignored, and every
// occurrence is paired with a ledger row of the same masked file, form, entry, literal, columns, line span
// and line SHA-256 (identical keys pair in source order), or else with the base row of a relocated row of
// lexicon.json#/relocated whose record has these values (README "Relocated base rows"); a row pairs with one
// occurrence at most through all its keys. An unpaired occurrence whose entry and literal
// are those of a reviewed token and whose path starts with an eligible prefix of lexicon.json#/reviewed is
// a reviewed occurrence; with --write the files of every token are rewritten with these bindings (path
// SHA-256, file SHA-256, spans); relocated rows are never rewritten. Every other unpaired occurrence is
// unmatched: it is listed by masked position, form, entry and literal digest prefix, and the run fails.
// Imports: node:fs, node:path and the pure x24 helpers only; no literal is printed or written.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { maskPath, scanBytes, sha256 } from "./scan.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const lexiconPath = join(here, "../lexicon.json");
const lexicon = JSON.parse(readFileSync(lexiconPath, "utf8"));
const ledger = JSON.parse(readFileSync(join(here, "../ledger.json"), "utf8"));
const review = lexicon.reviewed;
const files = readFileSync(arg("files"), "utf8").split("\0").filter(Boolean).sort();

const pairKey = (r) => [r.file, r.form, r.entry, r.literal, r.column, r.endColumn, r.endLine - r.line, r.lineSha256].join("\0");
const pools = new Map();
for (const row of ledger.occurrences) pools.set(pairKey(row), [...(pools.get(pairKey(row)) ?? []), row.id]);
const relocations = new Map();
for (const rec of lexicon.relocated?.rows ?? []) relocations.set(pairKey(rec), [...(relocations.get(pairKey(rec)) ?? []), rec.row]);
const taken = new Set();
/** The first row of a key's pool that has not paired yet, now paired, or undefined. */
const take = (byKey, key) => {
  const ids = byKey.get(key) ?? [];
  while (ids.length && taken.has(ids[0])) ids.shift();
  const id = ids.shift();
  if (id) taken.add(id);
  return id;
};
const tokens = new Map(review.tokens.map((t) => [`${t.entry}\0${t.literal}`, t]));
const eligible = (path) => review.eligible.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));
const bindings = new Map(review.tokens.map((t) => [t.id, new Map()]));
const unmatched = [];
let total = 0;
let paired = 0;
let relocated = 0;
let bound = 0;
for (const path of files) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    continue;
  }
  const file = maskPath(path, lexicon);
  const { lines, occurrences } = scanBytes(path, bytes, lexicon, { reviewed: false });
  for (const o of occurrences) {
    total++;
    const r = { file, ...o, lineSha256: sha256(o.line === 0 ? path : lines[o.line - 1]) };
    if (take(pools, pairKey(r))) {
      paired++;
      continue;
    }
    if (take(relocations, pairKey(r))) {
      relocated++;
      continue;
    }
    const token = tokens.get(`${o.entry}\0${o.literal}`);
    if (token && eligible(path)) {
      bound++;
      const perFile = bindings.get(token.id);
      if (!perFile.has(path)) perFile.set(path, { file, pathSha256: sha256(path), sha256: sha256(bytes), spans: [] });
      perFile.get(path).spans.push([o.form, o.line, o.column, o.endLine, o.endColumn]);
      continue;
    }
    unmatched.push(`${file}:${o.line}:${o.column} ${o.form} ${o.entry} ${o.literal.slice(0, 8)}`);
  }
}
const summary = { files: files.length, occurrences: total, paired, relocated, reviewed: bound, unmatched: unmatched.length, byToken: Object.fromEntries(review.tokens.map((t) => [t.id, [...bindings.get(t.id).values()].reduce((n, f) => n + f.spans.length, 0)])) };
console.log(JSON.stringify(summary, null, 1));
for (const u of unmatched) console.log(`unmatched ${u}`);
if (process.argv.includes("--write")) {
  for (const t of review.tokens) {
    t.files = [...bindings.get(t.id).values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.pathSha256 < b.pathSha256 ? -1 : 1));
    t.count = t.files.reduce((n, f) => n + f.spans.length, 0);
  }
  writeFileSync(lexiconPath, `${JSON.stringify(lexicon, null, 1)}\n`);
}
process.exitCode = unmatched.length ? 1 : 0;
