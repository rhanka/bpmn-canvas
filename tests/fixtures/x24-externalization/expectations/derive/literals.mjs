// x24 derivation helper: the literal containment rules of the seal hygiene (README "Literal-free seal").
// Pure functions. A literal set holds two kinds of record: a hashed record of literal-set.json
// ({sha256, length, entry, edges, prefilter?}), sealed for every distinct ledger literal and matched through
// the windows of its length (a rolling prefilter, then the SHA-256), and a text record ({text, sha256,
// entry}) for a literal the caller holds in memory (an occurrence of the current tree). Nothing is read,
// written, imported or executed here, and no literal is ever returned (a hit names its position, length,
// entry and SHA-256 only).
import { createHash } from "node:crypto";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const WORD = /[A-Za-z0-9_]/;
const isWord = (c) => c !== undefined && WORD.test(c);
/** Literal texts shorter than this are checked as whole tokens only (rule R3), longer ones also anywhere inside a string (R2). */
export const LONG_MIN = 4;
/** Prefilter width of a hashed literal of LONG_MIN or more units: low bits of its base-257 polynomial hash. */
export const PREFILTER_BITS = 16;
const MASK = (1 << PREFILTER_BITS) - 1;
const BASE = 257;
const DIGEST = /(?<![0-9a-f])(?:[0-9a-f]{64}|[0-9a-f]{40})(?![0-9a-f])/g;

/** Low PREFILTER_BITS bits of the base-257 polynomial hash (modulo 2^32) of a string of UTF-16 units. */
export function prefilterOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, BASE) + s.charCodeAt(i)) >>> 0;
  return h & MASK;
}

/**
 * The hashed record of one literal text: SHA-256, length in UTF-16 units, the word class of its first and
 * last unit (W for [A-Za-z0-9_], N otherwise) and, for LONG_MIN or more units, its prefilter. A shorter
 * literal carries no prefilter: rule R3 only looks at whole-token windows, and a short polynomial value
 * would spell the literal.
 */
export function hashedLiteral(text, entry) {
  if (!text) throw new Error("empty literal");
  const edges = `${isWord(text[0]) ? "W" : "N"}${isWord(text[text.length - 1]) ? "W" : "N"}`;
  return { sha256: sha256(text), length: text.length, entry, edges, ...(text.length >= LONG_MIN ? { prefilter: prefilterOf(text) } : {}) };
}

/**
 * The literal set of a seal: the hashed records followed by a text record for every distinct text of
 * `texts` (an iterable of [text, entry] pairs) whose SHA-256 no hashed record carries; an empty text is
 * ignored. Text records are ordered longest first.
 */
export function literalSet(texts, hashed = []) {
  const known = new Set(hashed.map((h) => h.sha256));
  const seen = new Map();
  for (const [text, entry] of texts) if (text && !seen.has(text)) seen.set(text, entry);
  const plain = [...seen].map(([text, entry]) => ({ text, sha256: sha256(text), entry })).filter((l) => !known.has(l.sha256));
  plain.sort((a, b) => b.text.length - a.text.length || (a.sha256 < b.sha256 ? -1 : 1));
  return [...hashed, ...plain];
}

/** The value with every 40- or 64-digit lowercase hexadecimal run (a Git object id or a SHA-256 digest) blanked. */
export function blankDigests(value) {
  return value.replace(DIGEST, (m) => "\u0000".repeat(m.length));
}

const compiled = new WeakMap();
/** Text records, and hashed records grouped by length with their prefilter bitmap and SHA-256 index. */
function compile(set) {
  let c = compiled.get(set);
  if (c) return c;
  const plain = [];
  const groups = new Map();
  for (const lit of set) {
    if (typeof lit.text === "string") {
      plain.push(lit);
      continue;
    }
    if (!Number.isInteger(lit.length) || lit.length < 1 || !/^[0-9a-f]{64}$/.test(lit.sha256 ?? "") || !/^[WN]{2}$/.test(lit.edges ?? "")) throw new Error(`malformed hashed literal ${String(lit.sha256).slice(0, 8)}`);
    const long = lit.length >= LONG_MIN;
    if (long !== Number.isInteger(lit.prefilter)) throw new Error(`hashed literal ${lit.sha256.slice(0, 8)} prefilter`);
    if (!groups.has(lit.length)) groups.set(lit.length, { length: lit.length, bits: long ? new Uint8Array(MASK + 1) : null, bySha: new Map() });
    const g = groups.get(lit.length);
    if (long) g.bits[lit.prefilter] = 1;
    g.bySha.set(lit.sha256, lit);
  }
  c = { plain, groups: [...groups.values()] };
  compiled.set(set, c);
  return c;
}

/** Whether the window [i, i + L) of v satisfies the whole-token condition of rule R3 for the given edges. */
function tokenWindow(v, i, L, edges) {
  const first = edges[0] === "W" ? isWord(v[i]) && !isWord(v[i - 1]) : !isWord(v[i]);
  if (!first) return false;
  return edges[1] === "W" ? isWord(v[i + L - 1]) && !isWord(v[i + L]) : !isWord(v[i + L - 1]);
}

/**
 * Hits of the literal set in one string: R2, a literal of LONG_MIN or more UTF-16 units occurring
 * anywhere; R3, a literal of any length occurring as a whole token (an end of the literal that is a word
 * character [A-Za-z0-9_] is not adjacent to another word character). Digest runs are blanked first.
 * Returns [{index, length, entry, sha256, rule}], one per position and literal.
 */
export function literalHits(value, set) {
  const v = blankDigests(value);
  const out = [];
  const { plain, groups } = compile(set);
  for (const lit of plain) {
    const t = lit.text;
    for (let i = v.indexOf(t); i >= 0; i = v.indexOf(t, i + 1)) {
      const long = t.length >= LONG_MIN;
      const token = (!isWord(t[0]) || !isWord(v[i - 1])) && (!isWord(t[t.length - 1]) || !isWord(v[i + t.length]));
      if (long || token) out.push({ index: i, length: t.length, entry: lit.entry, sha256: lit.sha256, rule: long ? "R2" : "R3" });
    }
  }
  for (const g of groups) {
    const L = g.length;
    if (v.length < L) continue;
    if (g.bits) {
      let pow = 1;
      for (let k = 0; k < L - 1; k++) pow = Math.imul(pow, BASE) >>> 0;
      let h = 0;
      for (let k = 0; k < L; k++) h = (Math.imul(h, BASE) + v.charCodeAt(k)) >>> 0;
      for (let i = 0; ; i++) {
        if (g.bits[h & MASK]) {
          const lit = g.bySha.get(sha256(v.slice(i, i + L)));
          if (lit) out.push({ index: i, length: L, entry: lit.entry, sha256: lit.sha256, rule: "R2" });
        }
        if (i + L >= v.length) break;
        h = (Math.imul((h - Math.imul(v.charCodeAt(i), pow)) >>> 0, BASE) + v.charCodeAt(i + L)) >>> 0;
      }
    } else {
      const edges = [...new Set([...g.bySha.values()].map((lit) => lit.edges))];
      for (let i = 0; i + L <= v.length; i++) {
        if (!edges.some((e) => tokenWindow(v, i, L, e))) continue;
        const lit = g.bySha.get(sha256(v.slice(i, i + L)));
        if (lit && tokenWindow(v, i, L, lit.edges)) out.push({ index: i, length: L, entry: lit.entry, sha256: lit.sha256, rule: "R3" });
      }
    }
  }
  return out.sort((a, b) => a.index - b.index || b.length - a.length);
}

/** Every string of a JSON value with its RFC 6901 pointer; object keys are reported at `<pointer>/@key`. */
export function jsonStrings(value, at = "") {
  if (typeof value === "string") return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonStrings(v, `${at}/${i}`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => {
      const p = `${at}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      return [[`${p}/@key`, k], ...jsonStrings(v, p)];
    });
  }
  return [];
}

/**
 * Ledger hygiene (README "Literal-free seal", rule R4): no string field or key of the ledger equals or
 * contains a literal of the set (R2, R3), and neither does the concatenation, in key order, of the string
 * fields of any occurrence row or distribution member hit, digests blanked field by field (a literal split
 * across adjacent fields). Returns [{at, ...hit}].
 */
export function ledgerHits(ledger, set) {
  const out = [];
  const seen = new Map();
  for (const [at, s] of jsonStrings(ledger)) {
    if (!seen.has(s)) seen.set(s, literalHits(s, set));
    for (const h of seen.get(s)) out.push({ at, ...h });
  }
  const joined = (row) => Object.keys(row).sort().map((k) => row[k]).filter((x) => typeof x === "string").map(blankDigests).join("");
  (ledger.occurrences ?? []).forEach((row, i) => {
    for (const h of literalHits(joined(row), set)) out.push({ at: `/occurrences/${i}/@joined`, ...h });
  });
  (ledger.distributionMembers ?? []).forEach((m, i) => m.hits.forEach((hit, j) => {
    for (const h of literalHits(joined(hit), set)) out.push({ at: `/distributionMembers/${i}/hits/${j}/@joined`, ...h });
  }));
  return out;
}

/** A regular expression source with every escape backslash removed (an escaped literal reads as the literal). */
export function unescapedSource(source) {
  return source.replace(/\\(.)/g, "$1");
}
