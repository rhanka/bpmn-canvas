import { test } from "node:test";
import assert from "node:assert/strict";
import { vectors, shared, input, expected, refuses } from "./helpers/profile-step4.mjs";
import { compileLintPolicy, severity, resolveLint, flattenLintConfigs, validateCompiledOptions, lintSummary, standardFinding, profileFinding, lintOperationStages, lintBarrier } from "../dist/profile/lint-contracts.js";
import { buildReport, entry, sourceCoordinate, serializeReport } from "../dist/profile/report.js";
for(const v of vectors.filter(v=>v.family==="lint-contract")) test(`should enforce ${v.caseId}`,async()=>{
  const s=v.scenario, i=v.inputArtifacts.some(a=>a.role==="lint-input")?input(v,"lint-input"):{};
  if(s==="policy-table") {const p=input(v,"profile-source"),t=input(v,"table-selector");assert.deepEqual(await compileLintPolicy(p,t),expected(v,"compiled-policy"));return;}
  if(s.startsWith("numeric-")) {assert.deepEqual(severity(i.severity),expected(v,"adapter-contract"));return;}
  if(["rule-missing","rule-thrown","config-missing","config-thrown"].includes(s)) {const o=input(v,"resolver-outcome"); await refuses(()=>resolveLint(o.kind,o.name,()=>{if(o.behavior==="undefined")return undefined;throw Object.assign(Error("unknown"),{code:o.kind==="rule"?"MODULE_NOT_FOUND":"CONFIG_NOT_FOUND"});}),v);return;}
  if(s==="info-restoration"||s==="profile-warning") {
    const policy=input(v,"effective-policy"),raw=s==="info-restoration"?input(v,"rawStandardFindings"):[];
    const e=s==="info-restoration"?standardFinding(raw[0],policy,{Z:"/rootElements/0/flowElements/0"},"post-normalize"):profileFinding(input(v,"transport"),{id:"task-named",code:"task-name-missing",message:"invalid"},policy,{Z:"/rootElements/0/flowElements/0"},"post-normalize");
    const report=buildReport("validate",{entries:[e],rawStandardFindings:raw});assert.deepEqual(report,expected(v,"report")); assert.equal(new TextDecoder().decode(serializeReport(report)),v.expectedArtifacts.find(a=>a.role==="report").canonical);
    if(s==="info-restoration") assert.deepEqual(lintSummary(report.entries),expected(v,"summary"));else assert.equal(lintSummary(report.entries).ok,true);return;
  }
  if(s==="allowlist"||s==="cycle") return refuses(()=>flattenLintConfigs(s==="cycle"?[i.start]:i.extends,name=>({extends:i.configs?.[name]??[],rules:{}}),s==="cycle"?Object.keys(i.configs):i.registeredPackages),v);
  if(s==="options-replacement") {const config=flattenLintConfigs(["plugin:neutral/a","plugin:neutral/b"],name=>({rules:{global:i.hostLayers[name.endsWith("a")?0:1]}}),["plugin:neutral/a","plugin:neutral/b"],{global:i.local});assert.deepEqual(config.global,{...expected(v,"adapter-contract").afterLocal});return;}
  if(s==="off-stage"||s==="missing-policy"||s==="missing-setting"||s==="off-subrule") {
    const p=structuredClone(shared.profile);p.rules=[{...p.rules[0],id:i.rule??"task-named",phase:i.declaredRulePhase??i.stage}];p.validation=[{id:i.stage,policy:i.policy??"draft",extends:[],settings:i.settings??(s==="off-subrule"?[{rule:"profile:task-named",severity:"off",classification:"readiness"}]:[])}];
    if(s==="off-subrule") {const out=await compileLintPolicy(p,{phase:i.stage,readinessPolicy:"draft"});assert.deepEqual(out.compiledOptions.compiledRules,[]);}else await refuses(()=>compileLintPolicy(p,{phase:i.stage,readinessPolicy:i.policy??(s==="missing-policy"?undefined:"draft")}),v);return;
  }
  if(s==="compiled-tampering") return refuses(()=>validateCompiledOptions({...i,compiledRules:[i.callerRule]}, {...i,compiledRules:[i.selectedRule]}),v);
  if(s==="compiled-unknown-field") return refuses(()=>validateCompiledOptions(i,i),v);
  if(s==="draft-integrity") {assert.deepEqual(lintSummary([entry({...i.finding})]),{ok:false,counts:{info:0,warn:0,error:1}});return;}
  if(s==="release-barrier") {assert.deepEqual(lintOperationStages(i.operation),expected(v,"adapter-contract").stages);assert.equal(lintBarrier([entry({stage:"release",severity:"error"})]),false);return;}
  if(s==="malformed-custom") return assert.throws(()=>profileFinding(i,{id:"task-named",code:i.code,message:"invalid"},{severity:"warn",classification:"readiness"},{},"post-normalize"),{code:"lint-rule-error"});
  if(s==="unresolved-id") return assert.deepEqual({source:sourceCoordinate(i.originalIndex,i)},expected(v,"adapter-contract"));
  if(s==="corrected-history") {const r=lintSummary(i.entries);assert.deepEqual({...r,historyEntriesRetained:i.entries.length},expected(v,"adapter-contract"));return;}
  assert.fail(`unhandled ${v.caseId}`);
});
