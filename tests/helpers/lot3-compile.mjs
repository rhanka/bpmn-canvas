import { readFileSync } from "node:fs";
import { loadProfile } from "../../dist/profile/compiler.js";
import { compileProfile } from "../../dist/profile/public-compiler.js";
import { compilerRegistry, ruleTable, schemaBytes } from "./compiler-fixture.mjs";

const root = new URL("../../", import.meta.url);
const bytes = path => readFileSync(new URL(`tests/fixtures/${path}`, root));
const manifest = JSON.parse(bytes("lot3-cn/expectations/manifest.json"));
const parityManifest = JSON.parse(bytes("lot3-cn/expectations/vendor/py/parity/manifest.json"));

const candidateFiles = [
  "profile-parity-corpus/profile-mechanism/1/neutral-base.json",
  "profile-parity-corpus/profile-mechanism/1/neutral-descriptors.json",
  "profile-parity-corpus/profile-mechanism/1/neutral-metrics.json",
  "lot3-cn/expectations/profile/neutral-cn-base.json",
  "lot3-cn/expectations/profile/neutral-cn-descriptors.json",
  "lot3-cn/expectations/vendor/py/artifacts/cn-base.json",
  "lot3-cn/expectations/vendor/py/artifacts/cn-descriptors.json",
  "lot3-cn/expectations/vendor/py/artifacts/support-base.json",
  "lot3-cn/expectations/vendor/py/artifacts/support-descriptors.json",
];
for (const entry of manifest.profiles) {
  candidateFiles.push(entry.inputs.base.path, ...entry.inputs.descriptors.map(d => d.path), ...entry.inputs.assets.map(a => a.path));
}
const { rawDigest } = await import("../../dist/profile/canonical.js");
const bytesByDigest = new Map();
for (const path of new Set(candidateFiles)) {
  try {
    bytesByDigest.set(rawDigest(bytes(path)), bytes(path));
  } catch { /* absent candidate */ }
}

export function lot3ProfileEntry(key) {
  const entry = manifest.profiles.find(p => p.key === key);
  if (!entry) throw new Error(`unknown lot3 profile ${key}`);
  return entry;
}

/** Compile any profile referenced by a sealed lot3 case, resolving load bytes by digest. */
export async function compileByPath(profilePath) {
  const profileBytes = bytes(profilePath);
  const profile = JSON.parse(profileBytes);
  const baseBytes = bytesByDigest.get(profile.base.sha256);
  if (!baseBytes) throw new Error(`no base bytes for ${profile.base.sha256}`);
  const descriptorPins = profile.descriptors.map(pin => {
    const descriptorBytes = bytesByDigest.get(pin.sha256);
    if (!descriptorBytes) throw new Error(`no descriptor bytes for ${pin.sha256}`);
    return { ...pin, digestDomain: "raw", descriptorBytes };
  });
  const assetBag = new Map();
  for (const resource of profile.resources ?? []) {
    const assetBytes = bytesByDigest.get(resource.sha256);
    if (!assetBytes) throw new Error(`no asset bytes for ${resource.sha256}`);
    assetBag.set(resource.assetKey, assetBytes);
  }
  const inputs = {
    schemaBytes,
    baseBytes,
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins,
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag,
  };
  const loaded = await loadProfile(profileBytes, inputs);
  if (loaded.status !== "ok") return { loaded, compiled: undefined };
  const descriptors = JSON.parse(descriptorPins[0].descriptorBytes.toString()).types;
  const registry = { ...compilerRegistry(), descriptors };
  return { loaded, compiled: await compileProfile(loaded.payload, registry) };
}

export async function lot3Load(key) {
  const entry = lot3ProfileEntry(key);
  const profile = JSON.parse(bytes(entry.path));
  const inputs = {
    schemaBytes: bytes(entry.inputs.schema.path),
    baseBytes: bytes(entry.inputs.base.path),
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map((pin, i) => ({ ...pin, digestDomain: "raw", descriptorBytes: bytes(entry.inputs.descriptors[i].path) })),
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag: new Map(entry.inputs.assets.map(a => [a.key, bytes(a.path)])),
  };
  const loaded = await loadProfile(bytes(entry.path), inputs);
  return { entry, profile, loaded };
}

export async function lot3Compile(key, mutate) {
  const { entry, loaded } = await lot3Load(key);
  if (loaded.status !== "ok") return { entry, loaded, compiled: undefined };
  const descriptors = JSON.parse(bytes(entry.inputs.descriptors[0].path)).types;
  const registry = { ...compilerRegistry(), descriptors };
  if (!mutate) return { entry, loaded, compiled: await compileProfile(loaded.payload, registry) };
  const clone = structuredClone(loaded.payload.profile);
  mutate(clone);
  const again = await loadProfile(JSON.stringify(clone), {
    schemaBytes: bytes(entry.inputs.schema.path),
    baseBytes: bytes(entry.inputs.base.path),
    basePin: { ...clone.base, digestDomain: "raw" },
    descriptorPins: clone.descriptors.map((pin, i) => ({ ...pin, digestDomain: "raw", descriptorBytes: bytes(entry.inputs.descriptors[i].path) })),
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag: new Map(entry.inputs.assets.map(a => [a.key, bytes(a.path)])),
  });
  if (again.status !== "ok") return { entry, loaded: again, compiled: undefined };
  return { entry, loaded: again, compiled: await compileProfile(again.payload, registry) };
}
