// F3 finding #32: the lot-4 API (resolveTheme, mapExport, prepareExport,
// serializePrepared) is part of the headless mechanism ABI (DESIGN §2.5)
// and must be exported by ./profile.
// Red on 25a66ed: ./profile exposes none of the four.
import test from "node:test";
import assert from "node:assert/strict";

import * as api from "../dist/profile/index.js";

for (const name of ["resolveTheme", "mapExport", "prepareExport", "serializePrepared"]) {
  test(`finding #32: ./profile exports ${name}`, () => {
    assert.equal(typeof api[name], "function", `./profile must export ${name} per DESIGN §2.5`);
  });
}
