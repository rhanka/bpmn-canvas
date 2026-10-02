// Draw.io -> page graph. Anything not understood is refused, never guessed.
// Adapted from an internal implementation.
import { drawioPages } from "./drawio-pages.js";
import { DRAWIO_STYLES } from "./drawio-encode.js";
import { IoError, resolveIoOptions } from "./errors.js";
import type { IoOptions } from "./errors.js";
import { boundsOf, numberAttribute } from "./graph.js";
import type { GraphEdge, GraphNode, GraphPage, NodeKind } from "./graph.js";

function styleOf(cell: Element): Map<string, string> {
  return new Map(
    (cell.getAttribute("style") || "")
      .split(";")
      .filter(Boolean)
      .map((part): [string, string] => {
        const [key = "", ...rest] = part.split("=");
        return [key, rest.join("=")];
      }),
  );
}

function kindOf(cell: Element, parent: Element | undefined, kindAttributes: readonly string[]): NodeKind {
  for (const name of kindAttributes) {
    const explicit = cell.getAttribute(name);
    if (explicit && Object.hasOwn(DRAWIO_STYLES, explicit)) return explicit as NodeKind;
  }
  const style = styleOf(cell);
  const shape = style.get("shape");
  if (style.has("swimlane") || shape === "swimlane") {
    const ps = parent && styleOf(parent);
    return ps?.has("swimlane") || ps?.get("shape") === "swimlane" ? "lane" : "participant";
  }
  if (shape === "mxgraph.bpmn.task" && [undefined, "abstract"].includes(style.get("taskMarker"))) {
    return style.get("isLoopSub") === "1" ? "subProcess" : "task";
  }
  if (shape === "mxgraph.bpmn.event") {
    const outline = style.get("outline");
    const symbol = style.get("symbol");
    if (symbol && !["general", "terminate2"].includes(symbol)) throw new IoError("unsupported-event-symbol", `Unsupported event symbol: ${symbol}`);
    const event: Record<string, NodeKind> = { standard: "startEvent", end: "endEvent", catching: "intermediateCatchEvent", throwing: "intermediateThrowEvent" };
    const found = outline ? event[outline] : undefined;
    if (found) return found;
  }
  if (shape === "mxgraph.bpmn.gateway2") {
    const gateway: Record<string, NodeKind> = { exclusive: "exclusiveGateway", parallel: "parallelGateway", inclusive: "inclusiveGateway" };
    const found = gateway[style.get("gwType") || ""];
    if (found) return found;
  }
  if (shape === "mxgraph.bpmn.data") return "dataObjectReference";
  if (shape === "mxgraph.archimate3.application") {
    if (style.get("appType") === "proc") return "callActivity";
    if (style.get("appType") === "comp") return "textAnnotation";
  }
  if (["mxgraph.archimate3.representation", "note"].includes(shape || "")) return "textAnnotation";
  throw new IoError("unsupported-shape", `Unsupported Draw.io shape: ${shape || cell.getAttribute("id")}`, [cell.getAttribute("id") ?? ""]);
}

export async function decodeDrawio(xml: string, options?: IoOptions): Promise<GraphPage[]> {
  const resolved = resolveIoOptions(options);
  const kindAttributes = [resolved.kindAttribute, ...resolved.legacyKindAttributes];
  const result: GraphPage[] = [];
  for (const [pageIndex, page] of (await drawioPages(xml, options)).entries()) {
    const roots = Array.from(page.model.children);
    const root = roots[0];
    if (roots.length !== 1 || !root || root.localName !== "root" || Array.from(root.children).some((e) => e.localName !== "mxCell")) {
      throw new IoError("unsupported-structure", "Unsupported Draw.io model structure");
    }
    if (page.model.querySelector("object, UserObject")) throw new IoError("object-wrappers", "Draw.io object wrappers are not supported");
    const cells = Array.from(page.model.querySelectorAll("root > mxCell"));
    if (cells.length > 20_000) throw new IoError("too-many-cells", "Draw.io page has too many cells");
    const byId = new Map<string | null, Element>(cells.map((c) => [c.getAttribute("id"), c]));
    if (byId.size !== cells.length || byId.has(null)) throw new IoError("duplicate-cell-id", "Duplicate or missing Draw.io cell ID");
    if (cells.some((c) => !["0", "1"].includes(c.id) && c.getAttribute("vertex") !== "1" && c.getAttribute("edge") !== "1")) {
      throw new IoError("unsupported-cell", "Unsupported Draw.io cell");
    }
    const vertices = cells.filter((c) => c.getAttribute("vertex") === "1");
    if (!vertices.length) throw new IoError("empty-page", "Draw.io page is empty");
    const idMap = new Map(cells.map((c, i): [string, string] => [c.getAttribute("id") ?? "", `p${pageIndex}_c${i}`]));
    const geometry = new Map<string, GraphNode["bounds"]>();
    const absolute = (id: string, path = new Set<string>()): GraphNode["bounds"] => {
      const known = geometry.get(id);
      if (known) return known;
      if (path.has(id)) throw new IoError("cyclic-hierarchy", "Cyclic Draw.io cell hierarchy");
      path.add(id);
      const cell = byId.get(id);
      const g = cell?.querySelector(":scope > mxGeometry");
      if (!cell || !g || g.getAttribute("relative") === "1") throw new IoError("relative-vertex", "Relative Draw.io vertices are not supported", [id]);
      const bounds = boundsOf(g);
      const parentId = cell.getAttribute("parent") || "";
      const parent = byId.get(parentId);
      if (!parent) throw new IoError("missing-parent", "Missing Draw.io cell parent", [id]);
      if (parent.getAttribute("vertex") === "1") {
        const offset = absolute(parentId, path);
        bounds.x += offset.x;
        bounds.y += offset.y;
      }
      geometry.set(id, bounds);
      return bounds;
    };
    const nodes = vertices.map((cell): GraphNode => {
      const id = cell.getAttribute("id") ?? "";
      const parent = byId.get(cell.getAttribute("parent"));
      const kind = kindOf(cell, parent, kindAttributes);
      const style = styleOf(cell);
      const value = cell.getAttribute("value") || "";
      let label = style.get("html") === "1" ? new DOMParser().parseFromString(value, "text/html").body.textContent || "" : value;
      if (style.get("appType") === "comp") label = `[App] ${label}`;
      if (style.get("shape") === "mxgraph.archimate3.representation") label = `[Doc] ${label}`;
      return { id: idMap.get(id) ?? id, kind, label, bounds: absolute(id), parent: idMap.get(cell.getAttribute("parent") || "") };
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = cells
      .filter((c) => c.getAttribute("edge") === "1")
      .map((cell) => {
        const source = idMap.get(cell.getAttribute("source") || "") || "";
        const target = idMap.get(cell.getAttribute("target") || "") || "";
        if (!nodeIds.has(source) || !nodeIds.has(target)) throw new IoError("missing-endpoint", "Missing Draw.io edge endpoint", [cell.getAttribute("id") ?? ""]);
        const style = styleOf(cell);
        const explicit = kindAttributes.map((name) => cell.getAttribute(name)).find((v) => !!v) ?? null;
        if (explicit && !["sequenceFlow", "association"].includes(explicit)) throw new IoError("unsupported-edge", "Unsupported Draw.io edge type");
        const nonFlow = nodes.some((n) => [source, target].includes(n.id) && ["textAnnotation", "dataObjectReference"].includes(n.kind));
        const kind = explicit || (nonFlow || style.get("dashed") === "1" ? "association" : "sequenceFlow");
        const point = (p: Element): { x: number; y: number } => ({ x: numberAttribute(p, "x"), y: numberAttribute(p, "y") });
        const points = ['mxPoint[as="sourcePoint"]', 'Array[as="points"] > mxPoint', 'mxPoint[as="targetPoint"]'].flatMap((selector) => Array.from(cell.querySelectorAll(selector)).map(point));
        return { id: idMap.get(cell.getAttribute("id") ?? "") ?? "", kind: kind as GraphEdge["kind"], label: cell.getAttribute("value") || "", source, target, points };
      });
    for (const node of nodes) {
      const parent = nodes.find((n) => n.id === node.parent);
      if (parent?.kind === "task" && node.label.startsWith("[App] ")) {
        edges.push({ id: `${node.id}_attachment`, kind: "association", label: "", source: node.id, target: parent.id, points: [] });
      }
      if (parent && !["participant", "lane"].includes(parent.kind)) node.parent = parent.parent;
      if (!nodes.some((n) => n.id === node.parent)) node.parent = undefined;
    }
    if (nodes.filter((n) => n.kind === "participant").length > 1) throw new IoError("multiple-pools", "Draw.io import supports one pool per page");
    if (!nodes.some((n) => !["participant", "lane"].includes(n.kind))) throw new IoError("no-bpmn-nodes", "Draw.io page has no BPMN nodes");
    if (cells.some((c) => !c.hasAttribute("vertex") && !c.hasAttribute("edge") && (c.getAttribute("value") || c.getAttribute("style")))) {
      throw new IoError("unsupported-decoration", "Unsupported Draw.io decoration");
    }
    result.push({ id: page.id, name: page.name, nodes, edges });
  }
  return result;
}
