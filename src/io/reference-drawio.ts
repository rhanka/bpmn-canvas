// Reference Draw.io export: the original exporter's mxfile, rule for rule (cell order, ids, style strings, geometry
// offsets, anchors, page links), written with its serializer (ElementTree). Lanes are keyed by name as the original
// does, so the quirks of homonymous or unnamed lanes stay inside this codec; the canvas never uses them.
import type { IoOptions } from "./errors.js";
import { resolveIoOptions } from "./errors.js";
import { etDocument, pyFmt, pyNum, xmlNode } from "./pyserial.js";
import type { XmlNode } from "./pyserial.js";
import { ITEM_TYPES } from "./reference-model.js";
import type { RefBox, RefNode, RefPage, RefPoint } from "./reference-model.js";

const POOL_STYLE = "swimlane;whiteSpace=wrap;resizeParent=1;resizeParentMax=0;horizontal=0;startSize=40;horizontalStack=0;html=1;separatorColor=#0F3180;swimlaneLine=1;rounded=0;shadow=1;glass=0;fillColor=#eee7df;fontColor=#595959;fontSize=14;";
const LANE_STYLE = "swimlane;whiteSpace=wrap;startSize=70;horizontal=0;html=1;fontColor=#595959;fontSize=16;";
const START_STYLE = "shape=mxgraph.bpmn.event;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;outline=standard;symbol=general;fillColor=#E27676;strokeWidth=1;strokeColor=#000000;";
const END_STYLE = "shape=mxgraph.bpmn.event;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;outline=end;symbol=terminate2;fillColor=#E27676;";
const TASK_STYLE = "shape=mxgraph.bpmn.task;whiteSpace=wrap;rectStyle=rounded;size=10;html=1;container=1;expand=0;collapsible=0;taskMarker=abstract;fillColor=#f6f1ea;gradientColor=#ECE2D4;gradientDirection=east;";
const GATEWAY_BASE = "shape=mxgraph.bpmn.gateway2;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=rhombusPerimeter;outlineConnect=0;outline=none;symbol=none;fillColor=#60BE89;gwType=";
const EXTERNAL_STYLE = "html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#ffff99;shape=mxgraph.archimate3.application;appType=proc;archiType=rounded;";
const APP_STYLE = "html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.application;appType=comp;archiType=square;fontSize=12;fontStyle=1;spacingRight=22;align=right;spacingLeft=5;";
const DOC_STYLE = "html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#ffe599;shape=mxgraph.archimate3.representation;fontSize=11;verticalAlign=top;spacingTop=18;";
const ITEM_STYLE = "shape=mxgraph.bpmn.data;size=8;labelPosition=center;align=center;verticalAlign=top;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#000000;";
const EDGE_HEAD = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;";
const FLOW_TAIL = "rounded=0;html=1;verticalAlign=bottom;align=center;labelBackgroundColor=#ffffff;";
const LINK_TAIL = "rounded=0;html=1;dashed=1;dashPattern=5 5;strokeColor=#b85450;endArrow=none;startArrow=none;";
const SUBPROCESS_STYLE = TASK_STYLE.replace("taskMarker=abstract;", "taskMarker=abstract;isLoopSub=1;");
const EVENT_STYLE = "shape=mxgraph.bpmn.event;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;outline=throwing;symbol=general;fillColor=#E27676;";
const POOL_HEADER_W = 40;
const DX = 50;
const DY = 0;
const APP_BAND = 10;
function nodeStyle(n: RefNode): string {
  switch (n.type) {
    case "START": return START_STYLE;
    case "END": return END_STYLE;
    case "GATEWAY": return `${GATEWAY_BASE}${n.subtype === "AND" ? "parallel" : "exclusive"};`;
    case "SUB-PROCESS": return SUBPROCESS_STYLE;
    case "EXTERNAL_PROCESS": return EXTERNAL_STYLE;
    case "EVENT": return EVENT_STYLE;
    case "DOCUMENT": return DOC_STYLE;
    default:
      if (ITEM_TYPES.has(n.type)) {
        const out = n.type === "TASK_OUTPUT" || n.type === "PROCESS_OUTPUT";
        return `${ITEM_STYLE}bpmnTransferType=${out ? "output" : "input"};`;
      }
      return TASK_STYLE;
  }
}

function labelStyle(n: RefNode): string {
  if (ITEM_TYPES.has(n.type)) return `verticalLabelPosition=bottom;labelWidth=${n.labelBox ? pyNum(n.labelBox.w) : "100"};`;
  if (n.labelBox && (n.type === "START" || n.type === "END" || n.type === "EVENT" || n.type === "GATEWAY")) return `whiteSpace=wrap;labelWidth=${pyNum(n.labelBox.w)};`;
  return "";
}

type Rect = readonly [number, number, number, number];

function sideAnchor(p: RefPoint, toward: RefPoint, box: Rect): [number, number] {
  const [x, y, w, h] = box;
  const dx = toward[0] - p[0];
  const dy = toward[1] - p[1];
  const fx = w ? Math.min(1, Math.max(0, (p[0] - x) / w)) : 0.5;
  const fy = h ? Math.min(1, Math.max(0, (p[1] - y) / h)) : 0.5;
  if (Math.abs(dx) >= Math.abs(dy)) return [dx > 0 ? 1 : 0, fy];
  return [fx, dy > 0 ? 1 : 0];
}

function edgeStyle(points: readonly RefPoint[], src: Rect, tgt: Rect, link: boolean): string {
  const [ex, ey] = sideAnchor(points[0]!, points[1]!, src);
  const [nx, ny] = sideAnchor(points[points.length - 1]!, points[points.length - 2]!, tgt);
  return `${EDGE_HEAD}exitX=${pyFmt(ex)};exitY=${pyFmt(ey)};entryX=${pyFmt(nx)};entryY=${pyFmt(ny)};${link ? LINK_TAIL : FLOW_TAIL}`;
}

function pageLink(n: RefNode, page: RefPage, pages: readonly RefPage[]): string | undefined {
  const target = pages.find((p) => p.processId === n.targetProcessId);
  return target && target.index !== page.index ? `data:page/id,diagram-${target.index}` : undefined;
}

function buildPage(page: RefPage, pages: readonly RefPage[]): XmlNode {
  const cells: XmlNode[] = [xmlNode("mxCell", { id: "0" }), xmlNode("mxCell", { id: "1", parent: "0" })];
  let seq = 2;
  const vertex = (parent: string, value: string, style: string, x: number, y: number, w: number, h: number, link?: string): string => {
    const id = `c${seq++}`;
    const attrs: Record<string, string> = { id, value: value || "", style, vertex: "1", parent };
    if (link) attrs.link = link;
    cells.push(xmlNode("mxCell", attrs, [xmlNode("mxGeometry", { x: pyFmt(x), y: pyFmt(y), width: pyFmt(w), height: pyFmt(h), as: "geometry" })]));
    return id;
  };
  const edge = (source: string, target: string, value: string, style: string, points: readonly RefPoint[]): void => {
    const id = `c${seq++}`;
    const geo: XmlNode[] = [];
    if (points.length) {
      geo.push(xmlNode("mxPoint", { x: pyFmt(points[0]![0]), y: pyFmt(points[0]![1]), as: "sourcePoint" }));
      geo.push(xmlNode("mxPoint", { x: pyFmt(points[points.length - 1]![0]), y: pyFmt(points[points.length - 1]![1]), as: "targetPoint" }));
      if (points.length > 2) geo.push(xmlNode("Array", { as: "points" }, points.slice(1, -1).map(([x, y]) => xmlNode("mxPoint", { x: pyFmt(x), y: pyFmt(y) }))));
    }
    cells.push(xmlNode("mxCell", { id, value: value || "", style, edge: "1", parent: "1", source, target }, [xmlNode("mxGeometry", { relative: "1", as: "geometry" }, geo)]));
  };

  const pool: RefBox = page.pool;
  const poolW = pool.w + DX;
  const poolH = pool.h + DY;
  const px = pool.x;
  const py = pool.y;
  const poolCell = vertex("1", page.name, POOL_STYLE, px, py, poolW, poolH);
  const laneCell = new Map<string, readonly [string, number, number]>();
  for (const lane of page.lanes) {
    if (laneCell.has(lane.name)) continue;
    const lx = POOL_HEADER_W;
    const ly = lane.box.y - py + DY;
    laneCell.set(lane.name, [vertex(poolCell, lane.name, LANE_STYLE, lx, ly, poolW - POOL_HEADER_W, lane.box.h), px + lx, py + ly]);
  }
  const cellOf = new Map<string, string>();
  const absBox = new Map<string, Rect>();
  const appCell = new Map<string, string>();
  const appBox = new Map<string, Rect>();
  for (const id of page.order) {
    const n = page.nodes.get(id)!;
    const x = n.box.x + DX;
    const y = n.box.y + DY;
    const key = n.laneIndex === undefined ? undefined : n.laneName || `Lane ${n.laneIndex + 1}`;
    const host = key === undefined ? undefined : laneCell.get(key);
    const [parent, ox, oy] = host ?? [poolCell, px, py];
    let style = nodeStyle(n) + labelStyle(n);
    if (page.apps.has(id)) style += `spacingBottom=${APP_BAND};`;
    cellOf.set(id, vertex(parent, n.label, style, x - ox, y - oy, n.box.w, n.box.h, pageLink(n, page, pages)));
    absBox.set(id, [x, y, n.box.w, n.box.h]);
    const app = page.apps.get(id);
    if (n.appLabel && app) {
      const a = app.box;
      appCell.set(id, vertex(cellOf.get(id)!, String(n.appLabel), APP_STYLE, a.x - n.box.x, a.y - n.box.y, a.w, a.h));
      appBox.set(id, [a.x + DX, a.y + DY, a.w, a.h]);
    }
  }
  for (const conn of page.connections) {
    if (conn.points.length < 2 || !cellOf.has(conn.source) || !cellOf.has(conn.target)) continue;
    const points = conn.points.map(([x, y]) => [x + DX, y + DY] as const);
    const end = (id: string): readonly [string, Rect] =>
      conn.kind === "DATA" && appCell.has(id) ? [appCell.get(id)!, appBox.get(id)!] : [cellOf.get(id)!, absBox.get(id)!];
    const [sCell, sBox] = end(conn.source);
    const [tCell, tBox] = end(conn.target);
    edge(sCell, tCell, conn.label || "", edgeStyle(points, sBox, tBox, conn.kind !== "FLOW"), points);
  }
  return xmlNode("diagram", { id: `diagram-${page.index}`, name: page.name }, [
    xmlNode("mxGraphModel", {
      dx: "0", dy: "0", grid: "1", gridSize: "10", guides: "1", tooltips: "1", connect: "1", arrows: "1", fold: "1",
      page: "1", pageScale: "1", pageWidth: pyNum(poolW + 80), pageHeight: pyNum(poolH + 80),
    }, [xmlNode("root", {}, cells)]),
  ]);
}

/** BPMN (as shown) → the reference mxfile. */
export function referenceDrawio(pages: readonly RefPage[], options?: IoOptions): string {
  const attrs: Record<string, string> = { host: resolveIoOptions(options).host };
  if (options?.drawio?.agent !== undefined) attrs.agent = options.drawio.agent;
  return etDocument(xmlNode("mxfile", attrs, pages.map((p) => buildPage(p, pages))));
}
