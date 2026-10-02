import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = (p) => import(root + "dist/profiles/colored/" + p);

test("coloredProfile without tokens adds no module and no tokens: it is the upstream drawing", async () => {
  const { coloredProfile } = await dist("index.js");
  for (const tokens of [undefined, {}, { taskLine: undefined }]) {
    const p = coloredProfile(tokens);
    assert.deepEqual({ id: p.id, modelerModules: p.modelerModules, viewerModules: p.viewerModules, tokens: p.tokens }, { id: "colored", modelerModules: [], viewerModules: [], tokens: undefined });
  }
});

test("coloredProfile with tokens adds the renderer to the modeler and to the viewer, and resolves the 31 tokens", async () => {
  const { coloredProfile } = await dist("index.js");
  const p = coloredProfile({ taskLine: "#101010" });
  assert.equal(p.modelerModules.length, 1);
  assert.equal(p.viewerModules.length, 1);
  assert.equal(Object.keys(p.tokens).length, 31);
  assert.equal(p.tokens.taskLine, "#101010");
});

test("token fallbacks: stroke feeds the lines, fill feeds the task fill, explicit values win, the gradient end is derived", async () => {
  const { resolveColoredTokens, DEFAULT_COLORED_TOKENS } = await dist("tokens.js");
  const a = resolveColoredTokens({ stroke: "#123456" });
  for (const k of ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"]) assert.equal(a[k], "#123456", k);
  assert.equal(a.link, DEFAULT_COLORED_TOKENS.link, "link is not a line key");
  const b = resolveColoredTokens({ fill: "#abcdef", taskLine: "#000001" });
  assert.equal(b.taskFill, "#abcdef");
  assert.equal(b.taskLine, "#000001");
  assert.equal(resolveColoredTokens({ taskLine: "#000002" }).eventFill, DEFAULT_COLORED_TOKENS.eventFill);
});

test("kind mapping of element types", async () => {
  const { coloredKind } = await dist("renderer.js");
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
  for (const [types, kind] of cases) assert.equal(coloredKind(el(types)), kind, types.join());
  assert.equal(coloredKind(el(["bpmn:TextAnnotation"], { text: "[Doc] x" })), "doc");
  assert.equal(coloredKind(el(["bpmn:TextAnnotation"], { text: " [App] y" })), "app");
  assert.equal(coloredKind(el(["bpmn:TextAnnotation"], { text: "plain" })), "annotation");
  assert.equal(coloredKind({ type: "label", labelTarget: {}, businessObject: { $instanceOf: () => true } }), "label");
});

test("the profile sources and build carry no banned word, no storage, no prototype patch, no watermark handling", () => {
  const banned = new RegExp([["DS_", "TOKENS"], ["d2", "d"], ["D2", "dRender"], ["local", "Storage"], ["session", "Storage"], ["@/", "lib"], ["bjs-powered", "-by"], ["prototype\\.\\w+\\s*", "="]].map((p) => p.join("")).join("|"), "i");
  const files = [];
  for (const dir of ["src/profiles/colored/", "dist/profiles/colored/"]) for (const f of readdirSync(root + dir)) if (/\.(ts|js)$/.test(f)) files.push(dir + f);
  assert.ok(files.length >= 6);
  for (const f of files) assert.ok(!banned.test(readFileSync(root + f, "utf8")), `${f} has a banned pattern`);
});
