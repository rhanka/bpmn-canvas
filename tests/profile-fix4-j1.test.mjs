/** Fix round 4, J1: activateBusinessProfile applies the DESIGN section 3.3
 * compatibility decision matrix rows in order with their exact codes.
 * Success only on exact identity match or after an actually executed
 * migration; a supplied plan argument alone (including false) never counts,
 * and a same-version digest conflict is never waivable. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";
import { compileUiNeutralProfile } from "./helpers/fix2-compile.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));
const snapshot = () => JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));

async function loaded() {
  const out = await canvasFor(caseRecord("palette-001-task-programmatic.json"));
  out.canvas.loadSnapshot(structuredClone(snapshot()));
  return out;
}

/** Stage a document-side (D) identity through the snapshot loader, which the
 * activation gate then compares against the offered (P) identity. The pins
 * check still uses the canvas pins, so only the envelope identity changes. */
async function staged(identityMutator) {
  const { canvas, build } = await loaded();
  const payload = canvas.getSnapshot().result.payload;
  const envelope = structuredClone(payload.envelope);
  identityMutator(envelope.profileIdentity);
  canvas.loadSnapshot({ envelope, presentation: structuredClone(payload.presentation),
    viewRevision: payload.viewRevision });
  return { canvas, build, before: canvas.getSnapshot() };
}

function checkRefused(out, canvas, before, code) {
  assert.equal(out.status, "refused");
  assert.equal(out.code, code);
  assert.deepEqual(canvas.getSnapshot(), before);
}

/** Identity-change rows staged through the offered document (compiled to a
 * matching handle so the compiled-identity check passes and the gate runs). */
for (const [version, code] of [
  ["1.1.1", "profile-patch-migration-required"],
  ["1.2.0", "profile-minor-migration-required"],
  ["1.0.9", "profile-minor-downgrade-required"],
  ["2.0.0", "profile-major-mismatch"],
]) {
  test(`J1 matrix: version ${version} refuses ${code} without migration`, async () => {
    const { canvas, build } = await loaded();
    const before = canvas.getSnapshot();
    const doc = structuredClone(build.profile);
    doc.version = version;
    const next = await compileUiNeutralProfile(doc);
    const out = canvas.activateBusinessProfile(next.compiled, doc, doc.descriptors);
    checkRefused(out, canvas, before, code);
    canvas.dispose();
  });
}

test("J1 matrix: exact identity match succeeds", async () => {
  const { canvas, build } = await loaded();
  const out = canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors ?? []);
  assert.equal(out.status, "ok");
  assert.deepEqual(canvas.profileIdentity, build.identity);
  const snap = canvas.getSnapshot().result.payload;
  assert.deepEqual(snap.envelope.profileIdentity, canvas.profileIdentity);
  assert.equal(snap.envelope.semanticRevision, canvas.currentRevision);
  const target = snap.presentation.layout.geometry.find(g => g.semanticId === "Task_A")
    ?? snap.presentation.layout.geometry.find(g => g.semanticId && g.bounds);
  const next = await canvas.commitPresentation({ baseRevision: canvas.currentRevision,
    expectedViewRevision: canvas.stateViewRevision(), transactionId: "review-content",
    presentation: { gesture: "drag", pageId: target.pageId, occurrenceKey: target.occurrenceKey,
      delta: { x: 27000, y: 0 } } });
  assert.equal(next.result.status, "ok", next.result.code);
  const moved = canvas.getSnapshot().result.payload.presentation.layout.geometry
    .find(r => r.occurrenceKey === target.occurrenceKey && r.pageId === target.pageId);
  assert.equal(moved.bounds.x, target.bounds.x + 27000);
  canvas.dispose();
});

test("J1 matrix: same version with unequal digest refuses profile-digest-mismatch", async () => {
  const { canvas, build } = await loaded();
  const before = canvas.getSnapshot();
  const doc = structuredClone(build.profile);
  doc.messages = [...(doc.messages ?? []), { id: "review-note", texts: [{ name: "en", value: "review" }] }];
  const next = await compileUiNeutralProfile(doc);
  assert.notEqual(next.identity.sha256, build.identity.sha256);
  const out = canvas.activateBusinessProfile(next.compiled, doc, doc.descriptors);
  checkRefused(out, canvas, before, "profile-digest-mismatch");
  canvas.dispose();
});

test("J1 matrix: digest conflict is never waived by a plan", async () => {
  const { canvas, build } = await loaded();
  const before = canvas.getSnapshot();
  const doc = structuredClone(build.profile);
  doc.messages = [...(doc.messages ?? []), { id: "review-note", texts: [{ name: "en", value: "review" }] }];
  const next = await compileUiNeutralProfile(doc);
  const out = canvas.activateBusinessProfile(next.compiled, doc, doc.descriptors, { migration: "review-plan" });
  checkRefused(out, canvas, before, "profile-digest-mismatch");
  canvas.dispose();
});

test("J1 matrix: patch downgrade refuses profile-patch-downgrade-required", async () => {
  const { canvas, build, before } = await staged(id => { id.version = "1.1.1"; });
  const out = canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors ?? []);
  checkRefused(out, canvas, before, "profile-patch-downgrade-required");
  canvas.dispose();
});

for (const [label, stage, code] of [
  ["mechanism differ", id => { id.mechanismVersion = "2"; }, "mechanism-migration-required"],
  ["schema differ", id => { id.schemaVersion = "9.9.9"; }, "profile-schema-migration-required"],
  ["base pin differ", id => { id.base = { ...id.base, version: "review-tampered" }; }, "base-mismatch"],
  ["descriptor pin differ", id => { id.descriptors = [{ ...id.descriptors[0], version: "review-tampered" }]; }, "descriptor-mismatch"],
  ["unknown document version", id => { id.version = "1.1"; }, "profile-source-unavailable"],
]) {
  test(`J1 matrix: ${label} refuses ${code}`, async () => {
    const { canvas, build, before } = await staged(stage);
    const out = canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors ?? []);
    checkRefused(out, canvas, before, code);
    canvas.dispose();
  });
}

for (const plan of [false, "review-plan", { migration: "review-plan" }]) {
  test(`J1 matrix: plan ${JSON.stringify(plan)} alone never migrates a patch change`, async () => {
    const { canvas, build } = await loaded();
    const before = canvas.getSnapshot();
    const doc = structuredClone(build.profile);
    doc.version = "1.1.1";
    const next = await compileUiNeutralProfile(doc);
    const out = canvas.activateBusinessProfile(next.compiled, doc, doc.descriptors, plan);
    checkRefused(out, canvas, before, "profile-patch-migration-required");
    canvas.dispose();
  });
}

test("J1 matrix: plan false alone never migrates a major change", async () => {
  const { canvas, build } = await loaded();
  const before = canvas.getSnapshot();
  const doc = structuredClone(build.profile);
  doc.version = "2.0.0";
  const next = await compileUiNeutralProfile(doc);
  const out = canvas.activateBusinessProfile(next.compiled, doc, doc.descriptors, false);
  checkRefused(out, canvas, before, "profile-major-mismatch");
  canvas.dispose();
});
