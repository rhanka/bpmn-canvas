import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandTokens } from "./helpers/brand.mjs";

test("should keep step 4 library contracts and evidence neutral",()=>{
  const paths=["boundary.ts","presentation-contracts.ts","report.ts","results.ts","lint-contracts.ts"].map(p=>`src/profile/${p}`);
  paths.push(...["snapshot-1","layout-1","render-data-1","report-2","result-1"].map(p=>`schemas/profile/${p}.schema.json`));
  paths.push(...["snapshot","render-contract","report","result","lint-contract","boundary-schema","s4-scope","s4-fix"].map(p=>`tests/profile-${p}.test.mjs`),"tests/helpers/profile-step4.mjs","tests/types/profile-contracts.ts");
  for(const path of paths) {
    assert.deepEqual(brandTokens(path),[],path);
    assert.deepEqual(brandTokens(readFileSync(new URL(`../${path}`,import.meta.url),"utf8")),[],path);
  }
});
