import { test } from "node:test";
import assert from "node:assert/strict";
import { gateDecision, parseActivation } from "../dist/profile/activation.js";

test("should default an absent activation to edit and refuse unknown values", () => {
  assert.equal(parseActivation(undefined), "edit");
  assert.equal(parseActivation("edit"), "edit");
  assert.equal(parseActivation("qualification"), "qualification");
  for (const bad of ["draft", "", null, 0, {}]) {
    assert.throws(() => parseActivation(bad), { code: "operation-error" }, JSON.stringify(bad));
  }
});

test("should gate effective support, lane, port and remap changes in edit", () => {
  for (const trigger of ["support-create", "lane-member-write", "lane-member-remove", "output-source-fill", "remap-ids"]) {
    assert.deepEqual(gateDecision(trigger, "edit"), { proceed: false, code: "profile-open" }, trigger);
  }
});

test("should pass gated creation effects under qualification except explicit binding", () => {
  for (const trigger of ["support-create", "lane-member-write", "lane-member-remove", "output-source-fill", "remap-ids"]) {
    assert.deepEqual(gateDecision(trigger, "qualification"), { proceed: true }, trigger);
  }
  assert.deepEqual(gateDecision("bind-supports", "edit"), { proceed: false, code: "profile-open" });
  assert.deepEqual(gateDecision("bind-supports", "qualification"), { proceed: false, code: "profile-open" });
});
