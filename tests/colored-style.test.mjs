import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baselineHashAllowlist, outsideBaselineHashes } from "./helpers/brand-baseline.mjs";
import { fixturePolicy } from "./helpers/injected-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = (p) => import(root + "dist/presentation/recolor/" + p);
const look = fixturePolicy.presentation.looks.find((entry) => entry.renderer === "recolor");
const marked = (role, text) => `${fixturePolicy.classification.annotationRoles.find((entry) => entry.role === role).prefix} ${text}`;

test("coloredProfile without tokens adds no module and no tokens: it is the upstream drawing", async () => {
  const { recolorProfile } = await dist("index.js");
  for (const tokens of [undefined, {}, { taskLine: undefined }]) {
    const p = recolorProfile(tokens, fixturePolicy);
    assert.deepEqual({ id: p.id, modelerModules: p.modelerModules, viewerModules: p.viewerModules, tokens: p.tokens }, { id: "look-recolor", modelerModules: [], viewerModules: [], tokens: undefined });
  }
});

test("coloredProfile with tokens adds the renderer to the modeler and to the viewer, and resolves the 33 tokens", async () => {
  const { recolorProfile } = await dist("index.js");
  const p = recolorProfile({ taskLine: "#101010" }, fixturePolicy);
  assert.equal(p.modelerModules.length, 1);
  assert.equal(p.viewerModules.length, 1);
  assert.equal(Object.keys(p.tokens).length, 33);
  assert.equal(p.tokens.taskLine, "#101010");
});

test("token fallbacks: stroke feeds the lines, fill feeds the task fill, explicit values win, the gradient end is derived", async () => {
  const { resolveRecolorTokens } = await dist("tokens.js");
  const a = resolveRecolorTokens({ stroke: "#123456" }, look.tokens);
  for (const k of ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"]) assert.equal(a[k], "#123456", k);
  assert.equal(a.link, look.tokens.link, "link is not a line key");
  const b = resolveRecolorTokens({ fill: "#abcdef", taskLine: "#000001" }, look.tokens);
  assert.equal(b.taskFill, "#abcdef");
  assert.equal(b.taskLine, "#000001");
  assert.equal(resolveRecolorTokens({ taskLine: "#000002" }, look.tokens).eventFill, look.tokens.eventFill);
});

test("kind mapping of element types", async () => {
  const { recolorKind } = await dist("renderer.js");
  const el = (types, extra = {}) => ({ type: "x", businessObject: { $instanceOf: (t) => types.includes(t), ...extra }, ...("label" in extra ? { labelTarget: {} } : {}) });
  const cases = [
    [["bpmn:Participant", "bpmn:BaseElement"], "pool"],
    [["bpmn:Lane"], "lane"],
    [["bpmn:StartEvent", "bpmn:Event"], "event"],
    [["bpmn:InclusiveGateway", "bpmn:Gateway"], "gateway"],
    [["bpmn:CallActivity", "bpmn:Activity"], "external"],
    [["bpmn:UserTask", "bpmn:Task", "bpmn:Activity"], "task"],
    [["bpmn:SubProcess", "bpmn:Activity"], "task"],
    [["bpmn:DataInput"], "external"],
    [["bpmn:DataObjectReference"], "data"],
    [["bpmn:DataStoreReference"], "data"],
    [["bpmn:SequenceFlow"], "flow"],
    [["bpmn:MessageFlow"], "flow"],
    [["bpmn:Association"], "link"],
    [["bpmn:DataInputAssociation", "bpmn:DataAssociation"], "link"],
    [["bpmn:Group"], undefined],
  ];
  for (const [types, kind] of cases) assert.equal(recolorKind(el(types), fixturePolicy), kind, types.join());
  assert.equal(recolorKind(el(["bpmn:TextAnnotation"], { text: marked("document", "x") }), fixturePolicy), "doc");
  assert.equal(recolorKind(el(["bpmn:TextAnnotation"], { text: ` ${marked("application", "y")}` }), fixturePolicy), "app");
  assert.equal(recolorKind(el(["bpmn:TextAnnotation"], { text: "plain" }), fixturePolicy), "annotation");
  assert.equal(recolorKind({ type: "label", labelTarget: {}, businessObject: { $instanceOf: () => true } }, fixturePolicy), "label");
});

test("the profile sources and build carry no banned word, no storage, no prototype patch, no watermark handling", () => {
  const allowed = baselineHashAllowlist();
  const banned = /localStorage|sessionStorage|@\/lib|bjs-powered-by|prototype\.\w+\s*=/i;
  const files = [];
  for (const dir of ["src/presentation/recolor/", "dist/presentation/recolor/"]) for (const f of readdirSync(root + dir)) if (/\.(ts|js)$/.test(f)) files.push(dir + f);
  assert.ok(files.length >= 6);
  for (const f of files) {
    const text = readFileSync(root + f, "utf8");
    assert.ok(!banned.test(text), `${f} has a banned pattern`);
    assert.deepEqual(outsideBaselineHashes(f, text, allowed), [], `${f} has a banned identifier`);
  }
});

test("colored tokens: labelText follows text unless named", async () => {
  const { resolveRecolorTokens } = await dist("tokens.js");
  assert.equal(resolveRecolorTokens({ text: "#111111" }, look.tokens).labelText, "#111111");
  assert.equal(resolveRecolorTokens({ text: "#111111", labelText: "#22242a" }, look.tokens).labelText, "#22242a");
});

test("namedColoredTokens: the names the host gave, with stroke, fill and text expanded", async () => {
  const { namedRecolorTokens } = await dist("tokens.js");
  assert.deepEqual(namedRecolorTokens({ taskFill: "#aa0001" }), ["taskFill"]);
  const named = namedRecolorTokens({ stroke: "#000000", fill: "#ffffff", text: "#111111" });
  for (const k of ["flow", "taskLine", "appLine", "taskFill", "labelText", "text"]) assert.ok(named.includes(k), k);
  assert.ok(!named.includes("link"), "link is not a line key");
  assert.deepEqual(namedRecolorTokens({ taskFill: undefined }), []);
});
