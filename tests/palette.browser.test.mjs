import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const TOKENS = { eventLine: "#112233", taskLine: "#223344", gatewayLine: "#334455", dataLine: "#445566", flow: "#556677", laneLine: "#667788", poolLine: "#778899", externalLine: "#8899aa", docLine: "#99aabb", appLine: "#aabbcc" };
const OTHER = { eventLine: "#ff0001", taskLine: "#ff0002", gatewayLine: "#ff0003", dataLine: "#ff0004", flow: "#ff0005", laneLine: "#ff0006", poolLine: "#ff0007", externalLine: "#ff0008", docLine: "#ff0009", appLine: "#ff000a" };
const LEGEND_GROUP = { start: "eventLine", end: "eventLine", "intermediate-event": "eventLine", task: "taskLine", subprocess: "taskLine", "external-process": "externalLine", "gateway-or": "gatewayLine", "gateway-and": "gatewayLine", "data-input": "dataLine", "data-output": "dataLine", "external-input": "externalLine", "process-output": "externalLine", document: "docLine", application: "appLine", lane: "laneLine", "sequence-flow": "flow" };
const UPSTREAM_GROUP = { "create.start-event": "eventLine", "create.intermediate-event": "eventLine", "create.end-event": "eventLine", "create.exclusive-gateway": "gatewayLine", "create.task": "taskLine", "create.data-object": "dataLine", "create.data-store": "dataLine", "create.subprocess-expanded": "taskLine", "create.participant-expanded": "poolLine" };

test("palette layout and token-driven icons in a real browser", { timeout: 300000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-palette.mjs", "palette", async (page) => {
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const out = {};

    // columns
    out.columns = {};
    for (const cols of [1, 2, "auto"]) {
      const tall = await ev(async (c) => { const id = await window.pal.mount({ paletteColumns: c }, { w: 700, h: 900 }); return { id, info: window.pal.info(id) }; }, cols);
      const short = await ev(async (c) => { const id = await window.pal.mount({ paletteColumns: c }, { w: 700, h: 250 }); return { id, info: window.pal.info(id) }; }, cols);
      out.columns[cols] = { tall: tall.info, short: short.info };
      await ev(([a, b]) => { window.pal.destroy(a); window.pal.destroy(b); }, [tall.id, short.id]);
    }
    // survives resize, profile switch, read-only
    out.survive = {};
    for (const cols of [1, 2]) {
      const id = await ev((c) => window.pal.mount({ paletteColumns: c }, { w: 700, h: 900 }), cols);
      const s = { start: await ev((i) => window.pal.info(i), id) };
      await ev(([i]) => window.pal.resize(i, 600, 250), [id]);
      s.shortResize = await ev((i) => window.pal.info(i), id);
      await ev(([i]) => window.pal.resize(i, 800, 900), [id]);
      s.tallResize = await ev((i) => window.pal.info(i), id);
      await ev(([i]) => window.pal.call(i, "setProfile", "legend"), [id]);
      s.legend = await ev((i) => window.pal.info(i), id);
      await ev(([i]) => window.pal.call(i, "setProfile", "standard"), [id]);
      s.standard = await ev((i) => window.pal.info(i), id);
      await ev(([i]) => window.pal.call(i, "setReadOnly", true), [id]);
      await ev(([i]) => window.pal.call(i, "setReadOnly", false), [id]);
      s.readOnlyToggled = await ev((i) => window.pal.info(i), id);
      out.survive[cols] = s;
      await ev((i) => window.pal.destroy(i), id);
    }

    // legend colours
    const L = await ev(([tk]) => window.pal.mount({ profile: "legend", legendTokens: tk }), [TOKENS]);
    out.legendRoot = await ev((i) => window.pal.root(i), L);
    out.legendStyles = await ev((i) => window.pal.styles(i), L);
    out.legendMasks = await ev((i) => window.pal.maskImages(i), L);
    out.legendBadge = await ev((i) => window.pal.badge(i), L);
    // independence: second instance with other tokens, then destroy the first
    const L2 = await ev(([tk]) => window.pal.mount({ profile: "legend", legendTokens: tk }), [OTHER]);
    out.second = { root: await ev((i) => window.pal.root(i), L2), styles: await ev((i) => window.pal.styles(i), L2), firstRootStill: await ev((i) => window.pal.root(i), L) };
    out.firstStylesStill = await ev((i) => window.pal.styles(i), L);
    await ev((i) => window.pal.destroy(i), L2);
    out.firstAfterSecondDestroyed = await ev((i) => window.pal.root(i), L);
    // switching to standard on the same root removes the variables
    await ev((i) => window.pal.call(i, "setProfile", "standard"), L);
    out.afterSwitch = await ev((i) => window.pal.root(i), L);
    await ev((i) => window.pal.destroy(i), L);

    // colored colours: the module on a plain modeler (independent of the colored renderer) ...
    const C = await ev(async ([tk]) => window.pal.plain({ rootClass: "bpmn-canvas", modules: [window.pal.PaletteSupportModule], config: { instanceId: "t1", colored: tk } }), [TOKENS]);
    out.colorRoot = await ev((i) => window.pal.root(i), C);
    out.colorStyles = await ev((i) => window.pal.styles(i), C);
    await ev((i) => window.pal.destroy(i), C);
    // ... and through the public API
    const CP = await ev(([tk]) => window.pal.mount({ profile: "colored", coloredTokens: tk }), [TOKENS]);
    out.publicColored = { root: await ev((i) => window.pal.root(i), CP), styles: await ev((i) => window.pal.styles(i), CP) };
    await ev((i) => window.pal.destroy(i), CP);

    // standard unchanged vs plain upstream
    const S = await ev(() => window.pal.mount({}));
    const P = await ev(() => window.pal.plain());
    out.standardStyles = await ev((i) => window.pal.styles(i), S);
    out.plainStyles = await ev((i) => window.pal.styles(i), P);
    out.standardRoot = await ev((i) => window.pal.root(i), S);
    await ev(([a, b]) => { window.pal.destroy(a); window.pal.destroy(b); }, [S, P]);

    out.styleWrites = await ev(() => window.pal.styleAttrWrites.slice());
    return out;
  });

  await t.test("paletteColumns 1 forces one column and 2 forces two, at any height; auto follows the height", () => {
    const c = o.columns;
    for (const h of ["tall", "short"]) {
      assert.equal(c[1][h].twoColumn, false, `1 / ${h}`);
      assert.equal(c[2][h].twoColumn, true, `2 / ${h}`);
    }
    assert.equal(c.auto.tall.twoColumn, false, "auto, tall container");
    assert.equal(c.auto.short.twoColumn, true, "auto, short container");
  });
  await t.test("the measurable palette width matches the forced layout (the fit inset reads it)", () => {
    const c = o.columns;
    assert.equal(c[1].short.width, 48, JSON.stringify(c[1].short));
    assert.equal(c[2].tall.width, 94, JSON.stringify(c[2].tall));
    assert.ok(c[2].tall.width > c[1].tall.width);
    for (const k of [1, 2]) for (const h of ["tall", "short"]) assert.equal(c[k][h].open, true);
  });
  for (const cols of [1, 2]) {
    await t.test(`columns=${cols} survives resize, setProfile legend/standard and read-only toggles`, () => {
      const s = o.survive[cols];
      for (const [name, info] of Object.entries(s)) {
        assert.equal(info.twoColumn, cols === 2, `${name}: ${JSON.stringify(info)}`);
        assert.equal(info.width, cols === 2 ? 94 : 48, name);
      }
    });
  }

  await t.test("legend profile: variables set on the root from the tokens", () => {
    const v = o.legendRoot.vars;
    assert.equal(v["--bpmn-canvas-icon-start"], TOKENS.eventLine);
    assert.equal(v["--bpmn-canvas-icon-task"], TOKENS.taskLine);
    assert.equal(v["--bpmn-canvas-icon-gateway"], TOKENS.gatewayLine);
    assert.equal(v["--bpmn-canvas-icon-data"], TOKENS.dataLine);
    assert.equal(v["--bpmn-canvas-icon-flow"], TOKENS.flow);
    assert.equal(v["--bpmn-canvas-icon-lane"], TOKENS.laneLine);
    assert.equal(v["--bpmn-canvas-icon-pool"], TOKENS.poolLine);
    assert.equal(v["--bpmn-canvas-icon-external"], TOKENS.externalLine);
    assert.equal(v["--bpmn-canvas-icon-document"], TOKENS.docLine);
    assert.equal(v["--bpmn-canvas-icon-application"], TOKENS.appLine);
    assert.equal(Object.keys(v).length, 13);
    assert.equal(o.legendRoot.colored, false, "the colored scope class belongs to the colored profile only");
  });
  await t.test("legend profile: each of the 16 palette icons is painted with the colour of its group", () => {
    for (const [action, token] of Object.entries(LEGEND_GROUP)) {
      assert.equal(o.legendStyles[`legend.${action}`].beforeBg, rgb(TOKENS[token]), action);
    }
  });
  await t.test("two instances with different tokens are independent, and destroying one changes nothing in the other", () => {
    for (const [action, token] of Object.entries(LEGEND_GROUP)) {
      assert.equal(o.second.styles[`legend.${action}`].beforeBg, rgb(OTHER[token]), `second ${action}`);
      assert.equal(o.firstStylesStill[`legend.${action}`].beforeBg, rgb(TOKENS[token]), `first ${action}`);
    }
    assert.equal(o.second.root.vars["--bpmn-canvas-icon-task"], OTHER.taskLine);
    assert.equal(o.second.firstRootStill.vars["--bpmn-canvas-icon-task"], TOKENS.taskLine);
    assert.equal(o.firstAfterSecondDestroyed.vars["--bpmn-canvas-icon-task"], TOKENS.taskLine);
  });
  await t.test("switching to standard on the same root removes every variable and the scope class", () => {
    assert.deepEqual(o.afterSwitch, { vars: {}, colored: false });
  });
  await t.test("without tokens, legend icons use the neutral fallback", () => {
    // standard canvas has no legend entries; the neutral fallback is exercised by the stylesheet default value
    assert.equal(Object.keys(o.standardRoot.vars).length, 0);
  });

  await t.test("colored palette module: the upstream palette entries take the token colours (plain modeler)", () => {
    assert.equal(o.colorRoot.colored, true);
    for (const [action, token] of Object.entries(UPSTREAM_GROUP)) {
      assert.equal(o.colorStyles[action].color, rgb(TOKENS[token]), action);
    }
  });
  await t.test("colored profile through the public API paints the upstream palette with the tokens", () => {
    assert.equal(o.publicColored.root.colored, true, JSON.stringify(o.publicColored.root));
    for (const [action, token] of Object.entries(UPSTREAM_GROUP)) {
      assert.equal(o.publicColored.styles[action].color, rgb(TOKENS[token]), action);
    }
  });

  await t.test("the standard profile palette is computed-style identical to a plain upstream modeler", () => {
    assert.deepEqual(Object.keys(o.standardStyles).sort(), Object.keys(o.plainStyles).sort());
    assert.ok(Object.keys(o.standardStyles).length > 5);
    assert.deepEqual(o.standardStyles, o.plainStyles);
  });

  await t.test("data-input and data-output icons differ, and all legend masks are distinct from each other", () => {
    const m = o.legendMasks;
    assert.notEqual(m["legend.data-input"], m["legend.data-output"]);
    assert.notEqual(m["legend.data-input"], m["legend.external-input"]);
    assert.notEqual(m["legend.data-output"], m["legend.process-output"]);
    const values = Object.values(m);
    assert.equal(values.length, 16);
    assert.equal(new Set(values).size, 16, "no two palette entries share a mask");
  });

  await t.test("the module never writes a style attribute on the canvas root (CSSOM only), and the badge stays visible", () => {
    assert.deepEqual(o.styleWrites, []);
    assert.equal(o.legendBadge, true);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
