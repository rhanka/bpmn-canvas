// Standalone SEAL TOOL for the lot-5 UI corpus: byte length and raw SHA-256 of
// every file below expectations/ except seal.json (author/ and the pinned
// comparators/ executable included). CLI: node seal-lot5.mjs
// Imports Node builtins only; it reads bytes and never parses expectations.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name), relative = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`linked entry ${relative}`);
    if (stat.isDirectory()) walk(path, relative);
    else if (relative !== "seal.json") {
      const bytes = readFileSync(path);
      files.push({ path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
})(root, "");
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const comparator = files.find(f => f.path === "comparators/lot5-compare.mjs");
if (!comparator) throw new Error("comparator executable missing");
writeFileSync(join(root, "seal.json"), `${JSON.stringify({
  format: "lot5-ui-expectations-seal/2",
  method: "Hand-authored from DESIGN R3.3, the block-A public contracts and the block-B harmonization decisions; the lot5-py-* cases and vendor/py/ are the resealed Python lot-5 seal's parity cases and bytes vendored with their values unchanged (block-B parity sync, BLOCKB-PARITY-SYNC; PS-35 applied by the owning seal to two compile successes), except the refusal code of two compile refusals sealed by the CR-10 arbitration with vendor/py/ unchanged; only JCS/SHA-256 arithmetic was computed; no loader, compiler, evaluator, codec, layout, exporter or command output was observed or used.",
  author: "Opus spec author (claude-opus-5-5); vendored lot5-py-* values: Python seal author spec-seal",
  reviewer: "gpt-6-astra, max effort (review BLOCKB-SEAL-REVIEW-L5: REWORK, applied by the seal fix round SF); block-B parity sync reseal: review pending; integration micro-reseal (history rule I1, two private literals replaced by neutral values): review pending; CR-10 arbitration reseal (profile-type for a repeated enum value and an ill-typed UI binding): review pending",
  executables: [{ id: "lot5-compare/1", path: comparator.path, sha256: comparator.sha256 }],
  excluded: ["seal.json"],
  files,
}, null, 2)}\n`);
console.log(`${files.length} files sealed`);
