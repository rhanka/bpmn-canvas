import type { LegendTokens, ProfileDefinition } from "../../internal/contracts.js";

/** Placeholder until the renderer lands: behaves like the standard profile. */
export function coloredProfile(_tokens?: Partial<LegendTokens>): ProfileDefinition {
  return { id: "colored", modelerModules: [], viewerModules: [] };
}
