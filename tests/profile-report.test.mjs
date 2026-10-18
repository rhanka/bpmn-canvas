import { test } from "node:test";
import assert from "node:assert/strict";
import { vectors, input, expected, refuses } from "./helpers/profile-step4.mjs";
import { canonicalize, rawDigest } from "../dist/profile/canonical.js";
import { buildReport, validateReport, validateEntry, serializeReport, sourceCoordinate, entry as diagnosticEntry, legacyEntries, lossEntry, worstCapability, artifactCapability } from "../dist/profile/report.js";
const entry = (extra={}) => diagnosticEntry({code:"fixture-note",ruleId:"fixture",messageKey:"fixture.note",...extra});

for(const v of vectors.filter(v=>v.family==="reports"||v.family==="export-losses")) test(`should enforce ${v.caseId}`,async()=>{
  const s=v.scenario;
  if(v.inputArtifacts.some(a=>a.role==="candidate-report")) {
    const c=input(v,"candidate-report"); return refuses(()=>c.reportVersion?validateReport(c):validateEntry(c),v);
  }
  if(s==="resource-limit") return refuses(()=>buildReport("validate",{entries:[entry(),entry(),entry()]},{maxEntries:input(v,"resource-contract").maximumEntries}),v);
  if(s==="worst-capability") return assert.equal(worstCapability(input(v,"qualified-outcomes")),expected(v,"capability"));
  if(s==="unsupported-necessary") return refuses(()=>artifactCapability(input(v,"qualified-outcomes")),v);
  if(s==="unknown-class") return refuses(()=>lossEntry(input(v,"action").code,{}),v);
  const golden=expected(v,"report"); let entries, options={};
  const i=v.inputArtifacts.some(a=>a.role==="report-input")?input(v,"report-input"):{};
  if(i.entries) entries=i.entries;
  else if(v.family==="export-losses"&&v.inputArtifacts.some(a=>a.role==="action")) { const c=input(v,"context"); entries=[lossEntry(input(v,"action").code,{ruleId:"neutral-export",...c})]; options.artifacts=golden.artifacts; }
  else if(v.inputArtifacts.some(a=>a.role==="legacy-error")) { const e=input(v,"legacy-error"); entries=legacyEntries(e); options.artifacts=[{format:"neutral-ir",capability:"unsupported",entryIndexes:entries.map((_,n)=>n)}]; }
  else if(s==="coarse-legacy"||s==="unknown-legacy") { entries=legacyEntries(s==="coarse-legacy"?i.notice:{code:i.legacyCode}, {lossManifest:i.manifest,ruleId:s==="coarse-legacy"?"fixture":"adapter"});options.artifacts=golden.artifacts; }
  else if(s==="escaped-pointer"||s.startsWith("pointer-")) entries=[entry({stage:s==="escaped-pointer"?"post-normalize":"load",source:sourceCoordinate(i.index,i.finding)})];
  else if(s==="long-deep-pointer") entries=[entry({stage:"import",source:sourceCoordinate(i.originalIndex,{id:Object.keys(i.originalIndex)[0],path:[]},i.idlessRelativePointer),beforePresent:true,before:i.sourceValue,disposition:"dropped"})];
  else if(s==="idless-child") entries=[entry({stage:"import",source:sourceCoordinate({[i.original.id]:"/rootElements/0"},{id:i.original.id,path:["documentation",0,"text"]}),beforePresent:true,before:i.original.documentation[0].text,disposition:"dropped"})];
  else if(s==="profile-coordinate") entries=[entry({source:{domain:"profile",pointer:`/rules/${i.profileRuleIndex}`,targetId:"task-named",provenance:"exact"}})];
  else if(s==="raw-preserved") options.rawStandardFindings=i.rawStandardFindings;
  else if(s==="repeated-idmap") options.idMap=i.idMap;
  else {
    // Authored diagnostic IR is supplied at this seam. Validate and serialize it;
    // this is not an execution of projection, normalization or an allocator.
    entries=golden.entries;
  }
  if(s==="artifact-indexes") options.artifacts=[{format:"neutral-ir",pageId:"A-page",capability:"structural",entryIndexes:[1]},{format:"neutral-ir",pageId:"Z-page",capability:"structural",entryIndexes:[0]}];
  const actual=buildReport(golden.operation,{...options,...(entries?{entries}:{})});
  assert.deepEqual(actual,golden);
  const bytes=serializeReport(actual), a=v.expectedArtifacts.find(a=>a.role==="report");
  assert.equal(new TextDecoder().decode(bytes),a.canonical);
  assert.equal(await rawDigest(bytes),a.sha256);
  assert.equal(canonicalize(validateReport(actual)),a.canonical);
});
test("should reject unreachable losses and remap artifact indexes after coalescing",()=>{
  const loss=lossEntry("appearance",{});
  assert.throws(()=>validateReport({reportVersion:"2",operation:"mapExport",entries:[loss],rawStandardFindings:[],idMap:[],artifacts:[]}));
  const r=buildReport("mapExport",{entries:[loss,loss],artifacts:[{format:"x",capability:"structural",entryIndexes:[0,1]}]});
  assert.equal(r.entries.length,1); assert.deepEqual(r.artifacts[0].entryIndexes,[0]);
});
