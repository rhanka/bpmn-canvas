// x24 derivation helper: the pinned lexicon scanner (x24-scan-lexicon/3). Pure text and hash code: it
// imports only node:crypto and the hash-only brand helper, and never imports, evaluates or executes the
// content it scans. Every lexicon literal is matched by key hash, so no scanned literal is written in
// this repository; a match is reported by position and SHA-256 only.
import { createHash } from "node:crypto";
import { brandTokens } from "../../../../helpers/brand.mjs";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** FNV-1a 32-bit over UTF-16 code units: cheap prefilter of a hashed key; the SHA-256 decides. */
export function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const RK_BASE = 257;
/** Polynomial rolling hash (base 257, modulo 2^32) of a window: prefilter of the window matchers. */
export function rk32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, RK_BASE) + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// ------------------------------------------------------------------ key normalisations
const asciiLower = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
const words = (s) => s.replace(/[\s_-]+/g, " ");
export const NORMALIZE = {
  exact: (s) => s,
  "ascii-lower": asciiLower,
  words,
  "lower-words": (s) => words(asciiLower(s)),
  "bracket-lower-words": (s) => words(asciiLower(s.replace(/^\\?\[\s*/, "").replace(/\s*\\?\]$/, ""))),
  "alternation-lower": (s) => asciiLower(s.replace(/\\/g, "")).split("|").sort().join("|"),
};

// ------------------------------------------------------------------ text helpers
/** Text members are read as UTF-8; a member containing a NUL byte is binary and read as latin1 bytes. */
export function decodeMember(bytes) {
  return bytes.includes(0) ? bytes.toString("latin1") : bytes.toString("utf8");
}

export function splitLines(text) {
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/** Offsets of the line starts of a text (line i + 1 starts at starts[i]). */
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
function position(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] };
}

export function inScope(entry, path) {
  return entry.scope.some((prefix) => prefix === "**" || path === prefix || path.startsWith(prefix));
}

const JS_LIKE = /\.(?:m?js|cjs|jsx|tsx?|mts|cts)$/;
const JSON_LIKE = /\.(?:json|map)$/;
const MARKUP = /\.(?:html?|svg|xml|xsd|bpmn|drawio|md)$/;
const CSS = /\.css$/;
/** Content forms applied to a path besides path and raw (DESIGN.md:874). */
export function formsOf(path) {
  if (JS_LIKE.test(path) || JSON_LIKE.test(path)) return ["token", "decoded"];
  if (MARKUP.test(path) || CSS.test(path)) return ["decoded"];
  return [];
}

// ------------------------------------------------------------------ JavaScript / JSON token scanner
const REGEX_AFTER_WORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await", "extends"]);
const ID_START = /[A-Za-z_$\u0080-￿]/;
const ID_PART = /[A-Za-z0-9_$\u0080-￿]/;
const HEX = /^[0-9a-fA-F]+$/;

/** One JavaScript escape sequence starting at text[j] === "\\": {value, end}. */
function jsEscape(text, j) {
  const c = text[j + 1];
  const simple = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v" };
  if (c === undefined) return { value: "", end: j + 1 };
  if (c in simple) return { value: simple[c], end: j + 2 };
  const hex2 = text.slice(j + 2, j + 4);
  if (c === "x" && hex2.length === 2 && HEX.test(hex2)) return { value: String.fromCharCode(parseInt(hex2, 16)), end: j + 4 };
  if (c === "u") {
    if (text[j + 2] === "{") {
      const close = text.indexOf("}", j + 3);
      const hex = close < 0 ? "" : text.slice(j + 3, close);
      if (hex && HEX.test(hex) && parseInt(hex, 16) <= 0x10ffff) return { value: String.fromCodePoint(parseInt(hex, 16)), end: close + 1 };
    } else {
      const hex4 = text.slice(j + 2, j + 6);
      if (hex4.length === 4 && HEX.test(hex4)) return { value: String.fromCharCode(parseInt(hex4, 16)), end: j + 6 };
    }
    return { value: "u", end: j + 2 };
  }
  if (c === "\r") return { value: "", end: text[j + 2] === "\n" ? j + 3 : j + 2 };
  if (c === "\n" || c === " " || c === " ") return { value: "", end: j + 2 };
  if (c === "0" && !/[0-9]/.test(text[j + 2] ?? "")) return { value: "\0", end: j + 2 };
  return { value: c, end: j + 2 };
}

/** A decoded piece of source: value, start and end source offsets of each value unit, escape flag. */
function piece() {
  return { value: "", starts: [], ends: [], escaped: false };
}
function addUnit(p, ch, start, end) {
  p.value += ch;
  p.starts.push(start);
  p.ends.push(end);
}
function addEscape(p, value, start, end) {
  for (const ch of value) for (let k = 0; k < ch.length; k++) {
    p.value += ch[k];
    p.starts.push(start);
    p.ends.push(end);
  }
  p.escaped = true;
}
function appendPiece(p, q) {
  p.value += q.value;
  p.starts.push(...q.starts);
  p.ends.push(...q.ends);
  p.escaped ||= q.escaped;
}

function lexString(text, i) {
  const quote = text[i];
  const p = piece();
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === quote) return { type: "string", start: i, end: j + 1, piece: p };
    if (c === "\\") {
      const e = jsEscape(text, j);
      addEscape(p, e.value, j, e.end);
      j = e.end;
      continue;
    }
    if (c === "\n") break;
    addUnit(p, c, j, j + 1);
    j++;
  }
  return { type: "string", start: i, end: j, piece: p, unterminated: true };
}

function lexTemplate(text, i) {
  const chunks = [];
  const subs = [];
  let p = piece();
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === "`") {
      chunks.push(p);
      return { type: "template", start: i, end: j + 1, chunks, subs };
    }
    if (c === "\\") {
      const e = jsEscape(text, j);
      addEscape(p, e.value, j, e.end);
      j = e.end;
      continue;
    }
    if (c === "$" && text[j + 1] === "{") {
      chunks.push(p);
      p = piece();
      const inner = lexJs(text, j + 2, true);
      subs.push(inner.tokens);
      j = inner.end + 1;
      continue;
    }
    addUnit(p, c, j, j + 1);
    j++;
  }
  chunks.push(p);
  return { type: "template", start: i, end: text.length, chunks, subs, unterminated: true };
}

function lexRegex(text, i) {
  let j = i + 1;
  let inClass = false;
  while (j < text.length) {
    const c = text[j];
    if (c === "\n") return null;
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") inClass = true;
    else if (c === "/") break;
    j++;
  }
  if (j >= text.length) return null;
  j++;
  while (j < text.length && /[a-z]/.test(text[j])) j++;
  return { type: "regex", start: i, end: j };
}

/**
 * Tokens of JavaScript or JSON text from `start`: whitespace, comment, string (decoded piece), template
 * (cooked chunks and substitution token lists), regex, identifier, number and punctuation. With
 * `stopAtBrace` lexing stops at the unmatched `}` closing a template substitution. Returns {tokens, end}.
 */
export function lexJs(text, start = 0, stopAtBrace = false) {
  const tokens = [];
  let i = start;
  let depth = 0;
  let prev = null;
  const push = (t) => {
    tokens.push(t);
    if (t.type !== "ws" && t.type !== "comment") prev = t;
  };
  while (i < text.length) {
    const c = text[i];
    if (stopAtBrace && c === "}" && depth === 0) return { tokens, end: i };
    if (/[\s﻿]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[\s﻿]/.test(text[j])) j++;
      push({ type: "ws", start: i, end: j });
      i = j;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      const end = nl < 0 ? text.length : nl;
      push({ type: "comment", start: i, end });
      i = end;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close < 0 ? text.length : close + 2;
      push({ type: "comment", start: i, end });
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      const t = lexString(text, i);
      push(t);
      i = t.end;
      continue;
    }
    if (c === "`") {
      const t = lexTemplate(text, i);
      push(t);
      i = t.end;
      continue;
    }
    if (c === "/") {
      const division = prev && ((prev.type === "ident" && !REGEX_AFTER_WORD.has(prev.value)) || prev.type === "number" || prev.type === "string" || prev.type === "template" || prev.type === "regex" || (prev.type === "punct" && [")", "]", "}"].includes(prev.value)));
      const t = division ? null : lexRegex(text, i);
      if (t) {
        push(t);
        i = t.end;
        continue;
      }
      push({ type: "punct", start: i, end: i + 1, value: c });
      i++;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < text.length && ID_PART.test(text[j])) j++;
      push({ type: "ident", start: i, end: j, value: text.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < text.length && /[0-9A-Za-z_.]/.test(text[j])) j++;
      push({ type: "number", start: i, end: j });
      i = j;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    push({ type: "punct", start: i, end: i + 1, value: c });
    i++;
  }
  return { tokens, end: i };
}

const trivia = (t) => t && (t.type === "ws" || t.type === "comment");
const skipTrivia = (tokens, k) => {
  while (k < tokens.length && trivia(tokens[k])) k++;
  return k;
};
const isConcat = (tokens, k) => tokens[k]?.type === "punct" && tokens[k].value === "+" && !(tokens[k + 1]?.type === "punct" && ["+", "="].includes(tokens[k + 1].value));

function foldTemplate(t) {
  const p = piece();
  appendPiece(p, t.chunks[0]);
  for (let s = 0; s < t.subs.length; s++) {
    const c = constExpression(t.subs[s]);
    if (!c) return null;
    appendPiece(p, c.piece);
    appendPiece(p, t.chunks[s + 1]);
  }
  return p;
}
function atomAt(tokens, k) {
  const t = tokens[k];
  if (t?.type === "string") return { piece: t.piece, next: k + 1, atoms: 1, folded: false };
  if (t?.type === "template") {
    const p = foldTemplate(t);
    return p ? { piece: p, next: k + 1, atoms: 1, folded: t.subs.length > 0 } : null;
  }
  return null;
}
/** A maximal chain of constant atoms joined by `+` starting at token k, or null. */
function chainAt(tokens, k) {
  const first = atomAt(tokens, k);
  if (!first) return null;
  const p = piece();
  appendPiece(p, first.piece);
  let { next, atoms, folded } = first;
  for (;;) {
    const plus = skipTrivia(tokens, next);
    if (!isConcat(tokens, plus)) break;
    const a = atomAt(tokens, skipTrivia(tokens, plus + 1));
    if (!a) break;
    appendPiece(p, a.piece);
    next = a.next;
    atoms += a.atoms;
    folded ||= a.folded;
  }
  return { piece: p, next, joined: atoms > 1 || folded };
}
function constExpression(tokens) {
  const c = chainAt(tokens, skipTrivia(tokens, 0));
  return c && skipTrivia(tokens, c.next) === tokens.length ? c : null;
}
function templateChunks(t, out) {
  let p = piece();
  appendPiece(p, t.chunks[0]);
  let joined = false;
  for (let s = 0; s < t.subs.length; s++) {
    const c = constExpression(t.subs[s]);
    if (c) {
      appendPiece(p, c.piece);
      appendPiece(p, t.chunks[s + 1]);
      joined = true;
      continue;
    }
    out.push({ ...p, joined, whole: false });
    p = piece();
    appendPiece(p, t.chunks[s + 1]);
    joined = false;
  }
  out.push({ ...p, joined, whole: false });
}
function collectConstants(tokens, out) {
  let k = 0;
  while (k < tokens.length) {
    const chain = chainAt(tokens, k);
    if (chain) {
      out.push({ ...chain.piece, joined: chain.joined, whole: true });
      k = chain.next;
      continue;
    }
    const t = tokens[k];
    if (t.type === "template") {
      templateChunks(t, out);
      for (const sub of t.subs) collectConstants(sub, out);
    }
    k++;
  }
}

/**
 * Constant strings of JavaScript or JSON text: {value, starts, ends, escaped, joined, whole}, where starts
 * and ends give the source span of each value unit. Escapes are decoded, adjacent constant fragments are
 * joined across `+` on any number of lines, and constant template substitutions are folded
 * (DESIGN.md:874); a non-constant substitution splits a template.
 */
export function constantStrings(text) {
  const out = [];
  collectConstants(lexJs(text).tokens, out);
  return out;
}

// ------------------------------------------------------------------ markup, CSS and percent decoding
const NAMED = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };
/** Decodes the matches of `re` in a piece of text; null when nothing decodes. */
function decodePiece(src, re, decode) {
  const out = piece();
  let last = 0;
  let changed = false;
  for (const m of src.value.matchAll(re)) {
    const d = decode(m);
    if (d === null) continue;
    for (let k = last; k < m.index; k++) addUnit(out, src.value[k], src.starts[k], src.ends[k]);
    addEscape(out, d, src.starts[m.index], src.ends[m.index + m[0].length - 1]);
    last = m.index + m[0].length;
    changed = true;
  }
  if (!changed) return null;
  for (let k = last; k < src.value.length; k++) addUnit(out, src.value[k], src.starts[k], src.ends[k]);
  return out;
}
const charRef = (m) => {
  const n = m[1] !== undefined ? parseInt(m[1], 10) : m[2] !== undefined ? parseInt(m[2], 16) : null;
  if (n !== null) return n <= 0x10ffff ? String.fromCodePoint(n) : null;
  return NAMED[m[3]] ?? null;
};
const cssEscape = (m) => {
  const n = parseInt(m[1], 16);
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null;
};
const percent = (m) => String.fromCharCode(parseInt(m[1], 16));
const PERCENT = /%([0-9a-fA-F]{2})/g;
const HAS_PERCENT = /%[0-9a-fA-F]{2}/;

/** Decoded variants of a markup or CSS line: character references or CSS escapes, then percent escapes. */
function decodedVariants(src, path) {
  const out = [];
  const first = CSS.test(path) ? decodePiece(src, /\\([0-9a-fA-F]{1,6}) ?/g, cssEscape) : decodePiece(src, /&#(\d+);|&#[xX]([0-9a-fA-F]+);|&([a-z]+);/g, charRef);
  if (first) out.push(first);
  const pct = decodePiece(first ?? src, PERCENT, percent);
  if (pct) out.push(pct);
  return out;
}

// ------------------------------------------------------------------ lexicon matching
const FORM_ORDER = { path: 0, raw: 1, token: 2, decoded: 3 };
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * The repository path with every hashed or brand literal it contains replaced by
 * `{<entry>:<first 8 hex digits of the SHA-256 of the matched text>}` (leftmost-longest, entries in
 * lexicon order on ties). Seal files name base files only by masked paths, and entry scopes are
 * prefixes of masked paths.
 */
export function maskPath(path, lexicon) {
  const spans = matchValue(lexicon, path, path, "path", { relaxed: true, hashedOnly: true }).sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "";
  let last = 0;
  for (const s of spans) {
    if (s.start < last) continue;
    out += `${path.slice(last, s.start)}{${s.entry}:${sha256(s.text).slice(0, 8)}}`;
    last = s.end;
  }
  return out + path.slice(last);
}
const HEX8 = /^[0-9a-f]{8}$/;
const compiled = new WeakMap();
function compiledLexicon(lexicon) {
  let c = compiled.get(lexicon);
  if (!c) {
    c = lexicon.entries.map((e) => ({ e, matchers: e.match.map((m) => compileMatcher(e, m)) }));
    compiled.set(lexicon, c);
  }
  return c;
}
function compileMatcher(e, m) {
  const fail = (why) => {
    throw new Error(`lexicon entry ${e.id}: ${why}`);
  };
  if (m.hashes) for (const h of m.hashes) if (!HEX64.test(h.sha256 ?? "")) fail("hash is not a SHA-256");
  if (m.forms && !m.forms.every((f) => f in FORM_ORDER)) fail("unknown form");
  if (m.type === "regex") {
    if (typeof m.regex !== "string" || !m.regex) fail("empty regex");
    const span = m.span ?? 1;
    const keyGroup = m.keyGroup ?? span;
    const base = { type: "regex", forms: m.forms ?? null, re: new RegExp(m.regex, `gd${m.flags ?? ""}`), sig: `${m.regex}\u0000${m.flags ?? ""}\u0000${span}\u0000${keyGroup}`, span, keyGroup };
    if (!m.hashes) return { ...base, bySha: null };
    if (!NORMALIZE[m.key] || !m.hashes.length) fail(`bad key ${m.key}`);
    const prefilter = m.hashes.every((h) => HEX8.test(h.fnv1a32 ?? "")) ? new Set(m.hashes.map((h) => h.fnv1a32)) : null;
    return { ...base, key: m.key, bySha: new Map(m.hashes.map((h) => [h.sha256, h])), prefilter };
  }
  if (m.type === "window") {
    if (!Number.isInteger(m.length) || m.length < 2 || !m.hashes?.length || !["exact", "ascii-lower"].includes(m.key)) fail("bad window");
    if (!m.hashes.every((h) => HEX8.test(h.rk32 ?? ""))) fail("window hash without rk32");
    let pow = 1;
    for (let k = 0; k < m.length - 1; k++) pow = Math.imul(pow, RK_BASE) >>> 0;
    const byRk = new Map();
    for (const h of m.hashes) byRk.set(h.rk32, [...(byRk.get(h.rk32) ?? []), h]);
    return { type: "window", length: m.length, key: m.key, byRk, pow };
  }
  if (m.type === "brand") return { type: "brand", extra: m.extraHashes ?? [], only: m.only ? new Set(m.only) : null };
  return fail(`unknown matcher ${m.type}`);
}

const shaMemo = new Map();
function memoSha(key) {
  let h = shaMemo.get(key);
  if (h === undefined) {
    if (shaMemo.size > 400000) shaMemo.clear();
    h = sha256(key);
    shaMemo.set(key, h);
  }
  return h;
}
/** Candidate spans of one regex matcher in one value, shared by every matcher with the same pattern. */
function candidates(value, m, memo) {
  let list = memo.get(m.sig);
  if (!list) {
    list = [];
    for (const r of value.matchAll(m.re)) {
      const span = r.indices[m.span];
      if (!span || span[1] <= span[0]) continue;
      const k = r.indices[m.keyGroup] ?? span;
      list.push([span[0], span[1], k[0], k[1]]);
    }
    memo.set(m.sig, list);
  }
  return list;
}

function contextOk(h, value, start, end, form, whole) {
  if (!h.contexts) return true;
  return h.contexts.some((ctx) => {
    if (ctx.token === "whole" && form !== "raw" && form !== "path") return whole && start === 0 && end === value.length;
    const r = ctx.raw;
    if (!r || (form !== "raw" && form !== "path")) return false;
    return (!r.before || new RegExp(`(?:${r.before})$`).test(value.slice(0, start))) && (!r.after || new RegExp(`^(?:${r.after})`).test(value.slice(end)));
  });
}

/** Positions of the found brand tokens: whole tokens, their parts, adjacent word pairs, bracketed forms. */
function brandSpans(value, found) {
  const spans = [];
  for (const m of value.matchAll(/[A-Za-z0-9_]+/g)) {
    const token = m[0];
    if (found.has(token)) spans.push([m.index, m.index + token.length]);
    let offset = 0;
    for (const part of token.split(/(_+|(?<=[a-z0-9])(?=[A-Z]))/)) {
      if (part && !/^_+$/.test(part) && part !== token && found.has(part)) spans.push([m.index + offset, m.index + offset + part.length]);
      offset += part.length;
    }
  }
  for (const m of value.matchAll(/(?=\b([A-Za-z]+ [A-Za-z]+)\b)/g)) if (found.has(m[1])) spans.push([m.index, m.index + m[1].length]);
  for (const m of value.matchAll(/\[[A-Za-z0-9_]+\]/g)) if (found.has(m[0])) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

/**
 * Matches of the lexicon entries in one form value: [{entry, family, start, end, text, key}], text being
 * the exact matched text and key its normalised form (memory only, never written). Matches of one entry
 * are leftmost-longest and never overlap. In strict mode an entry applies only inside its scope and a
 * hashed literal only in its declared contexts. `relaxed` mode applies every hashed and brand matcher
 * everywhere and ignores contexts (plain structural patterns keep their scope): it is the containment
 * check of the seal's own files (README "Literal-free seal").
 */
export function matchValue(lexicon, path, value, form, { relaxed = false, whole = false, hashedOnly = false } = {}) {
  const out = [];
  const memo = new Map();
  for (const { e, matchers } of compiledLexicon(lexicon)) {
    const scoped = !hashedOnly && inScope(e, path);
    if (!relaxed && !hashedOnly && !scoped) continue;
    const spans = [];
    for (const m of matchers) {
      if (m.type === "regex") {
        if ((!m.bySha && !scoped) || (m.forms && !m.forms.includes(form))) continue;
        for (const [start, end, ks, ke] of candidates(value, m, memo)) {
          const text = value.slice(start, end);
          if (!m.bySha) {
            spans.push({ start, end, text, key: text });
            continue;
          }
          const key = NORMALIZE[m.key](value.slice(ks, ke));
          if (m.prefilter && !m.prefilter.has(fnv1a32(key))) continue;
          const h = m.bySha.get(memoSha(key));
          if (!h || (!relaxed && !contextOk(h, value, start, end, form, whole))) continue;
          spans.push({ start, end, text, key });
        }
      } else if (m.type === "window") {
        const L = m.length;
        if (value.length < L) continue;
        const norm = m.key === "ascii-lower" ? asciiLower(value) : value;
        let h = 0;
        for (let k = 0; k < L; k++) h = (Math.imul(h, RK_BASE) + norm.charCodeAt(k)) >>> 0;
        for (let i = 0; ; i++) {
          const bucket = m.byRk.get(h.toString(16).padStart(8, "0"));
          if (bucket) {
            const key = norm.slice(i, i + L);
            const keyHash = memoSha(key);
            const hit = bucket.find((x) => x.sha256 === keyHash);
            if (hit && (relaxed || contextOk(hit, value, i, i + L, form, whole))) spans.push({ start: i, end: i + L, text: value.slice(i, i + L), key });
          }
          if (i + L >= norm.length) break;
          h = (Math.imul((h - Math.imul(norm.charCodeAt(i), m.pow)) >>> 0, RK_BASE) + norm.charCodeAt(i + L)) >>> 0;
        }
      } else {
        const found = new Set(brandTokens(value, m.extra).filter((t) => !m.only || m.only.has(sha256(t.toLowerCase()))));
        if (!found.size) continue;
        const located = brandSpans(value, found);
        for (const [start, end] of located) spans.push({ start, end, text: value.slice(start, end), key: asciiLower(value.slice(start, end)) });
        const seen = new Set(located.map(([s, t]) => value.slice(s, t)));
        for (const t of found) if (!seen.has(t)) throw new Error(`brand token without a position in ${path}`);
      }
    }
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    let last = -1;
    for (const s of spans) {
      if (s.start < last) continue;
      out.push({ entry: e.id, family: e.family, start: s.start, end: s.end, text: s.text, key: s.key });
      last = s.end;
    }
  }
  return out;
}

// ------------------------------------------------------------------ reviewed occurrences
const reviewedIndexes = new WeakMap();
const reviewedKey = (entry, literal, o) => [entry, literal, o.form, o.line, o.column, o.endLine, o.endColumn].join("\u0000");
/**
 * Index of lexicon#/reviewed: SHA-256 of a repository path -> SHA-256 of the file bytes -> the keys of the
 * reviewed spans (entry, literal, form and span) of that exact file content.
 */
function reviewedIndex(lexicon) {
  let index = reviewedIndexes.get(lexicon);
  if (index) return index;
  index = new Map();
  for (const token of lexicon.reviewed?.tokens ?? []) {
    for (const f of token.files) {
      if (!HEX64.test(f.pathSha256 ?? "") || !HEX64.test(f.sha256 ?? "")) throw new Error(`reviewed token ${token.id}: file digests`);
      if (!index.has(f.pathSha256)) index.set(f.pathSha256, new Map());
      const byContent = index.get(f.pathSha256);
      if (!byContent.has(f.sha256)) byContent.set(f.sha256, new Set());
      for (const [form, line, column, endLine, endColumn] of f.spans) byContent.get(f.sha256).add(reviewedKey(token.entry, token.literal, { form, line, column, endLine, endColumn }));
    }
  }
  reviewedIndexes.set(lexicon, index);
  return index;
}
/** Whether lexicon#/reviewed binds spans of the file at `path` (any content). */
export const hasReviewed = (lexicon, path) => reviewedIndex(lexicon).has(sha256(path));

/**
 * Every lexicon occurrence of one text, one record per match:
 * {form, line, column, endLine, endColumn, entry, family, literal, key[, text]}. Line 0 is the path.
 * Lines are 1-based, columns 0-based UTF-16 offsets of the source, end exclusive; a token or decoded
 * match may end on a later line than it starts. `literal` is the SHA-256 of the exact matched text, `key`
 * the SHA-256 of its normalised key; `text` is returned only with `withText` (memory only). A token or
 * decoded match whose source span overlaps a raw match of the same entry adds no detection and is not
 * reported: the raw occurrence stands for it. Token values are scanned only when they differ from their
 * source text (an escape was decoded, constant fragments were joined, or the value spans lines). In strict
 * mode an occurrence bound by lexicon#/reviewed (same path, same file bytes `fileSha256`, by default the
 * SHA-256 of the UTF-8 text, same entry, literal, form and span) is a reviewed occurrence and is not
 * reported; `reviewed: false` reports it (the binding check of the seal test). The relaxed mode ignores
 * the reviewed records.
 */
export function scanText(path, text, lexicon, { relaxed = false, withText = false, forms, fileSha256, reviewed = true } = {}) {
  const result = scanAll(path, text, lexicon, { relaxed, withText, forms });
  if (relaxed || !reviewed) return result;
  const byContent = reviewedIndex(lexicon).get(sha256(path));
  const keys = byContent?.get(fileSha256 ?? sha256(text));
  if (!keys) return result;
  return { lines: result.lines, occurrences: result.occurrences.filter((o) => !keys.has(reviewedKey(o.entry, o.literal, o))) };
}

function scanAll(path, text, lexicon, { relaxed, withText, forms }) {
  const found = [];
  const record = (form, start, end, m) => {
    const r = { form, line: start.line, column: start.column, endLine: end.line, endColumn: end.column, entry: m.entry, family: m.family, literal: sha256(m.text), key: sha256(m.key) };
    if (withText) r.text = m.text;
    found.push(r);
  };
  const scope = maskPath(path, lexicon);
  for (const m of matchValue(lexicon, scope, path, "path", { relaxed })) record("path", { line: 0, column: m.start }, { line: 0, column: m.end }, m);
  const lines = splitLines(text);
  const extra = forms ?? formsOf(path);
  const starts = lineStarts(text);
  const rawSpans = new Map();
  lines.forEach((line, i) => {
    for (const m of matchValue(lexicon, scope, line, "raw", { relaxed })) {
      record("raw", { line: i + 1, column: m.start }, { line: i + 1, column: m.end }, m);
      rawSpans.set(m.entry, [...(rawSpans.get(m.entry) ?? []), [starts[i] + m.start, starts[i] + m.end]]);
    }
  });
  if (!extra.length) return { lines, occurrences: order(found, lexicon) };
  const emit = (form, p, whole) => {
    for (const m of matchValue(lexicon, scope, p.value, form, { relaxed, whole })) {
      const a = p.starts[m.start];
      const b = p.ends[m.end - 1];
      if ((rawSpans.get(m.entry) ?? []).some(([s, t]) => a < t && s < b)) continue;
      const startPos = position(starts, a);
      const endPos = position(starts, b - 1);
      endPos.column += 1;
      record(form, startPos, endPos, m);
    }
  };
  if (extra.includes("token")) {
    for (const c of constantStrings(text)) {
      if (c.escaped || c.joined || c.value.includes("\n")) emit("token", c, c.whole);
      if (extra.includes("decoded") && HAS_PERCENT.test(c.value)) {
        const p = decodePiece(c, PERCENT, percent);
        if (p) emit("decoded", p, false);
      }
    }
  } else if (extra.includes("decoded")) {
    lines.forEach((line, i) => {
      const base = starts[i];
      const src = { value: line, starts: Array.from({ length: line.length }, (_, k) => base + k), ends: Array.from({ length: line.length }, (_, k) => base + k + 1), escaped: false };
      for (const d of decodedVariants(src, path)) emit("decoded", d, false);
    });
  }
  return { lines, occurrences: order(found, lexicon) };
}

function order(found, lexicon) {
  const seen = new Set();
  const entryOrder = new Map(lexicon.entries.map((e, i) => [e.id, i]));
  const unique = found.filter((r) => {
    const k = `${r.form}\u0000${r.line}\u0000${r.column}\u0000${r.endLine}\u0000${r.endColumn}\u0000${r.entry}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => a.line - b.line || a.column - b.column || FORM_ORDER[a.form] - FORM_ORDER[b.form] || entryOrder.get(a.entry) - entryOrder.get(b.entry) || a.endLine - b.endLine || a.endColumn - b.endColumn);
  return unique;
}

/** scanText over file bytes: {binary, lines, occurrences}; a binary member is scanned raw only. */
export function scanBytes(path, bytes, lexicon, options = {}) {
  const binary = bytes.includes(0);
  const digest = hasReviewed(lexicon, path) ? { fileSha256: sha256(bytes) } : {};
  const { lines, occurrences } = scanText(path, decodeMember(bytes), lexicon, binary ? { ...options, ...digest, forms: [] } : { ...options, ...digest });
  return { binary, lines, occurrences };
}

// ------------------------------------------------------------------ look selector branches
const EQUALITY = new Set(["===", "!==", "==", "!="]);
const OPENERS = { "{": "}", "(": ")", "[": "]" };
const CLOSERS = new Set(["}", ")", "]"]);
const isPunct = (t, value) => t?.type === "punct" && t.value === value;
/** The longest run of contiguous `=` and `!` punctuation ending before sig[k] (backward) or starting at sig[k]. */
function equalityRun(sig, k, backward) {
  let run = "";
  for (let j = k; j >= 0 && j < sig.length; j += backward ? -1 : 1) {
    const t = sig[j];
    if (t.type !== "punct" || (t.value !== "=" && t.value !== "!")) break;
    const near = backward ? sig[j + 1] : sig[j - 1];
    if (j !== k && near && (backward ? t.end !== near.start : near.end !== t.start)) break;
    run = backward ? t.value + run : run + t.value;
  }
  return run;
}
/** Whether sig[j] ends an expression, so that a following `[` opens a member access. */
function endsExpression(t) {
  if (!t) return false;
  if (t.type === "ident") return !REGEX_AFTER_WORD.has(t.value);
  return ["number", "string", "template", "regex"].includes(t.type) || (t.type === "punct" && CLOSERS.has(t.value));
}
/** A key position: inside braces, after `{`, `,` or `;`, and followed by `:` or the optional `?:`. */
const keyBefore = (t) => isPunct(t, "{") || isPunct(t, ",") || isPunct(t, ";");
const keyAfter = (sig, j) => isPunct(sig[j], ":") || (isPunct(sig[j], "?") && isPunct(sig[j + 1], ":"));

/**
 * Look selector branches of JavaScript or TypeScript text (DESIGN.md:729, 837). A constant string (escapes
 * decoded, `+` chains and constant template substitutions folded) whose whole value is an occurrence of
 * one of `entries` (strict mode of the sealed lexicon) is a selector branch when it is an operand of ===,
 * !==, == or != ("comparison"), a case label ("case"), an object or type literal key, quoted or computed
 * ("key"), an array literal element ("element") or a computed member name ("member"); a bare identifier
 * whose whole text is such an occurrence is one when it is an object or type literal key ("key"). Returns
 * [{use, line, column, endLine, endColumn, entry, literal, key}] in source order (literal and key are
 * SHA-256 values; the matched text is never returned).
 */
export function selectorBranches(path, text, lexicon, entries) {
  const want = new Set(entries);
  const scope = maskPath(path, lexicon);
  const starts = lineStarts(text);
  const out = [];
  const hit = (value) => matchValue(lexicon, scope, value, "token", { whole: true }).find((m) => want.has(m.entry) && m.start === 0 && m.end === value.length);
  const record = (use, m, a, b) => {
    const s = position(starts, a);
    const e = position(starts, b - 1);
    out.push({ use, line: s.line, column: s.column, endLine: e.line, endColumn: e.column + 1, entry: m.entry, literal: sha256(m.text), key: sha256(m.key) });
  };
  const visit = (tokens) => {
    const sig = tokens.filter((t) => !trivia(t));
    const stack = [];
    for (let k = 0; k < sig.length; k++) {
      const t = sig[k];
      if (t.type === "template") for (const sub of t.subs) visit(sub);
      const prev = sig[k - 1];
      const top = stack[stack.length - 1];
      if (t.type === "string" || t.type === "template") {
        const chain = chainAt(sig, k);
        if (!chain) continue;
        const next = sig[chain.next];
        let use = null;
        if (EQUALITY.has(equalityRun(sig, k - 1, true)) || EQUALITY.has(equalityRun(sig, chain.next, false))) use = "comparison";
        else if (prev?.type === "ident" && prev.value === "case" && isPunct(next, ":")) use = "case";
        else if (top === "{" && keyBefore(prev) && keyAfter(sig, chain.next)) use = "key";
        else if (top === "[" && isPunct(prev, "[") && isPunct(next, "]")) {
          if (endsExpression(sig[k - 2])) use = "member";
          else if (stack[stack.length - 2] === "{" && keyBefore(sig[k - 2]) && keyAfter(sig, chain.next + 1)) use = "key";
          else use = "element";
        } else if (top === "[" && (isPunct(prev, "[") || isPunct(prev, ",")) && (isPunct(next, ",") || isPunct(next, "]"))) use = "element";
        if (use && chain.piece.value) {
          const m = hit(chain.piece.value);
          if (m) record(use, m, chain.piece.starts[0], chain.piece.ends[chain.piece.ends.length - 1]);
        }
        k = chain.next - 1;
      } else if (t.type === "ident" && top === "{" && keyBefore(prev) && keyAfter(sig, k + 1)) {
        const m = hit(t.value);
        if (m) record("key", m, t.start, t.end);
      }
      if (t.type === "punct") {
        if (t.value in OPENERS) stack.push(t.value);
        else if (CLOSERS.has(t.value)) stack.pop();
      }
    }
  };
  visit(lexJs(text).tokens);
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}
