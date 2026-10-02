// Injected into the IIFE build only. Captured while the script tag runs, so the bundle resolves
// its fonts and images next to itself (e.g. on a CDN), as the ESM build does with import.meta.url.
// Inlined (no src, e.g. in an iframe srcdoc) it falls back to the document base URL: pass assetBase then.
export const __bpmnCanvasScriptUrl =
  (typeof document !== "undefined" && document.currentScript && document.currentScript.src) ||
  (typeof document !== "undefined" ? document.baseURI : "");
