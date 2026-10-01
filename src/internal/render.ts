import type { Diagnostic, RenderOptions, RenderResult, RenderedDiagram } from "../types.js";
import { abortError } from "./canvas.js";
import { analyzeDefinitions, classifyWarnings, hasXmlComment } from "./diagnostics.js";
import { diagramName, loadEngine, loadProfile, newInstanceId, profileConfig } from "./engine.js";
import type { ModdleLike } from "./engine.js";

/**
 * Static render: one SVG per BPMNDiagram, with a diagnostic for every diagram not returned.
 * Uses the Viewer only, never the Modeler.
 */
export async function renderDiagrams(xml: string, options: RenderOptions = {}): Promise<RenderResult> {
  if (typeof document === "undefined") throw new Error("renderDiagrams needs a browser DOM");
  const { signal } = options;
  const check = (): void => {
    if (signal?.aborted) throw abortError();
  };
  check();
  const minSize = options.minSize ?? 20;
  const [engine, profile] = await Promise.all([loadEngine(), loadProfile(options.profile ?? "standard")]);
  check();

  const diagnostics: Diagnostic[] = [];
  const diagrams: RenderedDiagram[] = [];
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-20000px;top:0;width:1600px;height:1200px";
  document.body.appendChild(host);
  const viewer = new engine.Viewer({
    container: host,
    additionalModules: [...profile.viewerModules],
    bpmnCanvas: profileConfig(newInstanceId(), profile),
  });
  try {
    if (hasXmlComment(xml)) diagnostics.push({ code: "comments-present", severity: "info", message: "XML comments are ignored by the render." });
    let defs;
    try {
      const parsed = await viewer.get<ModdleLike>("moddle").fromXML(xml);
      defs = parsed.rootElement;
      diagnostics.push(...classifyWarnings(parsed.warnings).map((d) => ({ ...d, severity: "info" as const })), ...analyzeDefinitions(defs));
    } catch (error) {
      diagnostics.push({ code: "invalid-xml", severity: "error", message: String((error as Error)?.message ?? error).split("\n")[0] ?? "invalid XML" });
      return { diagrams, diagnostics };
    }
    const list = defs.diagrams ?? [];
    if (list.length === 0) return { diagrams, diagnostics };

    for (const d of list) {
      check();
      try {
        await viewer.importXML(xml, d.id);
        const { svg } = await viewer.saveSVG();
        const box = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 0 0").split(/\s+/).map(Number);
        const width = box[2] ?? 0;
        const height = box[3] ?? 0;
        if (width > minSize && height > minSize) {
          diagrams.push({ id: d.id, name: diagramName(d), svg, width, height });
        } else {
          diagnostics.push({ code: "filtered-small", severity: "warning", diagramId: d.id, message: `Diagram "${d.id}" is ${width}x${height}px, not larger than ${minSize}px, and was not returned.` });
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        diagnostics.push({ code: "render-failed", severity: "error", diagramId: d.id, message: String((error as Error)?.message ?? error).split("\n")[0] ?? "render failed" });
      }
    }
    return { diagrams, diagnostics };
  } finally {
    viewer.destroy();
    host.remove();
  }
}
