// ESM page script (same origin as the page): imports ONLY the minified bundle from the CDN origin.
import * as BpmnCanvas from "__CDN__/dist/browser/bpmn-canvas.min.js";
import { runProof } from "./proof.js";
window.__proof = runProof(BpmnCanvas, "esm");
