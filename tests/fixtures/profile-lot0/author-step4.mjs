// Standalone expectation AUTHORING TOOL. Never imported by CI or production.
// Usage: node author-step4.mjs /absolute/path/to/DESIGN.md
// Literal verdicts, permutations and source/result coordinates are authored below.
// Only fixture assembly, UTF-16 JCS and SHA-256 are computed; no interpreter runs.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("./", import.meta.url);
const vendor = new URL("../profile-parity-corpus/profile-mechanism/1/", root);
const read = (name, base = root) => JSON.parse(readFileSync(new URL(name, base), "utf8"));
const save = (name, value) => writeFileSync(new URL(name, root), JSON.stringify(value, null, 2) + "\n");
const clone = value => structuredClone(value);
const sha = value => createHash("sha256").update(value).digest("hex");
const jcs = value => Array.isArray(value) ? `[${value.map(jcs).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const designSha256 = "feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497";
const authority = readFileSync(process.argv[2]);
if (sha(authority) !== designSha256) throw Error("Wrong design authority");
const lines = authority.toString("utf8").split("\n");
const old = read("expectations.json");
const prior = old.vectors.slice(0, 211);
const priorHash = sha(JSON.stringify(prior).replace(/[\u007f-\uffff]/g,
  c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));
if (priorHash !== "540d52a260d4e4d9d531410ab42d5ea700adb082edeb2598b16f93f9df6f9ab9") throw Error("Prior vectors changed");
const calculations = [];
const H = (id, value) => {
  const canonical = jcs(value), hash = sha(canonical);
  calculations.push({ id, domain: "JCS", value: clone(value), canonical, sha256: hash });
  return hash;
};
const B = (id, utf8) => {
  const hash = sha(utf8); calculations.push({ id, domain: "raw-UTF8", utf8, sha256: hash }); return hash;
};
const inputs = { format: "profile-step4-inputs/1", designSha256, boundary: "Supplied, immutable Layout/R and admitted native records; no production layout, compiler, lint or serialization execution is claimed." };
const ref = (role, key) => ({ role, fixture: "step4-inputs.json", key });
const artifact = (role, json) => ({ role, json: clone(json) });
const vectors = [];
function add(family, scenario, inputArtifacts, expectedArtifacts, provenance, derivation, code = null, extra = {}) {
  const verdict = code === null ? { status: "ok" } : code === "refused" ? { status: "refused" } : { status: "refused", code };
  vectors.push({ caseId: `s4-${family}-${scenario}`, family, scenario, operation: `${family}-boundary`,
    inputArtifacts, expectedStatus: code === null ? "ok" : code === "refused" ? "refused" : `refused:${code}`,
    expectedArtifacts: [artifact("verdict", verdict), ...expectedArtifacts],
    provenance: [...new Set(provenance)].sort((a,b) => a-b).map(n => `DESIGN.md:${n}`),
    method: "hand-derived", author: "gpt-6-astra / xhigh", derivation,
    review: { status: "pending-independent-review" }, ...extra });
}
const noCandidate = { candidateReturned: false, sourceUnchanged: true };
const report = (operation, entries = [], extra = {}) => ({ reportVersion: "2", operation, entries, rawStandardFindings: [], idMap: [], artifacts: [], ...extra });
const reportArtifact = value => {
  const canonical = jcs(value);
  return { role: "report", json: clone(value), canonical, sha256: sha(canonical) };
};
const unavailable = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
const coordinate = (pointer, targetId, domain = "tree", provenance = "exact") => ({ domain, pointer, targetId, provenance });
const entry = (extra = {}) => ({ code: "fixture-note", severity: "info", classification: "advisory", stage: "load", ruleId: "fixture", messageKey: "fixture.note", disposition: "observed", source: clone(unavailable), result: clone(unavailable), beforePresent: false, afterPresent: false, ...clone(extra) });

// A local two-theme package derived from neutral input data, not a published release.
const neutral = read("neutral-profile.json", vendor);
const profile = clone(neutral);
const dim = { ...clone(profile.themes[0]), id: "dim", fallback: "plain" };
dim.tokens = dim.tokens.map(t => t.name === "fill" ? { name: "fill", value: "#eeeeee" } : t);
profile.themes.push(dim);
inputs.profile = profile;
const profileDigest = H("local-profile", profile);
const identity = { mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
  profile: profile.profile, version: profile.version, sha256: profileDigest, base: clone(profile.base), descriptors: clone(profile.descriptors) };
const descriptorDigest = H("descriptor-pins", identity.descriptors);
const tree = { $type: "bpmn:Definitions", id: "D", targetNamespace: "urn:neutral", rootElements: [
  { $type: "bpmn:Process", id: "P", isExecutable: false, flowElements: [
    { $type: "bpmn:Task", id: "Z", name: "First" }, { $type: "bpmn:Task", id: "A", name: "Second" }
  ], artifacts: [] }
] };
const semanticRevision = H("semantic-revision", { tree, profileIdentity: identity, bindings: [] });
const envelope = { documentVersion: "1", profileIdentity: identity, tree, bindings: [], semanticRevision };
inputs.envelope = envelope;
inputs.preconditions = { nativeStorageAndIdentityVerifiedAtBoundary: true, syntheticPackageNotPublished: true,
  descriptorSlice: "neutral fixture scope; full native DI descriptor validation is deferred" };
const bounds = { x: 0, y: 0, width: 1000, height: 800 };
const pages = [
  { pageId: "Z-page", name: "First sheet", order: 2, semanticRootId: "P", bounds },
  { pageId: "A-page", name: "Second sheet", order: 10, semanticRootId: "P", bounds }
];
const occurrence = (pageId, occurrenceKey, semanticId, x) => ({ pageId, occurrenceKey, semanticId, role: "content", emittedType: "node",
  bounds: { x, y: 20, width: 100, height: 80 }, label: { text: semanticId === "Z" ? "First" : "Second", bounds: { x, y: 100, width: 100, height: 20 }, lines: [semanticId === "Z" ? "First" : "Second"] },
  style: [{ name: "fill", value: "#ffffff" }, { name: "stroke", value: "#000000" }], glyphId: "task" });
const occurrences = [occurrence("Z-page", "a", "Z", 0), occurrence("Z-page", "z", "A", 200), occurrence("A-page", "a", "Z", 0)];
const pair = (pageId, occurrenceKey) => ({ pageId, occurrenceKey });
const coverage = [
  { semanticId: "D", occurrences: [], disposition: "nonvisual" },
  { semanticId: "P", occurrences: [], disposition: "nonvisual" },
  { semanticId: "Z", occurrences: [pair("Z-page", "a"), pair("A-page", "a")], disposition: "rendered" },
  { semanticId: "A", occurrences: [pair("Z-page", "z")], disposition: "rendered" }
];
const geometry = occurrences.map(({ pageId, occurrenceKey, semanticId, role, bounds, label }) => ({ pageId, occurrenceKey, semanticId, role, bounds, label }));
const layout = { layoutVersion: "1", pages, geometry };
const overrides = { semantic: [], occurrence: [] }, diStyles = { native: [], bioc: [] };
const metricsUtf8 = readFileSync(new URL("neutral-metrics.json", vendor), "utf8");
const metricPins = [{ id: "neutral-metrics", sha256: B("metric-resource", metricsUtf8) }];
const binding = { semanticRevision, profileDigest, descriptorDigest,
  layoutDigest: H("layout", layout), themeId: "plain", themeDigest: H("theme-plain", { themeId: "plain", themes: [profile.themes[0]] }),
  overridesDigest: H("empty-overrides", overrides), diStylesDigest: H("empty-di-styles", diStyles),
  metricsDigest: H("metric-pins", metricPins), payloadDigest: H("render-payload", { pages, occurrences, coverage, diagnostics: [] }) };
const viewTuple = { semanticRevision, layoutDigest: binding.layoutDigest, themeId: binding.themeId, themeDigest: binding.themeDigest,
  overridesDigest: binding.overridesDigest, diStylesDigest: binding.diStylesDigest, metricsDigest: binding.metricsDigest };
const viewRevision = H("view-revision", viewTuple);
const render = { renderVersion: "1", binding, pages, occurrences, coverage, diagnostics: [] };
const importedDi = { descriptorDigest, diagrams: [], sha256: H("empty-archived-di", { descriptorDigest, diagrams: [] }) };
const snapshot = { snapshotVersion: "1", envelope, presentation: { layout, themeId: "plain", overrides, diStyles, importedDi,
  selection: [pair("Z-page", "a"), pair("A-page", "a")], activePageId: "Z-page" }, viewRevision };
Object.assign(inputs, { layout, render, snapshot, viewTuple, metricPins, overrides, diStyles });
const snapshotRefs = [601, 603, 658, 681, 683];
const snapshotInput = [ref("snapshot", "snapshot"), ref("boundary-preconditions", "preconditions")];
const emptyTree = { $type: "bpmn:Definitions", id: "D", targetNamespace: "urn:neutral", rootElements: [] };
const emptyRevision = H("empty-semantic", { tree: emptyTree, profileIdentity: identity, bindings: [] });
const emptyLayout = { layoutVersion: "1", pages: [], geometry: [] };
const emptySnapshot = clone(snapshot);
emptySnapshot.envelope = { ...envelope, tree: emptyTree, semanticRevision: emptyRevision };
emptySnapshot.presentation.layout = emptyLayout;
emptySnapshot.presentation.selection = [];
emptySnapshot.presentation.activePageId = "";
emptySnapshot.viewRevision = H("empty-view", { ...viewTuple, semanticRevision: emptyRevision, layoutDigest: H("empty-layout", emptyLayout) });
inputs.emptySnapshot = emptySnapshot;
add("snapshot", "empty", [ref("snapshot", "emptySnapshot")], [artifact("snapshot", emptySnapshot)], snapshotRefs,
  "Empty pages require empty selection and the exact empty activePageId. All optional bags remain explicit empty records or arrays.");
add("snapshot", "repeated-selection", snapshotInput, [ref("snapshot", "snapshot")], snapshotRefs,
  "The two selected occurrences share semantic Z but have different page/key pairs; both remain in the original selection order.");
for (const [scenario, patch, code, why] of [
  ["duplicate-identity", { profileIdentity: identity }, "snapshot-schema", "A second top-level identity is an unknown field even when its bytes agree."],
  ["unknown-field", { editorHistory: [] }, "snapshot-schema", "Editor history is excluded from the closed snapshot record."],
  ["null", { "presentation.selection": null }, "refused", "Optional snapshot content is explicitly empty; null is not an alternative."],
  ["profile-conflict", { hostProfileIdentity: { ...identity, sha256: "0".repeat(64) } }, "profile-metadata-conflict", "The explicit host target conflicts with the snapshot profile; neither identity wins."],
  ["base-conflict", { hostProfileIdentity: { ...identity, base: { ...identity.base, sha256: "0".repeat(64) } } }, "profile-metadata-conflict", "Host target base disagreement is an identity conflict before archive or view validation."],
  ["descriptor-conflict", { hostProfileIdentity: { ...identity, descriptors: [] } }, "profile-metadata-conflict", "Host target descriptor disagreement is a conflicting target identity, not an archive repair."],
  ["archived-di-damage", { "presentation.importedDi.sha256": "0".repeat(64) }, "snapshot-stale", "The archive digest differs from the hash of the exact descriptorDigest/diagrams record."],
  ["stale-layout", { "presentation.layout.pages[0].name": "Renamed sheet" }, "snapshot-stale", "Changing the captured page name changes layoutDigest and invalidates the stored view revision."],
  ["stale-view", { viewRevision: "0".repeat(64) }, "snapshot-stale", "Restore compares the complete view tuple and cannot silently recompute presentation."],
  ["invalid-selection", { "presentation.selection": [pair("Z-page", "missing")] }, "refused", "Selection resolves exact page/key pairs; a missing occurrence cannot be restored."],
  ["duplicate-selection", { "presentation.selection": [pair("Z-page", "a"), pair("Z-page", "a")] }, "refused", "Selection is ordered but unique; exact duplicate page/key pairs refuse."],
  ["active-page", { "presentation.activePageId": "" }, "refused", "A nonempty layout requires an active page that is actually present."],
  ["semantic-selection", { "presentation.selection": [{ semanticId: "Z" }] }, "refused", "Semantic IDs alone cannot choose between repeated views."],
  ["version", { snapshotVersion: "2" }, "refused", "Restore validates the supported snapshot version before using presentation."],
  ["missing-layout", { omit: "presentation.layout" }, "snapshot-stale", "Missing layout refuses restore; preparing a new layout is a separate operation."]
]) add("snapshot", scenario, [...snapshotInput, artifact("literal-replacements", patch)],
  [artifact("restore-effects", { ...noCandidate, layoutRecomputed: false })], snapshotRefs, why, code);
const navigated = clone(snapshot); navigated.presentation.selection.reverse(); navigated.presentation.activePageId = "A-page";
add("snapshot", "navigation-only", snapshotInput, [artifact("snapshot", navigated), artifact("unchanged-digests", { semanticRevision, viewRevision, payloadDigest: binding.payloadDigest })], [601,603,681],
  "Navigation and selection change only their snapshot fields; neither the semantic revision nor the render payload includes them.");
const archived = { descriptorDigest, diagrams: [{ $type: "bpmndi:BPMNDiagram", id: "ImportedDiagram", plane: { $type: "bpmndi:BPMNPlane", id: "ImportedPlane", bpmnElement: "P", planeElement: [] } }] };
add("snapshot", "archive-preservation", [artifact("already-descriptor-validated-archive", archived)],
  [artifact("importedDi", { ...archived, sha256: H("archived-di-bytes", archived) }), artifact("scope", { archivePreserved: true, displayedGeometryAuthority: "layout", nativeDiValidationQualified: false })], [601,603,264],
  "At the archive hashing seam, retain every supplied diagram independently of displayed layout. This witness assumes prior descriptor validation and does not qualify the missing full DI descriptor set.");

const renderInput = [ref("render", "render"), ref("layout", "layout"), ref("envelope", "envelope")];
add("render-contract", "complete-binding", renderInput, [ref("render", "render"), artifact("viewRevision", viewRevision)], [258,262,658,660,662,664,668,672,673,674,675,676,677,678,679,681],
  "Every binding field is hashed from the explicitly supplied neutral data; layout page names are captured independently of page IDs.");
add("render-contract", "page-order", [artifact("pages", [pages[1], pages[0]])], [artifact("ordered-pages", pages)], [123,658],
  "Numeric page order 2 precedes 10 even though page ID A sorts before Z. This is a supplied-record ordering seam.");
const unicodeOccurrences = [occurrence("Z-page", "\u{10000}", "Z", 0), occurrence("Z-page", "\ue000", "A", 100)];
add("render-contract", "occurrence-order", [artifact("occurrences", [unicodeOccurrences[1], unicodeOccurrences[0]])], [artifact("ordered-occurrences", unicodeOccurrences)], [124,126,258,260,662],
  "UTF-16 occurrence keys place U+10000 before U+E000, opposing both scalar and semantic-ID ordering.");
add("render-contract", "repeated-semantic", renderInput, [artifact("coverage", coverage), artifact("occurrence-pairs", [pair("Z-page","a"),pair("Z-page","z"),pair("A-page","a")])], [123,124,662,664],
  "Page order precedes occurrence key; the repeated Z semantic ID is retained once on each represented page.");
const syntheticKey = jcs(["side-stripe", "P", "Z-page"]);
const synthetic = { pageId: "Z-page", occurrenceKey: syntheticKey, role: "band-stripe", emittedType: "node", bounds: { x: 0, y: 0, width: 10, height: 800 }, style: [{ name: "fill", value: "#eeeeff" }], glyphId: "aid" };
add("render-contract", "synthetic", [artifact("declared-synthetic-context", { declarationId: "side-stripe", ownerId: "P", pageId: "Z-page", suppliedBounds: synthetic.bounds })], [artifact("occurrence", synthetic)], [664,706],
  "The synthetic key is the exact canonical declaration/owner/page tuple; semanticId is absent. Bounds are supplied, not computed by a renderer.");
const edge = { pageId: "Z-page", occurrenceKey: "edge", semanticId: "E", role: "content", emittedType: "edge", bounds: { x: 100, y: 60, width: 100, height: 0 }, style: [], glyphId: "connector",
  sourceOccurrence: pair("Z-page","a"), targetOccurrence: pair("Z-page","z"), waypoints: [{ x: 100, y: 60 }, { x: 200, y: 60 }] };
inputs.edge = edge;
add("render-contract", "edge", [artifact("supplied-edge-context", { edge, peers: occurrences, admittedSemanticId: "E", glyphCapabilitySupplied: true })], [artifact("occurrence", edge)], [662],
  "Both exact page/key endpoints resolve and two ordered integer waypoints preserve edge direction. Native graph and glyph admission are explicit preconditions.");
for (const [scenario, patch, refs, why] of [
  ["endpoint-missing", { edge: { ...edge, targetOccurrence: pair("Z-page","missing") } }, [662], "The target pair does not resolve in the supplied render records."],
  ["waypoints-short", { edge: { ...edge, waypoints: [{x:100,y:60}] } }, [662], "An edge requires at least two ordered waypoints."],
  ["nonedge-endpoint", { "occurrences[0].sourceOccurrence": pair("Z-page","z") }, [662], "A nonedge omits endpoints and waypoints entirely."],
  ["coverage-missing", { coverage: coverage.slice(1) }, [664], "The admitted ID-bearing Definitions element must also have a coverage record."],
  ["fractional-geometry", { "occurrences[0].bounds.x": 0.001 }, [662], "Geometry is already in integer ticks; the boundary cannot round fractional coordinates."],
  ["negative-size", { "occurrences[0].bounds.width": -1 }, [662], "Signed positions are permitted but width and height cannot be negative."],
  ["unsafe-geometry", { "occurrences[0].bounds.x": 9007199254740992 }, [662], "Geometry integers must remain within the safe integer domain."],
  ["duplicate-key", { appendOccurrence: occurrences[0] }, [662], "The same page/key cannot identify two occurrences."],
  ["empty-key", { "occurrences[0].occurrenceKey": "" }, [662], "The empty occurrence key is reserved for page identity, not ordinary occurrences."],
  ["null", { "occurrences[0].label": null }, [662], "Optional label absence is omission rather than null."],
  ["unknown-field", { unexpected: true }, [660], "RenderData has exactly six declared top-level fields."],
  ["duplicate-page-order", { "pages[1].order": 2 }, [123,658], "Equal page order is invalid layout, not a valid tie resolved by page ID."],
  ["negative-page-order", { "pages[0].order": -1 }, [658], "Page order is a nonnegative safe integer."],
  ["cross-page-unsupported", { edge: { ...edge, targetOccurrence: pair("A-page","a") }, formatSupportsCrossPage: false }, [662,744], "A cross-page edge needs explicit selected-format support; necessary unsupported content refuses."],
  ["layout-unknown-field", { layout: { ...layout, viewport: {} } }, [658], "The Layout record contains version, pages and geometry only."]
]) add("render-contract", scenario, [...renderInput, artifact("literal-replacements", patch)], [artifact("boundary-effects", { accepted: false, geometryRounded: false })], refs, why, "refused");
for (const field of Object.keys(binding)) add("render-contract", `stale-${field}`, [...renderInput, artifact("literal-replacements", { [`binding.${field}`]: field === "themeId" ? "missing" : "0".repeat(64) })],
  [artifact("serialization-effects", { ...noCandidate, repaired: false })], [660,681],
  `The supplied ${field} does not match the independently computed context. Serialization refuses stale R and never repairs it.`, "render-stale");

add("render-digests", "empty-bags", [artifact("overrides", overrides), artifact("diStyles", diStyles)], [artifact("digests", { overridesDigest: binding.overridesDigest, diStylesDigest: binding.diStylesDigest })], [668,676,677,683],
  "Empty overrides and DI styles hash their distinct closed records; neither is omitted or replaced by an empty array.");
const tokens = [{name:"fill",value:"#ffffff"},{name:"stroke",value:"#000000"}];
const normalizedOverrides = { semantic: [{semanticId:"A",tokens},{semanticId:"Z",tokens}], occurrence: [{...pair("A-page","a"),tokens},{...pair("Z-page","a"),tokens}] };
const shuffledOverrides = { semantic: [{semanticId:"Z",tokens:[...tokens].reverse()},{semanticId:"A",tokens:[...tokens].reverse()}], occurrence: [{...pair("Z-page","a"),tokens:[...tokens].reverse()},{...pair("A-page","a"),tokens:[...tokens].reverse()}] };
const normalizedStyles = { native: normalizedOverrides.occurrence, bioc: [{...pair("Z-page","z"),tokens:[{name:"fill",value:"#eeeeff"}]}] };
const shuffledStyles = { native: shuffledOverrides.occurrence, bioc: normalizedStyles.bioc };
add("render-digests", "normalized-bags", [artifact("first", {overrides:normalizedOverrides,diStyles:normalizedStyles}),artifact("second",{overrides:shuffledOverrides,diStyles:shuffledStyles})],
  [artifact("normalized", {overrides:normalizedOverrides,diStyles:normalizedStyles}),artifact("digests", {overridesDigest:H("normalized-overrides",normalizedOverrides),diStylesDigest:H("normalized-styles",normalizedStyles),equalAcrossInputs:true})], [258,676,677,683,685],
  "Only the declared target/token bags are normalized. Both manually ordered inputs produce the same record; native and bioc arrays remain distinct.");
const changedMetrics = [{id:"neutral-metrics",sha256:B("metric-one-byte-change",metricsUtf8.replace('600','601'))}];
const changedMetricDigest = H("changed-metrics", changedMetrics);
add("render-digests", "metric-byte", [artifact("beforePins",metricPins),artifact("afterPins",changedMetrics)], [artifact("digests",{before:binding.metricsDigest,after:changedMetricDigest,viewRevision:H("metric-view",{...viewTuple,metricsDigest:changedMetricDigest}),semanticRevision}),artifact("old-render",{status:"refused",code:"render-stale"})], [678,681,685],
  "One injected metric byte changes its raw pin, metric tuple and view revision while the supplied semantic acceptance context stays unchanged.");
const renamedLayout = clone(layout); renamedLayout.pages[0].name = "Renamed sheet";
const renamedDigest = H("renamed-layout",renamedLayout);
add("render-digests", "page-name", [ref("before","layout"),artifact("after",renamedLayout)], [artifact("digests",{layoutDigest:renamedDigest,viewRevision:H("renamed-view",{...viewTuple,layoutDigest:renamedDigest})}),artifact("old-render",{status:"refused",code:"render-stale"})], [658,674,681,685],
  "The complete page name is part of Layout and R. Reusing the page ID does not preserve the old layout digest.");
const changedPayload = { pages, occurrences:clone(occurrences), coverage, diagnostics:[] }; changedPayload.occurrences[0].style[0].value="#eeeeee";
add("render-digests", "payload-change", [ref("render","render"),artifact("replacement-payload",changedPayload)], [artifact("digests",{payloadDigest:H("changed-payload",changedPayload),contextViewRevision:viewRevision}),artifact("old-binding",{status:"refused",code:"render-stale"})], [679,681,685],
  "Changing an occurrence payload changes payloadDigest even when the context tuple stays equal; a valid hash alone is not a claim of renderer equivalence.");
const dimDigest=H("theme-dim",{themeId:"dim",themes:[profile.themes[0],dim]});
add("render-digests", "theme-switch", [ref("profile","profile"),artifact("selection",{from:"plain",to:"dim"})], [artifact("digests",{semanticRevision,profileDigest,themeDigest:dimDigest,viewRevision:H("dim-view",{...viewTuple,themeId:"dim",themeDigest:dimDigest})})], [262,675,681,685],
  "Selecting the already injected fallback child preserves profile identity and semantic history; the fallback root precedes the selected theme in themeDigest.");
const oneOverride={semantic:[{semanticId:"Z",tokens:[{name:"fill",value:"#eeeeee"}]}],occurrence:[]};
const oneOverrideDigest=H("one-override",oneOverride);
add("render-digests", "override-change", [artifact("overrides",oneOverride)], [artifact("digests",{semanticRevision,profileDigest,overridesDigest:oneOverrideDigest,viewRevision:H("override-view",{...viewTuple,overridesDigest:oneOverrideDigest})})], [262,676,681,683,685],
  "A view override changes the override/view digests while retaining the exact acceptance-context identity and semantic revision.");
const changedProfile=clone(profile); changedProfile.themes[0].tokens[0].value="#dddddd";
const changedIdentity={...identity,sha256:H("changed-profile-package",changedProfile)};
add("render-digests", "profile-package", [ref("before-profile","profile"),artifact("after-profile",changedProfile)], [artifact("identity",changedIdentity),artifact("semanticRevision",H("changed-package-semantic",{tree,profileIdentity:changedIdentity,bindings:[]})),artifact("activation",{explicitMigrationRequired:true,newHistoryEpoch:true})], [262,603,672,685],
  "Editing a package theme changes the complete profile hash and therefore the semantic acceptance context, even though native tree bytes agree.");
for(const [scenario,subject,why] of [
  ["token-invalid",{semantic:[{semanticId:"Z",tokens:[{name:"unknown",value:"x"}]}],occurrence:[]},"An unregistered token has no signature and cannot be interpreted as an arbitrary style attribute."],
  ["duplicate-target",{semantic:[...oneOverride.semantic,...oneOverride.semantic],occurrence:[]},"Repeated override targets refuse instead of choosing a winner."],
  ["duplicate-token",{semantic:[{semanticId:"Z",tokens:[tokens[0],tokens[0]]}],occurrence:[]},"Token names must be unique even when duplicate values are equal."],
  ["unknown-target",{semantic:[{semanticId:"missing",tokens}],occurrence:[]},"Overrides cannot address absent semantic IDs."],
  ["null-bag",{semantic:null,occurrence:[]},"A normalized bag is an array and cannot be null."]
]) add("render-digests",scenario,[artifact("overrides",subject)],[artifact("boundary-effects",{accepted:false})],[683,691],why,scenario==="token-invalid"?"render-token-invalid":"refused");

// Closed result data and explicit timing contracts. Timing records are expectations,
// not measured event-loop or transaction evidence.
const pureOk={status:"ok",payload:{unsubscribed:true},diagnostics:[]};
const pureRefused={status:"refused",code:"canvas-disposed",diagnostics:[]};
add("result-unions","pure-ok",[artifact("operation","unsubscribe")],[artifact("result",pureOk)],[589,728],"Unsubscription wraps its closed literal payload and explicit diagnostics in PureResult.");
add("result-unions","pure-refused",[artifact("operation","unsubscribe"),artifact("state","disposed")],[artifact("result",pureRefused)],[595,728],"A disposed pure operation returns the same refusal union without a payload.","canvas-disposed");
for(const [scenario,operation,payload] of [["get-definitions","getDefinitions",envelope],["get-snapshot","getSnapshot",snapshot]]) {
  const r=report(operation,[],{sourceIdentity:identity,targetIdentity:identity,inputRevision:semanticRevision,outputRevision:semanticRevision});
  add("result-unions",scenario,[ref("committed-snapshot","snapshot")],[artifact("result",{status:"ok",operation,profileIdentity:identity,baseRevision:semanticRevision,revision:semanticRevision,report:r,payload}),reportArtifact(r)],[595,726,728],"A synchronous immutable getter wraps its payload in Result; baseRevision and revision both identify the same committed envelope.");
}
const unloaded=report("getDefinitions");
add("result-unions","not-loaded",[artifact("state","no-envelope")],[artifact("result",{status:"refused",operation:"getDefinitions",code:"document-not-loaded",diagnostics:[],report:unloaded}),reportArtifact(unloaded)],[726,728],"Before load, the getter refuses with no fabricated identity, baseRevision or output revision.","document-not-loaded");
for(const [scenario,code] of [["cancelled","operation-cancelled"],["disposed","canvas-disposed"],["operation-error","operation-error"]]) {
  const r=report("setDefinitions",[],{sourceIdentity:identity,inputRevision:semanticRevision});
  add("result-unions",scenario,[artifact("operation-context",{operation:"setDefinitions",failure:scenario}),ref("before","snapshot")],
    [artifact("result",{status:"refused",operation:"setDefinitions",profileIdentity:identity,baseRevision:semanticRevision,code,diagnostics:[],report:r}),reportArtifact(r),artifact("effects",{...noCandidate,promise:"fulfilled-refusal",successEvents:0})],[595,597,610,726],
    "The queued operation fulfills with a refusal after rollback. No committed revision, candidate, artifact or success event escapes.",code);
}
for(const [scenario,subject,why] of [
  ["failure-candidate",{...pureRefused,payload:envelope},"A refusal cannot expose a candidate through payload."],
  ["unknown-key",{...pureOk,extra:true},"PureResult success permits exactly status, payload and diagnostics."],
  ["bare-success",{disposed:true},"Disposal success also requires the PureResult wrapper."],
  ["getter-revision-mismatch",{operation:"getDefinitions",baseRevision:semanticRevision,revision:"0".repeat(64)},"Read-only Result baseRevision equals its committed revision."],
  ["null-identity",{status:"refused",operation:"getDefinitions",profileIdentity:null,code:"document-not-loaded",diagnostics:[],report:unloaded},"Unknown pre-load identity is omitted, never represented by null."],
  ["payload-extra",{operation:"setTheme",payload:{viewRevision,themeId:"plain"}},"setTheme has exactly the viewRevision payload at its public signature."]
]) add("result-unions",scenario,[artifact("candidate-result",subject)],[artifact("boundary-effects",{accepted:false})],[582,595,726,728],why,"refused");
const signatures={synchronous:{getDefinitions:"Result<DocumentEnvelope>",getSnapshot:"Result<Snapshot>",onChange:"PureResult<{subscriptionId}>",unsubscribe:"PureResult<{unsubscribed:true}>"},queued:{setDefinitions:"Result<{envelope,semanticRevision,viewRevision}>",applyCommands:"Result<{envelope,semanticRevision,viewRevision,transactionId,changed}>",activateBusinessProfile:"Result<{envelope,semanticRevision,viewRevision,historyEpoch}>",setTheme:"Result<{viewRevision}>",restoreSnapshot:"Result<{envelope,semanticRevision,viewRevision,historyEpoch}>",undo:"Result<Snapshot>",redo:"Result<Snapshot>",dispose:"PureResult<{disposed:true}>",prepareExport:"Result<PreparedArtifact>",exportPrepared:"Result<{format,bytes,digest,idMap,capability}>"},expectedFailureDelivery:"union",unexpectedException:"operation-error-after-rollback"};
add("result-unions","signature-contract",[artifact("boundary","public-method-return-contract")],[artifact("signatures",signatures)],[574,575,576,577,578,579,580,581,582,583,584,585,586,587,588,589,590,591,592,593,595,728],"The signature record distinguishes synchronous getters and subscriptions from queued promise operations. It is an expected type/timing contract, not an executed API probe.");
const prepared={format:"neutral-ir",profileIdentity:identity,semanticRevision,viewRevision,ir:[{kind:"page",id:"page_1",name:"First sheet"}],renderBinding:binding,report:report("prepareExport"),capability:"structural",idMap:[]};
add("result-unions","prepared-artifact",[artifact("supplied-ir",prepared.ir),ref("render","render")],[artifact("prepared",prepared)],[728,744],"An authored prepared artifact carries exact identity, render binding, IR, report, capability and idMap. It carries no live serializer handle or terminal byte qualification.");

// Report expectations: all permutations and coordinates are literal derivations.
const reportRefs=[730,733,734,735,736,737,738,739,742,746];
function reportCase(scenario,input,output,why,refs=[],code=null,extraArtifacts=[]) {
  add("reports",scenario,[artifact("report-input",input)],[reportArtifact(output),...extraArtifacts],[...reportRefs,...refs],why,code);
}
const stages=["load","import","complete","pre-normalize","normalize","post-normalize","layout","post-layout","release","render","export"];
const stageEntries=stages.map(stage=>entry({stage}));
reportCase("all-stages",{entries:[...stageEntries].reverse()},report("validate",stageEntries),
  "The eleven report stages follow their explicit order, including C/N stages that are not lint phases.");
const sortBase=entry({stage:"import",ruleId:"a",source:coordinate("/a","A","artifact"),code:"a"});
const ordered=[
  sortBase,
  {...sortBase,afterPresent:true,after:null},
  {...sortBase,beforePresent:true,before:null},
  {...sortBase,beforePresent:true,before:0},
  {...sortBase,occurrenceKey:"a"},
  {...sortBase,pageId:"a"},
  {...sortBase,code:"b"},
  {...sortBase,source:coordinate("/a","B","artifact")},
  {...sortBase,source:coordinate("/b","A","artifact")},
  {...sortBase,source:coordinate("/a","A","profile")},
  {...sortBase,source:coordinate("/a","A","tree")},
  {...sortBase,ruleId:"\u{10000}"},
  {...sortBase,ruleId:"\ue000"}
];
// Canonical "0" precedes canonical "null". Swap only these authored neighbors.
[ordered[2],ordered[3]]=[ordered[3],ordered[2]];
reportCase("total-order",{entries:[...ordered].reverse()},report("validate",ordered),
  "The permutation exercises every named ordering component. Missing optional fields precede present fields; canonical numeric 0 sorts before null and UTF-16 supplementary rule IDs precede U+E000.");
reportCase("exact-duplicate",{entries:[stageEntries[0],stageEntries[0],stageEntries[1]]},report("validate",[stageEntries[0],stageEntries[1]]),
  "Exact duplicate entries coalesce; the same finding in a different stage remains independently visible.",[511]);
const nullEntry=entry({stage:"import",source:coordinate("/foreign","D"),beforePresent:true,before:null,afterPresent:false,disposition:"dropped"});
const missingEntry=entry({stage:"complete",source:coordinate("/name","D"),result:coordinate("/name","D"),beforePresent:false,afterPresent:true,after:""});
reportCase("presence-null",{source:{foreign:null},result:{name:""}},report("complete",[nullEntry,missingEntry]),
  "Present null is retained as a real source value while an absent name omits before. Empty string after remains a present value.");
const escaped=entry({stage:"post-normalize",source:coordinate("/rootElements/0/flowElements/0/a~1b/~0key/0","Z")});
reportCase("escaped-pointer",{index:{Z:"/rootElements/0/flowElements/0"},finding:{id:"Z",path:["a/b","~key",0]}},report("validate",[escaped]),
  "Each source path segment escapes tilde before slash and integer zero is an index, not a locale-dependent number.",[501]);
const longId="Node_"+"n".repeat(300);
const longPointer="/rootElements/0"+"/flowElements/0".repeat(17)+"/documentation/0/text";
const longEntry=entry({stage:"import",source:coordinate(longPointer,longId),beforePresent:true,before:"Original",afterPresent:false,disposition:"dropped"});
reportCase("long-deep-pointer",{originalIndex:{[longId]:longPointer.slice(0,-"/documentation/0/text".length)},idlessRelativePointer:"/documentation/0/text",sourceValue:"Original",nestedContainers:17},report("import",[longEntry]),
  "The original index and ID-less child path remain exact beyond sixteen containers and 256 characters. No truncation or invented short pointer is allowed.",[757]);
const idless=entry({stage:"import",source:coordinate("/rootElements/0/documentation/0/text","P"),beforePresent:true,before:"Evidence",afterPresent:false,disposition:"dropped"});
reportCase("idless-child",{original:{id:"P",documentation:[{$type:"bpmn:Documentation",text:"Evidence"}]}},report("import",[idless]),
  "ID-less Documentation uses the nearest original ID-bearing ancestor together with its precise original child pointer.",[501,757]);
const deleted=entry({stage:"import",source:coordinate("/rootElements/0/flowElements/0","Removed"),beforePresent:true,before:{$type:"foreign:Node",id:"Removed"},afterPresent:false,disposition:"dropped"});
const retained=entry({stage:"import",source:coordinate("/rootElements/0/flowElements/2/name","Kept"),result:coordinate("/rootElements/0/flowElements/1/name","Kept"),beforePresent:true,before:"Old",afterPresent:true,after:"New",disposition:"corrected"});
reportCase("deletion-source-stable",{beforeIds:["Removed","Middle","Kept"],afterIds:["Middle","Kept"],oldName:"Old",newName:"New"},report("import",[deleted,retained]),
  "Removing original index zero leaves the survivor source at original index two. Its result pointer addresses final index one.",[757]);
const generated=entry({stage:"normalize",ruleId:"fixture-port",source:unavailable,result:coordinate("/rootElements/0/flowElements/0/ioSpecification/dataInputs/0","Port_new","tree","generated"),afterPresent:true,after:{$type:"bpmn:DataInput",id:"Port_new"},disposition:"corrected"});
reportCase("generated-port",{sourcePortPresent:false,finalOwnerPointer:"/rootElements/0/flowElements/0",allocatedPortId:"Port_new"},report("normalize",[generated]),
  "A generated port has no original value and records generated result provenance. The ID and admitted native shape are supplied by the allocator/storage seam, not reallocated here.",[755,757]);
const reversed=entry({stage:"normalize",source:coordinate("/rootElements/0/artifacts/0/sourceRef","Link"),result:coordinate("/rootElements/0/artifacts/0/sourceRef","Link"),beforePresent:true,before:"Z",afterPresent:true,after:"A",disposition:"corrected"});
const reversedTarget={...reversed,source:coordinate("/rootElements/0/artifacts/0/targetRef","Link"),result:coordinate("/rootElements/0/artifacts/0/targetRef","Link"),before:"A",after:"Z"};
reportCase("direction-reversal",{before:{sourceRef:"Z",targetRef:"A"},after:{sourceRef:"A",targetRef:"Z"}},report("normalize",[reversed,reversedTarget]),
  "Each changed endpoint keeps its exact original and final coordinate with the before/after values from those immutable records.",[755,757]);
const coarse=entry({stage:"export",code:"export-loss/appearance",messageKey:"export.loss.appearance",severity:"warn",classification:"loss",lossClass:"appearance",disposition:"mapped",legacyCode:"shape-substitution"});
reportCase("coarse-legacy",{notice:{code:"shape-substitution",lossClass:"appearance"},manifest:{"shape-substitution":"appearance"},sourceIndexAvailable:false},report("exportPrepared",[coarse],{artifacts:[{format:"neutral-ir",capability:"structural",entryIndexes:[0]}]}),
  "A declared coarse notice retains its exact legacy code and loss class. Unavailable coordinates remain null rather than being inferred from prose.",[744,752,773]);
const unknownLegacy=entry({stage:"export",ruleId:"adapter",code:"legacy-unmapped",messageKey:"legacy.unmapped",severity:"error",classification:"integrity",disposition:"refused",legacyCode:"unlisted-code"});
reportCase("unknown-legacy",{legacyCode:"unlisted-code",message:"Task Z at /invented/path",manifest:{}},report("exportPrepared",[unknownLegacy],{artifacts:[{format:"neutral-ir",capability:"unsupported",entryIndexes:[0]}]}),
  "An unlisted code maps only to the closed legacy-unmapped fallback. Message text cannot create a source pointer or a target ID.",[744,774,776],"legacy-unmapped");
const maps=[
  {sourceId:"Z",resultId:"e_global",domain:"export"},
  {sourceId:"Z",resultId:"e_page",domain:"export",pageId:"A-page"},
  {sourceId:"Z",resultId:"e_1",domain:"export",pageId:"A-page",occurrenceKey:"a"},
  {sourceId:"Z",resultId:"e_2",domain:"export",pageId:"Z-page",occurrenceKey:"a"},
  {sourceId:"A",resultId:"A_new",domain:"migration"}
];
reportCase("repeated-idmap",{idMap:[...maps].reverse()},report("mapExport",[],{idMap:maps}),
  "idMap sorts by domain and UTF-16 page/key, independently of layout page order; repeated semantic source Z retains every distinct occurrence mapping.",[744,753]);
const lossA=entry({...coarse,pageId:"A-page",occurrenceKey:"a",emittedType:"node"});
const lossZ=entry({...coarse,pageId:"Z-page",occurrenceKey:"a",emittedType:"node"});
reportCase("artifact-indexes",{entries:[lossZ,lossA],artifactToOccurrences:{"A-page":["a"],"Z-page":["a"]}},report("mapExport",[lossA,lossZ],{artifacts:[{format:"neutral-ir",pageId:"A-page",capability:"structural",entryIndexes:[0]},{format:"neutral-ir",pageId:"Z-page",capability:"structural",entryIndexes:[1]}]}),
  "Artifact entryIndexes address final sorted entries; every loss remains reachable after the input entry order is reversed.",[744,767]);
const raw=[{id:"Z",message:"second",category:"error",path:["name"]},{id:"A",message:"first",category:"warning",path:[]}];
reportCase("raw-preserved",{rawStandardFindings:raw},report("validate",[],{rawStandardFindings:raw}),
  "The raw transport record is retained byte-for-JSON-value in original order and category. This preservation seam performs no semantic lint evaluation.",[499,511,754]);
for(const [scenario,subject,why] of [
  ["unknown-field",{...report("validate"),extra:true},"Unknown report-level fields are excluded by the exact Report/2 record."],
  ["phase-field",entry({phase:"import"}),"A report entry has stage only; a parallel phase is forbidden."],
  ["loss-class-required",entry({classification:"loss"}),"Every loss entry carries a declared lossClass independently of code spelling."],
  ["nonloss-class",entry({lossClass:"appearance"}),"Nonloss entries omit lossClass instead of reusing it as an advisory tag."],
  ["null-message",entry({messageKey:null}),"Null is admitted only in coordinate pointer/targetId and actual before/after values."],
  ["false-presence-with-value",entry({beforePresent:false,before:null}),"A false presence flag means the source field is missing and the before value is omitted."],
  ["true-presence-without-value",entry({afterPresent:true}),"A true presence flag requires the actual final value, including genuine null when that is the value."],
  ["unknown-stage",entry({stage:"draft"}),"Draft is a readiness policy and is not one of the eleven report stages."],
  ["coordinate-domain",entry({source:coordinate("/rules/0","rule","model")}),"Only tree, profile, artifact and none are coordinate domains."]
]) add("reports",scenario,[artifact("candidate-report",subject)],[artifact("boundary-effects",{accepted:false})],reportRefs,why,"refused");
reportCase("profile-coordinate",{profileRuleIndex:0},report("compileProfile",[entry({source:coordinate("/rules/0","task-named","profile")})]),
  "A profile configuration coordinate uses the profile domain and never masquerades as a tree pointer.");
for(const [scenario,path,pointer] of [["pointer-string","name","/rootElements/0/flowElements/0/name"],["pointer-self",[],"/rootElements/0/flowElements/0"],["pointer-invalid",[-1],null]]) {
  const source={domain:"tree",pointer,targetId:"Z",provenance:pointer===null?"unavailable":"exact"};
  reportCase(scenario,{index:{Z:"/rootElements/0/flowElements/0"},finding:{id:"Z",path}},report("validate",[entry({source})]),
    "String properties and empty path arrays retain exact original coordinates; unsupported negative index segments yield explicitly unavailable provenance.",[501]);
}

// Twenty tables are assembled from the two neutral profiles' explicit complete
// settings. No generated lint-policy-r3.json output is used as an oracle.
const upstream=read("bpmnlint-11.15.0-recommended.json",vendor);
const lintStages=["import","pre-normalize","post-normalize","post-layout","release"];
const ruleIndex={import:1,"pre-normalize":2,"post-normalize":0,"post-layout":3,release:4};
for(const file of ["neutral-profile.json","neutral-grid-profile.json"]) {
  const p=read(file,vendor), digest=H(`policy-profile-${file}`,p);
  for(const table of p.validation) {
    if(table.settings.length!==27 || !Object.keys(upstream.rules).every(name=>table.settings.some(s=>s.rule===name))) throw Error("Expected complete explicit neutral table");
    const settings=clone(table.settings).sort((a,b)=>a.rule<b.rule?-1:a.rule>b.rule?1:0);
    const selected=clone(p.rules[ruleIndex[table.id]]);
    if(selected.phase!==table.id) throw Error("Neutral rule fixture changed");
    const compiledOptions={mechanismVersion:"1",profileDigest:digest,phase:table.id,readinessPolicy:table.policy,compiledRules:[selected],bindings:[],
      severityPolicyDigest:H(`policy-${p.profile}-${table.id}-${table.policy}`,{phase:table.id,readinessPolicy:table.policy,settings})};
    const standard=Object.fromEntries(settings.filter(s=>!s.rule.startsWith("profile:")).map(s=>[s.rule,[s.severity,{}]]));
    const tableKey=`${p.profile}/${table.id}/${table.policy}`;
    add("lint-contract",`table-${p.profile.replaceAll("/","-")}-${table.id}-${table.policy}`,
      [{role:"profile-source",fixture:`../profile-parity-corpus/profile-mechanism/1/${file}`},artifact("table-selector",{phase:table.id,readinessPolicy:table.policy})],
      [artifact("compiled-policy",{settings,standard,compiledOptions,transport:["error",compiledOptions],subruleSeverity:table.policy==="draft"?"warn":"error"})],
      [455,459,472,476,478,479,480,482],
      "All twenty-seven settings are explicit neutral source data, replacing inherited settings as wholes. The selected single subrule is taken in declaration order and the complete effective settings array is hashed by UTF-16 rule name.",null,
      {scenario:"policy-table",tableKey});
  }
}
function lintCase(scenario,input,output,why,refs=[],code=null) {
  add("lint-contract",scenario,[artifact("lint-input",input)],[artifact("adapter-contract",output)],[459,472,476,...refs],why,code);
}
for(const [numeric,effective,transport] of [[0,"off","off"],[1,"warn","warn"],[2,"error","error"],[3,"info","warn"]]) lintCase(`numeric-${numeric}`,{rule:"label-required",severity:numeric},
  {effectiveSeverity:effective,transportSeverity:transport,evaluated:numeric!==0},
  "Numeric severity resolves through the fixed 0/1/2/3 table. Effective info uses warn transport and is restored by the adapter.",[478]);
const infoRaw=[{id:"Z",message:"Label absent",category:"warning",path:["name"]}];
const infoEntry=entry({stage:"post-normalize",ruleId:"label-required",code:"bpmnlint/label-required",messageKey:"bpmnlint.label-required",severity:"info",classification:"readiness",source:coordinate("/rootElements/0/flowElements/0/name","Z")});
add("lint-contract","info-restoration",[artifact("rawStandardFindings",infoRaw),artifact("effective-policy",{rule:"label-required",severity:"info",classification:"readiness"})],
  [reportArtifact(report("validate",[infoEntry],{rawStandardFindings:infoRaw})),artifact("summary",{ok:true,counts:{info:1,warn:0,error:0}})],[478,501,505,511,513,742],
  "Restore effective info from warn transport without changing raw findings. Counts are over unresolved unified entries, not transport categories.");
const warning=entry({stage:"post-normalize",ruleId:"task-named",code:"task-name-missing",messageKey:"invalid",severity:"warn",classification:"readiness",source:coordinate("/rootElements/0/flowElements/0/name","Z")});
add("lint-contract","profile-warning",[artifact("transport",{rule:"profile-mechanism/profile",category:"error",profileRuleId:"task-named",code:"task-name-missing",messageKey:"invalid",sourcePointer:"/rootElements/0/flowElements/0/name",id:"Z"}),artifact("effective-policy",{severity:"warn",classification:"readiness"})],
  [reportArtifact(report("validate",[warning])),artifact("summary",{ok:true,counts:{info:0,warn:1,error:0}})],[479,480,499,506,513],
  "The profile rule always travels through error, then restores the selected subrule warning without making the operation fail.");
for(const [scenario,kind,behavior,code] of [["rule-missing","rule","undefined","lint-rule-unknown"],["rule-thrown","rule","specific-lookup-exception","lint-rule-unknown"],["config-missing","config","undefined","lint-config-unknown"],["config-thrown","config","specific-lookup-exception","lint-config-unknown"]]) {
  const e=entry({stage:"post-normalize",ruleId:"adapter",code,messageKey:code,severity:"error",classification:"integrity",disposition:"refused"});
  add("lint-contract",scenario,[artifact("resolver-outcome",{kind,behavior,name:"missing"})],
    [reportArtifact(report("validate",[e])),artifact("effects",{factoryInvoked:false,...noCandidate})],[451,507,742],
    "Undefined and the specific upstream unknown-lookup exception map to the same stable integrity refusal; no missing factory is invoked.",code);
}
lintCase("allowlist",{extends:["plugin:unregistered/default"],registeredPackages:[]},{moduleLoaded:false,...noCandidate},"A syntactically plausible plugin name does not authorize module loading outside the pinned allowlist.",[451,455],"refused");
lintCase("cycle",{configs:{"plugin:neutral/a":["plugin:neutral/b"],"plugin:neutral/b":["plugin:neutral/a"]},start:"plugin:neutral/a"},{upstreamInvoked:false,...noCandidate},"The active recursion stack closes the A to B to A cycle before upstream execution.",[455,508],"lint-config-cycle");
lintCase("options-replacement",{hostLayers:[{rule:"global",severity:"warn",options:{a:1,b:2}},{rule:"global",severity:"error",options:{b:3}}],local:{rule:"global",severity:"warn",classification:"integrity"}},
  {afterInherited:{rule:"global",severity:"error",options:{b:3}},afterLocal:{rule:"global",severity:"warn",classification:"integrity",options:{}}},
  "Later inherited whole settings replace earlier options; the local profile severity record then resets options to empty rather than deep-merging.",[455]);
lintCase("off-stage",{stage:"import",settings:[{rule:"profile:task-named",severity:"error",classification:"readiness"}],declaredRulePhase:"post-normalize"},{accepted:false},"Off-stage subrules are rejected rather than retained as dead configuration.",[472],"refused");
lintCase("compiled-tampering",{selectedRule:{id:"task-named",assert:{op:"true"}},callerRule:{id:"task-named",assert:{op:"false"}}},{accepted:false,callerAstExecuted:false},"A caller cannot replace the selected compiled AST even when the alternative has valid syntax.",[482],"refused");
lintCase("draft-integrity",{policy:"draft",finding:{classification:"integrity",severity:"error",code:"reference-dangling"}},{severity:"error",ok:false,...noCandidate},"Draft readiness does not downgrade integrity errors or commit a candidate with dangling references.",[472,513],"reference-dangling");
lintCase("release-barrier",{operation:"prepareExport",policy:"accept",postNormalizeErrors:0,releaseErrors:1},
  {stages:["complete","pre-normalize","normalize","post-normalize","layout","post-layout","release"],renderReached:false,mapReached:false,...noCandidate},
  "prepareExport performs release once under accept and stops before R/map when an unresolved release error remains.",[469,513],"refused");
lintCase("off-subrule",{stage:"post-normalize",rule:"task-named",severity:"off"},{compiledRules:[],subruleEvaluated:false},"Off removes a current-stage subrule before evaluation; a transport error category cannot revive it.",[472,479,480]);
lintCase("malformed-custom",{profileRuleId:"task-named",code:"task-name-missing",sourcePointer:"/rootElements/0"},{code:"lint-rule-error",classification:"integrity",severity:"error"},"A custom finding without the required messageKey is malformed metadata, never a passing business assertion.",[499,509],"lint-rule-error");
lintCase("unresolved-id",{id:"missing",path:["name"],originalIndex:{}},{source:{domain:"tree",pointer:null,targetId:"missing",provenance:"unavailable"}},"An unresolved reported ID retains its ID but has no fabricated root pointer; provenance is explicitly unavailable.",[501]);
lintCase("missing-policy",{stage:"post-normalize"},{accepted:false},"A standalone lint phase requires an explicit draft or accept policy and cannot assume acceptance.",[467],"refused");
lintCase("missing-setting",{stage:"post-normalize",policy:"draft",rules:["task-named"],settings:[]},{accepted:false},"An enabled current-stage rule requires its setting in exactly the requested stage and policy table.",[472],"lint-config-incomplete");
lintCase("compiled-unknown-field",{mechanismVersion:"1",profileDigest,phase:"post-normalize",readinessPolicy:"draft",compiledRules:[],bindings:[],severityPolicyDigest:"0".repeat(64),extra:true},{accepted:false},"The generated lint options record is closed to exactly seven keys.",[482],"refused");
lintCase("corrected-history",{entries:[{stage:"pre-normalize",severity:"error",disposition:"corrected"},{stage:"post-normalize",severity:"warn",disposition:"observed"}]},{ok:true,counts:{info:0,warn:1,error:0},historyEntriesRetained:2},"Corrected pre-normalize errors remain history but only unresolved final findings contribute blocking counts.",[511,513]);

const lossClasses=["semantic-type","relation-kind","navigation","appearance","layout","metadata","unsupported-feature","provenance-unavailable"];
for(const lossClass of lossClasses) {
  const loss=entry({stage:"export",ruleId:"neutral-export",code:`export-loss/${lossClass}`,messageKey:`export.loss.${lossClass}`,severity:"warn",classification:"loss",lossClass,disposition:"mapped",source:coordinate("/rootElements/0/flowElements/0","Z"),result:coordinate("/nodes/0","e_1","artifact"),pageId:"Z-page",occurrenceKey:"a",emittedType:"node"});
  add("export-losses",lossClass,[artifact("action",{action:"loss",target:"self",code:lossClass}),artifact("context",{source:loss.source,result:loss.result,pageId:"Z-page",occurrenceKey:"a",emittedType:"node"})],
    [reportArtifact(report("mapExport",[loss],{artifacts:[{format:"neutral-ir",pageId:"Z-page",capability:"structural",entryIndexes:[0]}]}))],[742,744,767],
    "The loss action code is a class enum. Its unified code, message key, warning severity, mapped disposition and artifact index follow the exact design mapping.");
}
add("export-losses","worst-capability",[artifact("qualified-outcomes",["engine-byte-compatible","structural","engine-byte-compatible"])],[artifact("capability","structural")],[744,765,767],"A supplied qualified occurrence set aggregates to its worst member. This fixture does not qualify any serializer bytes.");
add("export-losses","unsupported-necessary",[artifact("qualified-outcomes",[{necessary:true,capability:"engine-byte-compatible"},{necessary:true,capability:"unsupported"}])],
  [artifact("artifact",{format:"neutral-ir",capability:"unsupported",entryIndexes:[]}),artifact("effects",{...noCandidate,downloadProduced:false})],[744,767],"One unsupported necessary occurrence refuses the whole artifact. Digest and downloadable partial output are absent.","refused");
for(const [scenario,legacyCode,code,messageKey,line] of [["legacy-format","unknown-format","export-format-unsupported","export.format-unsupported",771],["legacy-format-alias","unsupported-format","export-format-unsupported","export.format-unsupported",771],["legacy-reference","invalid-reference","reference-dangling","reference-dangling",772],["legacy-endpoint","missing-endpoint","reference-dangling","reference-dangling",772],["legacy-id","duplicate-id","id-collision","id-collision",772]]) {
  const entries=["A","Z"].map(id=>entry({stage:"export",ruleId:"adapter",code,messageKey,severity:"error",classification:"integrity",disposition:"refused",legacyCode,source:coordinate(null,id,"tree","unavailable")}));
  add("export-losses",scenario,[artifact("legacy-error",{code:legacyCode,ids:["Z","A"],message:"No source index supplied"})],
    [reportArtifact(report("exportPrepared",entries,{artifacts:[{format:"neutral-ir",capability:"unsupported",entryIndexes:[0,1]}]}))],[742,744,751,line],
    "The finite mapping retains the exact legacy code and emits one integrity refusal per ID. IDs sort canonically; no original index means unavailable pointers.",code);
}
add("export-losses","unknown-class",[artifact("action",{action:"loss",target:"self",code:"unlisted"})],[artifact("effects",{accepted:false})],[767],"An unknown loss class is outside the closed enum and refuses before mapping.","refused");

for(const [operation,payload,line] of [
  ["setDefinitions",{envelope,semanticRevision,viewRevision},576],
  ["applyCommands",{envelope,semanticRevision,viewRevision,transactionId:"tx-fixture",changed:false},579],
  ["activateBusinessProfile",{envelope,semanticRevision,viewRevision,historyEpoch:"epoch-fixture"},581],
  ["setTheme",{viewRevision},582],
  ["restoreSnapshot",{envelope,semanticRevision,viewRevision,historyEpoch:"epoch-fixture"},585],
  ["undo",snapshot,586],["redo",snapshot,587]
]) {
  const r=report(operation,[],{sourceIdentity:identity,targetIdentity:identity,inputRevision:semanticRevision,outputRevision:semanticRevision});
  add("result-unions",`payload-${operation}`,[artifact("supplied-committed-payload",payload)],
    [artifact("result",{status:"ok",operation,profileIdentity:identity,baseRevision:semanticRevision,revision:semanticRevision,report:r,payload})],
    [line,595,726,728],"The public method returns precisely its signature payload inside the document Result. Transaction and history tokens are supplied session-local fixture values, not parity-qualified allocators.");
}
add("result-unions","dispose-ok",[artifact("operation","dispose")],[artifact("result",{status:"ok",payload:{disposed:true},diagnostics:[]}),artifact("delivery","fulfilled-promise")],[590,595,728],"Disposal is queued but returns PureResult with exactly the disposed payload and explicit diagnostics.");
const cascadingIds=["Input_removed","Association_removed","Shell_removed"];
const cascadingPointers=["/rootElements/0/ioSpecification/dataInputs/0","/rootElements/0/flowElements/0/dataInputAssociations/0","/rootElements/0/flowElements/0/ioSpecification/inputSets/0"];
const cascadingEntries=[1,2,0].map(i=>entry({stage:"import",source:coordinate(cascadingPointers[i],cascadingIds[i]),beforePresent:true,before:{id:cascadingIds[i]},afterPresent:false,disposition:"dropped"}));
reportCase("cascading-removal",{removedOriginalRecords:cascadingIds.map((id,i)=>({id,pointer:cascadingPointers[i]})),finalRecords:[]},report("import",cascadingEntries),
  "The supplied projection plan removes the port, dependent association and empty shell. Each lossless coordinate record uses its original pointer after the cascade; this is not an execution of projection.",[757]);
add("reports","resource-limit",[artifact("resource-contract",{maximumEntries:2,suppliedEntries:3})],[artifact("effects",{...noCandidate,pointersTruncated:false})],[746],"An explicit whole-input resource bound refuses with resource-limit rather than truncating individual coordinates.","resource-limit");
const descriptorPins=[{id:"a-descriptor",version:"1",sha256:"1".repeat(64)},{id:"z-descriptor",version:"1",sha256:"2".repeat(64)}];
add("render-digests","descriptor-pin-order",[artifact("pins",[...descriptorPins].reverse())],[artifact("normalized-pins",descriptorPins),artifact("descriptorDigest",H("ordered-descriptor-pins",descriptorPins))],[673],"Descriptor digest hashes exact pin records sorted by unique ID; these are supplied verified pin facts, not claimed published packages.");
const resourcePins=[{id:"a-resource",sha256:B("a-resource","width=1\n")},{id:"z-resource",sha256:B("z-resource","width=2\n")}];
add("render-digests","metric-pin-order",[artifact("pins",[...resourcePins].reverse())],[artifact("normalized-pins",resourcePins),artifact("metricsDigest",H("ordered-metric-pins",resourcePins))],[678],"Metric records sort by unique resource ID after each exact UTF-8 byte sequence is hashed with its newline preserved.");
add("render-contract","signed-position",[artifact("bounds",{x:-100,y:-20,width:0,height:0})],[artifact("bounds",{x:-100,y:-20,width:0,height:0})],[662],"Signed integer positions and zero sizes remain exact; nonnegative size does not imply nonnegative position.");

// Seal assembly. Historical vector objects and historical citation policy stay intact.
save("step4-inputs.json",inputs);
save("step4-digests.json",{format:"profile-step4-digests/1",designSha256,calculations});
const policy={format:"profile-step4-provenance-policy/1",designSha256,vectors:vectors.map(v=>({caseId:v.caseId,family:v.family,required:v.provenance}))};
save("step4-provenance-policy.json",policy);
const evidence=read("design-provenance.json");
const allVectors=[...prior,...vectors];
const refs=new Set([...evidence.lines.map(l=>l.ref),...vectors.flatMap(v=>v.provenance)]);
for(const line of evidence.lines) if(line.text!==lines[Number(line.ref.split(":")[1])-1]) throw Error(`Prior excerpt differs: ${line.ref}`);
evidence.lines=[...refs].sort((a,b)=>Number(a.split(":")[1])-Number(b.split(":")[1])).map(ref=>{
  const text=lines[Number(ref.split(":")[1])-1];
  if(!text || /^\s*#|^~~~|^\|\s*---/.test(text)) throw Error(`Nondefining citation: ${ref}`);
  return {ref,text,sha256:sha(text)};
});
save("design-provenance.json",evidence);
save("expectations.json",{...old,vectors:allVectors});
const bytes=readFileSync(new URL("expectations.json",root));
save("expectations.seal.json",{...read("expectations.seal.json"),bytes:bytes.length,sha256:sha(bytes),independentExtension:"step-4 / gpt-6-astra / xhigh"});
const freeze=read("freeze.seal.json");
for(const name of ["step4-inputs.json","author-step4.mjs","step4-digests.json","step4-provenance-policy.json"]) if(!freeze.files.some(f=>f.path===name)) freeze.files.push({path:name});
for(const f of freeze.files){const data=readFileSync(new URL(f.path,root));f.bytes=data.length;f.sha256=sha(data);}
for(const f of freeze.documents){const data=readFileSync(new URL(`../../../${f.path}`,root));f.bytes=data.length;f.sha256=sha(data);}
save("freeze.seal.json",freeze);
console.log(JSON.stringify({added:vectors.length,total:allVectors.length,families:Object.fromEntries([...new Set(vectors.map(v=>v.family))].map(f=>[f,vectors.filter(v=>v.family===f).length])),
  provenancePin:sha(JSON.stringify(evidence)),policyPin:sha(JSON.stringify(policy)),digestCalculations:calculations.length},null,2));
