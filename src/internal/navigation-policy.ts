/** A native navigation index, derived from semantic roots and diagram planes. */
export function documentNavigationIndex(xml: string): { processes: string[]; entries: Record<string, unknown>[] } {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const elements = [...document.getElementsByTagName("*")];
  const roots = [...document.documentElement.children];
  const processes = roots.filter(e => e.localName === "process").map(e => e.getAttribute("id") ?? "");
  const entries: Record<string, unknown>[] = [];
  elements.filter(e => e.localName === "BPMNDiagram").forEach((diagram, order) => {
    const plane = [...diagram.children].find(e => e.localName === "BPMNPlane");
    const semanticRootId = plane?.getAttribute("bpmnElement") ?? "";
    const root = roots.find(e => e.getAttribute("id") === semanticRootId);
    const base = { diagramId: diagram.getAttribute("id") ?? "", order, semanticRootId, label: diagram.getAttribute("name") ?? "" };
    if (root?.localName === "process") {
      entries.push({ ...base, processId: semanticRootId });
      return;
    }
    const represented = [...new Set([...(root?.children ?? [])].filter(e => e.localName === "participant").map(e => e.getAttribute("processRef") ?? "").filter(id => id !== ""))];
    if (!represented.length) {
      entries.push(base);
      return;
    }
    for (const processId of represented) entries.push({ ...base, processId });
  });
  return { processes, entries };
}
