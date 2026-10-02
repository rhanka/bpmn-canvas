import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const xml = readFileSync(root + "tests/fixtures/layout/boundary.bpmn", "utf8");

test("boundary events follow their host in autoLayout, in one command", { timeout: 200000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-v02.mjs", "layout-boundary", async (page) => {
    const m = await page.evaluate(([x]) => window.v02.mount(x), [xml]);
    const probe = () =>
      page.evaluate(([i]) => {
        const mod = window.v02.get(i).handle.modeler;
        const r = mod.get("elementRegistry");
        const g = (e) => ({ x: e.x, y: e.y, w: e.width, h: e.height });
        const pts = (e) => e.waypoints.map((p) => [p.x, p.y]);
        return { Work: g(r.get("Work")), Timer: g(r.get("Timer")), Esc: g(r.get("Esc")), Handle: g(r.get("Handle")), FB: pts(r.get("FB")), diDiag: window.v02.get(i).log.diagnostics.map((d) => d.code) };
      }, [m.id]);
    const out = { before: await probe() };
    out.beforeXml = await page.evaluate(([i]) => window.v02.get(i).handle.modeler.saveXML({ format: true }).then((r) => r.xml), [m.id]);
    out.res = await page.evaluate(([i]) => window.v02.call(i, "autoLayout"), [m.id]);
    out.after = await probe();
    out.savedXml = await page.evaluate(([i]) => window.v02.call(i, "getXml"), [m.id]);
    out.res2 = await page.evaluate(([i]) => window.v02.call(i, "autoLayout"), [m.id]);
    await page.evaluate(([i]) => window.v02.call(i, "undo"), [m.id]);
    out.afterUndoXml = await page.evaluate(([i]) => window.v02.call(i, "getXml"), [m.id]);
    out.canUndoAfterOne = await page.evaluate(([i]) => window.v02.call(i, "canUndo"), [m.id]);
    return out;
  });

  const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  const onBorder = (e, h) => {
    const [cx, cy] = centre(e);
    const d = [Math.abs(cx - h.x), Math.abs(cx - (h.x + h.w)), Math.abs(cy - h.y), Math.abs(cy - (h.y + h.h))];
    return Math.min(...d) <= 1 && cx >= h.x - 1 && cx <= h.x + h.w + 1 && cy >= h.y - 1 && cy <= h.y + h.h + 1;
  };

  await t.test("the host really moved and was resized, so the test is not vacuous", () => {
    assert.notDeepEqual(o.after.Work, o.before.Work);
    assert.ok(o.res.changed > 0);
  });
  await t.test("nothing the layout moved is silently skipped: the boundary events and their flow are placed", () => {
    assert.deepEqual(o.res.skipped, []);
    assert.deepEqual(o.after.diDiag.filter((c) => c === "layout-unsupported"), []);
  });
  await t.test("the timer stays on the bottom border at the same fraction, the escalation on the right border at the same fraction", () => {
    assert.ok(onBorder(o.before.Timer, o.before.Work), "before: on the border");
    assert.ok(onBorder(o.after.Timer, o.after.Work), JSON.stringify([o.after.Timer, o.after.Work]));
    assert.ok(onBorder(o.after.Esc, o.after.Work), JSON.stringify([o.after.Esc, o.after.Work]));
    const [tx, ty] = centre(o.after.Timer);
    assert.ok(Math.abs(ty - (o.after.Work.y + o.after.Work.h)) <= 1, "bottom side");
    assert.ok(Math.abs((tx - o.after.Work.x) / o.after.Work.w - 0.5) < 0.02, "fraction 0.5");
    const [ex, ey] = centre(o.after.Esc);
    assert.ok(Math.abs(ex - (o.after.Work.x + o.after.Work.w)) <= 1, "right side");
    assert.ok(Math.abs((ey - o.after.Work.y) / o.after.Work.h - 0.25) < 0.05, `fraction 0.25, got ${(ey - o.after.Work.y) / o.after.Work.h}`);
  });
  await t.test("the timeout flow starts on the timer's border, ends on the target's border and is orthogonal", () => {
    const fb = o.after.FB;
    const near = (p, b) => {
      const inX = p[0] >= b.x - 1 && p[0] <= b.x + b.w + 1;
      const inY = p[1] >= b.y - 1 && p[1] <= b.y + b.h + 1;
      return inX && inY && (Math.abs(p[0] - b.x) <= 1 || Math.abs(p[0] - (b.x + b.w)) <= 1 || Math.abs(p[1] - b.y) <= 1 || Math.abs(p[1] - (b.y + b.h)) <= 1);
    };
    assert.ok(near(fb[0], o.after.Timer), `start ${fb[0]} vs ${JSON.stringify(o.after.Timer)}`);
    assert.ok(near(fb.at(-1), o.after.Handle), `end ${fb.at(-1)} vs ${JSON.stringify(o.after.Handle)}`);
    for (let i = 1; i < fb.length; i++) assert.ok(fb[i][0] === fb[i - 1][0] || fb[i][1] === fb[i - 1][1], "axis-aligned segments");
    assert.notDeepEqual(fb, o.before.FB);
  });
  await t.test("the saved DI agrees with the moved elements (no orphan geometry)", () => {
    const doc = new (globalThis.DOMParser ?? class {})();
    void doc;
    for (const [eid, g] of [["Timer", o.after.Timer], ["Esc", o.after.Esc], ["Work", o.after.Work]]) {
      const m = new RegExp(`bpmnElement="${eid}"[^>]*>\\s*<dc:Bounds x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}"`).exec(o.savedXml);
      assert.ok(m, `${eid} bounds in the saved XML`);
    }
  });
  await t.test("a second layout changes nothing (idempotent)", () => {
    assert.equal(o.res2.changed, 0);
  });
  await t.test("one undo restores the exact pre-layout bytes (the second layout added no history)", () => {
    assert.equal(o.afterUndoXml, o.beforeXml);
    assert.equal(o.canUndoAfterOne, false);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
