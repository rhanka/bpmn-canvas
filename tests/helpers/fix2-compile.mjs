/** Fix-round-2 witness compile helper: compile an in-memory profile document
 * with the same ui-neutral base/descriptors/metrics inputs the sealed
 * lot-5 runner uses (see tests/helpers/lot5-runtime.mjs compileFor fallback).
 * No fixture bytes are read or written beyond the shared inputs. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../../dist/profile/compiler.js";
import { compileProfile } from "../../dist/profile/public-compiler.js";
import { compilerRegistry, ruleTable, schemaBytes } from "./compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "fixtures", "lot5-ui", "expectations");
const read = path => readFileSync(join(root, path));

export async function compileWitnessProfile({ profileDoc, base, descriptorList, assets }) {
  const profileBytes = Buffer.from(JSON.stringify(profileDoc));
  const baseBytes = read(base);
  const descriptorBytesList = descriptorList.map(read);
  const descriptors = JSON.parse(descriptorBytesList[0].toString("utf8")).types;
  const assetBag = new Map(assets.map(({ key, path }) => [key, read(path)]));
  const inputs = {
    schemaBytes,
    baseBytes,
    basePin: { ...profileDoc.base, digestDomain: "raw" },
    descriptorPins: profileDoc.descriptors.map((pin, i) => ({ ...pin, digestDomain: "raw",
      descriptorBytes: descriptorBytesList[i] ?? descriptorBytesList[0] })),
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag,
  };
  const loaded = await loadProfile(profileBytes, inputs);
  if (loaded.status !== "ok") throw new Error(`fix2 witness load failed: ${loaded.code}`);
  const registry = { ...compilerRegistry(), descriptors };
  const compiled = await compileProfile(loaded.payload, registry);
  if (compiled.status !== "ok") throw new Error(`fix2 witness compile failed: ${compiled.code}`);
  return { compiled: compiled.payload, identity: compiled.payload.identity, descriptors, assetBag };
}

export const compileUiNeutralProfile = profileDoc => compileWitnessProfile({ profileDoc,
  base: "fixtures/ui-neutral-base.json", descriptorList: ["fixtures/ui-neutral-descriptors.json"],
  assets: [{ key: "ui-neutral-metrics.json", path: "fixtures/ui-neutral-metrics.json" }] });

export const compileNeutralLot5Profile = profileDoc => compileWitnessProfile({ profileDoc,
  base: "vendor/py/artifacts/neutral-base.lot5.json",
  descriptorList: ["vendor/py/artifacts/neutral-descriptors.lot5.json"],
  assets: [{ key: "neutral-metrics.json",
    path: "../../profile-parity-corpus/profile-mechanism/1/neutral-metrics.json" }] });
