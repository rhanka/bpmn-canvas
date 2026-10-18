import { readFileSync } from "node:fs";
import { expectations } from "./profile-step3.mjs";
export const vectors = expectations.slice(211, 391);
export const shared = JSON.parse(readFileSync(new URL("../fixtures/profile-lot0/step4-inputs.json", import.meta.url)));
export function resolve(a) {
  if (Object.hasOwn(a, "json")) return structuredClone(a.json);
  if (a.fixture === "step4-inputs.json") return structuredClone(shared[a.key]);
  return JSON.parse(readFileSync(new URL(`../fixtures/profile-lot0/${a.fixture}`, import.meta.url)));
}
export const input = (v, role) => resolve(v.inputArtifacts.find(a => a.role === role));
export const expected = (v, role) => resolve(v.expectedArtifacts.find(a => a.role === role));
export function replacements(target, patch) {
  for (const [path, value] of Object.entries(patch)) {
    if (path === "omit") { const parts = value.split("."); const key = parts.pop(); let at = target; for (const p of parts) at = at[p]; delete at[key]; continue; }
    const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    const key = parts.pop(); let at = target;
    for (const p of parts) at = at[p];
    at[key] = structuredClone(value);
  }
  return target;
}
export async function refuses(run, v) {
  const assert = (await import("node:assert/strict")).default;
  const verdict = expected(v, "verdict");
  await assert.rejects(async () => run(), error => !verdict.code || error.code === verdict.code);
}
