import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const r = (p) => readFileSync(root + p, "utf8");
const ce3 = r("experiments/e3/corpus/ce3-collapsed-subprocess.bpmn");
const ce4 = r("experiments/e3/corpus/ce4-two-pools-message.bpmn");
const ce5 = r("experiments/e3/corpus/ce5-two-diagrams-shared-root.bpmn");
const poolLanes = r("tests/fixtures/io/pool-lanes.bpmn");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test("0.2 canvas API in a real browser", { timeout: 300000 }, async (t) => {
  const { result: out, consoleLines } = await runInBrowser(root + "tests/browser/page-v02.mjs", "v02", async (page) => {
    const o = {};
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const clickAt = async (p) => { await page.mouse.click(p.x, p.y); await sleep(150); };

    // ---- L1: element clicks, marker detection, drill-down modes ----------------------------------
    const bodyPoint = (b) => ({ x: b.x + 6, y: b.y + b.height - 8 }); // away from the bottom-centre marker
    const std = await ev(([x]) => window.v02.mount(x, { profile: "standard", drilldown: "event" }), [ce3]);
    const stdBody = await ev(([i]) => window.v02.rectOf(i, '.djs-element[data-element-id="Sub_1"] .djs-hit-all'), [std.id]);
    await clickAt(bodyPoint(stdBody));
    const stdDrill = await ev(([i]) => window.v02.rectOf(i, ".bjs-drilldown"), [std.id]);
    o.standardDrillFound = !!stdDrill;
    if (stdDrill) await clickAt(centre(stdDrill));
    o.standardClicks = await ev(([i]) => window.v02.log(i).clicks, [std.id]);
    o.standardEventModeNavigated = await ev(([i]) => window.v02.get(i).handle.modeler.get("canvas").getRootElement().id, [std.id]);
    await ev(([i]) => window.v02.destroy(i), [std.id]);

    const leg = await ev(([x]) => window.v02.mount(x, { profile: "legend", drilldown: "event" }), [ce3]);
    const legBody = await ev(([i]) => window.v02.rectOf(i, '.djs-element[data-element-id="Sub_1"] .djs-hit-all'), [leg.id]);
    await clickAt(bodyPoint(legBody));
    const legMarker = await ev(([i]) => window.v02.rectOf(i, '[data-element-id="Sub_1"] .legend-marker'), [leg.id]);
    o.legendMarkerFound = !!legMarker;
    if (legMarker) await clickAt(centre(legMarker));
    o.legendClicks = await ev(([i]) => window.v02.log(i).clicks, [leg.id]);
    const legDrill = await ev(([i]) => window.v02.rectOf(i, ".bjs-drilldown"), [leg.id]);
    if (legDrill) await clickAt(centre(legDrill));
    o.legendDrillClicks = (await ev(([i]) => window.v02.log(i).clicks.length, [leg.id])) - o.legendClicks.length;
    await ev(([i]) => window.v02.destroy(i), [leg.id]);

    const nat = await ev(([x]) => window.v02.mount(x, { profile: "standard" }), [ce3]);
    const natDrill = await ev(([i]) => window.v02.rectOf(i, ".bjs-drilldown"), [nat.id]);
    await clickAt(centre(natDrill));
    o.native = await ev(([i]) => ({ active: window.v02.get(i).handle.getActiveDiagramId(), root: window.v02.get(i).handle.modeler.get("canvas").getRootElement().id, changes: window.v02.log(i).changes.map((c) => c.cause + ":" + c.diagramId), clicks: window.v02.log(i).clicks.length }), [nat.id]);
    await ev(([i]) => window.v02.destroy(i), [nat.id]);

    const call = await ev(() => window.v02.mount(window.v02.callXml()));
    const callBox = await ev(([i]) => window.v02.rectOf(i, '.djs-element[data-element-id="CA"] .djs-hit-all'), [call.id]);
    await clickAt({ x: callBox.x + 10, y: callBox.y + 10 });
    o.callClick = await ev(([i]) => window.v02.log(i).clicks, [call.id]);
    await ev(([i]) => window.v02.destroy(i), [call.id]);

    const ro = await ev(([x]) => window.v02.mount(x, { readOnly: true }), [ce3]);
    const roBox = await ev(([i]) => window.v02.rectOf(i, '.djs-element[data-element-id="Sub_1"] .djs-hit-all'), [ro.id]);
    await clickAt({ x: roBox.x + 6, y: roBox.y + roBox.height - 8 });
    o.readOnlyClicks = await ev(([i]) => window.v02.log(i).clicks.length, [ro.id]);
    const host = await ev(([i]) => window.v02.rectOf(i, ".djs-container"), [ro.id]);
    const before = await ev(([i]) => window.v02.log(i).clicks.length, [ro.id]);
    await clickAt({ x: host.x + host.width - 120, y: host.y + 40 }); // empty canvas, away from the bpmn.io badge (bottom right)
    o.rootClickAdded = (await ev(([i]) => window.v02.log(i).clicks.length, [ro.id])) - before;
    await ev(([i]) => window.v02.destroy(i), [ro.id]);

    // ---- L2: zoom API, limits, fit modes, resize --------------------------------------------------
    const z = await ev(([x]) => window.v02.mount(x, { zoomLimits: { min: 0.5, max: 2 } }), [ce4]);
    await ev(([i]) => window.v02.call(i, "zoomTo", 10), [z.id]);
    o.zoomMax = await ev(([i]) => window.v02.zoom(i), [z.id]);
    await ev(([i]) => window.v02.call(i, "zoomTo", 0.01), [z.id]);
    o.zoomMin = await ev(([i]) => window.v02.zoom(i), [z.id]);
    await ev(([i]) => window.v02.call(i, "zoomTo", 1), [z.id]);
    await ev(([i]) => window.v02.call(i, "zoomBy", 1.5), [z.id]);
    o.zoomBy = await ev(([i]) => window.v02.zoom(i), [z.id]);
    await ev(([i]) => window.v02.destroy(i), [z.id]);

    const wide = await ev(() => window.v02.mount(window.v02.wideXml(), { fitMode: "readable" }, { width: 900, height: 500 }));
    o.wideReadableZoom = await ev(([i]) => window.v02.zoom(i), [wide.id]);
    await ev(([i]) => window.v02.call(i, "fit", { mode: "whole" }), [wide.id]);
    o.wideWholeZoom = await ev(([i]) => window.v02.zoom(i), [wide.id]);
    await ev(([i]) => window.v02.call(i, "fit", { mode: "readable" }), [wide.id]);
    o.wideReadableAgain = await ev(([i]) => window.v02.zoom(i), [wide.id]);
    // readable keeps the user's zoom across a resize
    await ev(([i]) => window.v02.call(i, "zoomTo", 0.4), [wide.id]);
    await ev(([i]) => window.v02.resize(i, 700, 420), [wide.id]);
    await sleep(300);
    o.readableAfterResize = await ev(([i]) => window.v02.zoom(i), [wide.id]);
    // whole re-fits on every resize
    await ev(([i]) => window.v02.call(i, "setFitMode", "whole"), [wide.id]);
    await sleep(300);
    const wholeBefore = await ev(([i]) => window.v02.zoom(i), [wide.id]);
    await ev(([i]) => window.v02.resize(i, 1100, 500), [wide.id]);
    await sleep(400);
    o.wholeBeforeResize = wholeBefore;
    o.wholeAfterResize = await ev(([i]) => window.v02.zoom(i), [wide.id]);
    await ev(([i]) => window.v02.destroy(i), [wide.id]);

    // ---- L3: wheel zoom around the cursor -----------------------------------------------------------
    const w = await ev(([x]) => window.v02.mount(x, { wheel: "zoom-cursor", zoomLimits: { min: 0.2, max: 3 } }), [ce4]);
    const box = await ev(([i]) => window.v02.rectOf(i, ".djs-container"), [w.id]);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(150);
    const z0 = await ev(([i]) => window.v02.zoom(i), [w.id]);
    await page.mouse.wheel(0, -100);
    await sleep(100);
    const z1 = await ev(([i]) => window.v02.zoom(i), [w.id]);
    await page.mouse.wheel(0, 100);
    await sleep(100);
    const z2 = await ev(([i]) => window.v02.zoom(i), [w.id]);
    o.wheel = { z0, z1, z2, inRatio: z1 / z0, outRatio: z2 / z1, box, scroll: await ev(() => [window.scrollX, window.scrollY, document.querySelectorAll('#app > div').length]), top: await ev((p) => { const e = document.elementFromPoint(p.x, p.y); return e ? e.tagName + '.' + (e.getAttribute('class') || '') : null; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }) };
    for (let k = 0; k < 40; k++) await page.mouse.wheel(0, -100);
    await sleep(200);
    o.wheelCeiling = await ev(([i]) => window.v02.zoom(i), [w.id]);
    const prevented = await ev(([i]) => {
      const e = new WheelEvent("wheel", { deltaY: -50, cancelable: true, bubbles: true });
      window.v02.get(i).host.querySelector("svg").dispatchEvent(e);
      return e.defaultPrevented;
    }, [w.id]);
    o.wheelPrevented = prevented;
    await ev(([i]) => window.v02.destroy(i), [w.id]);

    // ---- L6: profile switch ---------------------------------------------------------------------------
    const p = await ev(([x]) => window.v02.mount(x, { profile: "standard" }), [ce5]);
    await ev(([i]) => window.v02.edit(i, "TS", "SWITCHED"), [p.id]);
    await ev(([i]) => window.v02.call(i, "selectDiagram", "DiagB"), [p.id]);
    await ev(([i]) => window.v02.edit(i, "TO", "OTHER"), [p.id]);
    await ev(([i]) => window.v02.call(i, "zoomTo", 1.7), [p.id]);
    const preRev = await ev(([i]) => window.v02.log(i).changes.at(-1).revision, [p.id]);
    const preCount = await ev(([i]) => window.v02.log(i).changes.length, [p.id]);
    const preX = await ev(([i]) => window.v02.get(i).handle.modeler.get("canvas").viewbox().x, [p.id]);
    await ev(([i]) => window.v02.call(i, "setProfile", "legend", { taskFill: "#123456" }), [p.id]);
    const after = await ev(([i]) => {
      const it = window.v02.get(i);
      return {
        legendShapes: it.host.querySelectorAll(".legend-shape").length,
        containers: it.host.querySelectorAll(".djs-container").length,
        badges: it.host.querySelectorAll(".bjs-powered-by").length,
        active: it.handle.getActiveDiagramId(),
        showsB: !!it.host.querySelector('.djs-element[data-element-id="TO"]'),
        showsA: !!it.host.querySelector('.djs-element[data-element-id="TS"]'),
        zoom: it.handle.getZoom(),
        canUndo: it.handle.canUndo(),
        state: it.handle.state,
        changes: it.log.changes.slice(),
        gradientColors: [...it.host.querySelectorAll("linearGradient stop")].map((s) => s.getAttribute("stop-color") ?? s.style.stopColor),
        viewboxX: it.handle.modeler.get("canvas").viewbox().x,
      };
    }, [p.id]);
    const xmlAfter = await ev(([i]) => window.v02.call(i, "getXml"), [p.id]);
    o.profileSwitch = { preRev, preCount, preX, after, hasEdits: xmlAfter.includes('name="SWITCHED"') && xmlAfter.includes('name="OTHER"') };
    await ev(([i]) => window.v02.call(i, "setProfile", "standard"), [p.id]);
    o.backToStandard = await ev(([i]) => ({ legendShapes: window.v02.get(i).host.querySelectorAll(".legend-shape").length, containers: window.v02.get(i).host.querySelectorAll(".djs-container").length }), [p.id]);
    await ev(([i]) => window.v02.destroy(i), [p.id]);

    const u = await ev(([x]) => window.v02.mount(x), [ce4]);
    await ev(([i]) => window.v02.call(i, "setProfile", "legend"), [u.id]);
    o.untouchedBytes = await ev(async ([i, x]) => (await window.v02.call(i, "getXml")) === x, [u.id, ce4]);
    await ev(([i]) => window.v02.destroy(i), [u.id]);

    const ro2 = await ev(([x]) => window.v02.mount(x, { readOnly: true }), [ce4]);
    await ev(([i]) => window.v02.call(i, "setProfile", "legend"), [ro2.id]);
    o.readOnlyKept = await ev(([i]) => window.v02.get(i).handle.isReadOnly(), [ro2.id]);
    await ev(([i]) => window.v02.destroy(i), [ro2.id]);

    const ab = await ev(([x]) => window.v02.mount(x), [ce4]);
    o.abortedSwitch = await ev(async ([i]) => {
      const pr = window.v02.get(i).handle.setProfile("legend");
      window.v02.get(i).handle.destroy();
      try { await pr; return "resolved"; } catch (e) { return e.name; }
    }, [ab.id]);

    // ---- implicit sub-process planes are not diagrams of the document
    const imp = await ev(([x]) => window.v02.mount(x), [poolLanes]);
    o.implicitPlanes = await ev(([i]) => window.v02.get(i).handle.getDiagrams().map((d) => [d.id, d.name]), [imp.id]);
    await ev(([i]) => window.v02.destroy(i), [imp.id]);

    // ---- L8: history ------------------------------------------------------------------------------------
    const h = await ev(([x]) => window.v02.mount(x), [ce5]);
    await ev(([i]) => window.v02.edit(i, "TS", "H1"), [h.id]);
    await ev(([i]) => window.v02.call(i, "undo"), [h.id]);
    await ev(([i]) => window.v02.call(i, "redo"), [h.id]);
    await ev(([i]) => window.v02.call(i, "selectDiagram", "DiagB"), [h.id]);
    o.history = await ev(([i]) => window.v02.log(i).history, [h.id]);
    await ev(([i]) => window.v02.destroy(i), [h.id]);
    return o;
  });

  await t.test("L1 standard profile: body click is not a marker click; the drill-down button is, and does not navigate in event mode", () => {
    assert.ok(out.standardDrillFound, "a drill-down button exists");
    assert.equal(out.standardClicks.length, 2, JSON.stringify(out.standardClicks));
    const [body, marker] = out.standardClicks;
    assert.deepEqual({ id: body.id, type: body.type, marker: body.marker }, { id: "Sub_1", type: "bpmn:SubProcess", marker: false });
    assert.deepEqual({ id: marker.id, marker: marker.marker }, { id: "Sub_1", marker: true });
    assert.notEqual(out.standardEventModeNavigated, "Sub_1_plane", "event mode must not navigate");
  });
  await t.test("L1 legend profile: the legend marker is a marker click; the drill-down button too", () => {
    assert.ok(out.legendMarkerFound);
    assert.equal(out.legendClicks.length, 2, JSON.stringify(out.legendClicks));
    assert.equal(out.legendClicks[0].marker, false);
    assert.equal(out.legendClicks[1].marker, true);
    assert.equal(out.legendDrillClicks, 1);
  });
  await t.test("drilldown native: the displayed diagram and the active diagram id stay in step, with a diagram-switch change", () => {
    assert.equal(out.native.root, "Sub_1_plane");
    assert.equal(out.native.active, "BD2", JSON.stringify(out.native));
    assert.ok(out.native.changes.includes("diagram-switch:BD2"), JSON.stringify(out.native));
  });
  await t.test("L1 call activity carries calledElement and name", () => {
    assert.equal(out.callClick.length, 1);
    assert.deepEqual({ ...out.callClick[0] }, { id: "CA", type: "bpmn:CallActivity", name: "Call", calledElement: "Other_Proc", marker: false });
  });
  await t.test("L1 clicks still fire when read-only; a click on the empty canvas is not an element click", () => {
    assert.equal(out.readOnlyClicks, 1);
    assert.equal(out.rootClickAdded, 0);
  });
  await t.test("L2 zoom limits clamp zoomTo and zoomBy composes", () => {
    assert.equal(out.zoomMax, 2);
    assert.equal(out.zoomMin, 0.5);
    assert.ok(Math.abs(out.zoomBy - 1.5) < 0.01, String(out.zoomBy));
  });
  await t.test("L2 readable and whole fits differ on a wide diagram", () => {
    assert.ok(out.wideReadableZoom > out.wideWholeZoom * 2, JSON.stringify([out.wideReadableZoom, out.wideWholeZoom]));
    assert.ok(Math.abs(out.wideReadableAgain - out.wideReadableZoom) < 0.05, "explicit readable fit reproduces the initial readable view");
  });
  await t.test("L2 readable keeps the user's zoom across a resize; whole re-fits on every resize", () => {
    assert.ok(Math.abs(out.readableAfterResize - 0.4) < 0.02, String(out.readableAfterResize));
    assert.notEqual(out.wholeAfterResize, out.wholeBeforeResize);
    assert.ok(out.wholeAfterResize > out.wholeBeforeResize, "a wider canvas allows a larger whole-diagram zoom");
  });
  await t.test("L3 zoom-cursor: plain wheel zooms by x1.15 / x0.87, within limits, and is captured", () => {
    assert.ok(Math.abs(out.wheel.inRatio - 1.15) < 0.02, JSON.stringify(out.wheel));
    assert.ok(Math.abs(out.wheel.outRatio - 0.87) < 0.02, JSON.stringify(out.wheel));
    assert.equal(out.wheelCeiling, 3, JSON.stringify(out.wheel));
    assert.equal(out.wheelPrevented, true);
  });
  await t.test("L6 setProfile keeps XML, edits, active diagram, viewbox and read-only; clears undo; one container and one badge", () => {
    const s = out.profileSwitch;
    assert.ok(s.hasEdits, "both edits survive the switch");
    assert.equal(s.after.active, "DiagB");
    assert.equal(s.after.showsB, true);
    assert.equal(s.after.showsA, false);
    assert.ok(s.after.legendShapes > 0, "legend look applied");
    assert.equal(s.after.containers, 1);
    assert.equal(s.after.badges, 1);
    assert.equal(s.after.canUndo, false, "undo stack is lost (documented)");
    assert.ok(Math.abs(s.after.zoom - 1.7) < 0.02, `zoom ${s.after.zoom}`);
    assert.ok(Math.abs(s.after.viewboxX - s.preX) < 1, `viewbox x ${s.preX} -> ${s.after.viewboxX}`);
    assert.equal(s.after.state, "ready");
  });
  await t.test("L6 emits onChange cause profile-switch without a new content revision", () => {
    const s = out.profileSwitch;
    assert.equal(s.after.changes.length, s.preCount + 1);
    const last = s.after.changes.at(-1);
    assert.equal(last.cause, "profile-switch");
    assert.equal(last.revision, s.preRev);
    assert.equal(last.diagramId, "DiagB");
  });
  await t.test("L6 custom tokens reach the rendering", () => {
    assert.ok(out.profileSwitch.after.gradientColors.some((c) => /123456/i.test(c) || /rgb\(18, 52, 86\)/.test(c)), JSON.stringify(out.profileSwitch.after.gradientColors));
  });
  await t.test("L6 switching back to standard leaves no legend shape and one container", () => {
    assert.deepEqual(out.backToStandard, { legendShapes: 0, containers: 1 });
  });
  await t.test("L6 an untouched document keeps its exact bytes across a switch; read-only is preserved; a destroyed switch aborts", () => {
    assert.equal(out.untouchedBytes, true);
    assert.equal(out.readOnlyKept, true);
    assert.equal(out.abortedSwitch, "AbortError");
  });
  await t.test("getDiagrams lists only the diagrams the document declares (bpmn-js implicit sub-process planes are excluded)", () => {
    assert.deepEqual(out.implicitPlanes, [["Dia", "Request"]]);
  });
  await t.test("L8 onHistoryChange follows edit, undo, redo and the clearing diagram switch", () => {
    assert.deepEqual(out.history.map((x) => `${x.canUndo}/${x.canRedo}`), ["false/false", "true/false", "false/true", "true/false", "false/false"]);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
