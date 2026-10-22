// Deliberately unresolved acceptance probe. Run explicitly; see the J5 report.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as annotations from "../dist/internal/annotations.js";
// Strengthened by the block B x24 seal (tests/fixtures/x24-externalization/expectations/probe-expectations.json).
// Lines 1-4 and the original assertions of probe 2 are base lines kept verbatim. The original assertion of
// probe 1 is kept in a literal-free form: the classifier export is named by the SHA-256 of the base import
// and the base marker is the text of a tracked occurrence with its ledger row's literal SHA-256; the seal
// test binds the call to the digests and spans of base lines 5, 8 and 9. The sealed assertions are added
// after the originals, never substituted. No line writes a scanned literal. Needs the built package (npm
// run build) and the tracked tree; the only Git read is the index listing (git ls-files).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { maskPath, scanBytes, scanText, selectorBranches, sha256 } from "./fixtures/x24-externalization/expectations/derive/scan.mjs";
import { decodeMap, sourceAt } from "./fixtures/x24-externalization/expectations/derive/sourcemap.mjs";
import { ledgerHits, literalSet } from "./fixtures/x24-externalization/expectations/derive/literals.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const X24 = "tests/fixtures/x24-externalization/expectations/";
const sealedBytes = (path) => readFileSync(join(repo, X24, path));
const sealed = (path) => JSON.parse(sealedBytes(path));
const expectations = sealed("probe-expectations.json");
const lexicon = sealed("lexicon.json");
const ledgerBytes = sealedBytes("ledger.json");
const ledger = JSON.parse(ledgerBytes);
const hashedLiterals = sealed("literal-set.json").literals;
const baseRows = new Map(ledger.occurrences.map((row) => [row.id, row]));
const explainByEntry = new Set(lexicon.entries.filter((e) => e.explainBy === "entry").map((e) => e.id));
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 30 });
const caseFile = (id) => sealed(`cases/${id}.json`);
const expectedOf = (c, role) => c.expectedArtifacts.find((a) => a.role === role).json;
/** An input artifact of a sealed case: its inline JSON, or its file checked against the pinned SHA-256. */
function inputOf(c, role) {
  const a = c.inputArtifacts.find((x) => x.role === role);
  if (!a.path) return a.json;
  const bytes = sealedBytes(a.path);
  assert.equal(sha256(bytes), a.sha256, `${c.caseId} ${role} digest`);
  return JSON.parse(bytes);
}

let trackedState = null;
/** The tracked files (index listing) and their strict scans, with the text of every occurrence by literal SHA-256 (memory only). */
function trackedScan() {
  if (trackedState) return trackedState;
  const tracked = git("ls-files", "-z").split("\0").filter((p) => p && existsSync(join(repo, p)));
  const scans = new Map();
  const texts = new Map();
  for (const path of tracked) {
    const scan = scanBytes(path, readFileSync(join(repo, path)), lexicon, { withText: true });
    scans.set(path, scan);
    for (const o of scan.occurrences) if (!texts.has(o.literal)) texts.set(o.literal, o.text);
  }
  trackedState = { tracked, scans, texts };
  return trackedState;
}
/** Text of a base ledger row (probe-expectations.json#/probe1/literalSource): a tracked occurrence with its literal SHA-256. */
function baseText(id) {
  const row = baseRows.get(id);
  const text = trackedScan().texts.get(row?.literal);
  assert.equal(typeof text, "string", `${id} literal present in the tracked tree`);
  assert.equal(sha256(text), row.literal, `${id} literal`);
  return text;
}
/** A sealed text vector: a string, or {concat: [string | {literal: row id, sha256}]} naming base literals. */
function textOf(vector) {
  if (typeof vector === "string") return vector;
  return vector.concat.map((part) => {
    if (typeof part === "string") return part;
    assert.equal(baseRows.get(part.literal)?.literal, part.sha256, `${part.literal} reference`);
    return baseText(part.literal);
  }).join("");
}

test("J5 #24 should require injected data for business classification", () => {
  const exportsByHash = new Map(Object.keys(annotations).map((name) => [sha256(name), annotations[name]]));
  // Original assertion, literal-free (probe-expectations.json#/probe1/original): the document classifier of
  // the base import, called with the base document marker followed by " example".
  const original = expectations.probe1.original.call;
  const documentClassifier = exportsByHash.get(original.function);
  assert.equal(typeof documentClassifier, "function", "document classifier export");
  assert.equal(documentClassifier(textOf(original.argument)), false,
    "generic classification must not activate implicit compatibility policy");
  // x24-P-002: the three classifier exports, named by the SHA-256 of their export name, use no business data without policy.
  const classifier = {};
  for (const f of expectations.probe1.functions) {
    assert.equal(typeof exportsByHash.get(f.sha256), "function", `classifier export of ${f.definedAt}`);
    classifier[f.role] = exportsByHash.get(f.sha256);
  }
  const noPolicy = caseFile("x24-P-002-probe-1-no-policy");
  const calls = inputOf(noPolicy, "calls");
  const results = expectedOf(noPolicy, "results");
  assert.equal(calls.length, results.length, "sealed calls and results");
  calls.forEach((call, i) => {
    const args = call.args.map(textOf);
    const out = exportsByHash.get(call.function)(...args);
    if (typeof results[i] === "object") assert.equal(out, args[0], `call ${i} returns its text unchanged without policy`);
    else assert.equal(out, results[i], `call ${i} without policy`);
  });
  // x24-P-003: with each sealed data set the three functions return exactly the sealed results.
  const injected = caseFile("x24-P-003-probe-1-injected");
  const policies = { L: inputOf(injected, "policy-legacy"), A: inputOf(injected, "policy-a"), B: inputOf(injected, "policy-b") };
  for (const [key, rows] of Object.entries(expectedOf(injected, "results"))) {
    for (const row of rows) {
      const text = textOf(row.text);
      assert.equal(classifier.document(text, policies[key]), row.document, `${key} document ${JSON.stringify(text)}`);
      assert.equal(classifier.application(text, policies[key]), row.application, `${key} application ${JSON.stringify(text)}`);
      assert.equal(classifier["display-name"](text, policies[key]), row.displayName, `${key} display name ${JSON.stringify(text)}`);
    }
  }
});

test("J5 #24 should inventory occurrences and distribution members", () => {
  const scope = JSON.parse(readFileSync(new URL("../docs/design/profile-externalization-scope.json", import.meta.url)));
  assert.ok(Array.isArray(scope.occurrences) && scope.occurrences.length > 0,
    "scope has no I-number occurrence ledger");
  assert.ok(Array.isArray(scope.distributionMembers) && scope.distributionMembers.length > 0,
    "scope has no distribution member inventory");
  const probe = expectations.probe2;
  const rescan = expectations.rescan;
  // x24-P-005: scope format /2, base ledger pinned, every sealed row kept with its fields and a post-migration status.
  assert.equal(scope.format, probe.scopeFormat.format, "scope format");
  assert.equal(scope.baseLedger?.path, probe.scopeFormat.baseLedger.path, "base ledger path");
  assert.equal(scope.baseLedger?.sha256, sha256(ledgerBytes), "base ledger digest");
  const scopePath = "docs/design/profile-externalization-scope.json";
  const scopeHits = scanText(scopePath, readFileSync(join(repo, scopePath), "utf8"), lexicon, { relaxed: true }).occurrences;
  assert.deepEqual(scopeHits.map(at), [], "the scope file writes no scanned literal (relaxed scan)");
  const rowsById = new Map();
  for (const row of scope.occurrences) {
    assert.ok(!rowsById.has(row.id), `duplicate scope row ${row.id}`);
    rowsById.set(row.id, row);
  }
  for (const base of ledger.occurrences) {
    const row = rowsById.get(base.id);
    assert.ok(row, `missing sealed row ${base.id}`);
    for (const f of probe.rowFields) assert.deepEqual(row[f], base[f], `${base.id} ${f}`);
    assert.ok(probe.postMigrationStatus[base.disposition].includes(row.postMigration?.status), `${base.id} post-migration status`);
    assert.ok(typeof row.postMigration.evidence === "string" && row.postMigration.evidence.trim(), `${base.id} evidence`);
  }
  const vocabulary = sealed("classification-rules.json").vocabulary;
  const appended = scope.occurrences.filter((row) => !baseRows.has(row.id));
  for (const row of appended) {
    assert.match(row.id, new RegExp(probe.appendedRows.idPattern), `${row.id} appended id`);
    for (const f of probe.appendedRows.fields) assert.ok(f in row, `${row.id} ${f}`);
    assert.ok(probe.appendedRows.dispositions.includes(row.disposition), `${row.id} disposition`);
    assert.ok(vocabulary.category.includes(row.category) && vocabulary.consumer.includes(row.consumer), `${row.id} vocabulary`);
    assert.ok(probe.postMigrationStatus[row.disposition].includes(row.postMigration?.status) && row.postMigration.status !== "removed", `${row.id} status`);
    assert.ok(typeof row.postMigration.evidence === "string" && row.postMigration.evidence.trim(), `${row.id} evidence`);
  }

  // x24-P-006: every tracked occurrence pairs with a scope row; row statuses agree with presence.
  const pairKey = (r) => [r.file, r.form, r.entry, r.literal, r.column, r.endColumn, r.endLine - r.line, r.lineSha256].join("\0");
  const position = (r) => [r.file, r.line, r.column, r.endLine, r.endColumn, r.form, r.entry].join("\0");
  const spanKey = (path, o) => [path, o.line, o.column, o.endLine, o.endColumn, o.entry, o.literal].join("\0");
  const pools = new Map();
  for (const base of ledger.occurrences) pools.set(pairKey(base), [...(pools.get(pairKey(base)) ?? []), base.id]);
  // lexicon.json#/relocated: a base row whose line a block B edit changed before the migration also pairs on that line.
  const relocations = new Map();
  for (const rec of lexicon.relocated?.rows ?? []) relocations.set(pairKey(rec), [...(relocations.get(pairKey(rec)) ?? []), rec.row]);
  const taken = new Set();
  const take = (byKey, key) => {
    const ids = byKey.get(key) ?? [];
    while (ids.length && taken.has(ids[0])) ids.shift();
    const id = ids.shift();
    if (id) taken.add(id);
    return id;
  };
  const appendedAt = new Map(appended.map((row) => [position(row), row]));
  const pairs = new Map();
  const rowAt = new Map();
  const currentTexts = [];
  const unmatched = [];
  const { tracked, scans } = trackedScan();
  for (const path of tracked) {
    const file = maskPath(path, lexicon);
    const { lines, occurrences } = scans.get(path);
    for (const { text, ...o } of occurrences) {
      currentTexts.push([text, o.entry]);
      const r = { file, ...o, lineSha256: sha256(o.line === 0 ? path : lines[o.line - 1]) };
      const id = take(pools, pairKey(r)) ?? take(relocations, pairKey(r));
      let row = id ? rowsById.get(id) : appendedAt.get(position(r));
      if (row && !baseRows.has(row.id) && ["family", "literal", "key", "lineSha256"].some((f) => row[f] !== r[f])) row = null;
      if (!row) {
        unmatched.push(`${file}:${o.line}:${o.column} ${o.form} ${o.entry}`);
        continue;
      }
      pairs.set(row.id, (pairs.get(row.id) ?? 0) + 1);
      rowAt.set(spanKey(path, o), row);
    }
  }
  assert.deepEqual(unmatched, [], "every tracked occurrence is a scope row");
  const presence = probe.postMigrationPresence;
  for (const row of scope.occurrences) {
    const n = pairs.get(row.id) ?? 0;
    const status = row.postMigration.status;
    if (!baseRows.has(row.id)) assert.equal(n, 1, `${row.id} appended row pairs with one occurrence`);
    else if (presence.absent.includes(status)) assert.equal(n, 0, `${row.id} is ${status} but still present`);
    else if (presence.present.includes(status)) assert.equal(n, 1, `${row.id} is ${status} but not present`);
    else assert.ok(n <= 1, `${row.id} pairs with one occurrence at most`);
  }
  // x24-P-005: the scope file contains no literal of a base or current occurrence (derive/literals.mjs): the
  // sealed hashed set of the base literals (literal-set.json) and the texts of the current occurrences.
  const literals = literalSet(currentTexts, hashedLiterals);
  const scopeLiteralHits = ledgerHits(scope, literals).map((h) => `${h.at}@${h.index} ${h.entry} ${h.rule}`);
  assert.deepEqual(scopeLiteralHits, [], "the scope file writes no scanned literal (literal set)");

  // x24-P-006 and x24-P-007: distribution members equal the actual pack list; member occurrences are explained.
  const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 }))[0].files;
  const members = new Map(pack.map((m) => [maskPath(m.path, lexicon), m]));
  const declared = new Map(scope.distributionMembers.map((m) => [m.path, m]));
  assert.deepEqual([...declared.keys()].sort(), [...members.keys()].sort(), "distribution members equal the pack list");
  const allowed = (pkg, entry) => rescan.thirdPartyAllowlist.some((t) => t.package === pkg && t.entry === entry);
  const hitKey = (h) => [h.line, h.column, h.endLine, h.endColumn, h.form, h.entry, h.family, h.literal].join("\0");
  const memberHits = new Map();
  for (const [path, m] of members) {
    const d = declared.get(path);
    const bytes = readFileSync(join(repo, m.path));
    assert.equal(d.bytes, bytes.length, `${path} bytes`);
    assert.equal(d.bytes, m.size, `${path} pack size`);
    assert.equal(d.sha256, sha256(bytes), `${path} digest`);
    assert.ok(["clean", "carries-occurrences"].includes(d.status), `${path} status`);
    const hits = memberScan(m.path, bytes);
    assert.deepEqual(d.hits.map(hitKey), hits.map(hitKey), `${path} member occurrences`);
    d.hits.forEach((h, i) => {
      memberHits.set(spanKey(m.path, h), h);
      for (const id of h.explainedBy) {
        const row = rowsById.get(id);
        assert.ok(row && row.entry === h.entry && (explainByEntry.has(h.entry) || row.literal === h.literal), `${path} ${h.line}:${h.column} explained by ${id}`);
      }
      if (!h.explainedBy.length) assert.ok(h.thirdParty.length === 1 && h.thirdParty[0] === hits[i].package && allowed(h.thirdParty[0], h.entry), `${path} ${h.line}:${h.column} unexplained`);
    });
    assert.equal(d.status === "clean", hits.length === 0, `${path} clean status`);
    const descriptorPath = scanText(m.path, "", lexicon, { relaxed: true, forms: [] }).occurrences.filter((o) => o.line === 0 && o.family === "descriptor");
    assert.deepEqual(descriptorPath.map(at), [], `${path} names a descriptor literal`);
  }

  // x24-P-006: zero-list rescan of the pack members and the tracked src/ files; exceptions are bound to one span each.
  const trackedSet = new Set(tracked);
  const zero = new Set(rescan.zeroListEntries);
  const kinds = new Map(rescan.zeroListExceptionKinds.map((k) => [k.kind, k]));
  const exceptions = scope.zeroListExceptions ?? [];
  const bound = exceptions.map(() => []);
  const zeroHits = [];
  const zeroScope = [...new Set([...pack.map((m) => m.path), ...tracked.filter((p) => p.startsWith("src/"))])].sort();
  for (const path of zeroScope) {
    const bytes = readFileSync(join(repo, path));
    const file = maskPath(path, lexicon);
    const digest = sha256(bytes);
    for (const o of memberScan(path, bytes)) {
      if (!zero.has(o.entry) || (o.package && allowed(o.package, o.entry))) continue;
      const i = exceptions.findIndex((e) => e.file === file && e.sha256 === digest && e.line === o.line && e.column === o.column && e.endLine === o.endLine && e.endColumn === o.endColumn && e.entry === o.entry && e.literal === o.literal);
      if (i >= 0) bound[i].push({ path, o });
      else zeroHits.push(`${file}:${o.line}:${o.column} ${o.form} ${o.entry}`);
    }
  }
  assert.deepEqual(zeroHits, [], "zero-list occurrences outside bound exceptions and allowlisted third-party code");
  exceptions.forEach((e, i) => {
    const kind = kinds.get(e.kind);
    assert.ok(kind && kind.entries.includes(e.entry), `zero-list exception ${i} kind and entry`);
    for (const f of ["reason", ...kind.fields]) assert.ok(typeof e[f] === "string" && e[f].trim(), `zero-list exception ${i} ${f}`);
    assert.equal(bound[i].length, 1, `zero-list exception ${i} binds one occurrence`);
    const { path, o } = bound[i][0];
    if (kind.keys) assert.ok(kind.keys.includes(o.key), `zero-list exception ${i} key`);
    const backing = trackedSet.has(path) ? [rowAt.get(spanKey(path, o))] : (memberHits.get(spanKey(path, o))?.explainedBy ?? []).map((id) => rowsById.get(id));
    assert.ok(backing.length > 0 && backing.every((row) => row && kind.baseRows.includes(row.id) && row.disposition === kind.rowDisposition && (!kind.rowRule || row.rule === kind.rowRule) && row.postMigration?.status === kind.rowStatus), `zero-list exception ${i} backing rows`);
  });

  // x24-P-006: no look selector branch outside an exception bound to its span and to a sealed allowance: a base
  // allowance backed by its retained base row, or a reviewed allowance anchored to its module's bytes, span and token.
  const selector = rescan.selectorBranch;
  const script = (p) => /\.(?:m?js|cjs|jsx|tsx?|mts|cts)$/.test(p);
  const moduleOf = (p) => {
    if (!p.startsWith("dist/")) return p;
    const stem = p.replace(/^dist\//, "src/").replace(/\.d\.ts$|\.js$/, "");
    return [".ts", ".tsx"].map((ext) => stem + ext).find((s) => trackedSet.has(s)) ?? p;
  };
  const reviewedAllowances = selector.reviewedAllowances ?? [];
  const holds = new Map(reviewedAllowances.map((a) => [a.id, reviewedAllowanceHolds(a, trackedSet, rowsById)]));
  const branchExceptions = scope.selectorBranchExceptions ?? [];
  const branchBound = branchExceptions.map(() => 0);
  const remaining = [];
  for (const path of zeroScope.filter(script)) {
    const bytes = readFileSync(join(repo, path));
    const file = maskPath(path, lexicon);
    const digest = sha256(bytes);
    const map = mapOf(path);
    const used = new Map();
    for (const b of selectorBranches(path, bytes.toString("utf8"), lexicon, selector.entries)) {
      const source = map ? attributed(map, path, b) : path;
      if (source?.includes("node_modules/")) continue;
      const module = source === null ? `unmapped:${path}` : moduleOf(source);
      const i = branchExceptions.findIndex((e) => e.file === file && e.sha256 === digest && e.line === b.line && e.column === b.column && e.endLine === b.endLine && e.endColumn === b.endColumn && e.use === b.use && e.entry === b.entry && e.literal === b.literal);
      const e = branchExceptions[i];
      const fits = (a) => a.module === module && a.use === b.use && a.entry === b.entry && a.literal === b.literal;
      const base = e && selector.allowances.find((a) => a.row === e.row && fits(a));
      const reviewed = e && !base && reviewedAllowances.find((a) => a.id === e.row && fits(a));
      const allowance = base || reviewed;
      const id = base ? base.row : reviewed?.id;
      const n = allowance ? (used.get(id) ?? 0) + 1 : 0;
      if (allowance) used.set(id, n);
      const backed = base ? rowsById.get(base.row)?.postMigration?.status === "retained-context" : Boolean(reviewed && holds.get(reviewed.id));
      if (!allowance || n > allowance.count || !backed || !(typeof e.reason === "string" && e.reason.trim())) {
        remaining.push(`${file}:${b.line}:${b.column} ${b.use} ${b.entry}`);
        continue;
      }
      branchBound[i] += 1;
    }
  }
  assert.deepEqual(remaining, [], "look selector branches");
  branchBound.forEach((n, i) => assert.equal(n, 1, `selector branch exception ${i} binds one branch`));
});

/** Position of an occurrence for a failure message (never its text). */
function at(o) {
  return `${o.line}:${o.column} ${o.form} ${o.entry}`;
}

/**
 * Whether a reviewed allowance holds (probe-expectations.json#/rescan/selectorBranch/reviewedAllowanceRule): the
 * tracked file of its module keeps the sealed bytes with its branch at the sealed span, its reviewed record of the
 * lexicon binds that span at those bytes, and its backing rows stay present with the scope status retained-context.
 */
function reviewedAllowanceHolds(a, trackedSet, rowsById) {
  if (!trackedSet.has(a.module)) return false;
  const bytes = readFileSync(join(repo, a.module));
  if (sha256(bytes) !== a.sha256) return false;
  const atSpan = (s) => s.line === a.line && s.column === a.column && s.endLine === a.endLine && s.endColumn === a.endColumn;
  const branch = selectorBranches(a.module, bytes.toString("utf8"), lexicon, [a.entry]).some((b) => atSpan(b) && b.use === a.use && b.literal === a.literal);
  const token = lexicon.reviewed.tokens.find((t) => t.id === a.reviewed && t.entry === a.entry && t.literal === a.literal);
  const record = token?.files.find((f) => f.file === maskPath(a.module, lexicon) && f.sha256 === a.sha256);
  const bound = (record?.spans ?? []).some(([form, line, column, endLine, endColumn]) => form === "raw" && atSpan({ line, column, endLine, endColumn }));
  return branch && bound && a.backingRows.length > 0 && a.backingRows.every((id) => rowsById.get(id)?.postMigration?.status === "retained-context");
}

const maps = new Map();
/** Decoded source map of a browser bundle (`<bundle>.map` next to it), or null. */
function mapOf(path) {
  if (!/\.min\.js$/.test(path) || !existsSync(join(repo, `${path}.map`))) return null;
  if (!maps.has(path)) maps.set(path, decodeMap(JSON.parse(readFileSync(join(repo, `${path}.map`), "utf8"))));
  return maps.get(path);
}
/** Repository path the bundle map attributes a position to, resolved against the map's directory, or null. */
function attributed(map, path, o) {
  const source = sourceAt(map, o.line, o.column);
  return source === null ? null : normalize(join(dirname(`${path}.map`), source));
}
const packageOf = (source) => source.replace(/^.*node_modules\//, "").split("/").slice(0, source.includes("node_modules/@") ? 2 : 1).join("/");

/**
 * Occurrences of a member as ledger.json#/distributionMembers records them (source maps: file, sources and
 * names, one per line); a bundle occurrence attributed to node_modules/ carries its package.
 */
function memberScan(path, bytes) {
  if (path.endsWith(".map")) {
    const json = JSON.parse(bytes.toString("utf8"));
    decodeMap(json);
    return scanText(path, [json.file ?? "", ...json.sources, ...(json.names ?? [])].join("\n"), lexicon, { forms: [] }).occurrences;
  }
  const map = mapOf(path);
  return scanBytes(path, bytes, lexicon).occurrences.map((o) => {
    const source = map && o.line > 0 ? attributed(map, path, o) : null;
    return source?.includes("node_modules/") ? { ...o, package: packageOf(source) } : o;
  });
}
