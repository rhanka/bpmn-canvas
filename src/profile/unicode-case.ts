// Pinned Unicode full default case data for the profile `case` value operator.
// This module never calls platform case methods: every mapping and every
// context property comes from the injected 15.0.0 table vendored by hash from
// the twin-published unicode-case/1 contract.
import { canonicalize, ProfileContractError } from "./canonical.js";
import { cloneJson, failContract } from "./native-contracts.js";
import type { PureResult } from "./results.js";

/** The only Unicode version the profile `case` operator may apply. */
export const UNICODE_CASE_VERSION = "15.0.0" as const;

export interface UnicodeCaseSource {
  readonly file: string;
  readonly sha256: string;
}
export interface UnicodeCaseManifest {
  readonly unicodeVersion: typeof UNICODE_CASE_VERSION;
  readonly sources: readonly UnicodeCaseSource[];
}
/** Inclusive decimal code-point range of a UCD property table. */
export type UnicodeCaseRange = readonly [start: number, end: number];
export interface UnicodeCaseFinalSigma {
  readonly capital: number;
  readonly lowerFinal: number;
  readonly lowerNonFinal: number;
  readonly requiresCasedBefore: boolean;
  readonly requiresNoCasedAfter: boolean;
}
/** Full default mappings keyed by zero-padded uppercase hex code point
 * (for example "00DF" maps to ["0053", "0053"]). Absent entries map to
 * themselves, except the sigma capital, which follows the injected
 * Final_Sigma context rule in lower mode. */
export interface UnicodeCaseTable {
  readonly manifest: UnicodeCaseManifest;
  readonly upper: Readonly<Record<string, readonly string[]>>;
  readonly lower: Readonly<Record<string, readonly string[]>>;
  readonly cased: readonly UnicodeCaseRange[];
  readonly caseIgnorable: readonly UnicodeCaseRange[];
  readonly finalSigma: UnicodeCaseFinalSigma;
}

const HEX_DIGITS = "0123456789ABCDEF";
function hexKey(code: number): string {
  let out = "";
  let value = code;
  do {
    out = HEX_DIGITS[value % 16] + out;
    value = Math.floor(value / 16);
  } while (value > 0);
  while (out.length < 4) out = `0${out}`;
  return out;
}

function hexValue(key: string): number {
  if (!/^[0-9A-F]{4,6}$/.test(key)) failContract("profile-resource-missing");
  let value = 0;
  for (const unit of key) {
    const digit = HEX_DIGITS.indexOf(unit);
    value = value * 16 + digit;
  }
  if (value > 0x10ffff) failContract("profile-resource-missing");
  return value;
}

function checkCodePoint(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    failContract("profile-resource-missing");
  }
  return value as number;
}

function checkMappingTable(value: unknown): Record<string, readonly string[]> {
  if (!Array.isArray(value)) failContract("profile-resource-missing");
  const entries = value as unknown[];
  const checked: Record<string, string[]> = {};
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) failContract("profile-resource-missing");
    const [code, targets] = entry as unknown[];
    if (typeof code !== "number") failContract("profile-resource-missing");
    const key = hexKey(checkCodePoint(code));
    if (!Array.isArray(targets) || targets.length === 0) failContract("profile-resource-missing");
    const codes = targets as unknown[];
    for (const target of codes) checkCodePoint(typeof target === "number" ? target : failContract("profile-resource-missing"));
    if (Object.hasOwn(checked, key)) failContract("profile-resource-missing");
    checked[key] = (codes as number[]).map(target => hexKey(target));
  }
  return checked;
}

function checkRanges(value: unknown): UnicodeCaseRange[] {
  if (!Array.isArray(value)) failContract("profile-resource-missing");
  const checked: UnicodeCaseRange[] = [];
  for (const entry of value as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2) failContract("profile-resource-missing");
    const [start, end] = entry as unknown[];
    const first = checkCodePoint(start);
    const last = checkCodePoint(end);
    if (first > last) failContract("profile-resource-missing");
    checked.push([first, last]);
  }
  return checked;
}

function checkFinalSigma(value: unknown): UnicodeCaseFinalSigma {
  if (!value || typeof value !== "object" || Array.isArray(value)) failContract("profile-resource-missing");
  const record = value as Record<string, unknown>;
  // Only the UCD Case_Ignorable skip set is supported; any other context
  // property would have to be guessed.
  if (!Array.isArray(record.skipProperties) || record.skipProperties.length !== 1 ||
    record.skipProperties[0] !== "Case_Ignorable") failContract("profile-resource-missing");
  return {
    capital: checkCodePoint(record.capital),
    lowerFinal: checkCodePoint(record.lowerFinal),
    lowerNonFinal: checkCodePoint(record.lowerNonFinal),
    requiresCasedBefore: record.requiresCasedBefore === true,
    requiresNoCasedAfter: record.requiresNoCasedAfter === true,
  };
}

/** Validate an injected table. A non-15.0.0 manifest refuses; nothing is guessed. */
export function loadUnicodeCaseTable(data: unknown): PureResult<UnicodeCaseTable> {
  try {
    if (!data || typeof data !== "object" || Array.isArray(data)) failContract("profile-resource-missing");
    const record = data as Record<string, unknown>;
    const candidate = record.manifest as UnicodeCaseManifest | undefined;
    if (!candidate || typeof candidate !== "object" || candidate.unicodeVersion !== UNICODE_CASE_VERSION) {
      failContract("profile-resource-missing");
    }
    const manifest = candidate as UnicodeCaseManifest;
    if (!Array.isArray(manifest.sources)) failContract("profile-resource-missing");
    for (const source of manifest.sources) {
      if (!source || typeof source !== "object") failContract("profile-resource-missing");
      const entry = source as unknown as Record<string, unknown>;
      if (typeof entry.file !== "string" || !entry.file || typeof entry.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(entry.sha256)) failContract("profile-resource-missing");
    }
    const table: UnicodeCaseTable = {
      manifest: cloneJson(manifest),
      upper: checkMappingTable(record.upper),
      lower: checkMappingTable(record.lower),
      cased: checkRanges(record.cased),
      caseIgnorable: checkRanges(record.caseIgnorable),
      finalSigma: checkFinalSigma(record.finalSigma),
    };
    canonicalize(table);
    return { status: "ok", payload: table, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "profile-resource-missing" : "operation-error";
    return { status: "refused", code, diagnostics: [] };
  }
}

function inRanges(ranges: readonly UnicodeCaseRange[], code: number): boolean {
  return ranges.some(([start, end]) => code >= start && code <= end);
}

/** Final_Sigma per the injected rule: pure Cased / Case_Ignorable context,
 * no other exception. Before: scanning left past Case_Ignorable, the first
 * remaining code point must be Cased. After: scanning right past
 * Case_Ignorable, the first remaining code point must not be Cased
 * (end of string counts as final). */
function isFinalSigma(points: readonly number[], at: number, table: UnicodeCaseTable): boolean {
  const rule = table.finalSigma;
  if (rule.requiresCasedBefore) {
    let before = false;
    for (let i = at - 1; i >= 0; i -= 1) {
      const code = points[i]!;
      if (inRanges(table.caseIgnorable, code)) continue;
      before = inRanges(table.cased, code);
      break;
    }
    if (!before) return false;
  }
  if (rule.requiresNoCasedAfter) {
    for (let i = at + 1; i < points.length; i += 1) {
      const code = points[i]!;
      if (inRanges(table.caseIgnorable, code)) continue;
      return !inRanges(table.cased, code);
    }
  }
  return true;
}

/** Apply pinned full default mappings code point by code point, with the
 * injected Final_Sigma context rule in lower mode. Unmapped code points map
 * to themselves. Lone surrogates pass through; no normalization is applied. */
export function applyUnicodeCase(text: string, mode: "upper" | "lower", table: UnicodeCaseTable): string {
  if (typeof text !== "string") failContract("profile-type");
  if (mode !== "upper" && mode !== "lower") failContract("profile-schema");
  if (!table || typeof table !== "object" || table.manifest?.unicodeVersion !== UNICODE_CASE_VERSION) {
    failContract("profile-resource-missing");
  }
  const points: number[] = [];
  for (let position = 0; position < text.length;) {
    const code = text.codePointAt(position)!;
    points.push(code);
    position += code > 0xffff ? 2 : 1;
  }
  const mapping = mode === "upper" ? table.upper : table.lower;
  let out = "";
  points.forEach((code, index) => {
    if (code >= 0xd800 && code <= 0xdfff) {
      out += String.fromCodePoint(code);
      return;
    }
    if (mode === "lower" && code === table.finalSigma.capital) {
      out += String.fromCodePoint(isFinalSigma(points, index, table) ? table.finalSigma.lowerFinal : table.finalSigma.lowerNonFinal);
      return;
    }
    const targets = mapping[hexKey(code)];
    if (targets === undefined) {
      out += String.fromCodePoint(code);
    } else {
      for (const target of targets) out += String.fromCodePoint(hexValue(target));
    }
  });
  return out;
}
