// Successor step-0 fixtures (stage B2 phase 2): the canvas rendering with the
// sealed synthetic fixture policy (browser twins of the Node fixture options).
// Run after `npm run build`: node tests/fixtures/ui/build-successors.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runInBrowser as runPage } from "../../browser/harness.mjs";
import { fixtureOptions } from "../../helpers/injected-policy.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const write = (path, value) => writeFileSync(join(root, path), JSON.stringify(value, null, 1) + "\n");

const render = await runPage(root + "tests/browser/page-render-looks.mjs", "render-looks", (page) => page.evaluate(() => window.renderLooks.run()), fixtureOptions);
const renderLooks = Object.fromEntries(Object.entries(render.result).filter(([, v]) => v && v.elements).map(([k, v]) => [k, v.elements]));
write("tests/fixtures/ui/step0-render.json", {
  source: "SVG primitives of this library's rendering of R1.bpmn (invented) in both looks of the sealed synthetic policy, recorded by tests/fixtures/ui/build-successors.mjs (stage B2 phase 2); the step-0 recording is verified by the private lot 6 gate",
  looks: renderLooks,
});
console.log("step0-render.json:", Object.keys(renderLooks).join(","), "looks");

const structure = await runPage(root + "tests/browser/page-workshop-structure.mjs", "workshop-structure", (page) => page.evaluate(() => window.structure.run()), fixtureOptions);
const previous = JSON.parse(readFileSync(join(root, "tests/fixtures/ui/step0-structure.json"), "utf8"));
const nextLooks = {};
for (const key of Object.keys(previous.looks)) nextLooks[key] = structure.result[key];
write("tests/fixtures/ui/step0-structure.json", { source: previous.source, looks: nextLooks });
console.log("step0-structure.json:", Object.keys(nextLooks).join(","), "looks");
