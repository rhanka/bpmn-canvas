// Lot 1 browser gate receipt: incremental lint payload, zero-lint entries,
// bundler/flags/versions and artifact hashes. Writes
// docs/design/receipts/lot1-lint-browser.json. Fails when the budget is exceeded.
import { buildSync } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const esbuildVersion = JSON.parse(readFileSync(join(root, "node_modules/esbuild/package.json"), "utf8")).version;
const lintVersion = JSON.parse(readFileSync(join(root, "node_modules/bpmnlint/package.json"), "utf8")).version;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const BUDGET_GZIP = 150 * 1024;
const MARKERS = ["profile-mechanism/profile", "bpmnlint-plugin-profile-mechanism"];
const LOAD_PATTERNS = [/import\s*\(/, "fetch(", "XMLHttpRequest"];

const flags = { bundle: true, minify: true, platform: "browser", target: ["es2020"], format: "esm", production: true };
const lint = buildSync({
  entryPoints: [join(root, "src/profile/lint-bridge.ts")],
  ...{ bundle: true, minify: true, platform: "browser", target: ["es2020"] },
  format: "esm",
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
}).outputFiles[0].text;
const lintBytes = Buffer.from(lint);
const receipt = {
  format: "lot1-lint-browser/1",
  package: `${pkg.name}@${pkg.version}`,
  budgetGzip: BUDGET_GZIP,
  incremental: {
    entry: "src/profile/lint-bridge.ts",
    bytes: lintBytes.length,
    gzip: gzipSync(lintBytes, { level: 9 }).length,
    sha256: createHash("sha256").update(lintBytes).digest("hex"),
  },
  zeroLintEntries: ["src/index.ts", "src/browser/entry.ts"].map((entry) => {
    const text = buildSync({
      entryPoints: [join(root, entry)],
      ...{ bundle: true, minify: true, platform: "browser", target: ["es2020"] },
      format: "esm",
      define: { "process.env.NODE_ENV": '"production"' },
      write: false,
    }).outputFiles[0].text;
    const markers = MARKERS.filter((marker) => text.includes(marker));
    return { entry, markers };
  }),
  dynamicLoadProbe: LOAD_PATTERNS.map(String).map((pattern) => ({ pattern, found: new RegExp(pattern.slice(1, -1)).test(lint) })),
  bundler: { name: "esbuild", version: esbuildVersion, flags },
  baseline: { engine: "bpmnlint", version: lintVersion, pinned: pkg.dependencies["bpmnlint"] },
  node: process.version,
};

const failures = [];
if (receipt.incremental.gzip > BUDGET_GZIP) failures.push(`incremental ${receipt.incremental.gzip} B exceeds ${BUDGET_GZIP} B`);
for (const probe of receipt.zeroLintEntries) if (probe.markers.length) failures.push(`${probe.entry} carries lint bytes`);
for (const probe of receipt.dynamicLoadProbe) if (probe.found) failures.push(`dynamic load pattern ${probe.pattern}`);
const sri = join(root, "dist/browser/sri.json");
receipt.productionBrowser = existsSync(sri) ? JSON.parse(readFileSync(sri, "utf8")) : null;

const out = join(root, "docs/design/receipts/lot1-lint-browser.json");
writeFileSync(out, JSON.stringify(receipt, null, 2) + "\n");
console.log(`incremental lint: ${receipt.incremental.bytes} B, gzip ${receipt.incremental.gzip} B (budget ${BUDGET_GZIP} B)`);
if (failures.length) {
  for (const failure of failures) console.error(`refused: ${failure}`);
  process.exitCode = 1;
}
