"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode, Ref } from "react";
import { createBpmnCanvas } from "../internal/canvas.js";
import { exportDiagram, importDiagram, IoError } from "../io/index.js";
import type { DiagramFile, ExportFormat, ImportResult, IoOptions } from "../io/index.js";
import type {
  BpmnCanvasHandle,
  BpmnCanvasOptions,
  BpmnChange,
  CanvasState,
  Diagnostic,
  DiagramInfo,
  ElementClick,
  FitMode,
  LegendTokens,
  PaletteColumns,
  ProfileId,
  WheelMode,
} from "../types.js";
import { DEFAULT_LABELS } from "./labels.js";
import type { WorkshopLabels } from "./labels.js";
import { DiagramTabs } from "./ui/DiagramTabs.js";
import { tabDomId } from "./ui/contracts.js";
import type { MenuItem } from "./ui/contracts.js";
import { Menu } from "./ui/Menu.js";
import { IconDownload, IconFit, IconFormat, IconLayout, IconRedo, IconUndo, IconUpload, IconZoomIn, IconZoomOut } from "./ui/icons.js";

export interface FormatOption {
  readonly id: string;
  readonly label: string;
  readonly profile: ProfileId;
  /** Tokens of the `legend` or `colored` profile. */
  readonly tokens?: Partial<LegendTokens>;
}

export interface WorkshopHandle {
  /** The complete current document, after any pending edit and save. */
  getXml(): Promise<string>;
  /** The underlying canvas handle, for anything the workshop does not wrap. */
  readonly canvas: BpmnCanvasHandle | null;
}

export interface WorkshopNotice {
  readonly id: number;
  readonly kind: "error" | "warning" | "info";
  readonly text: string;
}

export interface BpmnWorkshopProps {
  readonly xml: string;
  /** Pass back the `revision` of the last `onXmlChange` change together with the xml you stored, so the echo is ignored. */
  readonly revision?: string;
  readonly labels?: Partial<WorkshopLabels>;
  /** Looks the user can switch between. With one entry (default) the switch is hidden. */
  readonly formats?: readonly FormatOption[];
  /** Controlled selection. When omitted the workshop keeps the choice itself. */
  readonly format?: string;
  readonly onFormatChange?: (id: string) => void;
  /** Locks editing and shows the busy veil (for instance while an assistant works on the document). */
  readonly readOnly?: boolean;
  readonly allowLossyEdit?: boolean;
  readonly fitMode?: FitMode;
  readonly wheel?: WheelMode;
  readonly paletteColumns?: PaletteColumns;
  readonly zoomLimits?: { readonly min?: number; readonly max?: number };
  readonly styles?: "auto" | "external";
  readonly styleNonce?: string;
  /** Called after each edit with the complete document and the change that caused it. */
  readonly onXmlChange?: (xml: string, change: BpmnChange) => void;
  readonly onChange?: (change: BpmnChange) => void;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly onSaveError?: (error: unknown) => void;
  readonly onAutoLayoutError?: (error: unknown) => void;
  /** Receives a file to download. Default: a Blob link click. */
  readonly onDownload?: (file: DiagramFile) => void;
  /**
   * Receives a validated import. When provided the workshop applies nothing itself: store the xml and pass it back
   * as `xml`. When omitted the workshop applies it to its own canvas.
   */
  readonly onImport?: (result: ImportResult) => void;
  readonly ioOptions?: IoOptions;
  /** Hide the built-in export menu or import button when the host provides its own. */
  readonly hideExport?: boolean;
  readonly hideImport?: boolean;
  /** Which diagram a sub-process marker click opens. Default: called element, then exact name. */
  readonly resolveTarget?: (click: ElementClick, diagrams: readonly DiagramInfo[], activeId: string | undefined) => string | null | undefined;
  /** Make links inside the editor inert, except the bpmn.io badge. Default true. */
  readonly inertLinks?: boolean;
  readonly toolbarTrailing?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly testId?: string;
  readonly ref?: Ref<WorkshopHandle>;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

/** Called element first (by id or name), then the element's own name; never the diagram already shown. */
export function defaultResolveTarget(click: ElementClick, diagrams: readonly DiagramInfo[], activeId: string | undefined): string | null {
  const others = diagrams.filter((d) => d.id !== activeId);
  const called = norm(click.calledElement);
  if (called) {
    const hit = others.find((d) => norm(d.id) === called || norm(d.name) === called);
    if (hit) return hit.id;
  }
  const name = norm(click.name);
  if (!name) return null;
  return others.find((d) => norm(d.name) === name)?.id ?? null;
}

function defaultDownload(file: DiagramFile): void {
  const blob = new Blob([file.xml], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DEFAULT_FORMATS: readonly FormatOption[] = [{ id: "standard", label: "BPMN", profile: "standard" }];

export function BpmnWorkshop(props: BpmnWorkshopProps): ReactElement {
  const labels: WorkshopLabels = { ...DEFAULT_LABELS, ...props.labels };
  const formats = props.formats && props.formats.length > 0 ? props.formats : DEFAULT_FORMATS;
  const [ownFormat, setOwnFormat] = useState<string>(props.format ?? formats[0]?.id ?? "standard");
  const formatId = props.format ?? ownFormat;
  const format = formats.find((f) => f.id === formatId) ?? formats[0] ?? DEFAULT_FORMATS[0];

  const uid = useId().replace(/:/g, "");
  const idPrefix = `bpmn-workshop-${uid}`;
  const panelId = `${idPrefix}-panel`;
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<BpmnCanvasHandle | null>(null);
  const applied = useRef<{ xml: string; revision: string | undefined } | null>(null);
  const saveTail = useRef<Promise<void>>(Promise.resolve());
  const noticeSeq = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const formatRef = useRef(format);
  formatRef.current = format;
  const currentProfile = useRef<string>("");

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [diagrams, setDiagrams] = useState<readonly DiagramInfo[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [state, setState] = useState<CanvasState>("loading");
  const [notices, setNotices] = useState<readonly WorkshopNotice[]>([]);
  const diagramsRef = useRef<readonly DiagramInfo[]>([]);
  const activeRef = useRef<string | undefined>(undefined);

  const addNotice = useCallback((kind: WorkshopNotice["kind"], text: string): void => {
    setNotices((n) => [...n.slice(-4), { id: ++noticeSeq.current, kind, text }]);
  }, []);

  const refreshView = useCallback((): void => {
    const h = handleRef.current;
    if (!h) return;
    const list = h.getDiagrams();
    diagramsRef.current = list;
    activeRef.current = h.getActiveDiagramId();
    setDiagrams(list);
    setActiveId(activeRef.current);
    setCanUndo(h.canUndo());
    setCanRedo(h.canRedo());
  }, []);

  const pullXml = useCallback((change: BpmnChange): void => {
    saveTail.current = saveTail.current.then(async () => {
      const h = handleRef.current;
      if (!h) return;
      try {
        const xml = await h.getXml();
        latest.current.onXmlChange?.(xml, change);
      } catch (error) {
        latest.current.onSaveError?.(error);
      }
    });
  }, []);

  const { paletteColumns, wheel, styles, styleNonce, allowLossyEdit } = props;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const p = latest.current;
    const fmt = formatRef.current ?? DEFAULT_FORMATS[0];
    const tokens = fmt?.tokens;
    const options: BpmnCanvasOptions = {
      xml: p.xml,
      ...(p.revision !== undefined ? { revision: p.revision } : {}),
      profile: fmt?.profile ?? "standard",
      ...(tokens && fmt?.profile === "legend" ? { legendTokens: tokens } : {}),
      ...(tokens && fmt?.profile === "colored" ? { coloredTokens: tokens } : {}),
      ...(paletteColumns !== undefined ? { paletteColumns } : {}),
      ...(styles !== undefined ? { styles } : {}),
      ...(styleNonce !== undefined ? { styleNonce } : {}),
      ...(allowLossyEdit !== undefined ? { allowLossyEdit } : {}),
      ...(p.fitMode !== undefined ? { fitMode: p.fitMode } : {}),
      wheel: wheel ?? "zoom-cursor",
      zoomLimits: p.zoomLimits ?? { min: 0.05, max: 4 },
      drilldown: "event",
      readOnly: p.readOnly === true,
      onChange: (c) => {
        latest.current.onChange?.(c);
        refreshView();
        if (c.cause !== "diagram-switch" && c.cause !== "profile-switch") pullXml(c);
      },
      onDiagnostic: (d) => {
        latest.current.onDiagnostic?.(d);
        if (d.code === "read-only-lossy") addNotice("warning", latest.current.labels?.readOnlyLossy ?? DEFAULT_LABELS.readOnlyLossy);
      },
      onStateChange: (s) => {
        setState(s);
        if (s === "ready") refreshView();
      },
      onHistoryChange: (h) => {
        setCanUndo(h.canUndo);
        setCanRedo(h.canRedo);
      },
      onElementClick: (click) => {
        if (!click.marker) return;
        const h = handleRef.current;
        if (!h) return;
        const resolve = latest.current.resolveTarget ?? defaultResolveTarget;
        const target = resolve(click, diagramsRef.current, activeRef.current);
        if (target && target !== activeRef.current) void h.selectDiagram(target).catch(() => undefined);
      },
    };
    const handle = createBpmnCanvas(host, options);
    handleRef.current = handle;
    currentProfile.current = `${fmt?.id ?? ""}`;
    applied.current = { xml: p.xml, revision: p.revision };
    void handle.ready.then(refreshView);
    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [paletteColumns, wheel, styles, styleNonce, allowLossyEdit, addNotice, pullXml, refreshView]);

  useEffect(() => {
    const h = handleRef.current;
    const last = applied.current;
    if (!h || !last) return;
    if (last.xml === props.xml && last.revision === props.revision) return;
    applied.current = { xml: props.xml, revision: props.revision };
    void h.setXml(props.xml, props.revision !== undefined ? { revision: props.revision } : {}).then(refreshView, () => undefined);
  }, [props.xml, props.revision, refreshView]);

  useEffect(() => {
    handleRef.current?.setReadOnly(props.readOnly === true);
  }, [props.readOnly]);

  useEffect(() => {
    handleRef.current?.setFitMode(props.fitMode ?? "readable");
  }, [props.fitMode]);

  useEffect(() => {
    const h = handleRef.current;
    const fmt = format;
    if (!h || !fmt || currentProfile.current === fmt.id) return;
    currentProfile.current = fmt.id;
    void h.setProfile(fmt.profile, fmt.tokens).then(refreshView, () => undefined);
  }, [format, refreshView]);

  useImperativeHandle(
    props.ref,
    (): WorkshopHandle => ({
      getXml: async () => {
        await saveTail.current;
        const h = handleRef.current;
        if (!h) throw new Error("The diagram is not ready");
        return h.getXml();
      },
      get canvas() {
        return handleRef.current;
      },
    }),
    [],
  );

  const busy = props.readOnly === true;
  const run = async (fn: (h: BpmnCanvasHandle) => unknown): Promise<void> => {
    const h = handleRef.current;
    if (h) await fn(h);
  };

  const doLayout = async (): Promise<void> => {
    const h = handleRef.current;
    if (!h || busy) return;
    try {
      await h.autoLayout();
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      props.onAutoLayoutError?.(error);
      addNotice("error", labels.autoLayoutFailed);
    }
  };

  const doExport = async (fmt: ExportFormat): Promise<void> => {
    const h = handleRef.current;
    if (!h) return;
    try {
      await saveTail.current;
      const file = exportDiagram(await h.getXml(), fmt, props.ioOptions);
      (props.onDownload ?? defaultDownload)(file);
      for (const f of file.fidelity) addNotice("info", f.message);
    } catch (error) {
      addNotice("error", `${labels.exportFailed}: ${error instanceof IoError || error instanceof Error ? error.message : String(error)}`);
    }
  };

  const doImport = async (readText: Promise<string>): Promise<void> => {
    try {
      const result = await importDiagram(await readText, props.ioOptions);
      for (const f of result.fidelity) addNotice("info", f.message);
      if (props.onImport) props.onImport(result);
      else await run((h) => h.setXml(result.xml).then(refreshView));
    } catch (error) {
      addNotice("error", `${labels.importFailed}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const fitItems: MenuItem[] = [
    { id: "fit-auto", label: labels.fitAuto, onSelect: () => void run((h) => h.fit({ mode: "whole" })) },
    { id: "zoom-50", label: labels.zoom50, onSelect: () => void run((h) => h.zoomTo(0.5)) },
    { id: "zoom-100", label: labels.zoom100, onSelect: () => void run((h) => h.zoomTo(1)) },
  ];
  const exportItems: MenuItem[] = [
    { id: "bpmn", label: labels.exportBpmn, onSelect: () => void doExport("bpmn") },
    { id: "drawio", label: labels.exportDrawio, onSelect: () => void doExport("drawio") },
    { id: "sparx", label: labels.exportSparx, onSelect: () => void doExport("sparx") },
  ];
  const formatItems: MenuItem[] = formats.map((f) => ({
    id: f.id,
    label: f.label,
    checked: f.id === format?.id,
    onSelect: () => {
      if (props.format === undefined) setOwnFormat(f.id);
      props.onFormatChange?.(f.id);
    },
  }));

  const inert = (props.inertLinks ?? true)
    ? (e: React.MouseEvent): void => {
        const a = (e.target as Element | null)?.closest?.("a[href]");
        if (a && !a.closest(".bjs-powered-by")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    : undefined;

  const activeTab = diagrams.find((d) => d.id === activeId);
  const btn = (key: string, label: string, onClick: () => void, icon: ReactElement, disabled: boolean, hint?: string, extra?: string): ReactElement => (
    <button key={key} type="button" className={`bpmn-workshop__button${extra ? ` ${extra}` : ""}`} onClick={onClick} disabled={disabled} title={hint ?? label} aria-label={label} data-testid={`bpmn-workshop-${key}`}>
      {icon}
    </button>
  );

  return (
    <div
      className={`bpmn-workshop${busy ? " bpmn-workshop--busy" : ""}${props.className ? ` ${props.className}` : ""}`}
      style={props.style}
      data-testid={props.testId ?? "bpmn-workshop"}
      data-state={state}
      onClickCapture={inert}
    >
      <div className="bpmn-workshop__toolbar" role="toolbar" aria-label={labels.toolbar}>
        {btn("undo", labels.undo, () => void run((h) => h.undo()), <IconUndo />, busy || !canUndo)}
        {btn("redo", labels.redo, () => void run((h) => h.redo()), <IconRedo />, busy || !canRedo)}
        {btn("zoom-out", labels.zoomOut, () => void run((h) => h.zoomBy(0.8)), <IconZoomOut />, busy)}
        {btn("zoom-in", labels.zoomIn, () => void run((h) => h.zoomBy(1.25)), <IconZoomIn />, busy)}
        <Menu label={<><IconFit /> {labels.fit}</>} ariaLabel={labels.fit} items={fitItems} disabled={busy} testId="bpmn-workshop-fit" title={labels.fitAuto} />
        {btn("auto-layout", labels.autoLayout, () => void doLayout(), <IconLayout />, busy, labels.autoLayoutHint)}
        {formats.length > 1 && <Menu label={<><IconFormat /> {format?.label}</>} ariaLabel={labels.format} items={formatItems} disabled={busy} testId="bpmn-workshop-format" title={labels.formatHint} />}
        {!props.hideExport && <Menu label={<><IconDownload /> {labels.export}</>} ariaLabel={labels.export} items={exportItems} testId="bpmn-workshop-export" />}
        {!props.hideImport && btn("import", labels.import, () => fileRef.current?.click(), <IconUpload />, busy)}
        <input
          ref={fileRef}
          type="file"
          hidden={true}
          disabled={props.hideImport === true}
          accept=".bpmn,.xml,.drawio,application/xml,text/xml"
          aria-label={labels.import}
          data-testid="bpmn-workshop-file"
          onChange={(e) => {
            const input = e.target;
            const file = input.files?.[0];
            if (!file) return;
            // Read first, then reset the field: some browsers drop the file once the value is cleared,
            // and a reset lets the same file be picked again after an error.
            const text = file.text();
            void text.then(
              () => {
                input.value = "";
              },
              () => {
                input.value = "";
              },
            );
            void doImport(text);
          }}
        />
        {props.toolbarTrailing}
      </div>
      <DiagramTabs
        tabs={diagrams.map((d) => ({ id: d.id, label: d.name }))}
        activeId={activeId}
        onSelect={(id) => void run((h) => h.selectDiagram(id).catch(() => undefined))}
        ariaLabel={labels.diagrams}
        panelId={panelId}
        idPrefix={idPrefix}
      />
      {notices.length > 0 && (
        <div className="bpmn-workshop__notices" role="log" aria-label={labels.notices}>
          {notices.map((n) => (
            <div key={n.id} className={`bpmn-workshop__notice bpmn-workshop__notice--${n.kind}`} role={n.kind === "error" ? "alert" : "status"}>
              <span>{n.text}</span>
              <button type="button" className="bpmn-workshop__button" aria-label={labels.dismiss} onClick={() => setNotices((all) => all.filter((x) => x.id !== n.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="bpmn-workshop__panel" role="tabpanel" id={panelId} aria-label={labels.diagramPanel} aria-labelledby={activeTab ? tabDomId(idPrefix, activeTab.id) : undefined} tabIndex={0}>
        <div className="bpmn-workshop__canvas" ref={hostRef} inert={busy} />
        {busy && (
          <div className="bpmn-workshop__veil" role="status">
            <span className="bpmn-workshop__busy">{labels.busy}</span>
          </div>
        )}
      </div>
    </div>
  );
}
