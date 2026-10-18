import { test } from "node:test";
import assert from "node:assert/strict";
import { io, config, model, outputs, fixture, pages } from "./helpers/semantic.mjs";

for (let i = 1; i <= 7; i++) test(`C${i}: direct semantic model equals both independent golden files`, async () => {
  const out = await outputs(await model(`C${i}`));
  assert.equal(out.drawio, fixture(`C${i}`, "expected.drawio"));
  assert.equal(out.sparx, fixture(`C${i}`, "expected.sparx.xml"));
});
test("C3: distinct lane IDs retain first-name/last-name and empty-lane codec behavior", async () => {
  const m = await model("C3");
  const p = pages(m)[0];
  assert.equal(p.lanes.length, 3);
  const out = await outputs(m);
  assert.equal(out.drawio, fixture("C3", "expected.drawio"));
  assert.equal(out.sparx, fixture("C3", "expected.sparx.xml"));
});
test("C6: escaping and half-even/precise numbers retain exact bytes", async () => {
  const out = await outputs(await model("C6"));
  assert.match(out.drawio, /&amp;/);
  assert.equal(out.drawio, fixture("C6", "expected.drawio"));
  assert.equal(out.sparx, fixture("C6", "expected.sparx.xml"));
});
test("C4: shared links and application DATA anchors retain exact bytes", async () => {
  const m = await model("C4");
  assert.equal(pages(m)[0].connections.length, 7);
  assert.deepEqual(await outputs(m), { drawio: fixture("C4", "expected.drawio"), sparx: fixture("C4", "expected.sparx.xml") });
});
test("C5: duplicate labels keep distinct IDs without visible suffixes", async () => {
  const p = pages(await model("C5"))[0];
  assert.equal(new Set([...p.nodes.keys()]).size, p.nodes.size);
  assert.ok([...p.nodes.values()].filter((n) => n.label === "Process order").length > 1);
  await outputs(await model("C5"));
});
test("codec configuration is frozen once and rejects a different initialization", async () => {
  const c = structuredClone(config);
  io.initializeCodecs(c);
  const m = await model();
  const first = await outputs(m);
  c.host = "changed";
  assert.deepEqual(await outputs(m), first);
  assert.throws(() => io.initializeCodecs(c), /configuration/i);
});
