import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const r = (p) => readFileSync(root + p, "utf8");
const ce1 = r("experiments/e3/corpus/ce1-homonyms.bpmn");
const ce3 = r("experiments/e3/corpus/ce3-collapsed-subprocess.bpmn");
const ce4 = r("experiments/e3/corpus/ce4-two-pools-message.bpmn");
const ce5 = r("experiments/e3/corpus/ce5-two-diagrams-shared-root.bpmn");
const pool = r("tests/fixtures/io/pool-lanes.bpmn");
// In-memory files: a snap Chromium cannot read the host /tmp, and a remote Chrome cannot read local paths.
const file = (name, text) => ({ name, mimeType: "application/xml", buffer: Buffer.from(text, "utf8") });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

test("workshop in a real browser", { timeout: 580000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-workshop.mjs", "workshop", async (page) => {
    const o = {};
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const mount = async (xml, opts, size, strict, shadow) => {
      const m = await ev(([x, op, s, st, sh]) => window.ws.mount(x, op, s, st, sh), [xml, opts ?? {}, size ?? { width: 900, height: 560 }, !!strict, !!shadow]);
      const ok = await ev(([i]) => window.ws.ready(i), [m.id]);
      if (!ok) throw new Error("workshop not ready");
      return m;
    };
    const tb = (id) => `#ws-host-${id}`;
    const rect = (id, sel) => ev(([i, s]) => window.ws.rect(i, s), [id, sel]);
    const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const clickSel = async (id, sel) => {
      const b = await rect(id, sel);
      await page.mouse.click(...Object.values(center(b)));
      await sleep(120);
    };
    const log = (id) => ev(([i]) => window.ws.log(i), [id]);

    // ---- 1 structure and ARIA --------------------------------------------------------------------
    const a = await mount(ce5);
    o.structure = await ev(([i]) => {
      const q = (s) => window.ws.q(i, s);
      return {
        toolbar: window.ws.attr(i, '[role="toolbar"]', "aria-label"),
        buttons: [...window.ws.it(i).mountEl.querySelectorAll('.bpmn-workshop__toolbar > button')].map((b) => b.getAttribute("aria-label")),
        menus: [...window.ws.it(i).mountEl.querySelectorAll('.bpmn-workshop-menu__popup')].map((m) => m.getAttribute("aria-label")),
        tabs: [...window.ws.it(i).mountEl.querySelectorAll('[role="tab"]')].map((x) => [x.textContent, x.getAttribute("aria-selected"), x.getAttribute("tabindex")]),
        panelLabelledBy: window.ws.attr(i, '[role="tabpanel"]', "aria-labelledby"),
        activeTabId: window.ws.it(i).mountEl.querySelector('[role="tab"][aria-selected="true"]')?.id,
        containers: window.ws.qa(i, ".djs-container"),
        badge: (() => { const b = window.ws.it(i).mountEl.querySelector(".bjs-powered-by"); return b ? { href: b.getAttribute("href"), visible: getComputedStyle(b).display !== "none" } : null; })(),
        formatMenuHidden: !q('[data-testid="bpmn-workshop-format"]'),
      };
    }, [a.id]);

    // ---- 2 tabs: click, arrows with wrap, history cleared by the switch -------------------------------
    await page.locator(`${tb(a.id)} [role="tab"]`).nth(1).click();
    await sleep(200);
    o.tabClick = await ev(([i]) => ({ active: window.ws.active(i), showsB: window.ws.q(i, '.djs-element[data-element-id="TO"]'), showsA: window.ws.q(i, '.djs-element[data-element-id="TS"]'), sel: [...window.ws.it(i).mountEl.querySelectorAll('[role="tab"]')].map((x) => x.getAttribute("aria-selected")) }), [a.id]);
    await page.locator(`${tb(a.id)} [role="tab"][aria-selected="true"]`).focus();
    await page.keyboard.press("ArrowRight");
    await sleep(200);
    o.tabWrap = await ev(([i]) => window.ws.active(i), [a.id]);
    await page.keyboard.press("ArrowLeft");
    await sleep(200);
    o.tabWrapBack = await ev(([i]) => window.ws.active(i), [a.id]);
    await ev(([i]) => window.ws.unmount(i), [a.id]);

    // ---- 3 gesture edit, xml echo with revision, undo/redo buttons -----------------------------------
    const e = await mount(ce1, { echo: true });
    o.historyAtStart = await ev(([i]) => [window.ws.disabled(i, '[data-testid="bpmn-workshop-undo"]'), window.ws.disabled(i, '[data-testid="bpmn-workshop-redo"]')], [e.id]);
    const ta = await rect(e.id, '.djs-element[data-element-id="TA"] .djs-hit-all');
    await page.mouse.dblclick(...Object.values(center(ta)));
    await page.waitForSelector(`${tb(e.id)} .djs-direct-editing-content, ${tb(e.id)} [contenteditable="true"]`, { timeout: 5000 });
    await page.keyboard.press("Control+A");
    await page.keyboard.type("WORKSHOP");
    const empty = await rect(e.id, ".bpmn-workshop__panel");
    await page.mouse.click(empty.x + empty.width - 120, empty.y + 40);
    await sleep(400);
    o.edit = await ev(([i]) => { const l = window.ws.log(i); return { n: l.xmlChanges.length, hasName: l.xmlChanges.at(-1)?.xml.includes('name="WORKSHOP"'), cause: l.xmlChanges.at(-1)?.cause, revision: !!l.xmlChanges.at(-1)?.revision, undoDisabled: window.ws.disabled(i, '[data-testid="bpmn-workshop-undo"]') }; }, [e.id]);
    o.echoKeptUndo = await ev(([i]) => window.ws.canvasHandle(i).canUndo(), [e.id]);
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-undo"]`).click();
    await sleep(250);
    o.afterUndo = await ev(async ([i]) => ({ redoDisabled: window.ws.disabled(i, '[data-testid="bpmn-workshop-redo"]'), xmlHasName: (await window.ws.getXml(i)).includes('name="WORKSHOP"') }), [e.id]);
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-redo"]`).click();
    await sleep(250);
    o.afterRedo = await ev(async ([i]) => (await window.ws.getXml(i)).includes('name="WORKSHOP"'), [e.id]);

    // ---- 4 fit menu, zoom buttons ---------------------------------------------------------------------
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-fit"] button`).first().click();
    await page.getByRole("menuitem", { name: "100%", exact: true }).click();
    await sleep(150);
    o.zoom100 = await ev(([i]) => window.ws.zoom(i), [e.id]);
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-zoom-in"]`).click();
    o.zoomIn = await ev(([i]) => window.ws.zoom(i), [e.id]);
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-zoom-out"]`).click();
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-zoom-out"]`).click();
    o.zoomOut = await ev(([i]) => window.ws.zoom(i), [e.id]);

    // ---- 5 auto-layout: success is one change with cause layout; failure reports and notifies ------------
    const before = await ev(([i]) => window.ws.log(i).xmlChanges.length, [e.id]);
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-auto-layout"]`).click();
    await sleep(900);
    o.layout = await ev(([i, b]) => ({ added: window.ws.log(i).xmlChanges.length - b, cause: window.ws.log(i).xmlChanges.at(-1)?.cause }), [e.id, before]);
    await ev(([i]) => window.ws.stubLayoutFailure(i), [e.id]);
    await page.locator(`${tb(e.id)} [data-testid="bpmn-workshop-auto-layout"]`).click();
    await sleep(300);
    o.layoutFailure = await ev(([i]) => ({ errors: window.ws.log(i).layoutErrors, alert: window.ws.text(i, '[role="alert"]') }), [e.id]);
    await page.locator(`${tb(e.id)} .bpmn-workshop__notice button`).first().click();
    o.noticeDismissed = await ev(([i]) => window.ws.qa(i, ".bpmn-workshop__notice"), [e.id]);
    await ev(([i]) => window.ws.unmount(i), [e.id]);

    // ---- 6 busy: veil, disabled toolbar, inert canvas, no edits -----------------------------------------
    const b = await mount(ce1, { extra: { readOnly: true } });
    o.busy = await ev(([i]) => ({
      veil: window.ws.text(i, '[role="status"].bpmn-workshop__veil'),
      disabled: [...window.ws.it(i).mountEl.querySelectorAll('.bpmn-workshop__toolbar > button')].filter((x) => x.getAttribute("data-testid") !== "bpmn-workshop-export").map((x) => x.disabled),
      inert: window.ws.it(i).mountEl.querySelector(".bpmn-workshop__canvas")?.hasAttribute("inert"),
      paletteDisplay: getComputedStyle(window.ws.it(i).mountEl.querySelector(".djs-palette")).display,
      readOnly: window.ws.canvasHandle(i).isReadOnly(),
    }), [b.id]);
    const ta2 = await rect(b.id, '.djs-element[data-element-id="TA"] .djs-hit-all');
    await page.mouse.click(...Object.values(center(ta2)));
    await page.keyboard.press("Delete");
    await sleep(150);
    o.busyBytes = await ev(async ([i, x]) => (await window.ws.getXml(i)) === x, [b.id, ce1]);
    await ev(([i]) => window.ws.setExtra(i, { readOnly: false }), [b.id]);
    await sleep(200);
    o.busyOff = await ev(([i]) => ({ veil: window.ws.q(i, ".bpmn-workshop__veil"), readOnly: window.ws.canvasHandle(i).isReadOnly() }), [b.id]);
    await ev(([i]) => window.ws.unmount(i), [b.id]);

    // ---- 7 format switch (uncontrolled and controlled) ----------------------------------------------------
    const formats = [{ id: "std", label: "BPMN", profile: "standard" }, { id: "leg", label: "Legend", profile: "legend" }, { id: "col", label: "Colored", profile: "colored", tokens: { taskFill: "#aabbcc", taskLine: "#112233" } }];
    const f = await mount(ce4, { extra: { formats } });
    await ev(([i]) => window.ws.canvasHandle(i), [f.id]);
    await ev(([i]) => { const m = window.ws.canvasHandle(i).modeler; m.get("modeling").updateProperties(m.get("elementRegistry").get("T1"), { name: "EDIT" }); }, [f.id]);
    await page.locator(`${tb(f.id)} [data-testid="bpmn-workshop-format"] button`).first().click();
    await page.getByRole("menuitemradio", { name: "Legend", exact: true }).click();
    await sleep(700);
    o.format = await ev(async ([i]) => ({ legend: window.ws.qa(i, ".legend-shape") > 0, xml: (await window.ws.getXml(i)).includes('name="EDIT"'), canUndo: window.ws.canvasHandle(i).canUndo(), containers: window.ws.qa(i, ".djs-container"), onFormatChange: window.ws.log(i).formats, triggerText: window.ws.text(i, '[data-testid="bpmn-workshop-format"] .bpmn-workshop-menu__label'), checked: window.ws.attr(i, '[role="menuitemradio"][aria-checked="true"]', "aria-checked") }), [f.id]);
    await page.locator(`${tb(f.id)} [data-testid="bpmn-workshop-format"] button`).first().click();
    await page.getByRole("menuitemradio", { name: "Colored", exact: true }).click();
    await sleep(700);
    o.formatColored = await ev(([i]) => ({ legend: window.ws.qa(i, ".legend-shape"), fill: [...window.ws.it(i).mountEl.querySelectorAll('.djs-element[data-element-id="T1"] rect')].map((x) => x.style.fill || x.getAttribute("fill")).filter(Boolean).slice(0, 2) }), [f.id]);
    await ev(([i]) => window.ws.unmount(i), [f.id]);
    const fc = await mount(ce4, { extra: { formats, format: "leg" } });
    o.formatControlled = await ev(([i]) => window.ws.qa(i, ".legend-shape") > 0, [fc.id]);
    await ev(([i]) => window.ws.setExtra(i, { format: "std" }), [fc.id]);
    await sleep(700);
    o.formatControlledBack = await ev(([i]) => window.ws.qa(i, ".legend-shape"), [fc.id]);
    await ev(([i]) => window.ws.unmount(i), [fc.id]);

    // ---- 8 export ---------------------------------------------------------------------------------------------
    const x = await mount(pool);
    for (const [label, key] of [["BPMN", "bpmn"], ["Draw.io", "drawio"], ["Sparx (BPMN 2.0)", "sparx"]]) {
      await page.locator(`${tb(x.id)} [data-testid="bpmn-workshop-export"] button`).first().click();
      await page.getByRole("menuitem", { name: label, exact: true }).click();
      await sleep(300);
    }
    o.exports = await ev(([i]) => window.ws.log(i).downloads.map((d) => ({ filename: d.filename, mimeType: d.mimeType, fidelity: d.fidelity.map((f) => f.code), same: d.xml.length })), [x.id]);
    o.exportBpmnSame = await ev(([i, p]) => window.ws.log(i).downloads[0]?.xml === p, [x.id, pool]);
    o.exportNotices = await ev(([i]) => [...window.ws.it(i).mountEl.querySelectorAll(".bpmn-workshop__notice")].map((n) => [n.getAttribute("role"), n.textContent]), [x.id]);
    await ev(([i]) => window.ws.unmount(i), [x.id]);
    const xr = await mount(ce4);
    await page.locator(`${tb(xr.id)} [data-testid="bpmn-workshop-export"] button`).first().click();
    await page.getByRole("menuitem", { name: "Draw.io", exact: true }).click();
    await sleep(300);
    o.exportRefused = await ev(([i]) => ({ downloads: window.ws.log(i).downloads.length, alert: window.ws.text(i, '[role="alert"]') }), [xr.id]);
    await ev(([i]) => window.ws.unmount(i), [xr.id]);

    // ---- 9 import ---------------------------------------------------------------------------------------------
    const drawio = (await ev(async ([x0]) => { const m = await import("data:text/javascript,"); return null; }, [pool]).catch(() => null)) ?? null;
    void drawio;
    const im = await mount(ce1, { importHandler: true });
    await page.locator(`${tb(im.id)} [data-testid="bpmn-workshop-file"]`).setInputFiles(file("native.bpmn", pool));
    await page.waitForFunction(([i]) => window.ws.log(i).imports.length > 0 || window.ws.qa(i, '[role="alert"]') > 0, [im.id], { timeout: 15000 }).catch(() => undefined);
    o.importNativeAlert = await ev(([i]) => window.ws.text(i, '[role="alert"]'), [im.id]);
    o.importNative = await ev(([i]) => window.ws.log(i).imports.map((r) => ({ projected: r.projected, fidelity: r.fidelity, same: r.xml.length })), [im.id]);
    o.importNativeSame = await ev(([i, p]) => window.ws.log(i).imports[0]?.xml === p, [im.id, pool]);
    await ev(([i]) => window.ws.unmount(i), [im.id]);
    const ex = await mount(pool);
    await page.locator(`${tb(ex.id)} [data-testid="bpmn-workshop-export"] button`).first().click();
    await page.getByRole("menuitem", { name: "Draw.io", exact: true }).click();
    await sleep(300);
    const dioText = await ev(([i]) => window.ws.log(i).downloads[0]?.xml, [ex.id]);
    await ev(([i]) => window.ws.unmount(i), [ex.id]);
    const im2 = await mount(ce1, { importHandler: true });
    await page.locator(`${tb(im2.id)} [data-testid="bpmn-workshop-file"]`).setInputFiles(file("round.drawio", dioText));
    await sleep(900);
    o.importDrawio = await ev(([i]) => ({ imports: window.ws.log(i).imports.map((r) => [r.projected, r.fidelity]), notices: [...window.ws.it(i).mountEl.querySelectorAll(".bpmn-workshop__notice")].map((n) => n.textContent.slice(0, 40)) }), [im2.id]);
    await page.locator(`${tb(im2.id)} [data-testid="bpmn-workshop-file"]`).setInputFiles(file("bad.drawio", "<mxfile/>"));
    await sleep(500);
    o.importBad = await ev(([i]) => ({ imports: window.ws.log(i).imports.length, alert: window.ws.text(i, '[role="alert"]') }), [im2.id]);
    await ev(([i]) => window.ws.unmount(i), [im2.id]);
    const im3 = await mount(ce1);
    await page.locator(`${tb(im3.id)} [data-testid="bpmn-workshop-file"]`).setInputFiles(file("internal.bpmn", pool));
    await sleep(900);
    o.importInternal = await ev(([i]) => ({ diagrams: window.ws.canvasHandle(i).getDiagrams().map((d) => d.id), tabs: window.ws.qa(i, '[role="tab"]') }), [im3.id]);
    await ev(([i]) => window.ws.unmount(i), [im3.id]);

    // ---- 10 marker navigation ----------------------------------------------------------------------------------
    const n = await mount(ce3);
    o.navTabs = await ev(([i]) => [...window.ws.it(i).mountEl.querySelectorAll('[role="tab"]')].map((x2) => x2.textContent), [n.id]);
    const body = await rect(n.id, '.djs-element[data-element-id="Sub_1"] .djs-hit-all');
    await page.mouse.click(body.x + 6, body.y + body.height - 8);
    await sleep(250);
    o.navBody = await ev(([i]) => window.ws.active(i), [n.id]);
    const drill = await rect(n.id, ".bjs-drilldown");
    await page.mouse.click(...Object.values(center(drill)));
    await sleep(400);
    o.navMarker = await ev(([i]) => ({ active: window.ws.active(i), tabSelected: window.ws.it(i).mountEl.querySelector('[role="tab"][aria-selected="true"]')?.textContent }), [n.id]);
    await ev(([i]) => window.ws.unmount(i), [n.id]);
    const nc = await mount(ce3, { customResolve: "none" });
    const d2 = await rect(nc.id, ".bjs-drilldown");
    await page.mouse.click(...Object.values(center(d2)));
    await sleep(300);
    o.navCustom = await ev(([i]) => ({ active: window.ws.active(i), resolves: window.ws.log(i).resolves }), [nc.id]);
    await ev(([i]) => window.ws.unmount(i), [nc.id]);

    // ---- 11 inert links except the badge ------------------------------------------------------------------------
    const l = await mount(ce1);
    o.links = await ev(([i]) => {
      const el = window.ws.it(i).mountEl;
      const a = document.createElement("a");
      a.href = "https://example.invalid/";
      a.textContent = "x";
      el.querySelector(".bpmn-workshop__panel").appendChild(a);
      const ev1 = new MouseEvent("click", { bubbles: true, cancelable: true });
      a.dispatchEvent(ev1);
      const badge = el.querySelector(".bjs-powered-by");
      const ev2 = new MouseEvent("click", { bubbles: true, cancelable: true });
      badge.dispatchEvent(ev2);
      // bpmn-js itself prevents the default and opens its lightbox: that it opened proves the click reached it.
      const lightbox = document.querySelectorAll(".bjs-powered-by-lightbox").length;
      document.querySelectorAll(".backdrop, .bjs-powered-by-lightbox").forEach((b) => b.remove());
      return { foreignPrevented: ev1.defaultPrevented, badgeReachedBpmnIo: lightbox === 1 };
    }, [l.id]);
    // ---- 12 custom labels, ref ------------------------------------------------------------------------------------
    await ev(([i]) => window.ws.setExtra(i, { labels: { undo: "Annuler", toolbar: "Schéma", export: "Exporter" } }), [l.id]);
    await sleep(150);
    o.labels = await ev(([i]) => ({ toolbar: window.ws.attr(i, '[role="toolbar"]', "aria-label"), undo: window.ws.attr(i, '[data-testid="bpmn-workshop-undo"]', "aria-label"), exportMenu: window.ws.text(i, '[data-testid="bpmn-workshop-export"] .bpmn-workshop-menu__label') }), [l.id]);
    o.refXml = await ev(async ([i, x1]) => (await window.ws.getXml(i)) === x1 && !!window.ws.canvasHandle(i), [l.id, ce1]);
    // ---- 13 axe on the whole page -----------------------------------------------------------------------------------
    await page.addScriptTag({ path: join(root, "node_modules/axe-core/axe.min.js") });
    o.axe = await ev(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 120) })));
    // keyboard path through the bar and tabs
    await page.evaluate(() => document.activeElement?.blur());
    const order = [];
    for (let k = 0; k < 14; k++) {
      await page.keyboard.press("Tab");
      order.push(await ev(() => { const a = document.activeElement; return a ? (a.getAttribute("data-testid") || a.getAttribute("role") || a.tagName) + ":" + (a.getAttribute("aria-label") || a.textContent?.slice(0, 12) || "") : "none"; }));
    }
    o.tabOrder = order;
    await ev(([i]) => window.ws.unmount(i), [l.id]);

    // ---- 14 StrictMode lifecycle and Shadow DOM ----------------------------------------------------------------------
    const s = await ev(async ([x1]) => {
      const host = document.getElementById("app");
      const out = [];
      for (let k = 0; k < 15; k++) {
        const m = window.ws.mount(x1, {}, { width: 600, height: 400 }, true);
        await new Promise((r2) => setTimeout(r2, 0));
        window.ws.unmount(m.id);
      }
      const keep = window.ws.mount(x1, {}, { width: 600, height: 400 }, true);
      await window.ws.ready(keep.id);
      await new Promise((r2) => setTimeout(r2, 300));
      const res = { containers: window.ws.qa(keep.id, ".djs-container"), toolbars: window.ws.qa(keep.id, '[role="toolbar"]'), strayHosts: host.querySelectorAll(".bpmn-workshop").length };
      window.ws.unmount(keep.id);
      return res;
    }, [ce1]);
    o.strict = s;
    const sh = await mount(ce5, {}, { width: 900, height: 560 }, false, true);
    await page.locator('[role="tab"]').nth(1).click();
    await sleep(250);
    await page.locator('[data-testid="bpmn-workshop-export"] button').first().click();
    o.shadow = await ev(([i]) => ({ active: window.ws.active(i), menuOpen: window.ws.attr(i, '.bpmn-workshop-menu__trigger[aria-expanded="true"]', "aria-expanded"), styled: window.ws.it(i).host.shadowRoot.querySelectorAll("style[data-bpmn-canvas-styles]").length }), [sh.id]);
    return o;
  });

  await t.test("structure: toolbar, labelled buttons, menus, tabs, tabpanel, one container, badge", () => {
    const s = o.structure;
    assert.equal(s.toolbar, "Diagram");
    assert.deepEqual(s.buttons, ["Undo", "Redo", "Zoom out", "Zoom in", "Auto-layout", "Import"]);
    assert.deepEqual(s.menus, ["Fit", "Export"]);
    assert.equal(s.formatMenuHidden, true, "a single format hides the switch");
    assert.deepEqual(s.tabs.map((x) => x[0]), ["Exchange", "Other"]);
    assert.deepEqual(s.tabs.map((x) => [x[1], x[2]]), [["true", "0"], ["false", "-1"]]);
    assert.equal(s.panelLabelledBy, s.activeTabId);
    assert.equal(s.containers, 1);
    assert.deepEqual(s.badge, { href: "http://bpmn.io", visible: true });
  });
  await t.test("tabs: click selects and shows that diagram; arrows move and wrap", () => {
    assert.equal(o.tabClick.active, "DiagB");
    assert.equal(o.tabClick.showsB, true);
    assert.equal(o.tabClick.showsA, false);
    assert.deepEqual(o.tabClick.sel, ["false", "true"]);
    assert.equal(o.tabWrap, "DiagA", "ArrowRight from the last tab wraps to the first");
    assert.equal(o.tabWrapBack, "DiagB", "ArrowLeft from the first tab wraps to the last");
  });
  await t.test("a gesture edit reports the whole document with its revision; the echo keeps undo", () => {
    assert.deepEqual(o.historyAtStart, [true, true]);
    assert.equal(o.edit.hasName, true);
    assert.equal(o.edit.cause, "edit");
    assert.equal(o.edit.revision, true);
    assert.equal(o.edit.undoDisabled, false);
    assert.equal(o.echoKeptUndo, true);
  });
  await t.test("undo and redo buttons act on the document and follow the history", () => {
    assert.deepEqual(o.afterUndo, { redoDisabled: false, xmlHasName: false });
    assert.equal(o.afterRedo, true);
  });
  await t.test("fit menu and zoom buttons", () => {
    assert.ok(Math.abs(o.zoom100 - 1) < 0.01, String(o.zoom100));
    assert.ok(o.zoomIn > o.zoom100);
    assert.ok(o.zoomOut < o.zoomIn);
  });
  await t.test("auto-layout is one change with cause layout; a failure notifies the host and shows an alert that can be dismissed", () => {
    assert.equal(o.layout.cause, "layout");
    assert.equal(o.layout.added, 1);
    assert.deepEqual(o.layoutFailure.errors, ["boom"]);
    assert.equal(o.layoutFailure.alert.startsWith("The auto-layout failed"), true);
    assert.equal(o.noticeDismissed, 0);
  });
  await t.test("busy: veil with status role, disabled toolbar, inert canvas, palette hidden, no edit gets through; releasing it restores editing", () => {
    assert.equal(o.busy.veil, "The diagram is being updated");
    assert.ok(o.busy.disabled.length >= 6 && o.busy.disabled.every(Boolean), JSON.stringify(o.busy.disabled));
    assert.equal(o.busy.inert, true);
    assert.equal(o.busy.paletteDisplay, "none");
    assert.equal(o.busy.readOnly, true);
    assert.equal(o.busyBytes, true);
    assert.deepEqual(o.busyOff, { veil: false, readOnly: false });
  });
  await t.test("format switch: menu radio, look changes live, document and tab kept, undo lost, host notified; controlled mode follows the prop", () => {
    assert.equal(o.format.legend, true);
    assert.equal(o.format.xml, true);
    assert.equal(o.format.canUndo, false);
    assert.equal(o.format.containers, 1);
    assert.deepEqual(o.format.onFormatChange, ["leg"]);
    assert.equal(o.format.triggerText.trim(), "Legend");
    assert.equal(o.formatColored.legend, 0, "the colored look is not the legend look");
    assert.equal(o.formatControlled, true);
    assert.equal(o.formatControlledBack, 0);
  });
  await t.test("export: BPMN returns the exact bytes; Draw.io and Sparx carry their fidelity notices, shown to the user", () => {
    assert.deepEqual(o.exports.map((d) => d.filename), ["diagram.bpmn", "diagram.drawio", "diagram.sparx.xml"]);
    assert.equal(o.exportBpmnSame, true);
    assert.deepEqual(o.exports.map((d) => d.fidelity), [[], ["projection"], ["interchange-only"]]);
    assert.ok(o.exportNotices.length >= 2 && o.exportNotices.every((n) => n[0] === "status"));
    assert.match(o.exportNotices[0][1], /projection/i);
  });
  await t.test("export that must be refused downloads nothing and shows an alert with the reason", () => {
    assert.equal(o.exportRefused.downloads, 0);
    assert.match(o.exportRefused.alert, /Export failed: .*does not support/);
  });
  await t.test("import: native BPMN unchanged to onImport; Draw.io projected with notices; invalid file is an alert; without onImport it is applied", () => {
    assert.deepEqual(o.importNative.map((x) => [x.projected, x.fidelity]), [[false, []]]);
    assert.equal(o.importNativeSame, true);
    assert.equal(o.importDrawio.imports[0][0], true);
    assert.deepEqual(o.importDrawio.imports[0][1], ["ids-regenerated", "di-regenerated", "data-links-as-associations", "labels-reduced-to-text"]);
    assert.ok(o.importDrawio.notices.length >= 4);
    assert.equal(o.importBad.imports, 1, "the invalid file did not reach onImport");
    assert.match(o.importBad.alert, /Import failed: Draw\.io has no supported pages/);
    assert.deepEqual(o.importInternal.diagrams.length, 1);
    assert.equal(o.importInternal.tabs, 1);
  });
  await t.test("navigation: a body click does nothing; the marker opens the diagram of the same name; a custom resolver is consulted and can refuse", () => {
    assert.deepEqual(o.navTabs, ["Main", "Sub"]);
    assert.equal(o.navBody, "BD1");
    assert.equal(o.navMarker.active, "BD2");
    assert.equal(o.navMarker.tabSelected, "Sub");
    assert.equal(o.navCustom.active, "BD1");
    assert.equal(o.navCustom.resolves.length, 1);
    assert.deepEqual({ id: o.navCustom.resolves[0].click.id, marker: o.navCustom.resolves[0].click.marker, active: o.navCustom.resolves[0].active }, { id: "Sub_1", marker: true, active: "BD1" });
  });
  await t.test("links inside the editor are inert, except the bpmn.io badge", () => {
    assert.deepEqual(o.links, { foreignPrevented: true, badgeReachedBpmnIo: true });
  });
  await t.test("labels come from props; the ref gives the document and the canvas handle", () => {
    assert.deepEqual({ ...o.labels, exportMenu: o.labels.exportMenu.trim() }, { toolbar: "Schéma", undo: "Annuler", exportMenu: "Exporter" });
    assert.equal(o.refXml, true);
  });
  await t.test("axe on the whole page: no serious or critical violation; the bar and tabs are reachable by keyboard", () => {
    const bad = o.axe.filter((v) => v.impact === "serious" || v.impact === "critical");
    assert.deepEqual(bad, [], JSON.stringify(bad));
    const joined = o.tabOrder.join(" | ");
    for (const needle of ["bpmn-workshop-zoom-out", "bpmn-workshop-zoom-in", "bpmn-workshop-import"]) assert.ok(joined.includes(needle), `${needle} in ${joined}`);
    assert.ok(o.tabOrder.some((x) => x.startsWith("tab:")), `a tab is reached: ${joined}`);
    assert.ok(o.tabOrder.some((x) => x.includes("Auto-layout")), "the auto-layout button is reached");
  });
  await t.test("StrictMode: no stray container after 15 mount/unmount cycles", () => {
    assert.deepEqual(o.strict, { containers: 1, toolbars: 1, strayHosts: 1 });
  });
  await t.test("Shadow DOM: tabs, menu and styles work inside a shadow root", () => {
    assert.equal(o.shadow.active, "DiagB");
    assert.equal(o.shadow.menuOpen, "true");
    assert.equal(o.shadow.styled, 1);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
