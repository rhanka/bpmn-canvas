import { selectLook } from "./legacy-policy.js";
import type { BusinessPolicy } from "./business-policy.js";
import { ProfileContractError } from "../profile/canonical.js";
/**
 * Lazy engine loading. Importing the package root never touches bpmn-js or the DOM;
 * the engine is loaded when a canvas or a render is actually created.
 */
import type { BpmnCanvasConfig, ProfileDefinition } from "./contracts.js";
import type { AnnotatedTokens, LegendTokens, ProfileId, ProfileOptions } from "../types.js";

/** Published look-token options stay as aliases: new names first, then the old published names. */
export function tokensFromOptions(
  options: {
    readonly tokens?: Partial<AnnotatedTokens>;
    readonly recolorTokens?: Partial<AnnotatedTokens>;
    readonly annotatedTokens?: Partial<AnnotatedTokens>;
    readonly legendTokens?: Partial<LegendTokens>;
    readonly coloredTokens?: Partial<LegendTokens>;
  },
): Partial<AnnotatedTokens> | undefined {
  return (
    options.tokens ??
    options.recolorTokens ??
    options.annotatedTokens ??
    options.coloredTokens ??
    options.legendTokens
  );
}

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

export async function loadProfile(id: ProfileId, tokens?: Partial<AnnotatedTokens>, options: ProfileOptions = {}, businessPolicy?: BusinessPolicy): Promise<ProfileDefinition> {
  const request = { ...(id ? { look: id } : {}), tokens, options };
  const selection = selectLook(request, businessPolicy);
  if (selection.status === "refused") throw new ProfileContractError(selection.code);
  const registry: Record<string, unknown> = {};
  if (selection.modelerModules.includes("annotated-renderer")) {
    const mod = await import("../presentation/annotated/renderer.js");
    registry["annotated-renderer"] = mod.AnnotatedRendererModule; registry["annotated-follow"] = mod.AnnotatedFollowModule;
  }
  if (selection.modelerModules.includes("recolor-renderer")) registry["recolor-renderer"] = (await import("../presentation/recolor/renderer.js")).RecolorRendererModule;
  if (selection.modelerModules.includes("flat-renderer")) registry["flat-renderer"] = (await import("../presentation/recolor/flat.js")).FlatRendererModule;
  if (selection.modelerModules.includes("annotated-palette")) registry["annotated-palette"] = (await import("../presentation/annotated/palette.js")).AnnotatedPaletteModule;
  return { id, renderer: selection.renderer, modelerModules: selection.modelerModules.map((id: string) => registry[id]), viewerModules: selection.viewerModules.map((id: string) => registry[id]), paletteFloor: selection.paletteFloor, markerSelectors: selection.markerSelectors, ...(selection.tokens ? { tokens: selection.tokens } : {}), ...(selection.named ? { named: selection.named } : {}), ...(businessPolicy ? { businessPolicy } : {}) };
}

export function profileConfig(instanceId: string, profile: ProfileDefinition, paletteColumns?: "auto" | 1 | 2, ioSetSelections?: Readonly<Record<string, string>>): BpmnCanvasConfig {
  return { instanceId, ...(ioSetSelections ? { ioSetSelections } : {}), ...(profile.tokens ? { lookTokens: profile.tokens } : {}), ...(profile.named ? { namedTokens: profile.named } : {}), ...(profile.businessPolicy ? { businessPolicy: profile.businessPolicy } : {}), ...(profile.renderer ? { renderer: profile.renderer } : {}), ...(paletteColumns ? { paletteColumns } : {}) };
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
