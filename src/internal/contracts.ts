import type { BusinessPolicy } from "./business-policy.js";
/**
 * Internal contracts shared by the core, the profiles and the layout module.
 * None of this is public API.
 */

/**
 * Value injected as `config.bpmnCanvas` into every diagram-js injector the core creates.
 * Modules read it with `static $inject = ['config.bpmnCanvas']` (or `$inject = [...]`).
 */
export interface BpmnCanvasConfig {
  readonly ioSetSelections?: Readonly<Record<string, string>>;
  /** Unique per canvas instance. Prefix every DOM id, SVG marker and gradient id with it. */
  readonly instanceId: string;
  readonly lookTokens?: AnnotatedTokens;
  readonly namedTokens?: readonly string[];
  readonly renderer?: string;
  readonly businessPolicy?: BusinessPolicy;
  /** Present only for the `annotated` profile. */
  /** Present only for the `recolor` profile. */
  /** `recolor` only: the token names the host gave. Only those recolour; the others keep the upstream colour. */
  readonly paletteColumns?: 1 | 2 | "auto";
}

/**
 * Host-overridable look inputs for the `annotated` and `recolor` profiles. A host passes a `Partial`; missing keys
 * fall back to the profile defaults (annotated: the reference Custom look; recolor: neutral values), with two
 * convenience fallbacks: `stroke` feeds every `*Line` and `flow` not given, and `fill`
 * feeds `taskFill` when not given. `taskFillEnd` is derived from `taskFill` when not given.
 */
export interface AnnotatedTokens {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly strokeWidth: number;
  /** Generic line colour (fallback for the per-type lines, flows and links). */
  readonly stroke: string;
  /** Generic light colour: fallback of `taskFill` and text colour on dark fills. */
  readonly fill: string;
  readonly text: string;
  /**
   * Colour of the labels placed outside their shape (events, gateways, flows). `recolor` look: falls back to `text`.
   * `annotated` look: the upstream colour (`#22242a`) is kept unless the host names this token.
   */
  readonly labelText: string;
  /** Text colour of pool and lane header columns. */
  readonly headerText: string;
  /** Sequence flow stroke. */
  readonly flow: string;
  /** Association and data-link stroke. */
  readonly link: string;
  /** Stroke of an association that ends on a `[LX-MK-1]` annotation. Falls back to `link`. */
  readonly docLink: string;
  /** `stroke-dasharray` of that association, for instance `5 5`. */
  readonly docLinkDash: string;
  /**
   * Annotated look only: draw the arrow head on task input and output associations. Default false (the reference
   * look draws plain dashed lines); true follows the BPMN notation.
   */
  readonly dataLinkArrow: boolean;
  readonly taskLine: string;
  /** Start tone of the horizontal task gradient. */
  readonly taskFill: string;
  /** End tone of the task gradient. */
  readonly taskFillEnd: string;
  readonly eventLine: string;
  readonly eventFill: string;
  readonly gatewayLine: string;
  readonly gatewayFill: string;
  readonly poolLine: string;
  readonly poolFill: string;
  readonly laneLine: string;
  readonly laneFill: string;
  /** Fill of the header column of a lane (annotated look). Falls back to `laneFill`. */
  readonly laneHeaderFill: string;
  /** External (call) process, external input and process output. */
  readonly externalLine: string;
  readonly externalFill: string;
  /** `[LX-MK-1]` annotation (document). */
  readonly docLine: string;
  readonly docFill: string;
  /** Task input and output (data object). */
  readonly dataLine: string;
  readonly dataFill: string;
  /** `[LX-MK-2]` annotation (application component box). */
  readonly appLine: string;
  readonly appFill: string;
}

export interface ProfileDefinition {
  readonly businessPolicy?: BusinessPolicy;
  readonly renderer?: string;
  readonly paletteFloor?: number;
  readonly markerSelectors?: readonly string[];
  readonly id: string;
  /** diagram-js modules added to the Modeler. Empty for `standard`. */
  readonly modelerModules: readonly unknown[];
  /** diagram-js modules added to the render-only Viewer. */
  readonly viewerModules: readonly unknown[];
  /** Extra Modeler/Viewer options merged under `bpmnCanvas`. */
  readonly tokens?: AnnotatedTokens;
  /** `recolor` only: names of the tokens the host gave, with the `stroke`/`fill` conveniences expanded. */
  readonly named?: readonly string[];
}

/** Service registered by the layout module under the name `bpmnCanvasLayout`. */
export interface BpmnCanvasLayoutService {
  /**
   * Re-positions existing DI. One undo step. Never creates DI.
   * `skipped` lists the ids it could not place, with no silent drop.
   * `isCurrent`, checked after every await with the service's own checks: false rejects with an AbortError and
   * moves nothing.
   */
  run(isCurrent?: () => boolean): Promise<{ changed: number; skipped: string[] }>;
}
