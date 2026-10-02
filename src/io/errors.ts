export type IoErrorCode =
  | "too-large"
  | "dtd"
  | "invalid-xml"
  | "duplicate-id"
  | "not-bpmn"
  | "missing-di"
  | "import-warning"
  | "unsupported-element"
  | "nested-subprocess"
  | "multiple-participants"
  | "unresolved-shape"
  | "unresolved-edge"
  | "missing-endpoint"
  | "missing-waypoints"
  | "invalid-geometry"
  | "element-without-di"
  | "not-drawio"
  | "no-pages"
  | "unsupported-page"
  | "compressed-unsupported"
  | "unsupported-model"
  | "unsupported-structure"
  | "object-wrappers"
  | "too-many-cells"
  | "duplicate-cell-id"
  | "unsupported-cell"
  | "empty-page"
  | "relative-vertex"
  | "cyclic-hierarchy"
  | "missing-parent"
  | "unsupported-event-symbol"
  | "unsupported-shape"
  | "unsupported-edge"
  | "unsupported-decoration"
  | "multiple-pools"
  | "no-bpmn-nodes";

/** A refusal. Nothing is returned partially: the input is either converted faithfully or refused. */
export class IoError extends Error {
  readonly code: IoErrorCode;
  readonly ids: readonly string[];

  constructor(code: IoErrorCode, message: string, ids: readonly string[] = []) {
    super(message);
    this.name = "IoError";
    this.code = code;
    this.ids = ids;
  }
}

/** What a conversion keeps and what it changes. Shown to the user next to the result. */
export interface FidelityNotice {
  readonly code: "projection" | "interchange-only" | "ids-regenerated" | "di-regenerated" | "data-links-as-associations" | "labels-reduced-to-text";
  readonly message: string;
}

export interface IoOptions {
  /** Ceiling for a raw or decompressed document. Default 8 MiB. */
  readonly maxBytes?: number;
  /** Attribute written on Draw.io cells to carry the BPMN kind. Default `bpmnKind`. */
  readonly kindAttribute?: string;
  /** Further attribute names read as the kind (for files written by earlier tools). Default none. */
  readonly legacyKindAttributes?: readonly string[];
  /** Value of the `host` attribute of exported Draw.io files. Default `bpmn-canvas`. */
  readonly host?: string;
  /** `targetNamespace` of BPMN regenerated from Draw.io. Default `urn:bpmn-canvas:import`. */
  readonly targetNamespace?: string;
}

export interface ResolvedIoOptions {
  readonly maxBytes: number;
  readonly kindAttribute: string;
  readonly legacyKindAttributes: readonly string[];
  readonly host: string;
  readonly targetNamespace: string;
}

export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export function resolveIoOptions(options: IoOptions = {}): ResolvedIoOptions {
  return {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    kindAttribute: options.kindAttribute ?? "bpmnKind",
    legacyKindAttributes: options.legacyKindAttributes ?? [],
    host: options.host ?? "bpmn-canvas",
    targetNamespace: options.targetNamespace ?? "urn:bpmn-canvas:import",
  };
}
