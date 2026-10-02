// Boundary events follow the host the layout moved or resized. Pure geometry plus a read of the
// element registry; no engine import, so it is testable under Node.
import type { Box } from "../swimlaneLayout.js";
import type { LayoutChange } from "./autoLayout.js";

// bpmn-js / diagram-js elements are not typed at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;

type Side = "top" | "right" | "bottom" | "left";

/**
 * A boundary event stays on the border of its host: same side, same fraction along that side, with
 * its own size. Computed from the host's old and new boxes.
 */
export function boundaryBounds(old: Box, event: Box, next: Box): Box {
  const cx = event.x + event.w / 2;
  const cy = event.y + event.h / 2;
  const dist: Array<[Side, number]> = [
    ["top", Math.abs(cy - old.y)],
    ["bottom", Math.abs(cy - (old.y + old.h))],
    ["left", Math.abs(cx - old.x)],
    ["right", Math.abs(cx - (old.x + old.w))],
  ];
  const side = dist.reduce((best, d) => (d[1] < best[1] ? d : best))[0];
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const horizontal = side === "top" || side === "bottom";
  const t = horizontal ? clamp((cx - old.x) / (old.w || 1)) : clamp((cy - old.y) / (old.h || 1));
  const ncx = horizontal ? next.x + t * next.w : side === "left" ? next.x : next.x + next.w;
  const ncy = horizontal ? (side === "top" ? next.y : next.y + next.h) : next.y + t * next.h;
  return { x: Math.round(ncx - event.w / 2), y: Math.round(ncy - event.h / 2), w: event.w, h: event.h };
}

/**
 * Boundary events follow the host the layout moved or resized, and the connections that start or end
 * on them are listed for re-routing (they are not in the layout model, so the layout gives them no
 * waypoints). An event whose host was not placed is left alone. Returns changes only; DI is never created.
 */
export function boundaryChanges(registry: El, changes: LayoutChange[]): { changes: LayoutChange[]; reroute: El[] } {
  const hostBounds = new Map<El, Box>();
  for (const ch of changes) if (ch.bounds) hostBounds.set(ch.element, ch.bounds);
  const out: LayoutChange[] = [];
  const events: El[] = [];
  for (const e of registry.getAll() as El[]) {
    if (e.type !== "bpmn:BoundaryEvent" || !e.host) continue;
    const next = hostBounds.get(e.host);
    if (!next) continue;
    const old: Box = { x: e.host.x, y: e.host.y, w: e.host.width, h: e.host.height };
    const nb = boundaryBounds(old, { x: e.x, y: e.y, w: e.width, h: e.height }, next);
    out.push({ element: e, bounds: nb });
    events.push(e);
    const label = e.label;
    if (label) out.push({ element: label, bounds: { x: label.x + (nb.x - e.x), y: label.y + (nb.y - e.y), w: label.width, h: label.height } });
  }
  const ids = new Set(events.map((e) => e.id));
  const reroute = (registry.getAll() as El[]).filter((e) => e.waypoints && e.source && e.target && (ids.has(e.source.id) || ids.has(e.target.id)));
  return { changes: out, reroute };
}
