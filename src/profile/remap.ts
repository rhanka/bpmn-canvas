import { parseActivation } from "./activation.js";
import { canonicalize, canonicalDigest } from "./canonical.js";
import { checkCompatibility } from "./compatibility.js";
import type { CompiledProfile } from "./compiler.js";
import { semanticRevision } from "./envelope.js";
import { cloneJson, compareBindings, descriptorIndex, failContract } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode } from "./native-contracts.js";
import type { SupportBinding } from "./planning.js";
import { admitShape, buildStageReport, echoOf, refusedResult } from "./stages.js";
import { compiledState } from "./public-compiler.js";
import type { ReportEntry } from "./report.js";
import type { Result } from "./results.js";

/** Authoring-subset grammar for migration result ids. */
const ID_GRAMMAR = /^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/;
const COMMAND_KEYS = new Set(["kind", "approved", "approval", "map", "referenceFreeAttestations", "namespaces"]);
const MAP_KEYS = new Set(["sourceId", "resultId", "domain"]);

interface RemapCommand {
  readonly rows: readonly { readonly sourceId: string; readonly resultId: string }[];
  readonly attestations: readonly { readonly property: string; readonly descriptor: { readonly id: string; readonly version: string; readonly sha256: string } }[];
  readonly namespaces: ReadonlyMap<string, string>;
}

function checkCommand(command: unknown): RemapCommand {
  if (!command || typeof command !== "object" || Array.isArray(command)) return failContract("operation-error");
  const record = command as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!COMMAND_KEYS.has(key)) return failContract("operation-error");
  if (record.kind !== "id-remap" || record.approved !== true) return failContract("operation-error");
  if (typeof record.approval !== "string" || !record.approval) return failContract("operation-error");
  if (!Array.isArray(record.map)) return failContract("operation-error");
  const seen = new Set<string>();
  const rows = (record.map as readonly unknown[]).map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return failContract("operation-error");
    const keys = Object.keys(row as Record<string, unknown>);
    if (keys.length !== 3 || !keys.every(key => MAP_KEYS.has(key))) return failContract("operation-error");
    const { sourceId, resultId, domain } = row as Record<string, unknown>;
    if (typeof sourceId !== "string" || typeof resultId !== "string" || domain !== "migration") {
      return failContract("operation-error");
    }
    if (seen.has(sourceId)) return failContract("operation-error");
    seen.add(sourceId);
    return { sourceId, resultId };
  });
  if (!Array.isArray(record.referenceFreeAttestations)) return failContract("operation-error");
  const attestations = (record.referenceFreeAttestations as readonly unknown[]).map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return failContract("operation-error");
    const keys = Object.keys(item as Record<string, unknown>);
    if (keys.length !== 3 || !(keys as string[]).includes("property") || !(keys as string[]).includes("referenceFree") ||
      !(keys as string[]).includes("descriptor")) return failContract("operation-error");
    const { property, referenceFree, descriptor } = item as Record<string, unknown>;
    if (typeof property !== "string" || referenceFree !== true || !descriptor || typeof descriptor !== "object" ||
      Array.isArray(descriptor)) return failContract("operation-error");
    const dkeys = Object.keys(descriptor as Record<string, unknown>);
    if (dkeys.length !== 3 || !(dkeys as string[]).includes("id") || !(dkeys as string[]).includes("version") ||
      !(dkeys as string[]).includes("sha256")) return failContract("operation-error");
    const { id, version, sha256 } = descriptor as Record<string, unknown>;
    if (typeof id !== "string" || typeof version !== "string" || typeof sha256 !== "string") {
      return failContract("operation-error");
    }
    return { property, descriptor: { id, version, sha256 } };
  });
  const namespaces = new Map<string, string>();
  const declared = record.namespaces;
  if (declared !== undefined) {
    if (!Array.isArray(declared)) return failContract("operation-error");
    const seenRows = new Set<string>();
    for (const item of declared as readonly unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return failContract("operation-error");
      const keys = Object.keys(item as Record<string, unknown>);
      if (keys.length !== 2 || !(keys as string[]).includes("prefix") || !(keys as string[]).includes("uri")) {
        return failContract("operation-error");
      }
      const { prefix, uri } = item as Record<string, unknown>;
      if (typeof prefix !== "string" || !prefix || typeof uri !== "string" || !uri) return failContract("operation-error");
      const rowKey = `${prefix}\n${uri}`;
      if (seenRows.has(rowKey)) return failContract("operation-error");
      seenRows.add(rowKey);
      if (!namespaces.has(prefix)) namespaces.set(prefix, uri);
    }
  }
  return { rows, attestations, namespaces };
}

function checkImportedDi(importedDi: unknown): { readonly recordDigest: string; readonly diagrams: unknown[] } {
  if (!importedDi || typeof importedDi !== "object" || Array.isArray(importedDi)) return failContract("snapshot-schema");
  const keys = Object.keys(importedDi as Record<string, unknown>);
  if (keys.length !== 3 || !keys.includes("descriptorDigest") || !keys.includes("diagrams") || !keys.includes("sha256")) {
    return failContract("snapshot-schema");
  }
  const { descriptorDigest, diagrams, sha256 } = importedDi as Record<string, unknown>;
  if (typeof descriptorDigest !== "string" || !Array.isArray(diagrams) || typeof sha256 !== "string") {
    return failContract("snapshot-schema");
  }
  if (canonicalDigest({ descriptorDigest, diagrams }) !== sha256) return failContract("snapshot-schema");
  return { recordDigest: descriptorDigest, diagrams };
}

/** Collect the $type elements of one tree in pre-order. */
function walkElements(tree: NativeNode): NativeNode[] {
  const found: NativeNode[] = [];
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
    } else if (current && typeof current === "object") {
      if (typeof (current as NativeNode).$type === "string") found.push(current as NativeNode);
      const values = Object.values(current as Record<string, unknown>);
      for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
    }
  }
  return found;
}

class Rewriter {
  readonly entries: ReportEntry[] = [];
  constructor(private readonly total: ReadonlyMap<string, string>,
    private readonly namespaces: ReadonlyMap<string, string>,
    private readonly ownNamespace: string | null,
    private readonly covered: ReadonlySet<string>,
    private readonly types: DescriptorIndex,
    private readonly refFields: ReadonlySet<string>) {}

  private observe(code: string, value: string, pointer: string, targetId: string | null, prop: string, domain: "tree" | "artifact"): void {
    const coordinate = { domain, pointer, targetId, provenance: "exact" as const };
    this.entries.push({ code, severity: "error", classification: "integrity", stage: "import", ruleId: "remap-ids",
      messageKey: code, disposition: "observed", source: { ...coordinate }, result: { ...coordinate },
      property: prop, beforePresent: true, before: value, afterPresent: true, after: value } as ReportEntry);
  }

  rewriteReference(value: string, elementId: string | null, pointer: string, prop: string): string {
    if (!value) return value;
    const mapped = this.total.get(value);
    if (mapped !== undefined) return mapped;
    const colon = value.indexOf(":");
    if (colon > 0) {
      const prefix = value.slice(0, colon), local = value.slice(colon + 1);
      const uri = this.namespaces.get(prefix);
      if (uri !== undefined) {
        if (uri === this.ownNamespace && this.ownNamespace !== null) {
          const localMapped = this.total.get(local);
          if (localMapped !== undefined) return `${prefix}:${localMapped}`;
        } else {
          this.observe("unsupported-namespace", value, pointer, elementId, prop, "tree");
          return value;
        }
      }
    }
    this.observe("reference-dangling", value, pointer, elementId, prop, "tree");
    return value;
  }

  private referenceMembers(typeName: string): Set<string> {
    const found = new Set<string>();
    const spec = this.types[typeName];
    if (spec) for (const key of Object.keys(spec.references)) found.add(key);
    for (const key of this.refFields) {
      const dot = key.indexOf(".");
      if (dot >= 0 && key.slice(0, dot) === typeName) found.add(key.slice(dot + 1));
    }
    return found;
  }

  rewriteTree(tree: NativeNode): void {
    const stack: [Record<string, unknown>, string][] = [[tree as Record<string, unknown>, ""]];
    while (stack.length > 0) {
      const [node, pointer] = stack.pop()!;
      this.rewriteObject(node, pointer);
      for (const [key, item] of Object.entries(node)) {
        const child = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (item && typeof item === "object" && !Array.isArray(item)) stack.push([item as Record<string, unknown>, child]);
        else if (Array.isArray(item)) {
          for (let i = 0; i < item.length; i++) {
            const entry = item[i];
            if (entry && typeof entry === "object" && !Array.isArray(entry)) {
              stack.push([entry as Record<string, unknown>, `${child}/${i}`]);
            }
          }
        }
      }
    }
  }

  private rewriteObject(node: Record<string, unknown>, pointer: string): void {
    const typeName = node.$type;
    if (typeof typeName !== "string") return;
    if (typeof node.id === "string") node.id = this.total.get(node.id) ?? node.id;
    const references = this.referenceMembers(typeName);
    for (const key of Object.keys(node)) {
      if (key === "$type" || key === "id" || this.covered.has(`${typeName}\n${key}`)) continue;
      if (!references.has(key)) continue;
      const child = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      const elementId = typeof node.id === "string" ? node.id as string : null;
      const value = node[key];
      if (typeof value === "string") node[key] = this.rewriteReference(value, elementId, child, key);
      else if (Array.isArray(value)) {
        node[key] = (value as unknown[]).map(item =>
          typeof item === "string" ? this.rewriteReference(item, elementId, child, key) : item);
      }
    }
  }

  rewriteDiagrams(diagrams: unknown[]): unknown[] {
    const stack: [unknown, string][] = [[diagrams, "/importedDi/diagrams"]];
    const push = (item: unknown, pointer: string): void => {
      if (item && typeof item === "object") stack.push([item, pointer]);
    };
    while (stack.length > 0) {
      const [current, pointer] = stack.pop()!;
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) push(current[i], `${pointer}/${i}`);
      } else if (current && typeof current === "object") {
        const record = current as Record<string, unknown>;
        const value = record.bpmnElement;
        if (typeof value === "string") {
          const mapped = this.total.get(value);
          if (mapped !== undefined) record.bpmnElement = mapped;
          else {
            const holder = record.id;
            this.observe("reference-dangling", value, `${pointer}/bpmnElement`,
              typeof holder === "string" ? holder as string : null, "bpmnElement", "artifact");
          }
        }
        for (const [key, item] of Object.entries(record)) {
          if (key === "id" || key === "bpmnElement") continue;
          push(item, `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`);
        }
      }
    }
    return diagrams;
  }
}

/** Apply one approved id-remap migration to an envelope and its archived
 * Snapshot/1 diagrams at once (DESIGN §5.2). */
export async function remapIds(compiled: CompiledProfile, envelopeInput: unknown, importedDiInput: unknown,
    commandInput: unknown, activationInput?: unknown): Promise<Result<unknown>> {
  const shape = admitShape(envelopeInput);
  if (!("admitted" in shape)) return refusedResult("remapIds", shape.code, null);
  const envelope = shape.admitted;
  const echo = echoOf(envelope);
  try {
    const { validated, registry, idRefScalars } = compiledState(compiled);
    const injected = compiled.identity;
    const activation = parseActivation(activationInput);
    const command = checkCommand(commandInput);
    const { recordDigest, diagrams } = checkImportedDi(importedDiInput);
    const resources = validated.profile.resources as readonly { readonly assetKey: string }[];
    const decision = checkCompatibility({
      runtime: { mechanisms: ["1"], schemas: ["1.0.0"], capabilities: [...registry.capabilities], assets: resources.map(r => r.assetKey) },
      injected,
      document: { documentVersion: envelope.documentVersion, profileIdentity: envelope.profileIdentity },
      requiredCapabilities: [...(validated.profile.capabilities as readonly string[])],
      requiredAssets: resources.map(r => r.assetKey),
      sourcePackage: canonicalize(injected) === canonicalize(envelope.profileIdentity) ? "known-and-available" : "unavailable",
      envelopeValid: true,
      selectedMigration: false,
    });
    if (decision.verdict.status === "refused") failContract(decision.verdict.code);
    if (!Array.isArray(envelope.bindings)) return failContract("profile-schema");
    if (semanticRevision(envelope.tree, envelope.profileIdentity, envelope.bindings ?? []) !== envelope.semanticRevision) {
      failContract("profile-schema");
    }
    const pins = injected.descriptors ?? [];
    const sortedPins = [...pins].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (canonicalDigest(sortedPins) !== recordDigest) return failContract("descriptor-mismatch");
    if (activation === "edit") return failContract("profile-open");
    const descriptors = descriptorIndex({ types: registry.descriptors });
    const refFields = new Set(idRefScalars);
    const working = cloneJson(envelope.tree);
    const elements = walkElements(working);
    const ids: string[] = [];
    const seenIds = new Set<string>();
    for (const element of elements) {
      if (typeof element.id !== "string") continue;
      if (seenIds.has(element.id)) return failContract("id-collision");
      seenIds.add(element.id);
      ids.push(element.id);
    }
    const ordered = [...command.rows].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
    for (const row of ordered) {
      if (!seenIds.has(row.sourceId)) return failContract("reference-dangling");
      if (!ID_GRAMMAR.test(row.resultId)) return failContract("profile-schema");
    }
    const total = new Map<string, string>(ids.map(id => [id, id]));
    for (const row of ordered) total.set(row.sourceId, row.resultId);
    if (new Set(ids.map(id => total.get(id))).size !== ids.length) return failContract("id-collision");
    const covered = new Set<string>();
    for (const attestation of command.attestations) {
      const dot = attestation.property.lastIndexOf(".");
      if (dot < 0) continue;
      const candidate = attestation.descriptor;
      if (pins.some(pin => pin.id === candidate.id && pin.version === candidate.version && pin.sha256 === candidate.sha256)) {
        covered.add(`${attestation.property.slice(0, dot)}\n${attestation.property.slice(dot + 1)}`);
      }
    }
    // Refuse unclassified, unattested members (migration-reference-opaque). A
    // member held under ExtensionElements values is an opaque extension
    // value: even a classified scalar needs a pinned reference-free
    // attestation, otherwise remap cannot prove it holds no reference.
    const opaqueStack: { readonly node: NativeNode; readonly inValues: boolean }[] =
      [{ node: working, inValues: false }];
    while (opaqueStack.length > 0) {
      const { node: element, inValues } = opaqueStack.pop()!;
      const typeName = element.$type;
      const spec = descriptors[typeName];
      const allowed = spec ? new Set(["$type", "id", ...spec.scalars, ...Object.keys(spec.references),
        ...Object.keys(spec.containment),
        ...[...refFields].filter(key => key.startsWith(`${typeName}.`)).map(key => key.slice(typeName.length + 1))]) : null;
      for (const member of Object.keys(element)) {
        if (member === "$type" || member === "id") continue;
        const value = element[member];
        const underValues = (typeName === "bpmn:ExtensionElements" && member === "values") || inValues;
        if (value && typeof value === "object") {
          const children = Array.isArray(value) ? value : [value];
          for (const child of children) {
            if (child && typeof child === "object" && !Array.isArray(child) &&
              typeof (child as NativeNode).$type === "string") {
              opaqueStack.push({ node: child as NativeNode, inValues: underValues });
            }
          }
        }
        if (allowed !== null && allowed.has(member) && !inValues) continue;
        if (covered.has(`${typeName}\n${member}`)) continue;
        return failContract("migration-reference-opaque");
      }
    }
    const rewriter = new Rewriter(total, command.namespaces,
      typeof working.targetNamespace === "string" ? working.targetNamespace as string : null,
      covered, descriptors, refFields);
    rewriter.rewriteTree(working);
    const newBindings = ((envelope.bindings ?? []) as readonly SupportBinding[]).map(record => ({
      ownerId: typeof record.ownerId === "string" ? total.get(record.ownerId) ?? record.ownerId : record.ownerId,
      role: record.role,
      targetId: typeof record.targetId === "string" ? total.get(record.targetId) ?? record.targetId : record.targetId,
    })).sort(compareBindings);
    const newDiagrams = rewriter.rewriteDiagrams(cloneJson(diagrams) as unknown[]);
    const revision = semanticRevision(working, envelope.profileIdentity, newBindings);
    const snapshot = { descriptorDigest: recordDigest, diagrams: newDiagrams,
      sha256: canonicalDigest({ descriptorDigest: recordDigest, diagrams: newDiagrams }) };
    const idMap = [...ids].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
      .map(sourceId => ({ sourceId, resultId: total.get(sourceId)!, domain: "migration" as const }));
    const report = buildStageReport("remapIds", { sourceIdentity: echo.identity, targetIdentity: echo.identity,
      inputRevision: echo.baseRevision, outputRevision: revision, entries: rewriter.entries, idMap });
    const outEnvelope = { documentVersion: "1" as const, profileIdentity: echo.identity, tree: working,
      bindings: newBindings, semanticRevision: revision };
    return { status: "ok", operation: "remapIds", profileIdentity: echo.identity, baseRevision: echo.baseRevision,
      revision, report, payload: { envelope: outEnvelope, importedDi: snapshot } } as unknown as Result<unknown>;
  } catch (error) {
    return refusedResult("remapIds", (error as { readonly code?: string }).code ?? "operation-error", echo);
  }
}
