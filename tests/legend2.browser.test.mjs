import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const CUSTOM = {
  stroke: "#aa0001", text: "#aa0003", headerText: "#aa0004", flow: "#aa0005", link: "#aa0006", taskLine: "#aa0007", taskFill: "#aa0008", taskFillEnd: "#aa0009",
  eventLine: "#aa000a", eventFill: "#aa000b", gatewayLine: "#aa000c", gatewayFill: "#aa000d", poolLine: "#aa000e", poolFill: "#aa000f", laneLine: "#aa0010",
  laneFill: "#aa0011", externalLine: "#aa0012", externalFill: "#aa0013", docLine: "#aa0014", docFill: "#aa0015", dataLine: "#aa0016", dataFill: "#aa0017",
  appLine: "#aa0018", appFill: "#aa0019",
};
// Seed brand palette. None of it may appear in the neutral defaults.
const BRAND = ["#e27676", "#60be89", "#0f3180", "#f6f1ea", "#ece2d4", "#ffff99", "#99ffff", "#ffe599", "#eee7df"];

test("legend profile parity in a real browser", { timeout: 180000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-legend2.mjs", "legend2", (page) => page.evaluate(() => window.runLegend2()));

  await t.test("imports cleanly", () => {
    assert.equal(o.state, "ready");
    assert.deepEqual(o.diagnostics, []);
  });

  await t.test("(a) pool and lane names sit in the header column: translate to the bottom, rotate -90", () => {
    assert.equal(o.poolHeaders.length, 1);
    assert.equal(o.laneHeaders.length, 2);
    for (const hd of [...o.poolHeaders, ...o.laneHeaders]) {
      assert.ok(hd.height > 0);
      assert.equal(hd.transform, `translate(0 ${hd.height}) rotate(-90)`);
    }
  });

  await t.test("(b) the [App] annotation is a component box under its task, neutral tokens", () => {
    assert.ok(o.app, "g.legend-app inside the task");
    assert.equal(o.app.width, "80");
    assert.equal(o.app.height, "30");
    assert.equal(o.app.transform, "translate(20 70)", "centred under the 120x80 task, top at bottom - 10");
    assert.equal(o.app.hasIcon, true);
    assert.match(o.app.text, /SAP/);
  });

  await t.test("(b) [App] and its link are hidden; [Doc] and its link are kept", () => {
    assert.equal(o.visibility.APP, "none");
    assert.equal(o.visibility.A1, "none");
    assert.notEqual(o.visibility.DOC, "none");
    assert.notEqual(o.visibility.A2, "none");
  });

  await t.test("(c) a click on the body of a call activity or sub-process is not a marker click; the marker is", () => {
    assert.deepEqual([o.hit.callActivityBody.insideElement, o.hit.callActivityBody.isMarker], [true, false], JSON.stringify(o.hit.callActivityBody));
    assert.deepEqual([o.hit.callActivityIcon.insideElement, o.hit.callActivityIcon.isMarker], [true, true], JSON.stringify(o.hit.callActivityIcon));
    assert.deepEqual([o.hit.subProcessBody.insideElement, o.hit.subProcessBody.isMarker], [true, false], JSON.stringify(o.hit.subProcessBody));
    assert.deepEqual([o.hit.subProcessMarker.insideElement, o.hit.subProcessMarker.isMarker], [true, true], JSON.stringify(o.hit.subProcessMarker));
    assert.deepEqual([o.hit.taskBody.insideElement, o.hit.taskBody.isMarker], [true, false], "a plain task is hit by its own body");
  });

  await t.test("(d) custom tokens reach the rendered SVG, one by one", () => {
    const c = o.custom;
    assert.equal(c.taskBody, true, "default task body is a gradient");
    assert.deepEqual(c.gradient, [CUSTOM.taskFill, CUSTOM.taskFillEnd], "both gradient tones");
    const expect = {
      taskStroke: CUSTOM.taskLine, eventFill: CUSTOM.eventFill, eventStroke: CUSTOM.eventLine, gatewayFill: CUSTOM.gatewayFill, gatewayStroke: CUSTOM.gatewayLine,
      poolFill: CUSTOM.poolFill, poolStroke: CUSTOM.poolLine, laneFill: CUSTOM.laneFill, laneStroke: CUSTOM.laneLine, externalFill: CUSTOM.externalFill,
      externalStroke: CUSTOM.externalLine, dataFill: CUSTOM.dataFill, dataStroke: CUSTOM.dataLine, docFill: CUSTOM.docFill, docStroke: CUSTOM.docLine,
      appFill: CUSTOM.appFill, appStroke: CUSTOM.appLine, flow: CUSTOM.flow, flowMarker: CUSTOM.flow, link: CUSTOM.link, headerText: CUSTOM.headerText,
    };
    for (const [k, v] of Object.entries(expect)) assert.equal(c[k], v, k);
    assert.equal(c.strokeWidth, "2px");
  });

  await t.test("distinct flow stroke and link stroke by default", () => {
    assert.notEqual(o.defaults.tokens.flow, o.defaults.tokens.link);
    assert.notEqual(o.defaults.gradient[0], o.defaults.gradient[1], "two gradient tones by default");
  });

  await t.test("defaults are neutral: no brand value, every field present", () => {
    const values = Object.values(o.defaults.tokens).map((v) => String(v).toLowerCase());
    for (const b of BRAND) assert.ok(!values.includes(b), `default token equals brand value ${b}`);
    assert.ok(Object.keys(o.defaults.tokens).length >= 28);
  });

  await t.test("palette: entries equal the exported action ids, each styled by the lib CSS", () => {
    assert.deepEqual(o.palette.entries.sort(), [...o.palette.ids].sort());
    assert.equal(o.palette.styled.length, 16);
    for (const e of o.palette.styled) {
      assert.equal(e.mask, true, `${e.id} icon mask`);
      assert.ok(e.boxW > 0 && e.boxH > 0, `${e.id} visible`);
    }
  });

  await t.test("the bpmn.io badge is still visible in a legend canvas", () => assert.equal(o.palette.badge, true));

  await t.test("the standard profile never gets legend palette entries or shapes", () => {
    assert.equal(o.standard.legendEntries, 0);
    assert.ok(o.standard.entries > 0);
    assert.equal(o.standard.legendShapes, 0);
  });

  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
