// Three fresh Node processes; observations are evidence, never expectations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { brandTokens } from "../tests/helpers/brand.mjs";

const source = `
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as io from "./dist/io/index.js";
import { canon, configuration, freeze } from "./tests/helpers/workbench.mjs";
import { loadSealedVectors, runSealedVector, verifySeal } from "./tests/helpers/f1-sealed.mjs";
import { assertDisputed } from "./tests/helpers/f1-disputes.mjs";
verifySeal();
const disputes = JSON.parse(readFileSync("docs/design/receipts/block-a-f1-disputes.json"));
const activeDisputes = new Set(disputes.vectorResults.disputed);
let vectors = loadSealedVectors().map((item, ordinal) => ({ ...item, ordinal }));
if (process.argv[1] === "reverse") vectors.reverse();
if (process.argv[1] === "shuffled") vectors.sort((a,b) => (a.vector.caseId.length % 7)-(b.vector.caseId.length % 7) || (a.vector.caseId < b.vector.caseId ? -1 : 1));
const results = [];
for (const { file, vector, ordinal } of vectors) {
  const id = file + "#" + vector.caseId;
  const observed = await runSealedVector(vector, { ...io, configuration, freeze });
  const disputed = activeDisputes.has(id);
  if (disputed) assertDisputed(id, vector, observed, disputes);
  else if (vector.expected.kind === "refused") assert.deepEqual(observed, {status:"refused", ...vector.expected.diagnostics[0]});
  else if (vector.operation === "f1-json-round-trip") {
    assert.equal(canon(observed.json), canon(vector.expected.json));
    assert.equal(canon(observed.twice), canon(vector.expected.json));
  } else assert.deepEqual(observed, {status:"ok",json:vector.expected.json,diagnostics:vector.expected.diagnostics??[]});
  const bytes = canon(observed);
  results.push({id, ordinal, comparison:disputed?"explicit-arbitration":"sealed-exact", bytes:Buffer.byteLength(bytes), sha256:createHash("sha256").update(bytes).digest("hex")});
}
// The sealed data contains repeated case IDs; retain every original ordinal.
results.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:a.ordinal-b.ordinal);
console.log(JSON.stringify({runtime:process.version, results}));
`;

const runs = ["natural", "reverse", "shuffled"].map(order => {
  const observed = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source, order], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"],
  }));
  return { order, ...observed };
});
assert.deepEqual(runs[0].results, runs[1].results);
assert.deepEqual(runs[0].results, runs[2].results);
const document = JSON.stringify({ format: "f1-node-observations/1", probeSha256: createHash("sha256").update(source).digest("hex"),
  status: "equal-across-three-processes", runs }, null, 2) + "\n";
assert.equal(brandTokens(document).length, 0, "protected content in observations");
writeFileSync(new URL("../docs/design/receipts/f1-node-observations.json", import.meta.url), document);
console.log(`Three fresh processes agree on ${runs[0].results.length} vector outcomes.`);
