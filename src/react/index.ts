"use client";

import { createElement, useEffect, useRef } from "react";
import type { CSSProperties, ReactElement } from "react";
import { createBpmnCanvas } from "../internal/canvas.js";
import type { BpmnCanvasHandle, BpmnCanvasOptions, BpmnChange, CanvasState, Diagnostic, ProfileId, WatermarkOptions, WheelMode } from "../types.js";

export interface BpmnCanvasProps {
  readonly xml: string;
  /** Pass the `revision` of the last `onChange` back with the XML you saved, so the echo is ignored and undo/camera survive. */
  readonly revision?: string;
  readonly profile?: ProfileId;
  readonly readOnly?: boolean;
  readonly allowLossyEdit?: boolean;
  readonly wheel?: WheelMode;
  /** The bpmn.io logo stays visible unless the host names a license that allows hiding it (creation-time option). */
  readonly watermark?: WatermarkOptions;
  readonly styles?: "auto" | "external";
  readonly styleNonce?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onChange?: (change: BpmnChange) => void;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly onStateChange?: (state: CanvasState) => void;
  /** Called with the handle once created. A new handle is created when a creation-time option changes. */
  readonly onReady?: (handle: BpmnCanvasHandle) => void;
}

/**
 * Creation-time options (`profile`, `wheel`, `styles`, `styleNonce`, `allowLossyEdit`) recreate the
 * canvas when they change; `xml`/`revision` call `setXml`; `readOnly` calls `setReadOnly`.
 * Safe under React StrictMode: the handle is created in an effect and destroyed in its cleanup.
 */
export function BpmnCanvas(props: BpmnCanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BpmnCanvasHandle | null>(null);
  const applied = useRef<{ xml: string; revision: string | undefined } | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { profile, wheel, styles, styleNonce, allowLossyEdit } = props;
  const wmHidden = props.watermark?.hidden === true;
  const wmLicense = props.watermark?.license;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const p = latest.current;
    const options: BpmnCanvasOptions = {
      xml: p.xml,
      ...(p.revision !== undefined ? { revision: p.revision } : {}),
      ...(profile !== undefined ? { profile } : {}),
      ...(wheel !== undefined ? { wheel } : {}),
      ...(wmHidden ? { watermark: { hidden: true, ...(wmLicense !== undefined ? { license: wmLicense } : {}) } } : {}),
      ...(styles !== undefined ? { styles } : {}),
      ...(styleNonce !== undefined ? { styleNonce } : {}),
      ...(allowLossyEdit !== undefined ? { allowLossyEdit } : {}),
      readOnly: p.readOnly === true,
      onChange: (c) => latest.current.onChange?.(c),
      onDiagnostic: (d) => latest.current.onDiagnostic?.(d),
      onStateChange: (s) => latest.current.onStateChange?.(s),
    };
    const handle = createBpmnCanvas(host, options);
    handleRef.current = handle;
    applied.current = { xml: p.xml, revision: p.revision };
    p.onReady?.(handle);
    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [profile, wheel, styles, styleNonce, allowLossyEdit, wmHidden, wmLicense]);

  useEffect(() => {
    const handle = handleRef.current;
    const last = applied.current;
    if (!handle || !last) return;
    if (last.xml === props.xml && last.revision === props.revision) return;
    applied.current = { xml: props.xml, revision: props.revision };
    handle.setXml(props.xml, props.revision !== undefined ? { revision: props.revision } : {}).catch(() => undefined);
  }, [props.xml, props.revision]);

  useEffect(() => {
    handleRef.current?.setReadOnly(props.readOnly === true);
  }, [props.readOnly]);

  return createElement("div", {
    ref: hostRef,
    className: props.className,
    style: { width: "100%", height: "100%", ...props.style },
    "data-bpmn-canvas-host": "",
  });
}

export type { BpmnCanvasHandle, BpmnCanvasOptions, BpmnChange, CanvasState, Diagnostic, ProfileId, WatermarkOptions, WheelMode } from "../types.js";

export { BpmnWorkshop, defaultResolveTarget } from "./workshop.js";
export type { BpmnWorkshopProps, FormatOption, WorkshopHandle, WorkshopNotice } from "./workshop.js";
export { DEFAULT_LABELS } from "./labels.js";
export type { WorkshopLabels } from "./labels.js";
