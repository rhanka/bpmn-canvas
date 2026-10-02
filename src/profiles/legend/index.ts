import type { LegendTokens, ProfileDefinition } from "../../internal/contracts.js";
import { LEGEND_ACTION_IDS, LegendPaletteModule } from "./palette.js";
import { LegendFollowModule, LegendRendererModule } from "./renderer.js";
import { DEFAULT_LEGEND_TOKENS, resolveLegendTokens } from "./tokens.js";

export { DEFAULT_LEGEND_TOKENS, LEGEND_ACTION_IDS, resolveLegendTokens };
export type { LegendTokens };

/**
 * The opt-in `legend` profile. Draw only what it draws faithfully, leave the
 * rest to upstream bpmn-js. Core injects `tokens` as `config.bpmnCanvas.legend`.
 */
export function legendProfile(tokens?: Partial<LegendTokens>): ProfileDefinition {
  return {
    id: "legend",
    modelerModules: [LegendRendererModule, LegendFollowModule, LegendPaletteModule],
    viewerModules: [LegendRendererModule],
    tokens: resolveLegendTokens(tokens),
  };
}
