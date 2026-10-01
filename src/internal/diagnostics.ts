/**
 * Import diagnostics (lossless-edit gate). Pure functions: no DOM, no bpmn-js.
 * `analyzeXml` also runs under Node through bpmn-moddle, which is how the corpus is tested.
 */
import type { Diagnostic } from "../types.js";

export interface ModdleWarning {
  readonly message: string;
  readonly element?: { readonly id?: string };
  readonly value?: string;
}

interface ModdleEl {
  readonly $type: string;
  readonly id?: string;
  $instanceOf(type: string): boolean;
  readonly [key: string]: unknown;
}

const MAX_IDS = 100;
const cap = (ids: string[]): string[] => [...new Set(ids)].slice(0, MAX_IDS);

/**
 * True when the XML contains a comment outside CDATA and processing instructions.
 * Comments are dropped by a moddle round trip, so they make an edit lossy.
 */
export function hasXmlComment(xml: string): boolean {
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) return false;
    if (xml.startsWith("<!--", lt)) return true;
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end < 0) return false;
      i = end + 3;
    } else if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end < 0) return false;
      i = end + 2;
    } else {
      i = lt + 1;
    }
  }
  return false;
}

export function classifyWarnings(warnings: readonly ModdleWarning[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const w of warnings) {
    const message = w.message ?? "";
    const dup = /nested error: duplicate ID <([^>]+)>/.exec(message);
    if (dup) {
      out.push({ code: "duplicate-id", severity: "error", destructive: true, ids: [dup[1] as string], message: `Duplicate id "${dup[1]}": the second element is dropped on save.` });
      continue;
    }
    if (message.startsWith("unparsable content")) {
      const el = /unparsable content <([^>]+?)\/?> detected/.exec(message);
      out.push({ code: "unparsable-content", severity: "warning", destructive: true, ids: el ? [el[1] as string] : [], message: `Unrecognised content <${el?.[1] ?? "?"}> is dropped on save.` });
      continue;
    }
    if (message.startsWith("unresolved reference")) {
      const ref = /unresolved reference <([^>]+)>/.exec(message)?.[1];
      const ids = [ref, w.element?.id].filter((v): v is string => typeof v === "string");
      out.push({ code: "unresolved-reference", severity: "warning", destructive: true, ids, message: `Reference to missing id "${ref ?? "?"}"${w.element?.id ? ` from "${w.element.id}"` : ""} is dropped on save.` });
      continue;
    }
    out.push({ code: "import-warning", severity: "warning", message: message.split("\n")[0] ?? message });
  }
  return out;
}

const DI_TYPES = [
  "bpmn:FlowNode",
  "bpmn:SequenceFlow",
  "bpmn:MessageFlow",
  "bpmn:Participant",
  "bpmn:Lane",
  "bpmn:Association",
  "bpmn:TextAnnotation",
  "bpmn:Group",
  "bpmn:DataObjectReference",
  "bpmn:DataStoreReference",
  "bpmn:DataInputAssociation",
  "bpmn:DataOutputAssociation",
];

const isDiTarget = (el: ModdleEl): boolean => DI_TYPES.some((t) => el.$instanceOf(t));
const list = (v: unknown): ModdleEl[] => (Array.isArray(v) ? (v as ModdleEl[]) : []);

function collectDiTargets(el: ModdleEl, into: ModdleEl[]): void {
  for (const child of list(el["flowElements"])) {
    if (isDiTarget(child)) into.push(child);
    if (child.$instanceOf("bpmn:SubProcess")) collectDiTargets(child, into);
  }
  for (const artifact of list(el["artifacts"])) if (isDiTarget(artifact)) into.push(artifact);
  for (const laneSet of list(el["laneSets"])) {
    const stack = list(laneSet["lanes"]);
    while (stack.length) {
      const lane = stack.pop() as ModdleEl;
      into.push(lane);
      stack.push(...list((lane["childLaneSet"] as ModdleEl | undefined)?.["lanes"]));
    }
  }
}

/** Missing and partial DI, from a moddle `bpmn:Definitions`. */
export function analyzeDefinitions(definitions: ModdleEl): Diagnostic[] {
  const out: Diagnostic[] = [];
  const diagrams = list(definitions["diagrams"]);
  const covered = new Set<string>();
  for (const d of diagrams) {
    const plane = d["plane"] as ModdleEl | undefined;
    const planeEl = plane?.["bpmnElement"] as ModdleEl | undefined;
    if (planeEl?.id) covered.add(planeEl.id);
    for (const pe of list(plane?.["planeElement"])) {
      const be = pe["bpmnElement"] as ModdleEl | undefined;
      if (be?.id) covered.add(be.id);
    }
  }

  const targets: ModdleEl[] = [];
  for (const root of list(definitions["rootElements"])) {
    if (root.$instanceOf("bpmn:Process")) collectDiTargets(root, targets);
    if (root.$instanceOf("bpmn:Collaboration")) {
      for (const p of list(root["participants"])) targets.push(p);
      for (const m of list(root["messageFlows"])) targets.push(m);
      for (const a of list(root["artifacts"])) if (isDiTarget(a)) targets.push(a);
    }
  }
  const ids = targets.map((t) => t.id).filter((v): v is string => !!v);

  if (diagrams.length === 0) {
    const noDiIo = collectIncompleteIoSpecs(definitions);
    if (noDiIo.length > 0) out.push({ code: "incomplete-io-specification", severity: "warning", ids: cap(noDiIo), message: "ioSpecification without inputSet and outputSet is invalid against the BPMN 2.0 schema." });
    if (ids.length > 0) {
      out.push({ code: "missing-di", severity: "error", ids: cap(ids), message: "The document has no BPMNDiagram, so there is nothing to draw. DI is not generated implicitly." });
    }
    return out;
  }
  const badIo = collectIncompleteIoSpecs(definitions);
  if (badIo.length > 0) {
    out.push({ code: "incomplete-io-specification", severity: "warning", ids: cap(badIo), message: "ioSpecification without inputSet and outputSet is invalid against the BPMN 2.0 schema." });
  }
  const missing = ids.filter((id) => !covered.has(id));
  if (missing.length > 0) {
    out.push({ code: "partial-di", severity: "warning", ids: cap(missing), message: `${missing.length} element(s) have no diagram shape or edge and are not drawn.` });
  }
  return out;
}

/** An ioSpecification without inputSet/outputSet is invalid against the OMG XSD. Reported, never silently fixed. */
function collectIncompleteIoSpecs(definitions: ModdleEl): string[] {
  const bad: string[] = [];
  const visit = (el: ModdleEl): void => {
    const io = el["ioSpecification"] as ModdleEl | undefined;
    if (io && (list(io["inputSets"]).length === 0 || list(io["outputSets"]).length === 0)) bad.push(el.id ?? io.id ?? el.$type);
    for (const child of list(el["flowElements"])) visit(child);
  };
  for (const root of list(definitions["rootElements"])) if (root.$instanceOf("bpmn:Process")) visit(root);
  return bad;
}

export interface AnalysisResult {
  readonly diagnostics: Diagnostic[];
  /** True when saving after an edit would lose content. */
  readonly lossy: boolean;
}

export const isLossy = (diagnostics: readonly Diagnostic[]): boolean => diagnostics.some((d) => d.destructive === true);

/** Full analysis under Node (no DOM). Parse failure becomes an `invalid-xml` diagnostic. */
export async function analyzeXml(xml: string): Promise<AnalysisResult> {
  const { BpmnModdle } = (await import("bpmn-moddle")) as unknown as { BpmnModdle: new () => { fromXML(x: string): Promise<{ rootElement: ModdleEl; warnings: ModdleWarning[] }> } };
  const diagnostics: Diagnostic[] = [];
  if (hasXmlComment(xml)) {
    diagnostics.push({ code: "comments-present", severity: "warning", destructive: true, message: "XML comments are dropped on save." });
  }
  try {
    const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
    diagnostics.push(...classifyWarnings(warnings), ...analyzeDefinitions(rootElement));
  } catch (error) {
    diagnostics.push({ code: "invalid-xml", severity: "error", message: String((error as Error)?.message ?? error).split("\n")[0] ?? "invalid XML" });
  }
  return { diagnostics, lossy: isLossy(diagnostics) };
}
