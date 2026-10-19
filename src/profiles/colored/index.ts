import type { LegendTokens, ProfileDefinition } from "../../internal/contracts.js";
import type { BusinessPolicy } from "../../internal/business-policy.js";
import { ProfileContractError } from "../../profile/canonical.js";
import { resolveColoredTokens, hasTokens, namedColoredTokens } from "./tokens.js";
import { ColoredRendererModule } from "./renderer.js";
export function coloredProfile(tokens?: Partial<LegendTokens>, businessPolicy?: BusinessPolicy): ProfileDefinition {
  const look = businessPolicy?.presentation?.looks?.find((look: any) => look.renderer === "recolor");
  if (!businessPolicy || !look) throw new ProfileContractError("profile-resource-missing");

  if (!hasTokens(tokens)) return { id: look.alias, modelerModules: [], viewerModules: [] };
  const modules = [ColoredRendererModule];
  return {
    id: look.alias,
    businessPolicy,
    renderer: look.renderer,
    modelerModules: modules,
    viewerModules: modules,
    tokens: resolveColoredTokens(tokens, look.tokens),
    named: namedColoredTokens(tokens),
  };
}
