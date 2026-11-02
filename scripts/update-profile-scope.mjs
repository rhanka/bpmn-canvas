// Actual migration evidence, computed with the sealed scanner. This writes no expectation.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { scanBytes, scanText, maskPath, selectorBranches, sha256 } from "../tests/fixtures/x24-externalization/expectations/derive/scan.mjs";
import { decodeMap, sourceAt } from "../tests/fixtures/x24-externalization/expectations/derive/sourcemap.mjs";
import { ledgerHits, literalSet } from "../tests/fixtures/x24-externalization/expectations/derive/literals.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = "tests/fixtures/x24-externalization/expectations/";
const bytesOf = path => readFileSync(join(root, path));
const load = path => JSON.parse(bytesOf(base + path));
const ledgerBytes = bytesOf(base + "ledger.json");
const ledger = JSON.parse(ledgerBytes);
const lexicon = load("lexicon.json");
const probe = load("probe-expectations.json");
const reportPath = "docs/design/profile-externalization-scope.json";
const check = process.argv.includes("--check");
// The report has no occurrences of its own; scan its real, literal-free bytes before replacing it.
if (!check) writeFileSync(join(root, reportPath), "{}\n");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const tracked = git("ls-files", "-z").split("\0").filter(path => path && existsSync(join(root, path)));
const trackedSet = new Set(tracked);
const pairKey = row => [row.file, row.form, row.entry, row.literal, row.column, row.endColumn, row.endLine - row.line, row.lineSha256].join("\0");
const pools = new Map();
for (const row of ledger.occurrences) pools.set(pairKey(row), [...(pools.get(pairKey(row)) ?? []), row.id]);
const baseById = new Map(ledger.occurrences.map(row => [row.id, row]));
const present = new Set();
const appended = [];
const current = [];
const texts = [];
const sourceZero = [];
const zero = new Set(probe.rescan.zeroListEntries);
for (const path of tracked) {
  const { occurrences, lines } = scanBytes(path, bytesOf(path), lexicon, { withText: true });
  for (const { text, ...occurrence } of occurrences) {
    const file = maskPath(path, lexicon);
    const row = { file, ...occurrence, lineSha256: sha256(occurrence.line === 0 ? path : lines[occurrence.line - 1]) };
    const pool = pools.get(pairKey(row));
    let id = pool?.shift();
    if (id) present.add(id);
    else {
      id = `I-P${String(appended.length + 1).padStart(4, "0")}`;
      const origin = ledger.occurrences.find(r => r.file === file && r.entry === row.entry) ?? ledger.occurrences.find(r => r.entry === row.entry);
      if (!origin) throw new Error(`Unclassified entry ${row.entry}`);
      appended.push({ id, ...row, category: origin.category, consumer: path.startsWith("tests/") ? "test-suite" : origin.consumer,
        policy: "Category reference", targetRef: origin.targetRef, disposition: path.startsWith("tests/") ? "test-input" : "context-generic",
        postMigration: { status: path.startsWith("tests/") ? "retained-test-input" : "retained-context", evidence: "C24" } });
    }
    current.push({ id, path, ...row });
    texts.push([text, row.entry]);
    if (path.startsWith("src/") && zero.has(row.entry)) sourceZero.push({ file, line: row.line, entry: row.entry });
  }
}
const presenceConflicts = [];
const statusOf = row => {
  const found = present.has(row.id);
  if (row.disposition === "inject") {
    if (found) throw new Error(`Unmigrated injection ${row.id}`);
    return "injected";
  }
  if (row.disposition === "remove") {
    if (found) throw new Error(`Unremoved occurrence ${row.id}`);
    return "removed";
  }
  if (row.disposition === "replace") {
    if (found) throw new Error(`Unreplaced occurrence ${row.id}`);
    return "replaced";
  }
  if (row.disposition === "doc-update") return "documentation-updated";
  if (row.disposition === "history-record") {
    if (!found) presenceConflicts.push({ row: row.id, expected: 1, observed: 0 });
    return "retained-history";
  }
  if (row.disposition === "neutral-successor" && found) presenceConflicts.push({ row: row.id, expected: 0, observed: 1 });
  if (!found) return "removed";
  return ({ "legacy-api": "retained-legacy-api", "test-input": "retained-test-input", "neutral-successor": "successor-public-test", "context-generic": "retained-context", "retain-notice": "retained-notice" })[row.disposition];
};
const occurrences = [...ledger.occurrences.map(row => ({ ...row, postMigration: { status: statusOf(row), evidence: "C24" } })), ...appended];
const byId = new Map(occurrences.map(row => [row.id, row]));
const explain = (entry, literal, packageName) => {
  const kind = probe.rescan.zeroListExceptionKinds.find(kind => kind.entries.includes(entry));
  if (kind) {
    const retained = kind.baseRows.filter(id => byId.get(id).literal === literal && byId.get(id).postMigration.status === kind.rowStatus);
    if (retained.length) return [retained[0]];
  }
  if (packageName && probe.rescan.thirdPartyAllowlist.some(row => row.package === packageName && row.entry === entry)) return [];
  const exact = current.filter(row => row.entry === entry && row.literal === literal);
  if (exact.length) return [exact[0].id];
  if (lexicon.entries.find(row => row.id === entry)?.explainBy === "entry") return [occurrences.find(row => row.entry === entry).id];
  const historical = occurrences.find(row => row.entry === entry && row.literal === literal);
  return historical ? [historical.id] : [];
};
const maps = new Map();
const mapOf = path => {
  if (!/\.min\.js$/.test(path) || !existsSync(join(root, path + ".map"))) return null;
  if (!maps.has(path)) maps.set(path, decodeMap(JSON.parse(bytesOf(path + ".map"))));
  return maps.get(path);
};
const attributed = (map, path, hit) => {
  const source = sourceAt(map, hit.line, hit.column);
  return source === null ? null : normalize(join(dirname(path + ".map"), source));
};
const packageOf = source => source.replace(/^.*node_modules\//, "").split("/").slice(0, source.includes("node_modules/@") ? 2 : 1).join("/");
function memberScan(path, bytes) {
  if (path.endsWith(".map")) {
    const json = JSON.parse(bytes);
    decodeMap(json);
    return scanText(path, [json.file ?? "", ...json.sources, ...(json.names ?? [])].join("\n"), lexicon, { forms: [] }).occurrences;
  }
  const map = mapOf(path);
  return scanBytes(path, bytes, lexicon).occurrences.map(hit => {
    const source = map && hit.line > 0 ? attributed(map, path, hit) : null;
    return source?.includes("node_modules/") ? { ...hit, package: packageOf(source) } : hit;
  });
}
const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }))[0].files;
const distributionMembers = [];
const unexplained = [];
const zeroListExceptions = [];
const zeroHits = [...sourceZero];
for (const [index, member] of pack.entries()) {
  const path = member.path, file = maskPath(path, lexicon), bytes = bytesOf(path), digest = sha256(bytes);
  const hits = memberScan(path, bytes).map(({ package: pkg, ...hit }) => {
    const explainedBy = explain(hit.entry, hit.literal, pkg);
    const thirdParty = pkg && probe.rescan.thirdPartyAllowlist.some(row => row.package === pkg && row.entry === hit.entry) ? [pkg] : [];
    if (!explainedBy.length && !thirdParty.length) unexplained.push({ file, line: hit.line, entry: hit.entry });
    if (zero.has(hit.entry) && !thirdParty.length) {
      const kind = probe.rescan.zeroListExceptionKinds.find(kind => kind.entries.includes(hit.entry) && explainedBy.length && explainedBy.every(id => kind.baseRows.includes(id) && byId.get(id).postMigration.status === kind.rowStatus));
      if (kind) zeroListExceptions.push({ kind: kind.kind, file, sha256: digest, line: hit.line, column: hit.column, endLine: hit.endLine, endColumn: hit.endColumn, entry: hit.entry, literal: hit.literal, reason: "C24", ...Object.fromEntries(kind.fields.map(field => [field, "C24"])) });
      else zeroHits.push({ file, line: hit.line, entry: hit.entry });
    }
    return { ...hit, explainedBy, thirdParty };
  });
  distributionMembers.push({ id: `D-P${String(index + 1).padStart(4, "0")}`, path: file, bytes: bytes.length, sha256: digest, status: hits.length ? "carries-occurrences" : "clean", hits });
}
const moduleOf = path => {
  if (!path.startsWith("dist/")) return path;
  const stem = path.replace(/^dist\//, "src/").replace(/\.d\.ts$|\.js$/, "");
  return [".ts", ".tsx"].map(ext => stem + ext).find(path => trackedSet.has(path)) ?? path;
};
const selectorBranchExceptions = [], branches = [];
for (const path of [...new Set([...pack.map(member => member.path), ...tracked.filter(path => path.startsWith("src/"))])].filter(path => /\.(?:m?js|cjs|jsx|tsx?|mts|cts)$/.test(path)).sort()) {
  const bytes = bytesOf(path), file = maskPath(path, lexicon), map = mapOf(path);
  const used = new Map();
  for (const branch of selectorBranches(path, bytes.toString(), lexicon, probe.rescan.selectorBranch.entries)) {
    const source = map ? attributed(map, path, branch) : path;
    if (source?.includes("node_modules/")) continue;
    const module = source === null ? `unmapped:${path}` : moduleOf(source);
    const allowance = [...probe.rescan.selectorBranch.allowances, ...(probe.rescan.selectorBranch.reviewedAllowances ?? []).filter(a => trackedSet.has(a.module) && sha256(bytesOf(a.module)) === a.sha256).map(a => ({ ...a, row: a.id }))].find(a => a.module === module && a.use === branch.use && a.entry === branch.entry && a.literal === branch.literal);
    const count = allowance ? (used.get(allowance.row) ?? 0) + 1 : 0;
    if (allowance) used.set(allowance.row, count);
    if (!allowance || count > allowance.count) branches.push({ file, line: branch.line, column: branch.column, entry: branch.entry });
    else selectorBranchExceptions.push({ row: allowance.row, file, sha256: sha256(bytes), ...branch, reason: "C24" });
  }
}
const removed = ledger.occurrences.filter(row => row.file.startsWith("src/") && !present.has(row.id));
const brandScope = {"scanner":{"path":"tests/helpers/brand.mjs","sha256":"5469c034bbc39bf89c7758e0974a29c96205d149da06b816485f468be7bb9c87"},"lexiconSource":"existing scanner hashed lexicon; no additional external lexicon supplied","extraHashes":[],"lexiconSha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","noticeExceptions":[],"paths":["tests/fixtures/profile-parity-corpus","tests/fixtures/profile-parity-corpus.pin.json","tests/fixtures/profile-lot0","tests/helpers/profile-seal.mjs","tests/profile-corpus.test.mjs","tests/profile-corpus-step2b.test.mjs","tests/profile-golden-independence.test.mjs","tests/profile-brand-guard.test.mjs","docs/design/profile-lot0-baseline.md","docs/design/profile-compiler-rules.json","docs/design/profile-externalization-scope.json","docs/design/receipts/lot0-s12.json","docs/design/receipts/lot0-s12-review.md","tests/profile-r32-expectations.test.mjs","docs/design/receipts/lot0-s2-r32.json","tests/profile-r33-seal.test.mjs","tests/profile-corpus-s123.test.mjs","tests/profile-s123-receipt.test.mjs","docs/design/receipts/lot0-r33-seal.json"]};
const report = { ...brandScope, format: "profile-externalization-scope/2", baseLedger: { path: base + "ledger.json", sha256: sha256(ledgerBytes) }, occurrences, distributionMembers, zeroListExceptions, selectorBranchExceptions,
  summary: { unmatched: 0, unexplained: unexplained.length, sourceZero: sourceZero.length, zero: zeroHits.length, presenceConflicts, selectorBranches: branches, removedIds: removed.map(row => row.id), removedByEntry: Object.fromEntries([...new Set(removed.map(row => row.entry))].sort().map(entry => [entry, removed.filter(row => row.entry === entry).length])) } };
const text = JSON.stringify(report) + "\n";
const scanned = scanText(reportPath, text, lexicon, { relaxed: true }).occurrences;
const literalHits = ledgerHits(report, literalSet(texts, load("literal-set.json").literals));
if (scanned.length || literalHits.length) throw new Error(`Report hygiene: ${scanned.length} scanned, ${literalHits.length} literal hits`);
if (check) {
  if (bytesOf(reportPath).toString() !== text) throw new Error("Migration evidence is stale");
} else writeFileSync(join(root, reportPath), text);
console.log(JSON.stringify({ tracked: tracked.length, baseRows: ledger.occurrences.length, appended: appended.length, members: distributionMembers.length, sourceZero: sourceZero.length, zeroHits, unexplained, selectorBranches: branches, removed: removed.length, removedByEntry: report.summary.removedByEntry }));
if (zeroHits.length || unexplained.length) process.exitCode = 1;
