import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baselineHashAllowlist, outsideBaselineHashes } from "./helpers/brand-baseline.mjs";
import { fixturePolicy } from "./helpers/injected-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = process.env.ANNOTATED_DIST ?? `${root}dist`;
const load = (f) => import(pathToFileURL(`${dist}/presentation/annotated/${f}`).href);
const style = await load("style.js");
const tokens = await load("tokens.js");

const bo = (type, extra = {}) => ({ $type: type, ...extra });
const look = fixturePolicy.presentation.looks.find((entry) => entry.renderer === "annotated");
const marked = (role, text) => `${fixturePolicy.classification.annotationRoles.find((entry) => entry.role === role).prefix} ${text}`;

test("legend draws only what it draws faithfully", () => {
  assert.equal(style.annotatedKind(bo("bpmn:Task")), "task");
  assert.equal(style.annotatedKind(bo("bpmn:CallActivity")), "external");
  assert.equal(style.annotatedKind(bo("bpmn:ExclusiveGateway")), "gateway");
  assert.equal(style.annotatedKind(bo("bpmn:ParallelGateway")), "gateway");
  assert.equal(style.annotatedKind(bo("bpmn:StartEvent", { eventDefinitions: [] })), "event");
  assert.equal(style.annotatedKind(bo("bpmn:EndEvent")), "event");
  assert.equal(style.annotatedKind(bo("bpmn:IntermediateCatchEvent", { eventDefinitions: [] })), "event");
  assert.equal(style.annotatedKind(bo("bpmn:DataObjectReference")), "data");
  assert.equal(style.annotatedKind(bo("bpmn:DataInput")), "input");
  assert.equal(style.annotatedKind(bo("bpmn:DataOutput")), "output");
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
  for (const b of through) assert.equal(style.annotatedKind(b), undefined, `${b.$type} must fall through`);
});

test("sub-process, pool and lane depend on the DI", () => {
  assert.equal(style.annotatedKind(bo("bpmn:SubProcess"), { expanded: false }), "subprocess");
  assert.equal(style.annotatedKind(bo("bpmn:SubProcess"), { expanded: true }), undefined);
  assert.equal(style.annotatedKind(bo("bpmn:SubProcess"), {}), undefined);
  assert.equal(style.annotatedKind(bo("bpmn:SubProcess", { triggeredByEvent: true }), { expanded: false }), undefined);
  assert.equal(style.annotatedKind(bo("bpmn:Participant"), { expanded: true, horizontal: true }), "pool");
  assert.equal(style.annotatedKind(bo("bpmn:Participant"), { expanded: false, horizontal: true }), undefined);
  assert.equal(style.annotatedKind(bo("bpmn:Participant"), { expanded: true, horizontal: false }), undefined);
  assert.equal(style.annotatedKind(bo("bpmn:Lane"), { horizontal: true }), "lane");
  assert.equal(style.annotatedKind(bo("bpmn:Lane"), { horizontal: false }), undefined);
});

test("[Reference] and [Component] annotations only; plain annotations stay upstream", () => {
  assert.equal(style.annotatedKind(bo("bpmn:TextAnnotation", { text: marked("document", "Spec") }), undefined, fixturePolicy), "document");
  assert.equal(style.annotatedKind(bo("bpmn:TextAnnotation", { text: `  ${marked("application", "CRM")}` }), undefined, fixturePolicy), "application");
  assert.equal(style.roleText(marked("application", " CRM"), fixturePolicy), "CRM");
  assert.equal(style.roleText(marked("document", "Spec"), fixturePolicy), "Spec");
});

test("connections: conditional, default, message and directed associations stay upstream", () => {
  const k = style.annotatedConnectionKind;
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
  assert.equal(style.annotatedConnectionKind(flow), undefined);
});

test("colour helpers", () => {
  assert.equal(style.shade("#ffffff", 0.5), "#808080");
  assert.equal(style.shade("not-a-colour", 0.5), "not-a-colour");
  assert.equal(style.contrastText("#000000", "#111111", "#ffffff"), "#ffffff");
  assert.equal(style.contrastText("#ffffff", "#111111", "#ffffff"), "#111111");
  assert.equal(style.contrastText("rgb(0,0,0)", "#111111", "#ffffff"), "#111111");
});

test("document geometry", () => {
  assert.match(style.documentPath(100, 60), /^M0 0H100V51Q/);
  const r = style.documentTextRect(100, 60, fixturePolicy);
  assert.equal(r.x, 5);
  assert.equal(r.width, 90);
  assert.ok(r.height >= 0);
});

test("tokens: the injected look, overridable", () => {
  const t = look.tokens;
  const merged = tokens.resolveAnnotatedTokens({ stroke: "#112233", fontSize: undefined }, t);
  assert.equal(merged.stroke, "#112233");
  assert.equal(merged.fontSize, 12, "undefined override is ignored");
  const keys = ["fontFamily", "fontSize", "strokeWidth", "stroke", "fill", "text", "headerText", "labelText", "flow", "link", "docLink", "docLinkDash", "dataLinkArrow", "taskLine", "taskFill", "taskFillEnd",
    "eventLine", "eventFill", "gatewayLine", "gatewayFill", "poolLine", "poolFill", "laneLine", "laneFill", "laneHeaderFill", "externalLine", "externalFill",
    "docLine", "docFill", "dataLine", "dataFill", "appLine", "appFill"];
  assert.deepEqual(Object.keys(t).sort(), [...keys].sort(), "the public token list");
});

test("tokens: stroke feeds every line, fill feeds the task, the gradient end is derived", () => {
  const m = tokens.resolveAnnotatedTokens({ stroke: "#112233", fill: "#808080" }, look.tokens);
  for (const k of ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"]) {
    assert.equal(m[k], "#112233", k);
  }
  assert.equal(m.link, look.tokens.link, "link is not fed by stroke");
  assert.equal(m.taskFill, "#808080");
  assert.equal(m.taskFillEnd, style.shade("#808080", 0.95), "derived second tone");
  assert.equal(m.eventFill, look.tokens.eventFill, "fill does not leak into other types");
});

test("tokens: an explicit per-type value wins over the conveniences", () => {
  const m = tokens.resolveAnnotatedTokens({ stroke: "#112233", taskLine: "#445566", taskFill: "#808080", taskFillEnd: "#707070" }, look.tokens);
  assert.equal(m.taskLine, "#445566");
  assert.equal(m.eventLine, "#112233");
  assert.equal(m.taskFillEnd, "#707070");
});

test("legend sources contain no banned symbol", () => {
  const allowed = baselineHashAllowlist();
  const dir = `${root}src/presentation/annotated/`;
  const banned = /localStorage|sessionStorage|@\/lib|\.bjs-powered-by|prototype\.\w+\s*=/;
  for (const f of readdirSync(dir)) {
    if (!/\.(ts|mjs)$/.test(f)) continue;
    const text = readFileSync(dir + f, "utf8");
    assert.ok(!banned.test(text), `${f} contains a banned symbol: ${banned.exec(text)?.[0]}`);
    assert.deepEqual(outsideBaselineHashes(`src/presentation/annotated/${f}`, text, allowed), [], `${f} keeps a banned identifier`);
    assert.ok(!/#[0-9a-fA-F]{6}\b/.test(f === "tokens.ts" ? "" : text), `${f} hard-codes a colour outside tokens.ts`);
  }
});

test("tokens: docLink follows link and laneHeaderFill follows laneFill unless named", () => {
  const a = tokens.resolveAnnotatedTokens({ link: "#010203", laneFill: "#040506" }, look.tokens);
  assert.equal(a.docLink, "#010203");
  assert.equal(a.laneHeaderFill, "#040506");
  assert.equal(a.docLinkDash, "5 5");
  const b = tokens.resolveAnnotatedTokens({ link: "#010203", docLink: "#0a0b0c", docLinkDash: "3 4", laneFill: "#040506", laneHeaderFill: "#0d0e0f" }, look.tokens);
  assert.deepEqual([b.docLink, b.docLinkDash, b.laneHeaderFill, b.link, b.laneFill], ["#0a0b0c", "3 4", "#0d0e0f", "#010203", "#040506"]);
});
