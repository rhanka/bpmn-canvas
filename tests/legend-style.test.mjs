import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brandTokens } from "./helpers/brand.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = process.env.LEGEND_DIST ?? `${root}dist`;
const load = (f) => import(pathToFileURL(`${dist}/profiles/legend/${f}`).href);
const style = await load("style.js");
const tokens = await load("tokens.js");

const bo = (type, extra = {}) => ({ $type: type, ...extra });

test("legend draws only what it draws faithfully", () => {
  assert.equal(style.legendKind(bo("bpmn:Task")), "task");
  assert.equal(style.legendKind(bo("bpmn:CallActivity")), "external");
  assert.equal(style.legendKind(bo("bpmn:ExclusiveGateway")), "gateway");
  assert.equal(style.legendKind(bo("bpmn:ParallelGateway")), "gateway");
  assert.equal(style.legendKind(bo("bpmn:StartEvent", { eventDefinitions: [] })), "event");
  assert.equal(style.legendKind(bo("bpmn:EndEvent")), "event");
  assert.equal(style.legendKind(bo("bpmn:IntermediateCatchEvent", { eventDefinitions: [] })), "event");
  assert.equal(style.legendKind(bo("bpmn:DataObjectReference")), "data");
  assert.equal(style.legendKind(bo("bpmn:DataInput")), "input");
  assert.equal(style.legendKind(bo("bpmn:DataOutput")), "output");
});

test("everything else falls through to upstream (no task rectangle, no X marker)", () => {
  const through = [
    bo("bpmn:BoundaryEvent", { eventDefinitions: [{}] }),
    bo("bpmn:BoundaryEvent"),
    bo("bpmn:InclusiveGateway"),
    bo("bpmn:EventBasedGateway"),
    bo("bpmn:ComplexGateway"),
    bo("bpmn:Group"),
    bo("bpmn:DataStoreReference"),
    bo("bpmn:Transaction"),
    bo("bpmn:AdHocSubProcess"),
    bo("bpmn:UserTask"),
    bo("bpmn:ServiceTask"),
    bo("bpmn:ScriptTask"),
    bo("bpmn:BusinessRuleTask"),
    bo("bpmn:ReceiveTask"),
    bo("bpmn:SendTask"),
    bo("bpmn:ManualTask"),
    bo("bpmn:Foo"),
    bo("bpmn:StartEvent", { eventDefinitions: [{ $type: "bpmn:MessageEventDefinition" }] }),
    bo("bpmn:IntermediateCatchEvent", { eventDefinitions: [{ $type: "bpmn:TimerEventDefinition" }] }),
    bo("bpmn:EndEvent", { eventDefinitions: [{ $type: "bpmn:ErrorEventDefinition" }] }),
    bo("bpmn:DataObjectReference", { dataState: {} }),
    bo("bpmn:DataObjectReference", { dataObjectRef: { isCollection: true } }),
    bo("bpmn:DataInput", { isCollection: true }),
    bo("bpmn:TextAnnotation", { text: "plain note" }),
    bo("bpmn:TextAnnotation"),
  ];
  for (const b of through) assert.equal(style.legendKind(b), undefined, `${b.$type} must fall through`);
});

test("sub-process, pool and lane depend on the DI", () => {
  assert.equal(style.legendKind(bo("bpmn:SubProcess"), { expanded: false }), "subprocess");
  assert.equal(style.legendKind(bo("bpmn:SubProcess"), { expanded: true }), undefined);
  assert.equal(style.legendKind(bo("bpmn:SubProcess"), {}), undefined);
  assert.equal(style.legendKind(bo("bpmn:SubProcess", { triggeredByEvent: true }), { expanded: false }), undefined);
  assert.equal(style.legendKind(bo("bpmn:Participant"), { expanded: true, horizontal: true }), "pool");
  assert.equal(style.legendKind(bo("bpmn:Participant"), { expanded: false, horizontal: true }), undefined);
  assert.equal(style.legendKind(bo("bpmn:Participant"), { expanded: true, horizontal: false }), undefined);
  assert.equal(style.legendKind(bo("bpmn:Lane"), { horizontal: true }), "lane");
  assert.equal(style.legendKind(bo("bpmn:Lane"), { horizontal: false }), undefined);
});

test("[Doc] and [App] annotations only; plain annotations stay upstream", () => {
  assert.equal(style.legendKind(bo("bpmn:TextAnnotation", { text: "[Doc] Spec" })), "document");
  assert.equal(style.legendKind(bo("bpmn:TextAnnotation", { text: "  [App] CRM" })), "application");
  assert.equal(style.annotationName("[App]  CRM"), "CRM");
  assert.equal(style.annotationName("[Doc] Spec"), "Spec");
});

test("connections: conditional, default, message and directed associations stay upstream", () => {
  const k = style.legendConnectionKind;
  assert.equal(k(bo("bpmn:SequenceFlow")), "sequence");
  assert.equal(k(bo("bpmn:SequenceFlow", { conditionExpression: {} })), undefined);
  const flow = bo("bpmn:SequenceFlow");
  const gw = { default: flow };
  assert.equal(k({ ...flow, sourceRef: gw }), "sequence", "other flow object, not the default one");
  assert.equal(k(bo("bpmn:MessageFlow")), undefined);
  assert.equal(k(bo("bpmn:Association")), "link");
  assert.equal(k(bo("bpmn:Association", { associationDirection: "None" })), "link");
  assert.equal(k(bo("bpmn:Association", { associationDirection: "One" })), undefined);
  assert.equal(k(bo("bpmn:DataInputAssociation")), "data-link");
  assert.equal(k(bo("bpmn:DataOutputAssociation")), "data-link");
});

test("default flow is recognised by identity", () => {
  const flow = { $type: "bpmn:SequenceFlow" };
  flow.sourceRef = { default: flow };
  assert.equal(style.legendConnectionKind(flow), undefined);
});

test("colour helpers", () => {
  assert.equal(style.shade("#ffffff", 0.5), "#808080");
  assert.equal(style.shade("not-a-colour", 0.5), "not-a-colour");
  assert.equal(style.contrastText("#000000", "#111111", "#ffffff"), "#ffffff");
  assert.equal(style.contrastText("#ffffff", "#111111", "#ffffff"), "#111111");
  assert.equal(style.contrastText("rgb(0,0,0)", "#111111", "#ffffff"), "#111111");
});

test("app box geometry matches the reference (80x30 under a 120x80 task, overlap 10)", () => {
  assert.deepEqual(style.appBoxSize("CRM", 120), { width: 80, height: 30 });
  const [box] = style.appBoxes(["CRM"], 120, 80);
  assert.deepEqual(box, { name: "CRM", x: 20, y: 70, width: 80, height: 30 });
  const long = style.appBoxSize("A very long application component name that must wrap", 120);
  assert.equal(long.width, 100);
  assert.ok(long.height > 30);
});

test("document geometry", () => {
  assert.match(style.documentPath(100, 60), /^M0 0H100V51Q/);
  const r = style.documentTextRect(100, 60);
  assert.equal(r.x, 6);
  assert.equal(r.width, 88);
  assert.ok(r.height >= 0);
});

test("tokens: neutral defaults, overridable, frozen", () => {
  const t = tokens.DEFAULT_LEGEND_TOKENS;
  assert.equal(t.fill, "#ffffff");
  assert.ok(Object.isFrozen(t));
  const merged = tokens.resolveLegendTokens({ stroke: "#112233", fontSize: undefined });
  assert.equal(merged.stroke, "#112233");
  assert.equal(merged.fontSize, 12, "undefined override is ignored");
  const keys = ["fontFamily", "fontSize", "strokeWidth", "stroke", "fill", "text", "headerText", "labelText", "flow", "link", "docLink", "docLinkDash", "dataLinkArrow", "taskLine", "taskFill", "taskFillEnd",
    "eventLine", "eventFill", "gatewayLine", "gatewayFill", "poolLine", "poolFill", "laneLine", "laneFill", "laneHeaderFill", "externalLine", "externalFill",
    "docLine", "docFill", "dataLine", "dataFill", "appLine", "appFill"];
  assert.deepEqual(Object.keys(t).sort(), [...keys].sort(), "the public token list");
});

test("tokens: stroke feeds every line, fill feeds the task, the gradient end is derived", () => {
  const m = tokens.resolveLegendTokens({ stroke: "#112233", fill: "#808080" });
  for (const k of ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"]) {
    assert.equal(m[k], "#112233", k);
  }
  assert.equal(m.link, tokens.DEFAULT_LEGEND_TOKENS.link, "link is not fed by stroke");
  assert.equal(m.taskFill, "#808080");
  assert.equal(m.taskFillEnd, style.shade("#808080", 0.95), "derived second tone");
  assert.equal(m.eventFill, tokens.DEFAULT_LEGEND_TOKENS.eventFill, "fill does not leak into other types");
});

test("tokens: an explicit per-type value wins over the conveniences", () => {
  const m = tokens.resolveLegendTokens({ stroke: "#112233", taskLine: "#445566", taskFill: "#808080", taskFillEnd: "#707070" });
  assert.equal(m.taskLine, "#445566");
  assert.equal(m.eventLine, "#112233");
  assert.equal(m.taskFillEnd, "#707070");
});

test("legend sources contain no banned symbol", () => {
  const dir = `${root}src/profiles/legend/`;
  const banned = /localStorage|sessionStorage|@\/lib|\.bjs-powered-by|prototype\.\w+\s*=/;
  for (const f of readdirSync(dir)) {
    if (!/\.(ts|mjs)$/.test(f)) continue;
    const text = readFileSync(dir + f, "utf8");
    assert.ok(!banned.test(text), `${f} contains a banned symbol: ${banned.exec(text)?.[0]}`);
    assert.deepEqual(brandTokens(text), [], `${f} keeps a banned identifier`);
    assert.ok(!/#[0-9a-fA-F]{6}\b/.test(f === "tokens.ts" ? "" : text), `${f} hard-codes a colour outside tokens.ts`);
  }
});

test("tokens: docLink follows link and laneHeaderFill follows laneFill unless named", () => {
  const a = tokens.resolveLegendTokens({ link: "#010203", laneFill: "#040506" });
  assert.equal(a.docLink, "#010203");
  assert.equal(a.laneHeaderFill, "#040506");
  assert.equal(a.docLinkDash, "5 5");
  const b = tokens.resolveLegendTokens({ link: "#010203", docLink: "#b85450", docLinkDash: "3 4", laneFill: "#040506", laneHeaderFill: "#fbf9f6" });
  assert.deepEqual([b.docLink, b.docLinkDash, b.laneHeaderFill, b.link, b.laneFill], ["#b85450", "3 4", "#fbf9f6", "#010203", "#040506"]);
});
