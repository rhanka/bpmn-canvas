/** Fix round 2, G1: activateBusinessProfile must validate and adopt the
 * supplied compiled profile/profile state (identity changes), and refuse
 * invalid input with its code. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";
import { compileUiNeutralProfile } from "./helpers/fix2-compile.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));
const snapshot = () => JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));

async function loadedCanvas() {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas, build } = await canvasFor(c);
  canvas.loadSnapshot(structuredClone(snapshot()));
  return { canvas, build };
}

test("G1: {} is refused as a compiled profile with its code", async () => {
  const { canvas, build } = await loadedCanvas();
  const out = canvas.activateBusinessProfile({}, {}, build.profile.descriptors ?? []);
  assert.equal(out.status, "refused");
  assert.equal(out.code, "profile-context-unknown");
  canvas.dispose();
});

test("G1: an unplanned patch change refuses profile-patch-migration-required", async () => {
  const { canvas, build } = await loadedCanvas();
  const before = canvas.getSnapshot();
  // The witness compile path is faithful: an unmodified recompile keeps identity.
  const same = await compileUiNeutralProfile(structuredClone(build.profile));
  assert.equal(same.identity.sha256, build.identity.sha256);
  const profileB = structuredClone(build.profile);
  profileB.version = "1.1.1";
  const next = await compileUiNeutralProfile(profileB);
  assert.notEqual(next.identity.sha256, build.identity.sha256);
  const out = canvas.activateBusinessProfile(next.compiled, profileB, profileB.descriptors ?? []);
  assert.equal(out.status, "refused");
  assert.equal(out.code, "profile-patch-migration-required");
  assert.equal(canvas.profileIdentity.version, build.profile.version);
  assert.deepEqual(canvas.getSnapshot(), before);
  canvas.dispose();
});

test("G1: re-activating the current profile still succeeds", async () => {
  const { canvas, build } = await loadedCanvas();
  const out = canvas.activateBusinessProfile(build.compiled, build.profile, build.profile.descriptors ?? []);
  assert.equal(out.status, "ok");
  assert.equal(out.profileIdentity.sha256, build.identity.sha256);
  assert.equal(out.payload.historyEpoch, "1");
  canvas.dispose();
});

test("G1: mismatched descriptor pins still refuse before adoption", async () => {
  const { canvas, build } = await loadedCanvas();
  const pins = structuredClone(build.profile.descriptors ?? []);
  pins[0] = { ...pins[0], version: "tampered" };
  const out = canvas.activateBusinessProfile(build.compiled, build.profile, pins);
  assert.equal(out.status, "refused");
  assert.equal(out.code, "descriptor-mismatch");
  assert.equal(canvas.profileIdentity.sha256, build.identity.sha256);
  canvas.dispose();
});
