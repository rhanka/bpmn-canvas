import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { textWidth as measure, wrapText as wrap } from "../dist/internal/textMetrics.js";
import { fixturePolicy } from "./helpers/injected-policy.mjs";

const textWidth = (text, size, bold = false) => measure(text, size, bold, fixturePolicy);
const wrapText = (text, size, width, bold = false) => wrap(text, size, width, bold, fixturePolicy);

const root = fileURLToPath(new URL("../", import.meta.url));

test("apostrophe and grave take the quotesingle and grave glyph widths", () => {
  // code 39 -> index 7, code 96 -> index 64
  assert.equal(fixturePolicy.metrics.regular[7], 407);
  assert.equal(fixturePolicy.metrics.regular[64], 464);
  assert.equal(fixturePolicy.metrics.bold[7], 507);
  assert.equal(fixturePolicy.metrics.bold[64], 564);
  assert.equal(textWidth("'", 1000), 407);
  assert.equal(textWidth("`", 1000), 464);
  assert.equal(textWidth("'", 1000, true), 507);
  // the numeric PostScript codes at the same position would give other widths
  assert.notEqual(textWidth("'", 1000), 464);
});

test("spot widths and fallbacks", () => {
  assert.equal(textWidth("A", 10), 4.33);
  assert.equal(textWidth(" ", 10), 4);
  assert.equal(textWidth("é", 10), textWidth("e", 10), "accented letter measures as its base letter");
  assert.equal(textWidth("中", 10), 9.99, "unmapped character uses the fallback width");
  assert.equal(textWidth("", 10), 0);
});

test("wrapText wraps greedily and breaks over-long words", () => {
  assert.deepEqual(wrapText("", 12, 100), [""]);
  assert.deepEqual(wrapText("one two", 12, 500), ["one two"]);
  const lines = wrapText("alpha beta gamma delta", 12, 60);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(textWidth(l, 12) <= 60);
  const broken = wrapText("Supercalifragilisticexpialidocious", 12, 50);
  assert.ok(broken.length > 1);
  assert.equal(broken.join(""), "Supercalifragilisticexpialidocious");
  assert.deepEqual(wrapText("a\nb", 12, 500), ["a", "b"]);
});
