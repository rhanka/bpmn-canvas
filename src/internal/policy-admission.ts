import schema from "./business-policy.schema.json" with { type: "json" };
import { canonicalDigest, ProfileContractError } from "../profile/canonical.js";
import { parseProfileText } from "../profile/contracts.js";
import type { BusinessPolicy } from "./business-policy.js";

type Rule = Record<string, any>;
const same = (a: unknown, b: unknown): boolean => canonicalDigest(a) === canonicalDigest(b);
function conforms(value: any, rule: Rule): boolean {
  if (rule.$ref) return conforms(value, rule.$ref.split("/").slice(1).reduce((s: any, k: string) => s[k], schema));
  if (rule.const !== undefined && !same(value, rule.const)) return false;
  if (rule.enum && !rule.enum.some((v: unknown) => same(value, v))) return false;
  if (rule.allOf && !rule.allOf.every((r: Rule) => conforms(value, r))) return false;
  if (rule.anyOf && !rule.anyOf.some((r: Rule) => conforms(value, r))) return false;
  if (rule.oneOf && rule.oneOf.filter((r: Rule) => conforms(value, r)).length !== 1) return false;
  if (rule.not && conforms(value, rule.not)) return false;
  if (rule.if && !conforms(value, conforms(value, rule.if) ? rule.then ?? {} : rule.else ?? {})) return false;
  if (rule.type === "object" || rule.properties || rule.required) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (rule.required?.some((key: string) => !Object.hasOwn(value, key))) return false;
    for (const key of Object.keys(value)) {
      if (rule.properties?.[key]) { if (!conforms(value[key], rule.properties[key])) return false; }
      else if (rule.additionalProperties === false) return false;
    }
  } else if (rule.type === "array") {
    if (!Array.isArray(value) || value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? Infinity)) return false;
    if (rule.uniqueItems && value.some((v, i) => value.slice(0, i).some(w => same(v, w)))) return false;
    if (rule.items && !value.every(v => conforms(v, rule.items))) return false;
  } else if (rule.type === "string") {
    if (typeof value !== "string" || [...value].length < (rule.minLength ?? 0)) return false;
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) return false;
  } else if (rule.type === "number" || rule.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (rule.type === "integer" && !Number.isInteger(value))) return false;
    if (value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity)) return false;
    if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) return false;
    if (rule.exclusiveMaximum !== undefined && value >= rule.exclusiveMaximum) return false;
  } else if (rule.type === "boolean" && typeof value !== "boolean") return false;
  return true;
}

/** Lexical, closed shape, then finite symbol/type checks, in that order. */
export function readBusinessPolicy(text: string): BusinessPolicy {
  const value = parseProfileText(text) as Rule;
  if (!conforms(value, schema)) throw new ProfileContractError("profile-schema");
  const unique = (rows: readonly Rule[], key: string): void => {
    if (new Set(rows.map(row => row[key])).size !== rows.length) throw new ProfileContractError("profile-symbol");
  };
  unique(value.classification.annotationRoles, "role");
  unique(value.metrics.aliases, "from");
  unique(value.presentation?.looks ?? [], "alias");
  unique(value.presentation?.layout?.nodeSizes ?? [], "kind");
  for (const alias of value.metrics.aliases) {
    const from = [...alias.from], to = [...alias.to];
    const ascii = (ch: string): boolean => ch.codePointAt(0)! >= 32 && ch.codePointAt(0)! <= 126;
    if (from.length !== 1 || to.length !== 1 || ascii(from[0]) || !ascii(to[0])) throw new ProfileContractError("profile-type");
  }
  return structuredClone(value) as BusinessPolicy;
}

export function validateBusinessPolicy(text: string): Record<string, unknown> {
  try {
    const value = readBusinessPolicy(text);
    return { status: "ok", id: value.id, canonicalSha256: canonicalDigest(value), sections: Object.keys(value).filter(k => k !== "id" && k !== "policyVersion").sort() };
  } catch (error) {
    return { status: "refused", code: error instanceof ProfileContractError ? error.code : "operation-error" };
  }
}
