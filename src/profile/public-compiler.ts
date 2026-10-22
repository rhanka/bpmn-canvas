import { admittedAuthorityFields, admittedBaseTypes, admittedIdRefScalars, compileProfile as compile, evaluatePredicate as predicate, selectHandles } from "./compiler.js";
import type { AuthorityField } from "./compiler-authority.js";
import type { CompiledProfile, EvalContext, RegistrySet, ValidatedProfile } from "./compiler.js";
import type { JsonCodecConfiguration } from "../io/moddle-json.js";
import { cloneJson } from "./native-contracts.js";
import type { PureResult } from "./results.js";
import type { UnicodeCaseTable } from "./unicode-case.js";
import { ProfileContractError } from "./canonical.js";

export { loadProfile, evaluateValue } from "./compiler.js";
export type { CompiledProfile, EvalContext, EvalHandle, RegistrySet, ValidatedProfile } from "./compiler.js";
export type { CompilerInputs } from "./compiler-authority.js";
export interface ProfileRegistrySet extends RegistrySet {
  readonly codecConfiguration?: JsonCodecConfiguration;
  readonly unicodeCase?: UnicodeCaseTable;
}
interface State { readonly validated: ValidatedProfile; readonly registry: ProfileRegistrySet; readonly idRefScalars: readonly string[]; readonly baseTypes: readonly string[]; readonly authorityFields: readonly AuthorityField[] }
const states = new WeakMap<CompiledProfile, State>();
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

/** Public compiled handles retain the admitted rule data privately. Rebuilt
 * objects cannot substitute alternative ASTs at the document boundary. */
export function compileProfile(validated: ValidatedProfile, registry: ProfileRegistrySet): PureResult<CompiledProfile> {
  try {
    const result = compile(validated, registry);
    if (result.status === "ok") {
      states.set(result.payload, freeze({ validated: cloneJson(validated), registry: cloneJson(registry), idRefScalars: admittedIdRefScalars(validated), baseTypes: admittedBaseTypes(validated), authorityFields: admittedAuthorityFields(validated) }));
      freeze(result.payload);
    }
    return result;
  } catch (error) {
    return { status: "refused", code: error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error", diagnostics: [] };
  }
}

export function compiledState(compiled: CompiledProfile): State {
  const state = states.get(compiled);
  if (!state) throw new ProfileContractError("profile-context-unknown");
  return state;
}

export type ReadContext = Omit<EvalContext, "bindings"> & { readonly bindings?: EvalContext["bindings"] };
export function evaluatePredicate(ast: unknown, context: ReadContext, bindings: EvalContext["bindings"] = context.bindings ?? {}): PureResult<boolean> {
  return predicate(ast, { ...context, bindings });
}
export function select(selector: unknown, context: ReadContext, bindings: EvalContext["bindings"] = context.bindings ?? {}): ReturnType<typeof selectHandles> {
  return selectHandles(selector, { ...context, bindings });
}
