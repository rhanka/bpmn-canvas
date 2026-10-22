"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { createNativeProfileCanvas } from "../profile/native-canvas.js";
import type { NativeProfileCanvasHandle, NativeProfileCanvasOptions } from "../profile/native-canvas.js";
import type { Rec } from "../profile/lot5-support.js";

export interface NativeFormatOption {
  readonly id: string;
  readonly label: string;
  readonly themeId: string;
  readonly formatId: string;
}
export interface NativeDownloadFile { readonly format: string; readonly bytes: Uint8Array; readonly digest: string }
export interface NativeProfileWorkshopProps extends Omit<NativeProfileCanvasOptions, "compiled" | "snapshot" | "onDownload"> {
  readonly businessProfile: NativeProfileCanvasOptions["compiled"];
  readonly snapshot: NonNullable<NativeProfileCanvasOptions["snapshot"]>;
  readonly formats: readonly NativeFormatOption[];
  readonly format?: string;
  readonly onFormatChange?: (id: string) => void;
  readonly onChange?: (event: Rec) => void;
  readonly onDownload?: (file: NativeDownloadFile, context: Rec) => void;
  readonly onReady?: (handle: NativeProfileCanvasHandle) => void;
  readonly onError?: (result: Rec) => void;
  readonly xml?: never;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Explicit native mode of the workshop. The host receives committed events;
 * persistence is a host action, and downloads run only on the export button. */
export function NativeProfileWorkshop(props: NativeProfileWorkshopProps): ReactElement {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<NativeProfileCanvasHandle | null>(null);
  const latest = useRef(props); latest.current = props;
  const [ownFormat, setOwnFormat] = useState(props.formats[0]?.id ?? "");
  const [notice, setNotice] = useState(""), [pending, setPending] = useState(false);
  const selected = props.formats.find(format => format.id === (props.format ?? ownFormat));
  useEffect(() => {
    let active = true;
    const start = async (): Promise<void> => {
      if (!host.current) return;
      const result = await createNativeProfileCanvas(host.current, {
        compiled: props.businessProfile, descriptorContext: props.descriptorContext,
        metricBytes: props.metricBytes, snapshot: latest.current.snapshot, readOnly: props.readOnly ?? false,
        ...(props.unicodeCase ? { unicodeCase: props.unicodeCase } : {}),
        ...(props.locale ? { locale: props.locale } : {}),
        ...(props.gestureContext ? { gestureContext: props.gestureContext } : {}),
        onOutcome(value) { latest.current.onOutcome?.(value); },
        onDownload(value) {
          if (!active) return;
          const { format, bytes, digest, ...context } = value;
          const file = { format: format as string, bytes: bytes as Uint8Array, digest: digest as string };
          if (latest.current.onDownload) latest.current.onDownload(file, context);
          else {
            const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: "application/xml" }));
            const link = host.current!.ownerDocument.createElement("a");
            link.href = url; link.download = `drawing.${file.format}`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        },
      });
      if (!active) { if (result.status === "ok") await result.payload.dispose(); return; }
      if (result.status !== "ok") { setNotice(result.code ?? "operation-error"); latest.current.onError?.(result as unknown as Rec); return; }
      canvas.current = result.payload;
      result.payload.onChange(event => { if (active) latest.current.onChange?.(event); });
      const initialFormat = latest.current.formats.find(f => f.id === (latest.current.format ?? ownFormat));
      if (initialFormat && latest.current.snapshot.presentation.themeId !== initialFormat.themeId) await result.payload.setTheme(initialFormat.themeId);
      if (active) { setNotice(""); latest.current.onReady?.(result.payload); }
    };
    void start();
    return () => { active = false; const current = canvas.current; canvas.current = null; if (current) void current.dispose(); };
  }, [props.businessProfile, props.descriptorContext, props.metricBytes, props.readOnly]);
  useEffect(() => {
    const current = canvas.current;
    if (!current) return;
    const actual = current.getSnapshot();
    if ((actual.payload as Rec | undefined)?.viewRevision !== props.snapshot.viewRevision) void current.restoreSnapshot(props.snapshot).then(result => {
      if (result.status !== "ok") { setNotice(result.code as string); latest.current.onError?.(result); }
    });
  }, [props.snapshot]);
  useEffect(() => {
    const current = canvas.current;
    if (current && selected && ((current.getSnapshot().payload as Rec | undefined)?.presentation as Rec)?.themeId !== selected.themeId) {
      void current.setTheme(selected.themeId).then(result => { if (result.status !== "ok") setNotice(result.code as string); });
    }
  }, [selected?.themeId]);
  const download = async (): Promise<void> => {
    if (!canvas.current || !selected) return;
    setPending(true); setNotice("");
    try {
      const result = await canvas.current.export(selected);
      const prepared = (result.download as Rec | undefined)?.prepared as Rec | undefined;
      if (prepared?.status !== "ok") { setNotice(prepared?.code as string ?? "operation-error"); latest.current.onError?.(prepared ?? result); }
    } finally { setPending(false); }
  };
  if ("xml" in props && props.xml !== undefined) return <div data-native-workshop="" role="alert">input-conflict</div>;
  return <section data-native-workshop="" className={props.className} style={props.style}>
    <div role="toolbar" aria-label="Native diagram actions">
      <select aria-label="Export format" disabled={pending} value={props.format ?? ownFormat} onChange={event => {
        setOwnFormat(event.target.value); props.onFormatChange?.(event.target.value);
      }}>{props.formats.map(format => <option key={format.id} value={format.id}>{format.label}</option>)}</select>
      <button type="button" disabled={pending || !selected} onClick={() => { void download(); }}>Download</button>
    </div>
    {notice ? <p role="alert">{notice}</p> : null}
    <div ref={host} inert={pending} />
  </section>;
}
