// Successor step-0 fixtures (stage B2 phase 2): the canvas rendering with the
// sealed synthetic fixture policy (browser twins of the Node fixture options).
// Run after `npm run build`: node tests/fixtures/ui/build-successors.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runInBrowser as runPage } from "../../browser/harness.mjs";
import { fixtureOptions } from "../../helpers/injected-policy.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const write = (path, value, indent) => writeFileSync(join(root, path), JSON.stringify(value, null, indent) + "\n");

const render = await runPage(root + "tests/browser/page-render-looks.mjs", "render-looks", (page) => page.evaluate(() => window.renderLooks.run()), fixtureOptions);
const renderLooks = Object.fromEntries(Object.entries(render.result).filter(([, v]) => v && v.elements).map(([k, v]) => [k, v.elements]));
write("tests/fixtures/ui/step0-render.json", {
  source: "SVG primitives of this library's rendering of R1.bpmn (invented) in both looks of the sealed synthetic policy, recorded by tests/fixtures/ui/build-successors.mjs (stage B2 phase 2); the step-0 recording is verified by the private lot 6 gate",
  looks: renderLooks,
}, 1);
console.log("step0-render.json:", Object.keys(renderLooks).join(","), "looks");

const structure = await runPage(root + "tests/browser/page-workshop-structure.mjs", "workshop-structure", (page) => page.evaluate(() => window.structure.run()), fixtureOptions);
const structureLooks = Object.fromEntries(Object.entries(structure.result).filter(([, v]) => v && v.controls));
write("tests/fixtures/ui/step0-structure.json", {
  source: "Normalised toolbar, open menus and palette of this library's workshop with the step-0 contract options in the looks of the sealed synthetic policy, recorded by tests/fixtures/ui/build-successors.mjs (stage B2 phase 2; limited extraction: UI strings, roles, states, SVG geometry; no project ids, classes or diagram text); the step-0 recording is verified by the private lot 6 gate",
  looks: structureLooks,
}, 2);
console.log("step0-structure.json:", Object.keys(structureLooks).join(","), "looks");
