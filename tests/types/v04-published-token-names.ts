import type { AnnotatedTokens, BpmnCanvasOptions, LegendTokens, RenderOptions } from "../../src/index.js";
// Published look-token names stay as aliases (LX-TH-1 / LX-TH-2 per ruling).
const legacyTokens: LegendTokens = {} as AnnotatedTokens;
const aliased: AnnotatedTokens = {} as LegendTokens;
const canvasWithLegacy: BpmnCanvasOptions = { legendTokens: legacyTokens, coloredTokens: legacyTokens };
const renderWithLegacy: RenderOptions = { legendTokens: legacyTokens, coloredTokens: legacyTokens };
void [legacyTokens, aliased, canvasWithLegacy, renderWithLegacy];
