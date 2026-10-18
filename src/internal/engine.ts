/**
 * Lazy engine loading. Importing the package root never touches bpmn-js or the DOM;
 * the engine is loaded when a canvas or a render is actually created.
 */
import type { BpmnCanvasConfig, ProfileDefinition } from "./contracts.js";
import type { LegendTokens, ProfileId, ProfileOptions } from "../types.js";

export interface ModdleLike {
  fromXML(xml: string): Promise<{ rootElement: DefinitionsLike; warnings: Array<{ message: string; element?: { id?: string }; value?: string }> }>;
}

export interface DefinitionsLike {
  readonly $type: string;
  readonly diagrams?: DiagramLike[];
  $instanceOf(type: string): boolean;
  readonly [key: string]: unknown;
}

export interface DiagramLike {
  readonly id: string;
  readonly name?: string;
  readonly plane: { readonly bpmnElement?: { readonly id: string; readonly name?: string; readonly participants?: Array<{ name?: string }> } };
}

export interface EventBusLike {
  on(event: string, callback: (event: any) => unknown): void;
  on(event: string, priority: number, callback: (event: any) => unknown): void;
  off(event: string, callback: (event: any) => unknown): void;
}

export interface ViewerLike {
  importXML(xml: string, diagram?: unknown): Promise<{ warnings: Array<{ message: string }> }>;
  open(diagramOrId: unknown): Promise<{ warnings: Array<{ message: string }> }>;
  saveXML(options?: { format?: boolean }): Promise<{ xml: string }>;
  saveSVG(): Promise<{ svg: string }>;
  getDefinitions(): DefinitionsLike;
  get<T = unknown>(name: string): T;
  destroy(): void;
}

type ViewerCtor = new (options: Record<string, unknown>) => ViewerLike;

interface Engine {
  readonly Modeler: ViewerCtor;
}

let enginePromise: Promise<Engine> | undefined;
let viewerPromise: Promise<ViewerCtor> | undefined;

/** The editing engine. Loaded only when a canvas is created. */
export function loadEngine(): Promise<Engine> {
  enginePromise ??= import("bpmn-js/lib/Modeler.js").then(
    (m) => ({ Modeler: m.default as unknown as ViewerCtor }),
    (error) => {
      enginePromise = undefined;
      throw error;
    },
  );
  return enginePromise;
}

/** The read-only engine, much lighter than the Modeler: static renders and import validation use it alone. */
export function loadViewer(): Promise<ViewerCtor> {
  viewerPromise ??= import("bpmn-js/lib/Viewer.js").then(
    (m) => m.default as unknown as ViewerCtor,
    (error) => {
      viewerPromise = undefined;
      throw error;
    },
  );
  return viewerPromise;
}

export async function loadProfile(id: ProfileId, tokens?: Partial<LegendTokens>, options: ProfileOptions = {}): Promise<ProfileDefinition> {
  let profile: ProfileDefinition;
  if (id === "legend") {
    const mod = (await import("../profiles/legend/index.js")) as unknown as { legendProfile(tokens?: Partial<LegendTokens>): ProfileDefinition };
    profile = mod.legendProfile(tokens);
  } else if (id === "colored") {
    const mod = await import("../profiles/colored/index.js");
    profile = mod.coloredProfile(tokens);
    if (options.drawing === "classic") {
      const { ClassicRendererModule } = await import("../profiles/colored/classic.js");
      profile = {
        ...profile,
        tokens: profile.tokens ?? mod.resolveColoredTokens(tokens),
        modelerModules: [...profile.modelerModules, ClassicRendererModule],
        viewerModules: [...profile.viewerModules, ClassicRendererModule],
      };
    }
  } else {
    profile = { id: "standard", modelerModules: [], viewerModules: [] };
  }
  if (options.palette === "legend" && id !== "legend") {
    const palette = (await import("../profiles/legend/palette.js")) as unknown as { LegendPaletteModule: unknown };
    profile = { ...profile, modelerModules: [...profile.modelerModules, palette.LegendPaletteModule] };
  }
  return profile;
}

export function profileConfig(instanceId: string, profile: ProfileDefinition, paletteColumns?: "auto" | 1 | 2): BpmnCanvasConfig {
  const columns = paletteColumns ? { paletteColumns } : {};
  if (!profile.tokens) return { instanceId, ...columns };
  return profile.id === "colored" ? { instanceId, colored: profile.tokens, ...(profile.named ? { coloredNamed: profile.named } : {}), ...columns } : { instanceId, legend: profile.tokens, ...columns };
}

/** Unique per canvas or render. Prefixes any id a profile or module creates. */
export function newInstanceId(): string {
  return `bc${Math.random().toString(36).slice(2, 8)}${(counter++).toString(36)}`;
}
let counter = 0;

export function diagramName(d: DiagramLike): string {
  const el = d.plane.bpmnElement;
  const pools = (el?.participants ?? []).map((p) => p.name).filter(Boolean).join(" · ");
  return d.name || el?.name || pools || el?.id || d.id;
}
