// Lot-4 seal authoring tool (spec author only; CI never runs it).
// Usage: node lot4-derive.mjs <path-to-DESIGN.md R3.3>
// Writes cases/, artifacts/, manifest.json, index.json, design-excerpts.json,
// the docs clause table, then seal.json over every file of this directory.
// Imports: node builtins and sibling derivation modules only.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { B, compareText } from "./lot4-core.mjs";
import { makeContext, EXPECTATIONS, FIXTURES, SECTIONS, COMPARATORS, COMPARATOR_SOURCES, SEAL_PREFIX } from "./lot4-context.mjs";
import { setup } from "./lot4-setup.mjs";
import { layoutCases, templateCases, signatureCases } from "./lot4-cases-layout.mjs";
import { renderCases, themeCases, CASE_VECTORS } from "./lot4-cases-render.mjs";
import { exportCases, serializerCases, legacyAdapterCases, preparationCases } from "./lot4-cases-export.mjs";
import { vendorPyCases } from "./lot4-vendor.mjs";
import { CHOICES, CHOICE_UPPER, CHOICE_LOWER } from "./lot4-fixtures.mjs";
import { UNSEALED, CLOSED, DESIGN_SHA256 } from "./lot4-unsealed.mjs";

const designPath = process.argv[2];
if (!designPath) throw new Error("usage: node lot4-derive.mjs <DESIGN.md R3.3>");
const designBytes = readFileSync(designPath);
if (B(designBytes) !== DESIGN_SHA256) throw new Error("DESIGN digest is not R3.3");
const designLines = designBytes.toString("utf8").split("\n");

// Independent check of the literal Unicode 15.0.0 strings against the pinned table data.
const table = JSON.parse(readFileSync(join(FIXTURES, "unicode-case-15.0.0", "case-table.json"), "utf8"));
const upper = new Map(table.upper), lower = new Map(table.lower);
const inRanges = (ranges, cp) => ranges.some(([a, z]) => cp >= a && cp <= z);
function mapCase(text, mode) {
  const cps = [...text].map(c => c.codePointAt(0)), out = [];
  cps.forEach((cp, i) => {
    if (mode === "lower" && cp === table.finalSigma.capital) {
      let before = false, after = false;
      for (let j = i - 1; j >= 0; j--) { if (inRanges(table.caseIgnorable, cps[j])) continue; before = inRanges(table.cased, cps[j]); break; }
      for (let j = i + 1; j < cps.length; j++) { if (inRanges(table.caseIgnorable, cps[j])) continue; after = inRanges(table.cased, cps[j]); break; }
      out.push(before && !after ? table.finalSigma.lowerFinal : table.finalSigma.lowerNonFinal);
      return;
    }
    out.push(...((mode === "upper" ? upper : lower).get(cp) ?? [cp]));
  });
  return String.fromCodePoint(...out);
}
for (const [flow, name] of CHOICES) if (name !== undefined) {
  if (mapCase(name, "upper") !== CHOICE_UPPER[flow]) throw new Error(`upper literal ${flow}`);
  if (mapCase(name, "lower") !== CHOICE_LOWER[flow]) throw new Error(`lower literal ${flow}`);
}
for (const v of CASE_VECTORS) if (mapCase(v.input, v.mode) !== v.output) throw new Error(`case vector ${JSON.stringify(v)}`);
if (mapCase("helper", "upper") !== "HELPER") throw new Error("grid aid label");

// Author every case.
const ctx = makeContext();
const w = setup(ctx);
layoutCases(ctx, w);
signatureCases(ctx, w);
const R = renderCases(ctx, w);
templateCases(ctx, w);
themeCases(ctx, w, R);
const P = exportCases(ctx, w, R);
serializerCases(ctx, w, P);
legacyAdapterCases(ctx, w);
preparationCases(ctx, w);
// Vendored Python lot-4 parity cases (BLOCKB-PARITY-SYNC sections 2.1, 2.2).
const V = vendorPyCases(ctx);

// Output tree (only generated subtrees are replaced; vendor/py is an input).
for (const dir of ["cases", "artifacts"]) rmSync(join(EXPECTATIONS, dir), { recursive: true, force: true });
mkdirSync(join(EXPECTATIONS, "cases"), { recursive: true });
mkdirSync(join(EXPECTATIONS, "artifacts"), { recursive: true });
const write = (rel, bytes) => { writeFileSync(join(EXPECTATIONS, rel), bytes); return B(bytes); };
const files = {};
for (const [name, bytes] of [...ctx.artifacts].sort(([a], [b]) => compareText(a, b))) files[`artifacts/${name}`] = write(`artifacts/${name}`, bytes);
for (const c of ctx.cases) files[`cases/${c.caseId}.json`] = write(`cases/${c.caseId}.json`, ctx.json(c));
for (const f of V.files) files[f.path] = f.sha256;

// Cited DESIGN lines: digests only (no line text is copied into this repository).
const cited = new Set();
for (const entry of ctx.index) for (const cl of entry.clause) for (let n = cl.lines[0]; n <= cl.lines[1]; n++) cited.add(n);
for (const u of UNSEALED) for (const cl of u.clause) for (let n = cl.lines[0]; n <= cl.lines[1]; n++) cited.add(n);
const excerpts = {
  format: "lot4-design-excerpts/1", designRevision: "R3.3", designSha256: DESIGN_SHA256,
  sections: SECTIONS,
  lines: [...cited].sort((a, b) => a - b).map(n => ({ line: n, sha256: B(Buffer.from(designLines[n - 1], "utf8")) })),
};
write("design-excerpts.json", ctx.json(excerpts));

const groups = {};
for (const e of ctx.index) groups[e.group] = (groups[e.group] ?? 0) + 1;
write("index.json", ctx.json({ format: "lot4-expectation-index/2", designSha256: DESIGN_SHA256, caseCount: ctx.index.length, groups, cases: ctx.index, unsealed: UNSEALED, closed: CLOSED }));

// Pinned executable comparators and parent manifests (DESIGN 14.3 L961).
const pin = rel => ({ path: `${SEAL_PREFIX}${rel}`, sha256: B(readFileSync(join(EXPECTATIONS, rel))) });
const sources = COMPARATOR_SOURCES.map(pin);
const parentsRel = "profile-lot0/parents.json";
const parents = JSON.parse(readFileSync(join(FIXTURES, parentsRel), "utf8"));
write("manifest.json", ctx.json({
  format: "profile-parity-corpus/1", corpusVersion: "lot4-seal-3", pathBase: "tests/fixtures",
  parents: { canvas: parents.canvas, headless: parents.headless, record: { path: parentsRel, sha256: B(readFileSync(join(FIXTURES, parentsRel))) } },
  extends: { path: "profile-parity-corpus/profile-parity-corpus/1/manifest.json", sha256: B(readFileSync(join(FIXTURES, "profile-parity-corpus", "profile-parity-corpus", "1", "manifest.json"))) },
  comparators: COMPARATORS.map(c => ({ id: c.id, source: sources[0], dependencies: sources.slice(1), export: c.export, tolerance: "zero", note: c.note })),
  packages: [...w.packages, ...V.packages],
  vendorSource: V.source, vendored: V.vendored, aliases: V.aliases,
  files,
}));

// Docs clause table (English, generated from the index).
const lines = [
  "# Block B lot 4 expectations — clause to case table",
  "",
  "Generated from `tests/fixtures/lot4-layout-export/expectations/index.json` by the sealed",
  "derivation tool. DESIGN references are R3.3 section and one-based line ranges",
  `(SHA-256 \`${DESIGN_SHA256}\`). The README in the expectation directory holds the`,
  "method, design points, comparators, harmonization decisions and the UNSEALED list.",
  "",
  `Cases: ${ctx.index.length}. Groups: ${Object.entries(groups).map(([g, n]) => `${g} ${n}`).join(", ")}.`,
  "",
  "| DESIGN clause | Cases |",
  "| --- | --- |",
];
const byClause = new Map();
for (const e of ctx.index) for (const cl of e.clause) {
  const key = `§${cl.section} L${cl.lines[0]}${cl.lines[1] !== cl.lines[0] ? `–${cl.lines[1]}` : ""}`;
  if (!byClause.has(key)) byClause.set(key, { cl, ids: [] });
  byClause.get(key).ids.push(e.caseId);
}
const sectionOrder = s => s.split(".").map(Number);
for (const [key, { ids }] of [...byClause].sort(([, a], [, b]) => {
  const x = sectionOrder(a.cl.section), y = sectionOrder(b.cl.section);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return a.cl.lines[0] - b.cl.lines[0] || a.cl.lines[1] - b.cl.lines[1];
})) lines.push(`| ${key} | ${ids.map(id => `\`${id}\``).join(", ")} |`);
lines.push("", "## UNSEALED", "", "| Item | Gate / owner | DESIGN default | Clause |", "| --- | --- | --- | --- |");
for (const u of UNSEALED) lines.push(`| ${u.id}: ${u.item} | ${u.gate} | ${u.default} | ${u.clause.map(cl => `§${cl.section} L${cl.lines[0]}${cl.lines[1] !== cl.lines[0] ? `–${cl.lines[1]}` : ""}`).join(", ")} |`);
lines.push("", "## Closed in the fix round", "", "| Item | Closed by |", "| --- | --- |");
for (const c of CLOSED) lines.push(`| ${c.id}: ${c.item} | ${c.closedBy} |`);
writeFileSync(join(FIXTURES, "..", "..", "docs", "design", "block-b-lot4-expectations.md"), `${lines.join("\n")}\n`);

// README appendix (generated between markers; the rest of the README is hand-written).
const readmePath = join(EXPECTATIONS, "README.md");
const readme = readFileSync(readmePath, "utf8");
const begin = "<!-- generated:cases -->", end = "<!-- /generated:cases -->";
if (!readme.includes(begin) || !readme.includes(end)) throw new Error("README markers missing");
const cell = text => text.replace(/\|/g, "\\|");
const statusOf = new Map(ctx.cases.map(c => [c.caseId, c.expectedStatus]));
const opOf = new Map(ctx.cases.map(c => [c.caseId, c.operation]));
const caseTable = ["| Case | Group | Operation | Expected | Fails against |", "| --- | --- | --- | --- | --- |",
  ...ctx.index.map(e => `| \`${e.caseId}\` | ${e.group} | ${opOf.get(e.caseId)} | ${statusOf.get(e.caseId)} | ${cell(e.wrongImplementation)} |`)];
writeFileSync(readmePath, `${readme.slice(0, readme.indexOf(begin) + begin.length)}\n${caseTable.join("\n")}\n${readme.slice(readme.indexOf(end))}`);

// Seal every file of this directory except seal.json itself.
function walk(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(dir).sort(compareText)) {
    const full = join(dir, name), r = rel ? `${rel}/${name}` : name, st = lstatSync(full);
    if (st.isDirectory()) out.push(...walk(full, r)); else if (r !== "seal.json") out.push(r);
  }
  return out;
}
const sealFiles = walk(EXPECTATIONS).map(path => { const bytes = readFileSync(join(EXPECTATIONS, path)); return { path, bytes: bytes.length, sha256: B(bytes) }; });
writeFileSync(join(EXPECTATIONS, "seal.json"), ctx.json({
  format: "lot4-expectations-seal/1",
  method: "Hand-derived literal decisions assembled and hashed by the standalone derivation tool in derive/; no loader, compiler, evaluator, codec, layout, exporter or command output was observed or used.",
  comparators: sources,
  excluded: ["seal.json"], files: sealFiles,
}));
console.log(JSON.stringify({ cases: ctx.index.length, groups, artifacts: ctx.artifacts.size, sealed: sealFiles.length }));
