"use client";

/**
 * assistant-ui adapter. The coupling is structural: nothing here imports `@assistant-ui/react`
 * at runtime or for types, and the structural shapes are checked against the real package
 * (0.15.x) by `tests/types/assistant-ui-compat.ts`.
 *
 * Contract: the host injects how a tool call becomes a document (`resolveArtifact`). The adapter
 * renders a static preview and calls `onOpen`; it never runs a backend tool, never mutates a
 * stored tool result, and never mounts an editable canvas. The host mounts at most one
 * `BpmnCanvas` per document.
 */
import { createElement, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { renderDiagrams } from "../internal/render.js";
import type { RenderedDiagram } from "../types.js";

export interface BpmnArtifact {
  readonly documentId: string;
  readonly revision?: string;
  readonly xml: string;
  readonly title?: string;
}

/** The subset of an assistant-ui tool-call part this adapter reads. */
export interface ToolCallPartLike {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args?: unknown;
  readonly result?: unknown;
  readonly isError?: boolean | undefined;
  readonly isPreliminary?: boolean | undefined;
  readonly status?: { readonly type: string; readonly reason?: string | undefined } | undefined;
}

export type ArtifactResolver = (part: ToolCallPartLike, signal: AbortSignal) => BpmnArtifact | null | Promise<BpmnArtifact | null>;

export type PartState = "running" | "failed" | "complete";

/** Error, incomplete and preliminary results are never treated as a final document. */
export function toolPartState(part: ToolCallPartLike): PartState {
  if (part.isError === true || part.status?.type === "incomplete") return "failed";
  if (part.result !== undefined && part.isPreliminary !== true) return "complete";
  return "running";
}

export type ArtifactLoad =
  | { readonly state: "idle" }
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly artifact: BpmnArtifact }
  | { readonly state: "missing" }
  | { readonly state: "error"; readonly message: string };

/** Resolves the artifact of a completed part. A stale resolution (part change, unmount) is dropped. */
export function useBpmnArtifact(part: ToolCallPartLike, resolveArtifact: ArtifactResolver): ArtifactLoad {
  const [load, setLoad] = useState<ArtifactLoad>({ state: "idle" });
  const partState = toolPartState(part);
  useEffect(() => {
    if (partState !== "complete") {
      setLoad({ state: "idle" });
      return undefined;
    }
    const ac = new AbortController();
    setLoad({ state: "loading" });
    Promise.resolve()
      .then(() => resolveArtifact(part, ac.signal))
      .then(
        (artifact) => {
          if (!ac.signal.aborted) setLoad(artifact ? { state: "ready", artifact } : { state: "missing" });
        },
        (error: unknown) => {
          if (!ac.signal.aborted) setLoad({ state: "error", message: String((error as Error)?.message ?? error) });
        },
      );
    return () => ac.abort();
    // The resolver and the part identity define the work; `part` itself changes identity on every stream tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.toolCallId, partState, part.result, resolveArtifact]);
  return load;
}

const previewCache = new Map<string, Promise<RenderedDiagram | null>>();
const PREVIEW_CACHE_MAX = 50;

function preview(artifact: BpmnArtifact): Promise<RenderedDiagram | null> {
  const key = artifact.revision !== undefined ? `${artifact.documentId}@${artifact.revision}` : `${artifact.documentId}#${artifact.xml.length}:${artifact.xml.slice(0, 64)}`;
  let hit = previewCache.get(key);
  if (!hit) {
    hit = renderDiagrams(artifact.xml).then(
      (r) => r.diagrams[0] ?? null,
      () => null,
    );
    if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value as string);
    previewCache.set(key, hit);
  }
  return hit;
}

export interface BpmnToolLabels {
  readonly running: string;
  readonly failed: string;
  readonly open: string;
  readonly missing: string;
}

const DEFAULT_LABELS: BpmnToolLabels = { running: "Working on the diagram…", failed: "The diagram could not be produced.", open: "Open", missing: "Diagram not available." };

export interface BpmnToolCardProps {
  readonly part: ToolCallPartLike;
  readonly resolveArtifact: ArtifactResolver;
  readonly onOpen?: (artifact: BpmnArtifact) => void;
  readonly labels?: Partial<BpmnToolLabels>;
}

/** Static card: status, then a preview of the first diagram and an Open action. Historical parts stay static. */
export function BpmnToolCard({ part, resolveArtifact, onOpen, labels }: BpmnToolCardProps): ReactElement {
  const text = { ...DEFAULT_LABELS, ...labels };
  const state = toolPartState(part);
  const load = useBpmnArtifact(part, resolveArtifact);
  const artifact = load.state === "ready" ? load.artifact : null;
  const [image, setImage] = useState<RenderedDiagram | null>(null);

  useEffect(() => {
    if (!artifact) {
      setImage(null);
      return undefined;
    }
    let live = true;
    void preview(artifact).then((d) => {
      if (live) setImage(d);
    });
    return () => {
      live = false;
    };
  }, [artifact]);

  const body: ReactElement[] = [];
  if (state === "running" || load.state === "loading") body.push(createElement("span", { key: "s", role: "status" }, text.running));
  else if (state === "failed" || load.state === "error") body.push(createElement("span", { key: "e", role: "alert" }, text.failed));
  else if (load.state === "missing") body.push(createElement("span", { key: "m" }, text.missing));
  else if (artifact) {
    if (image) {
      // An <img> never runs scripts, unlike inline SVG.
      body.push(
        createElement("img", {
          key: "i",
          alt: artifact.title ?? image.name,
          width: image.width,
          height: image.height,
          style: { maxWidth: "100%", height: "auto" },
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.svg)}`,
        }),
      );
    }
    if (onOpen) body.push(createElement("button", { key: "o", type: "button", onClick: () => onOpen(artifact) }, text.open));
  }
  return createElement("div", { "data-bpmn-tool-card": part.toolCallId, "data-state": state }, ...body);
}

export type BpmnToolkitEntry = {
  readonly type: "backend";
  readonly render: (part: ToolCallPartLike) => ReactElement;
};

export interface CreateBpmnToolkitOptions {
  /** Tool names to render. No name is hard-coded. */
  readonly toolNames: readonly string[];
  readonly resolveArtifact: ArtifactResolver;
  readonly onOpen?: (artifact: BpmnArtifact) => void;
  readonly labels?: Partial<BpmnToolLabels>;
}

/** Render-only entries: they upload no schema and run no code. Register with the usual assistant-ui toolkit setup. */
export function createBpmnToolkit(options: CreateBpmnToolkitOptions): Record<string, BpmnToolkitEntry> {
  const entries: Record<string, BpmnToolkitEntry> = {};
  const render = (part: ToolCallPartLike): ReactElement =>
    createElement(BpmnToolCard, {
      part,
      resolveArtifact: options.resolveArtifact,
      ...(options.onOpen ? { onOpen: options.onOpen } : {}),
      ...(options.labels ? { labels: options.labels } : {}),
    });
  for (const name of options.toolNames) entries[name] = { type: "backend", render };
  return entries;
}
