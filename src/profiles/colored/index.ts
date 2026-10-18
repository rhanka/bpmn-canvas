import type { LegendTokens, ProfileDefinition } from "../../internal/contracts.js";
import { ColoredRendererModule } from "./renderer.js";
import { DEFAULT_COLORED_TOKENS, hasTokens, namedColoredTokens, resolveColoredTokens } from "./tokens.js";

export { DEFAULT_COLORED_TOKENS, resolveColoredTokens };

/**
 * The `colored` profile: upstream notation, recoloured per kind from tokens. Without any token the profile adds no
 * module at all, so it draws exactly like `standard`. With `drawing: "classic"` the shapes are drawn flat in the
 * profile's colours (classic.ts). Core injects the tokens as `config.bpmnCanvas.colored`.
 */
export function coloredProfile(tokens?: Partial<LegendTokens>): ProfileDefinition {
  if (!hasTokens(tokens)) return { id: "colored", modelerModules: [], viewerModules: [] };
  const modules = [ColoredRendererModule];
  return {
    id: "colored",
    modelerModules: modules,
    viewerModules: modules,
    tokens: resolveColoredTokens(tokens),
    named: namedColoredTokens(tokens),
  };
}
