import { test } from "node:test";
import assert from "node:assert/strict";
import { casePolicyViolations } from "./helpers/case-policy.mjs";

test("J5 #26 should reject every forbidden platform Unicode operation", () => {
  const mutations = [
    'value.toLocaleString()', 'value["to" + "UpperCase"]()',
    'value["nor" + "malize"]("NFD")', 'Intl.Collator()',
    'globalThis["In" + "tl"].Segmenter()', '/name/i.test(value)',
    'new RegExp("name", "i")', 'const flags = "i"; RegExp("name", flags)',
    'const method = "to" + "LocaleLowerCase"; value[method]()',
    'const { normalize: operation } = value; operation()',
  ];
  for (const source of mutations) assert.ok(casePolicyViolations(source).length > 0, source);
});

test("J5 #26 should allow explicit table lookups and ordinary regexes", () => {
  assert.deepEqual(casePolicyViolations('table[value]; /name/u.test(value); const text = "Intl and normalize";'), []);
});
