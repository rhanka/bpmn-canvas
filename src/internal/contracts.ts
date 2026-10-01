/**
 * Internal contracts shared by the core, the profiles and the layout module.
 * None of this is public API.
 */

/**
 * Value injected as `config.bpmnCanvas` into every diagram-js injector the core creates.
 * Modules read it with `static $inject = ['config.bpmnCanvas']` (or `$inject = [...]`).
 */
export interface BpmnCanvasConfig {
  /** Unique per canvas instance. Prefix every DOM id, SVG marker and gradient id with it. */
  readonly instanceId: string;
  /** Present only for the `legend` profile. */
  readonly legend?: LegendTokens;
}

/** Neutral, host-overridable look inputs for the `legend` profile. No brand values live in this package. */
export interface LegendTokens {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly fill: string;
  readonly text: string;
  readonly app: string;
  readonly doc: string;
  readonly laneFill: string;
}

export interface ProfileDefinition {
  readonly id: "standard" | "legend";
  /** diagram-js modules added to the Modeler. Empty for `standard`. */
  readonly modelerModules: readonly unknown[];
  /** diagram-js modules added to the render-only Viewer. */
  readonly viewerModules: readonly unknown[];
  /** Extra Modeler/Viewer options merged under `bpmnCanvas`. */
  readonly tokens?: LegendTokens;
}

/** Service registered by the layout module under the name `bpmnCanvasLayout`. */
export interface BpmnCanvasLayoutService {
  /**
   * Re-positions existing DI. One undo step. Never creates DI.
   * `skipped` lists the ids it could not place, with no silent drop.
   */
  run(): Promise<{ changed: number; skipped: string[] }>;
}
