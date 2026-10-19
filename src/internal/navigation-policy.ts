/** A native navigation index, derived from semantic roots and diagram planes. */
export function documentNavigationIndex(xml: string): { processes: string[]; entries: Record<string, unknown>[] } {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const elements = [...document.getElementsByTagName("*")];
  const roots = [...document.documentElement.children];
  const processes = roots.filter(e => e.localName === "process").map(e => e.getAttribute("id") ?? "");
  const entries = elements.filter(e => e.localName === "BPMNDiagram").map((diagram, order) => {
    const plane = [...diagram.children].find(e => e.localName === "BPMNPlane");
    const semanticRootId = plane?.getAttribute("bpmnElement") ?? "";
    const root = roots.find(e => e.getAttribute("id") === semanticRootId);
    const processId = root?.localName === "process" ? semanticRootId : [...(root?.children ?? [])].find(e => e.localName === "participant")?.getAttribute("processRef");
    return { diagramId: diagram.getAttribute("id") ?? "", order, semanticRootId, ...(processId ? { processId } : {}), label: diagram.getAttribute("name") ?? "" };
  });
  return { processes, entries };
}
