import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandTokens, hashOf } from "./helpers/brand.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
test("should scan every frozen path and byte with the pinned existing brand guard", () => {
  const scope = JSON.parse(readFileSync(join(repo, "docs/design/profile-externalization-scope.json")));
  assert.equal(hashOf(readFileSync(join(repo, scope.scanner.path))), scope.scanner.sha256);
  assert.equal(hashOf(JSON.stringify(scope.extraHashes)), scope.lexiconSha256);
  assert.deepEqual(scope.noticeExceptions, []);
  function scan(path) {
    const full = join(repo, path), stat = lstatSync(full);
    assert.ok(!stat.isSymbolicLink());
    assert.deepEqual(brandTokens(path, scope.extraHashes), [], path);
    if (stat.isDirectory()) for (const name of readdirSync(full)) scan(`${path}/${name}`);
    else assert.deepEqual(brandTokens(readFileSync(full, "utf8"), scope.extraHashes), [], path);
  }
  for (const path of [...scope.paths, "tests/profile-corpus-step4.test.mjs"]) scan(path);
});
