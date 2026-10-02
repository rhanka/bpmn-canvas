import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";
import { validateBpmnXsd } from "./helpers/xsd.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const r = (p) => readFileSync(root + p, "utf8");
const pool = r("tests/fixtures/io/pool-lanes.bpmn");
const two = r("tests/fixtures/io/two-processes.bpmn");
const ce4 = r("experiments/e3/corpus/ce4-two-pools-message.bpmn");
const ce5 = r("experiments/e3/corpus/ce5-two-diagrams-shared-root.bpmn");
const MAX = 8 * 1024 * 1024;

const nodesOf = (p) => p.nodes.map((n) => [n.kind, n.label, n.bounds]);
const edgesOf = (p) => p.edges.map((e) => [e.kind, e.label, e.points]);
const endpoints = (p) => {
  const label = (id) => p.nodes.find((n) => n.id === id)?.label;
  return p.edges.map((e) => [label(e.source), label(e.target)]);
};

const mx = (cells) => `<mxfile><diagram id="d" name="Page"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
const vertex = (id, style, extra = "", geom = '<mxGeometry as="geometry" x="10" y="10" width="100" height="60"/>') => `<mxCell id="${id}" vertex="1" parent="1" style="${style}" ${extra}>${geom}</mxCell>`;
const TASK = "shape=mxgraph.bpmn.task;taskMarker=abstract;";

test("io codecs in a real browser", { timeout: 300000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-io.mjs", "io", async (pg) => {
    const call = (name, ...args) => pg.evaluate(([n, a]) => window.io.call(n, ...a), [name, args]);
    const out = { hasDecompression: await pg.evaluate(() => window.io.hasDecompression) };

    // exact bytes and fidelity notices
    const edited = pool.replaceAll("Fill form", "Current edit");
    out.bpmn = await call("exportDiagram", edited, "bpmn");
    out.sparx = await call("exportDiagram", edited, "sparx");
    out.drawioExport = await call("exportDiagram", pool, "drawio");

    // round trip, uncompressed and compressed, single pool and two processes
    out.round = {};
    for (const [name, xml] of [["pool", pool], ["two", two]]) {
      const source = (await call("bpmnGraph", xml)).ok;
      const drawio = (await call("encodeDrawio", source)).ok;
      const imported = await call("importDiagram", drawio);
      const back = (await call("bpmnGraph", imported.ok.xml)).ok;
      const compressed = await pg.evaluate((d) => window.io.compressPages(d), drawio);
      const plain = (await call("decodeDrawio", drawio)).ok;
      const comp = (await call("decodeDrawio", compressed)).ok;
      out.round[name] = { source, back, imported: imported.ok, plainEqualsCompressed: JSON.stringify(plain) === JSON.stringify(comp), xml: imported.ok.xml, drawio };
    }

    // native import: unchanged bytes
    out.nativeImport = await call("importDiagram", pool);
    out.validate = {};
    for (const [name, xml] of [["pool", pool], ["two", two], ["ce4", ce4], ["ce5", ce5]]) out.validate[name] = await call("validateNativeBpmn", xml);

    // options
    const drawio = out.round.pool.drawio;
    out.optKind = (await call("exportDiagram", pool, "drawio", { kindAttribute: "kindX", host: "my-host" })).ok.xml;
    out.optDefault = out.drawioExport.ok.xml;
    const legacy = (await call("exportDiagram", pool, "drawio", { kindAttribute: "oldKind" })).ok.xml;
    out.legacyWithout = (await call("decodeDrawio", legacy)).ok[0].nodes.find((n) => n.label === "Notify")?.kind;
    out.legacyWith = (await call("decodeDrawio", legacy, { legacyKindAttributes: ["oldKind"] })).ok[0].nodes.find((n) => n.label === "Notify")?.kind;
    out.nsCustom = (await call("importDiagram", drawio, { targetNamespace: "urn:test:x" })).ok.xml;
    out.maxBytes = await call("exportDiagram", pool, "bpmn", { maxBytes: 100 });
    const stripped = drawio.replace(/ bpmnKind="[^"]*"/g, "");
    out.styleOnly = (await call("decodeDrawio", stripped)).ok[0];
    out.unknownShape = await call("importDiagram", stripped.replace("shape=mxgraph.bpmn.task", "shape=rectangle"));

    // export refusals
    const refuse = {};
    refuse.userTask = ["unsupported-element", pool.replace('<bpmn:task id="Approve"', '<bpmn:userTask id="Approve"')];
    refuse.boundaryEvent = ["unsupported-element", pool.replace('<bpmn:endEvent id="End" name="Done"/>', '<bpmn:endEvent id="End" name="Done"/><bpmn:boundaryEvent id="Bnd" attachedToRef="Fill"/>')];
    refuse.conditional = ["unsupported-element", pool.replace("</bpmn:process>", "<bpmn:conditionExpression/></bpmn:process>")];
    refuse.nested = ["nested-subprocess", pool.replace('<bpmn:subProcess id="Sub" name="Check"/>', '<bpmn:subProcess id="Sub" name="Check"><bpmn:task id="Inner"/></bpmn:subProcess>')];
    refuse.noDi = ["element-without-di", pool.replace(/.*id="dData".*\n/, "")];
    refuse.unresolvedShape = ["unresolved-shape", pool.replace('id="dFill" bpmnElement="Fill"', 'id="dFill" bpmnElement="missing"')];
    refuse.twoParticipants = ["multiple-participants", `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="x"><bpmn:collaboration id="C"><bpmn:participant id="P1" processRef="A"/><bpmn:participant id="P2" processRef="B"/></bpmn:collaboration><bpmn:process id="A"><bpmn:task id="TA"/></bpmn:process><bpmn:process id="B"><bpmn:task id="TB"/></bpmn:process><bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="C"><bpmndi:BPMNShape id="s1" bpmnElement="P1"><dc:Bounds x="0" y="0" width="300" height="100"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="s2" bpmnElement="P2"><dc:Bounds x="0" y="150" width="300" height="100"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="s3" bpmnElement="TA"><dc:Bounds x="50" y="20" width="100" height="60"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="s4" bpmnElement="TB"><dc:Bounds x="50" y="170" width="100" height="60"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`];
    out.exportRefusals = {};
    for (const [k, [code, xml]] of Object.entries(refuse)) out.exportRefusals[k] = { code, res: await call("exportDiagram", xml, "drawio") };

    // native refusals
    const nat = {
      broken: ["invalid-xml", "<broken"],
      noNamespace: ["not-bpmn", "<definitions/>"],
      xmi: ["not-bpmn", '<xmi:XMI xmlns:xmi="http://www.omg.org/XMI"/>'],
      dtd: ["dtd", '<!DOCTYPE definitions [<!ENTITY e "x">]><definitions/>'],
      duplicate: ["duplicate-id", pool.replace('id="LaneB"', 'id="LaneA"')],
      unresolvedPlane: ["missing-di", pool.replaceAll('bpmnElement="Collab"', 'bpmnElement="missing"')],
      tooLarge: ["too-large", "x".repeat(MAX + 1)],
    };
    out.nativeRefusals = {};
    for (const [k, [code, xml]] of Object.entries(nat)) out.nativeRefusals[k] = { code, res: await call("importDiagram", xml) };
    out.unresolvedLink = await call("validateNativeBpmn", pool.replace('targetRef="Fill"', 'targetRef="gone"'));

    // Draw.io refusals
    const dio = {
      noPages: ["no-pages", "<mxfile/>"],
      unreadablePage: ["unsupported-page", "<mxfile><diagram>!!!not-base64!!!</diagram></mxfile>"],
      emptyModel: ["empty-page", "<mxfile><diagram><mxGraphModel><root/></mxGraphModel></diagram></mxfile>"],
      emptyPage: ["empty-page", mx("")],
      missingEndpoint: ["missing-endpoint", drawio.replace('source="n-Start"', 'source="missing"')],
      badGeometry: ["invalid-geometry", drawio.replace('width="120"', 'width="NaN"')],
      customShape: ["unsupported-structure", drawio.replace("<root>", '<root><customShape id="extra"/>')],
      plainCell: ["unsupported-cell", drawio.replace("<root>", '<root><mxCell id="extra" vertex="0"/>')],
      wrapper: ["object-wrappers", mx(vertex("v1", TASK) .replace("</mxCell>", "<object/></mxCell>"))],
      duplicateCell: ["duplicate-cell-id", mx(vertex("v1", TASK) + vertex("v1", TASK))],
      cyclic: ["cyclic-hierarchy", mx(`<mxCell id="a" vertex="1" parent="b" style="${TASK}"><mxGeometry as="geometry" x="0" y="0" width="10" height="10"/></mxCell><mxCell id="b" vertex="1" parent="a" style="${TASK}"><mxGeometry as="geometry" x="0" y="0" width="10" height="10"/></mxCell>`)],
      relative: ["relative-vertex", mx(vertex("v1", TASK, "", '<mxGeometry as="geometry" relative="1" width="10" height="10"/>'))],
      missingParent: ["missing-parent", mx(`<mxCell id="v1" vertex="1" parent="nope" style="${TASK}"><mxGeometry as="geometry" x="0" y="0" width="10" height="10"/></mxCell>`)],
      eventSymbol: ["unsupported-event-symbol", mx(vertex("v1", "shape=mxgraph.bpmn.event;outline=standard;symbol=message;"))],
      edgeKind: ["unsupported-edge", mx(vertex("v1", TASK) + vertex("v2", TASK) + '<mxCell id="e1" edge="1" parent="1" source="v1" target="v2" weirdKind="x"><mxGeometry as="geometry" relative="1"/></mxCell>').replace('weirdKind="x"', 'bpmnKind="weird"')],
      decoration: ["unsupported-decoration", mx(vertex("v1", TASK)).replace('<mxCell id="1" parent="0"/>', '<mxCell id="1" parent="0" style="x"/>')],
      twoPools: ["multiple-pools", mx(vertex("p1", "swimlane;horizontal=0;") + vertex("p2", "swimlane;horizontal=0;") + vertex("t1", TASK))],
      noBpmnNodes: ["no-bpmn-nodes", mx(vertex("p1", "swimlane;horizontal=0;"))],
      tooMany: ["too-many-cells", mx(Array.from({ length: 20001 }, (_, i) => vertex(`c${i}`, TASK)).join(""))],
    };
    out.drawioRefusals = {};
    for (const [k, [code, xml]] of Object.entries(dio)) out.drawioRefusals[k] = { code, res: await call("importDiagram", xml) };
    out.notDrawio = await call("decodeDrawio", "<other/>");
    out.bomb = await call("importDiagram", await pg.evaluate((n) => window.io.bomb(n), MAX + 1));
    return out;
  });

  await t.test("export bpmn and sparx return the exact input bytes, with their notices", () => {
    assert.equal(o.bpmn.ok.xml, pool.replaceAll("Fill form", "Current edit"));
    assert.deepEqual({ ...o.bpmn.ok, xml: undefined }, { xml: undefined, filename: "diagram.bpmn", mimeType: "application/bpmn+xml", fidelity: [] });
    assert.equal(o.sparx.ok.xml, o.bpmn.ok.xml);
    assert.equal(o.sparx.ok.filename, "diagram.sparx.xml");
    assert.deepEqual(o.sparx.ok.fidelity.map((f) => f.code), ["interchange-only"]);
    assert.deepEqual(o.drawioExport.ok.fidelity.map((f) => f.code), ["projection"]);
    assert.equal(o.drawioExport.ok.mimeType, "application/vnd.jgraph.mxfile");
  });

  for (const name of ["pool", "two"]) {
    await t.test(`${name}: BPMN -> Draw.io -> BPMN keeps names, kinds, labels, geometry, waypoints and links`, () => {
      const { source, back, imported } = o.round[name];
      assert.equal(imported.projected, true);
      assert.deepEqual(back.map((p) => p.name), source.map((p) => p.name));
      assert.equal(back.length, source.length);
      for (let i = 0; i < source.length; i++) {
        assert.deepEqual(nodesOf(back[i]), nodesOf(source[i]));
        assert.deepEqual(edgesOf(back[i]), edgesOf(source[i]));
        assert.deepEqual(endpoints(back[i]), endpoints(source[i]));
      }
    });
    await t.test(`${name}: compressed and uncompressed Draw.io decode to the same graph`, () => {
      assert.ok(o.hasDecompression);
      assert.equal(o.round[name].plainEqualsCompressed, true);
    });
    await t.test(`${name}: the regenerated BPMN is valid against the OMG schema`, async () => {
      const res = await validateBpmnXsd(o.round[name].xml);
      assert.deepEqual(res.errors, []);
      assert.equal(res.valid, true);
    });
  }

  await t.test("a projected import declares what it regenerated; a native import is unchanged and declares nothing", () => {
    assert.deepEqual(o.round.pool.imported.fidelity.map((f) => f.code), ["ids-regenerated", "di-regenerated", "data-links-as-associations", "labels-reduced-to-text"]);
    assert.equal(o.nativeImport.ok.projected, false);
    assert.equal(o.nativeImport.ok.xml, pool);
    assert.deepEqual(o.nativeImport.ok.fidelity, []);
  });

  await t.test("validateNativeBpmn returns native input unchanged, including several pools and shared root elements", () => {
    for (const [k, v] of Object.entries(o.validate)) assert.equal(v.ok, { pool, two, ce4, ce5 }[k], k);
  });

  await t.test("options: kind attribute, host, legacy attribute names, namespace, size ceiling", () => {
    assert.match(o.optKind, /kindX="/);
    assert.match(o.optKind, /host="my-host"/);
    assert.match(o.optDefault, / bpmnKind="/);
    assert.match(o.optDefault, /host="bpmn-canvas"/);
    assert.equal(o.legacyWithout, "task", "without the legacy name the call activity is read from its style");
    assert.equal(o.legacyWith, "callActivity");
    assert.match(o.nsCustom, /targetNamespace="urn:test:x"/);
    assert.equal(o.maxBytes.err.code, "too-large");
  });

  await t.test("without any kind attribute, shapes are recognized from their style and unknown shapes are refused", () => {
    assert.ok(o.styleOnly.nodes.some((n) => n.kind === "exclusiveGateway"));
    assert.ok(o.styleOnly.edges.some((e) => e.kind === "association"));
    assert.equal(o.unknownShape.err.code, "unsupported-shape");
    assert.match(o.unknownShape.err.message, /Unsupported Draw\.io shape/);
  });

  for (const k of ["userTask", "boundaryEvent", "conditional", "nested", "noDi", "unresolvedShape", "twoParticipants"]) {
    await t.test(`export refuses (${k}) with a typed error and no partial output`, () => {
      const { code, res } = o.exportRefusals[k];
      assert.equal(res.ok, undefined);
      assert.equal(res.err.name, "IoError");
      assert.equal(res.err.code, code, JSON.stringify(res.err));
    });
  }
  await t.test("export refusals name the offending ids", () => {
    assert.ok(o.exportRefusals.userTask.res.err.ids.includes("Approve"));
    assert.ok(o.exportRefusals.noDi.res.err.ids.includes("Data"));
    assert.match(o.exportRefusals.userTask.res.err.message, /does not support/);
  });

  for (const k of ["broken", "noNamespace", "xmi", "dtd", "duplicate", "unresolvedPlane", "tooLarge"]) {
    await t.test(`native input refused (${k})`, () => {
      const { code, res } = o.nativeRefusals[k];
      assert.equal(res.err?.code, code, JSON.stringify(res));
    });
  }
  await t.test("an unresolved link is refused by the viewer import before the document is accepted", () => {
    assert.equal(o.unresolvedLink.err.code, "import-warning");
  });

  for (const k of ["noPages", "unreadablePage", "emptyModel", "emptyPage", "missingEndpoint", "badGeometry", "customShape", "plainCell", "wrapper", "duplicateCell", "cyclic", "relative", "missingParent", "eventSymbol", "edgeKind", "decoration", "twoPools", "noBpmnNodes", "tooMany"]) {
    await t.test(`Draw.io input refused (${k})`, () => {
      const { code, res } = o.drawioRefusals[k];
      assert.equal(res.ok, undefined, "no partial result");
      assert.equal(res.err?.code, code, JSON.stringify(res));
    });
  }
  await t.test("decodeDrawio refuses a non-Draw.io document", () => {
    assert.equal(o.notDrawio.err.code, "not-drawio");
  });
  await t.test("a decompression bomb is refused at the size ceiling", () => {
    assert.equal(o.bomb.err.code, "too-large");
    assert.match(o.bomb.err.message, /8 MiB/);
  });
  await t.test("no console errors beyond bpmn-js logging the deliberately broken link", () => {
    // bpmn-js logs its own import error for the unresolved-link refusal case.
    const expected = /failed to import <bpmn:SequenceFlow id="F1"/;
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l) && !expected.test(l)), []);
  });
});
