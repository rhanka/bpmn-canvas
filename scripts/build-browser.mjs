// Post-tsc step: the self-contained browser build in dist/browser/ (ESM and IIFE, minified, with
// source maps), the licence texts of every bundled package, and sizes plus SRI hashes.
// Fonts and images stay files under dist/assets/, resolved relative to the bundle, so any CDN path works.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "dist/browser");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const entry = join(out, "entry.js");
if (!existsSync(entry)) throw new Error("dist/browser/entry.js missing: run tsc first");

const banner = `/*! ${pkg.name} ${pkg.version} browser build | MIT, Copyright (c) 2026 Fabien Antoine
 * Bundles bpmn-js and diagram-js (bpmn.io license: it requires the bpmn.io watermark) and the other
 * packages listed, with their license texts, in bpmn-canvas.licenses.txt next to this file. */`;

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
const packages = new Map();
for (const input of Object.keys({ ...esm.metafile.inputs, ...iife.metafile.inputs })) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (!m || packages.has(m[1])) continue;
  const dir = join(root, input.slice(0, input.indexOf(m[0]) + m[0].length));
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  packages.set(m[1], { version: meta.version, license: meta.license ?? "UNKNOWN", text: file ? readFileSync(join(dir, file), "utf8").trim() : null });
}
// Packages that declare a license but ship no license file: a factual notice, nothing invented.
const MIT_BODY = readFileSync(join(root, "LICENSE"), "utf8").replace(/^MIT License\s*/, "").replace(/^Copyright[^\n]*\n+/m, "").trim();
const DECLARED_ONLY = {
  "bpmn-auto-layout": (p) => [
    "License: MIT, as declared in the package's package.json (\"license\": \"MIT\") and in its README (License section: \"MIT\").",
    "The package ships no license file and publishes no copyright line; none is invented here.",
    "Author, as declared in its package.json: bpmn.io contributors (https://github.com/bpmn-io).",
    "Source: https://github.com/bpmn-io/bpmn-auto-layout",
    "",
    "Standard MIT license text:",
    "",
    MIT_BODY,
  ].join("\n"),
};
for (const [name, p] of packages) if (!p.text && DECLARED_ONLY[name] && p.license === "MIT") p.text = DECLARED_ONLY[name](p);
const missing = [...packages].filter(([, p]) => !p.text).map(([n]) => n);
if (missing.length) throw new Error(`no license file for bundled package(s): ${missing.join(", ")}`);
const own = readFileSync(join(root, "LICENSE"), "utf8").trim();
const licenses = [
  `Licenses of the code in bpmn-canvas.min.js and bpmn-canvas.iife.min.js (${pkg.name} ${pkg.version}).`,
  "",
  `== ${pkg.name} ${pkg.version} (MIT) ==`,
  own,
  ...[...packages].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, p]) => ["", `== ${name} ${p.version} (${p.license}) ==`, p.text]),
  "",
].join("\n");
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
