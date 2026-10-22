import { test } from "node:test";
import assert from "node:assert/strict";
import { lot3Compile } from "./helpers/lot3-compile.mjs";

test("should compile the sealed main profile with ensure and remove steps", async () => {
  const { loaded, compiled } = await lot3Compile("main");
  assert.equal(loaded.status, "ok");
  assert.equal(compiled.status, "ok", compiled.code);
  assert.ok(compiled.payload.digest);
});

test("should compile a schema-valid loss step by its code", async () => {
  const { loaded, compiled } = await lot3Compile("main", profile => {
    const recipe = profile.recipes.find(r => r.id === "export-pages");
    recipe.steps.push({ op: "loss", target: "self", code: "navigation" });
    recipe.writes.push({ binding: "self", path: "", mode: "report" });
  });
  assert.equal(loaded.status, "ok");
  assert.equal(compiled.status, "ok", compiled.code);
});
