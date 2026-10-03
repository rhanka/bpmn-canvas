import type { LegendTokens } from "../../internal/contracts.js";
import { shade } from "./style.js";

/** Neutral values: the defaults of the colored profile, and a plain base for hosts that want no reference look. */
export const NEUTRAL_TOKENS: LegendTokens = Object.freeze({
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  fontSize: 12,
  strokeWidth: 1,
  stroke: "#333333",
  fill: "#ffffff",
  text: "#222222",
  labelText: "#22242a",
  headerText: "#222222",
  flow: "#333333",
  link: "#666666",
  docLink: "#666666",
  docLinkDash: "5 5",
  dataLinkArrow: true,
  taskLine: "#333333",
  taskFill: "#ffffff",
  taskFillEnd: "#f2f2f2",
  eventLine: "#333333",
  eventFill: "#e4e9ef",
  gatewayLine: "#333333",
  gatewayFill: "#d9e2ec",
  poolLine: "#333333",
  poolFill: "#efefef",
  laneLine: "#333333",
  laneFill: "#f6f6f6",
  laneHeaderFill: "#f6f6f6",
  externalLine: "#333333",
  externalFill: "#f3f1e7",
  docLine: "#333333",
  docFill: "#f7f3e3",
  dataLine: "#333333",
  dataFill: "#f5f5f5",
  appLine: "#333333",
  appFill: "#e8eef7",
});

/**
 * Defaults of the legend profile: the reference Custom look (black lines, beige task gradient, red events,
 * green gateways, yellow external processes and documents, cyan application boxes, dashed red links,
 * white lane headers). A host overrides any of them through `legendProfile(tokens)` / `legendTokens`.
 */
export const DEFAULT_LEGEND_TOKENS: LegendTokens = Object.freeze({
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  fontSize: 12,
  strokeWidth: 1,
  stroke: "#000000",
  fill: "#ffffff",
  text: "#000000",
  labelText: "#22242a",
  headerText: "#595959",
  flow: "#000000",
  link: "#b85450",
  docLink: "#b85450",
  docLinkDash: "5 5",
  dataLinkArrow: false,
  taskLine: "#000000",
  taskFill: "#f6f1ea",
  taskFillEnd: "#ECE2D4",
  eventLine: "#000000",
  eventFill: "#E27676",
  gatewayLine: "#000000",
  gatewayFill: "#60BE89",
  poolLine: "#000000",
  poolFill: "#eee7df",
  laneLine: "#000000",
  laneFill: "#f6f6f6",
  laneHeaderFill: "#ffffff",
  externalLine: "#000000",
  externalFill: "#ffff99",
  docLine: "#000000",
  docFill: "#ffe599",
  dataLine: "#000000",
  dataFill: "#f6f1ea",
  appLine: "#000000",
  appFill: "#99ffff",
});

export const LINE_KEYS = ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"] as const;

/** The legend defaults, then the host's `stroke`/`fill` conveniences, then the host's explicit per-type values. */
export function resolveLegendTokens(overrides?: Partial<LegendTokens>): LegendTokens {
  return resolveTokens(DEFAULT_LEGEND_TOKENS, overrides);
}

/** `defaults`, then the host's `stroke`/`fill` conveniences, then the host's explicit per-type values. */
export function resolveTokens(defaults: LegendTokens, overrides?: Partial<LegendTokens>): LegendTokens {
  const given: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides ?? {})) if (value !== undefined) given[key] = value;
  const out: Record<string, unknown> = { ...defaults };
  if (typeof given["stroke"] === "string") for (const key of LINE_KEYS) out[key] = given["stroke"];
  if (typeof given["fill"] === "string") out["taskFill"] = given["fill"];
  Object.assign(out, given);
  // A host that names `link` (or `laneFill`) without `docLink` (or `laneHeaderFill`) gets them aligned.
  if (given["docLink"] === undefined && given["link"] !== undefined) out["docLink"] = out["link"];
  if (given["laneHeaderFill"] === undefined && given["laneFill"] !== undefined) out["laneHeaderFill"] = out["laneFill"];
  // The gradient end is derived from the start tone unless the host names it.
  if (given["taskFillEnd"] === undefined && typeof out["taskFill"] === "string" && out["taskFill"] !== defaults.taskFill) {
    out["taskFillEnd"] = shade(out["taskFill"], 0.95);
  }
  return out as unknown as LegendTokens;
}
