/**
 * Palette support, always loaded by the core:
 * - `paletteColumns` forces one or two columns by wrapping `_toggleState` on THIS instance's palette
 *   service (never on a prototype), so the choice survives every re-layout: resize, open and close,
 *   palette updates and read-only toggles. `auto` keeps diagram-js behaviour.
 * - Token-driven icon colours: CSS custom properties are set on this instance's root with
 *   `style.setProperty` (CSSOM, so a strict CSP `style-src` is not violated). They are removed when
 *   the modeler is destroyed, so a profile switch on the same root never leaves stale colours.
 */
import type { BpmnCanvasConfig, LegendTokens } from "./contracts.js";

/** Palette widths of diagram-js (px). The core measures the real width; these are for documentation and tests. */
export const PALETTE_FOOTPRINT = { oneColumn: 48, twoColumns: 94 } as const;

/** Root class that scopes the colours of the upstream palette to the `colored` profile. */
export const COLORED_ROOT_CLASS = "bpmn-canvas--colored";

/** CSS custom property per palette group, and the token that feeds it. */
export const ICON_VARIABLES: Readonly<Record<string, keyof LegendTokens>> = Object.freeze({
  "--bpmn-canvas-icon-start": "eventLine",
  "--bpmn-canvas-icon-end": "eventLine",
  "--bpmn-canvas-icon-intermediate": "eventLine",
  "--bpmn-canvas-icon-task": "taskLine",
  "--bpmn-canvas-icon-subprocess": "taskLine",
  "--bpmn-canvas-icon-external": "externalLine",
  "--bpmn-canvas-icon-gateway": "gatewayLine",
  "--bpmn-canvas-icon-data": "dataLine",
  "--bpmn-canvas-icon-document": "docLine",
  "--bpmn-canvas-icon-application": "appLine",
  "--bpmn-canvas-icon-lane": "laneLine",
  "--bpmn-canvas-icon-pool": "poolLine",
  "--bpmn-canvas-icon-flow": "flow",
});

/** Variable name -> colour, for the tokens given. */
export function iconColors(tokens: Partial<LegendTokens>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [variable, token] of Object.entries(ICON_VARIABLES)) {
    const value = tokens[token];
    if (typeof value === "string" && value) out[variable] = value;
  }
  return out;
}

interface PaletteLike {
  _toggleState(state?: { open?: boolean; twoColumn?: boolean }): void;
}
interface InjectorLike {
  get(name: string, strict?: boolean): unknown;
}
interface CanvasLike {
  getContainer(): HTMLElement | undefined;
}
interface EventBusLike {
  on(event: string, callback: () => void): void;
}

class PaletteSupport {
  static $inject = ["config.bpmnCanvas", "canvas", "eventBus", "injector"];

  constructor(config: BpmnCanvasConfig | undefined, canvas: CanvasLike, eventBus: EventBusLike, injector: InjectorLike) {
    const columns = config?.paletteColumns ?? "auto";
    const palette = injector.get("palette", false) as PaletteLike | null;
    if (palette && columns !== "auto") {
      const toggle = palette._toggleState.bind(palette);
      palette._toggleState = (state = {}) => toggle("twoColumn" in state ? state : { ...state, twoColumn: columns === 2 });
    }

    const tokens = config?.legend ?? config?.colored;
    const colored = !!config?.colored;
    let applied: string[] = [];
    let root: HTMLElement | null = null;

    const apply = (): void => {
      // At diagram.init the container is not yet attached to the root: retry once attached.
      root = canvas.getContainer()?.closest<HTMLElement>(".bpmn-canvas") ?? root;
      if (!root || !tokens || applied.length > 0) return;
      const colors = iconColors(tokens);
      for (const [variable, value] of Object.entries(colors)) root.style.setProperty(variable, value);
      applied = Object.keys(colors);
      if (colored) root.classList.add(COLORED_ROOT_CLASS);
    };
    const clear = (): void => {
      if (!root) return;
      for (const variable of applied) root.style.removeProperty(variable);
      root.classList.remove(COLORED_ROOT_CLASS);
      applied = [];
      root = null;
    };
    eventBus.on("diagram.init", () => {
      apply();
      queueMicrotask(apply);
    });
    eventBus.on("import.done", apply);
    eventBus.on("diagram.destroy", clear);
  }
}

export const PaletteSupportModule = {
  __init__: ["bpmnCanvasPalette"],
  bpmnCanvasPalette: ["type", PaletteSupport],
};
