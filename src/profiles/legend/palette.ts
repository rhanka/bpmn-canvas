// Legend palette for the bpmn-js modeler: one entry per legend element. This
// module REPLACES the default palette provider (no duplicate task/start/end/
// gateway entries, no non-legend tools): additionalModules order makes our
// `paletteProvider` win over the bpmn-js default. Adapted from an internal
// implementation.
//
// External Input / Process Output are created as bpmn:DataInput / bpmn:DataOutput
// in the process ioSpecification (not DataObjectReference). Upstream bpmn-js has
// no containment branch for creating them, so this module (a) allows their
// creation drops through LegendRules and (b) overrides the `bpmnUpdater` service
// of THIS instance (never the prototype) so create, move, delete and undo work.
// An ioSpecification created here always carries the inputSet and outputSet the
// BPMN schema requires.

import BpmnUpdater from "bpmn-js/lib/features/modeling/BpmnUpdater.js";
import { is } from "bpmn-js/lib/util/ModelUtil.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface PaletteEntry {
  readonly id: string;
  readonly title: string;
  readonly bpmnType: string;
  readonly group: "events" | "activities" | "gateways" | "data" | "annotations" | "structure" | "flows";
  /** Marker or preset applied at creation. */
  readonly preset?: { readonly subtype?: string; readonly name?: string; readonly text?: string; readonly collapsed?: boolean };
  /** Special creation path (default: diagram-js create flow). */
  readonly tool?: "connect";
}

/** bpmn-font icon per entry. Without a className the palette renders empty buttons. */
export const PALETTE_ICONS: Readonly<Record<string, string>> = {
  "legend.start": "bpmn-icon-start-event-none",
  "legend.end": "bpmn-icon-end-event-none",
  "legend.intermediate-event": "bpmn-icon-intermediate-event-none",
  "legend.task": "bpmn-icon-task",
  "legend.subprocess": "bpmn-icon-subprocess-collapsed",
  "legend.external-process": "bpmn-icon-call-activity",
  "legend.gateway-or": "bpmn-icon-gateway-xor",
  "legend.gateway-and": "bpmn-icon-gateway-parallel",
  "legend.data-input": "bpmn-icon-data-object",
  "legend.data-output": "bpmn-icon-data-object",
  "legend.external-input": "bpmn-icon-data-input",
  "legend.process-output": "bpmn-icon-data-output",
  "legend.document": "bpmn-icon-text-annotation",
  "legend.application": "bpmn-icon-text-annotation",
  "legend.lane": "bpmn-icon-lane-insert-below",
  "legend.sequence-flow": "bpmn-icon-connection-multi",
};

export const PALETTE_ENTRIES: readonly PaletteEntry[] = [
  { id: "legend.start", title: "Start", bpmnType: "bpmn:StartEvent", group: "events" },
  { id: "legend.end", title: "End", bpmnType: "bpmn:EndEvent", group: "events" },
  { id: "legend.intermediate-event", title: "Intermediate event", bpmnType: "bpmn:IntermediateThrowEvent", group: "events" },
  { id: "legend.task", title: "Task", bpmnType: "bpmn:Task", group: "activities" },
  {
    id: "legend.subprocess",
    title: "Sub-process (collapsed)",
    bpmnType: "bpmn:SubProcess",
    group: "activities",
    preset: { collapsed: true },
  },
  { id: "legend.external-process", title: "External process", bpmnType: "bpmn:CallActivity", group: "activities" },
  { id: "legend.gateway-or", title: "Gateway OR", bpmnType: "bpmn:ExclusiveGateway", group: "gateways", preset: { subtype: "or" } },
  { id: "legend.gateway-and", title: "Gateway AND", bpmnType: "bpmn:ParallelGateway", group: "gateways", preset: { subtype: "and" } },
  { id: "legend.data-input", title: "Task input", bpmnType: "bpmn:DataObjectReference", group: "data", preset: { name: "Input" } },
  { id: "legend.data-output", title: "Task output", bpmnType: "bpmn:DataObjectReference", group: "data", preset: { name: "Output" } },
  { id: "legend.external-input", title: "External input", bpmnType: "bpmn:DataInput", group: "data", preset: { name: "External input" } },
  { id: "legend.process-output", title: "Process output", bpmnType: "bpmn:DataOutput", group: "data", preset: { name: "Process output" } },
  { id: "legend.document", title: "Document reference", bpmnType: "bpmn:TextAnnotation", group: "annotations", preset: { text: "[Doc] " } },
  { id: "legend.application", title: "Application", bpmnType: "bpmn:TextAnnotation", group: "annotations", preset: { text: "[App] " } },
  { id: "legend.lane", title: "Lane", bpmnType: "bpmn:Lane", group: "structure" },
  { id: "legend.sequence-flow", title: "Sequence flow", bpmnType: "bpmn:SequenceFlow", group: "flows", tool: "connect" },
];

/** Stable palette action ids (the `data-action` of each palette entry and the keys of the icon CSS). */
export const LEGEND_ACTION_IDS: readonly string[] = Object.freeze(PALETTE_ENTRIES.map((e) => e.id));

/** diagram-js palette provider: click/drag creates the legend element. */
export class LegendPaletteProvider {
  static $inject = ["palette", "create", "elementFactory", "globalConnect"];

  private readonly create: Any;
  private readonly elementFactory: Any;
  private readonly globalConnect: Any;

  constructor(palette: Any, create: Any, elementFactory: Any, globalConnect: Any) {
    this.create = create;
    this.elementFactory = elementFactory;
    this.globalConnect = globalConnect;
    palette.registerProvider(this);
  }

  getPaletteEntries(): Record<string, object> {
    const entries: Record<string, object> = {};
    for (const entry of PALETTE_ENTRIES) {
      entries[entry.id] = {
        group: entry.group,
        className: PALETTE_ICONS[entry.id] ?? "bpmn-icon-task",
        title: `Create ${entry.title}`,
        action: {
          dragstart: (event: Event) => this.startCreate(event, entry),
          click: (event: Event) => this.startCreate(event, entry),
        },
      };
    }
    return entries;
  }

  private startCreate(event: Event, entry: PaletteEntry): void {
    if (entry.tool === "connect") {
      this.globalConnect.start(event);
      return;
    }
    const attrs: Record<string, unknown> = { type: entry.bpmnType };
    if (entry.preset?.name) attrs["name"] = entry.preset.name;
    if (entry.preset?.text) attrs["text"] = entry.preset.text;
    if (entry.preset?.collapsed) attrs["isExpanded"] = false;
    const shape = this.elementFactory.createShape(attrs);
    // elementFactory ignores `name`: set it so created elements are labelled.
    if (entry.preset?.name) shape.businessObject.name = entry.preset.name;
    this.create.start(event, shape);
  }
}

// --- bpmn:DataInput / bpmn:DataOutput support ----------------------------------

const DATA_IO_TARGETS = ["bpmn:Lane", "bpmn:Participant", "bpmn:Process", "bpmn:SubProcess"];

/** Creation drops of DataInput/DataOutput, which the default rules reject. */
export class LegendRules {
  static $inject = ["eventBus"];

  constructor(eventBus: Any) {
    const allow = (event: { context?: { shape?: unknown; shapes?: unknown[]; target?: unknown } }): boolean | undefined => {
      const shapes = event.context?.shapes ?? (event.context?.shape ? [event.context.shape] : []);
      const target = event.context?.target;
      if (
        shapes.length === 1 &&
        (is(shapes[0] as object, "bpmn:DataInput") || is(shapes[0] as object, "bpmn:DataOutput")) &&
        DATA_IO_TARGETS.some((t) => is(target as object, t))
      ) {
        return true;
      }
      return undefined; // abstain: every other rule is upstream's
    };
    eventBus.on("commandStack.shape.create.canExecute", 1500, allow);
    eventBus.on("commandStack.elements.create.canExecute", 1500, allow);
  }
}

/** True for the ioSpecification-owned item types. */
export function isDataIo(bo: Any): boolean {
  return Boolean(bo) && (bo.$type === "bpmn:DataInput" || bo.$type === "bpmn:DataOutput");
}

function detachDataIo(bo: Any): void {
  const oldParent = bo.$parent;
  if (oldParent && typeof oldParent.get === "function") {
    for (const collection of ["dataInputs", "dataOutputs"]) {
      const list = oldParent.get(collection);
      if (Array.isArray(list)) {
        const at = list.indexOf(bo);
        if (at >= 0) list.splice(at, 1);
      }
    }
    for (const [setsName, refsName] of [
      ["inputSets", "dataInputRefs"],
      ["outputSets", "dataOutputRefs"],
    ] as const) {
      for (const set of oldParent.get(setsName) ?? []) {
        const refs = set.get(refsName);
        const at = Array.isArray(refs) ? refs.indexOf(bo) : -1;
        if (at >= 0) refs.splice(at, 1);
      }
    }
  }
  bo.$parent = null;
}

function resolveProcess(bo: Any): Any | null {
  let current: Any = bo;
  if (current && current.$type === "bpmn:Participant" && current.processRef) return current.processRef;
  while (current) {
    if (current.$type === "bpmn:Process" || current.$type === "bpmn:SubProcess") return current;
    current = current.$parent;
  }
  return null;
}

/**
 * Per-instance BpmnUpdater: teaches DataInput/DataOutput containment (upstream
 * bpmn-js 18.30 throws "no parent" when one is created or moved to another
 * process). They live in the owning process' ioSpecification, created on demand
 * WITH its required inputSet and outputSet. Every other type is upstream's.
 */
export class LegendBpmnUpdater extends BpmnUpdater {
  static override $inject: string[] = (BpmnUpdater as Any).$inject;

  private readonly bpmnFactory: Any;

  constructor(eventBus: Any, bpmnFactory: Any, connectionDocking: Any) {
    super(eventBus, bpmnFactory, connectionDocking);
    this.bpmnFactory = bpmnFactory;
  }

  override updateSemanticParent(businessObject: Any, newParent: Any, visualParent: Any): void {
    if (!isDataIo(businessObject)) {
      super.updateSemanticParent(businessObject, newParent, visualParent);
      return;
    }
    detachDataIo(businessObject);
    if (!newParent) return;
    const proc = resolveProcess(newParent);
    if (!proc) return;
    let ioSpec = proc.ioSpecification;
    if (!ioSpec) {
      ioSpec = this.bpmnFactory.create("bpmn:InputOutputSpecification");
      proc.set("ioSpecification", ioSpec);
      ioSpec.$parent = proc;
    }
    this.ensureSets(ioSpec);
    const input = businessObject.$type === "bpmn:DataInput";
    ioSpec.get(input ? "dataInputs" : "dataOutputs").push(businessObject);
    businessObject.$parent = ioSpec;
    // Put the item in the first set so it belongs to at least one, as BPMN requires.
    const set = ioSpec.get(input ? "inputSets" : "outputSets")[0];
    set?.get(input ? "dataInputRefs" : "dataOutputRefs").push(businessObject);
  }

  /** An ioSpecification needs at least one inputSet and one outputSet. */
  private ensureSets(ioSpec: Any): void {
    for (const [name, type] of [
      ["inputSets", "bpmn:InputSet"],
      ["outputSets", "bpmn:OutputSet"],
    ] as const) {
      const sets = ioSpec.get(name);
      if (sets.length === 0) {
        const set = this.bpmnFactory.create(type);
        set.$parent = ioSpec;
        sets.push(set);
      }
    }
  }
}

/** Palette, creation rules and the instance-safe updater. Modeler only. */
export const LegendPaletteModule = {
  __init__: ["paletteProvider", "legendRules"],
  paletteProvider: ["type", LegendPaletteProvider],
  legendRules: ["type", LegendRules],
  bpmnUpdater: ["type", LegendBpmnUpdater],
};
