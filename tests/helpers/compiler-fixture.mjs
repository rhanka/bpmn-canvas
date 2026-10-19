import { readFileSync } from "node:fs";
import recommended from "bpmnlint/config/recommended.js";

export const mechanismBytes = name => readFileSync(new URL(`../fixtures/profile-parity-corpus/profile-mechanism/1/${name}`, import.meta.url));
export const mechanism = name => JSON.parse(mechanismBytes(name));
export const schemaBytes = readFileSync(new URL("../../schemas/profile/profile-mechanism-1.schema.json", import.meta.url));
export const ruleTable = { format: "profile-compiler-rule-table/1", revision: "R3.3", sha256: "a684ac82bbf6a94dedd53e97c72055b4fb2110b27fd75774bbe2fd1944ffd1e1" };
export function compilerInputs() {
  const p = mechanism("neutral-profile.json");
  return {
    schemaBytes, baseBytes: mechanismBytes("neutral-base.json"),
    basePin: { ...p.base, digestDomain: "raw" },
    descriptorPins: [{ ...p.descriptors[0], digestDomain: "raw", descriptorBytes: mechanismBytes("neutral-descriptors.json") }],
    compilerRuleTable: ruleTable,
    capabilities: { capabilities: compilerRegistry().capabilities, signatures: compilerRegistry().signatures },
    assetBag: new Map([["neutral-metrics.json", mechanismBytes("neutral-metrics.json")]]),
  };
}
export function compilerRegistry() {
  const groups = {
    "predicates/1": "literal read id ids param concat stripPrefix case outputId true false all any not typeIs present equal textPrefix boundRole recognizes",
    "selectors/1": "count reachable",
    "recipes/1": "bind create ensure set unset assignRef reparent place remove refuse",
    "export-ir/1": "emit loss",
  };
  return {
    capabilities: [...Object.keys(groups), "profile-lint/1", "render-data/1"],
    signatures: Object.fromEntries(Object.entries(groups).flatMap(([capability, ops]) => ops.split(" ").map(op => [op,
      { capability, version: "1", argumentSchemaDigest: "0".repeat(64) }]))),
    descriptors: mechanism("neutral-descriptors.json").types,
    compilerRuleTable: ruleTable,
    requiredStandardRules: Object.keys(recommended.rules).sort(),
    lintConfigs: { "bpmnlint:recommended": recommended },
    lintAllowlist: ["bpmnlint:recommended"],
  };
}
