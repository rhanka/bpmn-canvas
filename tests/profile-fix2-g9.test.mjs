/** Fix round 2, G9: the test-only packageSurface helper lives in
 * tests/helpers, not in shipped source. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { packageSurface } from "./helpers/package-surface.mjs";

test("G9: packageSurface is not a shipped canvas method", async () => {
  assert.equal(typeof Lot5Canvas.prototype.packageSurface, "undefined");
});

test("G9: the tests/helpers inventory reports declared and imported packages", async () => {
  const out = packageSurface({
    packages: ["left-pad", "other", "./local"],
    fields: ["dependencies"],
    entrySources: {
      "main.js": `import x from "left-pad"; import y from "./util.js";`,
      "util.js": `export * from "other/sub";`,
    },
    packageJsonText: JSON.stringify({ dependencies: { "left-pad": "1.0.0", "unrelated": "2.0.0" } }),
  });
  assert.equal(out.status, "ok");
  assert.deepEqual(out.payload.declared, ["left-pad"]);
  assert.deepEqual(out.payload.importedByEntryPoints, ["left-pad", "other"]);
});
