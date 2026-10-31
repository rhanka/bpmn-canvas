import type { AnnotatedTokens } from "../../internal/contracts.js";
import { ProfileContractError } from "../../profile/canonical.js";
import { shade } from "./style.js";
export const lineKeys = ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"] as const;

/** The annotated defaults, then the host's `stroke`/`fill` conveniences, then the host's explicit per-type values. */
export function resolveAnnotatedTokens(overrides?: Partial<AnnotatedTokens>, base?: AnnotatedTokens): AnnotatedTokens {
  if (!base) throw new ProfileContractError("profile-resource-missing");
  return resolveTokens(base, overrides);
}

/** `defaults`, then the host's `stroke`/`fill` conveniences, then the host's explicit per-type values. */
export function resolveTokens(defaults: AnnotatedTokens, overrides?: Partial<AnnotatedTokens>): AnnotatedTokens {
  const given: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides ?? {})) if (value !== undefined) given[key] = value;
  const out: Record<string, unknown> = { ...defaults };
  if (typeof given["stroke"] === "string") for (const key of lineKeys) out[key] = given["stroke"];
  if (typeof given["fill"] === "string") out["taskFill"] = given["fill"];
  Object.assign(out, given);
  // A host that names `link` (or `laneFill`) without `docLink` (or `laneHeaderFill`) gets them aligned.
  if (given["docLink"] === undefined && given["link"] !== undefined) out["docLink"] = out["link"];
  if (given["laneHeaderFill"] === undefined && given["laneFill"] !== undefined) out["laneHeaderFill"] = out["laneFill"];
  // The gradient end is derived from the start tone unless the host names it.
  if (given["taskFillEnd"] === undefined && typeof out["taskFill"] === "string" && out["taskFill"] !== defaults.taskFill) {
    out["taskFillEnd"] = shade(out["taskFill"], 0.95);
  }
  return out as unknown as AnnotatedTokens;
}
