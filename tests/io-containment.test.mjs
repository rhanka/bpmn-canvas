import { test } from "node:test";
import assert from "node:assert/strict";
import { config, fixture, io } from "./helpers/semantic.mjs";
import { containmentCases, injectChild } from "./helpers/containment-cases.mjs";

const cases = await containmentCases();
io.initializeCodecs(config);
assert.ok(cases.length > 500, `Descriptor coverage unexpectedly small: ${cases.length}`);
assert.equal(cases.filter((c) => c.expected === "supported").length, 21);
assert.equal(cases.filter((c) => c.expected === "refused").length, 507);
for (const c of cases) test(`descriptor containment: ${c.container}.${c.property} <- ${c.childType}`, async (t) => {
  const m = await injectChild(c);
  let parsed;
  if (c.expected === "supported") {
    parsed = await io.parseDefinitions(new TextDecoder().decode(await io.export(m.definitions, "bpmn")));
    assert.deepEqual(parsed.warnings, [], "Expected-supported placement must parse without warnings");
  }
  const outcomes = [];
  for (const format of ["drawio", "sparx"]) {
    let bytes;
    try { bytes = await io.export(m.definitions, format); }
    catch (e) {
      assert.ok(e instanceof io.IoError, `Untyped failure: ${e}`);
      assert.ok(e.ids.length, "Refusal must identify the offending element or owner");
      assert.equal(c.expected, "refused", `False refusal of an expected-supported placement: ${e.code}`);
      outcomes.push(`refused:${e.code}`);
      continue;
    }
    const actual = new TextDecoder().decode(bytes);
    // Golden settings must match; outputs() initializes the same fixed envelope.
    assert.notEqual(actual, fixture("C1", format === "drawio" ? "expected.drawio" : "expected.sparx.xml"), "Successful export silently dropped the injected construct");
    assert.notEqual(actual, m.baseline[format], "Successful export silently dropped the injected construct from its supported container");
    assert.equal(c.expected, "supported", "Expected-refused placement was exported");
    assert.equal(new TextDecoder().decode(await io.export(parsed.rootElement, format)), actual, "Supported placement must retain bytes after parsing");
    outcomes.push("exported");
  }
  assert.equal(outcomes[0], outcomes[1], "Both formatted exports must share semantic acceptance");
  t.diagnostic(`${c.container}.${c.property} <- ${c.childType}: expected-${c.expected}; ${outcomes[0]}`);
});
