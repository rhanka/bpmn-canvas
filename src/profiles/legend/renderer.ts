// `legend` renderer for bpmn-js. Display only: the BPMN XML is never written by it.
// Adapted from an internal implementation of a draw.io-reference look.
//
// An "[App] X" text annotation associated to an activity is drawn as an
// application component box under that activity (part of the activity's
// graphics, so it moves and selects with it); the annotation and its
// association are hidden (display="none"). BPMN-in-Color attributes always win
// over the token defaults.
//
// The renderer draws only what `legendKind` / `legendConnectionKind` accept.
// Everything else falls through to the upstream bpmn-js renderer.

import BaseRenderer from "diagram-js/lib/draw/BaseRenderer.js";
import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor.js";
import { getDi, is } from "bpmn-js/lib/util/ModelUtil.js";
import { isExpanded, isHorizontal } from "bpmn-js/lib/util/DiUtil.js";
import { getFillColor, getLabelColor, getStrokeColor } from "bpmn-js/lib/draw/BpmnRenderUtil.js";
import { append as svgAppend, attr as svgAttr, classes as svgClasses, create as svgCreate } from "tiny-svg";

import type { BpmnCanvasConfig, LegendTokens } from "../../internal/contracts.js";
import {
  annotationName,
  APP_BOX,
  appBoxes,
  contrastText,
  DOC,
  documentPath,
  documentTextRect,
  isAppAnnotation,
  LANE_HEADER,
  legendConnectionKind,
  legendKind,
  POOL_STRIP,
  shade,
  waypointsPath,
  type LegendBoLike,
  type LegendShapeKind,
} from "./style.js";
import { DEFAULT_LEGEND_TOKENS, resolveLegendTokens } from "./tokens.js";

const RENDER_PRIORITY = 1500;
/** Sentinel default: tells "no BPMN-in-Color fill set" apart from a colour. */
const NO_COLOUR = "legend-no-colour";

// diagram-js services and elements are structurally typed here: the package
// does not freeze bpmn-js internals in its own types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface DiagramElement {
  id?: string;
  type?: string;
  businessObject?: Any;
  x?: number;
  y?: number;
  width: number;
  height: number;
  label?: unknown;
  waypoints?: Array<{ x: number; y: number }>;
  source?: DiagramElement;
  target?: DiagramElement;
  incoming?: DiagramElement[];
  outgoing?: DiagramElement[];
  parent?: DiagramElement;
  hidden?: boolean;
}

// --- model helpers ------------------------------------------------------------

function isAppShape(el: DiagramElement | undefined): boolean {
  const bo = el?.businessObject;
  return Boolean(bo) && bo.$type === "bpmn:TextAnnotation" && isAppAnnotation(typeof bo.text === "string" ? bo.text : "");
}

function isActivity(el: DiagramElement | undefined): boolean {
  return Boolean(el?.businessObject) && is(el as object, "bpmn:Activity");
}

/** Other ends of the bpmn:Association connections of an element. */
function associated(el: DiagramElement): DiagramElement[] {
  const out: DiagramElement[] = [];
  for (const c of [...(el.incoming ?? []), ...(el.outgoing ?? [])]) {
    if (c.type !== "bpmn:Association") continue;
    const other = c.source === el ? c.target : c.source;
    if (other) out.push(other);
  }
  return out;
}

/** [App] annotations associated to this activity (none for other types). */
export function appsOf(host: DiagramElement): DiagramElement[] {
  if (!isActivity(host)) return [];
  return associated(host).filter(isAppShape);
}

/** An [App] annotation linked to at least one activity. */
export function isLinkedApp(el: DiagramElement | undefined): boolean {
  return Boolean(el) && isAppShape(el) && associated(el as DiagramElement).some(isActivity);
}

/** Elements the legend hides: linked [App] annotations and their links. */
export function isHiddenInLegend(el: DiagramElement): boolean {
  if (el.waypoints) {
    return (
      el.type === "bpmn:Association" &&
      ((isLinkedApp(el.source) && isActivity(el.target)) || (isLinkedApp(el.target) && isActivity(el.source)))
    );
  }
  return isLinkedApp(el);
}

function shapeKindOf(element: object): LegendShapeKind | undefined {
  const bo = (element as DiagramElement).businessObject as LegendBoLike | undefined;
  if (!bo) return undefined;
  const facts: { expanded?: boolean; horizontal?: boolean } = {};
  if (bo.$type === "bpmn:SubProcess" || bo.$type === "bpmn:Participant") {
    facts.expanded = Boolean(isExpanded(element as never, getDi(element as never)));
  }
  if (bo.$type === "bpmn:Participant" || bo.$type === "bpmn:Lane") {
    facts.horizontal = Boolean(isHorizontal(element as never));
  }
  return legendKind(bo, facts);
}

// --- renderer ------------------------------------------------------------------

export class LegendRenderer extends BaseRenderer {
  static $inject = ["eventBus", "textRenderer", "canvas", "config.bpmnCanvas"];

  private readonly textRenderer: Any;
  private readonly canvas: Any;
  private readonly instanceId: string;
  private readonly tokens: LegendTokens;

  constructor(eventBus: Any, textRenderer: Any, canvas: Any, config: BpmnCanvasConfig | undefined) {
    super(eventBus, RENDER_PRIORITY);
    this.textRenderer = textRenderer;
    this.canvas = canvas;
    this.instanceId = config?.instanceId ?? `legend-${Math.random().toString(36).slice(2, 8)}`;
    this.tokens = config?.legend ?? resolveLegendTokens();
  }

  private get arrowId(): string {
    return `${this.instanceId}-legend-arrow`;
  }

  private get gradientId(): string {
    return `${this.instanceId}-legend-task-gradient`;
  }

  override canRender(element: Any): boolean {
    const el = element as DiagramElement;
    // External labels are separate diagram-js elements: the upstream renderer draws them.
    if (el.type === "label" || !el.businessObject) return false;
    if (el.waypoints) return legendConnectionKind(el.businessObject) !== undefined;
    return shapeKindOf(element) !== undefined;
  }

  override drawConnection(parentGfx: Any, connection: Any): SVGElement {
    const el = connection as DiagramElement;
    const kind = legendConnectionKind(el.businessObject);
    const t = this.tokens;
    const path = svgCreate("path");
    if (kind === "sequence") {
      svgAttr(path, {
        d: waypointsPath(el.waypoints),
        fill: "none",
        stroke: getStrokeColor(el as never, t.stroke),
        "stroke-width": t.strokeWidth,
        "stroke-linejoin": "round",
        "marker-end": `url(#${this.arrowMarker(getStrokeColor(el as never, t.stroke))})`,
      });
      svgClasses(path).add("legend-flow");
    } else {
      // Associations. Data associations carry a direction, so they keep their arrow.
      const colour = getStrokeColor(el as never, t.stroke);
      svgAttr(path, {
        d: waypointsPath(el.waypoints),
        fill: "none",
        stroke: colour,
        "stroke-width": t.strokeWidth,
        "stroke-dasharray": "5 5",
        ...(kind === "data-link" ? { "marker-end": `url(#${this.arrowMarker(colour)})` } : {}),
      });
      svgClasses(path).add("legend-link");
    }
    svgAppend(parentGfx, path);
    return path as unknown as SVGElement;
  }

  override getConnectionPath(connection: Any): string {
    return waypointsPath((connection as DiagramElement).waypoints);
  }

  override drawShape(parentGfx: Any, shape: Any): SVGElement {
    const gfx = svgCreate("g");
    svgClasses(gfx).add("legend-shape");
    svgAppend(parentGfx, gfx);
    this.draw(gfx, shape as DiagramElement);
    return gfx as unknown as SVGElement;
  }

  private draw(gfx: Any, element: DiagramElement): void {
    const kind = shapeKindOf(element);
    if (!kind) return;
    const t = this.tokens;
    const defaultFill = this.defaultFill(kind);
    const custom = getFillColor(element as never, NO_COLOUR);
    const fill = custom === NO_COLOUR ? defaultFill : custom;
    const stroke = getStrokeColor(element as never, t.stroke);
    const sw = t.strokeWidth;
    const w = element.width;
    const h = element.height;

    switch (kind) {
      case "task":
      case "subprocess": {
        const rect = svgCreate("rect");
        const body = custom === NO_COLOUR ? `url(#${this.taskGradient()})` : fill;
        svgAttr(rect, { x: 0, y: 0, width: w, height: h, rx: 10, fill: body, stroke, "stroke-width": sw });
        svgClasses(rect).add("legend-task");
        svgAppend(gfx, rect);
        if (kind === "subprocess") this.subprocessMarker(gfx, w, h, stroke);
        this.label(gfx, element, fill, stroke, w, h);
        this.drawApps(gfx, element);
        break;
      }
      case "external": {
        const rect = svgCreate("rect");
        svgAttr(rect, { x: 0, y: 0, width: w, height: h, rx: 10, fill, stroke, "stroke-width": sw });
        svgAppend(gfx, rect);
        // Process icon (arrow, top-right).
        const icon = svgCreate("path");
        svgAttr(icon, {
          d: `M${w - 24} ${9}h9v-3l6 5l-6 5v-3h-9Z`,
          fill: "none",
          stroke,
          "stroke-width": sw,
          "pointer-events": "all",
          "data-marker": "process-icon",
        });
        svgClasses(icon).add("legend-process-icon");
        svgClasses(icon).add("legend-marker");
        svgAppend(gfx, icon);
        this.label(gfx, element, fill, stroke, w, h);
        this.drawApps(gfx, element);
        break;
      }
      case "event": {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) / 2;
        const end = is(element as object, "bpmn:EndEvent");
        const start = is(element as object, "bpmn:StartEvent");
        const circle = svgCreate("circle");
        svgAttr(circle, { cx, cy, r: end ? r - 1.5 : r, fill, stroke, "stroke-width": end ? 3 * sw : sw });
        svgAppend(gfx, circle);
        if (!end && !start) {
          const inner = svgCreate("circle");
          svgAttr(inner, { cx, cy, r: Math.max(1, r - 3), fill: "none", stroke, "stroke-width": sw });
          svgAppend(gfx, inner);
        }
        break;
      }
      case "gateway": {
        this.diamond(gfx, w, h, fill, stroke, sw);
        this.gatewayMarker(gfx, element, w, h, stroke);
        break;
      }
      case "data":
        this.dataPage(gfx, w, h, fill, stroke);
        break;
      case "input":
      case "output": {
        this.dataPage(gfx, w, h, fill, stroke);
        const arrow = svgCreate("path");
        svgAttr(arrow, {
          d: "M4 7h6v-3l6 5l-6 5v-3h-6Z",
          fill: kind === "output" ? stroke : "none",
          stroke,
          "stroke-width": 1.2,
        });
        svgClasses(arrow).add(kind === "output" ? "legend-output" : "legend-input");
        svgAppend(gfx, arrow);
        break;
      }
      case "document": {
        const body = svgCreate("path");
        svgAttr(body, { d: documentPath(w, h), fill, stroke, "stroke-width": sw });
        svgAppend(gfx, body);
        const bar = svgCreate("line");
        svgAttr(bar, { x1: 0, y1: DOC.band, x2: w, y2: DOC.band, stroke, "stroke-width": sw });
        svgAppend(gfx, bar);
        // Text between the band and the wave crest (the layout sized the height for it).
        const inner = documentTextRect(w, h);
        const docText = this.textRenderer.createText(annotationName(element.businessObject?.text), {
          box: { width: inner.width, height: inner.height },
          align: "center-top",
          padding: 0,
          style: {
            fill: getLabelColor(element as never, t.text, stroke),
            fontSize: Math.max(8, t.fontSize - 1),
            fontFamily: t.fontFamily,
            lineHeight: 1.2,
          },
        });
        svgAttr(docText, { transform: `translate(${inner.x} ${inner.y})` });
        svgClasses(docText).add("djs-label");
        svgAppend(gfx, docText);
        break;
      }
      case "application": {
        // Unlinked [App] annotation (linked ones are hidden and drawn under their activity).
        this.appBox(gfx, { name: annotationName(element.businessObject?.text), x: 0, y: 0, width: w, height: h }, fill, stroke);
        break;
      }
      case "lane": {
        const rect = svgCreate("rect");
        svgAttr(rect, { x: 0, y: 0, width: w, height: h, fill: "none", stroke, "stroke-width": sw });
        svgAppend(gfx, rect);
        const header = svgCreate("rect");
        svgAttr(header, { x: 0, y: 0, width: LANE_HEADER, height: h, fill, stroke, "stroke-width": sw });
        svgClasses(header).add("legend-lane-header");
        svgAppend(gfx, header);
        this.verticalHeader(gfx, element, h, LANE_HEADER, t.fontSize + 2);
        break;
      }
      case "pool": {
        const body = svgCreate("rect");
        svgAttr(body, { x: 0, y: 0, width: w, height: h, fill: "none", stroke, "stroke-width": sw });
        svgAppend(gfx, body);
        const strip = svgCreate("rect");
        svgAttr(strip, { x: 0, y: 0, width: POOL_STRIP, height: h, fill, stroke, "stroke-width": sw });
        svgClasses(strip).add("legend-pool-strip");
        svgAppend(gfx, strip);
        this.verticalHeader(gfx, element, h, POOL_STRIP, t.fontSize + 2);
        break;
      }
    }
  }

  private defaultFill(kind: LegendShapeKind): string {
    const t = this.tokens;
    switch (kind) {
      case "document":
        return t.doc;
      case "application":
        return t.app;
      case "lane":
      case "pool":
        return t.laneFill;
      default:
        return t.fill;
    }
  }

  /** Application component boxes of an activity, under its bottom edge. */
  private drawApps(gfx: Any, element: DiagramElement): void {
    const apps = appsOf(element);
    if (apps.length === 0) return;
    const names = apps.map((a) => annotationName(a.businessObject?.text));
    // The layout stores the annotation where the box goes (text-fitted, space
    // reserved): use that DI when it sits in the activity's bottom band, else
    // compute the box (applications added in the editor).
    const one = apps.length === 1 ? (apps[0] as DiagramElement) : null;
    const rel = one ? { x: (one.x ?? 0) - (element.x ?? 0), y: (one.y ?? 0) - (element.y ?? 0) } : null;
    const boxes =
      one && rel && rel.y >= element.height - 20 && rel.y <= element.height + 5 && rel.x >= -5 && rel.x + one.width <= element.width + 5
        ? [{ name: names[0] as string, x: rel.x, y: rel.y, width: one.width, height: one.height }]
        : appBoxes(names, element.width, element.height);
    boxes.forEach((box, i) => {
      const app = apps[i] as DiagramElement;
      this.appBox(gfx, box, getFillColor(app as never, this.tokens.app), getStrokeColor(app as never, this.tokens.stroke));
    });
  }

  private appBox(gfx: Any, box: { name: string; x: number; y: number; width: number; height: number }, fill: string, stroke: string): void {
    const t = this.tokens;
    const g = svgCreate("g");
    svgClasses(g).add("legend-app");
    svgAttr(g, { transform: `translate(${box.x} ${box.y})` });
    const rect = svgCreate("rect");
    svgAttr(rect, { x: 0, y: 0, width: box.width, height: box.height, fill, stroke, "stroke-width": t.strokeWidth });
    svgAppend(g, rect);
    // Component icon (top-right): body + two tabs.
    const ix = box.width - 17;
    const icon = svgCreate("path");
    svgAttr(icon, {
      d: `M${ix + 3} 5h9v12h-9ZM${ix} 7.5h6v2.5h-6ZM${ix} 12h6v2.5h-6Z`,
      fill,
      stroke,
      "stroke-width": t.strokeWidth,
    });
    svgAppend(g, icon);
    const text = this.textRenderer.createText(box.name, {
      box: { width: Math.max(10, box.width - 27), height: box.height },
      align: "right-middle",
      padding: 2,
      style: { fill: contrastText(fill, t.text, t.fill), fontSize: t.fontSize, fontFamily: t.fontFamily, fontWeight: 700 },
    });
    svgAttr(text, { transform: "translate(5 0)" });
    svgClasses(text).add("djs-label");
    svgAppend(g, text);
    svgAppend(gfx, g);
  }

  /** The canvas <defs> when `id` is not defined yet, else null. */
  private defsFor(id: string): SVGElement | null {
    const svg = this.canvas?._svg as SVGSVGElement | undefined;
    if (!svg || svg.querySelector(`[id="${id}"]`)) return null;
    let defs = svg.querySelector(":scope > defs");
    if (!defs) {
      defs = svgCreate("defs") as unknown as SVGDefsElement;
      svgAppend(svg, defs as unknown as SVGElement);
    }
    return defs as unknown as SVGElement;
  }

  /** Classic end arrow, one per canvas and colour. The id is prefixed by the instance id. */
  private arrowMarker(colour: string): string {
    const id = colour === this.tokens.stroke ? this.arrowId : `${this.arrowId}-${colour.replace(/[^0-9a-zA-Z]/g, "")}`;
    const defs = this.defsFor(id);
    if (!defs) return id;
    const marker = svgCreate("marker");
    svgAttr(marker, { id, viewBox: "0 0 10 10", refX: "9.5", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto" });
    const head = svgCreate("path");
    svgAttr(head, { d: "M0 0L10 5L0 10L2.5 5Z", fill: colour, stroke: "none" });
    svgAppend(marker, head);
    svgAppend(defs, marker);
    return id;
  }

  private taskGradient(): string {
    const id = this.gradientId;
    const defs = this.defsFor(id);
    if (!defs) return id;
    const gradient = svgCreate("linearGradient");
    svgAttr(gradient, { id, x1: "0", y1: "0", x2: "1", y2: "0" });
    for (const [offset, colour] of [
      ["0", this.tokens.fill],
      ["1", shade(this.tokens.fill, 0.95)],
    ] as const) {
      const stop = svgCreate("stop");
      svgAttr(stop, { offset, "stop-color": colour });
      svgAppend(gradient, stop);
    }
    svgAppend(defs, gradient);
    return id;
  }

  private label(gfx: Any, element: DiagramElement, fill: string, stroke: string, w: number, h: number): void {
    const t = this.tokens;
    // Above the application band when the activity has one (the layout reserved that height).
    const band = appsOf(element).length ? APP_BOX.overlap : 0;
    const text = this.textRenderer.createText((element.businessObject?.name as string) || "", {
      box: { width: w, height: h - band },
      align: "center-middle",
      padding: 7,
      style: { fill: getLabelColor(element as never, contrastText(fill, t.text, t.fill), stroke), fontSize: t.fontSize, fontFamily: t.fontFamily },
    });
    svgClasses(text).add("djs-label");
    svgAppend(gfx, text);
  }

  private verticalHeader(gfx: Any, element: DiagramElement, h: number, width: number, fontSize: number): void {
    const t = this.tokens;
    const name = (element.businessObject?.name as string) || "";
    const label = this.textRenderer.createText(name, {
      box: { width: h, height: width },
      align: "center-middle",
      padding: 6,
      style: { fill: getLabelColor(element as never, t.text), fontSize, fontFamily: t.fontFamily, fontWeight: 700 },
    });
    svgAttr(label, { transform: `translate(0 ${h}) rotate(-90)` });
    svgClasses(label).add("djs-label");
    svgAppend(gfx, label);
  }

  private subprocessMarker(gfx: Any, w: number, h: number, stroke: string): void {
    const group = svgCreate("g");
    svgClasses(group).add("legend-subprocess-marker");
    svgClasses(group).add("legend-marker");
    svgAttr(group, { "data-marker": "sub-process", "pointer-events": "all" });
    const box = svgCreate("rect");
    svgAttr(box, { x: w / 2 - 7, y: h - 18, width: 14, height: 14, fill: "transparent", stroke, "stroke-width": 1.2, "pointer-events": "all" });
    svgClasses(box).add("legend-marker");
    svgAppend(group, box);
    const plus = svgCreate("path");
    svgAttr(plus, { d: `M${w / 2 - 4} ${h - 11}h8M${w / 2} ${h - 15}v8`, stroke, "stroke-width": 1.2, "pointer-events": "all" });
    svgClasses(plus).add("legend-marker");
    svgAppend(group, plus);
    svgAppend(gfx, group);
  }

  private diamond(gfx: Any, w: number, h: number, fill: string, stroke: string, width: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const diamond = svgCreate("path");
    svgAttr(diamond, { d: `M${cx} 0L${w} ${cy}L${cx} ${h}L0 ${cy}Z`, fill, stroke, "stroke-width": width });
    svgAppend(gfx, diamond);
  }

  /** `+` for parallel, `X` for exclusive. `legendKind` admits no other gateway. */
  private gatewayMarker(gfx: Any, element: DiagramElement, w: number, h: number, colour: string): void {
    const cx = w / 2;
    const cy = h / 2;
    const parallel = is(element as object, "bpmn:ParallelGateway");
    const mark = svgCreate("path");
    svgAttr(mark, {
      d: parallel ? `M${cx - 10} ${cy}h20M${cx} ${cy - 10}v20` : `M${cx - 8} ${cy - 8}l16 16M${cx + 8} ${cy - 8}l-16 16`,
      stroke: colour,
      "stroke-width": 5 * this.tokens.strokeWidth,
      "stroke-linecap": "butt",
    });
    svgAppend(gfx, mark);
  }

  /** Data object: page with a small dog-ear top-right (20 % of the width). */
  private dataPage(gfx: Any, w: number, h: number, fill: string, stroke: string): void {
    const sw = this.tokens.strokeWidth;
    const path = svgCreate("path");
    const dog = Math.round(Math.min(w, h) * 0.2);
    svgAttr(path, { d: `M0 0h${w - dog}l${dog} ${dog}v${h - dog}h-${w}Z`, fill, stroke, "stroke-width": sw });
    svgClasses(path).add("legend-data-page");
    svgAppend(gfx, path);
    const fold = svgCreate("path");
    svgAttr(fold, { d: `M${w - dog} 0v${dog}h${dog}`, fill: "none", stroke, "stroke-width": sw });
    svgClasses(fold).add("legend-data-fold");
    svgAppend(gfx, fold);
  }

  override getShapePath(shape: Any): string {
    const element = shape as DiagramElement;
    const kind = shapeKindOf(shape);
    const w = element.width;
    const h = element.height;
    // Hit/interaction outlines follow the drawn shape, not the bounding box.
    if (kind === "event") {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M${cx - r} ${cy}` + `a${r} ${r} 0 1 0 ${2 * r} 0` + `a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    if (kind === "gateway") return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
    if (kind === "document") return documentPath(w, h);
    return `M0 0h${w}v${h}h-${w}Z`;
  }
}

// --- sync: hide linked [App] annotations, redraw their hosts -------------------

interface Registry {
  getAll(): DiagramElement[];
  getGraphics(el: DiagramElement): SVGElement | undefined;
}

export class LegendSync {
  static $inject = ["eventBus", "elementRegistry", "graphicsFactory"];

  private readonly registry: Registry;
  private readonly graphicsFactory: Any;

  constructor(eventBus: Any, elementRegistry: Registry, graphicsFactory: Any) {
    this.registry = elementRegistry;
    this.graphicsFactory = graphicsFactory;
    // import.render.complete: after importXML and after every open(diagram).
    eventBus.on("import.render.complete", () => this.refresh(true));
    // After ChangeSupport (priority 1000) redrew the changed elements: a new or
    // removed association changes which annotation is absorbed where.
    eventBus.on("elements.changed", 500, () => this.refresh(false));
  }

  refresh(all: boolean): void {
    for (const el of this.registry.getAll()) {
      if (el.type === "label" || !el.parent) continue;
      const gfx = this.registry.getGraphics(el);
      if (!gfx) continue;
      // diagram-js `hidden`: GraphicsFactory.update sets display="none" (kept
      // across ChangeSupport redraws; display-only, never exported to XML).
      const hide = isHiddenInLegend(el);
      const toggled = Boolean(el.hidden) !== hide;
      el.hidden = hide;
      const kind = shapeKindOf(el);
      const host = !el.waypoints && (isActivity(el) || kind === "data" || kind === "input" || kind === "output");
      if (all || host || toggled) {
        try {
          this.graphicsFactory.update(el.waypoints ? "connection" : "shape", el, gfx);
        } catch {
          // Element being removed mid-command: skip, the next change redraws.
        }
      }
    }
  }
}

// --- editing: the hidden annotation follows its activity -----------------------

export class LegendAppFollow {
  static $inject = ["eventBus"];

  constructor(eventBus: Any) {
    const interceptor = new CommandInterceptor(eventBus);
    interceptor.preExecute("elements.move", (event: { context: { shapes: DiagramElement[] } }) => {
      const shapes = event.context.shapes;
      for (const shape of [...shapes]) {
        for (const app of appsOf(shape)) {
          if (!shapes.includes(app)) shapes.push(app);
        }
      }
    });
  }
}

/** Renderer + sync. Safe in a render-only Viewer. */
export const LegendRendererModule = {
  __init__: ["legendRenderer", "legendSync"],
  legendRenderer: ["type", LegendRenderer],
  legendSync: ["type", LegendSync],
};

/** Editing behaviour on top of the renderer. Modeler only. */
export const LegendFollowModule = {
  __init__: ["legendAppFollow"],
  legendAppFollow: ["type", LegendAppFollow],
};

export { DEFAULT_LEGEND_TOKENS };
