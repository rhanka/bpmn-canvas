import type { LegendTokens } from "../../internal/contracts.js";
import { DEFAULT_LEGEND_TOKENS, resolveLegendTokens } from "../legend/tokens.js";

/** Neutral defaults: the same 33 fields and fallbacks as the legend tokens. */
export const DEFAULT_COLORED_TOKENS: LegendTokens = DEFAULT_LEGEND_TOKENS;
/** As the legend tokens, except that external labels follow `text` unless `labelText` is named. */
export function resolveColoredTokens(overrides?: Partial<LegendTokens>): LegendTokens {
  const resolved = resolveLegendTokens(overrides);
  return overrides?.labelText === undefined ? ({ ...resolved, labelText: resolved.text } as LegendTokens) : resolved;
}

/** True when the host gave at least one token. Without any, the profile is the upstream drawing, untouched. */
export function hasTokens(tokens?: Partial<LegendTokens>): boolean {
  return Object.values(tokens ?? {}).some((value) => value !== undefined);
}
