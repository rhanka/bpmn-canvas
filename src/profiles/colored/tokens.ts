import type { LegendTokens } from "../../internal/contracts.js";
import { LINE_KEYS, NEUTRAL_TOKENS, resolveTokens } from "../legend/tokens.js";

/** Neutral defaults: the same 33 fields and fallbacks as the legend tokens, without the reference Custom look. */
export const DEFAULT_COLORED_TOKENS: LegendTokens = NEUTRAL_TOKENS;
/** As the legend tokens, except that external labels follow `text` unless `labelText` is named. */
export function resolveColoredTokens(overrides?: Partial<LegendTokens>): LegendTokens {
  const resolved = resolveTokens(DEFAULT_COLORED_TOKENS, overrides);
  return overrides?.labelText === undefined ? ({ ...resolved, labelText: resolved.text } as LegendTokens) : resolved;
}

/** True when the host gave at least one token. Without any, the profile is the upstream drawing, untouched. */
export function hasTokens(tokens?: Partial<LegendTokens>): boolean {
  return Object.values(tokens ?? {}).some((value) => value !== undefined);
}

/**
 * The tokens that recolour. A kind whose token the host did not name keeps the upstream colour, so a host can recolour
 * the tasks and leave the flows as they are. `stroke` names every line, `fill` the task fill, `text` also the labels.
 */
export function namedColoredTokens(tokens?: Partial<LegendTokens>): string[] {
  const names = new Set<string>();
  for (const [key, value] of Object.entries(tokens ?? {})) if (value !== undefined) names.add(key);
  if (names.has("stroke")) for (const key of LINE_KEYS) names.add(key);
  if (names.has("fill")) names.add("taskFill");
  if (names.has("text")) names.add("labelText");
  return [...names];
}
