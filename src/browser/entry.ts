/**
 * Entry of the browser build (dist/browser/bpmn-canvas.min.js and bpmn-canvas.iife.min.js):
 * the framework-free API in one file with its runtime dependencies, for a CDN or a script tag.
 * The React and assistant-ui adapters are not part of it.
 */
export * from "../index.js";
export { DEFAULT_LEGEND_TOKENS, LEGEND_ACTION_IDS, resolveLegendTokens } from "../profiles/legend/index.js";
export { DEFAULT_COLORED_TOKENS, resolveColoredTokens } from "../profiles/colored/index.js";
export * from "../layout/index.js";
export * from "../io/index.js";
