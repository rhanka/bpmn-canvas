// x24 derivation helper (CLI): writes seal.json, the byte length and SHA-256 of every sealed file and of
// every pinned executable. Hash helper only (node:fs, node:path, node:crypto); it reads files as bytes and
// runs nothing. The reseal receipts docs/design/receipts/block-b-x24-history-guard.json,
// docs/design/receipts/block-b-x24-unicode-literals-fix.json,
// docs/design/receipts/block-b-x24-p006-selector-allowance.json,
// docs/design/receipts/block-b-x24-i1-relocated-rows.json and
// docs/design/receipts/block-b-x24-final-spec-rebind.json name the seals and are not sealed by them. Run
// from the repository root, after every other sealed file is final:
//   node tests/fixtures/x24-externalization/expectations/derive/seal.mjs
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = "tests/fixtures/x24-externalization/expectations";
const EXTERNAL = ["tests/profile-externalization.probe.mjs", "docs/design/block-b-x24-expectations.md"];
const EXECUTABLES = [
  ["derive/comparators.mjs", "comparator semantics of every comparator id (COMPARATORS, compareCase)"],
  ["derive/canonical.mjs", "canonical JSON and its SHA-256, imported by the comparators"],
  ["derive/scan.mjs", "pinned lexicon scanner (path, raw, token and decoded forms; look selector branches)"],
  ["derive/literals.mjs", "literal containment rules R2 to R4 of the seal hygiene"],
  ["derive/sourcemap.mjs", "source map decoder of the distribution attribution"],
  ["../../../helpers/brand.mjs", "hash-only brand token helper imported by the scanner"],
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function walk(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const path = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(join(dir, path));
    if (stat.isSymbolicLink()) throw new Error(`linked entry ${path}`);
    if (stat.isDirectory()) out.push(...walk(dir, path));
    else out.push(path);
  }
  return out;
}
const entry = (base, path) => {
  const bytes = readFileSync(join(base, path));
  return { path, bytes: bytes.length, sha256: sha(bytes) };
};

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const ledger = JSON.parse(readFileSync(join(ROOT, "ledger.json"), "utf8"));
const byGroup = {};
for (const c of manifest.cases) byGroup[c.group] = (byGroup[c.group] ?? 0) + 1;

const seal = {
  format: "x24-expectations-seal/3",
  design: ledger.design,
  base: ledger.base,
  authorities: [
    "DESIGN.md R3.3 (sections 12, 12.1, 12.2, 13, 14.2, 14.3, 16)",
    "Block B seal harmonization, section 3.4 (X24) and section 7 (hygiene residual HY-1)",
    "Seal review of the X24 expectations (gpt-6-astra, max effort): REWORK, 2 BLOCKER, 4 MAJOR, 1 MINOR",
    "Block B integration (conductor): test history guard (tests/test-history-guard.test.mjs, unchanged) and history rule I1 (zero-literal scan of the tree)",
    "Lot-3 Unicode audit of the block B seals, section 5: the leading U+00A0 classification vector of DESIGN.md:152 (A-001, X-001) folded to U+0020 by the marker rename",
    "Spec author ruling on the P-006 selector-branch conflict (DESIGN.md:729, 837, 859, 865-874): the reviewed key of src/profile/lot4-export.ts:834 is technical, sealed as the reviewed allowance RA-01",
    "Lot-5 CR-10 seal round (ef9e781): three bound lot-5 files changed after the exact-path relink; the pending x24 rebind of their reviewed records",
    "Spec author ruling on the I1 residual of src/react/workshop.tsx (DESIGN.md:859, 863, 874): the three unmatched occurrences are the base rows I-1427, I-1462 and I-1464, whose lines the block B commit dc183c2 edited; sealed as the relocated rows RL-01 to RL-03",
    "Block B final spec pass after the fix round (review findings 17 and 20, DESIGN.md:874, 899, 927): reviewed records and RA-01 rebound to the bytes the fix round and the lot-3 and lot-4 reseals left (RA-01 now at src/profile/lot4-export.ts:867, same line bytes), three RV-08 lines reviewed again, eleven occurrences of two block B tests reviewed by exact path (RV-04 and the published API name RV-13), RL-01 to RL-03 retired after the restoration of their base lines",
  ],
  precedence: "DESIGN R3.3 > harmonization > review",
  author: "Opus (claude-opus-5-5), spec author, owner exception",
  reviewer: "gpt-6-astra, max effort",
  reviewStatus: "single seal fix round applied; integration micro-reseal (history guard and I1) applied; Unicode literal restoration (leading U+00A0 classification vector) applied; P-006 reviewed selector-branch allowance RA-01 and lot-5 CR-10 rebind applied; I1 relocation of three base rows of src/react/workshop.tsx (RL-01 to RL-03) applied; final spec rebind after the block B fix round applied (RL-01 to RL-03 retired); pending targeted verification and conductor acceptance",
  previousSeals: [
    { sha256: "d432a1d5cb3a727debc7d51dffa2fd1446a30d64a5c97d645108dd1b58777ff5", round: "first seal", cases: 90, occurrenceRows: 2173, verdict: "REWORK" },
    { sha256: "0b17ff222da3332f06e622dc787cbe9c42d9c4050a53a58a27e1b7156dfb1d8c", round: "single seal fix round", cases: 111, occurrenceRows: 3381, verdict: "integrated; the history guard flagged its Git object reads and the I1 scan reported unmatched occurrences of other block B seals" },
    { sha256: "e47a3328828d3d6a77370a83d8704657a00301136b83261e7cb9ebf11dbf225f", round: "integration micro-reseal (history guard, I1, lot-5 relink)", cases: 111, occurrenceRows: 3381, verdict: "integrated; the lot-3 Unicode audit found the leading U+00A0 classification vector folded to U+0020" },
    { sha256: "c3e99dc5e8544a6de0e04423516fcd28fcd7d16ac004ef010e526ccb4af0898b", round: "Unicode literal restoration and exact-path relink", cases: 111, occurrenceRows: 3381, verdict: "integrated; the selector-branch rule of P-006 reported the reviewed key of src/profile/lot4-export.ts:834, which no sealed allowance covered, and the lot-5 CR-10 seal left three bound lot-5 files to rebind" },
    { sha256: "682ac140cef29f74c0092a8f6b1e64f77e8959b1b1f003dce893da7b56cfe746", round: "P-006 reviewed selector-branch allowance and lot-5 CR-10 rebind", cases: 111, occurrenceRows: 3381, verdict: "integrated; the I1 scan still reported three base occurrences of src/react/workshop.tsx whose lines the block B commit dc183c2 edited (the residual of the exact-path relink)" },
    { sha256: "7f15b3512dd4ccd7b9e355f0b834a65adbdba654f2c52996011b84e741cb27ac", round: "I1 relocation of three base rows of src/react/workshop.tsx", cases: 111, occurrenceRows: 3381, verdict: "integrated into the block B squash; the fix round and the lot-3 transaction reseal changed bound files and the module of RA-01, restored the base lines of the relocated rows and added two block B tests with unreviewed occurrences" },
  ],
  authoringMethod: "Expected values read from the cited base lines and DESIGN clauses or computed by derive/arith.mjs, an independent re-implementation of the legacy formulas; no product module, codec, layout, renderer, exporter or command was executed and nothing was updated from actual output.",
  interpreterExecutedBeforeSeal: false,
  counts: {
    cases: manifest.cases.length,
    byGroup,
    occurrences: ledger.summary.occurrences,
    distributionMembers: ledger.summary.distributionMembers,
    memberOccurrences: ledger.summary.memberOccurrences,
    modules: ledger.modules.length,
  },
  unsealed: [
    { id: "U-1", point: "Explicit legacy retarget of document and data links to an earlier activity of the flow", owner: "owner", open: "OPEN-MIGRATION", designDefault: "retarget removed, endpoints preserved, relation reported (R-001); retarget value refused at load (S-011)" },
    { id: "U-2", point: "Legacy business values of the private record", owner: "private integration", open: null, designDefault: "supplied explicitly as injected data; pinned by canonical SHA-256 only (legacy-values.json, L-005)" },
    { id: "U-3", point: "Width-alias table of the legacy record equivalent to the base ambient decomposition", owner: "private integration", open: null, designDefault: "explicit alias table, fallback width otherwise, no ambient decomposition (R-003)" },
    { id: "U-4", point: "Composite glyphs and templates of the legacy looks", owner: "conductor and render/export sessions", open: "OPEN-RENDER-PRIMITIVES", designDefault: "supported explicit glyphs only, unsupported composites disabled; geometry inputs, element kinds and module selection sealed, not rendered pixels" },
    { id: "U-5", point: "Native transaction adapter staging", owner: "canvas session and conductor", open: "OPEN-HOOK", designDefault: "not exercised; legacy follow and auto-layout changes sealed only" },
    { id: "U-6", point: "Optional properties panel", owner: "owner", open: "OPEN-PANEL", designDefault: "untouched; no case depends on it" },
    { id: "U-7", point: "Release pins keeping existing callers on their release", owner: "conductor", open: "OPEN-LEGACY (ratified, DESIGN section 16 item 5)", designDefault: "not a seal value; no business default in the new package" },
  ],
  root: ROOT,
  executables: EXECUTABLES.map(([file, role]) => ({ file, sha256: sha(readFileSync(join(ROOT, file))), role })),
  files: walk(ROOT).filter((path) => path !== "seal.json").map((path) => entry(ROOT, path)),
  external: EXTERNAL.map((path) => entry(".", path)),
};
const text = JSON.stringify(seal, null, 1) + "\n";
writeFileSync(join(ROOT, "seal.json"), text);
console.log(sha(text));
