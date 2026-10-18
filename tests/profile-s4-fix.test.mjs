import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shared, vectors, expected } from "./helpers/profile-step4.mjs";
import { ProfileContractError } from "../dist/profile/canonical.js";
import { validateResult, validatePreparedArtifact, documentRead, queueBoundary } from "../dist/profile/results.js";
import { validateRenderData, validateLayout, sortOccurrences, pinDigest, archiveDi, validateSnapshot } from "../dist/profile/presentation-contracts.js";
import { buildReport, entry, validateEntry, validateReport, sourceCoordinate, compareEntries } from "../dist/profile/report.js";
import { compileLintPolicy, lintOperationStages } from "../dist/profile/lint-contracts.js";
import { compileSchema } from "../dist/profile/contracts.js";

const copy = structuredClone;
const prepared = () => expected(vectors.find(v => v.scenario === "prepared-artifact"), "prepared");
const result = (operation, payload, revision = shared.envelope.semanticRevision) => ({ status: "ok", operation,
  profileIdentity: copy(shared.envelope.profileIdentity), baseRevision: revision, revision,
  report: buildReport(operation), payload: copy(payload) });
const ctx = () => ({ profile: shared.profile, envelope: shared.envelope, layout: shared.layout, themeId: "plain",
  metricPins: shared.metricPins, overrides: shared.overrides, diStyles: shared.diStyles,
  validateEnvelope: async e => copy(e), validateDi: () => true });
const contract = error => error instanceof ProfileContractError;
const rejects = run => assert.throws(run, contract);

test("MAJOR-1 should accept preparation that advances the detached copy revision", () => {
  const p = prepared(), r = result("prepareExport", p);
  r.baseRevision = "0".repeat(64);
  r.report = buildReport("prepareExport", { inputRevision: r.baseRevision, outputRevision: r.revision });
  assert.deepEqual(validateResult(r), r);
  rejects(() => validateResult({ ...r, revision: "1".repeat(64) }));
});

for (const [name, mutate] of [
  ["null page", r => { r.pages = [null]; r.occurrences = []; r.coverage = []; }],
  ["page order", r => r.pages.reverse()],
  ["occurrence order", r => r.occurrences.reverse()],
  ["duplicate occurrence", r => r.occurrences.splice(1, 0, copy(r.occurrences[0]))],
  ["duplicate coverage", r => r.coverage.push(copy(r.coverage[0]))],
  ["unknown coverage reference", r => { r.coverage[0].occurrences = [{pageId:"missing",occurrenceKey:"missing"}]; }],
  ["coverage disposition", r => { r.coverage.find(c => c.occurrences.length).disposition = "nonvisual"; }],
  ["coverage semantic mismatch", r => { r.coverage.find(c => c.occurrences.length).semanticId = "missing"; }],
]) test(`MAJOR-2a should refuse theme resolution with ${name}`, () => {
  const r = copy(shared.render); mutate(r); rejects(() => validateResult(result("resolveTheme", r)));
});
test("MAJOR-2a should accept the complete supplied theme resolution", () => {
  const r = result("resolveTheme", shared.render); assert.deepEqual(validateResult(r), r);
});
const placement = () => ({elementId:"Z",ownerProcessId:"Process_1",regionKey:"bottom",relatedAssociationIds:["a","z"]});
for (const [name, mutate] of [
  ["null", p => { p.placements = [null]; }],
  ["unknown field", p => { p.placements[0].extra = true; }],
  ["missing owner", p => { delete p.placements[0].ownerProcessId; }],
  ["empty ID", p => { p.placements[0].elementId = ""; }],
  ["unsorted related IDs", p => p.placements[0].relatedAssociationIds.reverse()],
  ["duplicate related IDs", p => { p.placements[0].relatedAssociationIds = ["a","a"]; }],
  ["unsorted placements", p => { p.placements.push({...placement(),elementId:"A"}); }],
  ["revision mismatch", p => { p.envelope.semanticRevision = "0".repeat(64); }],
  ["identity mismatch", p => { p.envelope.profileIdentity.version = "2.0.0"; }],
]) test(`MAJOR-2b should refuse normalization with ${name}`, () => {
  const p = {envelope:copy(shared.envelope),placements:[placement()],report:buildReport("normalize")};
  mutate(p); rejects(() => validateResult(result("normalize", p)));
});
test("MAJOR-2b should accept semantic placement constraints without bounds", () => {
  const r = result("normalize", {envelope:shared.envelope,placements:[placement()],report:buildReport("normalize")});
  assert.deepEqual(validateResult(r), r);
});
for (const operation of ["serializePrepared", "exportPrepared"]) {
  const bytesResult = () => ({...result(operation, {}),payload:{format:"neutral-ir",bytes:new Uint8Array([1]),digest:"0".repeat(64),idMap:[],capability:"structural"}});
  test(`MAJOR-2c should refuse ${operation} with an unsorted ID map`, () => {
    const r = bytesResult(); r.payload.idMap = ["z","a"].map(id => ({sourceId:id,resultId:id,domain:"export"})); rejects(() => validateResult(r));
  });
  test(`MAJOR-2c should refuse unsupported successful ${operation} bytes`, () => {
    const r = bytesResult(); r.payload.capability = "unsupported"; rejects(() => validateResult(r));
  });
  test(`MAJOR-2c should preserve supported in-process ${operation} bytes`, () => {
    const r = bytesResult(), validated = validateResult(r); assert.deepEqual(validated,r); assert.notEqual(validated.payload.bytes,r.payload.bytes);
  });
}
for (const [name, mutate] of [
  ["null archive", s => s.presentation.importedDi.diagrams.push(null)],
  ["unsorted overrides", s => s.presentation.overrides.semantic = [{semanticId:"Z",tokens:[{name:"stroke",value:"#000000"},{name:"fill",value:"#ffffff"}]}]],
  ["unsorted styles", s => s.presentation.diStyles.native = [{pageId:s.presentation.layout.geometry[0].pageId,occurrenceKey:s.presentation.layout.geometry[0].occurrenceKey,tokens:[{name:"stroke",value:"#000000"},{name:"fill",value:"#ffffff"}]}]],
]) {
  test(`MAJOR-2d should refuse ${name} in snapshot result shape`, () => {
    const s = copy(shared.snapshot); mutate(s); rejects(() => validateResult(result("getSnapshot",s)));
  });
  test(`MAJOR-2d should refuse ${name} during snapshot integrity validation`, async () => {
    const s = copy(shared.snapshot); mutate(s); await assert.rejects(() => validateSnapshot(s,ctx()), {code:"snapshot-schema"});
  });
}
test("MAJOR-3 should retain exact coordinates for omitted element paths", () => {
  assert.deepEqual(sourceCoordinate({Z:"/rootElements/0"},{id:"Z"}),{domain:"tree",pointer:"/rootElements/0",targetId:"Z",provenance:"exact"});
});
for (const path of [[], "", undefined]) test(`MAJOR-3 should not fall through an invalid supplied relative pointer with ${JSON.stringify(path)}`, () => {
  const finding = path === undefined ? {id:"Z"} : {id:"Z",path};
  assert.equal(sourceCoordinate({Z:"/rootElements/0"},finding,"bad~2").provenance,"unavailable");
});
test("MAJOR-3 should refuse an empty property path but preserve an empty segment array", () => {
  assert.equal(sourceCoordinate({Z:"/rootElements/0"},{id:"Z",path:""}).provenance,"unavailable");
  assert.equal(sourceCoordinate({Z:"/rootElements/0"},{id:"Z",path:[]}).pointer,"/rootElements/0");
});
for (const kind of ["layout","render"]) {
  test(`MAJOR-4 should give a typed refusal for a null ${kind} element`, async () => {
    const v = copy(kind === "layout" ? shared.layout : shared.render); v[kind === "layout" ? "geometry" : "occurrences"] = [null];
    await assert.rejects(async () => kind === "layout" ? validateLayout(v) : validateRenderData(v,ctx()),contract);
  });
  test(`MAJOR-4 should validate malformed ${kind} elements before ordering`, async () => {
    const v = copy(kind === "layout" ? shared.layout : shared.render), items = v[kind === "layout" ? "geometry" : "occurrences"]; items.reverse();
    if (kind === "render") items[0].style = [{name:"fill",value:"invalid"}]; else items[0].bounds.width = -1;
    await assert.rejects(async () => kind === "layout" ? validateLayout(v) : validateRenderData(v,ctx()), error => contract(error) && error.code === (kind === "render" ? "render-token-invalid" : undefined));
  });
}
for (const value of [null, 1, "x", {}, {pageId:"",occurrenceKey:"x"}, {pageId:"Z-page",occurrenceKey:""}])
  test(`MAJOR-4 should refuse malformed occurrence sort input ${JSON.stringify(value)}`, () => rejects(() => sortOccurrences([value],shared.layout.pages)));
test("MAJOR-4 should refuse a non-array pin list with a contract error", async () => {
  await assert.rejects(() => pinDigest({},false),contract);
});
test("MAJOR-4 should refuse null archived DI before calling the supplied validator", async () => {
  let calls = 0; await assert.rejects(() => archiveDi({descriptorDigest:shared.render.binding.descriptorDigest,diagrams:[null]},()=>{calls++;return true;}),contract); assert.equal(calls,0);
});

test("MINOR-1 should refuse noncanonical artifact entry indexes", () => {
  const r = buildReport("validate",{entries:[entry({code:"a"}),entry({code:"z"})],artifacts:[{format:"neutral-ir",capability:"structural",entryIndexes:[0,1]}]});
  r.artifacts[0].entryIndexes.reverse(); rejects(() => validateReport(r));
});
test("MINOR-1 should refuse empty optional entry strings", () => {
  rejects(() => validateEntry({...entry(),property:""}));
});
test("MINOR-1 should compare null and absent components symmetrically without settling string ties", () => {
  const a = entry(), b = copy(a); delete a.source.targetId;
  assert.equal(compareEntries(a,b),0); assert.equal(compareEntries(b,a),0);
});
for (const schemaName of ["report-2","render-data-1","result-1"]) {
  for (const [name, mutate] of [
    ["empty property", e => {e.property="";}],
    ["empty optional ID", e => {e.pageId="";}],
    ["bad pointer escape", e => {e.source={domain:"tree",pointer:"/bad~2",targetId:"Z",provenance:"exact"};}],
    ["empty coordinate target", e => {e.source.targetId="";}],
    ["unavailable pointer", e => {e.source={domain:"tree",pointer:"/x",targetId:null,provenance:"unavailable"};}],
    ["exact null pointer", e => {e.source={domain:"tree",pointer:null,targetId:"Z",provenance:"exact"};}],
    ["none target", e => {e.source.targetId="Z";}],
  ]) test(`MINOR-2 should refuse ${name} in ${schemaName} JSON syntax`, async () => {
    const schema = JSON.parse(readFileSync(new URL(`../schemas/profile/${schemaName}.schema.json`,import.meta.url)));
    const syntax = await compileSchema(schema), e = entry(); mutate(e);
    const report = buildReport("validate"); report.entries = [e];
    const value = schemaName === "report-2" ? report : schemaName === "render-data-1" ? {...copy(shared.render),diagnostics:[e]} : {...documentRead("getDefinitions",shared.snapshot),report:{...report,operation:"getDefinitions"}};
    assert.equal(syntax(value).valid,false);
  });
}
for (const operation of ["serializePrepared","exportPrepared"]) test(`MINOR-2 should exclude non-JSON ${operation} byte shapes from JSON syntax`, async () => {
  const schema = JSON.parse(readFileSync(new URL("../schemas/profile/result-1.schema.json",import.meta.url)));
  const syntax = await compileSchema(schema);
  assert.equal(syntax(result(operation,{format:"neutral-ir",bytes:{},digest:"0".repeat(64),idMap:[],capability:"structural"})).valid,false);
});
test("MINOR-3 should refuse a tampered prepared view revision", async () => {
  const p = prepared(); assert.deepEqual(await validatePreparedArtifact(p),p); p.viewRevision = "0".repeat(64);
  await assert.rejects(async () => validatePreparedArtifact(p),{code:"render-stale"});
});

test("MINOR-4 should refuse duplicate stage-policy tables", async () => {
  const p = copy(shared.profile); p.validation.push(copy(p.validation[0]));
  await assert.rejects(() => compileLintPolicy(p,{phase:"import",readinessPolicy:"draft"}),{code:"lint-config-incomplete"});
});
test("MINOR-4 should preserve optional lint bindings and refuse duplicate binding keys", async () => {
  const bindings = [{ownerId:"Process_1",role:"support",targetId:"Z"}], selector = {phase:"import",readinessPolicy:"draft"};
  const out = await compileLintPolicy(shared.profile,selector,{},[],bindings); assert.deepEqual(out.compiledOptions.bindings,bindings);
  await assert.rejects(() => compileLintPolicy(shared.profile,selector,{},[],[...bindings,...bindings]),contract);
});
for (const [operation,stages] of [
  ["import",["import"]],["pre-normalize",["pre-normalize"]],["post-normalize",["post-normalize"]],
  ["post-layout",["post-layout"]],["release",["release"]],
  ["draft",["complete","pre-normalize","normalize","post-normalize"]],
  ["accept",["complete","pre-normalize","normalize","post-normalize","release"]],
  ["prepareExport",["complete","pre-normalize","normalize","post-normalize","layout","post-layout","release"]],
]) test(`MINOR-4 should map the ${operation} stage request`,()=>assert.deepEqual(lintOperationStages(operation),stages));

test("MINOR-3 should gate queued bytes on prepared freshness before writer admission", async () => {
  const p = prepared(); p.viewRevision = "0".repeat(64); let admitted = 0, rolledBack = 0;
  const r = await queueBoundary({operation:"exportPrepared",snapshot:shared.snapshot,rollback:()=>{rolledBack++;}},()=>p,()=>{admitted++;});
  assert.equal(r.status,"refused"); assert.equal(r.code,"render-stale"); assert.equal(admitted,0); assert.equal(rolledBack,1);
});
test("MINOR-3 should refuse stale queued preparation with rollback", async () => {
  const p = prepared(); p.viewRevision = "0".repeat(64); let rolledBack = 0;
  const r = await queueBoundary({operation:"prepareExport",snapshot:shared.snapshot,rollback:()=>{rolledBack++;}},()=>p,payload=>result("prepareExport",payload));
  assert.equal(r.status,"refused"); assert.equal(r.code,"render-stale"); assert.equal(rolledBack,1);
});
test("MAJOR-4 should allow nullable report coordinates inside otherwise non-null render data", async () => {
  const r = copy(shared.render); r.diagnostics = [entry()];
  assert.deepEqual(validateResult(result("resolveTheme",r)).payload,r);
});
