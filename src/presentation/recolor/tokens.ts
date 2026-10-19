import { lineKeys, resolveTokens } from "../annotated/tokens.js";
import { ProfileContractError } from "../../profile/canonical.js";
import type { AnnotatedTokens } from "../../internal/contracts.js";

/** Neutral defaults: the same 33 fields and fallbacks as the annotated tokens, without the reference Custom look. */
/** As the annotated tokens, except that external labels follow `text` unless `labelText` is named. */
export function resolveColoredTokens(overrides?: Partial<AnnotatedTokens>, base?: AnnotatedTokens): AnnotatedTokens {
  if (!base) throw new ProfileContractError("profile-resource-missing");
  const resolved = resolveTokens(base, overrides);
  return overrides?.labelText === undefined ? ({ ...resolved, labelText: resolved.text } as AnnotatedTokens) : resolved;
}

/** True when the host gave at least one token. Without any, the profile is the upstream drawing, untouched. */
export function hasTokens(tokens?: Partial<AnnotatedTokens>): boolean {
  return Object.values(tokens ?? {}).some((value) => value !== undefined);
}

/**
 * The tokens that recolour. A kind whose token the host did not name keeps the upstream colour, so a host can recolour
 * the tasks and leave the flows as they are. `stroke` names every line, `fill` the task fill, `text` also the labels.
 */
export function namedColoredTokens(tokens?: Partial<AnnotatedTokens>): string[] {
  const names = new Set<string>();
  for (const [key, value] of Object.entries(tokens ?? {})) if (value !== undefined) names.add(key);
  if (names.has("stroke")) for (const key of lineKeys) names.add(key);
  if (names.has("fill")) names.add("taskFill");
  if (names.has("text")) names.add("labelText");
  return [...names];
}
