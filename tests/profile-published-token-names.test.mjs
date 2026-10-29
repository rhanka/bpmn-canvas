// Witness for the published look-token names (LX-TH-1 / LX-TH-2 per ruling).
// An old caller passing each old look-token option with an injected look gets
// its tokens applied. RED before the D5 restoration, GREEN after.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectLook } from "../dist/internal/legacy-policy.js";
import { tokensFromOptions } from "../dist/internal/engine.js";

const policy = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/x24-externalization/expectations/policy/policy-legacy-synthetic.json",
      import.meta.url,
    ),
  ),
);
const LOOK = "look-annotated";

const cases = [
  ["legendTokens", "#0b0c0e"],
  ["coloredTokens", "#0e0c0b"],
];

for (const [option, marker] of cases) {
  test(`old caller option ${option} with injected look gets tokens applied`, () => {
    assert.equal(typeof tokensFromOptions, "function", "tokensFromOptions export");
    const extracted = tokensFromOptions({
      profile: LOOK,
      businessPolicy: policy,
      [option]: { taskFill: marker },
    });
    assert.deepEqual(extracted, { taskFill: marker }, `${option} extracted`);
    const selection = selectLook({ look: LOOK, tokens: extracted }, policy);
    assert.equal(selection.status, "ok", `${option} selection status`);
    assert.equal(selection.tokens?.taskFill, marker, `${option} token applied`);
  });
}
