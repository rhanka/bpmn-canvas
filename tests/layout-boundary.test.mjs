import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { boundaryBounds } = await import(root + "dist/internal/layout/boundary.js");

const host = { x: 100, y: 100, w: 200, h: 100 };
const ev = (cx, cy) => ({ x: cx - 18, y: cy - 18, w: 36, h: 36 });
const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];

test("a boundary event keeps its side and its fraction along that side", () => {
  const next = { x: 400, y: 50, w: 100, h: 200 };
  assert.deepEqual(centre(boundaryBounds(host, ev(200, 200), next)), [450, 250], "bottom, fraction 0.5");
  assert.deepEqual(centre(boundaryBounds(host, ev(150, 100), next)), [425, 50], "top, fraction 0.25");
  assert.deepEqual(centre(boundaryBounds(host, ev(300, 125), next)), [500, 100], "right, fraction 0.25");
  assert.deepEqual(centre(boundaryBounds(host, ev(100, 175), next)), [400, 200], "left, fraction 0.75");
});

test("the event keeps its own size, and a position off the border is clamped onto it", () => {
  const next = { x: 0, y: 0, w: 100, h: 100 };
  const b = boundaryBounds(host, { x: 500, y: 180, w: 24, h: 24 }, next);
  assert.equal(b.w, 24);
  assert.equal(b.h, 24);
  // Nearest border is the bottom one (8 px away); the fraction along it is clamped to 1.
  assert.deepEqual(centre(b), [100, 100]);
});
