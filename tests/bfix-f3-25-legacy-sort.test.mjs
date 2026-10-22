// F3 finding #25: mapLegacyDiagnostics must sort by the full Report/2
// within-stage order (DESIGN L751: ruleId, source domain/pointer, targetId,
// code, pageId, occurrenceKey, canonical before/after), not by pointer alone.
// Red on 25a66ed: same-pointer entries keep call order instead of the
// report order.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adapterManifest, mapLegacyDiagnostics } from "../dist/profile/lot4-legacy.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "fixtures/lot4-layout-export/expectations");
const artifact = JSON.parse(readFileSync(join(root, "artifacts/legacy-adapter-manifest.json"), "utf8"));
const byId = new Map(artifact.adapters.map((a) => [a.id, a.fallbackInventory]));
const manifest = adapterManifest({
  fallbackCodes: byId.get("js-legacy-export"),
  workshopCodes: byId.get("js-workshop-export"),
  provenance: {
    reviewedAgainst: artifact.reviewedAgainst,
    pythonTwinEntry: artifact.adapters.find((a) => a.id === "python-twin-legacy-export").entry,
  },
});

test("finding #25: same-pointer entries sort by targetId then code", () => {
  const samePointer = { A: "/rootElements/0", B: "/rootElements/0" };
  const out = mapLegacyDiagnostics({
    adapterId: "js-legacy-export",
    legacy: { kind: "IoError", code: "missing-endpoint", ids: ["B", "A"] },
    sourceIndex: samePointer,
    manifest,
  });
  assert.equal(out.status, "ok");
  assert.deepEqual(
    out.payload.map((e) => e.source.targetId),
    ["A", "B"],
    "pointer tie breaks on targetId (UTF-16)",
  );
});

test("finding #25: multi-id output satisfies the sealed profile-report/2 order", async () => {
  const { reportOrder } = await import("./fixtures/lot4-layout-export/expectations/comparators/lot4-compare.mjs");
  const out = mapLegacyDiagnostics({
    adapterId: "js-legacy-export",
    legacy: { kind: "IoError", code: "missing-endpoint", ids: ["B", "A"] },
    sourceIndex: { A: "/rootElements/0", B: "/rootElements/0" },
    manifest,
  });
  assert.equal(out.status, "ok");
  const actual = {
    operation: "export",
    report: { reportVersion: "2", operation: "export", entries: out.payload, idMap: [], artifacts: [] },
  };
  const verdict = reportOrder({}, actual);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.failures));
});
