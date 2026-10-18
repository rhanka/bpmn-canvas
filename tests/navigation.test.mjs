// Declarative navigation rules for sub-process markers (test list §9). Pure resolver, Node.
import { test } from "node:test";
import assert from "node:assert/strict";

const react = await import("../dist/react/index.js");
const STEP0 = ["calledElement", "exactName", "sectionNumber"];
const ALL = [...STEP0, "substring"];
const D = [
  { id: "D0", name: "Main" },
  { id: "D1", name: "Quote preparation" },
  { id: "D2", name: "2.1 Credit check" },
  { id: "D3", name: "Archive records" },
  { id: "Sub_called", name: "Other" },
];
const click = (extra) => ({ id: "X", type: "bpmn:SubProcess", name: "", marker: true, ...extra });

test("navigationResolver exists", () => assert.equal(typeof react.navigationResolver, "function"));

test("each rule alone", () => {
  const only = (rule) => react.navigationResolver([rule]);
  assert.equal(only("calledElement")(click({ type: "bpmn:CallActivity", calledElement: "sub_called" }), D, "D0"), "Sub_called", "called element by id");
  assert.equal(only("calledElement")(click({ type: "bpmn:CallActivity", calledElement: "Archive Records" }), D, "D0"), "D3", "called element by name");
  assert.equal(only("exactName")(click({ name: " quote PREPARATION " }), D, "D0"), "D1");
  assert.equal(only("sectionNumber")(click({ name: "Run 2.1 checks" }), D, "D0"), "D2");
  assert.equal(only("substring")(click({ name: "Archive" }), D, "D0"), "D3");
  assert.equal(only("exactName")(click({ name: "Archive" }), D, "D0"), null);
});

test("diagrams walked in order, the active one skipped, the first match wins", () => {
  const resolve = react.navigationResolver(ALL);
  const twins = [{ id: "A", name: "2.1 first" }, { id: "B", name: "2.1 second" }];
  assert.equal(resolve(click({ name: "Step 2.1" }), twins, undefined), "A");
  assert.equal(resolve(click({ name: "Step 2.1" }), twins, "A"), "B");
  assert.equal(resolve(click({ name: "Quote preparation" }), D, "D1"), null);
  // A named task navigates by name too (the step-0 rule); an unnamed, non-sub-process element does not.
  assert.equal(resolve(click({ type: "bpmn:Task", name: "Quote preparation" }), D, "D0"), "D1");
  assert.equal(resolve(click({ type: "bpmn:Task", name: "" }), D, "D0"), null);
});

test("the step-0 rules do not navigate on a substring-only match", () => {
  const step0 = react.navigationResolver(STEP0);
  assert.equal(step0(click({ name: "Archive" }), D, "D0"), null);
  assert.equal(react.navigationResolver(ALL)(click({ name: "Archive" }), D, "D0"), "D3");
});

test("(kept) without navigation rules, the 0.3 default resolver", () => {
  assert.equal(react.defaultResolveTarget(click({ calledElement: "sub_called" }), D, "D0"), "Sub_called");
  assert.equal(react.defaultResolveTarget(click({ name: "Quote preparation" }), D, "D0"), "D1");
});
