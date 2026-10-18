import { test } from "node:test";
import assert from "node:assert/strict";
import { vectors, shared, input, expected, replacements, refuses } from "./helpers/profile-step4.mjs";
import { canonicalDigest, canonicalize } from "../dist/profile/canonical.js";
import { profileIdentity, semanticRevision } from "../dist/profile/envelope.js";
import * as compatibility from "../dist/profile/compatibility.js";
import { validateRenderData, validateOccurrence, validateBounds, sortPages, sortOccurrences, syntheticKey,
  normalizeOverrides, normalizeDiStyles, pinDigest, presentationBinding, viewRevision, payloadDigest } from "../dist/profile/presentation-contracts.js";
const context = () => ({ profile: shared.profile, envelope: shared.envelope, layout: shared.layout, themeId: "plain",
  metricPins: shared.metricPins, overrides: shared.overrides, diStyles: shared.diStyles });
for (const v of vectors.filter(v => v.family === "render-contract")) test(`should enforce ${v.caseId}`, async () => {
  const s = v.scenario;
  if (s === "page-order") return assert.deepEqual(sortPages(input(v,"pages")), expected(v,"ordered-pages"));
  if (s === "occurrence-order") return assert.deepEqual(sortOccurrences(input(v,"occurrences"),shared.layout.pages),expected(v,"ordered-occurrences"));
  if (s === "signed-position") return assert.deepEqual(validateBounds(input(v,"bounds")),expected(v,"bounds"));
  if (s === "synthetic") { const i=input(v,"declared-synthetic-context"); const o=expected(v,"occurrence"); assert.equal(syntheticKey(i.declarationId,i.ownerId,i.pageId),o.occurrenceKey); validateOccurrence(o,shared.render.occurrences,shared.layout.pages); return; }
  if (s === "edge") { const i=input(v,"supplied-edge-context"); assert.deepEqual(validateOccurrence(i.edge,i.peers,shared.layout.pages),expected(v,"occurrence")); return; }
  const r=structuredClone(shared.render), ctx=context();
  const p=v.inputArtifacts.find(a=>a.role==="literal-replacements")?.json;
  const before=canonicalize(shared);
  const run=async()=>{
    if(p) {
      const patch=structuredClone(p);
      if(patch.edge) { validateOccurrence(patch.edge,r.occurrences,r.pages,{crossPage:patch.formatSupportsCrossPage??true}); delete patch.edge; delete patch.formatSupportsCrossPage; }
      if(patch.appendOccurrence) { r.occurrences.push(patch.appendOccurrence); delete patch.appendOccurrence; }
      if(patch.layout) { ctx.layout=patch.layout; delete patch.layout; }
      replacements(r,patch);
    }
    return validateRenderData(r,ctx);
  };
  if(v.expectedStatus!=="ok") await refuses(run,v);
  else {
    const actual=await run(); assert.deepEqual(actual,shared.render);
    if(s==="complete-binding") assert.equal(await viewRevision(actual.binding),expected(v,"viewRevision"));
    if(s==="repeated-semantic") { assert.deepEqual(actual.coverage,expected(v,"coverage")); assert.deepEqual(actual.occurrences.map(({pageId,occurrenceKey})=>({pageId,occurrenceKey})),expected(v,"occurrence-pairs")); }
  }
  assert.equal(canonicalize(shared),before);
});
for(const v of vectors.filter(v=>v.family==="render-digests")) test(`should compute ${v.caseId}`,async()=>{
  const s=v.scenario, ctx=context(), tuple=shared.viewTuple, b=shared.render.binding;
  if(["token-invalid","duplicate-target","duplicate-token","unknown-target","null-bag"].includes(s)) return refuses(()=>normalizeOverrides(input(v,"overrides"),shared.envelope.tree,shared.layout.geometry),v);
  if(s==="empty-bags"||s==="normalized-bags") {
    for(const data of s==="empty-bags"?[{overrides:input(v,"overrides"),diStyles:input(v,"diStyles")}]:[input(v,"first"),input(v,"second")]) {
      const normalized={overrides:normalizeOverrides(data.overrides,shared.envelope.tree,shared.layout.geometry),diStyles:normalizeDiStyles(data.diStyles,shared.layout.geometry)};
      if(s==="normalized-bags") assert.deepEqual(normalized,expected(v,"normalized"));
      const digests={overridesDigest:await canonicalDigest(normalized.overrides),diStylesDigest:await canonicalDigest(normalized.diStyles)};
      const golden=expected(v,"digests"); delete golden.equalAcrossInputs; assert.deepEqual(digests,golden);
    } return;
  }
  if(s==="descriptor-pin-order"||s==="metric-pin-order") { assert.equal(await pinDigest(input(v,"pins"),s==="descriptor-pin-order"),expected(v,s==="descriptor-pin-order"?"descriptorDigest":"metricsDigest"));return; }
  if(s==="profile-package") {
    const before=await profileIdentity(input(v,"before-profile")), identity=await profileIdentity(input(v,"after-profile"));
    assert.deepEqual(identity,expected(v,"identity"));
    assert.equal(await semanticRevision(shared.envelope.tree,identity,[]),expected(v,"semanticRevision"));
    assert.deepEqual(compatibility.profileActivationRequirements(before,identity),expected(v,"activation"));
    const facts={runtime:{mechanisms:[identity.mechanismVersion],schemas:[identity.schemaVersion],capabilities:[],assets:[]},
      injected:identity,document:{documentVersion:"1",profileIdentity:before},requiredCapabilities:[],requiredAssets:[],
      sourcePackage:"known-and-available",envelopeValid:true,selectedMigration:true};
    const source=canonicalize(facts);
    assert.deepEqual(compatibility.checkCompatibility(facts),{verdict:{status:"refused",code:"profile-digest-mismatch"},
      output:{acceptedUnderInjectedProfile:false,sourcePreserved:true,migrationExecuted:false}});
    // This witness edits a package without publishing a new version. Its
    // migration requirement cannot waive the same-version digest conflict.
    assert.equal(canonicalize(facts),source);
    return;
  }
  let actual;
  if(s==="metric-byte") { const after=await pinDigest(input(v,"afterPins"),false); actual={before:await pinDigest(input(v,"beforePins"),false),after,viewRevision:await viewRevision({...tuple,metricsDigest:after}),semanticRevision:tuple.semanticRevision}; }
  if(s==="page-name") { const layoutDigest=await canonicalDigest(input(v,"after"));actual={layoutDigest,viewRevision:await viewRevision({...tuple,layoutDigest})}; }
  if(s==="payload-change") { actual={payloadDigest:await payloadDigest(input(v,"replacement-payload")),contextViewRevision:await viewRevision(tuple)}; }
  if(s==="theme-switch"||s==="override-change") { const changed=await presentationBinding({...ctx,...(s==="theme-switch"?{themeId:input(v,"selection").to}:{overrides:input(v,"overrides")})}); const key=s==="theme-switch"?"themeDigest":"overridesDigest";actual={semanticRevision:changed.semanticRevision,profileDigest:changed.profileDigest,[key]:changed[key],viewRevision:await viewRevision(changed)}; }
  assert.deepEqual(actual,expected(v,"digests"));
  // Mutations invalidate the captured binding, without pretending to recompute R.
  if(["metric-byte","page-name","payload-change"].includes(s)) {
    const changed=context(),render=structuredClone(shared.render);
    if(s==="metric-byte") changed.metricPins=input(v,"afterPins");
    if(s==="page-name") changed.layout=input(v,"after");
    if(s==="payload-change") Object.assign(render,input(v,"replacement-payload"));
    await assert.rejects(()=>validateRenderData(render,changed),{code:"render-stale"});
  }
});
test("should reject rehashed render geometry that disagrees with captured layout",async()=>{
  const r=structuredClone(shared.render);r.occurrences[0].bounds.x=1;r.binding.payloadDigest=await payloadDigest(r);
  await assert.rejects(()=>validateRenderData(r,context()));
});
