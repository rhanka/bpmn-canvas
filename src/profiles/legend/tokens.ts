import type { LegendTokens } from "../../internal/contracts.js";

/** Neutral defaults. Hosts supply their own look through `legendProfile(tokens)`. */
export const DEFAULT_LEGEND_TOKENS: LegendTokens = Object.freeze({
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  fontSize: 12,
  stroke: "#333333",
  strokeWidth: 1,
  fill: "#ffffff",
  text: "#222222",
  app: "#e8eef7",
  doc: "#f7f3e3",
  laneFill: "#efefef",
});

export function resolveLegendTokens(overrides?: Partial<LegendTokens>): LegendTokens {
  const out: Record<string, unknown> = { ...DEFAULT_LEGEND_TOKENS };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as LegendTokens;
}
