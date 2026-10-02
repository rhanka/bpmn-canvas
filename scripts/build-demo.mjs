// Builds the static demo site into site/ (served by GitHub Pages). Needs `npm run build` first.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = join(root, "site");
rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, "page"), { recursive: true });
await build({
  entryPoints: [join(root, "docs/demo/page.mjs")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: join(site, "page/page.js"),
  loader: { ".bpmn": "text" },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
// dist/internal/styles.js resolves ../assets/ from its own directory: page/page.js next to assets/ reproduces it.
cpSync(join(root, "dist/assets"), join(site, "assets"), { recursive: true });
cpSync(join(root, "docs/demo/index.html"), join(site, "index.html"));
console.log("demo site built in site/");
