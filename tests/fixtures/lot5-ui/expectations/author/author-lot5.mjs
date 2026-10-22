// Standalone expectation AUTHORING TOOL for the lot-5 UI corpus. Never imported
// by production code. CLI: node author-lot5.mjs <path to DESIGN.md R3.3>
// Expected values are written by hand in the group modules; this tool only
// assembles files, computes JCS/SHA-256, checks citation line numbers and the
// static consistency of the templates with the pinned comparator module.
// build() returns every generated file; the seal test re-runs it in memory to
// prove the sealed bytes are exactly the hand-authored sources' output.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { B, jcs, pretty, prettyShallow } from "./lot5-arith.mjs";
import { cases, clauseIndex, fixtures, fixture } from "./lot5-kit.mjs";
import * as P from "./lot5-profile.mjs";
import { validate, loadPinnedSchema } from "./lot5-schema-check.mjs";
import { surfaces } from "./lot5-group-surfaces.mjs";
import { compile, variants } from "./lot5-group-compile.mjs";
import { commands } from "./lot5-group-commands.mjs";
import { fields } from "./lot5-group-fields.mjs";
import { pasteGroup } from "./lot5-group-paste.mjs";
import { browser } from "./lot5-group-browser.mjs";
import { sequences } from "./lot5-group-sequences.mjs";
import { vendorPy, VENDOR, CODE_CORRECTIONS, checkDesignBlankLines } from "./lot5-group-vendor-py.mjs";
import { COMPARATORS, UNSEALED, RULE_NAMES, COMPARATOR_VERSION } from "../comparators/lot5-compare.mjs";

export const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
export const PATH_BASE = "tests/fixtures/lot5-ui/expectations/";
const REPO = new URL("../../../../../", import.meta.url);
const COMPARATOR_PATH = "comparators/lot5-compare.mjs";

/** Every template marker of one artifact (for the static checks). */
function markers(value, out = []) {
  if (Array.isArray(value)) value.forEach(v => markers(v, out));
  else if (value && typeof value === "object") {
    if (Object.hasOwn(value, "$unsealed") || Object.hasOwn(value, "$rule") || Object.hasOwn(value, "$equals")) out.push(value);
    Object.values(value).forEach(v => markers(v, out));
  }
  return out;
}

let built;
/** Assemble every generated file. designBytes enables citation and excerpt checks. */
export function build({ designBytes } = {}) {
  if (built) return built;
  let lines;
  if (designBytes) {
    if (B(designBytes) !== DESIGN_SHA256) throw new Error("wrong design authority bytes");
    lines = Buffer.from(designBytes).toString("utf8").split("\n");
  }
  fixture("fixtures/ui-neutral-descriptors.json", P.descriptorDocument);
  fixture("fixtures/ui-neutral-base.json", P.baseDocument);
  fixture("fixtures/ui-neutral-metrics.json", P.metricsDocument);
  fixture("fixtures/ui-neutral-registry.json", P.registryDocument);
  const profileFile = fixture("fixtures/ui-neutral-profile.json", P.profile);
  if (profileFile.sha256 !== P.profileFileSha256) throw new Error("profile pin drift");
  if (B(fixtures.get("fixtures/ui-neutral-descriptors.json")) !== P.descriptorPin.sha256 || B(fixtures.get("fixtures/ui-neutral-base.json")) !== P.basePin.sha256) throw new Error("pin drift");
  surfaces(); compile(); commands(); fields(); pasteGroup(); browser(); sequences(); vendorPy();

  // Input self-check (non-evidence): the fixture profile and the static-rule variants are schema-valid,
  // the schema-rule variants are not (their expected code is profile-schema).
  const profileSchema = loadPinnedSchema(new URL(P.PROFILE_SCHEMA.path, REPO), P.PROFILE_SCHEMA.sha256);
  if (validate(profileSchema, P.profile).length) throw new Error("fixture profile is not schema-valid");
  for (const v of variants) {
    const errors = validate(profileSchema, JSON.parse(fixtures.get(v.path)));
    if (v.schemaValid !== (errors.length === 0)) throw new Error(`variant ${v.name}: schema validity ${errors.length === 0}, expected ${v.schemaValid}`);
  }

  const cited = new Set();
  for (const entry of clauseIndex) for (const c of entry.clauses) for (let n = c.from; n <= c.to; n++) cited.add(n);
  if (lines) {
    checkDesignBlankLines(lines);
    const headings = lines.map((text, i) => ({ text, line: i + 1 })).filter(h => /^#{2,4} /.test(h.text));
    const sectionOf = line => {
      const h = [...headings].reverse().find(x => x.line <= line);
      const m = /^#{2,4} ((?:\d+\.)*\d+)[. ]/.exec(h?.text ?? "");
      return m ? m[1] : null;
    };
    for (const entry of clauseIndex) for (const c of entry.clauses) {
      if (!(c.from >= 1 && c.to >= c.from && c.to <= lines.length)) throw new Error(`${entry.caseId}: bad lines ${c.from}-${c.to}`);
      for (let n = c.from; n <= c.to; n++) {
        const s = sectionOf(n);
        if (!(s === c.section || s?.startsWith(`${c.section}.`))) throw new Error(`${entry.caseId}: line ${n} is in ${s}, not ${c.section}`);
        if (!lines[n - 1].trim()) throw new Error(`${entry.caseId}: line ${n} is blank`);
      }
    }
  }
  const comparatorText = readFileSync(new URL(`../${COMPARATOR_PATH}`, import.meta.url), "utf8");
  const out = new Map(fixtures);
  const ids = new Set();
  const usedReasons = new Set();
  for (const { path, record } of cases) {
    if (ids.has(record.caseId)) throw new Error(`duplicate ${record.caseId}`);
    ids.add(record.caseId);
    for (const a of [record.profileArtifact, record.commandArtifact, ...record.inputArtifacts, ...record.expectedArtifacts]) {
      if (a && Object.hasOwn(a, "path") && (!fixtures.has(a.path) || B(fixtures.get(a.path)) !== a.sha256)) throw new Error(`${record.caseId}: unpinned ${a.path}`);
    }
    const roles = new Set(record.expectedArtifacts.map(a => a.role));
    for (const id of record.comparatorIds) {
      if (!Object.hasOwn(COMPARATORS, id)) throw new Error(`${record.caseId}: comparator ${id}`);
      // A mechanism comparator (profile-c14n/2, stable-id/1 of the vendored Python cases) observes no member of its own.
      if (COMPARATORS[id].kind === "mechanism") continue;
      if (!roles.has(COMPARATORS[id].role)) throw new Error(`${record.caseId}: ${id} has no ${COMPARATORS[id].role} artifact`);
    }
    for (const a of record.expectedArtifacts) {
      if (![...Object.values(COMPARATORS)].some(c => c.role === a.role && record.comparatorIds.some(id => COMPARATORS[id] === c))) throw new Error(`${record.caseId}: artifact ${a.role} is compared by no comparator`);
      for (const m of markers(a.json)) {
        if (Object.hasOwn(m, "$unsealed")) { if (!Object.hasOwn(UNSEALED, m.$unsealed)) throw new Error(`${record.caseId}: reason ${m.$unsealed}`); usedReasons.add(m.$unsealed); }
        if (Object.hasOwn(m, "$rule") && !RULE_NAMES.includes(m.$rule)) throw new Error(`${record.caseId}: rule ${m.$rule}`);
      }
    }
    jcs(record);
    out.set(path, prettyShallow(record, 5));
  }
  out.set(COMPARATOR_PATH, comparatorText);
  const files = Object.fromEntries([...out.keys()].filter(p => p !== COMPARATOR_PATH).sort().map(path => [path, B(out.get(path))]));
  out.delete(COMPARATOR_PATH);
  out.set("manifest.json", pretty({
    format: "profile-parity-corpus/1", corpusVersion: "lot5-ui/2", pathBase: PATH_BASE,
    comparators: Object.entries(COMPARATORS).map(([id, c]) => c.kind === "mechanism"
      ? { id, kind: "mechanism", tolerance: "zero", executable: "lot5-compare/1", note: c.note }
      : { id, role: c.role, observes: c.member, ...(c.vocabulary ? { vocabulary: c.vocabulary } : {}), tolerance: "zero", executable: "lot5-compare/1", note: c.note }),
    executables: [{ id: "lot5-compare/1", version: COMPARATOR_VERSION, path: COMPARATOR_PATH, sha256: B(comparatorText), entry: "compareCase", runtime: "node" }],
    unsealedReasons: Object.fromEntries(Object.entries(UNSEALED).filter(([k]) => usedReasons.has(k))),
    files,
    notes: [
      "Lot-5 UI surface expectations, hand-authored from DESIGN R3.3, the block-A public contracts and the block-B harmonization decisions; no interpreter output was used.",
      "pathBase is the repository-relative directory of every path below; files covers every case, fixture and vendored file; manifest.json, clauses.json, design-excerpts.json, README.md, author/ and comparators/ are pinned by seal.json.",
      "Every comparator is the pinned executable lot5-compare/1 with zero tolerance; a member is excluded only by an explicit $unsealed marker whose reason is listed in unsealedReasons.",
      `Block-B parity sync (BLOCKB-PARITY-SYNC row PS-H25): the cases lot5-py-* are the Python lot-5 parity records vendored unchanged, except the refusal code of the ${Object.keys(CODE_CORRECTIONS).length} compile refusals of the CR-10 arbitration (README "CR-10 arbitration"); ${VENDOR} holds the Python seal's bytes unchanged and the README lists the re-expressed roles and comparator ids.`,
    ],
  }));
  out.set("clauses.json", prettyShallow({ format: "lot5-ui-clauses/2", designRevision: "R3.3", designSha256: DESIGN_SHA256, cases: clauseIndex }, 4));
  if (lines) out.set("design-excerpts.json", pretty({
    format: "lot5-ui-design-excerpts/1", designRevision: "R3.3", designSha256: DESIGN_SHA256,
    note: "SHA-256 of each cited DESIGN line (UTF-8, without its LF); the line texts are not copied.",
    lines: [...cited].sort((a, b) => a - b).map(line => ({ line, sha256: B(lines[line - 1]) })),
  }));
  const groups = {};
  for (const c of clauseIndex) groups[c.group] = (groups[c.group] ?? 0) + 1;
  out.set("README.md", readme(groups));
  built = { files: out, docs: clauseTable(), summary: { cases: cases.length, fixtures: fixtures.size, citedLines: cited.size, groups, unsealedReasons: [...usedReasons].sort() } };
  return built;
}

/** README.md: the hand-written text with its two generated blocks refreshed. */
function readme(groups) {
  const text = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const records = cases.map(c => c.record);
  const sequences = records.filter(r => r.operation === "canvas.sequence");
  const steps = sequences.reduce((n, r) => n + r.commandArtifact.json.steps.length, 0);
  const vendored = records.filter(r => r.caseId.startsWith("lot5-py-"));
  const scripts = vendored.filter(r => r.commandArtifact?.role === "sequence");
  const scriptSteps = scripts.reduce((n, r) => n + r.commandArtifact.json.steps.length, 0);
  const fieldsCount = P.notions.reduce((n, x) => n + x.fields.length, 0);
  const counts = [
    "| Group | Cases |", "| --- | --- |", ...Object.entries(groups).map(([g, n]) => `| ${g} | ${n} |`), "",
    `${records.length} cases; ${records.filter(r => r.expectedStatus.startsWith("refused:")).length} end in a case-level refusal; ${sequences.length} canvas sequences cover ${steps} steps; ${vendored.length} vendored Python cases (group py: ${vendored.length - scripts.length} compile, ${scripts.length} headless step scripts covering ${scriptSteps} steps).`,
    `Profile \`ui-neutral/1\` ${P.profile.version}: ${P.notions.length} notions, ${P.ui.length} UI entries, ${fieldsCount} fields, ${P.recipes.length} recipes.`,
  ].join("\n");
  const cell = s => s.replace(/\|/g, "\\|");
  const table = ["| Case | Clauses | Fails against (plausible wrong implementation) |", "| --- | --- | --- |",
    ...clauseIndex.map(e => `| \`${e.caseId.replace(/^lot5-/, "")}\` | ${e.clauses.map(c => `§${c.section} L${c.from}${c.to > c.from ? `–L${c.to}` : ""}`).join(", ")} | ${cell(e.discriminates)} |`)].join("\n");
  const block = (source, name, content) => {
    const re = new RegExp(`(<!-- generated: ${name} -->\\n)[\\s\\S]*?(<!-- end generated -->)`);
    if (!re.test(source)) throw new Error(`README block ${name} missing`);
    return source.replace(re, (_m, open, close) => `${open}${content}\n${close}`);
  };
  return block(block(text, "case counts", counts), "case table", table);
}

/** docs/design/block-b-lot5-expectations.md (generated clause → case table). */
function clauseTable() {
  const byClause = new Map();
  for (const entry of clauseIndex) for (const c of entry.clauses) {
    const key = `§${c.section} L${c.from}${c.to > c.from ? `–L${c.to}` : ""}`;
    if (!byClause.has(key)) byClause.set(key, { c, ids: [] });
    byClause.get(key).ids.push(entry.caseId.replace(/^lot5-/, ""));
  }
  const rows = [...byClause.values()].sort((a, b) => a.c.from - b.c.from || a.c.to - b.c.to).map(({ c, ids }) =>
    `| §${c.section} L${c.from}${c.to > c.from ? `–L${c.to}` : ""} | ${ids.map(id => `\`${id}\``).join(", ")} |`);
  const groups = {};
  for (const c of clauseIndex) groups[c.group] = (groups[c.group] ?? 0) + 1;
  return [
    "# Block B lot 5 — UI surface expectations", "",
    `The sealed lot-5 corpus lives in \`${PATH_BASE}\` (${clauseIndex.length} \`profile-parity-corpus/1\` cases, spec author Opus, reviewer gpt-6-astra max, seal fix round SF; block-B parity sync: the ${clauseIndex.filter(c => c.group === "py").length} \`lot5-py-*\` cases are the Python lot-5 parity records vendored unchanged under \`${VENDOR}\`, except ${Object.keys(CODE_CORRECTIONS).length} refusal codes of the CR-10 arbitration, author spec-seal, BLOCKB-PARITY-SYNC row PS-H25).`,
    "Its README records the method, the harness and observation contract, the pinned comparator executable, the lot-5 defaults, the UNSEALED owner items and members, and the wrong implementation each vector rejects.",
    "`tests/lot5-ui-expectations.test.mjs` verifies the seal, the comparators (including altered observations) and the independence rules without running any interpreter.", "",
    "This file is generated by `tests/fixtures/lot5-ui/expectations/author/author-lot5.mjs`; do not edit it by hand.", "",
    "## Case counts", "", "| Group | Cases |", "| --- | --- |", ...Object.entries(groups).map(([g, n]) => `| ${g} | ${n} |`), "",
    "## Clause → case", "",
    "Line numbers refer to DESIGN R3.3 (`48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`); the SHA-256 of each cited line is pinned in `design-excerpts.json`.", "",
    "| DESIGN clause | Cases |", "| --- | --- |", ...rows, "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { files, docs, summary } = build({ designBytes: readFileSync(process.argv[2] ?? "") });
  for (const dir of ["cases", "fixtures"]) rmSync(join(root, dir), { recursive: true, force: true });
  for (const [path, text] of files) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  writeFileSync(new URL("docs/design/block-b-lot5-expectations.md", REPO), docs);
  console.log(JSON.stringify(summary));
}
