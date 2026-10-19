import { canonicalize, canonicalDigest, rawDigest } from "./canonical.js";
import { parseProfileText } from "./contracts.js";
import { cloneJson, descriptorIndex, failContract, freezeJson } from "./native-contracts.js";
import type { DescriptorIndex } from "./native-contracts.js";
import type { CompleteProfileDocument, IdentityPin } from "./envelope.js";

export const compilerRelease = freezeJson({
  schema: { id: "urn:profile-mechanism:1:profile", version: "1.0.0", sha256: "c97cfba64560ec0e7098294a5e185187de9d1f2207b272c2f002f576865692da" },
  rules: { format: "profile-compiler-rule-table/1", revision: "R3.3", sha256: "a684ac82bbf6a94dedd53e97c72055b4fb2110b27fd75774bbe2fd1944ffd1e1" },
});
export interface InputPin extends IdentityPin { readonly digestDomain: "raw" | "canonical" }
export interface RegistrySignature {
  readonly capabilities: readonly string[];
  readonly signatures: Readonly<Record<string, { readonly capability: string; readonly version: string; readonly argumentSchemaDigest: string }>>;
}
export interface CompilerInputs {
  readonly schemaBytes: Uint8Array;
  readonly compilerRuleTable: typeof compilerRelease.rules;
  readonly baseBytes: Uint8Array;
  readonly basePin: InputPin;
  readonly descriptorPins: readonly (InputPin & { readonly descriptorBytes: Uint8Array })[];
  readonly capabilities: RegistrySignature;
  readonly assetBag?: ReadonlyMap<string, Uint8Array>;
  readonly maxBytes?: number;
}
export interface AuthorityField { readonly type: string; readonly field: string; readonly kind: string; readonly producers: readonly string[] }
export interface CompilerAuthority {
  readonly descriptors: DescriptorIndex;
  readonly types: readonly string[];
  readonly fields: readonly AuthorityField[];
  readonly idRefScalars: readonly string[];
  readonly registrySignature: RegistrySignature;
}
/** Capture caller-owned input bytes and identity data before admission. */
export function snapshotCompilerInputs(inputs: CompilerInputs): CompilerInputs {
  const snapshot = { ...inputs, schemaBytes: Uint8Array.from(inputs.schemaBytes) };
  if (inputs.baseBytes) snapshot.baseBytes = Uint8Array.from(inputs.baseBytes);
  if (inputs.basePin) snapshot.basePin = cloneJson(inputs.basePin);
  if (inputs.compilerRuleTable) snapshot.compilerRuleTable = cloneJson(inputs.compilerRuleTable);
  if (inputs.capabilities) snapshot.capabilities = cloneJson(inputs.capabilities);
  if (Array.isArray(inputs.descriptorPins)) snapshot.descriptorPins = inputs.descriptorPins.map(pin => ({ ...pin, descriptorBytes: Uint8Array.from(pin.descriptorBytes) }));
  if (inputs.assetBag) snapshot.assetBag = new Map([...inputs.assetBag].map(([key, bytes]) => [key, Uint8Array.from(bytes)]));
  return snapshot;
}
export function checkRuleTable(value: unknown): void {
  if (!value || canonicalize(value) !== canonicalize(compilerRelease.rules)) failContract("profile-capability");
}
export function checkCompilerSchema(inputs: CompilerInputs): void {
  if (rawDigest(inputs.schemaBytes) !== compilerRelease.schema.sha256) failContract("profile-schema");
  checkRuleTable(inputs.compilerRuleTable);
}
function pinnedDocument(bytes: Uint8Array, pin: InputPin): Record<string, any> {
  if (!(bytes instanceof Uint8Array) || !pin || !["raw", "canonical"].includes(pin.digestDomain)) failContract("descriptor-mismatch");
  const document = parseProfileText(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)) as Record<string, any>;
  const digest = pin.digestDomain === "raw" ? rawDigest(bytes) : canonicalDigest(document);
  if (digest !== pin.sha256 || document.id !== pin.id || document.version !== undefined && document.version !== pin.version) failContract("descriptor-mismatch");
  return document;
}
const identity = (pin: IdentityPin): IdentityPin => ({ id: pin.id, version: pin.version, sha256: pin.sha256 });
export function admitCompilerAuthority(profile: CompleteProfileDocument, inputs: CompilerInputs): CompilerAuthority {
  if (!inputs.capabilities || !Array.isArray(inputs.capabilities.capabilities) || !inputs.capabilities.signatures) failContract("profile-capability");
  if (!inputs.basePin || canonicalize(profile.base) !== canonicalize(identity(inputs.basePin))) failContract("descriptor-mismatch");
  const base = pinnedDocument(inputs.baseBytes, inputs.basePin);
  if (base.version !== profile.base.version || !Array.isArray(base.types) || !Array.isArray(base.fields)) failContract("descriptor-mismatch");
  if (!Array.isArray(inputs.descriptorPins) || canonicalize(profile.descriptors) !== canonicalize(inputs.descriptorPins.map(identity))) failContract("descriptor-mismatch");
  const types: Record<string, any> = Object.create(null);
  const ids = new Set<string>();
  for (const pin of inputs.descriptorPins) {
    if (ids.has(pin.id)) failContract("descriptor-mismatch");
    ids.add(pin.id);
    const document = pinnedDocument(pin.descriptorBytes, pin);
    if (!document.types || typeof document.types !== "object" || Array.isArray(document.types)) failContract("descriptor-mismatch");
    for (const [name, type] of Object.entries(document.types)) {
      if (Object.hasOwn(types, name)) failContract("descriptor-mismatch");
      types[name] = type;
    }
  }
  const descriptors = descriptorIndex({ types });
  if (base.descriptor !== undefined && !ids.has(base.descriptor)) failContract("descriptor-mismatch");
  if (base.types.some((name: string) => !Object.hasOwn(descriptors, name))) failContract("descriptor-mismatch");
  const keys = new Set<string>();
  for (const field of base.fields as AuthorityField[]) {
    const descriptor = descriptors[field.type], key = `${field.type}.${field.field}`;
    if (!descriptor || keys.has(key) || !Array.isArray(field.producers) || !field.producers.length ||
      !["scalar", "reference", "containment"].includes(field.kind) ||
      (field.kind === "scalar" ? !descriptor.scalars.includes(field.field) : !Object.hasOwn(field.kind === "reference" ? descriptor.references : descriptor.containment, field.field))) failContract("profile-type");
    keys.add(key);
  }
  return freezeJson({ descriptors, types: base.types, fields: base.fields, idRefScalars: base.idRefScalars ?? [], registrySignature: cloneJson(inputs.capabilities) });
}
