import { ProfileContractError } from "../profile/canonical.js";
import upperMappings from "./unicode-upper.json" with { type: "json" };

// Unicode 15.0.0 default full mappings, kept independent of host Unicode data.
const upper = new Map<number, number[]>(upperMappings as [number, number[]][]);
const fullUppercase = (text: string): string => [...text].map(ch => {
  const points = upper.get(ch.codePointAt(0)!);
  return points ? String.fromCodePoint(...points) : ch;
}).join("");

export interface AnnotationRole {
  readonly role: "document" | "application";
  readonly prefix: string;
  readonly trim: "none" | "ecma262-2024-start";
  readonly labelCase: "none" | "upper";
}
export interface PolicyMetrics {
  readonly id: string;
  readonly unit: "per-mille-em";
  readonly firstCodePoint: number;
  readonly regular: readonly number[];
  readonly bold: readonly number[];
  readonly fallback: number;
  readonly lineHeight: number;
  readonly aliases: readonly { readonly from: string; readonly to: string }[];
  readonly license: string;
  readonly attribution: string;
}
export interface BusinessPolicy {
  readonly policyVersion: string;
  readonly id: string;
  readonly classification: { readonly annotationRoles: readonly AnnotationRole[]; readonly insertSeparator: string };
  readonly attachment: { readonly applicationHost: { readonly type: string; readonly mode: "exact" | "assignable" }; readonly nonActivityHost: "preserve-report" };
  readonly metrics: PolicyMetrics;
  readonly navigation: { readonly mode: "called-element" | "legacy-default" | "legacy-rules"; readonly rules?: readonly string[] };
  readonly presentation: Readonly<Record<string, any>>;
  readonly exportFacts: { readonly descriptorId: string; readonly extensionType: string; readonly namespaceFamily: string; readonly properties: Readonly<Record<string, string>> };
}

/** Recognition reads caller data; an omitted policy recognises no role. */
export function annotationRole(text: string | undefined, policy?: BusinessPolicy): AnnotationRole | undefined {
  const matches = policy?.classification.annotationRoles.filter(rule => {
    const value = rule.trim === "ecma262-2024-start" ? (text ?? "").trimStart() : (text ?? "");
    return value.startsWith(rule.prefix);
  }) ?? [];
  if (matches.length > 1) throw new ProfileContractError("profile-ambiguous-notion");
  return matches[0];
}

export function roleLabel(text: string | undefined, policy?: BusinessPolicy, layout = false): string {
  const rule = annotationRole(text, policy);
  if (!rule) return text ?? "";
  let value = text ?? "";
  if (rule.trim === "ecma262-2024-start") value = layout ? value.trim() : value.trimStart();
  value = value.slice(rule.prefix.length);
  value = layout ? value.trim() : value.trimStart();
  return rule.labelCase === "upper" ? fullUppercase(value) : value;
}

export function applicationHost(element: { readonly $type?: string | undefined; readonly type?: string | undefined; $instanceOf?: (type: string) => boolean }, policy?: BusinessPolicy): boolean {
  const host = policy?.attachment.applicationHost;
  if (!host) return false;
  const type = element.$type ?? element.type;
  if (type === host.type) return true;
  if (host.mode === "exact") return false;
  if (element.$instanceOf) return element.$instanceOf(host.type);
  return host.type === "bpmn:Activity" && !!type && /^(?:bpmn:)?(?:\w*Task|SubProcess|Transaction|AdHocSubProcess|CallActivity)$/.test(type);
}

export function insertRole(text: string, role: AnnotationRole["role"], policy?: BusinessPolicy): string {
  const rule = policy?.classification.annotationRoles.find(rule => rule.role === role);
  if (!rule) throw new ProfileContractError("profile-symbol");
  return rule.prefix + policy!.classification.insertSeparator + text;
}
