import { failContract } from "./native-contracts.js";

export type Activation = "edit" | "qualification";
export type GateTrigger = "support-create" | "lane-member-write" | "lane-member-remove" | "output-source-fill" | "bind-supports" | "remap-ids";

/** H1: explicit activation input; absent means edit. */
export function parseActivation(value: unknown): Activation {
  if (value === undefined) return "edit";
  if (value === "edit" || value === "qualification") return value;
  return failContract("operation-error");
}

/**
 * H2 gate table. Only effective changes reach this table; reuse and no-ops
 * never do. The first gate in recipe/candidate/step order wins.
 * Lane-member removal passes the gate under qualification; the §4.4
 * responsibility check then decides (refusal when the removed membership is
 * an uncovered business responsibility).
 */
export function gateDecision(trigger: GateTrigger, activation: Activation): { readonly proceed: true } | { readonly proceed: false; readonly code: "profile-open" | "responsibility-preservation-required" } {
  if (trigger === "bind-supports") return { proceed: false, code: "profile-open" };
  return activation === "edit" ? { proceed: false, code: "profile-open" } : { proceed: true };
}
