import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const r = (p) => readFileSync(root + p, "utf8");
const pool = r("tests/fixtures/io/pool-lanes.bpmn").replace(
  '<bpmn:textAnnotation id="App"><bpmn:text>[App] CRM</bpmn:text></bpmn:textAnnotation>',
  '<bpmn:textAnnotation id="App"><bpmn:text>[App] CRM</bpmn:text></bpmn:textAnnotation><bpmn:textAnnotation id="DocA"><bpmn:text>[Doc] Form</bpmn:text></bpmn:textAnnotation>',
).replace("</bpmndi:BPMNPlane>", '<bpmndi:BPMNShape id="dDoc" bpmnElement="DocA"><dc:Bounds x="500" y="30" width="90" height="30"/></bpmndi:BPMNShape></bpmndi:BPMNPlane>');
const ce4 = r("experiments/e3/corpus/ce4-two-pools-message.bpmn");
const notation = r("tests/fixtures/corpus/notation.bpmn");
const DOCS = { pool, ce4, notation };

const TOK = {
  taskLine: "#aa0001", taskFill: "#aa0002", eventLine: "#bb0001", eventFill: "#bb0002", gatewayLine: "#cc0001", gatewayFill: "#cc0002",
  poolLine: "#dd0001", poolFill: "#dd0002", laneLine: "#ee0001", laneFill: "#ee0002", externalLine: "#ff0001", externalFill: "#ff0002",
  docLine: "#110001", docFill: "#110002", dataLine: "#220001", dataFill: "#220002", appLine: "#330001", appFill: "#330002",
  flow: "#440001", link: "#550001", text: "#660001", headerText: "#770001", stroke: "#880001",
};
const TOK2 = { ...TOK, taskLine: "#0a0b0c", taskFill: "#0a0b0d", flow: "#0e0f10" };
const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

const KINDS = {
  pool: { Pool: "pool", LaneA: "lane", LaneB: "lane", Start: "event", End: "event", Fill: "task", Approve: "task", Sub: "task", Gate: "gateway", Call: "external", Data: "data", App: "app", DocA: "doc", AppLink: "link", F1: "flow", F2: "flow", F3: "flow", F4: "flow", F5: "flow", F6: "flow" },
  ce4: { Pa: "pool", Pb: "pool", T1: "task", T2: "event", MF: "flow" },
  notation: { S: "event", E: "event", B: "event", G: "gateway", EG: "gateway", CG: "gateway", T: "task", TX: "task", AH: "task", DS: "data", F1: "flow", F2: "flow" },
};
const PAIRS = { task: ["taskLine", "taskFill"], event: ["eventLine", "eventFill"], gateway: ["gatewayLine", "gatewayFill"], pool: ["poolLine", "poolFill"], lane: ["laneLine", "laneFill"], external: ["externalLine", "externalFill"], data: ["dataLine", "dataFill"], doc: ["docLine", "docFill"], app: ["appLine", "appFill"] };

const userDoc = pool.replace('id="Defs"', 'xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" id="Defs"').replace('<bpmndi:BPMNShape id="dFill" bpmnElement="Fill">', '<bpmndi:BPMNShape id="dFill" bpmnElement="Fill" bioc:stroke="#123456" bioc:fill="#abcdef">');
const normSvg = (s) => s.replace(/ id="[^"]*"/g, "").replace(/marker-[a-z0-9]+/g, "marker-X").replace(/url\(["']?#[^)"']+["']?\)/g, "url(#X)");

test("colored profile in a real browser", { timeout: 400000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-colored.mjs", "colored", async (pg) => {
    const ev = (fn, arg) => pg.evaluate(fn, arg);
    const mount = (xml, options) => ev(([x, op]) => window.col.mount(x, op), [xml, options]);
    const out = { plain: {}, tok: {}, std: {} };

    for (const [name, xml] of Object.entries(DOCS)) {
      const std = await mount(xml, { profile: "standard" });
      const none = await mount(xml, { profile: "colored" });
      const tok = await mount(xml, { profile: "colored", coloredTokens: TOK });
      out.plain[name] = {
        hasRenderer: none.hasRenderer,
        equal: JSON.stringify(await ev(([i]) => window.col.markup(i, false), [std.id])) === JSON.stringify(await ev(([i]) => window.col.markup(i, false), [none.id])),
        count: Object.keys(await ev(([i]) => window.col.markup(i, false), [std.id])).length,
      };
      const stdStripped = await ev(([i]) => window.col.markup(i, true), [std.id]);
      const tokStripped = await ev(([i]) => window.col.markup(i, true), [tok.id]);
      const diffs = Object.keys(stdStripped).filter((k) => stdStripped[k] !== tokStripped[k]);
      out.tok[name] = { hasRenderer: tok.hasRenderer, diffs, count: Object.keys(stdStripped).length, facts: await ev(([i]) => window.col.facts(i), [tok.id]), stdFacts: await ev(([i]) => window.col.facts(i), [std.id]) };
      for (const x of [std, none, tok]) await ev(([i]) => window.col.destroy(i), [x.id]);
    }

    // user colours (BPMN-in-Color) win over tokens
    const u = await mount(userDoc, { profile: "colored", coloredTokens: TOK });
    out.user = await ev(([i]) => window.col.facts(i), [u.id]);
    await ev(([i]) => window.col.destroy(i), [u.id]);

    // (d) two instances with different tokens
    const a = await mount(pool, { profile: "colored", coloredTokens: TOK });
    const b = await mount(pool, { profile: "colored", coloredTokens: TOK2 });
    const fa = await ev(([i]) => window.col.facts(i), [a.id]);
    const fb = await ev(([i]) => window.col.facts(i), [b.id]);
    const ids = await ev(() => window.col.markerIds());
    await ev(([i]) => window.col.destroy(i), [a.id]);
    const fb2 = await ev(([i]) => window.col.facts(i), [b.id]);
    out.two = { fa: fa.Fill, fb: fb.Fill, fF2a: fa.F2, fF2b: fb.F2, idsUnique: new Set(ids).size === ids.length, idCount: ids.length, bAfterDestroy: JSON.stringify(fb2) === JSON.stringify(fb), bMarker: fb2.F2.markerEnd };
    await ev(([i]) => window.col.destroy(i), [b.id]);

    // (e) static render
    out.render = {
      std: await ev(([x, op]) => window.col.render(x, op), [pool, { profile: "standard" }]),
      none: await ev(([x, op]) => window.col.render(x, op), [pool, { profile: "colored" }]),
      tok: await ev(([x, op]) => window.col.render(x, op), [pool, { profile: "colored", coloredTokens: TOK }]),
    };

    // (f) editing keeps colours
    const e = await mount(pool, { profile: "colored", coloredTokens: TOK });
    await ev(([i]) => window.col.edit(i, { move: ["Fill", 40, 0] }), [e.id]);
    await ev(([i]) => window.col.edit(i, { rename: ["Fill", "Renamed task"] }), [e.id]);
    const newId = await ev(([i]) => window.col.edit(i, { create: { type: "bpmn:Task", x: 700, y: 120, parent: "LaneA" } }), [e.id]);
    const fe = await ev(([i]) => window.col.facts(i), [e.id]);
    out.edit = { Fill: fe.Fill, F2: fe.F2, created: fe[newId], newId };
    await ev(([i]) => window.col.destroy(i), [e.id]);
    return out;
  });

  const checkShape = (id, kind, f, label) => {
    const [lineKey, fillKey] = PAIRS[kind];
    const line = rgb(TOK[lineKey]);
    assert.deepEqual(f.strokes.filter((s) => s !== line), [], `${label}${id} (${kind}): every stroke is ${TOK[lineKey]}, got ${JSON.stringify(f.strokes)}`);
    assert.ok(f.strokes.length > 0, `${label}${id} has a stroke`);
    assert.equal(f.firstFill, rgb(TOK[fillKey]), `${label}${id} fill`);
    const textColour = rgb(kind === "pool" || kind === "lane" ? TOK.headerText : TOK.text);
    for (const c of f.texts) assert.equal(c, textColour, `${label}${id} text`);
  };
  const checkConnection = (id, kind, f) => {
    const colourKey = kind === "link" ? "link" : "flow";
    const want = rgb(TOK[colourKey]);
    assert.equal(f.mainPathStroke, want, `${id} path stroke`);
    for (const s of f.strokes) assert.equal(s, want, `${id} strokes`);
    for (const m of [f.markerEnd, f.markerStart]) {
      if (!m) continue;
      assert.equal(m.missing, undefined, `${id} marker resolves`);
      for (const part of m.parts) if (part.stroke && part.stroke !== "none") assert.equal(part.stroke, want, `${id} marker stroke`);
    }
  };

  for (const name of Object.keys(DOCS)) {
    await t.test(`(a) ${name}: colored without tokens adds no renderer and its markup equals the standard profile`, () => {
      assert.equal(o.plain[name].hasRenderer, false);
      assert.ok(o.plain[name].count >= 5, String(o.plain[name].count));
      assert.equal(o.plain[name].equal, true);
    });
    await t.test(`(b) ${name}: with tokens only colour attributes differ from the standard profile (no geometry change)`, () => {
      assert.equal(o.tok[name].hasRenderer, true);
      assert.deepEqual(o.tok[name].diffs, []);
    });
    await t.test(`(b) ${name}: every element takes the colours of its kind, inner decorations and markers included`, () => {
      for (const [id, kind] of Object.entries(KINDS[name])) {
        const f = o.tok[name].facts[id];
        assert.ok(f, `${id} is drawn`);
        if (f.connection) checkConnection(id, kind, f);
        else checkShape(id, kind, f, "");
      }
      for (const [id, f] of Object.entries(o.tok[name].facts)) if (/_label$/.test(id)) for (const c of f.texts) assert.equal(c, rgb(TOK.text), `${id} external label text`);
    });
  }

  await t.test("(b) negative controls: the standard profile does not carry the token colours, and the checked texts exist", () => {
    const std = o.tok.pool.stdFacts;
    assert.ok(!std.Fill.strokes.includes(rgb(TOK.taskLine)));
    assert.notEqual(std.Fill.firstFill, rgb(TOK.taskFill));
    assert.ok(!std.F2.markerEnd.parts.some((p) => p.stroke === rgb(TOK.flow)));
    const f = o.tok.pool.facts;
    assert.ok(f.Fill.texts.length > 0 && f.Pool.texts.length > 0 && f.LaneA.texts.length > 0 && f.DocA.texts.length > 0, "labels were drawn and checked");
    assert.ok(f.F2.markerEnd && !f.F2.markerEnd.missing && f.F2.markerEnd.parts.length > 0, "the arrowhead marker was found and checked");
    assert.ok(f.Call.strokes.length >= 1 && f.B === undefined);
  });

  await t.test("colours set on an element (BPMN-in-Color) keep priority over the tokens; neighbours still use tokens", () => {
    assert.equal(o.user.Fill.firstStroke, "rgb(18, 52, 86)");
    assert.equal(o.user.Fill.firstFill, "rgb(171, 205, 239)");
    assert.equal(o.user.Approve.firstFill, rgb(TOK.taskFill));
    assert.equal(o.user.Approve.firstStroke, rgb(TOK.taskLine));
  });

  await t.test("(b) every kind of the token set is exercised (task, event, gateway, pool, lane, external, data, doc, app, flow, link)", () => {
    const seen = new Set(Object.values(KINDS).flatMap((k) => Object.values(k)));
    for (const kind of ["task", "event", "gateway", "pool", "lane", "external", "data", "doc", "app", "flow", "link"]) assert.ok(seen.has(kind), kind);
  });

  await t.test("(c) notation is preserved while coloured: inclusive gateway keeps its circle, boundary timer its clock", () => {
    const tok = o.tok.notation.facts;
    const std = o.tok.notation.stdFacts;
    assert.ok(tok.G.circles >= 1 && tok.G.circles === std.G.circles, JSON.stringify([tok.G.circles, std.G.circles]));
    assert.ok(tok.B.circles >= 3 && tok.B.circles === std.B.circles, JSON.stringify([tok.B.circles, std.B.circles]));
    assert.equal(tok.B.paths, std.B.paths);
    assert.equal(tok.EG.circles, std.EG.circles);
    assert.equal(tok.CG.paths, std.CG.paths);
    assert.equal(tok.G.firstFill, rgb(TOK.gatewayFill));
    assert.equal(tok.B.firstFill, rgb(TOK.eventFill));
  });

  await t.test("(c) message flow ends and conditional markers follow the flow colour", () => {
    const mf = o.tok.ce4.facts.MF;
    assert.ok(mf.markerStart && mf.markerEnd, "message flow has both markers");
    assert.ok(mf.markerStart.parts.some((p) => p.stroke === rgb(TOK.flow)));
    assert.ok(mf.markerEnd.parts.some((p) => p.stroke === rgb(TOK.flow)));
  });

  await t.test("(d) two instances with different tokens stay independent; ids unique; destroying one leaves the other intact", () => {
    assert.equal(o.two.fa.strokes[0], rgb(TOK.taskLine));
    assert.equal(o.two.fb.strokes[0], rgb(TOK2.taskLine));
    assert.equal(o.two.fa.firstFill, rgb(TOK.taskFill));
    assert.equal(o.two.fb.firstFill, rgb(TOK2.taskFill));
    assert.equal(o.two.fF2a.mainPathStroke, rgb(TOK.flow));
    assert.equal(o.two.fF2b.mainPathStroke, rgb(TOK2.flow));
    assert.ok(o.two.idCount > 0 && o.two.idsUnique, `${o.two.idCount} ids`);
    assert.equal(o.two.bAfterDestroy, true);
    assert.equal(o.two.bMarker.missing, undefined);
  });

  await t.test("(e) renderDiagrams colored: tokens reach the SVG; without tokens it equals the standard render", () => {
    assert.equal(o.render.tok.diagrams.length, 1);
    const svg = o.render.tok.diagrams[0].svg;
    for (const hex of [TOK.taskFill, TOK.flow, TOK.eventFill, TOK.gatewayFill, TOK.poolFill, TOK.laneFill, TOK.externalFill, TOK.dataFill]) assert.ok(svg.includes(rgb(hex)), `${hex} in the SVG`);
    assert.equal(normSvg(o.render.none.diagrams[0].svg), normSvg(o.render.std.diagrams[0].svg));
    assert.notEqual(normSvg(svg), normSvg(o.render.std.diagrams[0].svg));
    assert.deepEqual(o.render.tok.diagnostics.filter((d) => d.severity === "error"), []);
  });

  await t.test("(f) editing keeps the colours: moved and renamed task, redrawn connection, a newly created task", () => {
    checkShape("Fill", "task", o.edit.Fill, "after edit: ");
    assert.equal(o.edit.F2.mainPathStroke, rgb(TOK.flow));
    assert.ok(o.edit.newId && o.edit.created, "a task was created");
    checkShape(o.edit.newId, "task", o.edit.created, "created: ");
  });

  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
