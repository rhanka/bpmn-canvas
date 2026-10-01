// Pure helpers of the `legend` profile: which elements it draws, colours and
// the geometry shared with the swimlane layout. Adapted from an internal
// implementation (render style + draw.io-reference geometry). No DOM, no bpmn-js.

import { annotationName, isAppAnnotation, isDocumentAnnotation } from "../../internal/annotations.js";
import { textWidth, wrapText } from "../../internal/textMetrics.js";

export { annotationName, isAppAnnotation, isDocumentAnnotation };

export type LegendShapeKind =
  | "task"
  | "subprocess"
  | "event"
  | "gateway"
  | "external"
  | "input"
  | "output"
  | "data"
  | "document"
  | "application"
  | "lane"
  | "pool";

export type LegendConnectionKind = "sequence" | "link" | "data-link";

/** The subset of a bpmn-moddle business object the kind decision reads. */
export interface LegendBoLike {
  readonly $type: string;
  readonly text?: unknown;
  readonly eventDefinitions?: readonly unknown[] | undefined;
  readonly triggeredByEvent?: boolean | undefined;
  readonly dataState?: unknown;
  readonly isCollection?: boolean | undefined;
  readonly dataObjectRef?: { readonly isCollection?: boolean | undefined } | undefined;
  readonly conditionExpression?: unknown;
  readonly sourceRef?: { readonly default?: unknown } | undefined;
  readonly associationDirection?: string | undefined;
}

/** Diagram-interchange facts bpmn-js derives from the DI, not from the semantic element. */
export interface LegendDiFacts {
  readonly expanded?: boolean | undefined;
  readonly horizontal?: boolean | undefined;
}

const PLAIN_EVENTS = new Set([
  "bpmn:StartEvent",
  "bpmn:EndEvent",
  "bpmn:IntermediateThrowEvent",
  "bpmn:IntermediateCatchEvent",
]);

/**
 * The legend shape of a business object, or `undefined` when the legend does
 * not draw it faithfully. `undefined` means: leave it to the upstream renderer.
 * Typed events, typed tasks, inclusive/event-based/complex gateways, boundary
 * events, transactions, ad-hoc and expanded sub-processes, groups and data
 * stores all fall in that case.
 */
export function legendKind(bo: LegendBoLike, di: LegendDiFacts = {}): LegendShapeKind | undefined {
  switch (bo.$type) {
    case "bpmn:Task":
      return "task";
    case "bpmn:CallActivity":
      return "external";
    case "bpmn:SubProcess":
      return di.expanded === false && !bo.triggeredByEvent ? "subprocess" : undefined;
    case "bpmn:ExclusiveGateway":
    case "bpmn:ParallelGateway":
      return "gateway";
    case "bpmn:DataInput":
      return bo.isCollection ? undefined : "input";
    case "bpmn:DataOutput":
      return bo.isCollection ? undefined : "output";
    case "bpmn:DataObjectReference":
    case "bpmn:DataObject":
      return bo.dataState || bo.isCollection || bo.dataObjectRef?.isCollection ? undefined : "data";
    case "bpmn:TextAnnotation": {
      const text = typeof bo.text === "string" ? bo.text : "";
      if (isDocumentAnnotation(text)) return "document";
      if (isAppAnnotation(text)) return "application";
      return undefined;
    }
    case "bpmn:Participant":
      return di.horizontal !== false && di.expanded !== false ? "pool" : undefined;
    case "bpmn:Lane":
      return di.horizontal !== false ? "lane" : undefined;
    default:
      return PLAIN_EVENTS.has(bo.$type) && (bo.eventDefinitions?.length ?? 0) === 0 ? "event" : undefined;
  }
}

/** The legend connection style of a business object, or `undefined` to leave it upstream. */
export function legendConnectionKind(bo: LegendBoLike): LegendConnectionKind | undefined {
  switch (bo.$type) {
    case "bpmn:SequenceFlow":
      // Conditional and default flows carry markers the legend does not draw.
      if (bo.conditionExpression) return undefined;
      if (bo.sourceRef && bo.sourceRef.default === bo) return undefined;
      return "sequence";
    case "bpmn:Association":
      return bo.associationDirection && bo.associationDirection !== "None" ? undefined : "link";
    case "bpmn:DataInputAssociation":
    case "bpmn:DataOutputAssociation":
      return "data-link";
    default:
      return undefined;
  }
}

/** Darken a #rrggbb hex by a factor in (0,1]. Anything else is returned unchanged. */
export function shade(hex: string, factor: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const digits = m[1] as string;
  const scale = (i: number): string => {
    const v = Math.max(0, Math.min(255, Math.round(parseInt(digits.slice(i, i + 2), 16) * factor)));
    return v.toString(16).padStart(2, "0");
  };
  return `#${scale(0)}${scale(2)}${scale(4)}`;
}

/** Label colour on a fill: `light` on dark fills, `dark` otherwise. Non-hex fills get `dark`. */
export function contrastText(fill: string, dark: string, light: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(fill.trim());
  if (!m) return dark;
  const digits = m[1] as string;
  const lum = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * (lum[0] as number) + 0.7152 * (lum[1] as number) + 0.0722 * (lum[2] as number);
  return luminance < 0.35 ? light : dark;
}

/**
 * Application component box (reference: 80x30 child of a 120x80 task at (20,70)):
 * centred under its task, top at task bottom - 10. Long names widen the box up
 * to the task width, then wrap and grow in height. Same rule as the layout.
 */
export const APP_BOX = { minWidth: 80, height: 30, overlap: 10, gap: 4, font: 12, chrome: 31, margin: 10 } as const;

export function appBoxSize(name: string, hostWidth: number): { width: number; height: number } {
  const wanted = textWidth(name, APP_BOX.font, true) + APP_BOX.chrome;
  const maxWidth = Math.max(APP_BOX.minWidth, hostWidth - 2 * APP_BOX.margin);
  const width = Math.min(maxWidth, Math.max(APP_BOX.minWidth, Math.ceil(wanted)));
  if (wanted <= width) return { width, height: APP_BOX.height };
  const lines = wrapText(name, APP_BOX.font, width - APP_BOX.chrome, true).length;
  return { width, height: Math.max(APP_BOX.height, Math.ceil(lines * APP_BOX.font * 1.2 + 8)) };
}

export interface AppBox {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Boxes (relative to the task) for the task's applications, side by side. */
export function appBoxes(names: readonly string[], hostWidth: number, hostHeight: number): AppBox[] {
  const sizes = names.map((n) => appBoxSize(n, hostWidth));
  const total = sizes.reduce((a, b) => a + b.width, 0) + APP_BOX.gap * Math.max(0, names.length - 1);
  let x = (hostWidth - total) / 2;
  return names.map((name, i) => {
    const size = sizes[i] as { width: number; height: number };
    const box = { name, x, y: hostHeight - APP_BOX.overlap, width: size.width, height: size.height };
    x += size.width + APP_BOX.gap;
    return box;
  });
}

/** Lane header column and pool strip widths. */
export const LANE_HEADER = 40;
export const POOL_STRIP = 30;

/**
 * Document outline with a wavy bottom. Shared by the drawing and by the hit
 * outline so interaction matches the visuals: straight sides to 85 % of the
 * height, wave between 63 % (crest) and 107 % (trough) control points.
 */
export function documentPath(w: number, h: number): string {
  const edge = h * 0.85;
  return `M0 0H${w}V${edge}Q${w * 0.75} ${h * 0.63} ${w * 0.5} ${edge}Q${w * 0.25} ${h * 1.07} 0 ${edge}Z`;
}

/** Document geometry shared with the layout. */
export const DOC = { band: 15, textTop: 20, waveTop: 0.74, padX: 6, padBottom: 4 } as const;

/** Area the document name may use: under the band, above the wave crest. */
export function documentTextRect(w: number, h: number): { x: number; y: number; width: number; height: number } {
  return {
    x: DOC.padX,
    y: DOC.textTop,
    width: w - 2 * DOC.padX,
    height: Math.max(0, h * DOC.waveTop - DOC.textTop - DOC.padBottom),
  };
}

export function waypointsPath(waypoints: ReadonlyArray<{ x: number; y: number }> = []): string {
  return waypoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join("");
}
