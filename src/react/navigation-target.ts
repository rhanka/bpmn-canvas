import type { BusinessPolicy } from "../internal/business-policy.js";
import { navigationTarget } from "../internal/legacy-policy.js";
import type { DiagramInfo, ElementClick } from "../types.js";
import type { BpmnWorkshopProps } from "./workshop.js";

/** Called element first (by id or name), then the element's own name; never the diagram already shown. */
export function defaultResolveTarget(click: ElementClick, diagrams: readonly DiagramInfo[], activeId: string | undefined, policy?: BusinessPolicy, index?: Record<string, any>): string | null {
  const result = navigationTarget({ click, diagrams, activeId, activeDiagramId: activeId }, index ?? { processes: [], entries: [] }, policy);
  return result.kind === "open" || result.kind === "current" ? result.diagramId : null;
}

/** The resolver the caller passed, if any. */
export const explicitTargetResolver = (props: BpmnWorkshopProps) => props.resolveTarget;

/** The business-policy/1 rule category of each published marker navigation rule. */
export const POLICY_RULE: Readonly<Record<string, string>> = { calledElement: "called-element", exactName: "name-equal", sectionNumber: "section-equal", substring: "name-overlap" };
