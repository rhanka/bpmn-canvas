/**
 * Lazy engine loading. Importing the package root never touches bpmn-js or the DOM;
 * the engine is loaded when a canvas or a render is actually created.
 */
import type { BpmnCanvasConfig, ProfileDefinition } from "./contracts.js";
import type { LegendTokens, ProfileId } from "../types.js";

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
  readonly Viewer: ViewerCtor;
}

let enginePromise: Promise<Engine> | undefined;

export function loadEngine(): Promise<Engine> {
  enginePromise ??= Promise.all([import("bpmn-js/lib/Modeler"), import("bpmn-js/lib/Viewer")]).then(
    ([m, v]) => ({ Modeler: m.default as unknown as ViewerCtor, Viewer: v.default as unknown as ViewerCtor }),
    (error) => {
      enginePromise = undefined;
      throw error;
    },
  );
  return enginePromise;
}

export async function loadProfile(id: ProfileId, tokens?: Partial<LegendTokens>): Promise<ProfileDefinition> {
  if (id === "legend") {
    const mod = (await import("../profiles/legend/index.js")) as unknown as { legendProfile(tokens?: Partial<LegendTokens>): ProfileDefinition };
    return mod.legendProfile(tokens);
  }
  if (id === "colored") {
    const mod = (await import("../profiles/colored/index.js")) as unknown as { coloredProfile(tokens?: Partial<LegendTokens>): ProfileDefinition };
    return mod.coloredProfile(tokens);
  }
  return { id: "standard", modelerModules: [], viewerModules: [] };
}

export function profileConfig(instanceId: string, profile: ProfileDefinition, paletteColumns?: "auto" | 1 | 2): BpmnCanvasConfig {
  const columns = paletteColumns ? { paletteColumns } : {};
  if (!profile.tokens) return { instanceId, ...columns };
  return profile.id === "colored" ? { instanceId, colored: profile.tokens, ...columns } : { instanceId, legend: profile.tokens, ...columns };
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
