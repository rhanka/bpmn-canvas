// Reference Sparx export: the original exporter's BPMN 2.0 interchange file, rule for rule (ids made from labels with
// one set of used ids over all pages, lanes keyed by name with the last homonymous lane winning, `_gui` DI ids,
// anchors as fractions, waypoints rebuilt from them), written with its serializer (minidom `toprettyxml`). Element
// order follows the original, which is not schema order: the file is meant for Sparx EA import, as the original's.
import type { IoOptions } from "./errors.js";
import { mdPretty, pyFloatStr, pyNum, xmlNode } from "./pyserial.js";
import type { XmlNode } from "./pyserial.js";
import type { RefBox, RefPage, RefPoint } from "./reference-model.js";

const MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI";
const DC = "http://www.omg.org/spec/DD/20100524/DC";
const DI = "http://www.omg.org/spec/DD/20100524/DI";
const ELEMENT_TAG: Readonly<Record<string, string>> = {
  TASK: "task", "SUB-PROCESS": "subProcess", EXTERNAL_PROCESS: "callActivity", START: "startEvent", END: "endEvent",
  EVENT: "intermediateThrowEvent", TASK_INPUT: "dataObjectReference", TASK_OUTPUT: "dataObjectReference",
  EXTERNAL_INPUT: "dataObjectReference", PROCESS_OUTPUT: "dataObjectReference", DOCUMENT: "textAnnotation",
};
const FLOW_NODE_TAGS = new Set(["task", "subProcess", "callActivity", "startEvent", "endEvent", "exclusiveGateway", "parallelGateway", "inclusiveGateway", "intermediateThrowEvent"]);

/** XML NCName from any text (the original `normalize_id`). */
export function normalizeId(raw: string): string {
  if (!raw) return "";
  let c = raw.replace(/-/g, "_").replace(/\./g, "_").replace(/ /g, "_").replace(/[^A-Za-z0-9_]/g, "_");
  if (c && /^[0-9]/.test(c)) c = `id_${c}`;
  return c || "id";
}

function slug(text: string, prefix: string): string {
  let base = (text || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || prefix;
  if (/^[0-9]/.test(base)) base = `${prefix}_${base}`;
  return normalizeId(base.slice(0, 60));
}

interface SElement { id: string; type: string; name: string; parent: string | undefined; b: RefBox }
interface SLane { id: string; name: string; b: RefBox }
interface SConnector { id: string; source: string; target: string; name: string; kind: "FLOW" | "ASSOC"; waypoints: readonly RefPoint[]; exitX: number; exitY: number; entryX: number; entryY: number }

/** BPMN (as shown) → the reference Sparx file. */
export function referenceSparx(pages: readonly RefPage[], options?: IoOptions): string {
  const used = new Set<string>();
  const fresh = (text: string, prefix: string): string => {
    let cand = slug(text, prefix);
    for (let i = 2; used.has(cand); i++) cand = normalizeId(`${slug(text, prefix)}_${i}`);
    used.add(cand);
    return cand;
  };
  const built = pages.map((page) => {
    const procId = fresh(page.name || `Process ${page.index + 1}`, "Process");
    const swimlanes: SLane[] = [];
    const laneIds = new Map<string, string>();
    for (const lane of page.lanes) {
      const lid = fresh(lane.name, "Lane");
      laneIds.set(lane.name, lid);
      swimlanes.push({ id: lid, name: lane.name, b: lane.box });
    }
    const elements: SElement[] = [];
    const elemIds = new Map<string, string>();
    for (const id of page.order) {
      const n = page.nodes.get(id)!;
      const tag = n.type === "GATEWAY" ? (n.subtype === "AND" ? "parallelGateway" : "exclusiveGateway") : ELEMENT_TAG[n.type] ?? "task";
      const eid = fresh(n.label, "Node");
      elemIds.set(id, eid);
      elements.push({ id: eid, type: tag, name: n.label, parent: laneIds.get(n.laneName ?? ""), b: n.box });
    }
    for (const host of page.flowOrder) {
      const app = page.apps.get(host);
      const n = page.nodes.get(host)!;
      if (!app || !n.appLabel) continue;
      elements.push({ id: fresh(`App_${n.label}`, "App"), type: "textAnnotation", name: `[Component] ${n.appLabel}`, parent: laneIds.get(n.laneName ?? ""), b: app.box });
    }
    const connectors: SConnector[] = [];
    for (const conn of page.connections) {
      if (!elemIds.has(conn.source) || !elemIds.has(conn.target)) continue;
      const pts = conn.points;
      const sb = page.nodes.get(conn.source)!.box;
      const tb = page.nodes.get(conn.target)!.box;
      let exitX = 0.5, exitY = 0.5, entryX = 0.5, entryY = 0.5;
      if (pts.length && sb.w && sb.h) {
        exitX = Math.min(1, Math.max(0, (pts[0]![0] - sb.x) / sb.w));
        exitY = Math.min(1, Math.max(0, (pts[0]![1] - sb.y) / sb.h));
      }
      if (pts.length && tb.w && tb.h) {
        entryX = Math.min(1, Math.max(0, (pts[pts.length - 1]![0] - tb.x) / tb.w));
        entryY = Math.min(1, Math.max(0, (pts[pts.length - 1]![1] - tb.y) / tb.h));
      }
      const s = page.nodes.get(conn.source)!.label;
      const t = page.nodes.get(conn.target)!.label;
      connectors.push({
        id: fresh(`${s}_${t}`, "Flow"), source: elemIds.get(conn.source)!, target: elemIds.get(conn.target)!, name: conn.label || "",
        kind: conn.kind === "FLOW" ? "FLOW" : "ASSOC", waypoints: pts.length > 2 ? pts.slice(1, -1) : [], exitX, exitY, entryX, entryY,
      });
    }
    return { name: page.name, procId, swimlanes, elements, connectors };
  });

  const roots: XmlNode[] = [];
  for (const page of built) {
    const { procId } = page;
    const lookup = new Map<string, SElement | SLane>();
    for (const e of page.elements) lookup.set(normalizeId(e.id), e);
    for (const s of page.swimlanes) lookup.set(normalizeId(s.id), s);
    const processChildren: XmlNode[] = [];
    if (page.swimlanes.length) {
      processChildren.push(xmlNode("bpmn:laneSet", { id: `LaneSet_${procId}` }, page.swimlanes.map((lane) =>
        xmlNode("bpmn:lane", { id: normalizeId(lane.id), name: lane.name },
          page.elements.filter((e) => e.parent === lane.id && FLOW_NODE_TAGS.has(e.type)).map((e) => xmlNode("bpmn:flowNodeRef", {}, [], normalizeId(e.id)))))));
    }
    for (const e of page.elements) {
      const eid = normalizeId(e.id);
      if (e.type === "textAnnotation") processChildren.push(xmlNode("bpmn:textAnnotation", { id: eid }, [xmlNode("bpmn:text", {}, [], e.name)]));
      else processChildren.push(xmlNode(`bpmn:${e.type}`, { id: eid, name: e.name }));
    }
    for (const c of page.connectors) {
      const fid = normalizeId(c.id);
      if (c.kind === "ASSOC") processChildren.push(xmlNode("bpmn:association", { id: fid, sourceRef: normalizeId(c.source), targetRef: normalizeId(c.target) }));
      else processChildren.push(xmlNode("bpmn:sequenceFlow", { id: fid, name: c.name, sourceRef: normalizeId(c.source), targetRef: normalizeId(c.target) }));
    }
    roots.push(xmlNode("bpmn:process", { id: procId, name: page.name, isExecutable: "false" }, processChildren));

    const bounds = (b: RefBox): XmlNode => xmlNode("dc:Bounds", { x: pyNum(b.x), y: pyNum(b.y), width: pyNum(b.w), height: pyNum(b.h) });
    const planeChildren: XmlNode[] = [];
    for (const lane of page.swimlanes) {
      const lid = normalizeId(lane.id);
      planeChildren.push(xmlNode("bpmndi:BPMNShape", { id: `${lid}_gui`, bpmnElement: lid, isHorizontal: "true" }, [bounds(lane.b)]));
    }
    for (const e of page.elements) {
      const eid = normalizeId(e.id);
      planeChildren.push(xmlNode("bpmndi:BPMNShape", { id: `${eid}_gui`, bpmnElement: eid }, [bounds(e.b)]));
    }
    for (const c of page.connectors) {
      const cid = normalizeId(c.id);
      const se = lookup.get(normalizeId(c.source));
      const te = lookup.get(normalizeId(c.target));
      const full: Array<readonly [number, number]> = [];
      if (se && te) {
        full.push([se.b.x + se.b.w * c.exitX, se.b.y + se.b.h * c.exitY]);
        for (const p of c.waypoints) full.push(p);
        full.push([te.b.x + te.b.w * c.entryX, te.b.y + te.b.h * c.entryY]);
      }
      const children: XmlNode[] = full.map(([x, y]) => xmlNode("di:waypoint", { x: pyFloatStr(x), y: pyFloatStr(y) }));
      if (c.name) {
        if (full.length >= 2) {
          const mid = Math.floor(full.length / 2);
          const p1 = full[mid - 1]!;
          const p2 = full[mid]!;
          const mx = (p1[0] + p2[0]) / 2;
          const my = (p1[1] + p2[1]) / 2;
          children.push(xmlNode("bpmndi:BPMNLabel", {}, [xmlNode("dc:Bounds", { x: pyFloatStr(mx - 20), y: pyFloatStr(my - 10), width: "40", height: "20" })]));
        } else {
          children.push(xmlNode("bpmndi:BPMNLabel"));
        }
      }
      planeChildren.push(xmlNode("bpmndi:BPMNEdge", { id: `${cid}_gui`, bpmnElement: cid }, children));
    }
    roots.push(xmlNode("bpmndi:BPMNDiagram", { id: `BPMNDiagram_${procId}`, name: `${page.name} - Diagram` }, [
      xmlNode("bpmndi:BPMNPlane", { id: `BPMNPlane_${procId}`, bpmnElement: procId }, planeChildren),
    ]));
  }
  return mdPretty(xmlNode("bpmn:definitions", {
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", "xmlns:bpmn": MODEL, "xmlns:bpmndi": BPMNDI, "xmlns:dc": DC, "xmlns:di": DI,
    targetNamespace: "http://bpmn.io/schema/bpmn",
    exporter: options?.sparx?.exporter ?? "bpmn-canvas",
    exporterVersion: options?.sparx?.exporterVersion ?? "0.4.0",
  }, roots));
}
