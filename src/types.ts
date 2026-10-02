/** Public types. Nothing here references bpmn-js, diagram-js or any DOM-only global at runtime. */

import type { LegendTokens } from "./internal/contracts.js";

export type { LegendTokens };
/** `standard`: upstream bpmn-js. `legend`: the legend look. `colored`: upstream notation, drawn by upstream, recoloured by tokens. */
export type ProfileId = "standard" | "legend" | "colored";

export type PaletteColumns = 1 | 2 | "auto";

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

export type ChangeCause = "edit" | "undo" | "redo" | "layout" | "diagram-switch" | "profile-switch";

export interface BpmnChange {
  /**
   * Local content revision of this canvas. Opaque token. It does not change on
   * `diagram-switch` or `profile-switch`, which carry the current content revision.
   */
  readonly revision: string;
  /** Host revision supplied with the last applied `setXml` (or the initial option), if any. */
  readonly baseRevision: string | undefined;
  readonly cause: ChangeCause;
  readonly diagramId: string;
}

export type CanvasState = "loading" | "ready" | "error" | "destroyed";

/**
 * `zoom`: diagram-js default. `page-scroll`: the page scrolls, Ctrl/Meta+wheel zooms.
 * `zoom-cursor`: a plain wheel zooms around the cursor (x1.15 / x0.87, within the zoom limits);
 * Ctrl/Meta+wheel and pinch stay native.
 */
export type WheelMode = "zoom" | "page-scroll" | "zoom-cursor";

/** `whole` fits the whole diagram. `readable` fits it when it stays readable, else zooms on the process start. */
export type FitMode = "readable" | "whole";

export interface FitOptions {
  readonly mode?: FitMode;
  /** Left px kept clear for the palette. Default: the measured palette width, with a per-profile floor. */
  readonly inset?: number;
}

export interface ElementClick {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly calledElement?: string;
  /** True when the click hit a sub-process expansion marker or drill-down icon, not the element body. */
  readonly marker: boolean;
}

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

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
  /** Look inputs for the `legend` profile. Missing keys fall back to neutral defaults. */
  readonly legendTokens?: Partial<LegendTokens>;
  /** Colours of the `colored` profile, same fields as the legend tokens. Missing keys fall back to neutral defaults. */
  readonly coloredTokens?: Partial<LegendTokens>;
  /** Palette layout: one column, two, or diagram-js default (`auto`, which switches on the available height). */
  readonly paletteColumns?: PaletteColumns;
  readonly readOnly?: boolean;
  /** Allow editing even when the import is lossy. Default false: lossy documents open read-only. */
  readonly allowLossyEdit?: boolean;
  readonly signal?: AbortSignal;
  /** `zoom` captures the wheel like diagram-js. `page-scroll` lets the page scroll and zooms on Ctrl/Meta+wheel only. */
  readonly wheel?: WheelMode;
  /** Fit used after import and diagram switch, and re-applied on every resize when `whole`. Default `readable`. */
  readonly fitMode?: FitMode;
  /**
   * What the bpmn-js drill-down button of a collapsed sub-process does. `native` (default): bpmn-js
   * navigates to the sub-process plane; the active diagram follows and an `onChange` with cause
   * `diagram-switch` is emitted. `event`: the click is reported through `onElementClick` with
   * `marker: true` and nothing navigates, so the host decides (for instance with `selectDiagram`).
   */
  readonly drilldown?: "native" | "event";
  readonly zoomLimits?: { readonly min?: number; readonly max?: number };
  /** Fires for clicks on elements, with marker detection done for both profiles. Also fires when read-only. */
  readonly onElementClick?: (click: ElementClick) => void;
  /** Fires whenever the undo/redo availability may have changed. */
  readonly onHistoryChange?: (history: HistoryState) => void;
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
  /** Default mode `whole`. */
  fit(options?: FitOptions): void;
  setFitMode(mode: FitMode): void;
  zoomTo(scale: number): void;
  zoomBy(factor: number): void;
  getZoom(): number;
  /**
   * Switches the look without changing the document: the modeler is recreated with the same XML,
   * active diagram and viewbox. The undo stack is lost. Emits `onChange` with cause `profile-switch`
   * and no new content revision.
   */
  setProfile(profile: ProfileId, tokens?: Partial<LegendTokens>): Promise<void>;
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
  readonly legendTokens?: Partial<LegendTokens>;
  readonly coloredTokens?: Partial<LegendTokens>;
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
