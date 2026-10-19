// Lot-2 public surface. Editor transactions and C/N execution are later lots.
export { loadProfile, compileProfile, evaluatePredicate, evaluateValue, select } from "./public-compiler.js";
export type { CompiledProfile, CompilerInputs, EvalContext, EvalHandle, ProfileRegistrySet, ReadContext, RegistrySet, ValidatedProfile } from "./public-compiler.js";
export { createDescriptorContext, requireSingleContext } from "./descriptor-context.js";
export type { DescriptorContext, DescriptorPackage, DescriptorPin } from "./descriptor-context.js";
export { previewNativeJson, buildPortableManifest, readPortableManifest } from "./native-bridge.js";
export type { ImportPreview, PortableManifest } from "./native-bridge.js";
export { semanticRevision } from "./envelope.js";
export type { DocumentEnvelope, ProfileIdentity } from "./envelope.js";
export type { PureResult, Result } from "./results.js";
export type { Report, ReportEntry } from "./report.js";
export { validate } from "./validate.js";
export type { ValidationReport } from "./validate.js";
