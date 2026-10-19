import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { parseDefinitions } from "../dist/io/index.js";
import { readReferencePages } from "../dist/io/reference-model.js";
import { referenceDrawio } from "../dist/io/reference-drawio.js";
import { referenceSparx } from "../dist/io/reference-sparx.js";
import { differences, substitution } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
function artifact(c, role, file = true) {
  const a = c.inputArtifacts.find(a => a.role === role && (!!a.path === file));
  if (!a) return undefined;
  if (!a.path) return a.json;
  const bytes = readFileSync(new URL(a.path, root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
  return a.path.endsWith(".json") ? JSON.parse(bytes) : bytes.toString();
}
const attrs = element => Object.fromEntries([...element.attributes].map(a => [a.name, a.value]));
const numbers = element => Object.fromEntries([...element.attributes].map(a => [a.name, Number(a.value)]));
const children = (element, tag) => [...element.children].filter(e => e.localName === tag);
function xmlProjection(xml, project) {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  try { return project(dom.window.document); } finally { dom.window.close(); }
}
function drawioProjection(xml) {
  return xmlProjection(xml, doc => [...doc.getElementsByTagName("diagram")].map(diagram => {
    const model = diagram.firstElementChild;
    return { ...attrs(diagram), pageWidth: Number(model.getAttribute("pageWidth")), pageHeight: Number(model.getAttribute("pageHeight")),
      cells: [...model.getElementsByTagName("mxCell")].map(cell => {
        const out = attrs(cell);
        for (const flag of ["edge", "vertex"]) if (out[flag] !== undefined) out[flag] = out[flag] === "1";
        const geometry = cell.firstElementChild;
        if (geometry) {
          out.geometry = numbers(geometry); delete out.geometry.as;
          if (geometry.hasAttribute("relative")) out.geometry.relative = geometry.getAttribute("relative") === "1";
          for (const point of children(geometry, "mxPoint")) { const name = point.getAttribute("as"); out.geometry[name] = numbers(point); delete out.geometry[name].as; }
          const array = children(geometry, "Array")[0];
          if (array) out.geometry.points = children(array, "mxPoint").map(numbers);
        }
        return out;
      }) };
  }));
}
function sparxProjection(xml) {
  return xmlProjection(xml, doc => {
    const all = [...doc.getElementsByTagName("*")];
    const processes = all.filter(e => e.localName === "process");
    return processes.map(process => {
      const diagram = all.find(e => e.localName === "BPMNDiagram" && e.firstElementChild?.getAttribute("bpmnElement") === process.id);
      const plane = diagram.firstElementChild;
      return { process: { id: process.id, name: process.getAttribute("name"),
        lanes: [...process.getElementsByTagNameNS("*", "lane")].map(lane => ({ id: lane.id, name: lane.getAttribute("name"), flowNodeRefs: children(lane, "flowNodeRef").map(e => e.textContent) })),
        elements: [...process.children].filter(e => !["laneSet", "sequenceFlow", "association"].includes(e.localName)).map(e => ({ tag: e.localName, ...attrs(e), ...(e.localName === "textAnnotation" ? { text: e.firstElementChild.textContent } : {}) })),
        connectors: [...process.children].filter(e => ["sequenceFlow", "association"].includes(e.localName)).map(e => ({ tag: e.localName, ...attrs(e) })),
      }, diagram: { id: diagram.id, name: diagram.getAttribute("name"), plane: plane.id,
        shapes: children(plane, "BPMNShape").map(e => ({ ...attrs(e), ...(e.hasAttribute("isHorizontal") ? { isHorizontal: e.getAttribute("isHorizontal") === "true" } : {}), bounds: numbers(e.firstElementChild) })),
        edges: children(plane, "BPMNEdge").map(e => ({ ...attrs(e), waypoints: children(e, "waypoint").map(numbers), ...(children(e, "BPMNLabel")[0]?.firstElementChild ? { label: numbers(children(e, "BPMNLabel")[0].firstElementChild) } : {}) })),
      } };
    });
  });
}
function pageProjection(pages) {
  return pages.map(page => ({ ...page, nodes: Object.fromEntries([...page.nodes].map(([id, node]) => {
    const { type, ...rest } = node;
    return [id, { ...rest, kind: type, ...(node.dir === "doc" ? { dir: "document" } : {}) }];
  })), apps: Object.fromEntries(page.apps), connections: page.connections.map(c => ({ ...c, kind: c.kind })) }));
}
async function observe(c, suffix = "") {
  const policy = artifact(c, suffix ? `policy-${suffix}` : "policy");
  const descriptor = artifact(c, suffix ? `descriptor-${suffix}` : "descriptor");
  const selection = artifact(c, suffix ? `descriptor-${suffix}-id` : "descriptor", false);
  const options = { businessPolicy: policy, descriptor, descriptorId: selection?.id };
  const before = JSON.stringify(options);
  const xml = artifact(c, "bpmn");
  try {
    const { rootElement } = await parseDefinitions(xml, options);
    const pages = readReferencePages(rootElement, policy, descriptor?.uri);
    const out = { status: "ok" };
    if (c.operation !== "x24.export.sparx" && c.operation !== "x24.export.drawio") out.pages = pageProjection(pages);
    if (c.operation === "x24.export.sparx") out.models = sparxProjection(referenceSparx(pages, options));
    if (c.operation === "x24.export.drawio") out.pages = drawioProjection(referenceDrawio(pages, options));
    if (c.operation === "x24.export.legacy") { out.drawio = { pages: drawioProjection(referenceDrawio(pages, options)) }; out.sparx = sparxProjection(referenceSparx(pages, options)); }
    return out;
  } catch (error) {
    return { status: "refused", code: error.code ?? "operation-error", ids: [...(error.ids ?? [])] };
  } finally { assert.equal(JSON.stringify(options), before, `${c.caseId} caller data unchanged`); }
}
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (!["x24.export.reference", "x24.export.sparx", "x24.export.drawio", "x24.export.legacy"].includes(c.operation)) continue;
  test(`${c.caseId} sealed export policy`, async () => {
    if (c.inputArtifacts.some(a => a.role === "policy-a")) {
      const runs = {};
      for (const suffix of ["a", "b"]) runs[suffix] = { status: "success", artifacts: { results: await observe(c, suffix) } };
      assert.deepEqual(substitution(c, { runs }).failures, [], c.caseId);
    } else {
      const actual = await observe(c);
      const expected = c.expectedArtifacts.find(a => a.role === (c.expectedStatus === "success" ? "results" : "refusal")).json;
      assert.deepEqual(differences(actual, expected), [], c.caseId);
    }
  });
}
