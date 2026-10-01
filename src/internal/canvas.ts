import type {
  BpmnCanvasHandle,
  BpmnCanvasOptions,
  CanvasState,
  ChangeCause,
  Diagnostic,
  DiagramInfo,
  LayoutResult,
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

export function abortError(): Error {
  const e = new Error("Operation aborted: superseded or canvas destroyed");
  e.name = "AbortError";
  return e;
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
  zoom(level: string, center?: string): unknown;
}
interface ZoomScrollLike {
  toggle(enabled: boolean): void;
  stepZoom(delta: number, position?: { x: number; y: number }): void;
}

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
  private abortListener: (() => void) | undefined;

  constructor(host: HTMLElement, options: BpmnCanvasOptions) {
    this.host = host;
    this.options = options;
    this.hostReadOnly = options.readOnly === true;
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
      const [engine, profile] = await Promise.all([loadEngine(), loadProfile(this.options.profile ?? "standard")]);
      if (this.destroyed) return;
      const modeler = new engine.Modeler({
        container: this.root,
        additionalModules: [ReadOnlyModule, ...profile.modelerModules, ...(await this.layoutModules())],
        bpmnCanvas: profileConfig(this.instanceId, profile),
      });
      this.modeler = modeler;
      const bus = modeler.get<EventBusLike>("eventBus");
      bus.on("commandStack.changed", (e: { trigger?: string }) => this.onStackChanged(e.trigger));
      this.setupWheel(modeler);
      this.applyReadOnly();
    } catch (error) {
      const d: Diagnostic = { code: "import-failed", severity: "error", message: `Engine failed to load: ${String((error as Error)?.message ?? error)}` };
      this.diagnostics = [d];
      this.setState("error");
      this.emit(d);
    }
  }

  private async layoutModules(): Promise<unknown[]> {
    try {
      const mod = (await import("./layout/index.js")) as unknown as { BpmnCanvasLayoutModule: unknown };
      return [mod.BpmnCanvasLayoutModule];
    } catch {
      return [];
    }
  }

  private setupWheel(modeler: ViewerLike): void {
    if ((this.options.wheel ?? "zoom") !== "page-scroll") return;
    const zoomScroll = modeler.get<ZoomScrollLike | undefined>("zoomScroll");
    if (!zoomScroll) return;
    zoomScroll.toggle(false);
    this.wheelListener = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = this.root.getBoundingClientRect();
      zoomScroll.stepZoom(e.deltaY < 0 ? 1 : -1, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    this.root.addEventListener("wheel", this.wheelListener, { passive: false });
  }

  private onStackChanged(trigger: string | undefined): void {
    if (this.destroyed || this.loading > 0 || trigger === "clear" || !this.activeId) return;
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
      this.fit();
      this.setState("ready");
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
      this.fit();
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

  fit(): void {
    if (this.destroyed || !this.modeler || this.diagrams.length === 0) return;
    this.modeler.get<CanvasLike>("canvas").zoom("fit-viewport", "auto");
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
    if (this.wheelListener) this.root.removeEventListener("wheel", this.wheelListener);
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
