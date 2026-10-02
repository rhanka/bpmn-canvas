/** Every text of the workshop. The host translates: the library ships English defaults only. */
export interface WorkshopLabels {
  readonly toolbar: string;
  readonly undo: string;
  readonly redo: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly fit: string;
  readonly fitAuto: string;
  readonly zoom50: string;
  readonly zoom100: string;
  readonly autoLayout: string;
  readonly autoLayoutHint: string;
  readonly autoLayoutFailed: string;
  readonly format: string;
  readonly formatHint: string;
  readonly diagrams: string;
  readonly diagramPanel: string;
  readonly busy: string;
  readonly export: string;
  readonly exportBpmn: string;
  readonly exportDrawio: string;
  readonly exportSparx: string;
  readonly exportFailed: string;
  readonly import: string;
  readonly importFailed: string;
  readonly readOnlyLossy: string;
  readonly notices: string;
  readonly dismiss: string;
}

export const DEFAULT_LABELS: WorkshopLabels = {
  toolbar: "Diagram",
  undo: "Undo",
  redo: "Redo",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit",
  fitAuto: "Fit (auto)",
  zoom50: "50%",
  zoom100: "100%",
  autoLayout: "Auto-layout",
  autoLayoutHint: "Lay the diagram out again; the content is unchanged and the layout can be undone",
  autoLayoutFailed: "The auto-layout failed; the diagram is unchanged.",
  format: "Format",
  formatHint: "Display only: the BPMN model is the same in every format",
  diagrams: "Diagrams",
  diagramPanel: "Diagram canvas",
  busy: "The diagram is being updated",
  export: "Export",
  exportBpmn: "BPMN",
  exportDrawio: "Draw.io",
  exportSparx: "Sparx (BPMN 2.0)",
  exportFailed: "Export failed",
  import: "Import",
  importFailed: "Import failed",
  readOnlyLossy: "This document would lose content if it was saved, so it is open read-only.",
  notices: "Messages",
  dismiss: "Dismiss",
};
