// Initial canvas view: show the whole diagram when it fits at a readable scale,
// otherwise a readable zoom anchored on the start of the process (first lane with
// the start event), never an empty area. Pure geometry, computed from the element
// model, not from rendered bounding boxes.

export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type ShapeLike = Box & { type: string };

/** Fit-all is used down to this scale. */
export const MIN_FIT_SCALE = 0.6;
/** Zoom used when the whole diagram would be smaller than MIN_FIT_SCALE. */
export const READABLE_SCALE = 0.85;
const MARGIN = 24;

export type InitialView = { mode: "fit" | "anchor"; viewbox: Box; scale: number };

export function contentBounds(shapes: readonly ShapeLike[]): Box | null {
  if (shapes.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const s of shapes) {
    x1 = Math.min(x1, s.x);
    y1 = Math.min(y1, s.y);
    x2 = Math.max(x2, s.x + s.width);
    y2 = Math.max(y2, s.y + s.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const CONTAINERS = new Set(["bpmn:Participant", "bpmn:Lane", "label"]);

/** The start event, else the left-most flow element. */
export function anchorShape(shapes: readonly ShapeLike[]): ShapeLike | null {
  const start = shapes.find((s) => s.type === "bpmn:StartEvent");
  if (start) return start;
  const flow = shapes.filter((s) => !CONTAINERS.has(s.type));
  if (flow.length === 0) return null;
  return flow.reduce((a, b) => (b.x < a.x || (b.x === a.x && b.y < a.y) ? b : a));
}

/**
 * `leftInset`: pixels covered on the left by the editor palette, kept free
 * so the pool/lane headers are never hidden under it.
 * `whole`: always fit the whole diagram (minimized canvas).
 */
export function initialView(
  shapes: readonly ShapeLike[],
  container: Size,
  leftInset = 0,
  whole = false,
): InitialView | null {
  const bounds = contentBounds(shapes);
  const RIGHT_MARGIN = 48;
  const usable = container.width - leftInset - RIGHT_MARGIN;
  if (!bounds || usable <= 0 || container.height <= 0) return null;
  const fitScale = Math.min(
    usable / (bounds.width + 2 * MARGIN),
    container.height / (bounds.height + 2 * MARGIN),
  );
  if (whole || fitScale >= MIN_FIT_SCALE) {
    const scale = Math.min(fitScale, 1);
    const width = container.width / scale;
    const height = container.height / scale;
    return {
      mode: "fit",
      scale,
      viewbox: {
        x: bounds.x - MARGIN - leftInset / scale,
        y: bounds.y + bounds.height / 2 - height / 2,
        width,
        height,
      },
    };
  }
  const scale = READABLE_SCALE;
  const width = container.width / scale;
  const height = container.height / scale;
  const inset = leftInset / scale;
  const anchor = anchorShape(shapes) ?? bounds;
  // Left: the diagram's left edge (pool/lane headers) just right of the
  // palette, unless the anchor would fall out of the first half of the view.
  let x = bounds.x - MARGIN - inset;
  if (anchor.x + anchor.width > x + inset + (width - inset) * 0.5)
    x = anchor.x - inset - (width - inset) * 0.2;
  // Top: the anchor in the upper third, never above the diagram.
  let y = Math.max(bounds.y - MARGIN, anchor.y + anchor.height / 2 - height / 3);
  y = Math.min(y, Math.max(bounds.y - MARGIN, bounds.y + bounds.height + MARGIN - height));
  return { mode: "anchor", viewbox: { x, y, width, height }, scale };
}
