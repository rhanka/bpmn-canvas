// Post-tsc step: the self-contained browser build in dist/browser/ (ESM and IIFE, minified, with
// source maps), the licence texts of every bundled package, and sizes plus SRI hashes.
// Fonts and images stay files under dist/assets/, resolved relative to the bundle, so any CDN path works.
import { build } from "esbuild";
import { bundledPackages, licensesDocument } from "./licenses.mjs";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "dist/browser");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const entry = join(out, "entry.js");
if (!existsSync(entry)) throw new Error("dist/browser/entry.js missing: run tsc first");

const banner = `/*! ${pkg.name} ${pkg.version} browser build | MIT, Copyright (c) 2026 Fabien Antoine
 * Bundles bpmn-js (bpmn.io license, which requires the bpmn.io watermark) and other packages under
 * their own licenses (MIT, ISC, Apache-2.0); all texts are in bpmn-canvas.licenses.txt next to this file. */`;

const common = {
  entryPoints: [entry],
  bundle: true,
  minify: true,
  sourcemap: true,
  // The maps name the sources without embedding them: the npm tarball stays small; CDN users fetch the .min.js.
  sourcesContent: false,
  platform: "browser",
  target: ["es2020"],
  legalComments: "eof",
  metafile: true,
  logLevel: "warning",
  absWorkingDir: root,
  banner: { js: banner },
  define: { "process.env.NODE_ENV": '"production"' },
};

const esm = await build({ ...common, format: "esm", outfile: join(out, "bpmn-canvas.min.js") });
const iife = await build({
  ...common,
  format: "iife",
  globalName: "BpmnCanvas",
  outfile: join(out, "bpmn-canvas.iife.min.js"),
  inject: [join(root, "scripts/browser/iife-base.js")],
  define: { ...common.define, "import.meta.url": "__bpmnCanvasScriptUrl" },
});

// Licence texts of every bundled package (from the metafile inputs).
const packages = bundledPackages(root, Object.keys({ ...esm.metafile.inputs, ...iife.metafile.inputs }));
const licenses = licensesDocument({ heading: `Licenses of the code in bpmn-canvas.min.js and bpmn-canvas.iife.min.js (${pkg.name} ${pkg.version}).`, root, pkg, packages });
writeFileSync(join(out, "bpmn-canvas.licenses.txt"), licenses);

// Sizes and Subresource Integrity hashes.
const report = {};
for (const f of ["bpmn-canvas.min.js", "bpmn-canvas.iife.min.js"]) {
  const bytes = readFileSync(join(out, f));
  report[f] = {
    bytes: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    integrity: "sha384-" + createHash("sha384").update(bytes).digest("base64"),
  };
}
writeFileSync(join(out, "sri.json"), JSON.stringify({ version: pkg.version, files: report, bundled: [...packages.keys()].sort() }, null, 2) + "\n");
for (const [f, r] of Object.entries(report)) console.log(`${f}: ${r.bytes} B, gzip ${r.gzip} B, brotli ${r.brotli} B, ${r.integrity}`);
console.log(`bundled packages: ${packages.size}; licenses in dist/browser/bpmn-canvas.licenses.txt`);
