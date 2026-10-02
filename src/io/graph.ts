// Page graph shared by the Draw.io codecs. Adapted from an internal implementation.
import { IoError } from "./errors.js";

export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
export type NodeKind =
  | "participant"
  | "lane"
  | "task"
  | "subProcess"
  | "callActivity"
  | "startEvent"
  | "endEvent"
  | "intermediateCatchEvent"
  | "intermediateThrowEvent"
  | "exclusiveGateway"
  | "parallelGateway"
  | "inclusiveGateway"
  | "dataObjectReference"
  | "textAnnotation";
export type GraphNode = { id: string; kind: NodeKind; label: string; bounds: Bounds; parent?: string | undefined };
export type GraphEdge = { id: string; kind: "sequenceFlow" | "association"; label: string; source: string; target: string; points: Point[] };
export type GraphPage = { id: string; name: string; nodes: GraphNode[]; edges: GraphEdge[] };

export function children(root: Document | Element, ns: string, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(ns, name));
}

export function addXml(parent: Element, name: string, attrs: Record<string, string | number> = {}, ns: string | null = null): Element {
  const e = parent.ownerDocument.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

export function numberAttribute(e: Element, name: string, fallback?: number): number {
  const value = e.getAttribute(name);
  if (value === null && fallback !== undefined) return fallback;
  const n = value === null || !value.trim() ? NaN : Number(value);
  if (!Number.isFinite(n)) throw new IoError("invalid-geometry", `Invalid geometry: ${name}`);
  return n;
}

export function boundsOf(e: Element): Bounds {
  const box = { x: numberAttribute(e, "x", 0), y: numberAttribute(e, "y", 0), width: numberAttribute(e, "width"), height: numberAttribute(e, "height") };
  if (box.width <= 0 || box.height <= 0) throw new IoError("invalid-geometry", "Diagram shape has no positive size");
  return box;
}
