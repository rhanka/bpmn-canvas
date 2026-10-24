// x24 derivation helper (CLI): builds the occurrence ledger of the base tree and its distribution.
// Usage, from the repository root at the base commit after `npm ci && npm run build`:
//   git ls-tree -r --name-only -z <base> > files.lst
//   npm pack --dry-run --json --ignore-scripts > pack.json
//   node tests/fixtures/x24-externalization/expectations/derive/ledger.mjs \
//     --files files.lst --pack pack.json --base <commit> --tree <tree> --out ledger.json
// --root <dir> reads the tracked files from an extracted base tree (git archive <base>) and
// --pack-root <dir> the package members from the directory where the base was built (default: root).
// Imports: node:fs, node:path, node:crypto and the pure x24 helpers only (no interpreter, codec, layout
// or exporter). The ledger names files by masked path and literals by SHA-256 only.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { createHash } from "node:crypto";
import { decodeMember, maskPath, scanBytes, scanText, sha256 } from "./scan.mjs";
import { classify, compileRules } from "./classify.mjs";
import { decodeMap, sourceAt } from "./sourcemap.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = arg("root", ".");
const packRoot = arg("pack-root", root);
const lexiconPath = arg("lexicon", join(here, "../lexicon.json"));
const rulesPath = arg("rules", join(here, "../classification-rules.json"));
const lexicon = JSON.parse(readFileSync(lexiconPath, "utf8"));
const rulesDoc = JSON.parse(readFileSync(rulesPath, "utf8"));
const rules = compileRules(rulesDoc);
const files = readFileSync(arg("files"), "utf8").split("\0").filter(Boolean).sort();
const pack = JSON.parse(readFileSync(arg("pack"), "utf8"))[0];
const FORM_ORDER = { path: 0, raw: 1, token: 2, decoded: 3 };
const entryOrder = new Map(lexicon.entries.map((e, i) => [e.id, i]));
const entryById = new Map(lexicon.entries.map((e) => [e.id, e]));
const gitBlob = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const masks = new Map();
const masked = (p) => {
  if (!masks.has(p)) masks.set(p, maskPath(p, lexicon));
  return masks.get(p);
};

// ------------------------------------------------------------------ tracked files
const sources = {};
const rows = [];
const unmatched = [];
const tracked = new Set(files);
const bytesOf = new Map();
for (const path of files) {
  const bytes = readFileSync(join(root, path));
  bytesOf.set(path, bytes);
  const file = masked(path);
  const { binary, lines, occurrences } = scanBytes(path, bytes, lexicon);
  if (sources[file]) throw new Error(`masked path collision ${file}`);
  sources[file] = { pathSha256: sha256(path), gitBlob: gitBlob(bytes), sha256: sha256(bytes), bytes: bytes.length, lines: lines.length, binary };
  for (const o of occurrences) {
    const rule = classify(rules, file, o);
    if (!rule) {
      unmatched.push(`${file}:${o.line}:${o.column} ${o.form} ${o.entry}`);
      continue;
    }
    if (!rulesDoc.targets[rule.target]) throw new Error(`rule ${rule.id} names unknown target ${rule.target}`);
    rows.push({
      path,
      file,
      line: o.line,
      column: o.column,
      endLine: o.endLine,
      endColumn: o.endColumn,
      form: o.form,
      entry: o.entry,
      family: o.family,
      literal: o.literal,
      key: o.key,
      lineSha256: sha256(o.line === 0 ? path : lines[o.line - 1]),
      rule: rule.id,
      category: rule.category === "family" ? rulesDoc.familyCategory[o.family] : rule.category,
      consumer: rule.consumer,
      policy: rule.policy,
      targetRef: rule.target,
      disposition: rule.disposition,
      designRefs: [...entryById.get(o.entry).designRefs].sort(),
    });
  }
}
rows.sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column || FORM_ORDER[a.form] - FORM_ORDER[b.form] || entryOrder.get(a.entry) - entryOrder.get(b.entry) || a.endLine - b.endLine || a.endColumn - b.endColumn);
const occurrences = rows.map(({ path, ...row }, i) => ({ id: `I-${String(i + 1).padStart(4, "0")}`, ...row }));
const rowsByPath = new Map();
rows.forEach((row, i) => rowsByPath.set(row.path, [...(rowsByPath.get(row.path) ?? []), occurrences[i]]));

// ------------------------------------------------------------------ module dispositions
const maskedTracked = new Set(files.map(masked));
const modules = (rulesDoc.modules ?? []).map((m) => {
  for (const p of m.paths) if (!maskedTracked.has(p)) throw new Error(`module ${m.id} names untracked path ${p}`);
  return { ...m, occurrences: occurrences.filter((row) => m.paths.includes(row.file)).length };
});

// ------------------------------------------------------------------ distribution members
const CSS_SOURCES = files.filter((p) => p.startsWith("src/styles/") && p.endsWith(".css"));
const CORPUS = ["tests/fixtures/layout-corpus/VERSION", "tests/fixtures/layout-corpus/cases.json", "tests/fixtures/layout-corpus/expected.json"];

function srcOfDist(distPath) {
  const stem = distPath.replace(/^dist\//, "src/").replace(/\.d\.ts$|\.js$/, "");
  for (const ext of [".ts", ".tsx"]) if (tracked.has(stem + ext)) return stem + ext;
  return null;
}
/** A distribution file that is a byte-identical copy of the tracked file at the same path under src/. */
function copiedFrom(distPath, bytes) {
  const src = distPath.replace(/^dist\//, "src/");
  return tracked.has(src) && bytesOf.get(src)?.equals(bytes) ? src : null;
}

function provenance(p, bytes) {
  if (tracked.has(p)) return { kind: "tracked-file", sources: [p] };
  if (/^dist\/internal\/(css|assets)\.generated\.(js|d\.ts)$/.test(p) || p === "dist/styles.css") return { kind: "generated-css", sources: [...CSS_SOURCES, "scripts/gen-css.mjs", "upstream:diagram-js/bpmn-js stylesheets"] };
  if (p.startsWith("dist/assets/inline/")) return { kind: "extracted-data-uri", sources: [...CSS_SOURCES, "upstream:diagram-js/bpmn-js stylesheets"] };
  if (p.startsWith("dist/assets/bpmn-font/")) return { kind: "third-party-asset", sources: ["upstream:bpmn-js/dist/assets/bpmn-font"] };
  if (p === "dist/layout-corpus.json") return { kind: "generated-corpus", sources: CORPUS };
  const copy = copiedFrom(p, bytes);
  if (copy) return { kind: "copied-file", sources: [copy] };
  if (/^dist\/browser\/bpmn-canvas(\.iife)?\.min\.js$/.test(p)) return { kind: "browser-bundle", sources: [`${p}.map`] };
  if (/^dist\/browser\/bpmn-canvas(\.iife)?\.min\.js\.map$/.test(p)) return { kind: "source-map", sources: [p.replace(/\.map$/, "")] };
  if (p === "dist/browser/bpmn-canvas.licenses.txt" || p === "dist/browser/sri.json") return { kind: "generated-third-party-metadata", sources: ["scripts/build-browser.mjs", "scripts/licenses.mjs", "upstream:bundled package licences"] };
  const src = srcOfDist(p);
  if (src) return { kind: p.endsWith(".d.ts") ? "declaration" : "esm-module", sources: [src] };
  return { kind: "unknown", sources: [] };
}

/** Occurrence rows of the given tracked sources with the member occurrence's entry and literal. */
function explain(o, srcPaths, pathRows) {
  const byEntry = entryById.get(o.entry)?.explainBy === "entry";
  const ids = [];
  for (const s of srcPaths) for (const row of rowsByPath.get(s) ?? []) {
    if ((row.line === 0) !== pathRows || row.entry !== o.entry) continue;
    if (byEntry || row.literal === o.literal) ids.push(row.id);
  }
  return ids;
}
/** The same occurrence (position, form, entry and literal) in a byte-identical tracked file. */
function samePosition(o, src) {
  return (rowsByPath.get(src) ?? []).filter((r) => r.line === o.line && r.column === o.column && r.endLine === o.endLine && r.endColumn === o.endColumn && r.form === o.form && r.entry === o.entry && r.literal === o.literal).map((r) => r.id);
}

/** Text scanned for a source map: its file, sources and names, one per line (mappings decoded, not scanned). */
function mapText(bytes) {
  const map = JSON.parse(bytes.toString("utf8"));
  decodeMap(map);
  return [map.file ?? "", ...map.sources, ...(map.names ?? [])].join("\n");
}

/** Tracked sources standing behind a module named by a bundle source map. */
function bundleSources(attributed) {
  if (!attributed || !attributed.startsWith("dist/")) return [];
  if (/^dist\/internal\/(css|assets)\.generated\.js$/.test(attributed)) return CSS_SOURCES;
  if (attributed === "dist/browser/entry.js") return [...rowsByPath.keys()].filter((s) => s.startsWith("src/"));
  const copy = attributed.replace(/^dist\//, "src/");
  if (tracked.has(copy)) return [copy];
  const src = srcOfDist(attributed);
  return src ? [src] : [];
}

const members = [];
const unexplained = [];
const maps = new Map();
for (const f of [...pack.files].sort((a, b) => cmp(a.path, b.path))) {
  const path = f.path;
  const bytes = readFileSync(join(packRoot, path));
  const prov = provenance(path, bytes);
  const scanned = prov.kind === "source-map" ? scanText(path, mapText(bytes), lexicon, { forms: [] }).occurrences : scanBytes(path, bytes, lexicon).occurrences;
  const hits = [];
  for (const o of scanned) {
    let srcPaths = prov.sources.filter((s) => tracked.has(s));
    let attributed = null;
    let ids;
    if (prov.kind === "tracked-file" || (prov.kind === "copied-file" && o.line > 0)) ids = samePosition(o, prov.sources[0]);
    else if (prov.kind === "copied-file") ids = explain(o, prov.sources, true);
    else {
      if (prov.kind === "browser-bundle" && o.line > 0) {
        const mapPath = `${path}.map`;
        if (!maps.has(mapPath)) maps.set(mapPath, decodeMap(JSON.parse(readFileSync(join(packRoot, mapPath), "utf8"))));
        const s = sourceAt(maps.get(mapPath), o.line, o.column);
        attributed = s === null ? null : normalize(join(dirname(mapPath), s));
        srcPaths = bundleSources(attributed);
      }
      if (prov.kind === "source-map" && o.line > 0) srcPaths = [...rowsByPath.keys()].filter((s) => s.startsWith("src/"));
      ids = prov.kind === "source-map" && o.line > 0 ? [...explain(o, srcPaths, true), ...explain(o, srcPaths, false)] : explain(o, srcPaths, o.line === 0);
    }
    let surface = false;
    if (!ids.length && prov.kind === "browser-bundle" && o.line > 0 && !(attributed && attributed.includes("node_modules/"))) {
      // The unmapped tail (the generated export list) is explained by the export surface.
      ids = explain(o, bundleSources("dist/browser/entry.js"), false);
      surface = ids.length > 0;
    }
    const thirdParty = [];
    if (!ids.length) {
      if (attributed && attributed.includes("node_modules/")) thirdParty.push(attributed.replace(/^.*node_modules\//, "").split("/").slice(0, attributed.includes("node_modules/@") ? 2 : 1).join("/"));
      else if (prov.kind === "third-party-asset" || prov.kind === "generated-third-party-metadata") thirdParty.push(prov.sources[0]);
      else unexplained.push(`${masked(path)}:${o.line}:${o.column} ${o.form} ${o.entry}${attributed ? ` <- ${masked(attributed)}` : ""}`);
    }
    hits.push({ line: o.line, column: o.column, endLine: o.endLine, endColumn: o.endColumn, form: o.form, entry: o.entry, family: o.family, literal: o.literal, explainedBy: [...new Set(ids)].sort(), thirdParty, ...(surface ? { exportSurface: true } : {}) });
  }
  members.push({
    path: masked(path),
    bytes: bytes.length,
    sha256: sha256(bytes),
    binary: bytes.includes(0),
    kind: prov.kind,
    provenance: prov.sources.map((s) => (s.startsWith("upstream:") ? s : masked(s))),
    ...(prov.kind === "source-map" ? { scanned: "file, sources and names; mappings decoded as Base64 VLQ integers" } : {}),
    ...(bytes.includes(0) ? { scanned: "binary member scanned raw as latin1; compressed glyph tables are not decoded" } : {}),
    status: hits.length === 0 ? "clean" : hits.some((h) => !h.explainedBy.length && !h.thirdParty.length) ? "unexplained" : "carries-occurrences",
    hits,
  });
}
const distributionMembers = members.map((m, i) => ({ id: `D-${String(i + 1).padStart(3, "0")}`, ...m }));

const count = (list, key) => Object.fromEntries([...list.reduce((m, r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1), new Map())].sort((a, b) => cmp(a[0], b[0])));
const memberHits = distributionMembers.flatMap((m) => m.hits);
const ledger = {
  format: "x24-occurrence-ledger/2",
  base: { commit: arg("base"), tree: arg("tree"), trackedFiles: files.length },
  design: lexicon.design,
  inputs: {
    lexicon: { path: "lexicon.json", sha256: sha256(readFileSync(lexiconPath)) },
    rules: { path: "classification-rules.json", sha256: sha256(readFileSync(rulesPath)) },
    helpers: Object.fromEntries(["scan.mjs", "classify.mjs", "sourcemap.mjs", "ledger.mjs"].map((f) => [`derive/${f}`, sha256(readFileSync(join(here, f)))])),
    brandHelper: { path: "tests/helpers/brand.mjs", sha256: sha256(readFileSync(join(root, "tests/helpers/brand.mjs"))) },
    pack: { name: pack.name, version: pack.version, entryCount: pack.entryCount, unpackedSize: pack.unpackedSize, integrity: pack.integrity },
  },
  summary: {
    occurrences: occurrences.length,
    unmatched: unmatched.length,
    byForm: count(occurrences, "form"),
    byFamily: count(occurrences, "family"),
    byEntry: count(occurrences, "entry"),
    byCategory: count(occurrences, "category"),
    byConsumer: count(occurrences, "consumer"),
    byDisposition: count(occurrences, "disposition"),
    distributionMembers: distributionMembers.length,
    memberOccurrences: memberHits.length,
    membersByStatus: count(distributionMembers, "status"),
    membersByKind: count(distributionMembers, "kind"),
    unexplainedMemberHits: unexplained.length,
  },
  columns: {
    occurrence: "id (stable I-number); file (masked path, a key of files); line (1-based, 0 for the path itself), column (0-based UTF-16 offset), endLine and endColumn (end exclusive) of the source span; form (path, raw, token, decoded); entry and family of the lexicon; literal (SHA-256 of the exact matched text) and key (SHA-256 of its normalised key), never the text; lineSha256 (SHA-256 of the source line, or of the path for line 0); rule, category, consumer, policy (current hard-coded policy, prose without literals), targetRef (key of targets: injected-data target and legacy-adapter mapping), disposition and DESIGN references",
    file: "masked path -> pathSha256 (SHA-256 of the real path), gitBlob (git blob id), sha256, bytes, lines and binary of the base file",
    distributionMember: "id (stable D-number), masked tarball path, bytes, SHA-256, kind, masked provenance, scan status and every member occurrence (position, form, entry, family, literal) with the occurrence rows that explain it or its third-party origin",
  },
  targets: rulesDoc.targets,
  dispositions: rulesDoc.vocabulary.disposition,
  files: sources,
  modules,
  occurrences,
  distributionMembers,
};
if (unmatched.length || unexplained.length) {
  console.error(`unmatched ${unmatched.length}, unexplained ${unexplained.length}`);
  for (const u of [...unmatched, ...unexplained].slice(0, 200)) console.error("  " + u);
}
const out = arg("out");
if (out) writeFileSync(out, serialize(ledger));
console.log(JSON.stringify(ledger.summary, null, 1));
process.exitCode = unmatched.length || unexplained.length ? 1 : 0;

/** Stable JSON: two-space structure, one line per row object in the large arrays and maps. */
function serialize(value) {
  const rowArrays = new Set(["modules", "occurrences", "distributionMembers"]);
  const lines = ["{"];
  const keys = Object.keys(value);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? "," : "";
    if (rowArrays.has(k)) {
      lines.push(`  ${JSON.stringify(k)}: [`);
      value[k].forEach((row, j) => lines.push(`    ${JSON.stringify(row)}${j < value[k].length - 1 ? "," : ""}`));
      lines.push(`  ]${comma}`);
    } else if (k === "files") {
      lines.push(`  ${JSON.stringify(k)}: {`);
      const ps = Object.keys(value[k]);
      ps.forEach((p, j) => lines.push(`    ${JSON.stringify(p)}: ${JSON.stringify(value[k][p])}${j < ps.length - 1 ? "," : ""}`));
      lines.push(`  }${comma}`);
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(value[k])}${comma}`);
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}
