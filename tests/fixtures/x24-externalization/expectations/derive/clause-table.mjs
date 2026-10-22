// x24 derivation helper (CLI): writes docs/design/block-b-x24-expectations.md, the clause to case table,
// from manifest.json and the ledger summary. String building only. Run from the repository root:
//   node tests/fixtures/x24-externalization/expectations/derive/clause-table.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "tests/fixtures/x24-externalization/expectations";
const OUT = "docs/design/block-b-x24-expectations.md";
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const ledger = JSON.parse(readFileSync(join(DIR, "ledger.json"), "utf8"));
const s = ledger.summary;
const count = (g) => manifest.cases.filter((c) => c.group === g).length;
const short = (id) => id.replace(/^x24-/, "");
const PURPOSE = {
  L: `Occurrence ledger (${s.occurrences} I-numbers, one per match, ${s.unmatched} unmatched), distribution members (${s.distributionMembers} D-numbers, ${s.memberOccurrences} member occurrences, ${s.unexplainedMemberHits} unexplained), modules (${ledger.modules.length}), legacy value pins (SHA-256 only), literal-free seal (rules R1 to R4).`,
  S: "Admission of the injected business-policy/1 record (four admitted data sets, one with overlapping prefixes; schema, static and lexical refusals) and the recognition-stage ambiguity of DESIGN.md:154 (one refusal, one unambiguous run).",
  A: "Legacy adapter on the legacy-shaped synthetic data set: every consumer, the full layout, the facts descriptor and the static, preview and workshop surfaces.",
  R: "Hidden policies removed: retarget, name navigation, ambient decomposition, forced descriptor, built-in looks, first IO set, implicit markers, browser default tables, facts of another namespace version.",
  X: "Substitution neutral A against neutral B for every consumer and surface, and the profile path on the lot-0 neutral profiles.",
  P: "Exact assertions of the two acceptance probes and of the post-migration rescan.",
};

// Clause strings: "§12 L830-831, L836, §9.5 L729" -> [["§12", "830-831"], ["§12", "836"], ["§9.5", "729"]].
const rows = new Map();
for (const c of manifest.cases) {
  for (const clause of c.clauses) {
    let section = null;
    for (const part of clause.split(", ")) {
      const m = /^(§[0-9.]+(?: item \d+)?) L(\S+)$/.exec(part) ?? /^L(\S+)$/.exec(part);
      if (!m) throw new Error(`clause ${clause}`);
      if (m.length === 3) section = m[1];
      const lines = m.length === 3 ? m[2] : m[1];
      if (!section) throw new Error(`clause without section ${clause}`);
      const key = `${lines}\u0000${section}`;
      if (!rows.has(key)) rows.set(key, []);
      if (!rows.get(key).includes(short(c.caseId))) rows.get(key).push(short(c.caseId));
    }
  }
}
const start = (lines) => Number(lines.split("-")[0]);
const table = [...rows].map(([key, cases]) => [...key.split("\u0000"), cases]).sort((a, b) => start(a[0]) - start(b[0]) || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));

const text = [
  "# Block B, finding #24: externalization expectations, clause to case table",
  "",
  "Sealed expectations: `tests/fixtures/x24-externalization/expectations/` (method, data shape, operation",
  "catalogue, UNSEALED list: its `README.md`; digests: its `seal.json`). Authority: DESIGN.md R3.3, SHA-256",
  `\`${ledger.design.sha256}\`. Base: commit`,
  `\`${ledger.base.commit}\`. This revision is the single seal fix round`,
  "(review verdict REWORK: 2 BLOCKER, 4 MAJOR, 1 MINOR) together with the block B harmonization, sections",
  "3.4 and 7; the README lists each finding and its correction.",
  "",
  "Spec author: Opus (`claude-opus-5-5`), owner exception. Reviewer: gpt-6-astra, max effort.",
  "",
  "## Groups",
  "",
  "| Group | Cases | Purpose |",
  "| --- | --- | --- |",
  ...["L", "S", "A", "R", "X", "P"].map((g) => `| ${g} | ${count(g)} | ${PURPOSE[g]} |`),
  "",
  "## Clause to case table",
  "",
  "One row per cited DESIGN.md line or range, generated from `manifest.json` by `derive/clause-table.mjs`.",
  "Every case cites at least one clause; the first input artifact of each case (role `clause`) carries the",
  "same citations.",
  "",
  "| DESIGN.md lines | Section | Cases |",
  "| --- | --- | --- |",
  ...table.map(([lines, section, cases]) => `| ${lines} | ${section} | ${cases.join(", ")} |`),
  "",
].join("\n");
writeFileSync(OUT, text);
console.log(`${OUT}: ${table.length} clause rows`);
