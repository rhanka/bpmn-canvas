import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const taskX = (xml, p) => Number(new RegExp(`id="${p}_dT"[^>]*>\\s*<dc:Bounds x="([\\d.]+)"`).exec(xml)?.[1]);

test("active diagram across a new document version; undo and redo across a profile switch", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-history.mjs", "history", async (page) => {
    const core = await page.evaluate(() => window.hist.core());
    const extra = await page.evaluate(() => window.hist.extra());
    // F2: a real click on the drill-down marker of the collapsed sub-process.
    await page.locator(".bjs-drilldown").first().click();
    await page.waitForTimeout(300);
    extra.drillAfter = await page.evaluate(() => window.hist.drillAfter());

    // Workshop, with real clicks and keys.
    await page.evaluate(() => window.hist.mountWorkshop());
    const ws = page.locator("#ws");
    await ws.locator('[role="tab"]').nth(1).waitFor();
    await ws.scrollIntoViewIfNeeded();
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
    // F1 in the workshop: a second edit after the switch, two undos then two redos, buttons then keys.
    const pos = async () => taskX(await page.evaluate(async () => window.histWs.ref.getXml()), "P2");
    // Back on the first edit (the keys above left it as a redo step), then the second edit on top of it.
    await ws.locator('[data-testid="bpmn-workshop-redo"]').click();
    await page.waitForTimeout(700);
    const box2 = await ws.locator('.djs-element[data-element-id="P2_T"]').boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2 + 40, box2.y + box2.height / 2 + 20, { steps: 4 });
    await page.mouse.move(box2.x + box2.width / 2 + 70, box2.y + box2.height / 2 + 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const mixed = { second: await pos(), first: taskX(xLayout, "P2"), initial: taskX(xBefore, "P2") };
    const redoBtn = ws.locator('[data-testid="bpmn-workshop-redo"]');
    await undoBtn.click(); await page.waitForTimeout(400);
    mixed.u1 = await pos();
    await undoBtn.click(); await page.waitForTimeout(700);
    mixed.u2 = await pos();
    await redoBtn.click(); await page.waitForTimeout(700);
    mixed.r1 = await pos();
    mixed.redoEnabledAfterR1 = !(await redoBtn.isDisabled());
    await redoBtn.click(); await page.waitForTimeout(700);
    mixed.r2 = await pos();
    await ws.locator(".djs-container").click({ position: { x: 700, y: 60 } });
    await page.keyboard.press("Control+Z"); await page.waitForTimeout(500);
    await page.keyboard.press("Control+Z"); await page.waitForTimeout(800);
    mixed.k2 = await pos();
    await page.keyboard.press("Control+Y"); await page.waitForTimeout(800);
    await page.keyboard.press("Control+Y"); await page.waitForTimeout(800);
    mixed.ky2 = await pos();
    return { core, extra, mixed, tabAfterUpdate, shownAfterUpdate, xBefore, xLayout, undoEnabledAfterSwitch, xUndo, redoEnabled, xKeyRedo, xKeyUndo };
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
  const x = o.extra;
  await t.test("F1 core: two undos then two redos across the switch come back to the second edit", () => {
    assert.deepEqual(x.mixed, { afterU1: "A", afterU2: "Task of First", afterR1: "A", canRedoAfterR1: true, afterR2: "B", canRedoEnd: false });
  });
  await t.test("F1 core: a branch made after a snapshot undo keeps its redo steps", () => {
    assert.deepEqual(x.branch, { afterSnapshotUndo: "A1", futureDropped: true, back: "Task of First", end: "C", canRedo: false });
  });
  await t.test("F1 workshop: buttons and keys bring back both edits after Custom → BPMN", () => {
    const m = o.mixed;
    assert.notEqual(m.second, m.first, "the second drag moved the task");
    assert.deepEqual([m.u1, m.u2, m.r1, m.redoEnabledAfterR1, m.r2], [m.first, m.initial, m.first, true, m.second]);
    assert.equal(m.k2, m.initial, "Ctrl+Z twice");
    assert.equal(m.ky2, m.second, "Ctrl+Y twice");
  });
  await t.test("F2: the native drill-down into a sub-process drops the parent's snapshots and says so", () => {
    assert.deepEqual([x.drillReady.active, x.drillReady.past > 0, x.drillReady.canUndo], ["BD1", true, true]);
    assert.equal(x.drillAfter.active, "BD2");
    assert.deepEqual([x.drillAfter.past, x.drillAfter.canUndo], [0, false]);
    assert.deepEqual(x.drillAfter.lastHistory, { canUndo: false, canRedo: false });
  });
  await t.test("F3: a save failing during the capture leaves the old modeler, its stack and the revision as they were", () => {
    const f = x.captureFailure;
    assert.match(f.error ?? "", /injected save failure/);
    assert.deepEqual({ ...f.after }, { name: f.before.name, idx: f.before.idx, canUndo: f.before.canUndo, canRedo: f.before.canRedo, rev: f.before.rev });
    assert.equal(f.sameXml, true);
    assert.equal(f.sameModeler, true);
  });
  await t.test("F4: at most 100 snapshots in all, released by destroy", () => {
    assert.equal(x.cap.kept, x.cap.current, "the current state is kept");
    assert.ok(x.cap.past + x.cap.future <= 100, `${x.cap.past} + ${x.cap.future}`);
    assert.ok(x.cap.afterMove <= 100);
    assert.equal(x.cap.afterDestroy, 0);
  });
  await t.test("destroy() during the capture of setProfile: AbortError, no snapshot, no modeler, nothing emitted (3 cases, 3 runs each)", () => {
    const runs = x.destroyDuringCapture;
    assert.equal(runs.length, 9);
    for (const r of runs) {
      assert.deepEqual(
        { error: r.error, state: r.state, snapshots: r.snapshots, modeler: r.modeler, canUndo: r.canUndo, canRedo: r.canRedo, newChanges: r.newChanges, newDiagnostics: r.newDiagnostics, rootInHost: r.rootInHost },
        { error: "AbortError", state: "destroyed", snapshots: 0, modeler: "none", canUndo: false, canRedo: false, newChanges: 0, newDiagnostics: 0, rootInHost: 0 },
        `destroy at save ${r.at}${r.fail ? " (failing)" : ""}`,
      );
      assert.equal(r.calls, r.at, "no save after the destroying one");
    }
  });
  await t.test("destroy() during the import of setProfile, then a failed import: AbortError, still destroyed, nothing emitted", () => {
    assert.deepEqual(x.destroyDuringImport, { reached: true, error: "AbortError", state: "destroyed", newDiagnostics: 0 });
  });
  await t.test("destroy() while setProfile loads its modules, then a failed load: AbortError, still destroyed, nothing emitted", () => {
    assert.deepEqual(x.destroyDuringLoad, { reached: true, error: "AbortError", state: "destroyed", newDiagnostics: 0 });
  });
  await t.test("getXml superseded by a later setXml, queued or saving: AbortError and no stale save-failed", () => {
    assert.deepEqual(x.getXmlSuperseded, { queuedError: "AbortError", inFlightError: "AbortError", saveFailed: 0, after: true });
  });
  await t.test("autoLayout superseded by a setXml while it computes: AbortError, no layout step, no onChange", () => {
    assert.deepEqual(x.layoutSuperseded, { error: "AbortError", causes: [], canUndo: false });
  });
  await t.test("layout superseded right after its computation: the check after it stops the command", () => {
    assert.deepEqual(x.layoutComputeSuperseded, { error: "AbortError", checks: 2, executed: false, causes: [] });
  });
  await t.test("F5: an undo queued before setReadOnly(true) does not change the locked document", () => {
    assert.deepEqual(x.readOnlyQueued, { name: "A", newRevisions: 0, past: 1 });
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
