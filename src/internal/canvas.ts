import type {
  BpmnCanvasHandle,
  BpmnCanvasOptions,
  CanvasState,
  ChangeCause,
  Diagnostic,
  DiagramInfo,
  FitMode,
  FitOptions,
  LayoutResult,
  LegendTokens,
  ProfileId,
  SetXmlOptions,
  SetXmlResult,
} from "../types.js";
import type { BpmnCanvasLayoutService } from "./contracts.js";
import { analyzeDefinitions, classifyWarnings, hasXmlComment, isLossy } from "./diagnostics.js";
import { diagramName, loadEngine, loadProfile, newInstanceId, profileConfig } from "./engine.js";
import type { DefinitionsLike, EventBusLike, ModdleLike, ViewerLike } from "./engine.js";
import { ReadOnlyModule } from "./readonly.js";
import type { ReadOnlyService } from "./readonly.js";
import { installStyles } from "./styles.js";
import { initialView } from "./viewbox.js";
import type { ShapeLike } from "./viewbox.js";

export function abortError(): Error {
  const e = new Error("Operation aborted: superseded or canvas destroyed");
  e.name = "AbortError";
  return e;
}

interface ElementLike {
  readonly id: string;
  readonly type: string;
  readonly parent?: unknown;
  readonly businessObject?: { name?: unknown; calledElement?: unknown };
}
interface DirectEditingLike {
  isActive(): boolean;
  complete(): void;
}
interface CommandStackLike {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
}
interface CanvasLike {
  zoom(level?: string | number, center?: string | { x: number; y: number }): unknown;
  viewbox(box?: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number };
  getSize(): { width: number; height: number };
  resized(): void;
}
interface RegistryLike {
  getAll(): Array<{ type: string; x?: number; y?: number; width?: number; height?: number; waypoints?: Array<{ x: number; y: number }> }>;
}
interface ZoomScrollLike {
  toggle(enabled: boolean): void;
  stepZoom(delta: number, position?: { x: number; y: number }): void;
}

/** Selectors of the sub-process expansion marker and drill-down icon, for both profiles. */
const MARKER_SELECTOR = ".bjs-drilldown, [data-marker='sub-process'], [data-marker='process-icon'], .legend-marker";
const PALETTE_FLOOR: Record<ProfileId, number> = { standard: 56, legend: 112 };
const ZOOM_STEP_IN = 1.15;
const ZOOM_STEP_OUT = 0.87;
const DEFAULT_ZOOM_MIN = 0.2;
const DEFAULT_ZOOM_MAX = 4;

export class CanvasController implements BpmnCanvasHandle {
  readonly ready: Promise<void>;
  private readonly instanceId = newInstanceId();
  private readonly root: HTMLDivElement;
  private readonly host: HTMLElement;
  private readonly options: BpmnCanvasOptions;
  private modeler: ViewerLike | undefined;
  private _state: CanvasState = "loading";
  private destroyed = false;
  private epoch = 0;
  private navSeq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private loading = 0;
  private touched = false;
  private inputXml = "";
  private baseRevision: string | undefined;
  private revisionCounter = 0;
  private lastRevision: string | undefined;
  private activeId: string | undefined;
  private diagrams: DiagramInfo[] = [];
  private diagnostics: Diagnostic[] = [];
  private hostReadOnly: boolean;
  private lossyGate = false;
  private inLayout = false;
  private wheelListener: ((e: WheelEvent) => void) | undefined;
  private wheelCapture = false;
  private drilldownListener: ((e: MouseEvent) => void) | undefined;
  private abortListener: (() => void) | undefined;
  private profileId: ProfileId;
  private legendTokens: Partial<LegendTokens> | undefined;
  private fitMode: FitMode;
  private fittedOnce = false;
  private resizeObserver: ResizeObserver | undefined;
  private lastSize = "";
  private lastHistory = "";

  constructor(host: HTMLElement, options: BpmnCanvasOptions) {
    this.host = host;
    this.options = options;
    this.hostReadOnly = options.readOnly === true;
    this.profileId = options.profile ?? "standard";
    this.legendTokens = options.legendTokens;
    this.fitMode = options.fitMode ?? "readable";
    this.baseRevision = options.revision;
    this.root = host.ownerDocument.createElement("div");
    this.root.className = "bpmn-canvas";
    this.root.dataset["bpmnCanvasInstance"] = this.instanceId;
    host.appendChild(this.root);
    if ((options.styles ?? "auto") === "auto") installStyles(host, options.styleNonce);

    if (options.signal) {
      if (options.signal.aborted) this.destroy();
      else {
        this.abortListener = () => this.destroy();
        options.signal.addEventListener("abort", this.abortListener, { once: true });
      }
    }

    const epoch = ++this.epoch;
    this.queue = this.init();
    const initial = options.xml !== undefined ? this.enqueue(epoch, () => this.applyXml(options.xml as string, options.revision, epoch)) : this.queue;
    this.ready = initial.then(
      () => undefined,
      () => undefined,
    );
  }

  get state(): CanvasState {
    return this._state;
  }

  private setState(state: CanvasState): void {
    if (this._state === state) return;
    this._state = state;
    this.options.onStateChange?.(state);
  }

  private emit(diagnostic: Diagnostic): void {
    this.options.onDiagnostic?.(diagnostic);
  }

  private assertLive(epoch: number): void {
    if (this.destroyed || epoch !== this.epoch) throw abortError();
  }

  private enqueue<T>(epoch: number, task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(() => {
      this.assertLive(epoch);
      return task();
    });
    this.queue = p.then(
      () => undefined,
      () => undefined,
    );
    p.catch(() => undefined);
    return p;
  }

  private async init(): Promise<void> {
    try {
      const [engine, profile] = await Promise.all([loadEngine(), loadProfile(this.profileId, this.legendTokens)]);
      if (this.destroyed) return;
      await this.createModeler(engine, profile);
      this.setupResizeObserver();
    } catch (error) {
      const d: Diagnostic = { code: "import-failed", severity: "error", message: `Engine failed to load: ${String((error as Error)?.message ?? error)}` };
      this.diagnostics = [d];
      this.setState("error");
      this.emit(d);
    }
  }

  /** Creates the modeler for a profile and wires this controller's listeners. Used at start and by setProfile. */
  private async createModeler(engine: Awaited<ReturnType<typeof loadEngine>>, profile: Awaited<ReturnType<typeof loadProfile>>): Promise<ViewerLike> {
    const limits = this.options.zoomLimits;
    const modeler = new engine.Modeler({
      container: this.root,
      additionalModules: [ReadOnlyModule, ...profile.modelerModules, ...(await this.layoutModules())],
      bpmnCanvas: profileConfig(this.instanceId, profile),
      ...(limits ? { zoomScroll: { ...(limits.min !== undefined ? { minZoom: limits.min } : {}), ...(limits.max !== undefined ? { maxZoom: limits.max } : {}) } } : {}),
    });
    this.modeler = modeler;
    const bus = modeler.get<EventBusLike>("eventBus");
    bus.on("commandStack.changed", (e: { trigger?: string }) => this.onStackChanged(e.trigger));
    bus.on("element.click", (e: { element?: ElementLike; originalEvent?: MouseEvent }) => this.onElementClick(e));
    bus.on("root.set", (e: { element?: ElementLike }) => this.onRootSet(e.element));
    this.setupDrilldown(modeler);
    this.setupWheel(modeler);
    this.applyReadOnly();
    return modeler;
  }

  private async layoutModules(): Promise<unknown[]> {
    try {
      const mod = (await import("./layout/index.js")) as unknown as { BpmnCanvasLayoutModule: unknown };
      return [mod.BpmnCanvasLayoutModule];
    } catch {
      return [];
    }
  }

  private removeWheel(): void {
    if (this.wheelListener) this.root.removeEventListener("wheel", this.wheelListener, { capture: this.wheelCapture });
    this.wheelListener = undefined;
  }

  private setupWheel(modeler: ViewerLike): void {
    this.removeWheel();
    const mode = this.options.wheel ?? "zoom";
    if (mode === "zoom") return;
    const zoomScroll = modeler.get<ZoomScrollLike | undefined>("zoomScroll");
    if (mode === "page-scroll") {
      if (!zoomScroll) return;
      zoomScroll.toggle(false);
      this.wheelListener = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const r = this.root.getBoundingClientRect();
        zoomScroll.stepZoom(e.deltaY < 0 ? 1 : -1, { x: e.clientX - r.left, y: e.clientY - r.top });
      };
      this.wheelCapture = false;
      this.root.addEventListener("wheel", this.wheelListener, { passive: false });
      return;
    }
    // zoom-cursor: a plain wheel zooms around the cursor; Ctrl/Meta+wheel and pinch stay native.
    this.wheelListener = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.deltaY === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const r = this.root.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? ZOOM_STEP_IN : ZOOM_STEP_OUT, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    this.wheelCapture = true;
    this.root.addEventListener("wheel", this.wheelListener, { passive: false, capture: true });
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (this.destroyed || !box || box.width === 0 || box.height === 0) return;
      const key = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (key === this.lastSize) return;
      this.lastSize = key;
      if (!this.modeler || this.diagrams.length === 0) return;
      this.modeler.get<CanvasLike>("canvas").resized();
      if (!this.fittedOnce || this.fitMode === "whole") this.applyFit(this.fitMode);
    });
    this.resizeObserver.observe(this.root);
  }

  private removeDrilldown(): void {
    if (this.drilldownListener) this.root.removeEventListener("click", this.drilldownListener, { capture: true });
    this.drilldownListener = undefined;
  }

  /** `event` mode: the drill-down button reports a marker click instead of navigating. */
  private setupDrilldown(modeler: ViewerLike): void {
    this.removeDrilldown();
    if ((this.options.drilldown ?? "native") !== "event") return;
    this.drilldownListener = (e: MouseEvent) => {
      const button = (e.target as Element | null)?.closest?.(".bjs-drilldown");
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const id = button.closest("[data-container-id]")?.getAttribute("data-container-id");
      const element = id ? modeler.get<{ get(id: string): ElementLike | undefined }>("elementRegistry").get(id) : undefined;
      if (element) this.onElementClick({ element, originalEvent: e });
    };
    this.root.addEventListener("click", this.drilldownListener, { capture: true });
  }

  /** The displayed diagram can change without selectDiagram (native drill-down): keep the state true. */
  private onRootSet(root: ElementLike | undefined): void {
    if (this.destroyed || this.loading > 0 || !this.modeler) return;
    const id = (root?.businessObject as { id?: string } | undefined)?.id;
    const diagram = this.modeler.getDefinitions().diagrams?.find((d) => d.plane.bpmnElement?.id === id);
    if (!diagram || diagram.id === this.activeId) return;
    this.activeId = diagram.id;
    this.options.onChange?.({ revision: this.lastRevision ?? `${this.instanceId}:${this.revisionCounter}`, baseRevision: this.baseRevision, cause: "diagram-switch", diagramId: diagram.id });
  }

  private onElementClick(e: { element?: ElementLike; originalEvent?: MouseEvent }): void {
    const el = e.element;
    const bo = el?.businessObject;
    if (!el || !bo || !el.parent || !this.options.onElementClick) return;
    const target = e.originalEvent?.target as Element | null | undefined;
    const calledElement = typeof bo.calledElement === "string" && bo.calledElement ? bo.calledElement : undefined;
    this.options.onElementClick({
      id: el.id,
      type: el.type,
      name: typeof bo.name === "string" ? bo.name : "",
      ...(calledElement !== undefined ? { calledElement } : {}),
      marker: !!target?.closest?.(MARKER_SELECTOR),
    });
  }

  private emitHistory(): void {
    if (this.destroyed || !this.options.onHistoryChange) return;
    const state = { canUndo: this.canUndo(), canRedo: this.canRedo() };
    const key = `${state.canUndo}${state.canRedo}`;
    if (key === this.lastHistory) return;
    this.lastHistory = key;
    this.options.onHistoryChange(state);
  }

  private onStackChanged(trigger: string | undefined): void {
    if (this.destroyed) return;
    this.emitHistory();
    if (this.loading > 0 || trigger === "clear" || !this.activeId) return;
    this.touched = true;
    const cause: ChangeCause = this.inLayout ? "layout" : trigger === "undo" ? "undo" : trigger === "redo" ? "redo" : "edit";
    this.lastRevision = `${this.instanceId}:${++this.revisionCounter}`;
    this.options.onChange?.({ revision: this.lastRevision, baseRevision: this.baseRevision, cause, diagramId: this.activeId });
  }

  private isEffectivelyReadOnly(): boolean {
    return this.hostReadOnly || this.lossyGate;
  }

  private applyReadOnly(): void {
    const ro = this.isEffectivelyReadOnly();
    this.root.classList.toggle("bpmn-canvas--readonly", ro);
    this.modeler?.get<ReadOnlyService | undefined>("bpmnCanvasReadOnly")?.setReadOnly(ro);
  }

  private async applyXml(xml: string, revision: string | undefined, epoch: number): Promise<SetXmlResult> {
    const modeler = this.modeler;
    if (!modeler) return { applied: false, reason: "invalid" };
    this.loading++;
    try {
      const diagnostics: Diagnostic[] = [];
      if (hasXmlComment(xml)) {
        diagnostics.push({ code: "comments-present", severity: "warning", destructive: true, message: "XML comments are dropped on save." });
      }
      let defs: DefinitionsLike;
      try {
        const parsed = await modeler.get<ModdleLike>("moddle").fromXML(xml);
        defs = parsed.rootElement;
        diagnostics.push(...classifyWarnings(parsed.warnings), ...analyzeDefinitions(defs));
      } catch (error) {
        return this.reject(epoch, xml, [{ code: "invalid-xml", severity: "error", message: String((error as Error)?.message ?? error).split("\n")[0] ?? "invalid XML" }]);
      }
      this.assertLive(epoch);
      if ((defs.diagrams ?? []).length === 0) return this.reject(epoch, xml, diagnostics);

      try {
        await modeler.importXML(xml);
      } catch (error) {
        this.assertLive(epoch);
        this.setState("error");
        return this.reject(epoch, xml, [...diagnostics, { code: "import-failed", severity: "error", message: String((error as Error)?.message ?? error).split("\n")[0] ?? "import failed" }]);
      }
      this.assertLive(epoch);

      this.inputXml = xml;
      this.touched = false;
      this.baseRevision = revision;
      this.lastRevision = undefined;
      this.diagnostics = diagnostics;
      this.diagrams = (modeler.getDefinitions().diagrams ?? []).map((d) => ({ id: d.id, name: diagramName(d) }));
      this.activeId = this.diagrams[0]?.id;
      this.lossyGate = isLossy(diagnostics) && this.options.allowLossyEdit !== true;
      this.applyReadOnly();
      this.fittedOnce = false;
      this.initialFit();
      this.setState("ready");
      this.emitHistory();
      for (const d of diagnostics) this.emit(d);
      if (this.lossyGate) {
        this.emit({ code: "read-only-lossy", severity: "warning", message: "The document would lose content on save, so it is open read-only. Set allowLossyEdit to edit anyway." });
      }
      return { applied: true };
    } finally {
      this.loading--;
    }
  }

  /** Document not applied. The last good document, if any, stays displayed. */
  private reject(epoch: number, xml: string, diagnostics: Diagnostic[]): SetXmlResult {
    this.assertLive(epoch);
    if (this.diagrams.length === 0) {
      this.inputXml = xml;
      this.diagnostics = diagnostics;
      this.setState("error");
    }
    for (const d of diagnostics) this.emit(d);
    return { applied: false, reason: "invalid" };
  }

  setXml(xml: string, options: SetXmlOptions = {}): Promise<SetXmlResult> {
    if (this.destroyed) return Promise.reject(abortError());
    const rev = options.revision;
    if (rev !== undefined && (rev === this.baseRevision || rev === this.lastRevision)) {
      return Promise.resolve({ applied: false, reason: "echo" });
    }
    const epoch = ++this.epoch;
    return this.enqueue(epoch, () => this.applyXml(xml, rev, epoch));
  }

  async getXml(): Promise<string> {
    const q = this.queue;
    await q;
    if (this.destroyed) throw abortError();
    const modeler = this.modeler;
    if (!modeler || this.diagrams.length === 0) return this.inputXml;
    const de = modeler.get<DirectEditingLike | undefined>("directEditing");
    if (de?.isActive()) de.complete();
    if (!this.touched) return this.inputXml;
    try {
      return (await modeler.saveXML({ format: true })).xml;
    } catch (error) {
      const d: Diagnostic = { code: "save-failed", severity: "error", message: String((error as Error)?.message ?? error) };
      this.emit(d);
      throw error;
    }
  }

  getDiagrams(): readonly DiagramInfo[] {
    return this.diagrams;
  }

  getActiveDiagramId(): string | undefined {
    return this.activeId;
  }

  selectDiagram(id: string): Promise<void> {
    if (this.destroyed) return Promise.reject(abortError());
    const epoch = this.epoch;
    const nav = ++this.navSeq;
    return this.enqueue(epoch, async () => {
      if (nav !== this.navSeq) throw abortError();
      const modeler = this.modeler;
      if (!modeler || !this.diagrams.some((d) => d.id === id)) {
        const e = new Error(`Unknown diagram id "${id}"`);
        e.name = "UnknownDiagramError";
        throw e;
      }
      if (id === this.activeId) return;
      const de = modeler.get<DirectEditingLike | undefined>("directEditing");
      if (de?.isActive()) de.complete();
      this.loading++;
      try {
        await modeler.open(id);
      } finally {
        this.loading--;
      }
      this.assertLive(epoch);
      if (nav !== this.navSeq) throw abortError();
      this.activeId = id;
      this.applyFit(this.fitMode);
      this.emitHistory();
      this.options.onChange?.({ revision: this.lastRevision ?? `${this.instanceId}:${this.revisionCounter}`, baseRevision: this.baseRevision, cause: "diagram-switch", diagramId: id });
    });
  }

  getDiagnostics(): readonly Diagnostic[] {
    return this.diagnostics;
  }

  setReadOnly(value: boolean): void {
    if (this.destroyed) return;
    this.hostReadOnly = value;
    this.applyReadOnly();
  }

  isReadOnly(): boolean {
    return this.isEffectivelyReadOnly();
  }

  getReadOnlyReason(): "host" | "lossy" | undefined {
    return this.hostReadOnly ? "host" : this.lossyGate ? "lossy" : undefined;
  }

  /** First fit after an import: only once the canvas has a size, otherwise the resize observer does it. */
  private initialFit(): void {
    const box = this.root.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) this.applyFit(this.fitMode);
  }

  private applyFit(mode: FitMode, inset?: number): void {
    const modeler = this.modeler;
    if (this.destroyed || !modeler || this.diagrams.length === 0) return;
    const canvas = modeler.get<CanvasLike>("canvas");
    try {
      const shapes: ShapeLike[] = [];
      for (const e of modeler.get<RegistryLike>("elementRegistry").getAll()) {
        if (e.type === "bpmn:Process" || e.type === "bpmn:Collaboration") continue;
        if (typeof e.x === "number" && typeof e.y === "number" && typeof e.width === "number" && typeof e.height === "number") {
          shapes.push({ x: e.x, y: e.y, width: e.width, height: e.height, type: e.type });
        } else if (Array.isArray(e.waypoints)) {
          for (const wp of e.waypoints) shapes.push({ x: wp.x, y: wp.y, width: 1, height: 1, type: e.type });
        }
      }
      const palette = this.root.querySelector(".djs-palette")?.getBoundingClientRect();
      const left = this.root.getBoundingClientRect().left;
      const measured = palette && palette.width > 0 ? palette.right - left + 8 : 0;
      const view = initialView(shapes, canvas.getSize(), inset ?? Math.max(measured, PALETTE_FLOOR[this.profileId]), mode === "whole");
      if (!view) canvas.zoom("fit-viewport", "auto");
      else canvas.viewbox(view.viewbox);
      this.fittedOnce = true;
    } catch {
      // Geometry unavailable (for instance jsdom): keep the default view.
    }
  }

  fit(options: FitOptions = {}): void {
    this.applyFit(options.mode ?? "whole", options.inset);
  }

  setFitMode(mode: FitMode): void {
    if (this.destroyed) return;
    this.fitMode = mode;
    if (!this.modeler || this.diagrams.length === 0) return;
    const win = this.root.ownerDocument.defaultView;
    const refit = (): void => {
      if (this.destroyed || !this.modeler) return;
      this.modeler.get<CanvasLike>("canvas").resized();
      this.applyFit(mode);
    };
    if (win?.requestAnimationFrame) win.requestAnimationFrame(refit);
    else refit();
  }

  private zoomLimits(): { min: number; max: number } {
    return { min: this.options.zoomLimits?.min ?? DEFAULT_ZOOM_MIN, max: this.options.zoomLimits?.max ?? DEFAULT_ZOOM_MAX };
  }

  getZoom(): number {
    const z = this.modeler && this.diagrams.length > 0 ? this.modeler.get<CanvasLike>("canvas").zoom() : 1;
    return typeof z === "number" ? z : 1;
  }

  zoomTo(scale: number, center: "auto" | { x: number; y: number } = "auto"): void {
    if (this.destroyed || !this.modeler || this.diagrams.length === 0) return;
    const { min, max } = this.zoomLimits();
    this.modeler.get<CanvasLike>("canvas").zoom(Math.min(max, Math.max(min, scale)), center);
  }

  zoomBy(factor: number, center: "auto" | { x: number; y: number } = "auto"): void {
    this.zoomTo(this.getZoom() * factor, center);
  }

  setProfile(profile: ProfileId, legendTokens?: Partial<LegendTokens>): Promise<void> {
    if (this.destroyed) return Promise.reject(abortError());
    const epoch = this.epoch;
    return this.enqueue(epoch, async () => {
      const [engine, next] = await Promise.all([loadEngine(), loadProfile(profile, legendTokens)]);
      this.assertLive(epoch);
      const old = this.modeler;
      const hadDocument = !!old && this.diagrams.length > 0;
      let xml = this.inputXml;
      let view: { x: number; y: number; width: number; height: number } | undefined;
      if (old && hadDocument) {
        const de = old.get<DirectEditingLike | undefined>("directEditing");
        if (de?.isActive()) de.complete();
        if (this.touched) xml = (await old.saveXML({ format: true })).xml;
        view = old.get<CanvasLike>("canvas").viewbox();
        this.assertLive(epoch);
      }
      this.loading++;
      try {
        this.removeWheel();
        this.removeDrilldown();
        old?.destroy();
        this.modeler = undefined;
        this.profileId = profile;
        this.legendTokens = legendTokens;
        const modeler = await this.createModeler(engine, next);
        if (hadDocument) {
          await modeler.importXML(xml, this.activeId);
          this.assertLive(epoch);
          if (view) modeler.get<CanvasLike>("canvas").viewbox({ x: view.x, y: view.y, width: view.width, height: view.height });
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        this.setState("error");
        this.emit({ code: "import-failed", severity: "error", message: `Profile switch failed: ${String((error as Error)?.message ?? error)}` });
        throw error;
      } finally {
        this.loading--;
      }
      this.assertLive(epoch);
      if (hadDocument && this.activeId) {
        this.inputXml = xml;
        this.touched = false;
        this.emitHistory();
        this.options.onChange?.({ revision: this.lastRevision ?? `${this.instanceId}:${this.revisionCounter}`, baseRevision: this.baseRevision, cause: "profile-switch", diagramId: this.activeId });
      }
    });
  }

  private stack(): CommandStackLike | undefined {
    return this.modeler?.get<CommandStackLike>("commandStack");
  }

  canUndo(): boolean {
    return this.stack()?.canUndo() ?? false;
  }

  canRedo(): boolean {
    return this.stack()?.canRedo() ?? false;
  }

  undo(): void {
    if (!this.destroyed) this.stack()?.undo();
  }

  redo(): void {
    if (!this.destroyed) this.stack()?.redo();
  }

  autoLayout(): Promise<LayoutResult> {
    if (this.destroyed) return Promise.reject(abortError());
    const epoch = this.epoch;
    return this.enqueue(epoch, async () => {
      const modeler = this.modeler;
      const service = modeler?.get<BpmnCanvasLayoutService | undefined>("bpmnCanvasLayout");
      if (!modeler || !service || this.diagrams.length === 0) {
        this.emit({ code: "layout-unsupported", severity: "warning", message: "No document is displayed, so there is nothing to lay out." });
        return { changed: 0, skipped: [] };
      }
      if (this.isEffectivelyReadOnly()) {
        this.emit({ code: "layout-unsupported", severity: "warning", message: "The canvas is read-only." });
        return { changed: 0, skipped: [] };
      }
      this.inLayout = true;
      try {
        const result = await service.run();
        this.assertLive(epoch);
        if (result.changed === 0 || result.skipped.length > 0) {
          this.emit({ code: "layout-unsupported", severity: "warning", ids: result.skipped, message: result.changed === 0 ? "Nothing could be laid out." : `${result.skipped.length} element(s) were not placed.` });
        }
        return result;
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        this.emit({ code: "layout-failed", severity: "error", message: String((error as Error)?.message ?? error) });
        throw error;
      } finally {
        this.inLayout = false;
      }
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.epoch++;
    this.navSeq++;
    if (this.options.signal && this.abortListener) this.options.signal.removeEventListener("abort", this.abortListener);
    this.removeWheel();
    this.removeDrilldown();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    try {
      this.modeler?.destroy();
    } finally {
      this.modeler = undefined;
      this.root.remove();
      this.setState("destroyed");
    }
  }
}

export function createBpmnCanvas(host: HTMLElement, options: BpmnCanvasOptions = {}): BpmnCanvasHandle {
  return new CanvasController(host, options);
}
