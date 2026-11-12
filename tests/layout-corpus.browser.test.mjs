// Layout corpus applied to the DI by the canvas (test list §10.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser as runPage } from "./browser/harness.mjs";
import { fixtureOptions } from "./helpers/injected-policy.mjs";

// Browser twin: the page receives the fixture descriptor and policy of the Node twins (window.__fixture).
const runInBrowser = (entry, name, fn) => runPage(entry, name, fn, fixtureOptions);

const root = fileURLToPath(new URL("../", import.meta.url));
const expected = JSON.parse(readFileSync(new URL("./fixtures/layout-corpus/expected.json", import.meta.url), "utf8"))["base-order"];

test("(kept) the canvas applies the corpus geometry to the DI", { timeout: 120000 }, async () => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-layout-corpus.mjs", "layout-corpus", (page) => page.evaluate(() => window.corpus.run()));
  for (const [label, box] of Object.entries(expected.nodes)) assert.deepEqual(o.nodes[label], box, label);
  const waypoints = Object.values(o.edges).map((pts) => JSON.stringify(pts)).sort();
  for (const pts of expected.edges.filter((p) => p.length)) assert.ok(waypoints.includes(JSON.stringify(pts)), `edge ${JSON.stringify(pts)}`);
  assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
});
