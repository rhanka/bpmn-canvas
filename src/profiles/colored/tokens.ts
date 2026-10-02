import type { LegendTokens } from "../../internal/contracts.js";
import { DEFAULT_LEGEND_TOKENS, resolveLegendTokens } from "../legend/tokens.js";

/** Neutral defaults: the same 28 fields and fallbacks as the legend tokens. */
export const DEFAULT_COLORED_TOKENS: LegendTokens = DEFAULT_LEGEND_TOKENS;
export const resolveColoredTokens = resolveLegendTokens;

/** True when the host gave at least one token. Without any, the profile is the upstream drawing, untouched. */
export function hasTokens(tokens?: Partial<LegendTokens>): boolean {
  return Object.values(tokens ?? {}).some((value) => value !== undefined);
}
