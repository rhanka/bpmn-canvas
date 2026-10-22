// Closed result records of the lot-4 seal (DESIGN 10.1 L735-L737, Report/2
// L739-L753) with the harmonization header rule B4 and refusal rule B2/B3.
// Pure constructors over literal decisions; no implementation is imported.
import { compareText } from "./lot4-core.mjs";

const STAGES = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];

// Report/2 header members (B4): success carries all four, a refusal only the
// echoed source identity and input revision.
export function reportOf(operation, { sourceIdentity, targetIdentity, inputRevision, outputRevision, entries = [], rawStandardFindings = [], idMap = [], artifacts = [] } = {}) {
  return {
    reportVersion: "2", operation,
    ...(sourceIdentity === undefined ? {} : { sourceIdentity }),
    ...(targetIdentity === undefined ? {} : { targetIdentity }),
    ...(inputRevision === undefined ? {} : { inputRevision }),
    ...(outputRevision === undefined ? {} : { outputRevision }),
    entries, rawStandardFindings, idMap, artifacts,
  };
}

// Result/1 success of a read-only operation: baseRevision = revision.
export function resultOk(operation, { profileIdentity, baseRevision, revision = baseRevision, payload, report }) {
  return { status: "ok", operation, profileIdentity, baseRevision, revision,
    report: report ?? reportOf(operation, { sourceIdentity: profileIdentity, targetIdentity: profileIdentity, inputRevision: baseRevision, outputRevision: revision }), payload };
}

// Result/1 refusal (B2/B3): echo identity and revision when the input is
// shape-valid; diagnostics equal report.entries (lint findings of the stages
// executed before the refusal, [] when none ran); artifacts [] (block A
// refusal report precedent: no artifact was produced).
export function resultRefused(operation, code, { profileIdentity, baseRevision, entries = [], rawStandardFindings = [] } = {}) {
  return { status: "refused", operation,
    ...(profileIdentity === undefined ? {} : { profileIdentity }),
    ...(baseRevision === undefined ? {} : { baseRevision }),
    code, diagnostics: entries,
    report: reportOf(operation, { sourceIdentity: profileIdentity, inputRevision: baseRevision, entries, rawStandardFindings }) };
}

// PureResult (DESIGN 10.1 L737): helpers, compile and evaluation.
export const pureOk = (payload, diagnostics = []) => ({ status: "ok", payload, diagnostics });
export const pureRefused = (code, diagnostics = []) => ({ status: "refused", code, diagnostics });

// profile-report/2 entry order (L751 + harmonization G2): stage order, then
// ruleId, source domain/pointer/targetId, code, pageId, occurrenceKey,
// canonical before/after, result domain/pointer/targetId, property; null and
// absent sort first; UTF-16 string order.
const key = v => (v === undefined || v === null ? undefined : typeof v === "string" ? v : JSON.stringify(v));
export function compareEntries(a, b) {
  const sa = STAGES.indexOf(a.stage), sb = STAGES.indexOf(b.stage);
  if (sa !== sb) return sa - sb;
  const parts = e => [e.ruleId, e.source.domain, e.source.pointer, e.source.targetId, e.code, e.pageId, e.occurrenceKey,
    e.beforePresent ? JSON.stringify(e.before) : undefined, e.afterPresent ? JSON.stringify(e.after) : undefined,
    e.result.domain, e.result.pointer, e.result.targetId, e.property];
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < pa.length; i++) {
    const x = key(pa[i]), y = key(pb[i]);
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = compareText(x, y); if (c) return c;
  }
  return 0;
}
export const sortEntries = entries => [...entries].sort(compareEntries);

// idMap order (L753): domain, pageId absent first, occurrenceKey absent first, sourceId, resultId.
export const sortIdMap = list => [...list].sort((a, b) => {
  for (const f of ["domain", "pageId", "occurrenceKey", "sourceId", "resultId"]) {
    const x = a[f], y = b[f];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = compareText(x, y); if (c) return c;
  }
  return 0;
});

// Unified lint entry of a profile subrule (DESIGN 6.4 L515; harmonization B12).
export const lintEntry = ({ code, severity, classification, stage, ruleId, messageKey, pointer, targetId }) => ({
  code, severity, classification, stage, ruleId, messageKey, disposition: "observed",
  source: { domain: "tree", pointer, targetId, provenance: "exact" },
  result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" },
  beforePresent: false, afterPresent: false,
});
