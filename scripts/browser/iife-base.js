// Injected into the IIFE build only. Captured while the script tag runs, so the bundle resolves
// its fonts and images next to itself (e.g. on a CDN), as the ESM build does with import.meta.url.
export const __bpmnCanvasScriptUrl =
  (typeof document !== "undefined" && document.currentScript && document.currentScript.src) ||
  (typeof location !== "undefined" ? location.href : "");
