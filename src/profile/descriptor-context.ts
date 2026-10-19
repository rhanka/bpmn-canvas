import { canonicalDigest, rawDigest, ProfileContractError } from "./canonical.js";
import { cloneJson, descriptorIndex, freezeJson } from "./native-contracts.js";
import type { DescriptorIndex, NativeType } from "./native-contracts.js";
import type { PureResult } from "./results.js";

export interface DescriptorPackage {
  readonly id: string; readonly version: string; readonly sha256: string; readonly descriptorBytes: Uint8Array;
}
export interface DescriptorPin { readonly id: string; readonly version: string; readonly sha256: string }
export interface DescriptorContext {
  readonly packages: readonly DescriptorPin[]; readonly descriptors: DescriptorIndex; readonly digest: string;
}
const admittedContexts = new WeakSet<DescriptorContext>();

/** Injected descriptor packages only: digest-verified bytes, unique ids, no
 * ambient configuration and no forced package. A valid empty extension map is
 * accepted; required pins are caller-declared, never inferred. */
export function createDescriptorContext(
  packages: readonly DescriptorPackage[], options: { readonly requiredIds?: readonly string[] } = {},
): PureResult<DescriptorContext> {
  try {
    if (!Array.isArray(packages) || packages.length === 0) throw new ProfileContractError("descriptor-mismatch");
    const snapshots = packages.map(pkg => ({ ...pkg, descriptorBytes: pkg.descriptorBytes instanceof Uint8Array ? Uint8Array.from(pkg.descriptorBytes) : pkg.descriptorBytes }));
    const seen = new Set<string>();
    const pins: DescriptorPin[] = [];
    const types: Record<string, NativeType> = {};
    for (const pkg of snapshots) {
      if (!pkg || typeof pkg.id !== "string" || !pkg.id || typeof pkg.version !== "string" || !pkg.version ||
        typeof pkg.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pkg.sha256) || !(pkg.descriptorBytes instanceof Uint8Array)) {
        throw new ProfileContractError("descriptor-mismatch");
      }
      if (seen.has(pkg.id)) throw new ProfileContractError("descriptor-mismatch");
      seen.add(pkg.id);
      if (rawDigest(pkg.descriptorBytes) !== pkg.sha256) throw new ProfileContractError("descriptor-mismatch");
      let document: unknown;
      try {
        document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pkg.descriptorBytes));
      } catch {
        throw new ProfileContractError("descriptor-mismatch");
      }
      const record = (document && typeof document === "object" && !Array.isArray(document) ? document : undefined) as
        | { readonly types?: unknown } | undefined;
      if (!record || !record.types || typeof record.types !== "object" || Array.isArray(record.types)) {
        throw new ProfileContractError("descriptor-mismatch");
      }
      for (const [name, type] of Object.entries(record.types as Record<string, NativeType>)) {
        if (Object.hasOwn(types, name)) throw new ProfileContractError("descriptor-mismatch");
        types[name] = cloneJson(type);
      }
      pins.push({ id: pkg.id, version: pkg.version, sha256: pkg.sha256 });
    }
    for (const id of options.requiredIds ?? []) {
      if (!seen.has(id)) throw new ProfileContractError("descriptor-mismatch");
    }
    let descriptors: DescriptorIndex;
    try {
      descriptors = descriptorIndex({ types });
    } catch {
      throw new ProfileContractError("descriptor-mismatch");
    }
    const context: DescriptorContext = freezeJson({
      packages: pins,
      descriptors,
      digest: canonicalDigest({ packages: pins, types }),
    });
    admittedContexts.add(context);
    return { status: "ok", payload: context, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "descriptor-mismatch" : "operation-error";
    return { status: "refused", code, diagnostics: [] };
  }
}

/** A second live context with different bytes refuses; identical bytes reuse
 * the current one. Process-wide holder policy belongs to the editor handle. */
export function requireSingleContext(current: DescriptorContext, candidate: DescriptorContext): DescriptorContext {
  if (!admittedContexts.has(current) || !admittedContexts.has(candidate) || candidate.digest !== current.digest) throw new ProfileContractError("descriptor-mismatch");
  return current;
}
