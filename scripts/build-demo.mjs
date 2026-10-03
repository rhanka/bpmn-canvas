// Builds the static demo site into site/ (served by GitHub Pages). Needs `npm run build` first.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { bundledPackages, licensesDocument } from "./licenses.mjs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = join(root, "site");
rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, "page"), { recursive: true });
if (!existsSync(join(root, "dist/react/index.js"))) throw new Error("dist/ missing: run npm run build first");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
// The app: the workshop (multi-tab) and an assistant-ui chat with a simulated model.
const result = await build({
  entryPoints: [join(root, "docs/demo/app.mjs")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: join(site, "page/page.js"),
  loader: { ".bpmn": "text" },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "eof",
  metafile: true,
  banner: { js: "/*! @sentropic/bpmn-canvas demo | MIT, Copyright (c) 2026 Fabien Antoine | bundles bpmn-js (bpmn.io license), React, assistant-ui and other packages under their own licenses: see licenses/ next to this page */" },
  logLevel: "warning",
});
// dist/internal/styles.js resolves ../assets/ from its own directory: page/page.js next to assets/ reproduces it.
cpSync(join(root, "dist/assets"), join(site, "assets"), { recursive: true });
cpSync(join(root, "docs/demo/index.html"), join(site, "index.html"));
// The page bundles third-party code: the license text of every bundled package travels with it.
const packages = bundledPackages(root, Object.keys(result.metafile.inputs));
cpSync(join(root, "LICENSE"), join(site, "LICENSE.txt"));
cpSync(join(root, "THIRD_PARTY_NOTICES.md"), join(site, "THIRD_PARTY_NOTICES.md"));
cpSync(join(root, "licenses"), join(site, "licenses"), { recursive: true });
writeFileSync(join(site, "licenses/bundled-packages.txt"), licensesDocument({ heading: `Licenses of the code in the demo page (page/page.js), built from ${pkg.name} ${pkg.version}.`, root, pkg, packages }));
const files = readdirSync(join(site, "licenses")).sort();
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
writeFileSync(join(site, "licenses/index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Licenses of the bpmn-canvas demo</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:760px}a{color:#2f5fa8}</style></head><body>
<h1>Licenses of the demo</h1>
<ul>
<li><a href="../LICENSE.txt">LICENSE</a>: @sentropic/bpmn-canvas, MIT</li>
<li><a href="../THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>: third-party components and their treatment</li>
<li><a href="bundled-packages.txt">bundled-packages.txt</a>: every package bundled into the page, with its license text</li>
${files.filter((f) => f !== "index.html" && f !== "bundled-packages.txt").map((f) => `<li><a href="${esc(f)}">${esc(f)}</a></li>`).join("\n")}
</ul>
<p>Demo diagrams: BPMN MIWG reference models C.4.0, C.5.0 and B.1.0, <a href="https://github.com/bpmn-miwg/bpmn-miwg-test-suite/tree/master/Reference">source</a>,
<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>, OMG BPMN Model Interchange Working Group; C.4.0 and C.5.0 without their BPMN-in-Color attributes (white fills, black borders and texts) so that the looks apply; B.1.0 re-encoded from ISO-8859-1 to UTF-8; nothing else changed.</p>
</body></html>
`);
console.log(`demo site built in site/: ${packages.size} bundled packages, licenses in site/licenses/`);
