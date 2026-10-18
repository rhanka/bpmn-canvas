// Compile-time proof of the 0.4.0 API surface (test list §11.2). Run with: npm run typecheck:compat
import type { ReactNode } from "react";
import { createBpmnCanvas } from "../../src/index.js";
import type { BpmnCanvasHandle, DiagnosticCode, SetXmlOptions } from "../../src/index.js";
import { export as exportModel, initializeCodecs, parseDefinitions, listDiagrams } from "../../src/io/index.js";
import type { DiagramFile, IoErrorCode, IoOptions } from "../../src/io/index.js";
import { BpmnWorkshop, navigationResolver } from "../../src/react/index.js";
import type { BpmnWorkshopProps, DownloadContext, FormatOption, NavigationRule } from "../../src/react/index.js";

const options: IoOptions = { host: "host", drawio: { agent: "agent" }, sparx: { exporter: "exporter", exporterVersion: "1.0" } };
initializeCodecs(options);
const file: Promise<Uint8Array> = parseDefinitions("<x/>").then((r) => exportModel(r.rootElement, "sparx"));
const names: string[] = listDiagrams("<x/>").map((d) => d.name);
const codes: IoErrorCode[] = ["free-annotation", "orphan-application", "invalid-semantics", "missing-semantics"];
const diagnostic: DiagnosticCode = "load-layout-failed";

const setXmlOptions: SetXmlOptions = { revision: "r", layoutOnLoad: true };
export async function canvas(host: HTMLElement): Promise<BpmnCanvasHandle> {
  const h = createBpmnCanvas(host, { xml: "<x/>", layoutOnLoad: true, profile: "colored", profileOptions: { palette: "legend", drawing: "classic" } });
  await h.setXml("<x/>", setXmlOptions);
  await h.setProfile("colored", undefined, { palette: "legend", drawing: "classic" });
  return h;
}

const rules: NavigationRule[] = ["calledElement", "exactName", "sectionNumber", "substring"];
const icon: ReactNode = null;
const format: FormatOption = { id: "bpmn", label: "BPMN", profile: "colored", palette: "legend", drawing: "classic" };
export const props: BpmnWorkshopProps = {
  xml: "<x/>",
  formats: [format],
  layoutOnLoad: true,
  toolbar: { zoomButtons: false, autoLayout: "text", importButton: false },
  menus: { chevron: "text", icons: false },
  icons: { undo: icon, redo: icon },
  navigation: { rules },
  onDownload: (f: DiagramFile, context: DownloadContext) => {
    const parts: [string, string | undefined, string | undefined, string, boolean] = [context.xml, context.revision, context.diagramId, context.profile, context.touched];
    void f;
    void parts;
  },
};
export const resolver = navigationResolver(rules);
export const workshop = BpmnWorkshop;
export const used = [file, names, codes, diagnostic];
