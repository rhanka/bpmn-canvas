import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { HELVETICA_WIDTHS, textWidth, wrapText } from "../dist/internal/textMetrics.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("both Helvetica tables have 95 entries (ASCII 32..126)", () => {
  assert.equal(HELVETICA_WIDTHS.regular.length, 95);
  assert.equal(HELVETICA_WIDTHS.bold.length, 95);
  for (const w of [...HELVETICA_WIDTHS.regular, ...HELVETICA_WIDTHS.bold]) assert.ok(Number.isInteger(w) && w > 0);
});

test("apostrophe and grave take the quotesingle and grave glyph widths", () => {
  // code 39 -> index 7, code 96 -> index 64
  assert.equal(HELVETICA_WIDTHS.regular[7], 191);
  assert.equal(HELVETICA_WIDTHS.regular[64], 333);
  assert.equal(HELVETICA_WIDTHS.bold[7], 238);
  assert.equal(HELVETICA_WIDTHS.bold[64], 333);
  assert.equal(textWidth("'", 1000), 191);
  assert.equal(textWidth("`", 1000), 333);
  assert.equal(textWidth("'", 1000, true), 238);
  // the numeric PostScript codes at the same position would give other widths
  assert.notEqual(textWidth("'", 1000), 333);
});

test("spot widths and fallbacks", () => {
  assert.equal(textWidth("A", 10), 6.67);
  assert.equal(textWidth(" ", 10), 2.78);
  assert.equal(textWidth("é", 10), textWidth("e", 10), "accented letter measures as its base letter");
  assert.equal(textWidth("中", 10), 5.56, "unmapped character uses the fallback width");
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

test("source states the data is a modified Adobe extraction, not MIT, and keeps the notices", () => {
  const src = readFileSync(root + "src/internal/textMetrics.ts", "utf8");
  assert.match(src, /MODIFIED EXTRACTION/);
  assert.match(src, /Copyright \(c\) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated/);
  assert.match(src, /Helvetica is a trademark of Linotype-Hell AG/);
  assert.match(src, /licenses\/Adobe-AFM-readme\.txt/);
  assert.match(src, /licenses\/Adobe-AFM-copyright\.txt/);
  assert.match(src, /not covered by the MIT license/);
  assert.doesNotMatch(src, /(licensed|released) under (the )?MIT/i);
  assert.ok(existsSync(root + "licenses/Adobe-AFM-readme.txt"));
  assert.ok(existsSync(root + "licenses/Adobe-AFM-copyright.txt"));
});
