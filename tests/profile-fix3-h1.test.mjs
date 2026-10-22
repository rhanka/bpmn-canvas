/** Fix round 3, H1 (sol G1): activation makes an atomic, coherent
 * envelope/profile/revision transition. A successful activation re-binds the
 * loaded envelope to the offered profile identity and recomputes its revision,
 * so the snapshot agrees with the canvas identity and the next valid
 * transaction is accepted. An identity change that needs a migration (DESIGN
 * section 3.3) refuses until an actually executed migration; a supplied plan
 * alone never establishes migration. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";
import { compileUiNeutralProfile } from "./helpers/fix2-compile.mjs";
import { semanticRevision } from "../dist/profile/envelope.js";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));
const snapshot = () => JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));

async function loaded() {
  const out = await canvasFor(caseRecord("palette-001-task-programmatic.json"));
  out.canvas.loadSnapshot(structuredClone(snapshot()));
  return out;
}

test("H1 coherence: successful activation agrees with snapshot identity and revision", async () => {
  const { canvas, build } = await loaded();
  const out = canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors);
  assert.equal(out.status, "ok");
  const snap = canvas.getSnapshot().result.payload;
  assert.equal(snap.envelope.profileIdentity.sha256, canvas.profileIdentity.sha256);
  assert.equal(
    snap.envelope.semanticRevision,
    semanticRevision(snap.envelope.tree, canvas.profileIdentity, snap.envelope.bindings),
  );
  canvas.dispose();
});

test("H1 usability: successful activation permits the next valid DI transaction", async () => {
  const { canvas, build } = await loaded();
  assert.equal(canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors).status, "ok");
  const g = canvas.getSnapshot().result.payload.presentation.layout.geometry.find(h => h.semanticId && h.bounds);
  const out = await canvas.commitPresentation({
    baseRevision: canvas.currentRevision,
    expectedViewRevision: canvas.stateViewRevision(),
    transactionId: "review-after-activation",
    presentation: { gesture: "drag", pageId: g.pageId, occurrenceKey: g.occurrenceKey, delta: { x: 1000, y: 0 } },
  });
  assert.equal(out.result.status, "ok", `next transaction refused with ${out.result.code}`);
  canvas.dispose();
});

test("H1 migration: a major identity change refuses without an executed migration", async () => {
  const { canvas, build } = await loaded();
  const before = canvas.getSnapshot();
  const doc = structuredClone(build.profile);
  doc.version = "2.0.0";
  const other = await compileUiNeutralProfile(doc);
  const refused = canvas.activateBusinessProfile(other.compiled, doc, doc.descriptors);
  assert.equal(refused.status, "refused");
  assert.equal(refused.code, "profile-major-mismatch");
  assert.deepEqual(canvas.getSnapshot(), before);
  // A supplied plan alone is intent, never evidence of a validated and
  // executed migration, so it still refuses with the gate code.
  const token = canvas.activateBusinessProfile(other.compiled, doc, doc.descriptors, { migration: "review-major-plan" });
  assert.equal(token.status, "refused");
  assert.equal(token.code, "profile-major-mismatch");
  assert.deepEqual(canvas.getSnapshot(), before);
  canvas.dispose();
});
