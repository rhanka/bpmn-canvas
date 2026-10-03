// On-demand auto-layout. Adapted from an internal implementation (a command that
// reads the open diagram, lays it out with swimlaneLayout.ts and writes bounds,
// waypoints and their DI as one undoable command). Each pool keeps its position;
// BPMN semantics are untouched. Existing DI is moved, DI is never generated.

import { getDi } from "bpmn-js/lib/util/ModelUtil.js";
import { getExternalLabelMid } from "bpmn-js/lib/util/LabelUtil.js";
import { getMid } from "diagram-js/lib/layout/LayoutUtil.js";

import type { BpmnCanvasLayoutService } from "../contracts.js";
import { isAppAnnotation } from "../annotations.js";
import { parseProcesses } from "../processModel.js";
import { boundaryChanges } from "./boundary.js";
import { layoutProcess, type Box, type LayoutProcessInput, type Point, type ProcessLayout } from "../swimlaneLayout.js";

// bpmn-js / diagram-js elements are not typed at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;

export type LayoutChange = { element: El; bounds?: Box; waypoints?: Point[] };

const COMMAND = "bpmnCanvas.autoLayout";

const CONN_TYPES: Record<string, string[]> = {
  FLOW: ["bpmn:SequenceFlow"],
  DATA: ["bpmn:DataInputAssociation", "bpmn:DataOutputAssociation"],
  DOC: ["bpmn:Association"],
};

/**
 * Changes (bounds / waypoints) that apply a layout to the participant's elements.
 * Layout items that have no element in the registry are reported in `missing`.
 */
export function layoutChanges(registry: El, participant: El, lay: ProcessLayout, missing: string[] = []): LayoutChange[] {
  const dx = participant.x - lay.pool.x;
  const dy = participant.y - lay.pool.y;
  const move = (b: Box): Box => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
  const changes: LayoutChange[] = [{ element: participant, bounds: move(lay.pool) }];
  const lanes = registry
    .getAll()
    .filter((e: El) => e.type === "bpmn:Lane" && e.parent === participant)
    .sort((a: El, b: El) => a.y - b.y);
  lanes.forEach((lane: El, i: number) => {
    const b = lay.lanes[i];
    if (b) changes.push({ element: lane, bounds: move(b[1]) });
  });
  for (const [id, b] of Object.entries(lay.nodes)) {
    const el = registry.get(id);
    if (!el) {
      missing.push(id);
      continue;
    }
    changes.push({ element: el, bounds: move(b) });
    const lb = lay.labels[id];
    if (lb && el.label) changes.push({ element: el.label, bounds: move(lb) });
  }
  // [App] annotations are stored where the legend render draws the box.
  for (const [hostId, a] of Object.entries(lay.apps)) {
    const host = registry.get(hostId);
    const t = lay.nodes[hostId];
    if (!host || !t) continue;
    const links = [...(host.incoming ?? []), ...(host.outgoing ?? [])].filter((c: El) => c.type === "bpmn:Association");
    let i = 0;
    for (const link of links) {
      const ann = link.source === host ? link.target : link.source;
      if (ann?.type !== "bpmn:TextAnnotation" || !isAppAnnotation(ann.businessObject?.text)) continue;
      const ab = move({ ...a, x: a.x + i * (a.w + 4) });
      i += 1;
      changes.push({ element: ann, bounds: ab });
      const x = ab.x + Math.floor(ab.w / 2);
      const tb = move(t);
      const pts: Point[] = [[x, ab.y], [x, tb.y + tb.h - 20]];
      changes.push({ element: link, waypoints: link.source === ann ? pts : [...pts].reverse() });
    }
  }
  const connByEnds = new Map<string, El>();
  for (const el of registry.getAll()) {
    if (el.waypoints && el.source && el.target) connByEnds.set(`${el.source.id}\u0000${el.target.id}\u0000${el.type}`, el);
  }
  lay.connections.forEach((c, i) => {
    const pts = lay.edges[i];
    if (!pts?.length) return;
    const el = (CONN_TYPES[c.kind || "FLOW"] ?? [])
      .map((t) => connByEnds.get(`${c.source}\u0000${c.target}\u0000${t}`) ?? connByEnds.get(`${c.target}\u0000${c.source}\u0000${t}`))
      .find(Boolean);
    if (!el) {
      missing.push(`${c.source}->${c.target}`);
      return;
    }
    const forward = el.source?.id === c.source;
    const moved = pts.map(([x, y]) => [x + dx, y + dy] as Point);
    changes.push({ element: el, waypoints: forward ? moved : [...moved].reverse() });
    const lb = lay.edgeLabels[i];
    if (lb && el.label) changes.push({ element: el.label, bounds: move(lb) });
  });
  return changes;
}

/** Layout input of every participant's process, read from the diagram XML. */
export function processesByParticipant(xml: string, registry: El): Array<{ participant: El; proc: LayoutProcessInput }> {
  const parsed = new Map(parseProcesses(xml).map((p) => [p.id, p.proc]));
  return registry
    .getAll()
    .filter((e: El) => e.type === "bpmn:Participant" && e.businessObject?.processRef)
    .map((participant: El) => ({ participant, proc: parsed.get(participant.businessObject.processRef.id) }))
    .filter((x: { proc?: LayoutProcessInput }) => x.proc) as Array<{ participant: El; proc: LayoutProcessInput }>;
}

const sameBounds = (el: El, b: Box): boolean => el.x === b.x && el.y === b.y && el.width === b.w && el.height === b.h;
const sameWaypoints = (el: El, pts: Point[]): boolean => {
  const cur: Array<{ x: number; y: number }> = el.waypoints ?? [];
  return cur.length === pts.length && pts.every(([x, y], i) => cur[i]?.x === x && cur[i]?.y === y);
};
/** Owner id of an element, following an external label to its target. */
const ownerId = (el: El): string => (el.type === "label" ? el.labelTarget?.id : el.id);

type Saved = { element: El; bounds?: { x: number; y: number; width: number; height: number }; di?: unknown; waypoints?: unknown; diWaypoints?: unknown };
type Context = { changes: LayoutChange[]; reroute?: El[]; saved?: Saved[]; createdLabels?: El[] };

/**
 * The `bpmnCanvas.autoLayout` command: the whole re-layout is one undo step.
 * It runs no nested command. Connections between pools (message flows) are re-routed here, with
 * the modeler's own layouter, so undo restores the DI exactly.
 */
export class AutoLayoutHandler {
  static $inject = ["moddle", "layouter", "connectionDocking", "graphicsFactory", "elementRegistry"];

  private moddle: El;
  private layouter: El;
  private docking: El;
  private graphics: El;
  private registry: El;

  constructor(moddle: El, layouter: El, connectionDocking: El, graphicsFactory: El, elementRegistry: El) {
    this.moddle = moddle;
    this.layouter = layouter;
    this.docking = connectionDocking;
    this.graphics = graphicsFactory;
    this.registry = elementRegistry;
  }

  /** Bounds DI of an element; for an external label it is created on demand (`created` records it for undo). */
  private boundsDi(el: El, create: boolean, created?: El[]): El {
    if (el.type !== "label") return getDi(el).bounds;
    // External label element: its DI lives on the owner's shape / edge DI.
    const di = getDi(el.labelTarget);
    if (!di.label && create) {
      di.set("label", this.moddle.create("bpmndi:BPMNLabel", { bounds: this.moddle.create("dc:Bounds") }));
      created?.push(di);
    } else if (di.label && !di.label.bounds && create) di.label.set("bounds", this.moddle.create("dc:Bounds"));
    return di.label?.bounds;
  }

  private setBounds(el: El, b: Box, saved: Saved[], created: El[]): void {
    const diBounds = this.boundsDi(el, true, created);
    saved.push({
      element: el,
      bounds: { x: el.x, y: el.y, width: el.width, height: el.height },
      di: diBounds ? { x: diBounds.x, y: diBounds.y, width: diBounds.width, height: diBounds.height } : undefined,
    });
    Object.assign(el, { x: b.x, y: b.y, width: b.w, height: b.h });
    if (diBounds) Object.assign(diBounds, { x: b.x, y: b.y, width: b.w, height: b.h });
  }

  private setWaypoints(el: El, pts: Array<{ x: number; y: number }>, saved: Saved[]): void {
    const di = getDi(el);
    saved.push({ element: el, waypoints: el.waypoints, diWaypoints: di.waypoint });
    el.waypoints = pts.map(({ x, y }) => ({ x, y }));
    di.set("waypoint", pts.map(({ x, y }) => this.moddle.create("dc:Point", { x, y })));
  }

  execute(context: Context): El[] {
    const saved: Saved[] = [];
    const created: El[] = [];
    for (const ch of context.changes) {
      if (ch.bounds) this.setBounds(ch.element, ch.bounds, saved, created);
      if (ch.waypoints) this.setWaypoints(ch.element, ch.waypoints.map(([x, y]) => ({ x, y })), saved);
    }
    // Connections between pools follow their moved ends (docking cropped like the modeler does).
    for (const conn of context.reroute ?? []) {
      // The layouter keeps an existing first and last waypoint as docking points. A connection that
      // starts or ends on a boundary event just moved with its host, so it is routed afresh.
      const onBoundary = conn.source?.type === "bpmn:BoundaryEvent" || conn.target?.type === "bpmn:BoundaryEvent";
      const hints = onBoundary ? { connectionStart: getMid(conn.source), connectionEnd: getMid(conn.target), waypoints: [] } : {};
      const raw = this.layouter.layoutConnection(conn, hints);
      const probe = { ...conn, waypoints: raw };
      this.setWaypoints(conn, this.docking.getCroppedWaypoints(probe, conn.source, conn.target), saved);
      const label = conn.label;
      if (label) {
        const mid = getExternalLabelMid(conn);
        this.setBounds(label, { x: Math.round(mid.x - label.width / 2), y: Math.round(mid.y - label.height / 2), w: label.width, h: label.height }, saved, created);
      }
    }
    context.saved = saved;
    context.createdLabels = created;
    const touched = [...context.changes.map((c) => c.element), ...(context.reroute ?? []), ...(context.reroute ?? []).map((c) => c.label)];
    return [...new Set(touched.filter(Boolean))];
  }

  revert(context: Context): El[] {
    for (const s of [...(context.saved ?? [])].reverse()) {
      const el = s.element;
      if (s.bounds) {
        Object.assign(el, s.bounds);
        const diBounds = this.boundsDi(el, false);
        if (diBounds && s.di) Object.assign(diBounds, s.di);
      }
      if (s.waypoints) {
        el.waypoints = s.waypoints;
        getDi(el).set("waypoint", s.diWaypoints);
      }
    }
    // Label DI created by this command is removed again.
    for (const di of context.createdLabels ?? []) delete di.label;
    // A label reported as changed would make bpmn-js write its label DI back (shape.changed ->
    // updateBounds), so labels are repainted directly and kept out of the dirty set.
    const touched = [...context.changes.map((c) => c.element), ...(context.reroute ?? []), ...(context.reroute ?? []).map((c) => c.label)];
    const dirty: El[] = [];
    for (const el of new Set(touched.filter(Boolean))) {
      if (el.type === "label") {
        const gfx = this.registry.getGraphics(el);
        if (gfx) this.graphics.update("shape", el, gfx);
      } else dirty.push(el);
    }
    return dirty;
  }
}

const abortError = (): Error => new DOMException("Layout superseded or canvas destroyed", "AbortError");

/**
 * Service `bpmnCanvasLayout`. Re-lays out every pool of the open diagram as ONE undoable command.
 * After every await it checks that the canvas is alive, still shows the same diagram and was not
 * edited meanwhile; otherwise it rejects with an AbortError and touches nothing.
 */
export class BpmnCanvasLayout implements BpmnCanvasLayoutService {
  static $inject = ["commandStack", "elementRegistry", "bpmnjs", "eventBus"];

  private commandStack: El;
  private registry: El;
  private bpmnjs: El;
  private generation = 0;
  private destroyed = false;

  constructor(commandStack: El, elementRegistry: El, bpmnjs: El, eventBus: El) {
    commandStack.registerHandler(COMMAND, AutoLayoutHandler);
    this.commandStack = commandStack;
    this.registry = elementRegistry;
    this.bpmnjs = bpmnjs;
    eventBus.on(["diagram.clear", "import.parse.start", "root.set", "commandStack.changed"], () => {
      this.generation += 1;
    });
    eventBus.on("diagram.destroy", () => {
      this.destroyed = true;
      this.generation += 1;
    });
  }

  async run(isCurrent: () => boolean = () => true): Promise<{ changed: number; skipped: string[] }> {
    if (this.destroyed) throw abortError();
    const gen = ++this.generation;
    const alive = (): boolean => !this.destroyed && gen === this.generation && isCurrent();

    const { xml } = await this.bpmnjs.saveXML();
    if (!alive()) throw abortError();

    const changes: LayoutChange[] = [];
    const missing: string[] = [];
    for (const { participant, proc } of processesByParticipant(xml, this.registry)) {
      const lay = await layoutProcess(proc);
      if (!alive()) throw abortError();
      changes.push(...layoutChanges(this.registry, participant, lay, missing));
    }

    const boundary = boundaryChanges(this.registry, changes);
    changes.push(...boundary.changes);
    const reroute: El[] = changes.length
      ? [...new Set<El>([...this.registry.getAll().filter((e: El) => e.type === "bpmn:MessageFlow" && e.source && e.target), ...boundary.reroute])]
      : [];
    const placed = new Set<string>([...changes.map((c) => ownerId(c.element)), ...reroute.map((e: El) => e.id)]);
    const effective = changes.filter((c) => (c.bounds ? !sameBounds(c.element, c.bounds) : c.waypoints ? !sameWaypoints(c.element, c.waypoints) : false));
    const changed = new Set(effective.map((c) => ownerId(c.element))).size;

    // Nothing is dropped silently: every shape or connection that was not laid out is listed.
    const skipped = new Set<string>(missing);
    for (const e of this.registry.getAll() as El[]) {
      if (!e.parent || e.type === "label") continue;
      if (!placed.has(e.id)) skipped.add(e.id);
    }

    if (effective.length) this.commandStack.execute(COMMAND, { changes: effective, reroute });
    return { changed, skipped: [...skipped].sort() };
  }
}

export const BpmnCanvasLayoutModule = {
  __init__: ["bpmnCanvasLayout"],
  bpmnCanvasLayout: ["type", BpmnCanvasLayout],
};
