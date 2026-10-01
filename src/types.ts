/** Public types. Nothing here references bpmn-js, diagram-js or any DOM-only global at runtime. */

export type ProfileId = "standard" | "legend";

export type DiagnosticCode =
  | "invalid-xml"
  | "import-failed"
  | "import-warning"
  | "unresolved-reference"
  | "unparsable-content"
  | "duplicate-id"
  | "comments-present"
  | "missing-di"
  | "partial-di"
  | "incomplete-io-specification"
  | "filtered-small"
  | "render-failed"
  | "layout-unsupported"
  | "layout-failed"
  | "read-only-lossy"
  | "save-failed";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** BPMN element ids involved, when known. */
  readonly ids?: readonly string[];
  readonly diagramId?: string;
  /** True when serialising after an edit would drop or alter this content. */
  readonly destructive?: boolean;
}

export interface DiagramInfo {
  readonly id: string;
  readonly name: string;
}

export type ChangeCause = "edit" | "undo" | "redo" | "layout" | "diagram-switch";

export interface BpmnChange {
  /**
   * Local content revision of this canvas. Opaque token. It does not change on
   * `diagram-switch`, which carries the current content revision.
   */
  readonly revision: string;
  /** Host revision supplied with the last applied `setXml` (or the initial option), if any. */
  readonly baseRevision: string | undefined;
  readonly cause: ChangeCause;
  readonly diagramId: string;
}

export type CanvasState = "loading" | "ready" | "error" | "destroyed";

export type WheelMode = "zoom" | "page-scroll";

export interface SetXmlOptions {
  /** Host revision of this document. Re-sending a revision already applied or emitted is an echo and is ignored. */
  readonly revision?: string;
}

export type SetXmlResult =
  | { readonly applied: true }
  /** `echo`: revision already applied or emitted. `invalid`: not imported; the reason is in the diagnostics and the last good document stays. */
  | { readonly applied: false; readonly reason: "echo" | "invalid" };

export interface LayoutResult {
  readonly changed: number;
  readonly skipped: readonly string[];
}

export interface BpmnCanvasOptions {
  readonly xml?: string;
  readonly revision?: string;
  readonly profile?: ProfileId;
  readonly readOnly?: boolean;
  /** Allow editing even when the import is lossy. Default false: lossy documents open read-only. */
  readonly allowLossyEdit?: boolean;
  readonly signal?: AbortSignal;
  /** `zoom` captures the wheel like diagram-js. `page-scroll` lets the page scroll and zooms on Ctrl/Meta+wheel only. */
  readonly wheel?: WheelMode;
  /** `auto` installs styles at mount. `external` leaves the host to load `styles.css`. */
  readonly styles?: "auto" | "external";
  readonly styleNonce?: string;
  readonly onChange?: (change: BpmnChange) => void;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly onStateChange?: (state: CanvasState) => void;
}

export interface BpmnCanvasHandle {
  /** Resolves once the first load attempt has finished, whatever its outcome. Never rejects. */
  readonly ready: Promise<void>;
  readonly state: CanvasState;
  /** Resolves `{applied:false}` for an echo or an invalid document; rejects with an `AbortError` when superseded or destroyed. */
  setXml(xml: string, options?: SetXmlOptions): Promise<SetXmlResult>;
  /**
   * Complete current document. Returns the exact input bytes while no command has run
   * since the last `setXml` (and no undo returned the stack to a different state).
   * Flushes a pending direct edit first.
   */
  getXml(): Promise<string>;
  getDiagrams(): readonly DiagramInfo[];
  getActiveDiagramId(): string | undefined;
  /** Native `open()`: switches the displayed diagram. Clears the undo stack. Rejects with `AbortError` when superseded. */
  selectDiagram(id: string): Promise<void>;
  getDiagnostics(): readonly Diagnostic[];
  setReadOnly(value: boolean): void;
  isReadOnly(): boolean;
  /** Why the canvas is read-only: `host` (option or setReadOnly) or `lossy` (diagnostic gate). */
  getReadOnlyReason(): "host" | "lossy" | undefined;
  fit(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  /** Moves existing DI only. One undo step. Never generates DI. */
  autoLayout(): Promise<LayoutResult>;
  /** Idempotent, valid in every state. */
  destroy(): void;
}

export interface RenderOptions {
  readonly profile?: ProfileId;
  /** Diagrams whose SVG is smaller than this edge length in px are reported as `filtered-small` (default 20). */
  readonly minSize?: number;
  readonly signal?: AbortSignal;
}

export interface RenderedDiagram extends DiagramInfo {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

export interface RenderResult {
  readonly diagrams: readonly RenderedDiagram[];
  /** Every diagram that was not rendered is explained here, with its `diagramId`. */
  readonly diagnostics: readonly Diagnostic[];
}
