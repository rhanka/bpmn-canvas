import { ProfileContractError } from "../../profile/canonical.js";
import type { BpmnCanvasConfig } from "../../internal/contracts.js";
import { paletteEntries } from "../../internal/legacy-policy.js";
// Annotated palette for the bpmn-js modeler: one entry per annotated element. This
// module REPLACES the default palette provider (no duplicate task/start/end/
// gateway entries, no non-annotated tools): additionalModules order makes our
// `paletteProvider` win over the bpmn-js default. Adapted from an internal
// implementation.
//
// External Input / Process Output are created as bpmn:DataInput / bpmn:DataOutput
// in the process ioSpecification (not DataObjectReference). Upstream bpmn-js has
// no containment branch for creating them, so this module (a) allows their
// creation drops through AnnotatedRules and (b) overrides the `bpmnUpdater` service
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




/** Stable palette action ids (the `data-action` of each palette entry and the keys of the icon CSS). */


/** diagram-js palette provider: click/drag creates the annotated element. */
export class AnnotatedPaletteProvider {
  static $inject = ["palette", "create", "elementFactory", "globalConnect", "config.bpmnCanvas"];
  constructor(palette: Any, private readonly create: Any, private readonly elementFactory: Any, private readonly globalConnect: Any, private readonly config?: BpmnCanvasConfig) { palette.registerProvider(this); }
  getPaletteEntries(): Record<string, object> {
    return Object.fromEntries(paletteEntries(this.config?.businessPolicy).map(entry => [entry.id, {
      group: entry.group, className: entry.className, title: entry.title, html: entry.html,
      action: { dragstart: (event: Event) => this.startCreate(event, entry), click: (event: Event) => this.startCreate(event, entry) },
    }]));
  }
  private startCreate(event: Event, entry: Record<string, any>): void {
    if (entry.create.tool === "connect") { this.globalConnect.start(event); return; }
    const shape = this.elementFactory.createShape(entry.create);
    for (const field of ["name", "text"]) if (entry.create[field] !== undefined) shape.businessObject[field] = entry.create[field];
    this.create.start(event, shape);
  }
}

// --- bpmn:DataInput / bpmn:DataOutput support ----------------------------------

const DATA_IO_TARGETS = ["bpmn:Lane", "bpmn:Participant", "bpmn:Process", "bpmn:SubProcess"];

/** Creation drops of DataInput/DataOutput, which the default rules reject. */
export class AnnotatedRules {
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
// bpmn-js's CommonJS declaration resolves its default as a module under NodeNext.
// Publish the structural base contract while using the same runtime constructor.
const UpdaterBase = BpmnUpdater as unknown as {
  new(eventBus: Any, bpmnFactory: Any, connectionDocking: Any): {
    updateSemanticParent(businessObject: Any, newParent: Any, visualParent: Any): void;
  };
  $inject: string[];
};
export class AnnotatedBpmnUpdater extends UpdaterBase {
  static override $inject: string[] = [...(BpmnUpdater as Any).$inject, "config.bpmnCanvas"];

  private readonly bpmnFactory: Any;
  /** Specifications this updater created: only those are removed again when they end up empty. */
  private readonly created = new WeakSet<object>();

  constructor(eventBus: Any, bpmnFactory: Any, connectionDocking: Any, private readonly config?: BpmnCanvasConfig) {
    super(eventBus, bpmnFactory, connectionDocking);
    this.bpmnFactory = bpmnFactory;
  }

  override updateSemanticParent(businessObject: Any, newParent: Any, visualParent: Any): void {
    if (!isDataIo(businessObject)) {
      super.updateSemanticParent(businessObject, newParent, visualParent);
      return;
    }
    const owner = newParent ? resolveProcess(newParent) : null;
    const direction = businessObject.$type === "bpmn:DataInput";
    const candidates = owner?.ioSpecification?.get(direction ? "inputSets" : "outputSets") ?? [];
    const requested = this.config?.ioSetSelections?.[businessObject.id];
    const memberships = candidates.filter((set: Any) => set.get(direction ? "dataInputRefs" : "dataOutputRefs").includes(businessObject));
    const selected = requested !== undefined ? candidates.find((set: Any) => set.id === requested) : memberships.length === 1 ? memberships[0] : candidates.length === 1 ? candidates[0] : undefined;
    if (owner && ((candidates.length > 1 && !selected) || (requested !== undefined && !selected))) throw new ProfileContractError("io-set-selection-required");
    const previous = businessObject.$parent;
    detachDataIo(businessObject);
    this.dropEmptySpecification(previous);
    if (!newParent) return;
    const proc = resolveProcess(newParent);
    if (!proc) return;
    let ioSpec = proc.ioSpecification;
    if (!ioSpec) {
      ioSpec = this.bpmnFactory.create("bpmn:InputOutputSpecification");
      proc.set("ioSpecification", ioSpec);
      ioSpec.$parent = proc;
      this.created.add(ioSpec);
    }
    this.ensureSets(ioSpec);
    const input = businessObject.$type === "bpmn:DataInput";
    ioSpec.get(input ? "dataInputs" : "dataOutputs").push(businessObject);
    businessObject.$parent = ioSpec;
    // Put the item in the first set so it belongs to at least one, as BPMN requires.
    const set = selected ?? ioSpec.get(input ? "inputSets" : "outputSets")[0];
    set?.get(input ? "dataInputRefs" : "dataOutputRefs").push(businessObject);
  }

  /**
   * Undoing a creation, or deleting the last item, must give back the document it started from:
   * an ioSpecification created here that holds no item and no set member is removed with it.
   * One from the imported document is never touched.
   */
  private dropEmptySpecification(ioSpec: Any): void {
    if (!ioSpec || !this.created.has(ioSpec)) return;
    const empty =
      ioSpec.get("dataInputs").length === 0 &&
      ioSpec.get("dataOutputs").length === 0 &&
      [...ioSpec.get("inputSets"), ...ioSpec.get("outputSets")].every(
        (set: Any) => (set.get("dataInputRefs")?.length ?? 0) + (set.get("dataOutputRefs")?.length ?? 0) + (set.get("optionalInputRefs")?.length ?? 0) + (set.get("optionalOutputRefs")?.length ?? 0) + (set.get("whileExecutingInputRefs")?.length ?? 0) + (set.get("whileExecutingOutputRefs")?.length ?? 0) === 0,
      );
    const owner = ioSpec.$parent;
    if (empty && owner && owner.ioSpecification === ioSpec) {
      owner.set("ioSpecification", undefined);
      ioSpec.$parent = null;
    }
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
export const AnnotatedPaletteModule = {
  __init__: ["paletteProvider", "annotatedRules"],
  paletteProvider: ["type", AnnotatedPaletteProvider],
  annotatedRules: ["type", AnnotatedRules],
  bpmnUpdater: ["type", AnnotatedBpmnUpdater],
};
