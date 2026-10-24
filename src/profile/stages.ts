import { canonicalize } from "./canonical.js";
import { checkCompatibility } from "./compatibility.js";
import { compiledState } from "./public-compiler.js";
import { checkHostInputLimits } from "./compiler.js";
import type { CompiledProfile } from "./compiler.js";
import { semanticRevision } from "./envelope.js";
import { cloneJson, descriptorIndex, failContract, validateNativeReferences } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode } from "./native-contracts.js";
import type { ProfileIdentity } from "./envelope.js";
import type { Result } from "./results.js";
import type { Report, ReportEntry } from "./report.js";

export interface StageEcho {
  readonly identity: ProfileIdentity;
  readonly baseRevision: string;
}

export interface AdmittedEnvelope {
  readonly envelope: { readonly documentVersion: "1"; readonly profileIdentity: ProfileIdentity; readonly tree: NativeNode;
    readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
    readonly semanticRevision: string };
  readonly echo: StageEcho;
  readonly validated: ReturnType<typeof compiledState>["validated"];
  readonly registry: ReturnType<typeof compiledState>["registry"];
  readonly descriptors: DescriptorIndex;
  readonly idRefScalars: readonly string[];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Shape-level admission: record, document version, strict envelope shape. */
export function admitShape(envelopeInput: unknown): { readonly admitted: AdmittedEnvelope["envelope"] } | { readonly code: string } {
  const envelope = recordOf(envelopeInput);
  if (!envelope) return { code: "profile-schema" };
  if (envelope.documentVersion !== "1") return { code: "document-version-unsupported" };
  if (!recordOf(envelope.profileIdentity) || !recordOf(envelope.tree) ||
      typeof (envelope.tree as NativeNode).$type !== "string" || typeof envelope.semanticRevision !== "string") {
    return { code: "profile-schema" };
  }
  return { admitted: envelope as unknown as AdmittedEnvelope["envelope"] };
}

/** §3.3 compatibility preflight (C1), then revision integrity, then the graph index. */
export function admitContent(compiled: CompiledProfile, envelope: AdmittedEnvelope["envelope"]): {
    readonly validated: AdmittedEnvelope["validated"]; readonly registry: AdmittedEnvelope["registry"];
    readonly descriptors: DescriptorIndex; readonly idRefScalars: AdmittedEnvelope["idRefScalars"];
    readonly index: ReturnType<typeof validateNativeReferences> } {
  const { validated, registry, idRefScalars } = compiledState(compiled);
  const injected = compiled.identity;
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
  if (semanticRevision(envelope.tree, envelope.profileIdentity, envelope.bindings ?? []) !== envelope.semanticRevision) {
    failContract("profile-schema");
  }
  const descriptors = descriptorIndex({ types: registry.descriptors });
  const index = validateNativeReferences(envelope.tree, descriptors, idRefScalars);
  checkHostInputLimits(envelope.tree);
  for (const binding of envelope.bindings ?? []) {
    if (!index.byId.has(binding.ownerId) || !index.byId.has(binding.targetId)) failContract("support-binding-conflict");
  }
  return { validated, registry, descriptors, idRefScalars, index };
}

export function echoOf(envelope: AdmittedEnvelope["envelope"]): StageEcho {
  return { identity: cloneJson(envelope.profileIdentity), baseRevision: envelope.semanticRevision };
}

export interface RefusalReport {
  readonly reportVersion: "2";
  readonly operation: string;
  readonly sourceIdentity?: ProfileIdentity;
  readonly inputRevision?: string;
  readonly entries: readonly [];
  readonly rawStandardFindings: readonly [];
  readonly idMap: readonly [];
  readonly artifacts: readonly [];
}

export function refusalReport(operation: string, echo: StageEcho | null): RefusalReport {
  return echo
    ? { reportVersion: "2", operation, sourceIdentity: echo.identity, inputRevision: echo.baseRevision,
        entries: [], rawStandardFindings: [], idMap: [], artifacts: [] }
    : { reportVersion: "2", operation, entries: [], rawStandardFindings: [], idMap: [], artifacts: [] };
}

export function refusedResult(operation: string, code: string, echo: StageEcho | null): Result<unknown> {
  const report = refusalReport(operation, echo);
  return echo
    ? { status: "refused", operation, profileIdentity: echo.identity, baseRevision: echo.baseRevision,
        code, diagnostics: [], report } as Result<unknown>
    : { status: "refused", operation, code, diagnostics: [], report } as Result<unknown>;
}

// --------------------------------------------------------------- entry order (D §10.1 L751 + G2)
const STAGES = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];

const cmpText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const nullFirst = (a: string | null, b: string | null): number =>
  a === null ? (b === null ? 0 : -1) : b === null ? 1 : cmpText(a, b);
const optionalText = (entry: Record<string, unknown>, key: string, other: Record<string, unknown>): number => {
  const hasA = Object.hasOwn(entry, key), hasB = Object.hasOwn(other, key);
  if (!hasA) return hasB ? -1 : 0;
  if (!hasB) return 1;
  return cmpText(entry[key] as string, other[key] as string);
};
const absentFirst = (entry: Record<string, unknown>, flag: string, value: string, other: Record<string, unknown>): number => {
  const hasA = entry[flag] as boolean, hasB = other[flag] as boolean;
  if (!hasA) return hasB ? -1 : 0;
  if (!hasB) return 1;
  return cmpText(canonicalize(entry[value]), canonicalize(other[value]));
};

export function compareStageEntries(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const stage = STAGES.indexOf(a.stage as string) - STAGES.indexOf(b.stage as string);
  if (stage !== 0) return stage;
  return cmpText(a.ruleId as string, b.ruleId as string)
    || cmpText((a.source as Record<string, string>).domain as string, (b.source as Record<string, string>).domain as string)
    || nullFirst((a.source as Record<string, string | null>).pointer as (string | null),
        (b.source as Record<string, string | null>).pointer as (string | null))
    || nullFirst((a.source as Record<string, string | null>).targetId as (string | null),
        (b.source as Record<string, string | null>).targetId as (string | null))
    || cmpText(a.code as string, b.code as string)
    || optionalText(a, "pageId", b)
    || optionalText(a, "occurrenceKey", b)
    || absentFirst(a, "beforePresent", "before", b)
    || absentFirst(a, "afterPresent", "after", b)
    || cmpText((a.result as Record<string, string>).domain as string, (b.result as Record<string, string>).domain as string)
    || nullFirst((a.result as Record<string, string | null>).pointer as (string | null),
        (b.result as Record<string, string | null>).pointer as (string | null))
    || nullFirst((a.result as Record<string, string | null>).targetId as (string | null),
        (b.result as Record<string, string | null>).targetId as (string | null))
    || optionalText(a, "property", b);
}

export function sortStageEntries(entries: readonly ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => compareStageEntries(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>));
}

export interface StageReportOptions {
  readonly sourceIdentity?: ProfileIdentity;
  readonly targetIdentity?: ProfileIdentity;
  readonly inputRevision?: string;
  readonly outputRevision?: string;
  readonly entries: readonly ReportEntry[];
  readonly idMap?: readonly { readonly sourceId: string; readonly resultId: string; readonly domain: "migration" | "export" }[];
}

/** Stage report assembly: full order, exact-duplicate coalescing. Unlike the
 * shared buildReport, this admits generated none-coordinates the twin emits
 * for created supports, without relaxing the shared validator. */
export function buildStageReport(operation: string, options: StageReportOptions): Report {
  const seen = new Set<string>();
  const entries = sortStageEntries(options.entries).filter(entry => {
    const key = canonicalize(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { reportVersion: "2", operation,
    ...(options.sourceIdentity ? { sourceIdentity: options.sourceIdentity } : {}),
    ...(options.targetIdentity ? { targetIdentity: options.targetIdentity } : {}),
    ...(options.inputRevision ? { inputRevision: options.inputRevision } : {}),
    ...(options.outputRevision ? { outputRevision: options.outputRevision } : {}),
    entries, rawStandardFindings: [], idMap: options.idMap ? [...options.idMap] : [], artifacts: [] };
}

/** R3.1 producer witness: the actor in `from` was transferred away from this field. */
export function checkProducer(validated: AdmittedEnvelope["validated"], holderType: string, property: string, actor: "code"): void {
  const delta = validated.profile.producerDelta as readonly {
    readonly nativeType: string; readonly path: string; readonly from: string; readonly to: string }[] ?? [];
  for (const entry of delta) {
    if (entry.nativeType === holderType && entry.path === `/${property}` && entry.from === actor) {
      failContract("profile-producer");
    }
  }
}
