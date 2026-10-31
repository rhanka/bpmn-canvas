// S-1 witness: a click on the process icon is a marker click under the pinned
// legacy selector (base row I-0477, rule R-038). Literal-free: entry ids and
// ledger hashes only, never the matched text. RED when the renderer emits
// neutral hooks, GREEN once the documented hooks are restored and reviewed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

function baseMarkerSelector() {
  const src = execSync("git show fec4dae:src/internal/canvas.ts", { encoding: "utf8" });
  const line = src.split("\n").find((l) => l.includes("MARKER_SELECTOR"));
  assert.ok(line, "base marker selector line exists");
  return line;
}

function emittedTexts() {
  const lines = rendererBytes.toString("utf8").split("\n");
  return hooks.map((o) => lines[o.line - 1].slice(o.column, o.endColumn));
}

test("process icon data-marker value is a pinned legacy marker hit", () => {
  assert.ok(hooks.length >= 1, "renderer emits at least one LX-NV-1 hook");
  assert.ok(hookLiterals.has(pinned.literal), "emitted hook matches the pinned literal hash");
  const selector = baseMarkerSelector();
  const texts = emittedTexts();
  assert.ok(
    texts.some((t) => t.length > 0 && selector.includes(t)),
    "emitted hook text sits in the pinned selector",
  );
});

test("process icon class hook is a pinned legacy marker hit", () => {
  assert.ok(hooks.length >= 2, "renderer emits both value and class hooks");
  const matching = hooks.filter((o) => o.literal === pinned.literal);
  assert.ok(matching.length >= 2, "both hooks match the pinned literal hash");
  const selector = baseMarkerSelector();
  const lines = rendererBytes.toString("utf8").split("\n");
  const texts = matching.map((o) => lines[o.line - 1].slice(o.column, o.endColumn));
  assert.ok(
    texts.every((t) => t.length > 0 && selector.includes(t)),
    "both hook texts sit in the pinned selector",
  );
});
