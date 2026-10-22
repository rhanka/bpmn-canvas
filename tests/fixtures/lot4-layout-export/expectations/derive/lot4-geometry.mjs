// Exact-rational arithmetic for the DESIGN section 9.3/9.4 geometry rules as
// read by the spec author (README design points DP-IO, DP-TEMPLATE). Intermediate
// values are exact rationals; every output is rounded once, ties to even.
import { R, rat, add, sub, mul, div, max, min, cmp, roundEven } from "./lot4-core.mjs";

const half = x => div(R(x), rat(2n));
const box = (x, y, width, height) => ({ x: roundEven(x), y: roundEven(y), width: roundEven(width), height: roundEven(height) });
export const center = bounds => add(R(bounds.x), half(bounds.width));

// DP-IO (BLOCKB-PARITY-SYNC PS-06, DESIGN 9.4 L723 "Align centers on one IO row";
// replaces the harmonization K2 per-block centring): one row [body.y, body.y + RH]
// at the top of the resolved support body; every object centre on one line cy.
export function regionRow({ page, body, tokens, items }) {
  const { headerWidth, padding, gap, minHeight } = tokens;
  if (!items.length) return { pageBounds: { ...page }, body: { ...body }, items: [] };
  const left0 = add(add(R(body.x), R(headerWidth)), R(padding));
  const right0 = sub(add(R(body.x), R(body.width)), R(padding));
  let prevRight;
  const placed = items.map(item => {
    const w = R(item.object.width), h = R(item.object.height);
    const lw = item.label ? R(item.label.width) : rat(0n), lh = item.label ? R(item.label.height) : rat(0n);
    const extent = max(w, lw);
    let left = item.anchorCenterX !== undefined ? sub(item.anchorCenterX, half(extent)) : prevRight === undefined ? left0 : add(prevRight, R(gap));
    left = max(left, left0);
    if (prevRight !== undefined && cmp(left, add(prevRight, R(gap))) < 0) left = add(prevRight, R(gap));
    prevRight = add(left, extent);
    return { item, w, h, lw, lh, left, objX: add(left, half(sub(extent, w))), labelX: add(left, half(sub(extent, lw))), block: add(h, lh) };
  });
  // RH = max(minHeight, max(object.h + label.h) + 2*padding); A = max(object.h/2),
  // B = max(object.h/2 + label.h); cy = body.y + max(A, (RH + A - B)/2).
  const rowHeight = max(R(minHeight), add(max(...placed.map(p => p.block)), mul(R(padding), rat(2n))));
  const above = max(...placed.map(p => half(p.h)));
  const below = max(...placed.map(p => add(half(p.h), p.lh)));
  const cy = add(R(body.y), max(above, half(sub(add(rowHeight, above), below))));
  const width = add(R(body.width), max(rat(0n), sub(prevRight, right0)));
  const height = max(R(body.height), rowHeight, sub(add(cy, below), R(body.y)));
  const out = placed.map(p => {
    const top = sub(cy, half(p.h));
    const record = { elementId: p.item.elementId, occurrenceKey: p.item.occurrenceKey, bounds: box(p.objX, top, p.w, p.h) };
    if (p.item.label) record.labelBounds = box(p.labelX, add(cy, half(p.h)), p.lw, p.lh);
    return record;
  });
  const grownBody = box(body.x, body.y, width, height);
  const pageRight = max(add(R(page.x), R(page.width)), add(R(grownBody.x), R(grownBody.width)));
  const pageBottom = max(add(R(page.y), R(page.height)), add(R(grownBody.y), R(grownBody.height)));
  return { pageBounds: box(page.x, page.y, sub(pageRight, R(page.x)), sub(pageBottom, R(page.y))), body: grownBody, items: out };
}

// DESIGN section 9.3 template table.
export function headerBand(bounds, headerHeight) {
  const split = min(R(headerHeight), R(bounds.height));
  return { header: box(bounds.x, bounds.y, bounds.width, split), body: box(bounds.x, add(R(bounds.y), split), bounds.width, sub(R(bounds.height), split)) };
}
export function cornerFold(bounds, foldRatio, headerRotation, labelBounds) {
  const fold = roundEven(mul(min(R(bounds.width), R(bounds.height)), R(foldRatio)));
  const xr = bounds.x + bounds.width;
  return {
    fold,
    foldPath: [{ x: xr - fold, y: bounds.y }, { x: xr - fold, y: bounds.y + fold }, { x: xr, y: bounds.y + fold }],
    ...(labelBounds ? { labelRotation: { angle: headerRotation, center: { x: roundEven(center(labelBounds)), y: roundEven(add(R(labelBounds.y), half(labelBounds.height))) } } } : {}),
  };
}
// Declared badge bounds (harmonization K6): an explicit size, never the viewBox numbers.
export function attachedBadge(node, params, size) {
  return { badge: box(add(R(node.x), R(params.offsetX)), add(add(R(node.y), R(node.height)), R(params.offsetY)), size.width, size.height),
    markerShift: params.markerShift, hideSource: params.hideSource };
}
// A glyph without stripeWidth imposes no width bound (harmonization K8).
export function bandStripe(region, stripeWidth) {
  return { stripe: box(region.x, region.y, stripeWidth === undefined ? R(region.width) : min(R(stripeWidth), R(region.width)), region.height) };
}
export function edgeBounds(waypoints) {
  const xs = waypoints.map(p => p.x), ys = waypoints.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// templateGeometry seam (A4 name; py template_geometry I/O): glyph record,
// bounds, optional labelBounds and badgeSize -> payload keys per template.
export function templateGeometry({ glyph, bounds, labelBounds, badgeSize }) {
  if (glyph.kind !== "template") return { refused: "render-unsupported" };
  const p = Object.fromEntries(glyph.parameters.map(x => [x.name, x.value]));
  if (glyph.template === "header-band") return headerBand(bounds, p.headerHeight);
  if (glyph.template === "corner-fold") return cornerFold(bounds, p.foldRatio, p.headerRotation, labelBounds);
  if (glyph.template === "band-stripe") return bandStripe(bounds, p.stripeWidth);
  return attachedBadge(bounds, p, badgeSize);
}
