import { test } from "node:test";
import assert from "node:assert/strict";
import { hydrate, project } from "../dist/io/index.js";
import { freeze, snapshot } from "./helpers/workbench.mjs";
import { load, index, config, codecConfig, canonical, comparators } from "./helpers/workbench-parity.mjs";

for (const name of index.validF1) test(`G1 Python/JS parity ${name}: expected semantics and mixed fixed point`, () => {
  const j = freeze(load(`cases/${name}.json`)), py = freeze(load(`expected/${name}.json`)), before = canonical(j);
  for (let repeat = 0; repeat < config.repeatCount; repeat++) {
    const m = hydrate(j, codecConfig), nativeBefore = snapshot(m), q = project(m, codecConfig);
    assert.equal(canonical(q), canonical(py));
    assert.equal(canonical(project(hydrate(q, codecConfig), codecConfig)), canonical(py));
    // Python's frozen Qpy(J) feeds Qjs, and Qjs(J) equals the recorded Qpy fixed point.
    assert.equal(canonical(project(hydrate(py, codecConfig), codecConfig)), canonical(py));
    assert.equal(snapshot(m), nativeBefore); assert.equal(canonical(j), before);
    const ids = new Map();
    function visit(e) {
      if (e.id) ids.set(e.id, e);
      for (const p of e.$descriptor.properties) if (!p.isReference && !p.isVirtual && Object.hasOwn(e, p.name)) for (const child of [].concat(e[p.name])) if (child?.$descriptor) visit(child);
    }
    visit(m);
    for (const e of ids.values()) for (const p of e.$descriptor.properties) if (p.isReference && Object.hasOwn(e, p.name)) for (const target of [].concat(e[p.name])) assert.strictEqual(target, ids.get(target.id));
    for (const e of ids.values()) if (e.$instanceOf("bpmn:Task")) { const old = e.name; e.name = "Edited kite"; if (old === undefined) delete e.name; else e.name = old; break; }
    assert.equal(canonical(project(m, codecConfig)), canonical(py));
  }
});
for (const name of index.invalidF1) test(`G1 Python/JS parity ${name}: complete shared diagnostic tuple`, () => {
  assert.deepEqual(comparators.diagnostics, ["code", "path"]);
  const j = freeze(load(`cases/${name}.json`)), expected = load(`expected/${name}.diagnostic.json`);
  for (let repeat = 0; repeat < config.repeatCount; repeat++) assert.throws(() => hydrate(j, codecConfig), e => { assert.deepEqual(e.diagnostic, expected); return true; });
});
test("G1 should isolate corpus case order W01 W07 W01", () => {
  for (const name of ["W01", "W07", "W01"]) assert.equal(canonical(project(hydrate(load(`cases/${name}.json`), codecConfig), codecConfig)), canonical(load(`expected/${name}.json`)));
});
