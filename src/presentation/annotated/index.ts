import type { AnnotatedTokens, ProfileDefinition } from "../../internal/contracts.js";
import type { BusinessPolicy } from "../../internal/business-policy.js";
import { ProfileContractError } from "../../profile/canonical.js";
import { resolveLegendTokens } from "./tokens.js";
import { AnnotatedRendererModule, AnnotatedFollowModule } from "./renderer.js";
import { AnnotatedPaletteModule } from "./palette.js";
export function annotatedProfile(tokens?: Partial<AnnotatedTokens>, businessPolicy?: BusinessPolicy): ProfileDefinition {
  const look = businessPolicy?.presentation?.looks?.find((look: any) => look.renderer === "annotated");
  if (!businessPolicy || !look) throw new ProfileContractError("profile-resource-missing");

  return {
    id: look.alias,
    businessPolicy,
    renderer: look.renderer,
    modelerModules: [AnnotatedRendererModule, AnnotatedFollowModule, AnnotatedPaletteModule],
    viewerModules: [AnnotatedRendererModule],
    tokens: resolveLegendTokens(tokens, look.tokens),
  };
}
