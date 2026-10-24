/** Executes pinned lot-5 cases without changing their bytes or comparators. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareCase } from "./fixtures/lot5-ui/expectations/comparators/lot5-compare.mjs";
import { caseFiles, root, inputsOf, runCase } from "./helpers/lot5-runtime.mjs";
for (const file of caseFiles) {
  const c = JSON.parse(readFileSync(join(root, "cases", file)));
  if (process.env.LOT5_ONLY && !c.caseId.includes(process.env.LOT5_ONLY)) continue;
  test(c.caseId, async () => {
    const observed = await runCase(c);
    const verdict = compareCase(c, inputsOf(c), observed);
    assert.equal(verdict.ok, true, JSON.stringify(verdict.failures).slice(0, 3000));
  });
}
