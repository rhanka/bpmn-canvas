import type { AnnotatedTokens, BpmnCanvasOptions, RenderOptions } from "../types.js";

/** Published look-token options stay as aliases: new names first, then the old published names. */
export function tokensFromOptions(options: BpmnCanvasOptions | RenderOptions): Partial<AnnotatedTokens> | undefined {
  return (
    options.tokens ??
    options.recolorTokens ??
    options.annotatedTokens ??
    options.coloredTokens ??
    options.legendTokens
  );
}
