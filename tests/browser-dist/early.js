// Loaded first: records every CSP violation of the page.
window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ""}:${e.lineNumber || ""}`));
// Sizes through the CSSOM: a strict CSP blocks style attributes written in the markup.
document.addEventListener("DOMContentLoaded", () => {
  for (const [id, w, h] of [["canvas", 900, 420], ["canvas2", 500, 260]]) Object.assign(document.getElementById(id).style, { width: w + "px", height: h + "px", position: "relative" });
});
