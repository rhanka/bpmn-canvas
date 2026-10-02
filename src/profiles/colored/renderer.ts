/**
 * Upstream bpmn-js notation, recoloured per element kind from tokens.
 *
 * The upstream renderer draws every element (shapes, inner decorations, markers); this renderer only tells it
 * which `fill` and `stroke` to use, then sets the text colour. No geometry is touched, so the notation is exactly
 * upstream's. Colours the user set on an element (BPMN-in-Color) keep priority over the tokens. The upstream renderer
 * creates its markers with ids unique to this instance, so two instances never share a marker.
 */
import BaseRenderer from "diagram-js/lib/draw/BaseRenderer.js";
import { getDi, is } from "bpmn-js/lib/util/ModelUtil.js";
import { attr as svgAttr, select as svgSelect, selectAll as svgSelectAll } from "tiny-svg";

import type { BpmnCanvasConfig, LegendTokens } from "../../internal/contracts.js";
import { resolveColoredTokens } from "./tokens.js";

type Any = any; // diagram-js and bpmn-js services are untyped here, as in the legend profile.

const RENDER_PRIORITY = 1500;

export type ColoredKind = "task" | "event" | "gateway" | "pool" | "lane" | "external" | "doc" | "data" | "app" | "annotation" | "flow" | "link" | "label";

interface Colours {
  fill?: string;
  stroke?: string;
}

const isDocument = (text: unknown): boolean => /^\s*\[Doc\]/.test(typeof text === "string" ? text : "");
const isApplication = (text: unknown): boolean => /^\s*\[App\]/.test(typeof text === "string" ? text : "");

/** Kind of a diagram-js element for colouring, or undefined when the upstream colours stay. */
export function coloredKind(element: Any): ColoredKind | undefined {
  if (!element?.businessObject) return undefined;
  if (element.labelTarget) return "label";
  if (is(element, "bpmn:Participant")) return "pool";
  if (is(element, "bpmn:Lane")) return "lane";
  if (is(element, "bpmn:Event")) return "event";
  if (is(element, "bpmn:Gateway")) return "gateway";
  if (is(element, "bpmn:CallActivity")) return "external";
  if (is(element, "bpmn:Activity")) return "task";
  if (is(element, "bpmn:DataInput") || is(element, "bpmn:DataOutput")) return "external";
  if (is(element, "bpmn:DataObjectReference") || is(element, "bpmn:DataStoreReference") || is(element, "bpmn:DataObject")) return "data";
  if (is(element, "bpmn:TextAnnotation")) {
    const text = element.businessObject.text;
    return isDocument(text) ? "doc" : isApplication(text) ? "app" : "annotation";
  }
  if (is(element, "bpmn:SequenceFlow") || is(element, "bpmn:MessageFlow")) return "flow";
  if (is(element, "bpmn:Association") || is(element, "bpmn:DataAssociation")) return "link";
  return undefined;
}

/** Colours the user set on the element itself win over the tokens. */
function userColour(element: Any, what: "fill" | "stroke" | "label"): boolean {
  try {
    const di = getDi(element);
    if (what === "fill") return !!(di.get("color:background-color") || di.get("bioc:fill"));
    if (what === "stroke") return !!(di.get("color:border-color") || di.get("bioc:stroke"));
    return !!di.get("label")?.get("color:color");
  } catch {
    return false;
  }
}

/** The token behind the fill and the stroke of each kind, to leave the upstream colour when it was not named. */
const TOKENS_OF: Partial<Record<ColoredKind, { fill?: keyof LegendTokens; stroke?: keyof LegendTokens }>> = {
  task: { fill: "taskFill", stroke: "taskLine" },
  event: { fill: "eventFill", stroke: "eventLine" },
  gateway: { fill: "gatewayFill", stroke: "gatewayLine" },
  pool: { fill: "poolFill", stroke: "poolLine" },
  lane: { fill: "laneFill", stroke: "laneLine" },
  external: { fill: "externalFill", stroke: "externalLine" },
  doc: { stroke: "docLine" },
  app: { stroke: "appLine" },
  data: { fill: "dataFill", stroke: "dataLine" },
  annotation: { stroke: "stroke" },
  flow: { stroke: "flow" },
  link: { stroke: "link" },
};

export class ColoredRenderer extends BaseRenderer {
  static $inject = ["eventBus", "bpmnRenderer", "config.bpmnCanvas"];

  private readonly upstream: Any;
  private readonly tokens: LegendTokens;
  private readonly named: ReadonlySet<string> | undefined;

  constructor(eventBus: Any, bpmnRenderer: Any, config: BpmnCanvasConfig | undefined) {
    super(eventBus, RENDER_PRIORITY);
    this.upstream = bpmnRenderer;
    this.tokens = config?.colored ?? resolveColoredTokens();
    this.named = config?.coloredNamed ? new Set(config.coloredNamed) : undefined;
  }

  override canRender(element: Any): boolean {
    return !!element?.businessObject && is(element, "bpmn:BaseElement");
  }

  private isNamed(token: keyof LegendTokens): boolean {
    return this.named === undefined || this.named.has(token);
  }

  private coloursOf(kind: ColoredKind | undefined, element: Any): Colours {
    const t = this.tokens;
    let colours: Colours;
    switch (kind) {
      case "task": colours = { stroke: t.taskLine, fill: t.taskFill }; break;
      case "event": colours = { stroke: t.eventLine, fill: t.eventFill }; break;
      case "gateway": colours = { stroke: t.gatewayLine, fill: t.gatewayFill }; break;
      case "pool": colours = { stroke: t.poolLine, fill: t.poolFill }; break;
      case "lane": colours = { stroke: t.laneLine, fill: t.laneFill }; break;
      case "external": colours = { stroke: t.externalLine, fill: t.externalFill }; break;
      case "doc": colours = { stroke: t.docLine }; break;
      case "app": colours = { stroke: t.appLine }; break;
      case "data": colours = { stroke: t.dataLine, fill: t.dataFill }; break;
      case "annotation": colours = { stroke: t.stroke }; break;
      case "flow": colours = { stroke: t.flow }; break;
      case "link": colours = { stroke: t.link }; break;
      default: colours = {};
    }
    const used = TOKENS_OF[kind ?? "label"];
    if (used) {
      if (used.fill && !this.isNamed(used.fill)) delete colours.fill;
      if (used.stroke && !this.isNamed(used.stroke)) delete colours.stroke;
    }
    if (colours.fill !== undefined && userColour(element, "fill")) delete colours.fill;
    if (colours.stroke !== undefined && userColour(element, "stroke")) delete colours.stroke;
    return colours;
  }

  /** Text colour, and the background of [Doc]/[App] annotations (the upstream annotation draws none). */
  private finish(visuals: Any, element: Any, kind: ColoredKind | undefined): void {
    if (!kind || kind === "flow" || kind === "link") return;
    const t = this.tokens;
    const textToken = kind === "pool" || kind === "lane" ? "headerText" : kind === "label" ? "labelText" : "text";
    if (this.isNamed(textToken) && !userColour(element, "label")) {
      const colour = t[textToken];
      for (const text of svgSelectAll(visuals, "text") as SVGElement[]) {
        svgAttr(text, { fill: colour });
        for (const span of svgSelectAll(text, "tspan") as SVGElement[]) if (span.style.fill) svgAttr(span, { fill: colour });
      }
    }
    if ((kind === "doc" || kind === "app") && this.isNamed(kind === "doc" ? "docFill" : "appFill") && !userColour(element, "fill")) {
      const box = svgSelect(visuals, "rect") as SVGElement | null;
      if (box) svgAttr(box, { fill: kind === "doc" ? t.docFill : t.appFill });
    }
  }

  override drawShape(visuals: Any, element: Any, attrs: Any = {}): SVGElement {
    const kind = coloredKind(element);
    const drawn = this.upstream.drawShape(visuals, element, { ...this.coloursOf(kind, element), ...attrs });
    this.finish(visuals, element, kind);
    return drawn;
  }

  override drawConnection(visuals: Any, connection: Any, attrs: Any = {}): SVGElement {
    const kind = coloredKind(connection);
    return this.upstream.drawConnection(visuals, connection, { ...this.coloursOf(kind, connection), ...attrs });
  }
}

/** Safe in a render-only Viewer: it only draws. */
export const ColoredRendererModule = {
  __init__: ["coloredRenderer"],
  coloredRenderer: ["type", ColoredRenderer],
};
