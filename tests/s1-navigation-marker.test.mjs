// S-1 witness: a click on the process icon is a marker click under the pinned
// legacy selector (base row I-0477, rule R-038). Literal-free: entry ids and
// ledger hashes only, never the matched text. RED when the renderer emits
// neutral hooks, GREEN once the documented hooks are restored and reviewed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanBytes } from "./fixtures/x24-externalization/expectations/derive/scan.mjs";

const ledger = JSON.parse(
  readFileSync(
    new URL("./fixtures/x24-externalization/expectations/ledger.json", import.meta.url),
  ),
);
const pinned = ledger.occurrences.find((r) => r.id === "I-0477");
assert.ok(pinned, "pinned base row I-0477 exists");
assert.equal(pinned.entry, "LX-NV-1");
assert.equal(pinned.rule, "R-038");

const rendererPath = "src/presentation/annotated/renderer.ts";
const rendererBytes = readFileSync(new URL(`../${rendererPath}`, import.meta.url));
const { occurrences } = scanBytes(rendererPath, rendererBytes, JSON.parse(
  readFileSync(
    new URL("./fixtures/x24-externalization/expectations/lexicon.json", import.meta.url),
  ),
), { reviewed: false });
const hooks = occurrences.filter((o) => o.entry === "LX-NV-1");
const hookLiterals = new Set(hooks.map((o) => o.literal));

test("process icon data-marker value is a pinned legacy marker hit", () => {
  assert.ok(hooks.length >= 1, "renderer emits at least one LX-NV-1 hook");
  assert.ok(hookLiterals.has(pinned.literal), "emitted hook matches the pinned literal hash");
});

test("process icon class hook is a pinned legacy marker hit", () => {
  assert.ok(hooks.length >= 2, "renderer emits both value and class hooks");
  const matching = hooks.filter((o) => o.literal === pinned.literal);
  assert.ok(matching.length >= 2, "both hooks match the pinned literal hash");
});
