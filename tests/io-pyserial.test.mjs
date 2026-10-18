// Python serialisation rules reproduced by the reference exports (test list §1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { etAttr, etDocument, etText, mdData, mdPretty, pyFloatStr, pyFmt, pyRound3, xmlNode } from "../dist/io/pyserial.js";

// Python 3: [round(j / 16, 3) for j in range(-32, 33)] — ties go to the even last digit on the exact binary value.
const ROUND_J16 = {
  "-32": -2, "-31": -1.938, "-30": -1.875, "-29": -1.812, "-28": -1.75, "-27": -1.688, "-26": -1.625, "-25": -1.562,
  "-24": -1.5, "-23": -1.438, "-22": -1.375, "-21": -1.312, "-20": -1.25, "-19": -1.188, "-18": -1.125, "-17": -1.062,
  "-16": -1, "-15": -0.938, "-14": -0.875, "-13": -0.812, "-12": -0.75, "-11": -0.688, "-10": -0.625, "-9": -0.562,
  "-8": -0.5, "-7": -0.438, "-6": -0.375, "-5": -0.312, "-4": -0.25, "-3": -0.188, "-2": -0.125, "-1": -0.062,
  0: 0, 1: 0.062, 2: 0.125, 3: 0.188, 4: 0.25, 5: 0.312, 6: 0.375, 7: 0.438, 8: 0.5, 9: 0.562, 10: 0.625,
  11: 0.688, 12: 0.75, 13: 0.812, 14: 0.875, 15: 0.938, 16: 1, 17: 1.062, 18: 1.125, 19: 1.188, 20: 1.25,
  21: 1.312, 22: 1.375, 23: 1.438, 24: 1.5, 25: 1.562, 26: 1.625, 27: 1.688, 28: 1.75, 29: 1.812, 30: 1.875,
  31: 1.938, 32: 2,
};

test("pyRound3: half-even on the exact binary value", () => {
  for (let j = -32; j <= 32; j++) assert.equal(pyRound3(j / 16), ROUND_J16[j], `round(${j}/16, 3)`);
  assert.equal(pyRound3(0.0625), 0.062);
  assert.equal(pyRound3(0.1875), 0.188);
  assert.equal(pyRound3(0.3125), 0.312);
  assert.equal(pyRound3(-0.0625), -0.062);
  assert.equal(pyRound3(8 / 128), 0.062);
  assert.equal(pyRound3(0.1234), 0.123);
  assert.equal(pyRound3(0.12351), 0.124);
  for (const bad of [NaN, Infinity, -Infinity]) assert.throws(() => pyRound3(bad), RangeError);
});

test("pyFmt: the export's formatter (round, then an integer when integral)", () => {
  assert.equal(pyFmt(50), "50");
  assert.equal(pyFmt(1250.0), "1250");
  assert.equal(pyFmt(0.5), "0.5");
  assert.equal(pyFmt(1 / 3), "0.333");
  assert.equal(pyFmt(-0.0), "0");
  assert.equal(pyFmt(-10.5), "-10.5");
  assert.equal(pyFmt(150.0625), "150.062");
});

test("pyFloatStr: Python repr(float) in the emulated range", () => {
  assert.equal(pyFloatStr(1250), "1250.0");
  assert.equal(pyFloatStr(0.1 + 0.2), "0.30000000000000004");
  assert.equal(pyFloatStr(123.456), "123.456");
  assert.equal(pyFloatStr(-0.0), "-0.0");
  assert.throws(() => pyFloatStr(1e16), RangeError);
  assert.throws(() => pyFloatStr(1e-5), RangeError);
});

test("escaping table: one input, ElementTree attribute/text and minidom attribute/text", () => {
  const input = `a&b<c>d"e'f\n\r\t`;
  assert.equal(etAttr(input), "a&amp;b&lt;c&gt;d&quot;e'f&#10;&#13;&#09;");
  assert.equal(etText(input), `a&amp;b&lt;c&gt;d"e'f\n\r\t`);
  assert.equal(mdData(input), `a&amp;b&lt;c&gt;d&quot;e'f\n\r\t`);
  // minidom uses the same escaping in both positions.
  const attr = mdPretty(xmlNode("r", { a: input }));
  const text = mdPretty(xmlNode("r", {}, [xmlNode("t", {}, [], input.replace(/\r/g, ""))]));
  assert.ok(attr.includes(`a="${mdData(input)}"`));
  assert.ok(text.includes(`<t>${mdData(input.replace(/\r/g, ""))}</t>`));
  // ElementTree: quotes and control whitespace escaped in attributes only.
  const doc = etDocument(xmlNode("r", { a: input }, [xmlNode("t", {}, [], input)]));
  assert.ok(doc.includes(`a="a&amp;b&lt;c&gt;d&quot;e'f&#10;&#13;&#09;"`));
  assert.ok(doc.includes(`<t>a&amp;b&lt;c&gt;d"e'f\n\r\t</t>`));
});

test("ElementTree writer: prologue, insertion order, ' />', non-ASCII kept", () => {
  assert.equal(etDocument(xmlNode("mxfile", { host: "h", agent: "a" })), `<?xml version='1.0' encoding='utf-8'?>\n<mxfile host="h" agent="a" />`);
  const one = etDocument(xmlNode("a", { z: "1", b: "2" }, [xmlNode("c", { v: "é € $" })]));
  assert.equal(one, `<?xml version='1.0' encoding='utf-8'?>\n<a z="1" b="2"><c v="é € $" /></a>`);
});

test("minidom toprettyxml: prologue, 4-space indent, '<tag/>', inline text, trailing newline", () => {
  const out = mdPretty(xmlNode("root", { id: "r" }, [
    xmlNode("empty", { x: "1" }),
    xmlNode("text", {}, [], "hello"),
    xmlNode("group", {}, [xmlNode("leaf")]),
  ]));
  assert.equal(out, [
    '<?xml version="1.0" ?>',
    '<root id="r">',
    '    <empty x="1"/>',
    "    <text>hello</text>",
    "    <group>",
    "        <leaf/>",
    "    </group>",
    "</root>",
    "",
  ].join("\n"));
});
