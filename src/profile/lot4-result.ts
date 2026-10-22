// Lot-4 result records: thin constructors over the shared report and
// result validators. Every record validates before it leaves the module.
import { buildReport } from "./report.js";
import { validateResult } from "./results.js";
import type { TokenContext } from "./presentation-contracts.js";
import type { Result } from "./results.js";

export function okResult(operation: string, args: {
  readonly identity: unknown; readonly revision: string; readonly baseRevision?: string; readonly outputRevision?: string;
  readonly entries?: readonly any[]; readonly idMap?: readonly any[]; readonly artifacts?: readonly any[];
  readonly payload: unknown; readonly tokenContext?: TokenContext;
}): Result<unknown> {
  const base = args.baseRevision ?? args.revision, output = args.outputRevision ?? args.revision;
  const report = buildReport(operation, {
    sourceIdentity: args.identity as any,
    targetIdentity: args.identity as any,
    inputRevision: base,
    outputRevision: output,
    entries: (args.entries ?? []) as any[],
    idMap: (args.idMap ?? []) as any[],
    artifacts: (args.artifacts ?? []) as any[],
  });
  return validateResult({
    status: "ok", operation, profileIdentity: args.identity,
    baseRevision: base, revision: output,
    report, payload: args.payload,
  }, args.tokenContext === undefined ? {} : { tokenContext: args.tokenContext }) as Result<unknown>;
}

const REPORT_STAGES = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];

const textOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Full profile-report/2 entry ordering (stage, rule, source, code, page,
// occurrence, before/after, result, property).
export function sortReportEntries(entries: readonly any[]): any[] {
  const keyOf = (e: any): unknown[] => [
    e.ruleId, e.source?.domain, e.source?.pointer, e.source?.targetId, e.code, e.pageId, e.occurrenceKey,
    e.beforePresent ? JSON.stringify(e.before) : undefined, e.afterPresent ? JSON.stringify(e.after) : undefined,
    e.result?.domain, e.result?.pointer, e.result?.targetId, e.property,
  ];
  return [...entries].sort((a, b) => {
    const stage = REPORT_STAGES.indexOf(a.stage) - REPORT_STAGES.indexOf(b.stage);
    if (stage) return stage;
    const left = keyOf(a), right = keyOf(b);
    for (let i = 0; i < left.length; i++) {
      const x = left[i] ?? undefined, y = right[i] ?? undefined;
      if (x === y) continue;
      if (x === undefined || x === null) return -1;
      if (y === undefined || y === null) return 1;
      const order = textOrder(String(x), String(y));
      if (order) return order;
    }
    return 0;
  });
}

export function refusedResult(operation: string, code: string, args: {
  readonly identity: unknown; readonly revision: string;
  readonly entries?: readonly any[]; readonly idMap?: readonly any[];
}): Result<unknown> {
  const report = buildReport(operation, {
    sourceIdentity: args.identity as any,
    inputRevision: args.revision,
    entries: (args.entries ?? []) as any[],
    idMap: (args.idMap ?? []) as any[],
    artifacts: [],
  });
  return validateResult({
    status: "refused", operation, profileIdentity: args.identity,
    baseRevision: args.revision, code, diagnostics: report.entries, report,
  }) as Result<unknown>;
}
