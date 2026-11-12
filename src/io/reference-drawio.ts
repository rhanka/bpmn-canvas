import type { BusinessPolicy } from "../internal/business-policy.js";
import { ProfileContractError } from "../profile/canonical.js";
// Reference Draw.io export: the original exporter's mxfile, rule for rule (cell order, ids, style strings, geometry
// offsets, anchors, page links), written with its serializer (ElementTree). Lanes are keyed by name as the original
// does, so the quirks of homonymous or unnamed lanes stay inside this codec; the canvas never uses them.
import type { IoOptions } from "./errors.js";
import { resolveIoOptions } from "./errors.js";
import { etDocument, pyFmt, pyNum, xmlNode } from "./pyserial.js";
import type { XmlNode } from "./pyserial.js";
import { ITEM_TYPES } from "./reference-model.js";
import type { RefBox, RefNode, RefPage, RefPoint } from "./reference-model.js";

function writer(policy?: BusinessPolicy) {
  const styles = policy?.presentation?.exportStyles?.drawio;
  if (!styles) throw new ProfileContractError("profile-resource-missing");
const poolStyle = styles.pool;
const laneStyle = styles.lane;
const startStyle = styles.start;
const endStyle = styles.end;
const taskStyle = styles.task;
const gatewayBase = styles.gatewayBase;
const externalStyle = styles.external;
const appStyle = styles.application;
const docStyle = styles.document;
const itemStyle = styles.item;
const edgeHead = styles.edgeHead;
const flowTail = styles.flowTail;
const linkTail = styles.linkTail;
const subprocessStyle = styles.subprocess;
const eventStyle = styles.event;
const poolHeaderW = styles.poolHeaderWidth;
const dx = styles.dx;
const dy = styles.dy;
const appBand = styles.appBand;
function nodeStyle(n: RefNode): string {
  switch (n.type) {
    case "start": return startStyle;
    case "end": return endStyle;
    case "gateway": return `${gatewayBase}${n.subtype === "AND" ? "parallel" : "exclusive"};`;
    case "subprocess": return subprocessStyle;
    case "call": return externalStyle;
    case "event": return eventStyle;
    case "document": return docStyle;
    default:
      if (ITEM_TYPES.has(n.type)) {
        const out = n.type === "object-out" || n.type === "port-out";
        return `${itemStyle}bpmnTransferType=${out ? "output" : "input"};`;
      }
      return taskStyle;
  }
}

function labelStyle(n: RefNode): string {
  if (ITEM_TYPES.has(n.type)) return `verticalLabelPosition=bottom;labelWidth=${n.labelBox ? pyNum(n.labelBox.w) : "100"};`;
  if (n.labelBox && (n.type === "start" || n.type === "end" || n.type === "event" || n.type === "gateway")) return `whiteSpace=wrap;labelWidth=${pyNum(n.labelBox.w)};`;
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
  return `${edgeHead}exitX=${pyFmt(ex)};exitY=${pyFmt(ey)};entryX=${pyFmt(nx)};entryY=${pyFmt(ny)};${link ? linkTail : flowTail}`;
}

function processPageHref(n: RefNode, page: RefPage, pages: readonly RefPage[]): string | undefined {
  const target = pages.find((p) => p.processId === n.calledProcess);
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
  const poolW = pool.w + dx;
  const poolH = pool.h + dy;
  const px = pool.x;
  const py = pool.y;
  const poolCell = vertex("1", page.name, poolStyle, px, py, poolW, poolH);
  const laneCell = new Map<string, readonly [string, number, number]>();
  for (const lane of page.lanes) {
    if (laneCell.has(lane.name)) continue;
    const lx = poolHeaderW;
    const ly = lane.box.y - py + dy;
    laneCell.set(lane.name, [vertex(poolCell, lane.name, laneStyle, lx, ly, poolW - poolHeaderW, lane.box.h), px + lx, py + ly]);
  }
  const cellOf = new Map<string, string>();
  const absBox = new Map<string, Rect>();
  const appCell = new Map<string, string>();
  const appBox = new Map<string, Rect>();
  for (const id of page.order) {
    const n = page.nodes.get(id)!;
    const x = n.box.x + dx;
    const y = n.box.y + dy;
    const key = n.laneIndex === undefined ? undefined : n.laneName || `Lane ${n.laneIndex + 1}`;
    const host = key === undefined ? undefined : laneCell.get(key);
    const [parent, ox, oy] = host ?? [poolCell, px, py];
    let style = nodeStyle(n) + labelStyle(n);
    if (page.applicationsByHost.has(id)) style += `spacingBottom=${appBand};`;
    cellOf.set(id, vertex(parent, n.label, style, x - ox, y - oy, n.box.w, n.box.h, processPageHref(n, page, pages)));
    absBox.set(id, [x, y, n.box.w, n.box.h]);
    const app = page.applicationsByHost.get(id);
    if (n.application && app) {
      const a = app.box;
      appCell.set(id, vertex(cellOf.get(id)!, String(n.application), appStyle, a.x - n.box.x, a.y - n.box.y, a.w, a.h));
      appBox.set(id, [a.x + dx, a.y + dy, a.w, a.h]);
    }
  }
  for (const conn of page.connections) {
    if (conn.points.length < 2 || !cellOf.has(conn.source) || !cellOf.has(conn.target)) continue;
    const points = conn.points.map(([x, y]) => [x + dx, y + dy] as const);
    const end = (id: string): readonly [string, Rect] =>
      conn.kind === "data" && appCell.has(id) ? [appCell.get(id)!, appBox.get(id)!] : [cellOf.get(id)!, absBox.get(id)!];
    const [sCell, sBox] = end(conn.source);
    const [tCell, tBox] = end(conn.target);
    edge(sCell, tCell, conn.label || "", edgeStyle(points, sBox, tBox, conn.kind !== "sequence"), points);
  }
  return xmlNode("diagram", { id: `diagram-${page.index}`, name: page.name }, [
    xmlNode("mxGraphModel", {
      dx: "0", dy: "0", grid: "1", gridSize: "10", guides: "1", tooltips: "1", connect: "1", arrows: "1", fold: "1",
      page: "1", pageScale: "1", pageWidth: pyNum(poolW + 80), pageHeight: pyNum(poolH + 80),
    }, [xmlNode("root", {}, cells)]),
  ]);
}

/** BPMN (as shown) → the reference mxfile. */
function referenceDrawio(pages: readonly RefPage[], options?: IoOptions): string {
  const attrs: Record<string, string> = { host: resolveIoOptions(options).host };
  if (options?.drawio?.agent !== undefined) attrs.agent = options.drawio.agent;
  return etDocument(xmlNode("mxfile", attrs, pages.map((p) => buildPage(p, pages))));
}

return referenceDrawio;
}
export function referenceDrawio(pages: readonly RefPage[], options?: IoOptions): string { return writer(options?.businessPolicy)(pages, options); }
