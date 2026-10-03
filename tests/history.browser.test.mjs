import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const taskX = (xml, p) => Number(new RegExp(`id="${p}_dT"[^>]*>\\s*<dc:Bounds x="([\\d.]+)"`).exec(xml)?.[1]);

test("active diagram across a new document version; undo and redo across a profile switch", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-history.mjs", "history", async (page) => {
    const core = await page.evaluate(() => window.hist.core());

    // Workshop, with real clicks and keys.
    await page.evaluate(() => window.hist.mountWorkshop());
    const ws = page.locator("#ws");
    await ws.locator('[role="tab"]').nth(1).waitFor();
    await ws.locator('[role="tab"]:has-text("Second")').click();
    await page.waitForFunction(() => document.querySelector('#ws [role="tab"][aria-selected="true"]')?.textContent.trim() === "Second");
    await page.evaluate(() => window.histWs.update(window.hist.TWO.replace(/name="First"/g, 'name="First updated"')));
    await page.waitForFunction(() => document.querySelector('#ws [role="tab"]')?.textContent.trim() === "First updated");
    await page.waitForTimeout(200);
    const tabAfterUpdate = await page.evaluate(() => [...document.querySelectorAll('#ws [role="tab"]')].map((e) => [e.textContent.trim(), e.getAttribute("aria-selected")]));
    const shownAfterUpdate = await page.evaluate(() => [...document.querySelectorAll('#ws .djs-element[data-element-id]')].map((g) => g.getAttribute("data-element-id")).filter((id) => /^P\d_T$/.test(id)));

    const undoBtn = ws.locator('[data-testid="bpmn-workshop-undo"]');
    const xBefore = await page.evaluate(async () => window.histWs.ref.getXml());
    // A real edit: drag the task of the shown diagram.
    const box = await ws.locator('.djs-element[data-element-id="P2_T"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('#ws [data-testid="bpmn-workshop-undo"]').disabled);
    const xLayout = await page.evaluate(async () => window.histWs.ref.getXml());
    await ws.locator('button[aria-label="Format"]').click();
    await page.getByRole("menuitemradio", { name: "BPMN" }).or(page.getByRole("menuitem", { name: "BPMN" })).first().click();
    await page.waitForFunction(() => document.querySelectorAll("#ws .legend-shape").length === 0 && document.querySelectorAll("#ws .djs-element").length > 0);
    await page.waitForTimeout(300);
    const undoEnabledAfterSwitch = !(await undoBtn.isDisabled());
    await undoBtn.click();
    await page.waitForFunction((x) => {
      return window.histWs.ref.getXml().then((xml) => xml !== x);
    }, xLayout, { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    const xUndo = await page.evaluate(async () => window.histWs.ref.getXml());
    const redoEnabled = !(await ws.locator('[data-testid="bpmn-workshop-redo"]').isDisabled());
    // Keyboard: redo then undo with the keys, on the canvas.
    await ws.locator(".djs-container").click({ position: { x: 700, y: 60 } });
    await page.keyboard.press("Control+Y");
    await page.waitForTimeout(600);
    const xKeyRedo = await page.evaluate(async () => window.histWs.ref.getXml());
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(600);
    const xKeyUndo = await page.evaluate(async () => window.histWs.ref.getXml());
    return { core, tabAfterUpdate, shownAfterUpdate, xBefore, xLayout, undoEnabledAfterSwitch, xUndo, redoEnabled, xKeyRedo, xKeyUndo };
  });
  const c = o.core;

  await t.test("B1 core: a new version keeps the selected diagram and shows it", () => {
    assert.equal(c.keep.active, "D2");
    assert.deepEqual(c.keep.shown, ["P2_T"]);
    assert.deepEqual(c.keep.names, ["First updated", "Second"]);
  });
  await t.test("B1 core: when the selected diagram is gone, the first one is shown", () => {
    assert.equal(c.fallback.active, "D1");
    assert.deepEqual(c.fallback.shown, ["P1_T"]);
  });
  await t.test("B1 workshop: the tab stays on the second diagram after an agent update", () => {
    assert.deepEqual(o.tabAfterUpdate, [["First updated", "false"], ["Second", "true"]]);
    assert.deepEqual(o.shownAfterUpdate, ["P2_T"]);
  });
  await t.test("B4 core: undo and redo survive a profile switch, a second switch too; a new document clears them", () => {
    assert.equal(c.layoutMoved, true);
    assert.deepEqual(c.beforeSwitch, { canUndo: true, canRedo: false });
    assert.deepEqual(c.afterSwitch, { canUndo: true, canRedo: false, legendShapes: 0 });
    assert.equal(c.afterUndo.taskX, c.afterUndo.x0, "undo after the switch restores the layout before the edit");
    assert.deepEqual([c.afterUndo.canUndo, c.afterUndo.canRedo, c.afterUndo.profileKept], [false, true, true]);
    assert.equal(c.afterRedo.taskX, c.afterRedo.x1);
    assert.deepEqual([c.afterRedo.canUndo, c.afterRedo.canRedo], [true, false]);
    assert.equal(c.afterSecondSwitchUndo.taskX, c.afterUndo.x0);
    assert.equal(c.afterSecondSwitchUndo.canRedo, true);
    assert.deepEqual(c.afterNewDocument, { canUndo: false, canRedo: false });
    assert.deepEqual(c.lastHistory, { canUndo: false, canRedo: false });
  });
  await t.test("B4 workshop: Undo stays enabled after Custom → BPMN, and undoes the edit; Redo and the keys work", () => {
    assert.notEqual(taskX(o.xLayout, "P2"), taskX(o.xBefore, "P2"), "the drag moved the task");
    assert.equal(o.undoEnabledAfterSwitch, true);
    assert.equal(taskX(o.xUndo, "P2"), taskX(o.xBefore, "P2"), "Undo restores the layout before the edit");
    assert.equal(o.redoEnabled, true);
    assert.equal(taskX(o.xKeyRedo, "P2"), taskX(o.xLayout, "P2"), "Ctrl+Y redoes");
    assert.equal(taskX(o.xKeyUndo, "P2"), taskX(o.xBefore, "P2"), "Ctrl+Z undoes");
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
