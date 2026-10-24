// Group "surfaces": listEntries queries (harmonization B17), ordering,
// localization, theme independence, upstream filtering. One query per surface;
// a case may list several queries, answered in order.
import { addCase, artifact, pin, cite, docs, clone, P, pureOk, unchangedSnapshotResult, R0, S0, S0c } from "./lot5-kit.mjs";

const text = (key, locale) => (P.MESSAGE_TEXT[locale] ?? {})[key] ?? P.MESSAGE_TEXT.en[key];
/** listEntries payload: groups by first appearance in the profile ui array, entries by numeric order then UTF-16 ID. */
export function listing(surface, ids, locale = "en", revision = R0) {
  const firstSeen = [...new Set(P.ui.map(e => e.group))];
  const entries = ids.map(id => P.ui.find(e => e.id === id)).map(e => ({
    group: e.group, id: e.id, label: { key: e.label, text: text(e.label, locale) }, icon: clone(e.icon), order: e.order, upstreamEntries: clone(e.upstreamEntries),
  }));
  for (const e of entries) if (P.ui.find(x => x.id === e.id).surface !== surface) throw new Error(`${e.id} is not on ${surface}`);
  const groups = firstSeen.filter(g => entries.some(e => e.group === g)).map(group => ({
    group,
    entries: entries.filter(e => e.group === group).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(({ group: _g, ...rest }) => rest),
  }));
  return { revision, surface, groups };
}
const SURFACES = ["palette", "context", "append", "connect", "replace", "paste", "delete", "direct-edit"];
const PALETTE = ["aid-create", "reference-create", "start-create", "task-create", "item-create", "end-create", "UserTask-create", "gateway-create", "input-create", "call-create", "external-call-create", "input-loose-create"];
const query = (surface, subject, locale = "en") => ({ baseRevision: R0, surface, subject, locale });
const CMP = ["lot5/result", "lot5/snapshot", "lot5/events", "lot5/twin"];
const LIST_DEFAULT = "listEntries (harmonization B17): PureResult {revision, surface, groups:[{group, entries:[{id, label:{key,text}, icon:{theme,glyph}, order, upstreamEntries}]}]}, one surface per query {baseRevision, surface, subject, locale}; the subject is the handle ui.when sees as self; empty groups are omitted.";

function listCase(nn, slug, { doc, snap, queries, results, clauses, discriminates }) {
  const result = results.map(r => pureOk(r));
  addCase("surfaces", nn, slug, {
    operation: "listEntries", inputArtifacts: [pin("snapshot", doc), artifact("queries", queries)],
    expectedArtifacts: [artifact("result", result), artifact("snapshot", unchangedSnapshotResult(snap)), artifact("events", []), artifact("twin", { result })],
    expectedStatus: "ok", comparatorIds: CMP, clauses: [...clauses, cite("8.3", 659), cite("10.1", 737)], discriminates, defaults: [LIST_DEFAULT],
  });
}

export function surfaces() {
  const paletteOf = locale => [listing("palette", PALETTE, locale), listing("paste", ["paste-elements"], locale)];
  const ownerQueries = locale => [query("palette", "Proc_main", locale), query("paste", "Proc_main", locale)];
  listCase(1, "palette-plain-en", { doc: docs.basic, snap: S0, queries: ownerQueries("en"), results: paletteOf("en"), clauses: [cite("8.3", 649), cite("8.3", 655)],
    discriminates: "Renders palette entries in profile array order (aid-create first, then reference-create...), orders groups alphabetically (data, flow, notes) instead of first appearance (notes, data, flow), sorts IDs with localeCompare (task-create before UserTask-create) or orders numerically as strings (\"10\" before \"9\")." });
  listCase(2, "palette-contrast-en", { doc: docs.basicContrast, snap: S0c, queries: ownerQueries("en"), results: paletteOf("en"), clauses: [cite("8.3", 649), cite("3.1", 264), cite("9.2", 694)],
    discriminates: "Lets the selected theme filter, relabel or re-icon surface entries (theme bypass): any difference from the plain-theme listing fails." });
  listCase(3, "palette-locale-fr", { doc: docs.basic, snap: S0, queries: ownerQueries("fr"), results: paletteOf("fr"), clauses: [cite("8.3", 649)],
    discriminates: "Falls back to the stable message key, or to an empty label, when the exact locale has no text, instead of policies.localeFallback (en); or ignores existing fr texts." });
  listCase(4, "palette-locale-fr-ca", { doc: docs.basic, snap: S0, queries: ownerQueries("fr-CA"), results: [listing("palette", PALETTE, "en"), listing("paste", ["paste-elements"], "en")], clauses: [cite("8.3", 649)],
    discriminates: "Truncates fr-CA to fr (BCP 47 lookup) and shows the fr texts; the contract is exact requested locale, then policies.localeFallback, then the key." });
  const element = (nn, slug, id, expected, discriminates, extra = []) => listCase(nn, slug, {
    doc: docs.basic, snap: S0, queries: SURFACES.filter(s => s !== "palette" && s !== "paste").map(s => query(s, id)),
    results: SURFACES.filter(s => s !== "palette" && s !== "paste").map(s => listing(s, expected[s] ?? [])), clauses: [cite("8.3", 649), ...extra], discriminates,
  });
  element(5, "element-task", "Task_A", {
    append: ["append-task", "append-end", "aid-attach"], connect: ["connect-flow", "connect-item-output"], delete: ["delete-element"], "direct-edit": ["rename-direct"], replace: ["to-user-task"],
  }, "Offers to-task or keeps the upstream replace list (exact typeIs ignored), shows upstream append.gateway/append.intermediate-event, or omits connect-item-output because the upstream connect rule is used.", [cite("2.3", 143), cite("8.3", 651)]);
  element(6, "element-user-task", "Task_B", {
    append: ["append-task", "append-end", "aid-attach"], connect: ["connect-flow", "connect-item-output"], delete: ["delete-element"], "direct-edit": ["rename-direct"], replace: ["to-task"],
  }, "Evaluates typeIs(Task, exact) as assignable (instance-of), offering to-user-task on a UserTask, or drops assignable entries for the subtype.", [cite("2.3", 143)]);
  element(7, "element-end", "End_1", { delete: ["delete-element"], "direct-edit": ["rename-direct"] },
    "Keeps upstream EndEvent append/connect affordances or a replace entry although no profile entry is enabled for an EndEvent.");
  element(8, "element-reference", "Ref_1", { connect: ["connect-reference-link"], delete: ["delete-element"], "direct-edit": ["rename-direct"], replace: ["reference-to-item"] },
    "Offers the upstream DataStoreReference connect (data input association) or upstream append.text-annotation instead of the profile reference-link entry.", [cite("8.3", 651)]);
  element(9, "element-annotation", "Note_1", { connect: ["connect-annotation-link"], delete: ["delete-element"], "direct-edit": ["aid-direct-edit", "note-direct-edit"], replace: ["note-to-aid"] },
    "Evaluates content conditions inside ui.when (reading /text on every subject type: a non-annotation reads MISSING, BLOCKB-PARITY-SYNC PS-11, and the annotation's own text then hides one of its two direct-edit entries), or offers the generic rename-direct for annotations.",
    [cite("2.3", 141), cite("8.3", 653)]);
  element(10, "element-call", "Call_1", { append: ["append-task", "append-end", "aid-attach"], connect: ["connect-flow"], context: ["call-unlink"], delete: ["delete-element"], "direct-edit": ["rename-direct"] },
    "Adds connect-item-output to a CallActivity through an assignable Activity check, or drops the profile-only call-unlink context entry because no upstream entry maps it.");

  // Upstream filtering (canvas business-profile mode): palette and one element context pad.
  const PALETTE_UPSTREAM = ["hand-tool", "lasso-tool", "space-tool", "global-connect-tool", "tool-separator", "create.start-event", "create.intermediate-event",
    "create.end-event", "create.exclusive-gateway", "create.task", "create.data-object", "create.data-store", "create.subprocess-expanded", "create.participant-expanded", "create.group"];
  const upstreamCase = (nn, slug, { query: q, expected, clauses, discriminates, defaults }) => addCase("surfaces", nn, slug, {
    operation: "ui.upstream-filter", inputArtifacts: [pin("snapshot", docs.basic), artifact("upstream-query", q)],
    expectedArtifacts: [artifact("upstream-filter", expected), artifact("snapshot", unchangedSnapshotResult(S0)), artifact("events", [])],
    expectedStatus: "ok", comparatorIds: ["lot5/upstream-filter", "lot5/snapshot", "lot5/events"], clauses, discriminates, defaults,
  });
  upstreamCase(11, "upstream-palette", {
    query: { surface: "palette", subject: "Proc_main", upstreamEntries: PALETTE_UPSTREAM },
    expected: {
      mapped: [
        { upstream: "create.data-object", entry: "item-create", enabled: true }, { upstream: "create.data-store", entry: "reference-create", enabled: true },
        { upstream: "create.end-event", entry: "end-create", enabled: true }, { upstream: "create.exclusive-gateway", entry: "gateway-create", enabled: true },
        { upstream: "create.start-event", entry: "start-create", enabled: true }, { upstream: "create.task", entry: "task-create", enabled: true },
        { upstream: "global-connect-tool", entry: "connect-flow", enabled: true },
      ],
      disabled: ["create.group", "create.intermediate-event", "create.participant-expanded", "create.subprocess-expanded"],
      outOfScope: ["hand-tool", "lasso-tool", "space-tool", "tool-separator"],
    },
    clauses: [cite("8.3", 659)],
    discriminates: "Keeps unlisted upstream create entries (group, pool, sub-process, intermediate event) in business-profile mode, or drops the mapped global-connect-tool.",
    defaults: ["Category of an upstream ID: create.* = create, append.* = append, replace-with-* = replace, connect and global-connect-tool = connect; other IDs (tools, separators) are outside the L659 rule and listed as outOfScope. Mapped lists sort by upstream ID (UTF-16)."],
  });
  upstreamCase(12, "upstream-context-task", {
    query: { surface: "context", subject: "Task_A", upstreamEntries: ["append.end-event", "append.gateway", "append.append-task", "append.intermediate-event", "replace", "append.text-annotation", "connect", "delete"] },
    expected: {
      mapped: [
        { upstream: "append.append-task", entry: "append-task", enabled: true }, { upstream: "append.end-event", entry: "append-end", enabled: true },
        { upstream: "append.text-annotation", entry: "aid-attach", enabled: true }, { upstream: "connect", entry: "connect-flow", enabled: true },
        { upstream: "delete", entry: "delete-element", enabled: true },
      ],
      disabled: ["append.gateway", "append.intermediate-event"],
      derived: [{ upstream: "replace", shown: true, reason: "replace surface has enabled entries for the subject" }],
      outOfScope: [],
    },
    clauses: [cite("8.3", 659), cite("8.3", 649)],
    discriminates: "Leaves upstream append.gateway/append.intermediate-event active for a Task, or hides the replace wrench although to-user-task is enabled.",
    defaults: ["The upstream replace wrench is a menu opener: shown iff the replace surface has an enabled entry for the subject (not an entry mapping)."],
  });
}
