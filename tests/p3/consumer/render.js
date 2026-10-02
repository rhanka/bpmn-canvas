// Static render and Draw.io import validation only: the editing engine (Modeler) must not be fetched.
import { renderDiagrams } from "@sentropic/bpmn-canvas";
import { importDiagram } from "@sentropic/bpmn-canvas/io";

const xml = await (await fetch("./corpus/ce5-two-diagrams-shared-root.bpmn")).text();
const result = await renderDiagrams(xml, { profile: "colored", coloredTokens: { taskFill: "#aabbcc" } });
const imported = await importDiagram(xml);
window.renderTest = { diagrams: result.diagrams.map((d) => [d.id, d.width, d.height]), diagnostics: result.diagnostics.map((d) => d.code), importedSame: imported.xml === xml };
window.__ready = true;
