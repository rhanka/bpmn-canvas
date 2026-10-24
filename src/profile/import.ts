import { canonicalDigest } from "./canonical.js";
import type { CompiledProfile } from "./compiler.js";
import { checkHostInputLimits } from "./compiler.js";
import { cloneJson, descriptorIndex, failContract, nativeIndex, validateNativeReferences } from "./native-contracts.js";
import type { NativeNode } from "./native-contracts.js";
import { compiledState } from "./public-compiler.js";
import { buildStageReport, refusedResult } from "./stages.js";
import type { ReportEntry } from "./report.js";
import type { Result } from "./results.js";

const DATA_ASSOCIATIONS = new Set(["bpmn:DataInputAssociation", "bpmn:DataOutputAssociation"]);

function parseSource(source: unknown): NativeNode {
  if (source && typeof source === "object" && !Array.isArray(source)) return cloneJson(source) as NativeNode;
  const text = typeof source === "string" ? source
    : source instanceof Uint8Array ? new TextDecoder("utf-8", { fatal: true }).decode(source) : null;
  if (text === null) return failContract("operation-error");
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failContract("operation-error");
    return parsed as NativeNode;
  } catch {
    return failContract("operation-error");
  }
}

/** Walk every $type element with its container address. */
function walkAll(tree: NativeNode): { readonly node: NativeNode; readonly parent: Record<string, unknown> | unknown[] | null; readonly key: string | number | null }[] {
  const found: { readonly node: NativeNode; readonly parent: Record<string, unknown> | unknown[] | null; readonly key: string | number | null }[] = [];
  const stack: { readonly value: unknown; readonly parent: Record<string, unknown> | unknown[] | null; readonly key: string | number | null }[] =
    [{ value: tree, parent: null, key: null }];
  while (stack.length > 0) {
    const { value, parent, key } = stack.pop()!;
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], parent: value, key: i });
    } else if (value && typeof value === "object") {
      if (typeof (value as NativeNode).$type === "string") {
        found.push({ node: value as NativeNode, parent, key });
      }
      const entries = Object.entries(value as Record<string, unknown>);
      for (let i = entries.length - 1; i >= 0; i--) {
        stack.push({ value: entries[i]![1], parent: value as Record<string, unknown>, key: entries[i]![0] });
      }
    }
  }
  return found;
}

function referenceMembers(descriptors: ReturnType<typeof descriptorIndex>, idRefScalars: readonly string[], typeName: string): Set<string> {
  const found = new Set<string>();
  const spec = descriptors[typeName];
  if (spec) for (const key of Object.keys(spec.references)) found.add(key);
  for (const key of idRefScalars) {
    const dot = key.indexOf(".");
    if (dot >= 0 && key.slice(0, dot) === typeName) found.add(key.slice(dot + 1));
  }
  return found;
}

function resolvePointer(tree: NativeNode, pointer: string): unknown {
  let current: unknown = tree;
  for (const raw of pointer.split("/").slice(1)) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[segment];
    } else if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isSafeInteger(index) ? current[index] : undefined;
    } else return undefined;
  }
  return current;
}

/** Project one source document onto the effective base (§5.3): out-of-base
 * subtrees drop with a typed loss report, relations with a dropped endpoint
 * cascade, and dropped ids leave retained reference arrays. */
export async function importProjection(compiled: CompiledProfile, sourceInput: unknown,
    sourceFormat = "native-json"): Promise<Result<unknown>> {
  if (sourceFormat !== "native-json" && sourceFormat !== "bpmn-xml") return refusedResult("importProjection", "operation-error", null);
  try {
    compiledState(compiled);
  } catch {
    return refusedResult("importProjection", "descriptor-mismatch", null);
  }
  let parsed: NativeNode;
  try {
    parsed = parseSource(sourceInput);
  } catch (error) {
    return refusedResult("importProjection", (error as { readonly code?: string }).code ?? "operation-error", null);
  }
  if (sourceFormat === "bpmn-xml") {
    // No XML decoder lives in the profile boundary: the F1 codec input the
    // reader needs is not carried here, so refuse instead of document-not-loaded.
    return refusedResult("importProjection", "operation-error", null);
  }
  const sourceDigest = canonicalDigest(parsed);
  const baseRevision = canonicalDigest({ domain: "profile-import/1", format: sourceFormat, sourceDigest });
  const refuse = (code: string): Result<unknown> => refusedResult("importProjection", code, null);
  try {
    const { registry, idRefScalars, baseTypes } = compiledState(compiled);
    const admitted = new Set(baseTypes);
    if (admitted.size === 0) return failContract("descriptor-mismatch");
    checkHostInputLimits(parsed);
    // DESIGN §3.1/§5.2: committed trees are DI-free. Extracted presentation
    // is preserved as snapshot importedDi, never loss-reported. DI ids live
    // in the separate presentation namespace, hence extraction precedes the
    // semantic id-collision and out-of-base walks.
    let importedDi: { readonly descriptorDigest: string; readonly diagrams: readonly unknown[]; readonly sha256: string } | undefined;
    if (Object.hasOwn(parsed, "diagrams")) {
      const diagrams = (parsed as unknown as Record<string, unknown>).diagrams;
      if (!Array.isArray(diagrams)) return failContract("profile-type");
      const pins = [...compiled.identity.descriptors].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const descriptorDigest = canonicalDigest(pins);
      const kept = cloneJson(diagrams) as readonly unknown[];
      importedDi = { descriptorDigest, diagrams: kept, sha256: canonicalDigest({ descriptorDigest, diagrams: kept }) };
      delete (parsed as unknown as Record<string, unknown>).diagrams;
    }
    const seen = new Set<string>();
    for (const { node } of walkAll(parsed)) {
      if (typeof node.id !== "string") continue;
      if (seen.has(node.id)) return failContract("id-collision");
      seen.add(node.id);
    }
    const descriptors = descriptorIndex({ types: registry.descriptors });
    const doomed = new Set<NativeNode>();
    const droppedIds = new Set<string>();
    for (const { node } of walkAll(parsed)) {
      if (!admitted.has(node.$type)) {
        doomed.add(node);
        if (typeof node.id === "string") droppedIds.add(node.id);
      }
    }
    // Cascade through relations with a dropped scalar endpoint to a fixed point.
    let changed = true;
    while (changed) {
      changed = false;
      for (const { node } of walkAll(parsed)) {
        if (doomed.has(node)) continue;
        if (!("sourceRef" in node) || !("targetRef" in node)) continue;
        for (const key of ["sourceRef", "targetRef"] as const) {
          const value = node[key];
          if (typeof value === "string" && droppedIds.has(value)) {
            doomed.add(node);
            if (typeof node.id === "string") droppedIds.add(node.id);
            changed = true;
            break;
          }
        }
      }
    }
    const pristine = cloneJson(parsed);
    if (droppedIds.size > 0) {
      for (const { node } of walkAll(parsed)) {
        for (const member of referenceMembers(descriptors, idRefScalars, node.$type)) {
          const value = node[member];
          if (Array.isArray(value)) {
            node[member] = (value as unknown[]).filter(item => !(typeof item === "string" && droppedIds.has(item)));
          }
        }
      }
    }
    for (const { node } of walkAll(parsed)) {
      if (doomed.has(node) || !DATA_ASSOCIATIONS.has(node.$type)) continue;
      for (const key of ["sourceRef", "targetRef"] as const) {
        if (Array.isArray(node[key]) && (node[key] as unknown[]).length === 0) {
          doomed.add(node);
          break;
        }
      }
    }
    const index = nativeIndex(parsed, descriptors);
    const parentOf = new Map<NativeNode, NativeNode | null>();
    const pointerOf = new Map<NativeNode, string>();
    for (const entry of index.entries) {
      parentOf.set(entry.node, entry.parent ?? null);
      pointerOf.set(entry.node, entry.pointer);
    }
    const ancestorDoomed = (node: NativeNode): boolean => {
      const seenNodes = new Set<NativeNode>();
      let current = parentOf.get(node) ?? null;
      while (current && !seenNodes.has(current)) {
        if (doomed.has(current)) return true;
        seenNodes.add(current);
        current = parentOf.get(current) ?? null;
      }
      return false;
    };
    const entries: ReportEntry[] = [];
    for (const entry of index.entries) {
      if (!doomed.has(entry.node) || ancestorDoomed(entry.node)) continue;
      entries.push({ code: "import-loss/unsupported-feature", severity: "warn", classification: "loss",
        stage: "import", ruleId: "adapter", messageKey: "import.loss.unsupported-feature", disposition: "dropped",
        source: { domain: "tree", pointer: entry.pointer,
          targetId: typeof entry.node.id === "string" ? entry.node.id : null, provenance: "exact" },
        result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" },
        beforePresent: true, before: resolvePointer(pristine, entry.pointer), afterPresent: false,
        lossClass: "unsupported-feature" });
    }
    // Detach doomed subtrees deepest first from their recorded containers.
    const addresses = new Map<NativeNode, { readonly parent: Record<string, unknown> | unknown[] | null; readonly key: string | number | null }>();
    for (const item of walkAll(parsed)) addresses.set(item.node, { parent: item.parent, key: item.key });
    const condemned = [...doomed].sort((a, b) =>
      (pointerOf.get(b) ?? "").length - (pointerOf.get(a) ?? "").length);
    for (const node of condemned) {
      const slot = addresses.get(node);
      if (!slot || !slot.parent) continue;
      if (Array.isArray(slot.parent)) {
        const at = slot.parent.indexOf(node);
        if (at >= 0) slot.parent.splice(at, 1);
      } else if (typeof slot.key === "string" && (slot.parent as Record<string, unknown>)[slot.key] === node) {
        delete (slot.parent as Record<string, unknown>)[slot.key];
      }
    }
    validateNativeReferences(parsed, descriptors, idRefScalars);
    const identity = cloneJson(compiled.identity);
    const report = buildStageReport("importProjection", { targetIdentity: identity,
      inputRevision: baseRevision, outputRevision: baseRevision, entries });
    return { status: "ok", operation: "importProjection", profileIdentity: identity,
      baseRevision, revision: baseRevision, report,
      payload: importedDi === undefined ? { tree: parsed } : { tree: parsed, importedDi } } as unknown as Result<unknown>;
  } catch (error) {
    return refuse((error as { readonly code?: string }).code ?? "operation-error");
  }
}
