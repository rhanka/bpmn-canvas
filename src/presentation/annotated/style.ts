import type { BusinessPolicy } from "../../internal/business-policy.js";
import { badgeSize, badgeBoxes, documentRect } from "../../internal/legacy-policy.js";
// Pure helpers of the `annotated` profile: which elements it draws, colours and
// the geometry shared with the swimlane layout. Adapted from an internal
// implementation (render style + draw.io-reference geometry). No DOM, no bpmn-js.

import { annotationName, isAppAnnotation, isDocumentAnnotation } from "../../internal/annotations.js";
import { textWidth, wrapText } from "../../internal/textMetrics.js";

export { annotationName, isAppAnnotation, isDocumentAnnotation };

export type AnnotatedShapeKind =
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

export type AnnotatedConnectionKind = "sequence" | "link" | "data-link";

/** The subset of a bpmn-moddle business object the kind decision reads. */
export interface AnnotatedBoLike {
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
export interface AnnotatedDiFacts {
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
 * The annotated shape of a business object, or `undefined` when the annotated does
 * not draw it faithfully. `undefined` means: leave it to the upstream renderer.
 * Typed events, typed tasks, inclusive/event-based/complex gateways, boundary
 * events, transactions, ad-hoc and expanded sub-processes, groups and data
 * stores all fall in that case.
 */
export function annotatedKind(bo: AnnotatedBoLike, di: AnnotatedDiFacts = {}, policy?: BusinessPolicy): AnnotatedShapeKind | undefined {
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
      if (isDocumentAnnotation(text, policy)) return "document";
      if (isAppAnnotation(text, policy)) return "application";
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

/** The annotated connection style of a business object, or `undefined` to leave it upstream. */
export function annotatedConnectionKind(bo: AnnotatedBoLike): AnnotatedConnectionKind | undefined {
  switch (bo.$type) {
    case "bpmn:SequenceFlow":
      // Conditional and default flows carry markers the annotated does not draw.
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

export function appBoxSize(name: string, hostWidth: number, policy?: BusinessPolicy): { width: number; height: number } {
  return badgeSize(name, hostWidth, policy);
}

export interface AppBox {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Boxes (relative to the task) for the task's applications, side by side. */
export function appBoxes(names: readonly string[], hostWidth: number, hostHeight: number, policy?: BusinessPolicy): AppBox[] {
  return badgeBoxes(names, hostWidth, hostHeight, policy) as AppBox[];
}

/** Lane header column and pool strip widths. */

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

/** Area the document name may use: under the band, above the wave crest. */
export function documentTextRect(w: number, h: number, policy?: BusinessPolicy): { x: number; y: number; width: number; height: number } {
  return documentRect(w, h, policy) as { x: number; y: number; width: number; height: number };
}

export function waypointsPath(waypoints: ReadonlyArray<{ x: number; y: number }> = []): string {
  return waypoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join("");
}
