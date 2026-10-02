import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(root + "src/styles/workshop.css", "utf8");
const axePath = root + "node_modules/axe-core/axe.min.js";

test("workshop primitives (menu, tabs) in a real browser", { timeout: 300000 }, async (t) => {
  const { result: R, consoleLines } = await runInBrowser(root + "tests/browser/page-ui.mjs", "ui", async (page) => {
    const r = [];
    const check = (name, pass, detail) => r.push({ name, pass: !!pass, detail: detail ?? null });
    await page.addStyleTag({ content: css });
    await page.setViewportSize({ width: 900, height: 700 });
    const sleep = (ms) => page.waitForTimeout(ms);
    const trig = (id) => page.locator(`[data-testid="${id}"] .bpmn-workshop-menu__trigger`);
    const expanded = async (id) => (await trig(id).getAttribute("aria-expanded")) === "true";
    const active = () => page.evaluate(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a ? ((a.querySelector(".bpmn-workshop-menu__item-label")?.textContent ?? a.textContent) ?? "").trim().replace(/\s+/g, " ") + "|" + (a.getAttribute("role") ?? a.tagName) : null; });
    const activeLabel = async () => ((await active()) ?? "").split("|")[0].split(" ")[0];
    const log = () => page.evaluate(() => window.__log.slice());
    const clear = () => page.evaluate(() => { window.__log.length = 0; });
    const open = async (id) => { await trig(id).focus(); await page.keyboard.press("Enter"); await sleep(60); };
    const esc = async () => { await page.keyboard.press("Escape"); await sleep(60); };

    // ---- ARIA wiring ---------------------------------------------------------------------
    const w = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="menu-a"] .bpmn-workshop-menu__trigger');
      const popup = document.getElementById(t.getAttribute("aria-controls"));
      const items = [...popup.querySelectorAll('[role^="menuitem"]')];
      const b = [...document.querySelectorAll('[data-testid="menu-b"] [role="menuitemradio"]')];
      return { haspopup: t.getAttribute("aria-haspopup"), expanded: t.getAttribute("aria-expanded"), popupRole: popup?.getAttribute("role"), popupHidden: popup?.hidden, popupLabel: popup?.getAttribute("aria-label"), roles: items.map((i) => i.getAttribute("role")), disabled: items.map((i) => i.getAttribute("aria-disabled")), radio: b.map((i) => [i.textContent.trim(), i.getAttribute("aria-checked")]), desc: items[0].textContent.includes("First item"), ariaLabel: t.getAttribute("aria-label"), type: t.type };
    });
    check("trigger: aria-haspopup=menu, aria-expanded=false, aria-controls resolves to a hidden role=menu with a name", w.haspopup === "menu" && w.expanded === "false" && w.popupRole === "menu" && w.popupHidden === true && w.popupLabel === "Actions menu" && w.ariaLabel === "Actions menu" && w.type === "button", w);
    check("items: menuitem roles, the disabled one is aria-disabled, the description is rendered", w.roles.every((x) => x === "menuitem") && w.disabled.join() === ",true,," && w.desc, w);
    check("radio items: menuitemradio with aria-checked", w.radio.join("|") === "Light,true|Dark,false", w.radio);
    const ids = await page.evaluate(() => { const all = []; const walk = (root) => { for (const el of root.querySelectorAll("[id]")) all.push(el.id); for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot); }; walk(document); return { total: all.length, unique: new Set(all).size }; });
    check("ids are unique across all instances, including the shadow root", ids.total === ids.unique && ids.total > 10, ids);

    // ---- opening ---------------------------------------------------------------------------
    await open("menu-a");
    check("Enter on the trigger opens and focuses the first enabled item", (await expanded("menu-a")) && (await activeLabel()) === "Alpha", await active());
    await esc();
    check("Escape closes and returns focus to the trigger", !(await expanded("menu-a")) && (await active()).includes("Actions"), await active());
    await trig("menu-a").focus(); await page.keyboard.press(" "); await sleep(60);
    check("Space on the trigger opens", (await expanded("menu-a")) && (await activeLabel()) === "Alpha");
    await esc();
    await trig("menu-a").focus(); await page.keyboard.press("ArrowDown"); await sleep(60);
    check("ArrowDown on the trigger opens on the first item", (await expanded("menu-a")) && (await activeLabel()) === "Alpha");
    await esc();
    await trig("menu-a").focus(); await page.keyboard.press("ArrowUp"); await sleep(60);
    check("ArrowUp on the trigger opens on the last item", (await expanded("menu-a")) && (await activeLabel()) === "Delta", await active());

    // ---- navigation ------------------------------------------------------------------------
    await esc(); await open("menu-a");
    const seq = [];
    for (const k of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "Home", "End"]) { await page.keyboard.press(k); await sleep(40); seq.push(await activeLabel()); }
    check("ArrowDown/ArrowUp wrap and skip the disabled item; Home and End", seq.join() === "Charlie,Delta,Alpha,Delta,Alpha,Delta", seq);

    // ---- typeahead ------------------------------------------------------------------------
    await page.keyboard.press("Home"); await sleep(40);
    const ta = [];
    for (const k of ["d", "c", "a"]) { await page.keyboard.press(k); await sleep(700); ta.push(await activeLabel()); }
    await page.keyboard.press("b"); await sleep(100);
    ta.push(await activeLabel());
    check("typing a character jumps to the next item starting with it, never to a disabled one", ta.join() === "Delta,Charlie,Alpha,Alpha", ta);

    // ---- activation -------------------------------------------------------------------------
    await clear();
    await page.keyboard.press("ArrowDown"); await sleep(40); // Charlie
    await page.keyboard.press("Enter"); await sleep(80);
    check("Enter activates, closes, and returns focus to the trigger", (await log()).join() === "A:Charlie" && !(await expanded("menu-a")) && (await active()).includes("Actions"), [await log(), await active()]);
    await clear(); await open("menu-a"); await page.keyboard.press("Space"); await sleep(80);
    check("Space activates the focused item", (await log()).join() === "A:Alpha" && !(await expanded("menu-a")), await log());
    await clear(); await open("menu-a");
    await page.locator('[data-testid="menu-a"] [role="menuitem"]', { hasText: "Beta" }).click({ force: true });
    await sleep(60);
    check("a click on a disabled item does nothing and keeps the menu open", (await log()).length === 0 && (await expanded("menu-a")), await log());
    await esc();

    // ---- closing ----------------------------------------------------------------------------
    await open("menu-a"); await page.keyboard.press("Tab"); await sleep(80);
    const afterTab = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="menu-a"]'));
    check("Tab closes the menu and moves on from the trigger", !(await expanded("menu-a")) && !afterTab, await active());
    await trig("menu-a").click(); await sleep(60);
    check("a pointer click opens", await expanded("menu-a"));
    await trig("menu-a").click(); await sleep(60);
    check("a second click closes", !(await expanded("menu-a")));
    await trig("menu-a").click(); await sleep(60);
    await page.locator("#after").click(); await sleep(60);
    check("a click outside closes", !(await expanded("menu-a")));
    await trig("menu-a").click(); await sleep(60);
    await page.locator("#plain-area").click(); await sleep(60);
    check("a click on a non-focusable area outside closes", !(await expanded("menu-a")));
    await clear(); await trig("menu-a").click(); await sleep(60);
    await page.locator('[data-testid="menu-a"] [role="menuitem"]', { hasText: "Alpha" }).click(); await sleep(80);
    check("a click on an item activates it and closes", (await log()).join() === "A:Alpha" && !(await expanded("menu-a")), await log());
    await trig("menu-c").click({ force: true, timeout: 2000 }).catch(() => undefined); await sleep(60);
    check("a disabled menu cannot be opened", (await trig("menu-c").isDisabled()) && !(await expanded("menu-c")));

    // ---- radio ------------------------------------------------------------------------------
    await clear(); await open("menu-b"); await page.keyboard.press("ArrowDown"); await sleep(40); await page.keyboard.press("Enter"); await sleep(80);
    const rb = await page.evaluate(() => [...document.querySelectorAll('[data-testid="menu-b"] [role="menuitemradio"]')].map((i) => [i.textContent.trim(), i.getAttribute("aria-checked")]));
    check("selecting a radio item updates aria-checked", (await log()).join() === "B:dark" && rb.join("|") === "Light,false|Dark,true", rb);

    // ---- viewport ---------------------------------------------------------------------------
    await open("menu-e");
    const er = await page.evaluate(() => { const p = document.querySelector('[data-testid="menu-e"] [role="menu"]').getBoundingClientRect(); return { left: p.left, right: p.right, vw: document.documentElement.clientWidth }; });
    check("a popup near the right edge stays inside the viewport", er.right <= er.vw - 7 && er.left >= 0, er);
    await esc();

    // ---- shadow DOM -------------------------------------------------------------------------
    const sTrig = page.locator("#shadow-host .bpmn-workshop-menu__trigger");
    await sTrig.click(); await sleep(60);
    check("a menu inside a shadow root opens and focuses its first item", (await sTrig.getAttribute("aria-expanded")) === "true" && (await activeLabel()) === "One", await active());
    await page.locator("#shadow-outside").click(); await sleep(60);
    check("a click elsewhere in the shadow root closes it", (await sTrig.getAttribute("aria-expanded")) === "false");
    await sTrig.click(); await sleep(60);
    await page.locator("#plain-area").click(); await sleep(60);
    check("a click in the light DOM closes a shadow menu", (await sTrig.getAttribute("aria-expanded")) === "false");
    await sTrig.focus(); await page.keyboard.press("ArrowDown"); await sleep(40); await page.keyboard.press("ArrowDown"); await sleep(40); await clear(); await page.keyboard.press("Enter"); await sleep(80);
    check("keyboard works inside the shadow root", (await log()).join() === "S:Two", await log());

    // ---- tabs --------------------------------------------------------------------------------
    const tw = await page.evaluate(() => {
      const list = document.querySelector('#tabs-a [role="tablist"]');
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      const listB = document.querySelector('#tabs-b [role="tablist"]');
      const tabsB = [...listB.querySelectorAll('[role="tab"]')];
      const long = tabs[2];
      const label = long.querySelector(".bpmn-workshop-tabs__label");
      return {
        name: list.getAttribute("aria-label"), count: tabs.length,
        selected: tabs.map((x) => x.getAttribute("aria-selected")),
        tabindex: tabs.map((x) => x.getAttribute("tabindex")),
        controls: tabs.map((x) => x.getAttribute("aria-controls")),
        ids: [...tabs, ...tabsB].map((x) => x.id),
        panelExists: !!document.getElementById("panel-wa"),
        longTitle: long.title, longText: label.textContent, truncated: label.scrollWidth > label.clientWidth, overflow: getComputedStyle(label).textOverflow, longWidth: long.getBoundingClientRect().width,
        emptyTabs: document.querySelectorAll('#tabs-empty [role="tab"]').length, emptyList: !!document.querySelector('#tabs-empty [role="tablist"]'), emptyName: document.querySelector('#tabs-empty [role="tablist"]')?.getAttribute("aria-label"),
      };
    });
    check("tablist has a name; exactly one tab is selected; roving tabindex; aria-controls points at the panel", tw.name === "Diagrams wa" && tw.selected.join() === "true,false,false" && tw.tabindex.join() === "0,-1,-1" && tw.controls.every((c) => c === "panel-wa") && tw.panelExists, tw);
    check("tab ids are unique across two instances that share tab ids", new Set(tw.ids).size === tw.ids.length && tw.ids.includes("wa-tab-one") && tw.ids.includes("wb-tab-one"), tw.ids);
    check("a long label is truncated with an ellipsis and keeps its full text in the title", tw.truncated && tw.overflow === "ellipsis" && tw.longTitle === tw.longText && tw.longWidth <= 222, tw);
    check("empty tabs render an empty tablist", tw.emptyList && tw.emptyTabs === 0 && tw.emptyName === "Empty", tw);
    await clear();
    await page.locator("#wa-tab-two").click(); await sleep(60);
    check("a click selects a tab", (await log()).join() === "wa:select:two" && (await page.locator("#wa-tab-two").getAttribute("aria-selected")) === "true");
    const tseq = [];
    for (const k of ["ArrowRight", "ArrowRight", "ArrowLeft", "Home", "ArrowLeft", "End"]) {
      await page.keyboard.press(k); await sleep(60);
      tseq.push(await page.evaluate(() => document.activeElement?.id + ":" + document.activeElement?.getAttribute("aria-selected")));
    }
    check("arrows move focus AND selection, wrap at both ends, Home/End", tseq.join() === "wa-tab-three:true,wa-tab-one:true,wa-tab-three:true,wa-tab-one:true,wa-tab-three:true,wa-tab-three:true", tseq);
    await page.keyboard.press("Tab"); await sleep(40);
    const out = await page.evaluate(() => !document.activeElement?.closest('#tabs-a'));
    check("Tab leaves the tablist: only the selected tab is in the tab order", out, await active());

    // ---- axe ----------------------------------------------------------------------------------
    await page.addScriptTag({ path: axePath });
    await open("menu-a");
    const axe = await page.evaluate(async () => { const res = await window.axe.run(document, { resultTypes: ["violations"] }); return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 120) })); });
    const bad = axe.filter((v) => v.impact === "serious" || v.impact === "critical");
    check("axe: no serious or critical violation with a menu open and both primitives on the page", bad.length === 0, bad);
    r.axeAll = axe;
    await esc();

    // ---- contrast -----------------------------------------------------------------------------
    const contrast = async (scheme) => {
      await page.emulateMedia({ colorScheme: scheme });
      return page.evaluate(() => {
        const el = document.querySelector(".bpmn-workshop-menu");
        const cs = getComputedStyle(el);
        const v = (n) => cs.getPropertyValue(n).trim();
        const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const bg = v("--bpmn-workshop-bg"), hover = v("--bpmn-workshop-hover");
        return { fg: ratio(v("--bpmn-workshop-fg"), bg), muted: ratio(v("--bpmn-workshop-muted"), bg), mutedOnHover: ratio(v("--bpmn-workshop-muted"), hover), fgOnHover: ratio(v("--bpmn-workshop-fg"), hover), accent: ratio(v("--bpmn-workshop-accent"), bg), focus: ratio(v("--bpmn-workshop-focus"), bg), border: ratio(v("--bpmn-workshop-border"), bg) };
      });
    };
    const light = await contrast("light"), dark = await contrast("dark");
    r.contrast = { light, dark };
    for (const [scheme, c] of [["light", light], ["dark", dark]]) {
      check(`contrast ${scheme}: text >= 4.5 (fg, muted, on hover); focus, border, accent >= 3`, c.fg >= 4.5 && c.muted >= 4.5 && c.mutedOnHover >= 4.5 && c.fgOnHover >= 4.5 && c.focus >= 3 && c.border >= 3 && c.accent >= 3, c);
    }
    return r;
  });

  const checks = R.filter((x) => x.name);
  for (const c of checks) await t.test(c.name, () => assert.ok(c.pass, JSON.stringify(c.detail)));
  t.diagnostic(`axe violations (all impacts): ${JSON.stringify(R.axeAll)}`);
  t.diagnostic(`contrast: ${JSON.stringify(R.contrast)}`);
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
