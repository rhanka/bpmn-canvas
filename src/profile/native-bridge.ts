import { canonicalize } from "./canonical.js";
import { parseProfileText } from "./contracts.js";
import { importRevision, projectSemanticTree } from "./envelope.js";
import type { DescriptorRole, DocumentEnvelope, ProfileIdentity } from "./envelope.js";
import { cloneJson, failContract, nativeIndex, validateBindingKeys, validateNativeReferences } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode, SupportBinding } from "./native-contracts.js";
import { digest, record, validateIdentity } from "./boundary.js";
import { ProfileContractError } from "./canonical.js";
import type { PureResult } from "./results.js";

export interface ImportPreview {
  readonly tree: NativeNode;
  readonly extractedPresentation: { readonly diagrams: readonly unknown[]; readonly properties: readonly { readonly pointer: string; readonly value: unknown }[] };
  readonly sourceDigest: string; readonly baseRevision: string;
}

/** Read-only native import preview: strict parse, descriptor validation,
 * presentation extraction and import base revision. It commits nothing; an
 * explicit classification and binding plan is still required before activation. */
export function previewNativeJson(
  source: string, descriptors: DescriptorIndex, roles: readonly DescriptorRole[],
): PureResult<ImportPreview> {
  try {
    const value = parseProfileText(source);
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as NativeNode).$type !== "string") {
      failContract("profile-type");
    }
    const tree = value as NativeNode;
    nativeIndex(tree, descriptors);
    const { extractedPresentation } = projectSemanticTree(tree, descriptors, roles);
    validateNativeReferences(tree, descriptors);
    const { sourceDigest, baseRevision } = importRevision("native-json", source);
    return { status: "ok", payload: { tree: cloneJson(tree), extractedPresentation: cloneJson(extractedPresentation), sourceDigest, baseRevision }, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return { status: "refused", code, diagnostics: [] };
  }
}

export interface PortableManifest {
  readonly profileIdentity: ProfileIdentity; readonly bindings: readonly SupportBinding[]; readonly semanticRevision: string;
}

/** Standalone XML carries no envelope; this sidecar preserves portable profile
 * identity beside it. Reimport uses explicit target-profile import, never
 * exporter-name guessing. */
export function buildPortableManifest(envelope: Pick<DocumentEnvelope, "profileIdentity" | "bindings" | "semanticRevision">): PortableManifest {
  canonicalize(envelope);
  const sorted = [...cloneJson(envelope.bindings)].sort((a, b) =>
    a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : a.role < b.role ? -1 : a.role > b.role ? 1 : a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);
  validateBindingKeys(sorted);
  return { profileIdentity: cloneJson(envelope.profileIdentity), bindings: sorted, semanticRevision: envelope.semanticRevision };
}

export function readPortableManifest(value: unknown): PortableManifest {
  canonicalize(value);
  const manifest = record(value, ["profileIdentity", "bindings", "semanticRevision"]);
  validateIdentity(manifest.profileIdentity);
  digest(manifest.semanticRevision);
  if (!Array.isArray(manifest.bindings)) failContract("support-binding-conflict");
  validateBindingKeys(manifest.bindings as SupportBinding[]);
  const sorted = [...cloneJson(manifest.bindings as SupportBinding[])].sort((a, b) =>
    a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : a.role < b.role ? -1 : a.role > b.role ? 1 : a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);
  if (canonicalize(sorted) !== canonicalize(manifest.bindings)) failContract("support-binding-conflict");
  return cloneJson(value) as PortableManifest;
}
