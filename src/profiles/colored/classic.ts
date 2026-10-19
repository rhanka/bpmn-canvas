/**
 * `drawing: "classic"` of the `colored` profile: flat shapes in the profile's colours (rounded activities with a
 * 1.4 line, a thick end ring with an inner dot, a flat gateway with a bold marker, data pages, open-bracket
 * annotations, pools and lanes with a header line), each label inside its shape. Connections and external labels
 * stay with the upstream renderer (recoloured by the profile). Colours the user set on an element keep priority.
 */
import BaseRenderer from "diagram-js/lib/draw/BaseRenderer.js";
import { is } from "bpmn-js/lib/util/ModelUtil.js";
import { getFillColor, getLabelColor, getStrokeColor } from "bpmn-js/lib/draw/BpmnRenderUtil.js";
import { append as svgAppend, attr as svgAttr, classes as svgClasses, create as svgCreate } from "tiny-svg";

import type { BpmnCanvasConfig, LegendTokens } from "../../internal/contracts.js";
import { appsOf } from "../legend/renderer.js";
import { APP_BOX, contrastText } from "../legend/style.js";
import { resolveColoredTokens } from "./tokens.js";

type Any = any; // diagram-js and bpmn-js services are untyped here, as in the other profiles.

const RENDER_PRIORITY = 1600;
const WHITE = "#ffffff";

type Kind = "task" | "subprocess" | "external" | "event" | "gateway" | "input" | "output" | "data" | "document" | "application" | "lane" | "pool";

function kindOf(element: Any): Kind | undefined {
  const bo = element?.businessObject;
  if (!bo || element.labelTarget || element.waypoints) return undefined;
  if (is(element, "bpmn:TextAnnotation")) return /^\s*\[Reference\]/.test(typeof bo.text === "string" ? bo.text : "") ? "document" : "application";
  if (is(element, "bpmn:Participant")) return "pool";
  if (is(element, "bpmn:Lane")) return "lane";
  if (is(element, "bpmn:StartEvent") || is(element, "bpmn:EndEvent") || is(element, "bpmn:IntermediateThrowEvent") || is(element, "bpmn:IntermediateCatchEvent")) return "event";
  if (is(element, "bpmn:ExclusiveGateway") || is(element, "bpmn:ParallelGateway") || is(element, "bpmn:InclusiveGateway")) return "gateway";
  if (is(element, "bpmn:CallActivity")) return "external";
  if (is(element, "bpmn:SubProcess")) return "subprocess";
  if (is(element, "bpmn:DataInput")) return "input";
  if (is(element, "bpmn:DataOutput")) return "output";
  if (is(element, "bpmn:DataObjectReference") || is(element, "bpmn:DataObject")) return "data";
  if (is(element, "bpmn:Task")) return "task";
  return undefined;
}

function colours(kind: Kind, t: LegendTokens): { fill: string; stroke: string } {
  switch (kind) {
    case "event": return { fill: t.eventFill, stroke: t.eventLine };
    case "gateway": return { fill: t.gatewayFill, stroke: t.gatewayLine };
    case "external":
    case "input":
    case "output": return { fill: t.externalFill, stroke: t.externalLine };
    case "subprocess":
    case "task": return { fill: t.taskFill, stroke: t.taskLine };
    case "data": return { fill: t.dataFill, stroke: t.dataLine };
    case "document": return { fill: t.docFill, stroke: t.docLine };
    case "application": return { fill: t.appFill, stroke: t.appLine };
    case "lane": return { fill: t.laneFill, stroke: t.laneLine };
    case "pool": return { fill: t.poolFill, stroke: t.poolLine };
  }
}

export class ClassicRenderer extends BaseRenderer {
  static $inject = ["eventBus", "textRenderer", "config.bpmnCanvas"];

  private readonly textRenderer: Any;
  private readonly tokens: LegendTokens;

  constructor(eventBus: Any, textRenderer: Any, config: BpmnCanvasConfig | undefined) {
    super(eventBus, RENDER_PRIORITY);
    this.textRenderer = textRenderer;
    this.tokens = config?.colored ?? resolveColoredTokens();
  }

  override canRender(element: Any): boolean {
    return kindOf(element) !== undefined;
  }

  override drawShape(parentGfx: Any, element: Any): SVGElement {
    const gfx = svgCreate("g");
    svgAppend(parentGfx, gfx);
    const kind = kindOf(element)!;
    const defaults = colours(kind, this.tokens);
    const fill = getFillColor(element, defaults.fill);
    const stroke = getStrokeColor(element, defaults.stroke);
    const w: number = element.width;
    const h: number = element.height;
    switch (kind) {
      case "task":
      case "subprocess":
      case "external": {
        const call = kind === "external";
        const rect = svgCreate("rect");
        svgAttr(rect, { x: 0, y: 0, width: w, height: h, rx: 9, fill, stroke, "stroke-width": call ? 3.5 : 1.4 });
        svgAppend(gfx, rect);
        if (kind === "subprocess" || call) this.subprocessMarker(gfx, w, h, stroke, appsOf(element).length ? APP_BOX.overlap : 0);
        this.embeddedLabel(gfx, element, kind, w, h, 12, fill, stroke);
        break;
      }
      case "event": {
        const r = Math.min(w, h) / 2;
        const end = is(element, "bpmn:EndEvent");
        const circle = svgCreate("circle");
        svgAttr(circle, { cx: w / 2, cy: h / 2, r, fill, stroke, "stroke-width": end ? 4 : 1.5 });
        svgAppend(gfx, circle);
        if (end) {
          const dot = svgCreate("circle");
          svgAttr(dot, { cx: w / 2, cy: h / 2, r: Math.max(1, r - 7), fill: stroke });
          svgAppend(gfx, dot);
        }
        break;
      }
      case "gateway": {
        const diamond = svgCreate("path");
        svgAttr(diamond, { d: `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`, fill, stroke, "stroke-width": 1.4 });
        svgAppend(gfx, diamond);
        const cx = w / 2;
        const cy = h / 2;
        const mark = svgCreate("path");
        svgAttr(mark, {
          d: is(element, "bpmn:ParallelGateway") ? `M${cx - 10} ${cy}h20M${cx} ${cy - 10}v20` : `M${cx - 8} ${cy - 8}l16 16M${cx + 8} ${cy - 8}l-16 16`,
          stroke: contrastText(fill, this.tokens.text, WHITE),
          "stroke-width": 4,
          "stroke-linecap": "round",
        });
        svgAppend(gfx, mark);
        break;
      }
      case "input":
      case "output":
      case "data": {
        const dog = Math.round(Math.min(w, h) * 0.2);
        const page = svgCreate("path");
        svgAttr(page, { d: `M0 0h${w - dog}l${dog} ${dog}v${h - dog}h-${w}Z`, fill, stroke, "stroke-width": 1 });
        svgAppend(gfx, page);
        const fold = svgCreate("path");
        svgAttr(fold, { d: `M${w - dog} 0v${dog}h${dog}`, fill: "none", stroke, "stroke-width": 1 });
        svgAppend(gfx, fold);
        this.embeddedLabel(gfx, element, kind, w, h, 10.5, fill, stroke);
        break;
      }
      case "document":
      case "application": {
        const bracket = svgCreate("path");
        svgAttr(bracket, { d: `M20 0 L0 0 L0 ${h} L20 ${h}`, fill: "none", stroke, "stroke-width": 1.4 });
        svgAppend(gfx, bracket);
        const text = this.textRenderer.createText((element.businessObject?.text as string) || "", {
          box: { width: Math.max(10, w - 8), height: h },
          align: "left-middle",
          padding: 6,
          style: { fill: getLabelColor(element, contrastText(fill, this.tokens.text, WHITE), stroke), fontSize: 11 },
        });
        svgAttr(text, { transform: "translate(6 0)" });
        svgClasses(text).add("djs-label");
        svgAppend(gfx, text);
        break;
      }
      case "lane":
      case "pool": {
        const rect = svgCreate("rect");
        svgAttr(rect, { x: 0, y: 0, width: w, height: h, fill, stroke, "stroke-width": 1.4 });
        svgAppend(gfx, rect);
        const header = svgCreate("line");
        svgAttr(header, { x1: 30, y1: 0, x2: 30, y2: h, stroke, "stroke-width": 1.4 });
        svgAppend(gfx, header);
        const label = this.textRenderer.createText((element.businessObject?.name as string) || "", {
          box: { width: h, height: 30 },
          align: "center-middle",
          padding: 8,
          style: { fill: getLabelColor(element, contrastText(fill, this.tokens.text, WHITE), stroke), fontSize: kind === "pool" ? 14 : 12.5, fontWeight: 700 },
        });
        svgAttr(label, { transform: `translate(0 ${h}) rotate(-90)` });
        svgClasses(label).add("djs-label");
        svgAppend(gfx, label);
        break;
      }
    }
    return gfx as unknown as SVGElement;
  }

  override getShapePath(element: Any): string {
    const kind = kindOf(element);
    const w: number = element.width;
    const h: number = element.height;
    if (kind === "event") {
      const r = Math.min(w, h) / 2;
      return `M${w / 2 - r} ${h / 2}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    if (kind === "gateway") return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
    return `M0 0h${w}v${h}h-${w}Z`;
  }

  /** The [+] marker, kept above the application band when the activity has one. */
  private subprocessMarker(gfx: Any, w: number, h: number, stroke: string, band: number): void {
    h -= band;
    const group = svgCreate("g");
    svgClasses(group).add("classic-marker");
    svgAttr(group, { "data-marker": "sub-process", "pointer-events": "all" });
    const box = svgCreate("rect");
    svgAttr(box, { x: w / 2 - 7, y: h - 18, width: 14, height: 14, fill: "transparent", stroke, "stroke-width": 1.2, "pointer-events": "all" });
    svgAppend(group, box);
    const plus = svgCreate("path");
    svgAttr(plus, { d: `M${w / 2 - 4} ${h - 11}h8M${w / 2} ${h - 15}v8`, stroke, "stroke-width": 1.2, "pointer-events": "all" });
    svgAppend(group, plus);
    svgAppend(gfx, group);
  }

  private embeddedLabel(gfx: Any, element: Any, kind: Kind, w: number, h: number, fontSize: number, fill: string, stroke: string): void {
    const bo = element.businessObject;
    const name = (kind === "document" || kind === "application") && typeof bo?.text === "string"
      ? bo.text.replace(/^\s*\[(Reference|Component)\]\s*/, "")
      : (bo?.name as string) || "";
    const text = this.textRenderer.createText(name, {
      box: { width: w - 12, height: h, x: w / 2 - (w - 12) / 2, y: 0 },
      align: "center-middle",
      padding: 7,
      style: { fill: getLabelColor(element, contrastText(fill, this.tokens.text, WHITE), stroke), fontSize },
    });
    svgClasses(text).add("djs-label");
    svgAppend(gfx, text);
  }
}

export const ClassicRendererModule = {
  __init__: ["classicRenderer"],
  classicRenderer: ["type", ClassicRenderer],
};
