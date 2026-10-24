// x24 derivation helper (CLI): the base-dependent checks of the seal, run by a reviewer outside the test
// campaign on a checkout or an extracted tree of the base commit (the campaign reads no Git object, so it
// cannot see the base). Usage, from the repository root:
//   git ls-tree -r --name-only -z <base> > files.lst
//   node tests/fixtures/x24-externalization/expectations/derive/base-check.mjs --files files.lst --root <base tree>
// Checks, each failure printed by position, entry and digest prefix only: (1) every ledger occurrence row is
// recomputed from the base files (scan, classification and field values, in order); (2) literal-set.json is
// the hashed set of the base spans; (3) the look selector branches of the base src/ files are
// probe-expectations.json#/rescan/selectorBranch/baseBranchRows; (4) the base probe lines carry the sealed
// digests, base lines 1 to 4 are the probe's first lines, and the import and call templates of probe1.original
// materialize to base lines 5 and 8; (5) the history rows of probe1.literalSource carry their literals; (6) each
// relocated row of lexicon.json#/relocated whose post-base line the current tree (the repository root) still
// holds is the base line of its row with the replaced spans substituted, and its span holds the row's literal. The
// distribution members are recomputed by derive/ledger.mjs (README "Commands"). Imports: node:fs, node:path
// and the pure x24 helpers only; texts stay in memory.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodeMember, maskPath, scanBytes, selectorBranches, sha256, splitLines } from "./scan.mjs";
import { classify, compileRules } from "./classify.mjs";
import { hashedLiteral } from "./literals.mjs";
import { canonical } from "./canonical.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = arg("root", ".");
const sealedJson = (p) => JSON.parse(readFileSync(join(here, "..", p), "utf8"));
const ledger = sealedJson("ledger.json");
const lexicon = sealedJson("lexicon.json");
const rulesDoc = sealedJson("classification-rules.json");
const expectations = sealedJson("probe-expectations.json");
const literalSetDoc = sealedJson("literal-set.json");
const files = readFileSync(arg("files"), "utf8").split("\0").filter(Boolean).sort();
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const FORM_ORDER = { path: 0, raw: 1, token: 2, decoded: 3 };
const entryOrder = new Map(lexicon.entries.map((e, i) => [e.id, i]));
const entryById = new Map(lexicon.entries.map((e) => [e.id, e]));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rules = compileRules(rulesDoc);
const bytesOf = new Map(files.map((p) => [p, readFileSync(join(root, p))]));
const linesOf = new Map();
const lines = (p) => {
  if (!linesOf.has(p)) linesOf.set(p, splitLines(decodeMember(bytesOf.get(p))));
  return linesOf.get(p);
};
const byPathSha = new Map(files.map((p) => [sha256(p), p]));

// (1) occurrence rows
check(files.length === ledger.base.trackedFiles, `tracked files ${files.length} instead of ${ledger.base.trackedFiles}`);
const expected = [];
for (const path of files) {
  const file = maskPath(path, lexicon);
  const bytes = bytesOf.get(path);
  const f = ledger.files[file];
  check(f && f.pathSha256 === sha256(path) && f.sha256 === sha256(bytes) && f.bytes === bytes.length, `${file} base file record`);
  const { lines: ls, occurrences } = scanBytes(path, bytes, lexicon);
  for (const o of occurrences) {
    const rule = classify(rules, file, o);
    if (!rule) {
      failures.push(`${file}:${o.line}:${o.column} ${o.entry} unmatched`);
      continue;
    }
    expected.push({ file, line: o.line, column: o.column, endLine: o.endLine, endColumn: o.endColumn, form: o.form, entry: o.entry, family: o.family, literal: o.literal, key: o.key, lineSha256: sha256(o.line === 0 ? path : ls[o.line - 1]), rule: rule.id, category: rule.category === "family" ? rulesDoc.familyCategory[o.family] : rule.category, consumer: rule.consumer, policy: rule.policy, targetRef: rule.target, disposition: rule.disposition, designRefs: [...entryById.get(o.entry).designRefs].sort() });
  }
}
expected.sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column || FORM_ORDER[a.form] - FORM_ORDER[b.form] || entryOrder.get(a.entry) - entryOrder.get(b.entry) || a.endLine - b.endLine || a.endColumn - b.endColumn);
check(expected.length === ledger.occurrences.length, `rows ${expected.length} instead of ${ledger.occurrences.length}`);
ledger.occurrences.forEach((row, i) => {
  const { id, ...fields } = row;
  if (canonical(fields) !== canonical(expected[i] ?? null)) failures.push(`${id} differs from its base recomputation`);
});

// (2) hashed literal set
const textOfRow = (row) => {
  const path = byPathSha.get(ledger.files[row.file].pathSha256);
  const text = row.line === 0 ? path.slice(row.column, row.endColumn) : lines(path)[row.line - 1].slice(row.column, row.endColumn);
  check(sha256(text) === row.literal, `${row.id} base span`);
  return text;
};
const texts = new Map(ledger.occurrences.map((row) => [row.id, textOfRow(row)]));
const records = new Map();
for (const row of ledger.occurrences) if (!records.has(row.literal)) records.set(row.literal, hashedLiteral(texts.get(row.id), row.entry));
const recomputed = [...records.values()].sort((a, b) => cmp(a.sha256, b.sha256));
check(canonical(recomputed) === canonical(literalSetDoc.literals), "literal-set.json differs from the base spans");

// (3) base selector branches
const sel = expectations.rescan.selectorBranch;
const found = [];
for (const path of files) {
  if (!path.startsWith("src/") || !/\.(?:m?js|cjs|jsx|tsx?|mts|cts)$/.test(path)) continue;
  const file = maskPath(path, lexicon);
  for (const b of selectorBranches(path, bytesOf.get(path).toString("utf8"), lexicon, sel.entries)) {
    const row = ledger.occurrences.find((r) => r.file === file && r.line === b.line && r.column === b.column && r.entry === b.entry && r.form === "raw");
    if (!row || row.literal !== b.literal) failures.push(`${file}:${b.line}:${b.column} base branch row`);
    else found.push(row.id);
  }
}
check(canonical(found.sort()) === canonical(sel.baseBranchRows), "base selector branches differ from baseBranchRows");

// (4) base probe lines and the literal-free materialization
const original = expectations.probe1.original;
const probePath = byPathSha.get(ledger.files[original.probe].pathSha256);
const base = lines(probePath);
check(sha256(bytesOf.get(probePath)) === ledger.files[original.probe].sha256, "base probe bytes");
for (const [n, digest] of [...Object.entries(original.headLines), ...Object.entries(original.baseLines)]) check(sha256(base[Number(n) - 1]) === digest, `base probe line ${n}`);
const p2 = expectations.probe2.original;
p2.baseLines.forEach(([first, last], k) => base.slice(first - 1, last).forEach((l, i) => check(sha256(l) === p2.lines[k][i], `base probe line ${first + i}`)));
check(sha256(base[p2.scopeLine.line - 1]) === p2.scopeLine.sha256, "base probe scope line");
const argument = original.call.argument.concat.map((part) => (typeof part === "string" ? part : texts.get(part.literal))).join("");
const materialize = (template) => template.map((part) => (typeof part === "string" ? part : part.row ? texts.get(part.row) : JSON.stringify(argument))).join("");
check(materialize(original.import.template) === base[original.import.line - 1], "import template materializes to base line 5");
check(materialize(original.call.template) === base[original.call.line - 1], "call template materializes to base line 8");
const current = readFileSync(original.probe, "utf8").split("\n");
check(Object.keys(original.headLines).every((n) => current[Number(n) - 1] === base[Number(n) - 1]), "probe lines 1-4 are base lines 1-4");

// (5) history rows of the materialized literals
const rowById = new Map(ledger.occurrences.map((r) => [r.id, r]));
for (const [literal, ids] of Object.entries(expectations.probe1.literalSource.historyRows)) for (const id of ids) check(rowById.get(id)?.literal === literal && rowById.get(id)?.disposition === "history-record", `${id} history row`);

// (6) relocated rows: the post-base line is a line of the current file with the record's SHA-256 (the pairing key
// ignores line numbers); a record whose line the current tree no longer holds is void, it pairs nothing.
const relocated = { rows: 0, verified: 0, void: 0 };
for (const rec of lexicon.relocated?.rows ?? []) {
  relocated.rows++;
  const row = rowById.get(rec.row);
  const path = row && byPathSha.get(ledger.files[row.file]?.pathSha256);
  if (!path) {
    failures.push(`${rec.id} base row ${rec.row}`);
    continue;
  }
  const post = existsSync(path) ? splitLines(decodeMember(readFileSync(path))).find((l) => sha256(l) === rec.lineSha256) : undefined;
  if (post === undefined) {
    relocated.void++;
    continue;
  }
  const base = lines(path)[row.line - 1];
  let rebuilt = "";
  let from = 0;
  for (const r of [...rec.edit.replaced].sort((a, b) => rowById.get(a.row).column - rowById.get(b.row).column)) {
    const replaced = rowById.get(r.row);
    const text = post.slice(r.column, r.endColumn);
    check(replaced.file === row.file && replaced.line === row.line && sha256(text) === r.sha256, `${rec.id} replacement of ${r.row}`);
    rebuilt += base.slice(from, replaced.column) + text;
    from = replaced.endColumn;
  }
  check(rebuilt + base.slice(from) === post, `${rec.id} post-base line is the base line of ${rec.row} with the replaced spans substituted`);
  check(sha256(post.slice(rec.column, rec.endColumn)) === row.literal, `${rec.id} span holds the literal of ${rec.row}`);
  relocated.verified++;
}

console.log(JSON.stringify({ trackedFiles: files.length, rows: expected.length, literals: recomputed.length, baseBranchRows: found.length, relocated, failures: failures.length }, null, 1));
for (const f of failures.slice(0, 50)) console.log(`failure ${f}`);
process.exitCode = failures.length ? 1 : 0;
