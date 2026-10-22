import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext } from "./fixtures/lot4-layout-export/expectations/derive/lot4-context.mjs";
import { vendorPyCases } from "./fixtures/lot4-layout-export/expectations/derive/lot4-vendor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const vendorCase = id => JSON.parse(readFileSync(join(here, "fixtures/lot4-layout-export/expectations/vendor/py/parity/cases", `${id}.json`), "utf8"));

test("lot4 vendor derivation accepts the decided twin compile record form", () => {
  const ctx = makeContext();
  const out = vendorPyCases(ctx);
  assert.equal(out.vendored.length, 194);
  assert.equal(out.aliases.length, 2);
  // The decided twin form carries diagnostics: [] on the compile record itself.
  const twin = vendorCase("export.compile.all-fields-valid");
  const twinResult = twin.expectedArtifacts.find(a => a.role === "result");
  assert.deepEqual(twinResult.json, { status: "ok", diagnostics: [] });
  const byId = new Map(ctx.cases.map(c => [c.caseId, c]));
  const decided = ctx.index.filter(e => (e.decisions ?? []).some(d => d.startsWith("PS-35")));
  assert.ok(decided.length > 0, "PS-35 decided cases present");
  for (const e of decided) {
    const record = byId.get(e.caseId);
    assert.deepEqual(record.expectedArtifacts[0], { role: "result", json: { status: "ok", diagnostics: [] } }, e.caseId);
    assert.ok(record.expectedArtifacts.some(a => a.role === "unsealed" && a.json.some(u => u.pointer === "/payload")), `${e.caseId} unsealed payload`);
  }
  const refused = ctx.index.filter(e => (e.decisions ?? []).some(d => d.startsWith("PS-25")));
  assert.ok(refused.length > 0, "PS-25 decided cases present");
  for (const e of refused) {
    const record = byId.get(e.caseId);
    assert.equal(record.expectedArtifacts[0].json.status, "refused");
    assert.deepEqual(record.expectedArtifacts[0].json.diagnostics, [], e.caseId);
  }
});
