import { test } from "node:test";
import assert from "node:assert/strict";
import { vectors, shared, input, expected, refuses } from "./helpers/profile-step4.mjs";
import { validateResult, validatePureResult, documentRead, queueBoundary, methodDelivery, validatePreparedArtifact } from "../dist/profile/results.js";
for(const v of vectors.filter(v=>v.family==="result-unions")) test(`should enforce ${v.caseId}`,async()=>{
  const s=v.scenario;
  if(v.inputArtifacts.some(a=>a.role==="candidate-result")) return refuses(()=>{ const c=input(v,"candidate-result");return c.operation?validateResult(c):validatePureResult(c); },v);
  if(s==="signature-contract") {const sig=expected(v,"signatures");for(const name of Object.keys(sig.synchronous)) assert.equal(methodDelivery[name],"synchronous");for(const name of Object.keys(sig.queued))assert.equal(methodDelivery[name],"queued");return;}
  if(s==="prepared-artifact") return assert.deepEqual(await validatePreparedArtifact(expected(v,"prepared")),expected(v,"prepared"));
  if(["get-definitions","get-snapshot","not-loaded"].includes(s)) {
    const result=documentRead(s==="get-snapshot"?"getSnapshot":"getDefinitions",s==="not-loaded"?undefined:input(v,"committed-snapshot"));
    assert.equal(result instanceof Promise,false);assert.deepEqual(result,expected(v,"result"));return;
  }
  if(["cancelled","disposed","operation-error"].includes(s)) {
    let rolledBack=0,commits=0;
    const ctx={operation:"setDefinitions",snapshot:input(v,"before"),cancelled:s==="cancelled",disposed:s==="disposed",rollback:()=>{rolledBack++;}};
    const promise=queueBoundary(ctx,()=>{throw Error("internal");},()=>{commits++;});assert.ok(promise instanceof Promise);
    const result=await promise;assert.deepEqual(result,expected(v,"result"));assert.equal(commits,0);assert.equal(rolledBack,s==="operation-error"?1:0);return;
  }
  const result=expected(v,"result");
  assert.deepEqual(result.operation?validateResult(result):validatePureResult(result,s==="dispose-ok"?"dispose":"unsubscribe"),result);
});
test("should close operation payloads and nested reports and preserve the read snapshot",()=>{
  const result=documentRead("getSnapshot",shared.snapshot); result.payload.presentation.selection.length=0;
  assert.equal(shared.snapshot.presentation.selection.length,2);
  const bad=documentRead("getDefinitions",shared.snapshot);bad.payload.unexpected=true;
  assert.throws(()=>validateResult(bad));
  const unknown={...documentRead("getDefinitions",shared.snapshot),operation:"unregistered"};assert.throws(()=>validateResult(unknown));
});
test("should reject nested snapshot extras and inconsistent refusal report identity",()=>{
  const s=documentRead("getSnapshot",shared.snapshot);s.payload.presentation.overrides.semantic=[{semanticId:"Z",tokens:[],extra:true}];
  assert.throws(()=>validateResult(s));
  const refusal={status:"refused",operation:"setDefinitions",profileIdentity:shared.envelope.profileIdentity,baseRevision:shared.envelope.semanticRevision,code:"operation-cancelled",diagnostics:[],report:{reportVersion:"2",operation:"setDefinitions",entries:[],rawStandardFindings:[],idMap:[],artifacts:[],sourceIdentity:{...shared.envelope.profileIdentity,sha256:"0".repeat(64)}}};
  assert.throws(()=>validateResult(refusal));
});
test("should discard a late cancelled stage and fulfill after rollback exceptions",async()=>{
  let commits=0,rollbacks=0;
  const ctx={operation:"setDefinitions",snapshot:shared.snapshot,cancelled:false,rollback:()=>{rollbacks++;}};
  const result=await queueBoundary(ctx,async()=>{ctx.cancelled=true;return {};},()=>{commits++;});
  assert.equal(result.code,"operation-cancelled");assert.equal(commits,0);assert.equal(rollbacks,1);
  const broken=await queueBoundary({...ctx,cancelled:false,rollback:()=>{throw Error("rollback failed");}},()=>{throw Error("stage failed");},()=>{commits++;});
  assert.equal(broken.code,"operation-error");
});
