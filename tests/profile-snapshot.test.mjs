import { test } from "node:test";
import assert from "node:assert/strict";
import { vectors, shared, input, expected, replacements, refuses } from "./helpers/profile-step4.mjs";
import { validateSnapshot, archiveDi, presentationBinding, viewRevision } from "../dist/profile/presentation-contracts.js";

// These fixtures explicitly supply storage/descriptor admission, not full DI validation.
export const context = () => ({ profile: shared.profile, envelope: shared.envelope, metricPins: shared.metricPins,
  themeId: "plain", overrides: shared.overrides, diStyles: shared.diStyles,
  validateEnvelope: async e => structuredClone(e), validateDi: () => true });
for (const v of vectors.filter(v => v.family === "snapshot")) {
  test(`should enforce ${v.caseId}`, async () => {
    if (v.scenario === "archive-preservation") {
      assert.deepEqual(await archiveDi(input(v, "already-descriptor-validated-archive"), () => true), expected(v, "importedDi")); return;
    }
    let snapshot = input(v, "snapshot"); const ctx = context();
    ctx.envelope = snapshot.envelope;
    const patch = v.inputArtifacts.find(a => a.role === "literal-replacements");
    if (patch) { const p = structuredClone(patch.json); if (p.hostProfileIdentity) { ctx.hostProfileIdentity = p.hostProfileIdentity; delete p.hostProfileIdentity; } replacements(snapshot, p); }
    if (v.scenario === "navigation-only") { snapshot.presentation.selection.reverse(); snapshot.presentation.activePageId = "A-page"; }
    const before = structuredClone(snapshot);
    if (v.expectedStatus !== "ok") await refuses(() => validateSnapshot(snapshot, ctx), v);
    else {
      const actual = await validateSnapshot(snapshot, ctx);
      assert.deepEqual(actual, expected(v, "snapshot"));
      assert.notEqual(actual, snapshot);
      if (v.scenario === "navigation-only") {
        const binding = await presentationBinding({ ...ctx, envelope: snapshot.envelope, layout: snapshot.presentation.layout });
        assert.deepEqual({ semanticRevision: snapshot.envelope.semanticRevision, viewRevision: await viewRevision(binding), payloadDigest: shared.render.binding.payloadDigest }, expected(v, "unchanged-digests"));
      }
    }
    assert.deepEqual(snapshot, before);
  });
}
test("should require actual envelope and archive validation and preserve caller state", async () => {
  await assert.rejects(() => validateSnapshot(shared.snapshot, { ...context(), validateEnvelope: async () => { throw Error("storage refused"); } }));
  await assert.rejects(() => archiveDi({ descriptorDigest: shared.render.binding.descriptorDigest, diagrams: [] }, () => false));
});
test("should reject a substituted identity even when its profile digest is copied",async()=>{
  const s=structuredClone(shared.snapshot);s.envelope.profileIdentity.base.version="other";
  const {semanticRevision}=await import("../dist/profile/envelope.js");
  s.envelope.semanticRevision=await semanticRevision(s.envelope.tree,s.envelope.profileIdentity,[]);
  await assert.rejects(()=>validateSnapshot(s,context()),{code:"profile-metadata-conflict"});
});
test("should use snapshot-schema for unknown nested snapshot fields",async()=>{
  const s=structuredClone(shared.snapshot);s.presentation.layout.geometry[0].bounds.extra=true;
  await assert.rejects(()=>validateSnapshot(s,context()),{code:"snapshot-schema"});
});
