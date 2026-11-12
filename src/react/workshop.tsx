"use client";

import type { BusinessPolicy } from "../internal/business-policy.js";
import { navigationTarget } from "../internal/legacy-policy.js";
import { documentNavigationIndex } from "../internal/navigation-policy.js";
import { explicitTargetResolver, POLICY_RULE } from "./navigation-target.js";

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode, Ref } from "react";
import { createBpmnCanvas } from "../internal/canvas.js";
import { export as exportModel, initializeCodecs, parseDefinitions, importDiagram, IoError } from "../io/index.js";
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
  AnnotatedTokens,
  PaletteColumns,
  ProfileId,
  ProfileOptions,
  WatermarkOptions,
  WheelMode,
} from "../types.js";
import { DEFAULT_LABELS } from "./labels.js";
import type { WorkshopLabels } from "./labels.js";
import { DiagramTabs } from "./ui/DiagramTabs.js";
import { tabDomId } from "./ui/contracts.js";
import type { MenuItem } from "./ui/contracts.js";
import { Menu } from "./ui/Menu.js";
import { IconDownload, IconFit, IconFormat, IconLayout, IconRedo, IconUndo, IconUpload, IconZoomIn, IconZoomOut } from "./ui/icons.js";
import { NativeProfileWorkshop } from "./native-workshop.js";
import type { NativeProfileWorkshopProps } from "./native-workshop.js";

export interface FormatOption {
  readonly id: string;
  readonly label: string;
  readonly profile: ProfileId;
  /** Tokens of the `annotated` or `recolor` profile. */
  readonly tokens?: Partial<AnnotatedTokens>;
  /** `annotated`: the annotated palette in this look too. */
  readonly palette?: ProfileOptions["palette"];
  /** `recolor` only: `flat` flat shapes. */
  readonly drawing?: ProfileOptions["drawing"];
}

/** What one export captured, with the file: the document, its revision, the diagram and profile shown, and whether it was edited. */
export interface DownloadContext {
  readonly xml: string;
  readonly revision: string | undefined;
  readonly diagramId: string | undefined;
  readonly profile: string;
  readonly touched: boolean;
}

/** Rules a sub-process marker uses to find the diagram it opens, tried on each diagram in order. */
export type NavigationRule = "calledElement" | "exactName" | "sectionNumber" | "substring";

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
  readonly businessPolicy?: BusinessPolicy;
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
  /** Absolute URL of the package's `dist/assets/` (see `BpmnCanvasOptions.assetBase`). Creation-time option. */
  readonly assetBase?: string;
  /** The bpmn.io logo stays visible unless the host names a license that allows hiding it (creation-time option). */
  readonly watermark?: WatermarkOptions;
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
  /** Receives a file to download and what its export captured. Default: a Blob link click. */
  readonly onDownload?: (file: DiagramFile, context: DownloadContext) => void;
  /** Lay each document the host passes out as part of its load (see `SetXmlOptions.layoutOnLoad`). */
  readonly layoutOnLoad?: boolean;
  /** Toolbar contents: zoom ± buttons (default true), auto-layout as an icon (default) or text, import button (default true). */
  readonly toolbar?: { readonly zoomButtons?: boolean; readonly autoLayout?: "icon" | "text"; readonly importButton?: boolean };
  /** Menu triggers: chevron drawn (`svg`, default), as text (" ▾") or none; icons before the labels (default true). */
  readonly menus?: { readonly chevron?: "svg" | "text" | "none"; readonly icons?: boolean };
  /** Host icons for undo and redo. */
  readonly icons?: { readonly undo?: ReactNode; readonly redo?: ReactNode };
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

export * from "./navigation-target.js";

/** Resolve diagrams using caller-provided navigation rule categories. */
export function navigationResolver(rules: readonly NavigationRule[]): (click: ElementClick, diagrams: readonly DiagramInfo[], activeId: string | undefined) => string | null {
  return (click, diagrams, activeId) => {
    const result = navigationTarget({ click, diagrams, activeId }, { processes: [], entries: [] }, { navigation: { mode: "legacy-rules", rules: rules.map((rule) => POLICY_RULE[rule] ?? rule) } });
    return result.kind === "open" ? result.diagramId : null;
  };
}

const abortError = (): Error => {
  const e = new Error("The document changed during the export");
  e.name = "AbortError";
  return e;
};

const profileOptionsOf = (f: FormatOption | undefined): ProfileOptions => ({
  ...(f?.palette ? { palette: f.palette } : {}),
  ...(f?.drawing ? { drawing: f.drawing } : {}),
});

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

const DEFAULT_FORMATS: readonly FormatOption[] = [{ id: "", label: "BPMN", profile: "" }];

export function BpmnWorkshop(props: BpmnWorkshopProps | NativeProfileWorkshopProps): ReactElement {
  return "businessProfile" in props ? <NativeProfileWorkshop {...props} /> : <XmlWorkshop {...props} />;
}

function XmlWorkshop(props: BpmnWorkshopProps): ReactElement {
  const labels: WorkshopLabels = { ...DEFAULT_LABELS, ...props.labels };
  const formats: readonly FormatOption[] = props.formats && props.formats.length > 0 ? props.formats : props.businessPolicy?.presentation?.looks?.map((look: any) => ({ id: look.alias, label: look.alias, profile: look.alias })) ?? DEFAULT_FORMATS;
  const [navigationChoices, setNavigationChoices] = useState<string[]>([]);
  const [ownFormat, setOwnFormat] = useState<string>(props.format ?? formats[0]?.id ?? "");
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
  /** Increases with every new document the canvas shows (host update or local import): an export spanning one is dropped. */
  const docSeq = useRef(0);
  const lastEmitted = useRef<string | undefined>(undefined);
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
        lastEmitted.current = change.revision;
        latest.current.onXmlChange?.(xml, change);
      } catch (error) {
        // Superseded by a newer document from the host, or the canvas is gone: nothing to save.
        if ((error as Error)?.name === "AbortError") return;
        latest.current.onSaveError?.(error);
      }
    });
  }, []);

  const { paletteColumns, wheel, styles, styleNonce, allowLossyEdit, assetBase, businessPolicy } = props;
  const wmHidden = props.watermark?.hidden === true;
  const wmLicense = props.watermark?.license;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const p = latest.current;
    const fmt = formatRef.current ?? DEFAULT_FORMATS[0];
    const tokens = fmt?.tokens;
    const options: BpmnCanvasOptions = {
      xml: p.xml,
      ...(p.revision !== undefined ? { revision: p.revision } : {}),
      profile: fmt?.profile ?? "",
      ...(p.businessPolicy ? { businessPolicy: p.businessPolicy } : {}),
      profileOptions: profileOptionsOf(fmt),
      ...(p.layoutOnLoad ? { layoutOnLoad: true } : {}),
      ...(tokens ? { tokens } : {}),

      ...(paletteColumns !== undefined ? { paletteColumns } : {}),
      ...(styles !== undefined ? { styles } : {}),
      ...(styleNonce !== undefined ? { styleNonce } : {}),
      ...(assetBase !== undefined ? { assetBase } : {}),
      ...(allowLossyEdit !== undefined ? { allowLossyEdit } : {}),
      ...(p.fitMode !== undefined ? { fitMode: p.fitMode } : {}),
      ...(wmHidden ? { watermark: { hidden: true, ...(wmLicense !== undefined ? { license: wmLicense } : {}) } } : {}),
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
        if (d.code === "load-layout-failed") {
          latest.current.onAutoLayoutError?.(new Error(d.message));
          addNotice("error", latest.current.labels?.autoLayoutFailed ?? DEFAULT_LABELS.autoLayoutFailed);
        }
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
        const p = latest.current;
        const explicit = explicitTargetResolver(p);
        if (explicit) {
          const target = explicit(click, diagramsRef.current, activeRef.current);
          if (target && target !== activeRef.current) void h.selectDiagram(target).catch(() => undefined);
          return;
        }
        const result = navigationTarget({ click, diagrams: diagramsRef.current, activeId: activeRef.current, activeDiagramId: activeRef.current }, documentNavigationIndex(p.xml), p.businessPolicy);
        if (result.kind === "open") void h.selectDiagram(result.diagramId).catch(() => undefined);
        if (result.kind === "chooser") setNavigationChoices(result.diagramIds);

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
  }, [paletteColumns, wheel, styles, styleNonce, allowLossyEdit, assetBase, businessPolicy, wmHidden, wmLicense, addNotice, pullXml, refreshView]);

  useEffect(() => {
    const h = handleRef.current;
    const last = applied.current;
    if (!h || !last) return;
    if (last.xml === props.xml && last.revision === props.revision) return;
    applied.current = { xml: props.xml, revision: props.revision };
    // The workshop's own change coming back (same revision) is an echo, not a new document.
    if (props.revision === undefined || props.revision !== lastEmitted.current) {
      docSeq.current++;
    }
    const options = { ...(props.revision !== undefined ? { revision: props.revision } : {}), ...(latest.current.layoutOnLoad ? { layoutOnLoad: true } : {}) };
    void h.setXml(props.xml, options).then(refreshView, () => undefined);
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
    void h.setProfile(fmt.profile, fmt.tokens, profileOptionsOf(fmt)).then(refreshView, () => undefined);
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
    const seq = docSeq.current;
    try {
      await saveTail.current;
      // One capture: the document, its revision, the diagram and profile shown, and whether it was edited.
      const snap = await h.snapshot();
      if (docSeq.current !== seq) throw abortError();
      const p = latest.current;
      initializeCodecs(p.ioOptions);
      const definitions = (await parseDefinitions(snap.xml, { ...p.ioOptions, ...(p.businessPolicy ? { businessPolicy: p.businessPolicy } : {}) })).rootElement;
      const bytes = await exportModel(definitions, fmt, { ...p.ioOptions, ...(p.businessPolicy ? { businessPolicy: p.businessPolicy } : {}) });
      if (docSeq.current !== seq) throw abortError();
      const file: DiagramFile = { xml: new TextDecoder().decode(bytes), filename: fmt === "drawio" ? "diagram.drawio" : fmt === "sparx" ? "diagram.sparx.xml" : "diagram.bpmn", mimeType: fmt === "drawio" ? "application/vnd.jgraph.mxfile" : fmt === "sparx" ? "application/xml" : "application/bpmn+xml", fidelity: [] };
      (p.onDownload ?? defaultDownload)(file, { xml: snap.xml, revision: snap.revision, diagramId: snap.diagramId, profile: snap.profile, touched: snap.touched });
      for (const f of file.fidelity) addNotice("info", f.message);
    } catch (error) {
      addNotice("error", `${labels.exportFailed}: ${error instanceof IoError || error instanceof Error ? error.message : String(error)}`);
    }
  };

  const doImport = async (readText: Promise<string>): Promise<void> => {
    try {
      const result = await importDiagram(await readText, { ...props.ioOptions, ...(props.businessPolicy ? { businessPolicy: props.businessPolicy } : {}) });
      for (const f of result.fidelity) addNotice("info", f.message);
      if (props.onImport) props.onImport(result);
      else {
        docSeq.current++;
        await run((h) => h.setXml(result.xml).then(refreshView));
      }
    } catch (error) {
      addNotice("error", `${labels.importFailed}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const fitItems: MenuItem[] = [
    { id: "fit-auto", label: labels.fitAuto, onSelect: () => void run((h) => h.fit({ mode: "whole" })) },
    { id: "fit-separator", kind: "separator", label: "", onSelect: () => undefined },
    { id: "zoom-50", label: labels.zoom50, onSelect: () => void run((h) => h.zoomTo(0.5)) },
    { id: "zoom-100", label: labels.zoom100, onSelect: () => void run((h) => h.zoomTo(1)) },
  ];
  const exportItems: MenuItem[] = [
    { id: "bpmn", label: labels.exportBpmn, onSelect: () => void doExport("bpmn") },
    { id: "drawio", label: labels.exportDrawio, onSelect: () => void doExport("drawio") },
    { id: "sparx", label: labels.exportSparx, onSelect: () => void doExport("sparx") },
  ];
  const formatItems: MenuItem[] = [
    { id: "format-header", kind: "header", label: labels.format, onSelect: () => undefined },
    { id: "format-separator", kind: "separator", label: "", onSelect: () => undefined },
    ...formats.map((f): MenuItem => ({
      id: f.id,
      label: f.label,
      pressed: f.id === format?.id,
      onSelect: () => {
        if (props.format === undefined) setOwnFormat(f.id);
        props.onFormatChange?.(f.id);
      },
    })),
  ];
  const zoomButtons = props.toolbar?.zoomButtons ?? true;
  const textLayout = props.toolbar?.autoLayout === "text";
  const importButton = (props.toolbar?.importButton ?? true) && !props.hideImport;
  const chevron = props.menus?.chevron ?? "svg";
  const menuIcons = props.menus?.icons ?? true;
  const hasDocument = diagrams.length > 0;

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
        {btn("undo", labels.undo, () => void run((h) => h.undo()), <>{props.icons?.undo ?? <IconUndo />}</>, busy || !canUndo)}
        {btn("redo", labels.redo, () => void run((h) => h.redo()), <>{props.icons?.redo ?? <IconRedo />}</>, busy || !canRedo)}
        {zoomButtons && btn("zoom-out", labels.zoomOut, () => void run((h) => h.zoomBy(0.8)), <IconZoomOut />, busy)}
        {zoomButtons && btn("zoom-in", labels.zoomIn, () => void run((h) => h.zoomBy(1.25)), <IconZoomIn />, busy)}
        <Menu label={menuIcons ? <><IconFit /> {labels.fit}</> : labels.fit} ariaLabel={labels.fit} chevron={chevron} items={fitItems} disabled={busy} testId="bpmn-workshop-fit" title={labels.fitAuto} />
        {btn("auto-layout", labels.autoLayout, () => void doLayout(), textLayout ? <>{labels.autoLayout}</> : <IconLayout />, busy, labels.autoLayoutHint)}
        {formats.length > 1 && (
          <div role="group" aria-label={labels.format} title={labels.formatHint} className="bpmn-workshop__group">
            <Menu label={menuIcons ? <><IconFormat /> {format?.label}</> : format?.label} ariaLabel={labels.format} chevron={chevron} items={formatItems} disabled={busy} testId="bpmn-workshop-format" title={labels.formatHint} />
          </div>
        )}
        {!props.hideExport && (
          <Menu
            label={menuIcons ? <><IconDownload /> {labels.export}</> : labels.export}
            // With a text chevron the trigger is named by its text, like the menus that carry their label in their text.
            {...(chevron === "text" ? {} : { ariaLabel: labels.export })}
            chevron={chevron}
            items={exportItems}
            disabled={busy || !hasDocument}
            testId="bpmn-workshop-export"
          />
        )}
        {importButton && btn("import", labels.import, () => fileRef.current?.click(), <IconUpload />, busy)}
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
      {navigationChoices.length > 0 && <select aria-label="Choose diagram" defaultValue="" onChange={event => { const id = event.target.value; setNavigationChoices([]); if (id) void handleRef.current?.selectDiagram(id); }}><option value="">Choose diagram</option>{navigationChoices.map(id => <option key={id} value={id}>{diagrams.find(diagram => diagram.id === id)?.name ?? id}</option>)}</select>}
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
