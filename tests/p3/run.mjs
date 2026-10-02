// P3: the 10 acceptance criteria on the PACKED tarball, in a real Chrome.
//   Official run : CDP_URL=http://127.0.0.1:9222 node tests/p3/run.mjs
//   Dev run      : node tests/p3/run.mjs            (headless Chromium, throw-away profile)
// With CDP_URL it opens ONE tab in the existing browser, closes only that tab, and never
// launches or closes the browser. A criterion that cannot run is reported as failed.
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "./prepare.mjs";
import { startServer } from "./server.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const proofs = process.env.P3_PROOFS ? join(repo, process.env.P3_PROOFS) : join(repo, "proofs/p3");
const shots = join(proofs, "shots");
mkdirSync(shots, { recursive: true });
const CDP_URL = process.env.CDP_URL;
const ONLY = process.env.P3_ONLY?.split(",");
const sha = (b) => createHash("sha256").update(b).digest("hex");

const MUST = {
  ce1: ["PA", "PB", "TA", "TB", "C1", "C2", "P1", "P2", "DA", "DB"],
  ce3: ["Process_1", "Sub_1", "Inner", "BD1", "BD2"],
  ce4: ["PX", "PY", "Msg1", "MF", "Pa", "Pb", "ST2", "EMF", "MED"],
  ce5: ["MsgShared", "MFA", "PS", "PR", "PO", "CA", "CB", "ER", "MEDR", "DiagA", "DiagB"],
};
const FILE = { ce1: "ce1-homonyms", ce3: "ce3-collapsed-subprocess", ce4: "ce4-two-pools-message", ce5: "ce5-two-diagrams-shared-root" };
const EDIT_TARGET = { ce1: "TA", ce3: "Sub_1", ce4: "T1", ce5: "TS" };

const prep = prepare();
const server = await startServer(prep.out);
const evidence = {
  experiment: "P3",
  date: new Date().toISOString(),
  commit: prep.head,
  workingTreeDirty: prep.dirty,
  package: { tarball: prep.tarName, sha256: prep.tarSha, files: prep.packFiles.length, installedVersion: prep.installedVersion },
  build: { distSha256: prep.distHash },
  server: { origin: server.origin, port: server.port, bind: "127.0.0.1", command: "node tests/p3/run.mjs (startServer in tests/p3/server.mjs; stopped at the end of the run)" },
  commands: { official: "CDP_URL=http://127.0.0.1:9222 node tests/p3/run.mjs", prepare: prep.log },
  browser: {},
  criteria: [],
};

let context, browser, page, profile;
const consoleLines = [];
try {
  if (CDP_URL) {
    browser = await chromium.connectOverCDP(CDP_URL);
    context = browser.contexts()[0];
    evidence.browser.mode = "cdp";
    evidence.browser.cdpUrl = CDP_URL;
    evidence.browser.pagesBefore = context.pages().length;
    page = await context.newPage();
  } else {
    profile = mkdtempSync(join(repo, "proofs-profile-"));
    context = await chromium.launchPersistentContext(profile, { downloadsPath: join(profile, "dl"), acceptDownloads: true, executablePath: process.env.CHROMIUM ?? "/snap/bin/chromium", headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    evidence.browser.mode = "headless-dev";
    page = context.pages()[0] ?? (await context.newPage());
  }
  evidence.browser.version = (context.browser() ?? browser).version();
  const cdp = await context.newCDPSession(page);
  evidence.browser.targetId = (await cdp.send("Target.getTargetInfo")).targetInfo.targetId;
  await page.setViewportSize({ width: 1280, height: 1000 });
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  page.on("dialog", (d) => d.dismiss());

  // ---- helpers -------------------------------------------------------------------------
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const goto = async (path) => {
    await page.goto(`${server.origin}/${path}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  };
  const rectOf = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no box for ${selector}`);
    return box;
  };
  const centerOf = async (hostId, eid) => {
    const b = await rectOf(`#${hostId} .djs-element[data-element-id="${eid}"] .djs-hit-all, #${hostId} .djs-element[data-element-id="${eid}"] .djs-hit`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const emptySpot = async (hostId) => {
    const b = await rectOf(`#${hostId}`);
    return { x: b.x + b.width - 40, y: b.y + b.height - 40 };
  };
  const rename = async (hostId, eid, text) => {
    const c = await centerOf(hostId, eid);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector(`#${hostId} .djs-direct-editing-content, #${hostId} [contenteditable="true"]`, { timeout: 5000 });
    await page.keyboard.press("Control+A");
    await page.keyboard.type(text);
    const e = await emptySpot(hostId);
    await page.mouse.click(e.x, e.y);
  };
  const drag = async (hostId, eid, dx, dy) => {
    const c = await centerOf(hostId, eid);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx / 2, c.y + dy / 2, { steps: 6 });
    await page.mouse.move(c.x + dx, c.y + dy, { steps: 6 });
    await page.mouse.up();
  };
  const click = async (hostId, eid) => {
    const c = await centerOf(hostId, eid);
    await page.mouse.click(c.x, c.y);
  };

  async function criterion(id, title, path, fn, { allowConsole } = {}) {
    if (ONLY && !ONLY.includes(String(id))) return;
    const rec = { id, title, pass: false, url: null, checks: [], screenshots: [], consoleErrors: [], extra: {}, error: null };
    const start = consoleLines.length;
    const check = (name, pass, detail) => rec.checks.push({ name, pass: !!pass, detail: detail ?? null });
    const shot = async (name, locator) => {
      const file = join(shots, `${String(id).padStart(2, "0")}-${name}.png`);
      if (locator) await page.locator(locator).first().screenshot({ path: file });
      else await page.screenshot({ path: file });
      rec.screenshots.push({ file: file.slice(repo.length), sha256: sha(readFileSync(file)) });
    };
    try {
      if (path) {
        await goto(path);
        rec.url = page.url();
      }
      await fn({ check, shot, rec });
    } catch (e) {
      rec.error = String(e?.stack ?? e).split("\n").slice(0, 4).join(" | ");
      check("criterion ran to completion", false, rec.error);
    }
    rec.consoleErrors = consoleLines.slice(start).filter((l) => /^\[(error|pageerror)\]/.test(l) && !(allowConsole && allowConsole.test(l)));
    check("no console error or page error", rec.consoleErrors.length === 0, rec.consoleErrors);
    rec.pass = rec.checks.length > 0 && rec.checks.every((c) => c.pass);
    evidence.criteria.push(rec);
    console.log(`${rec.pass ? "PASS" : "FAIL"} criterion ${id}: ${title} (${rec.checks.filter((c) => c.pass).length}/${rec.checks.length})`);
    for (const c of rec.checks.filter((c) => !c.pass)) console.log(`   - FAIL ${c.name} :: ${JSON.stringify(c.detail)}`);
  }

  // ---- 1. single-import vanilla page, badge on each instance -----------------------------
  await criterion(1, "packed tarball, one import, no console error, bpmn.io badge visible and active on each instance", "min.html", async ({ check, shot }) => {
    const src = readFileSync(join(repo, "tests/p3/consumer/min.js"), "utf8");
    const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
    check("the consumer imports exactly one module, the package", imports.length === 1 && imports[0].includes('"@sentropic/bpmn-canvas"'), imports);
    const info = await ev(() => ({ states: window.__min.handles.map((h) => h.state), diagnostics: window.__min.diagnostics.map((d) => d.code), containers: document.querySelectorAll(".djs-container").length }));
    check("two instances ready, no diagnostic", info.states.join() === "ready,ready" && info.diagnostics.length === 0, info);
    const badges = await ev(() =>
      [...document.querySelectorAll(".bjs-powered-by")].map((w) => {
        const r = w.getBoundingClientRect();
        const cs = getComputedStyle(w);
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { tag: w.tagName, href: w.getAttribute("href"), target: w.getAttribute("target"), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents, w: r.width, h: r.height, hitIsBadge: top === w || w.contains(top), inHost: !!w.closest(".bpmn-canvas") };
      }),
    );
    check("one badge per instance", badges.length === 2, badges.length);
    for (const [i, b] of badges.entries()) {
      check(`badge ${i}: visible, sized, not hidden`, b.display !== "none" && b.visibility !== "hidden" && b.opacity !== "0" && b.w > 20 && b.h > 10, b);
      check(`badge ${i}: not covered (hit test lands on it)`, b.hitIsBadge, b);
      check(`badge ${i}: link to bpmn.io, receives pointer events`, b.tag === "A" && b.href === "http://bpmn.io" && b.pointerEvents !== "none", b);
    }
    await shot("two-instances");
  });

  // ---- 2. E1/E2: exact bytes untouched; after a real edit nothing is lost -----------------
  await criterion(2, "E1/E2 exact bytes without edit; after a gesture edit every id and reference survives, or read-only plus diagnostic", "lab.html", async ({ check, shot }) => {
    for (const key of ["ce1", "ce3", "ce4", "ce5"]) {
      const { id, hostId } = await ev((n) => window.lab.mount(n), FILE[key]);
      const same = await ev(async (i) => (await window.lab.sha256(await window.lab.getXml(i))) === (await window.lab.inputSha(i)), id);
      check(`${key}: untouched getXml equals the input (sha256)`, same);
      await rename(hostId, EDIT_TARGET[key], "GESTURE");
      const name = await ev(([i, e]) => window.lab.nameOf(i, e), [id, EDIT_TARGET[key]]);
      check(`${key}: the gesture edit reached the model`, name === "GESTURE", name);
      const a = await ev(([i, m]) => window.lab.analyze(i, m), [id, MUST[key]]);
      check(`${key}: after edit every expected id is present and no reference dangles`, a.parses && a.missing.length === 0 && a.dangling.length === 0, a);
      if (key === "ce1") await shot("ce1-after-edit", `#${hostId}`);
      await ev((i) => window.lab.destroy(i), id);
    }
    const { id, hostId } = await ev(() => window.lab.mount("rogue-extension"));
    const info = await ev((i) => window.lab.info(i), id);
    check("lossy input opens read-only with the typed diagnostic delivered to onDiagnostic", info.readOnly && info.reason === "lossy" && info.diagnostics.some((d) => d.code === "unparsable-content" && d.ids.includes("acme:rogue")), { reason: info.reason, codes: info.diagnostics.map((d) => d.code) });
    await rename(hostId, "T", "NOPE").catch(() => undefined);
    const unchanged = await ev(async (i) => (await window.lab.sha256(await window.lab.getXml(i))) === (await window.lab.inputSha(i)), id);
    check("lossy input: a gesture edit does not change the exported bytes", unchanged);
    await ev((i) => window.lab.destroy(i), id);
  });

  // ---- 3. E4: standard profile vs upstream bpmn-js ---------------------------------------
  await criterion(3, "E4 standard profile compared with upstream bpmn-js on the notation corpus", "lab.html", async ({ check, shot, rec }) => {
    const r = await ev(() => window.lab.e4());
    check("every element's visual markup equals upstream (ids normalized)", r.diffs.length === 0 && r.compared >= 10, { compared: r.compared, diffs: r.diffs.slice(0, 3) });
    rec.extra.compared = r.compared;
    const a = await page.locator(`#${r.oursHostId} .djs-container`).first().screenshot({ path: join(shots, "03-standard-ours.png") });
    const b = await page.locator(`#${r.plainHostId} .djs-container`).first().screenshot({ path: join(shots, "03-upstream.png") });
    rec.screenshots.push({ file: "proofs/p3/shots/03-standard-ours.png", sha256: sha(a) }, { file: "proofs/p3/shots/03-upstream.png", sha256: sha(b) });
    rec.extra.pixelIdentical = sha(a) === sha(b);
    rec.extra.pixelNote = "informative: ids and wrapper differences can change pixels; the criterion is the markup comparison";
    const { id, hostId } = await ev(() => window.lab.mount("notation", { profile: "legend", width: 900, height: 600 }));
    await shot("legend-reference", `#${hostId}`);
    await ev((i) => window.lab.destroy(i), id);
  });

  // ---- 4. E5, E6, E7 in a real page -------------------------------------------------------
  await criterion(4, "E5/E6/E7 lifecycle: one container after 50 cycles, no onChange after destroy, label coherent with content", "lab.html", async ({ check }) => {
    const l = await ev(() => window.lab.lifecycle());
    check("E5 vanilla: exactly one .djs-container after 50 cycles", l.e5ContainersAfter50 === 1, l);
    check("E5 vanilla: none after destroy", l.e5ContainersAfterDestroy === 0, l);
    check("E6: superseded setXml rejects with AbortError", l.e6aRejects === "AbortError", l);
    check("E6: the superseding setXml applies", l.e6bApplied === true, l);
    check("E6: setXml pending at destroy rejects with AbortError", l.e6cRejects === "AbortError", l);
    check("E6: no onChange after destroy", l.e6ChangesAfterDestroy === 0, l);
    const e7 = await ev(() => window.lab.e7());
    check("E7: active label matches the displayed content", e7.active === "DiagB" && e7.showsB === true && e7.showsA === false, e7);
    await goto("react.html");
    const r = await ev(() => window.reactTest.cycles(50));
    check("E5 React StrictMode: exactly one container and one badge after 50 cycles", r.containers === 1 && r.badges === 1, r);
  });

  // ---- 5. E8 two instances, one hidden ----------------------------------------------------
  await criterion(5, "E8 two instances, one inside display:none: arrows resolve inside the visible instance, ids unique", "lab.html", async ({ check, shot }) => {
    const hidden = await ev(() => window.lab.mount("ce4-two-pools-message", { hidden: true }));
    const vis = await ev(() => window.lab.mount("ce4-two-pools-message"));
    const r = await ev((hostId) => {
      const defs = [...document.querySelectorAll("marker[id], linearGradient[id]")].map((n) => n.id);
      const host = document.getElementById(hostId);
      const refs = [...host.querySelectorAll("[marker-end], [marker-start], [style*='marker']")].flatMap((n) => [...((n.getAttribute("marker-end") ?? "") + (n.getAttribute("marker-start") ?? "") + (n.getAttribute("style") ?? "")).matchAll(/url\(["']?#([^)"']+)["']?\)/g)].map((m) => m[1]));
      const resolved = refs.map((id) => document.getElementById(id));
      return {
        defsTotal: defs.length,
        defsUnique: new Set(defs).size,
        refs: refs.length,
        allResolve: resolved.every(Boolean),
        allInsideVisible: resolved.every((m) => m && host.contains(m)),
        allRendered: resolved.every((m) => m && m.getBoundingClientRect !== undefined && !!m.closest("svg")?.getClientRects().length),
      };
    }, vis.hostId);
    check("marker and gradient ids are unique across the document", r.defsTotal > 0 && r.defsUnique === r.defsTotal, r);
    check("the visible instance has marker references and every one resolves", r.refs > 0 && r.allResolve, r);
    check("every referenced marker lives inside the visible instance (not in the display:none one)", r.allInsideVisible && r.allRendered, r);
    await shot("visible-instance", `#${vis.hostId}`);
    await ev(([a, b]) => { window.lab.destroy(a); window.lab.destroy(b); }, [hidden.id, vis.id]);
  });

  // ---- 6. read-only: keyboard, pointer, public commands; zoom and switch still work -------
  await criterion(6, "read-only: Delete, Ctrl+Z, drag and public commands change nothing; zoom and diagram switch work", "lab.html", async ({ check, shot }) => {
    const ro = await ev(() => window.lab.mount("ce1-homonyms", { readOnly: true }));
    const ed = await ev(() => window.lab.mount("ce1-homonyms"));
    const same = (id) => ev(async (i) => (await window.lab.sha256(await window.lab.getXml(i))) === (await window.lab.inputSha(i)), id);
    // positive control: the same gestures DO change an editable canvas.
    await drag(ed.hostId, "TA", 120, 60);
    const moved = await ev(([i]) => window.lab.shapeX(i, "TA"), [ed.id]);
    check("control: dragging in an editable canvas moves the shape (gestures are effective)", moved !== 200 && moved !== null, moved);
    await click(ed.hostId, "TA");
    await page.keyboard.press("Delete");
    check("control: Delete in an editable canvas removes the element", (await ev(([i, e]) => window.lab.hasElement(i, e), [ed.id, "TA"])) === false);
    await page.keyboard.press("Control+Z");
    check("control: Ctrl+Z in an editable canvas restores it", (await ev(([i, e]) => window.lab.hasElement(i, e), [ed.id, "TA"])) === true);
    // read-only canvas.
    await click(ro.hostId, "TA");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+Z");
    await page.keyboard.press("Control+Shift+Z");
    await drag(ro.hostId, "TA", 120, 60);
    await ev(async (i) => { await window.lab.call(i, "autoLayout"); window.lab.get(i).handle.undo(); window.lab.get(i).handle.redo(); }, ro.id);
    check("read-only: Delete, Ctrl+Z, drag and public undo/redo/autoLayout leave the exported bytes identical to the input", await same(ro.id));
    check("read-only: the element is still on the canvas", (await page.locator(`#${ro.hostId} .djs-element[data-element-id="TA"]`).count()) === 1);
    const before = await ev((i) => window.lab.viewbox(i), ro.id);
    const c = await rectOf(`#${ro.hostId}`);
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -400);
    await page.keyboard.up("Control");
    await page.waitForTimeout(150);
    const after = await ev((i) => window.lab.viewbox(i), ro.id);
    check("read-only: Ctrl+wheel still zooms", before !== after, { before, after });
    await ev((i) => window.lab.call(i, "selectDiagram", "DB"), ro.id);
    check("read-only: diagram switch still works", (await ev((i) => window.lab.info(i).active, ro.id)) === "DB" && (await page.locator(`#${ro.hostId} .djs-element[data-element-id="TB"]`).count()) === 1);
    check("read-only: still the input bytes after navigation", await same(ro.id));
    await shot("read-only", `#${ro.hostId}`);
    await ev(([a, b]) => { window.lab.destroy(a); window.lab.destroy(b); }, [ro.id, ed.id]);
  });

  // ---- 7. autoLayout: one undo step, exact restore -----------------------------------------
  await criterion(7, "autoLayout is one undo step and Ctrl+Z restores the exact pre-layout bytes", "lab.html", async ({ check, shot }) => {
    const { id, hostId } = await ev(() => window.lab.mount("ce4-two-pools-message"));
    await drag(hostId, "T1", 250, 0);
    const before = await ev((i) => window.lab.getXml(i), id);
    const res = await ev((i) => window.lab.call(i, "autoLayout"), id);
    check("autoLayout moved elements", res.changed > 0 && Array.isArray(res.skipped), res);
    const mid = await ev((i) => window.lab.getXml(i), id);
    check("the layout changed the document", mid !== before);
    const e = await emptySpot(hostId);
    await page.mouse.click(e.x, e.y);
    await page.keyboard.press("Control+Z");
    const after = await ev((i) => window.lab.getXml(i), id);
    check("one Ctrl+Z restores the exact pre-layout bytes", after === before, { equal: after === before, sha: [sha(before), sha(after)] });
    await shot("after-undo", `#${hostId}`);
    await ev((i) => window.lab.destroy(i), id);
  });

  // ---- 8. edit then export ------------------------------------------------------------------
  await criterion(8, "edit then immediate export: the downloaded .bpmn equals getXml()", "lab.html", async ({ check, rec }) => {
    const { id, hostId } = await ev(() => window.lab.mount("ce1-homonyms"));
    await rename(hostId, "TA", "EXPORTED");
    let downloaded = null;
    let how = "download-event";
    try {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.click(`#export-${id}`)]);
      const target = join(proofs, "export.bpmn");
      const failure = await dl.failure();
      rec.extra.downloadFailure = failure;
      await dl.saveAs(target);
      downloaded = readFileSync(target);
      rec.extra.suggestedFilename = dl.suggestedFilename();
    } catch (e) {
      how = `download-event unavailable (${String(e.message).split("\n")[0]})`;
    }
    const xml = await ev((i) => window.lab.getXml(i), id);
    if (downloaded === null) {
      // The browser-side download interception is cancelled when attached to an existing Chrome.
      // Fallback, declared as such: read back the exact Blob the page handed to the download.
      const wit = await ev(async (i) => {
        const buf = new Uint8Array(await (await fetch(window.__lastBlobUrl)).arrayBuffer());
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
        const xml = await window.lab.getXml(i);
        return { blobSha: digest, blobBytes: buf.length, equalsGetXml: new TextDecoder().decode(buf) === xml, getXmlSha: await window.lab.sha256(xml) };
      }, id);
      rec.extra.exportMode = "blob-readback (download interception unavailable: " + how + ")";
      rec.extra.blobWitness = wit;
      check("fallback: the blob handed to the browser equals getXml() byte for byte", wit.equalsGetXml && wit.blobSha === wit.getXmlSha && wit.blobBytes > 0, wit);
    } else {
      rec.extra.exportMode = "download-file";
    }
    check("an export was captured (file or blob read-back)", downloaded !== null || !!rec.extra.blobWitness, how);
    if (downloaded) {
      check("downloaded bytes equal getXml() bytes", Buffer.compare(downloaded, Buffer.from(xml, "utf8")) === 0, { downloadSha: sha(downloaded), getXmlSha: sha(Buffer.from(xml, "utf8")) });
      rec.extra.exportedBytes = downloaded.length;
      rec.extra.exportedSha256 = sha(downloaded);
    }
    check("the export contains the gesture edit", xml.includes('name="EXPORTED"'));
    await ev((i) => window.lab.destroy(i), id);
  });

  // ---- 9. E11: strict CSP page and Shadow DOM host ----------------------------------------
  await criterion(9, "E11 strict CSP and Shadow DOM: palette icons visible, zero CSP violation", "csp.html", async ({ check, shot, rec }) => {
    const csp = await ev(() => ({ violations: window.csp.violations, state: window.csp.handle.state, diagnostics: window.csp.diagnostics.map((d) => d.code), fontOk: document.fonts.check("16px bpmn"), faces: [...document.fonts].filter((f) => f.family.includes("bpmn")).map((f) => f.status), entries: document.querySelectorAll(".djs-palette .entry").length, pseudoFont: getComputedStyle(document.querySelector(".djs-palette .entry"), "::before").fontFamily, pseudoContent: getComputedStyle(document.querySelector(".djs-palette .entry"), "::before").content }));
    check("CSP page: canvas ready with no diagnostic", csp.state === "ready" && csp.diagnostics.length === 0, csp);
    check("CSP page: zero securitypolicyviolation events", csp.violations.length === 0, csp.violations);
    check("CSP page: the BPMN font loaded from font-src 'self'", csp.fontOk && csp.faces.length > 0 && csp.faces.every((s) => s === "loaded"), csp.faces);
    check("CSP page: palette entries present with the icon font applied", csp.entries > 0 && /bpmn/.test(csp.pseudoFont) && csp.pseudoContent !== "none" && csp.pseudoContent !== "normal", { entries: csp.entries, pseudoFont: csp.pseudoFont, pseudoContent: csp.pseudoContent });
    const fontReq = server.requests.filter((r) => /bpmn-.*\.(woff2?|ttf)$/.test(r.path));
    check("CSP page: the font file was served (200)", fontReq.some((r) => r.status === 200), fontReq);
    rec.extra.cspHeader = "default-src 'none'; script-src 'self'; style-src 'self' 'nonce-<per-request>'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'";
    await shot("csp-palette", ".djs-palette");
    await goto("shadow.html");
    rec.extra.shadowUrl = page.url();
    const sh = await ev(() => {
      const root = window.shadowTest.shadow;
      const entry = root.querySelector(".djs-palette .entry");
      return { state: window.shadowTest.handle.state, diagnostics: window.shadowTest.diagnostics.map((d) => d.code), fontOk: document.fonts.check("16px bpmn"), faces: [...document.fonts].filter((f) => f.family.includes("bpmn")).map((f) => f.status), entries: root.querySelectorAll(".djs-palette .entry").length, shadowStyle: !!root.querySelector("style[data-bpmn-canvas-styles]"), docFontStyle: !!document.head.querySelector("style[data-bpmn-canvas-font]"), pseudoFont: getComputedStyle(entry, "::before").fontFamily, pseudoContent: getComputedStyle(entry, "::before").content, badge: !!root.querySelector(".bjs-powered-by") };
    });
    check("Shadow DOM: ready, styles in the shadow root, font-face at document level", sh.state === "ready" && sh.shadowStyle && sh.docFontStyle, sh);
    check("Shadow DOM: font loaded and palette icons rendered with it", sh.fontOk && sh.faces.every((s) => s === "loaded") && sh.entries > 0 && /bpmn/.test(sh.pseudoFont) && sh.pseudoContent !== "none", sh);
    check("Shadow DOM: bpmn.io badge present inside the shadow root", sh.badge);
    await shot("shadow-host", "#app");
  });

  // ---- 10. accessibility: the toolbar and the tabs of the packed workshop ---------------------------------
  await criterion(10, "axe on the workshop page; the toolbar, its menus and the tabs work from the keyboard", "workshop.html", async ({ check, rec, shot }) => {
    await page.addScriptTag({ path: join(repo, "node_modules/axe-core/axe.min.js") });
    const axe = await ev(async () => {
      const r = await window.axe.run(document, { resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 160) }));
    });
    rec.extra.axeViolations = axe;
    const bad = axe.filter((v) => v.impact === "serious" || v.impact === "critical");
    check("axe: no serious or critical violation on the whole page", bad.length === 0, bad);

    const names = await ev(() => ({
      toolbar: document.querySelector('[role="toolbar"]')?.getAttribute("aria-label"),
      buttons: [...document.querySelectorAll('[role="toolbar"] button')].map((b) => b.getAttribute("aria-label") || b.textContent.trim()),
      tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => [t.textContent, t.getAttribute("aria-selected")]),
      panel: document.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby") === document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      containers: document.querySelectorAll(".djs-container").length,
    }));
    check("a labelled toolbar with named buttons, two tabs with the first selected, one canvas", names.toolbar === "Diagram" && names.buttons.every(Boolean) && names.tabs.length === 2 && names.tabs[0][1] === "true" && names.panel && names.containers === 1, names);

    // Tab walks forward from the top of the page: every toolbar control is reached before the tabs.
    await page.evaluate(() => document.activeElement?.blur());
    const order = [];
    for (let k = 0; k < 9; k++) {
      await page.keyboard.press("Tab");
      order.push(await ev(() => { const a = document.activeElement; return a ? (a.getAttribute("role") === "tab" ? "tab:" + a.textContent : a.getAttribute("data-testid") || a.tagName) : "none"; }));
    }
    rec.extra.tabOrder = order;
    const bar = ["bpmn-workshop-zoom-out", "bpmn-workshop-zoom-in", "bpmn-workshop-fit", "bpmn-workshop-auto-layout", "bpmn-workshop-export", "bpmn-workshop-import"];
    const reached = order.filter((x) => bar.includes(x) || x === "BUTTON");
    check("Tab reaches the toolbar controls (disabled undo and redo are skipped) and then a tab", reached.length >= 6 && order.some((x) => x.startsWith("tab:")), order);

    // A menu opens from the keyboard, focus moves into it, Escape closes it and gives the focus back.
    await page.locator('[data-testid="bpmn-workshop-export"] button').first().focus();
    await page.keyboard.press("Enter");
    const opened = await ev(() => ({ expanded: document.querySelector('[data-testid="bpmn-workshop-export"] button').getAttribute("aria-expanded"), focusRole: document.activeElement?.getAttribute("role") }));
    check("Enter opens the export menu and focuses its first item", opened.expanded === "true" && opened.focusRole === "menuitem", opened);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    const closed = await ev(() => ({ expanded: document.querySelector('[data-testid="bpmn-workshop-export"] button').getAttribute("aria-expanded"), onTrigger: document.activeElement === document.querySelector('[data-testid="bpmn-workshop-export"] button') }));
    check("Escape closes the menu and returns the focus to its trigger", closed.expanded === "false" && closed.onTrigger, closed);

    // Choosing an item from the keyboard runs the action (export), using the packed code end to end.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.workshopTest.downloads.length > 0, null, { timeout: 8000 }).catch(() => undefined);
    const dl = await ev(() => window.workshopTest.downloads);
    check("Enter on a menu item exports (BPMN file requested)", dl.length === 1 && dl[0] === "diagram.bpmn", dl);

    // Tabs: arrows move the selection and wrap.
    await page.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    const second = await ev(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    const wrapped = await ev(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent);
    check("ArrowRight selects the next diagram and wraps to the first", second === "Other" && wrapped === "Exchange", { second, wrapped });
    await shot("workshop");
  });

  // ---- R: static render and import validation do not load the editing engine ---------------------------------
  await criterion("R", "a page that only renders and validates never fetches the editing engine (Modeler)", "render.html", async ({ check, rec }) => {
    const r = await ev(() => window.renderTest);
    check("two diagrams rendered with their sizes, import validated unchanged", r.diagrams.length === 2 && r.diagrams.every((d) => d[1] > 0 && d[2] > 0) && r.importedSame, r);
    const js = server.requests.filter((q) => /^\/assets\/.*\.js$/.test(q.path)).map((q) => q.path);
    rec.extra.chunksRequestedByAllPagesSoFar = js.length;
    const afterRender = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => /\/assets\/.*\.js$/.test(p)));
    rec.extra.chunks = afterRender;
    check("the Viewer chunk was fetched", afterRender.some((p) => /Viewer-/.test(p)), afterRender);
    check("the Modeler chunk was NOT fetched", !afterRender.some((p) => /Modeler-/.test(p)), afterRender);
  });

  // ---- E9: a host with its own bpmn-js ---------------------------------------------------------
  await criterion("E9", "a page with its own bpmn-js Modeler is unaffected by a canvas using the legend profile", "lab.html", async ({ check, rec, shot }) => {
    const r = await ev(() => window.lab.e9());
    rec.extra.e9 = r;
    check("the host's DataInput behavior is identical before and after our canvas exists", r.before.dataInput === r.after.dataInput, { before: r.before.dataInput, after: r.after.dataInput });
    check("BpmnUpdater.prototype is not modified by our canvas", r.before.proto === r.after.proto && r.before.proto.length > 0);
    check("the host's updater is still an instance of the unmodified upstream BpmnUpdater", r.before.updaterIsUpstream === true && r.after.updaterIsUpstream === true, r);
    check("the host's bpmn.io badge stays visible, and each instance has its own (2 on the page)", r.hostBadgeVisible && r.before.badges === 1 && r.after.badges === 2, { before: r.before.badges, after: r.after.badges });
    check("our canvas is ready next to it", r.ourState === "ready");
    await shot("host-and-canvas");
  }, { allowConsole: /no parent for <undefined> in <P>|Cannot use 'in' operator to search for 'ioSpecification' in null/ });

  // ---- finish ----------------------------------------------------------------------------
  evidence.consoleTotal = consoleLines.length;
  evidence.server.requests = server.requests.length;
  evidence.server.notFound = server.requests.filter((q) => q.status === 404);
  evidence.allCriteriaPass = evidence.criteria.length > 0 && evidence.criteria.every((c) => c.pass);
} finally {
  if (CDP_URL) {
    await page?.close();
    evidence.browser.pagesAfter = context?.pages().length;
  } else {
    await context?.close();
  }
  if (profile) rmSync(profile, { recursive: true, force: true });
  await server.close();
  evidence.server.stopped = true;
  writeFileSync(join(proofs, "p3-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  writeFileSync(join(proofs, "console.log"), consoleLines.join("\n") + "\n");
}
console.log(`\nP3 criteria: ${evidence.criteria.filter((c) => c.pass).length}/${evidence.criteria.length} pass; tarball ${evidence.package.sha256.slice(0, 12)}; target ${evidence.browser.targetId}`);
// Exit explicitly: a CDP connection keeps Node alive, and this never closes the browser.
process.exit(evidence.allCriteriaPass ? 0 : 1);
