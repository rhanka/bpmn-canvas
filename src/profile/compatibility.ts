import { canonicalize } from "./canonical.js";
import type { ProfileIdentity } from "./envelope.js";

export interface CompatibilityFacts {
  readonly runtime: { readonly mechanisms: readonly string[]; readonly schemas: readonly string[]; readonly capabilities: readonly string[]; readonly assets: readonly string[] };
  readonly injected: ProfileIdentity;
  readonly document?: { readonly documentVersion?: string; readonly profileIdentity?: ProfileIdentity };
  readonly hostIdentity?: ProfileIdentity;
  readonly snapshotIdentity?: ProfileIdentity;
  readonly requiredCapabilities: readonly string[];
  readonly requiredAssets: readonly string[];
  readonly sourcePackage: "known-and-available" | "unavailable" | "unknown";
  readonly envelopeValid: boolean;
  readonly selectedMigration: boolean;
}
interface CompatibilityDecision {
  readonly verdict: { readonly status: "ok" | "refused"; readonly code?: string };
  readonly output: { readonly acceptedUnderInjectedProfile: boolean; readonly sourcePreserved: true; readonly migrationExecuted: false; readonly genericReadOnlyPreviewAllowed?: true };
}
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);

/** Requirements for switching an existing acceptance context. A changed package
 * requires explicit migration and, on successful commit, a new history epoch.
 * These are requirements only: compatibility preflight still gates activation;
 * this utility neither executes migration nor changes editor history.
 */
export function profileActivationRequirements(source: ProfileIdentity, target: ProfileIdentity): {
  readonly explicitMigrationRequired: boolean; readonly newHistoryEpoch: boolean;
} {
  const changed = !same(source, target);
  return { explicitMigrationRequired: changed, newHistoryEpoch: changed };
}

/** Ordered DESIGN R3.3 compatibility preflight over verified package/registry facts.
 * A selected migration is intent, never evidence that a migration was executed.
 * Migration execution, approval and target validation are outside this utility.
 */
export function checkCompatibility(facts: CompatibilityFacts): CompatibilityDecision {
  canonicalize(facts);
  const { runtime: r, injected: p, document: d } = facts;
  const refuse = (code?: string, preview = false): CompatibilityDecision => ({ verdict: { status: "refused", ...(code ? { code } : {}) },
    output: { acceptedUnderInjectedProfile: false, sourcePreserved: true, migrationExecuted: false, ...(preview ? { genericReadOnlyPreviewAllowed: true as const } : {}) } });
  if (d?.documentVersion !== undefined && d.documentVersion !== "1") return refuse("document-version-unsupported");
  if (!d?.documentVersion || !d.profileIdentity) return refuse("profile-metadata-missing", true);
  const identity = d.profileIdentity;
  if ([facts.hostIdentity, facts.snapshotIdentity].some(i => i !== undefined && !same(i, identity))) return refuse("profile-metadata-conflict");
  if (!r.schemas.includes(p.schemaVersion)) return refuse("profile-schema-version");
  if (!r.mechanisms.includes(p.mechanismVersion)) return refuse("mechanism-version-unsupported");
  if (!r.mechanisms.includes(identity.mechanismVersion)) return refuse("document-mechanism-unsupported");
  if (!r.schemas.includes(identity.schemaVersion)) return refuse("document-schema-unsupported");
  const semver = (version: string): readonly bigint[] | undefined => /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version) ? version.split(".").map(BigInt) : undefined;
  const targetVersion = semver(p.version), sourceVersion = semver(identity.version);
  const digestsKnown = /^[0-9a-f]{64}$/.test(p.sha256) && /^[0-9a-f]{64}$/.test(identity.sha256);
  const sourceAvailable = facts.sourcePackage === "known-and-available" && !!targetVersion && !!sourceVersion && digestsKnown;
  // P1 is evaluated at the first applicable source-dependent row. It does not
  // replace earlier unsupported-axis, metadata, capability or digest conflicts.
  const sourceRemedy = (code: string): CompatibilityDecision => refuse(sourceAvailable ? code : "profile-source-unavailable");
  if (p.mechanismVersion !== identity.mechanismVersion) return sourceRemedy("mechanism-migration-required");
  if (p.schemaVersion !== identity.schemaVersion) return sourceRemedy("profile-schema-migration-required");
  if (facts.requiredCapabilities.some(c => !r.capabilities.includes(c))) return refuse("profile-capability");
  if (facts.requiredAssets.some(a => !r.assets.includes(a))) return refuse("profile-resource-missing");
  if (!same(p.base, identity.base)) return sourceRemedy("base-mismatch");
  if (!same(p.descriptors, identity.descriptors)) return sourceRemedy("descriptor-mismatch");
  if (!targetVersion || !sourceVersion) return refuse("profile-source-unavailable");
  if (p.profile !== identity.profile || targetVersion[0] !== sourceVersion[0]) return sourceRemedy("profile-major-mismatch");
  if (p.version === identity.version && digestsKnown && p.sha256 !== identity.sha256) return refuse("profile-digest-mismatch");
  if (!sourceAvailable) return refuse("profile-source-unavailable");
  if (targetVersion[1] === sourceVersion[1]) {
    if (targetVersion[2]! > sourceVersion[2]!) return refuse("profile-patch-migration-required");
    if (targetVersion[2]! < sourceVersion[2]!) return refuse("profile-patch-downgrade-required");
  }
  if (targetVersion[1]! > sourceVersion[1]!) return refuse("profile-minor-migration-required");
  if (targetVersion[1]! < sourceVersion[1]!) return refuse("profile-minor-downgrade-required");
  if (!facts.envelopeValid || !same(p, identity)) return refuse();
  return { verdict: { status: "ok" }, output: { acceptedUnderInjectedProfile: true, sourcePreserved: true, migrationExecuted: false } };
}
