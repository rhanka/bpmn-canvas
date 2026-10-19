import type { LegendTokens, ProfileDefinition } from "../../internal/contracts.js";
import type { BusinessPolicy } from "../../internal/business-policy.js";
import { ProfileContractError } from "../../profile/canonical.js";
import { resolveLegendTokens } from "./tokens.js";
import { LegendRendererModule, LegendFollowModule } from "./renderer.js";
import { LegendPaletteModule } from "./palette.js";
export function legendProfile(tokens?: Partial<LegendTokens>, businessPolicy?: BusinessPolicy): ProfileDefinition {
  const look = businessPolicy?.presentation?.looks?.find((look: any) => look.renderer === "annotated");
  if (!businessPolicy || !look) throw new ProfileContractError("profile-resource-missing");

  return {
    id: look.alias,
    businessPolicy,
    renderer: look.renderer,
    modelerModules: [LegendRendererModule, LegendFollowModule, LegendPaletteModule],
    viewerModules: [LegendRendererModule],
    tokens: resolveLegendTokens(tokens, look.tokens),
  };
}
