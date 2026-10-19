import { entry, unavailable } from "../profile/report.js";
import type { ReportEntry } from "../profile/report.js";
import type { F1Diagnostic } from "./f1-extensions.js";

/** The caller supplies immutable source/result values and their presence.
 * A tree coordinate is asserted only for the explicitly selected tree domain.
 */
export function f1DiagnosticEntry(diagnostic: F1Diagnostic, context: {
  readonly stage: "load" | "import" | "export";
  readonly sourceDomain: "tree" | "none";
  readonly lossClass: NonNullable<ReportEntry["lossClass"]>;
  readonly beforePresent: boolean; readonly before?: unknown;
  readonly afterPresent: boolean; readonly after?: unknown;
  readonly originalType?: string; readonly property?: string;
}): ReportEntry {
  return entry({
    code: diagnostic.code, legacyCode: diagnostic.code, ruleId: "f1", messageKey: diagnostic.code,
    stage: context.stage, severity: "warn", classification: "loss", disposition: "mapped",
    lossClass: context.lossClass,
    source: context.sourceDomain === "tree" ? { domain: "tree", pointer: diagnostic.path, targetId: diagnostic.target ?? null, provenance: "exact" } : unavailable,
    result: unavailable,
    beforePresent: context.beforePresent, afterPresent: context.afterPresent,
    ...(Object.hasOwn(context, "before") ? { before: context.before } : {}),
    ...(Object.hasOwn(context, "after") ? { after: context.after } : {}),
    ...(context.originalType ? { originalType: context.originalType } : {}),
    ...(context.property ? { property: context.property } : {}),
  });
}
