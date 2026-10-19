import { loadProfile, compileProfile, validate, createDescriptorContext, evaluatePredicate, select } from "../../src/profile/index.js";
import type { PureResult, Result, CompiledProfile, ValidatedProfile, ProfileRegistrySet, CompilerInputs, DocumentEnvelope, ValidationReport, DescriptorContext, ReadContext } from "../../src/profile/index.js";

declare const bytes: Uint8Array;
declare const validated: ValidatedProfile;
declare const registry: ProfileRegistrySet;
declare const compiled: CompiledProfile;
declare const envelope: DocumentEnvelope;
declare const context: ReadContext;
declare const inputs: CompilerInputs;

const loaded: PureResult<ValidatedProfile> = loadProfile(bytes, inputs);
const built: PureResult<CompiledProfile> = compileProfile(validated, registry);
const descriptors: PureResult<DescriptorContext> = createDescriptorContext([]);
const checked: Result<ValidationReport> = validate(compiled, envelope, { phase: "release", readinessPolicy: "accept" });
const predicate: PureResult<boolean> = evaluatePredicate({ op: "true" }, context, {});
const selected = select({}, context, {});
// @ts-expect-error pure operations deliver the union synchronously
const asyncLoad: Promise<PureResult<ValidatedProfile>> = loadProfile(bytes, inputs);
// @ts-expect-error validation cannot expose an unwrapped report
const report: ValidationReport = checked;
void [loaded, built, descriptors, checked, predicate, selected, asyncLoad, report];
