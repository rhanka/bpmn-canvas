import type { LegendTokens } from "../../internal/contracts.js";
import { shade } from "./style.js";

/** Neutral defaults. Hosts supply their own look through `legendProfile(tokens)`. */
export const DEFAULT_LEGEND_TOKENS: LegendTokens = Object.freeze({
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

const LINE_KEYS = ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"] as const;

/** Defaults, then the host's `stroke`/`fill` conveniences, then the host's explicit per-type values. */
export function resolveLegendTokens(overrides?: Partial<LegendTokens>): LegendTokens {
  const given: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides ?? {})) if (value !== undefined) given[key] = value;
  const out: Record<string, unknown> = { ...DEFAULT_LEGEND_TOKENS };
  if (typeof given["stroke"] === "string") for (const key of LINE_KEYS) out[key] = given["stroke"];
  if (typeof given["fill"] === "string") out["taskFill"] = given["fill"];
  Object.assign(out, given);
  // `[Doc]` links follow the plain links and the lane header follows the lane unless the host names them.
  if (given["docLink"] === undefined) out["docLink"] = out["link"];
  if (given["laneHeaderFill"] === undefined) out["laneHeaderFill"] = out["laneFill"];
  // The gradient end is derived from the start tone unless the host names it.
  if (given["taskFillEnd"] === undefined && typeof out["taskFill"] === "string" && out["taskFill"] !== DEFAULT_LEGEND_TOKENS.taskFill) {
    out["taskFillEnd"] = shade(out["taskFill"], 0.95);
  }
  return out as unknown as LegendTokens;
}
