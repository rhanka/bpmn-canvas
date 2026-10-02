// Classic page script: uses the global set by the IIFE bundle loaded from the CDN origin.
import("./proof.js").then(({ runProof }) => { window.__proof = runProof(window.BpmnCanvas, "iife"); });
