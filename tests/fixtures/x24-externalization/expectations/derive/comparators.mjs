// x24 comparators: the executable semantics of every comparator id of the x24 cases (manifest.json
// #/executables pins this file by SHA-256). Pure functions over a sealed case and the observation the
// harness serialises for it; zero tolerance (DESIGN.md:961). Imports: the canonical JSON helper and the
// pure lexicon scanner only.
import { canonical, canonicalSha256 } from "./canonical.mjs";
import { matchValue } from "./scan.mjs";

/**
 * An observation is what the harness returns for one case run:
 *   {status: "success" | "refused:<code>", artifacts: {<role>: json}}            (one run)
 *   {runs: {a: <one run>, b: <one run>}}                                          (x24-substitution/1)
 * Artifact roles are those of the case's expectedArtifacts. A refusal carries only the refusal and state
 * artifacts: any other artifact is partial output.
 */
const PROVENANCE = new Set(["differences"]);
const ok = () => ({ ok: true, failures: [] });
const fail = (...failures) => ({ ok: false, failures });
const merge = (...verdicts) => {
  const failures = verdicts.flatMap((v) => v.failures);
  return { ok: failures.length === 0, failures };
};
const expectedOf = (c, role) => c.expectedArtifacts.find((a) => a.role === role)?.json;
const roles = (c) => c.expectedArtifacts.map((a) => a.role).filter((r) => !PROVENANCE.has(r));

/** RFC 6901 pointers at which two JSON values differ (a missing member differs at its pointer). */
export function differences(a, b, at = "") {
  if (canonical(a) === canonical(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => differences(a[k], b[k], `${at}/${String(k).replace(/~/g, "~0").replace(/\//g, "~1")}`));
  }
  return [at];
}

function sameRoles(c, run, allowed) {
  const want = allowed ?? roles(c);
  const got = Object.keys(run.artifacts ?? {}).sort();
  const missing = want.filter((r) => !got.includes(r));
  const extra = got.filter((r) => !want.includes(r));
  return merge(missing.length ? fail(`missing artifact ${missing.join(", ")}`) : ok(), extra.length ? fail(`extra artifact ${extra.join(", ")}`) : ok());
}
function equalJson(role, actual, expected) {
  return canonical(actual) === canonical(expected) ? ok() : fail(`${role} differs at ${differences(actual, expected).slice(0, 5).join(", ") || "/"}`);
}
const statusOf = (c, run) => (run.status === c.expectedStatus ? ok() : fail(`status ${run.status} instead of ${c.expectedStatus}`));

/** x24-exact-json/1: exact status, exactly the expected artifact roles, each canonically equal. */
export function exactJson(c, run) {
  const v = [statusOf(c, run), sameRoles(c, run)];
  for (const role of roles(c)) if (role !== "state" && role !== "assertions") v.push(equalJson(role, run.artifacts?.[role], expectedOf(c, role)));
  return merge(...v);
}

/** x24-refusal/1: the exact code, the refusal record canonically equal, no partial output. */
export function refusal(c, run) {
  const want = expectedOf(c, "refusal");
  const v = [statusOf(c, run), sameRoles(c, run, roles(c).filter((r) => r === "refusal" || r === "state"))];
  if (!want) v.push(fail("case has no refusal artifact"));
  else {
    v.push(equalJson("refusal", run.artifacts?.refusal, want));
    if (`refused:${want.code}` !== c.expectedStatus) v.push(fail("refusal code differs from expectedStatus"));
  }
  return merge(...v);
}

/**
 * x24-substitution/1: each run has exactly one results artifact equal to results-a or results-b (an
 * operation refusal of one run is projected into its results as {status: "refused", code, ids}), and the
 * pointers at which the two observed results differ equal `differences`.
 */
export function substitution(c, observation) {
  const a = observation.runs?.a;
  const b = observation.runs?.b;
  if (!a || !b) return fail("substitution needs runs a and b");
  const ra = expectedOf(c, "results-a");
  const rb = expectedOf(c, "results-b");
  const want = expectedOf(c, "differences");
  const v = [c.expectedStatus === "success" ? ok() : fail("a substitution case expects success")];
  for (const [k, run, expected] of [["a", a, ra], ["b", b, rb]]) {
    const got = Object.keys(run.artifacts ?? {});
    if (got.length !== 1 || got[0] !== "results") v.push(fail(`run ${k} artifacts ${got.join(", ")}`));
    v.push(equalJson(`results-${k}`, run.artifacts?.results, expected));
  }
  const seen = differences(a.artifacts?.results, b.artifacts?.results);
  if (canonical(seen) !== canonical(want)) v.push(fail(`difference set ${canonical(seen).slice(0, 120)} instead of ${canonical(want).slice(0, 120)}`));
  if (canonical(differences(ra, rb)) !== canonical(want)) v.push(fail("sealed differences disagree with the sealed results"));
  return merge(...v);
}

/** x24-state/1: every input artifact the operation received is unchanged after it (serialised digests). */
export function state(c, run) {
  const want = expectedOf(c, "state");
  return want ? equalJson("state", run.artifacts?.state, want) : ok();
}

// ------------------------------------------------------------------ assertions
function select(value, pointer) {
  if (pointer === "") return [value];
  let nodes = [value];
  for (const raw of pointer.split("/").slice(1)) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    nodes = nodes.flatMap((n) => {
      if (n === undefined || n === null) return [undefined];
      if (seg === "*") return Array.isArray(n) ? n : Object.values(n);
      const m = /^([^[\]]+)\[([^=]+)=(.*)\]$/.exec(seg);
      if (m) {
        const hits = (n[m[1]] ?? []).filter((x) => String(x?.[m[2]]) === m[3]);
        return hits.length === 1 ? hits : [undefined];
      }
      return [n[seg]];
    });
  }
  return nodes;
}
function strings(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}/${i}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [[`${path}/@key`, k], ...strings(v, `${path}/${k}`)]);
  return [];
}
/** Occurrences of the relaxed scan in every string (keys included) of a JSON value. */
export function lexiconOccurrences(lexicon, value, { families, field } = {}) {
  const out = [];
  for (const [at, s] of strings(value)) {
    if (field && !at.endsWith(`/${field}`)) continue;
    for (const m of matchValue(lexicon, "", s, "raw", { relaxed: true })) if (!families || families.includes(m.family)) out.push({ at, entry: m.entry });
  }
  return out;
}
function assertion(a, subject, ctx) {
  const nodes = select(subject, a.pointer);
  const all = (pred) => nodes.length > 0 && nodes.every(pred);
  switch (a.op) {
    case "equals": return all((n) => canonical(n) === canonical(a.value));
    case "keysEqual": return all((n) => n && canonical(Object.keys(n)) === canonical(a.value));
    case "nonEmptyArray": return all((n) => Array.isArray(n) && n.length > 0);
    case "nonEmptyString": return all((n) => typeof n === "string" && n.trim().length > 0);
    case "inSet": return all((n) => a.value.includes(n));
    case "excludesPattern": return all((n) => Array.isArray(n) && !n.some((x) => new RegExp(a.value).test(String(x))));
    case "noLexiconOccurrence": return all((n) => n !== undefined && lexiconOccurrences(ctx.lexicon, n, a.value ?? {}).length === 0);
    case "containsRowsOf": {
      const rows = select(ctx.files?.[a.value.ledger], a.value.pointer)[0] ?? [];
      return all((n) => Array.isArray(n) && rows.every((r) => {
        const s = n.find((x) => x[a.value.key] === r[a.value.key]);
        return s && a.value.fields.every((f) => canonical(s[f]) === canonical(r[f]));
      }));
    }
    case "equalsPackMembers": return all((n) => Array.isArray(n) && canonical(n.map((m) => m.path).sort()) === canonical([...(ctx.packMembers ?? [])].sort()));
    case "matchesBytes": return all((n) => typeof n === "string" && ctx.bytesDigests?.has(n));
    default: return false;
  }
}
/** x24-assertions/1: every assertion holds on the subject artifact of each run, the only artifact it reports. */
export function assertions(c, observation, ctx = {}) {
  const runs = observation.runs ? Object.entries(observation.runs) : [["", observation]];
  const v = [];
  for (const [k, run] of runs) {
    v.push(statusOf(c, run), sameRoles(c, run, ["subject"]));
    const list = expectedOf(c, k ? `assertions-${k}` : "assertions") ?? expectedOf(c, "assertions");
    const subject = run.artifacts?.subject;
    if (subject === undefined) v.push(fail(`run ${k || "single"} has no subject artifact`));
    for (const a of list ?? []) if (!assertion(a, subject, ctx)) v.push(fail(`assertion ${a.op} ${a.pointer} fails`));
  }
  return merge(...v);
}

// ------------------------------------------------------------------ inventory, pins, scans
/** x24-ledger/1: the recomputed ledger is byte-identical to the sealed one (same SHA-256); the section summary equals. */
export function ledger(c, run) {
  const sealed = c.expectedArtifacts.find((a) => a.role === "ledger");
  const v = [statusOf(c, run), sameRoles(c, run)];
  v.push(run.artifacts?.ledger?.sha256 === sealed?.sha256 ? ok() : fail("recomputed ledger differs from the sealed ledger"));
  v.push(equalJson("section", run.artifacts?.section, expectedOf(c, "section")));
  return merge(...v);
}
/** x24-legacy-values/1: each field of the supplied legacy record hashes to its pin. */
export function legacyValues(c, run) {
  const pins = expectedOf(c, "pins");
  const record = run.artifacts?.record;
  if (!record) return fail("no legacy record");
  const get = (path) => path.split(".").reduce((n, k) => n?.[k], record);
  const v = [statusOf(c, run), sameRoles(c, run, ["record"])];
  for (const [field, pin] of Object.entries(pins)) {
    const value = field === "exportFacts" ? { ...get(field), descriptorSha256: record.descriptorSha256 } : get(field);
    if (value === undefined || canonicalSha256(value) !== pin) v.push(fail(`pin ${field} differs`));
  }
  return merge(...v);
}
/**
 * x24-scan/1 and x24-seal-literals/1: the counts reported by the rescan equal the expected ones; the run
 * reports only its subject (assertion form) or only its literals record.
 */
export function counts(c, run) {
  const v = [statusOf(c, run), sameRoles(c, run, expectedOf(c, "literals") ? ["literals"] : ["subject"])];
  const list = expectedOf(c, "assertions");
  if (list) for (const a of list) if (!assertion(a, run.artifacts?.subject, {})) v.push(fail(`count ${a.pointer} fails`));
  const literals = expectedOf(c, "literals");
  if (literals) v.push(equalJson("literals", run.artifacts?.literals, literals));
  return merge(...v);
}

export const COMPARATORS = {
  "x24-exact-json/1": exactJson,
  "x24-refusal/1": refusal,
  "x24-substitution/1": substitution,
  "x24-assertions/1": assertions,
  "x24-state/1": state,
  "x24-ledger/1": ledger,
  "x24-legacy-values/1": legacyValues,
  "x24-scan/1": counts,
  "x24-seal-literals/1": counts,
};

/** Runs every comparator of a case on its observation. */
export function compareCase(c, observation, ctx = {}) {
  const v = [];
  for (const id of c.comparatorIds) {
    const f = COMPARATORS[id];
    if (!f) v.push(fail(`unknown comparator ${id}`));
    else if (id === "x24-state/1" && observation.runs) v.push(...Object.values(observation.runs).map((r) => state(c, r)));
    else v.push(f(c, observation, ctx));
  }
  return merge(...v);
}

/** The observation of an implementation that returns exactly the sealed values (used by the mutation witnesses). */
export function idealObservation(c) {
  if (c.comparatorIds.includes("x24-substitution/1")) {
    return { runs: { a: { artifacts: { results: expectedOf(c, "results-a") } }, b: { artifacts: { results: expectedOf(c, "results-b") } } } };
  }
  if (c.comparatorIds.some((id) => ["x24-legacy-values/1", "x24-assertions/1", "x24-scan/1"].includes(id))) return null;
  const artifacts = {};
  for (const a of c.expectedArtifacts) {
    if (PROVENANCE.has(a.role)) continue;
    artifacts[a.role] = a.role === "ledger" ? { sha256: a.sha256 } : a.json;
  }
  return { status: c.expectedStatus, artifacts };
}
