// Lot-4 seal derivation core. Standalone arithmetic and hash helpers only.
// Allowed imports: node:crypto. No loader, compiler, evaluator, codec,
// layout, exporter or command module is imported or reimplemented here.
import { createHash } from "node:crypto";

export const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function checkScalars(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = text.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) throw new Error("jcs: lone surrogate");
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error("jcs: lone surrogate");
  }
  return text;
}

// RFC 8785 for the JSON values used by this seal: UTF-16 key order, ECMAScript
// number rendering, JSON.stringify string escaping, no whitespace.
export function jcs(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("jcs: nonfinite");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(checkScalars(value));
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort(compareText);
    return `{${keys.map(k => `${JSON.stringify(checkScalars(k))}:${jcs(value[k])}`).join(",")}}`;
  }
  throw new Error(`jcs: unsupported ${typeof value}`);
}

export const B = bytes => createHash("sha256").update(bytes).digest("hex");
export const H = value => B(Buffer.from(jcs(value), "utf8"));

// Exact rationals over BigInt. A binary64 input is taken as the exact rational
// of its shortest round-trip decimal (ECMAScript Number::toString), which is
// also its JCS spelling.
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
export function rat(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new Error("rat: zero denominator");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export function ratFromNumber(value) {
  if (!Number.isFinite(value)) throw new Error("rat: nonfinite");
  const text = String(Object.is(value, -0) ? 0 : value);
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(text);
  if (!m) throw new Error(`rat: unexpected spelling ${text}`);
  const [, sign, int, frac = "", exp = "0"] = m;
  let n = BigInt(int + frac), d = 10n ** BigInt(frac.length);
  const e = Number(exp);
  if (e > 0) n *= 10n ** BigInt(e); else if (e < 0) d *= 10n ** BigInt(-e);
  return rat(sign ? -n : n, d);
}
export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const div = (a, b) => rat(a.n * b.d, a.d * b.n);
export const cmp = (a, b) => { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; };
export const max = (...xs) => xs.reduce((m, x) => (cmp(x, m) > 0 ? x : m));
export const min = (...xs) => xs.reduce((m, x) => (cmp(x, m) < 0 ? x : m));
export const R = value => (typeof value === "object" ? value : ratFromNumber(value));

// Round nearest, ties to even, once; negative zero becomes zero.
export function roundEven(value) {
  const { n, d } = R(value);
  let q = n / d, r = n % d; // BigInt division truncates toward zero
  if (r < 0n) { q -= 1n; r += d; } // floor
  const twice = 2n * r;
  if (twice > d || (twice === d && q % 2n !== 0n)) q += 1n;
  const result = Number(q);
  if (!Number.isSafeInteger(result)) throw new Error("roundEven: unsafe result");
  return result === 0 ? 0 : result;
}
export const ticksFromPoints = value => roundEven(mul(R(value), rat(1000n)));

export const clone = value => JSON.parse(JSON.stringify(value));
export const stableId = (ownerId, slot, key) => `g_${H(["profile-mechanism/1", ownerId, slot, key])}`;
export const digestOutputId = (pageId, occurrenceKey, domain) => `e_${H([pageId, occurrenceKey, domain])}`;
