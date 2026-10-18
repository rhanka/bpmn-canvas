import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSchema } from "../dist/profile/contracts.js";
import { shared, vectors, expected } from "./helpers/profile-step4.mjs";
for(const [name,value] of [["snapshot-1",shared.snapshot],["layout-1",shared.layout],["render-data-1",shared.render],
  ["report-2",expected(vectors.find(v=>v.scenario==="all-stages"),"report")],
  ["result-1",expected(vectors.find(v=>v.scenario==="get-definitions"),"result")]]) {
  test(`should close ${name} syntax including nested records`,async()=>{
    const schema=JSON.parse(readFileSync(new URL(`../schemas/profile/${name}.schema.json`,import.meta.url)));
    const syntax=await compileSchema(schema);
    assert.equal(syntax(value).valid,true);
    assert.equal(syntax({...value,unknown:true}).valid,false);
    assert.equal(syntax(null).valid,false);
    const bad=structuredClone(value);
    if(name==="snapshot-1") bad.presentation.importedDi.extra=true;
    if(name==="layout-1") bad.pages[0].bounds.extra=true;
    if(name==="render-data-1") bad.occurrences[0].label.extra=true;
    if(name==="report-2") bad.entries[0].source.extra=true;
    if(name==="result-1") bad.payload.extra=true;
    assert.equal(syntax(bad).valid,false);
  });
}
test("should require complete edge geometry in Layout syntax",async()=>{
  const schema=JSON.parse(readFileSync(new URL("../schemas/profile/layout-1.schema.json",import.meta.url)));
  const syntax=await compileSchema(schema), layout=structuredClone(shared.layout);
  layout.geometry[0].sourceOccurrence={pageId:"Z-page",occurrenceKey:"z"};
  assert.equal(syntax(layout).valid,false);
});
