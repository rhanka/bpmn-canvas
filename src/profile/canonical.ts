/** Private profile-c14n/2 utilities. The existing XML comparator is independent. */
export class ProfileContractError extends Error {
  declare readonly code?: string;
  constructor(code?: string) {
    super(code ?? "Profile contract refused");
    this.name = "ProfileContractError";
    if (code !== undefined) this.code = code;
  }
}

export function checkUnicode(value: string): void {
  for (const scalar of value) {
    const code = scalar.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) throw new ProfileContractError("profile-unicode");
  }
}

/** RFC 8785 over JSON values, including generic finite binary64 numbers.
 * Unsafe integral values here do NOT become admissible profile number tokens.
 * Write sorted entries directly: JSON.stringify(object) reorders integer keys.
 */
export function canonicalize(value: unknown): string {
  const active = new Set<object>();
  function encode(current: unknown): string {
    if (current === null) return "null";
    if (typeof current === "boolean") return current ? "true" : "false";
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new ProfileContractError("profile-number");
      return JSON.stringify(current);
    }
    if (typeof current === "string") {
      checkUnicode(current);
      return JSON.stringify(current);
    }
    if (typeof current !== "object" || active.has(current)) throw new ProfileContractError("profile-json");
    const array = Array.isArray(current);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) {
      throw new ProfileContractError("profile-json");
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (Reflect.ownKeys(current).some(key => typeof key !== "string")) throw new ProfileContractError("profile-json");
    const keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    for (const key of keys) {
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !("value" in descriptor)) throw new ProfileContractError("profile-json");
      checkUnicode(key);
    }
    active.add(current);
    let encoded: string;
    if (array) {
      if (keys.length !== current.length || keys.some((key, i) => key !== String(i))) {
        throw new ProfileContractError("profile-json");
      }
      encoded = `[${keys.map(key => encode(descriptors[key]!.value)).join(",")}]`;
    } else {
      encoded = `{${keys.sort().map(key => `${JSON.stringify(key)}:${encode(descriptors[key]!.value)}`).join(",")}}`;
    }
    active.delete(current);
    return encoded;
  }
  return encode(value);
}

/** B(bytes), with no canonicalization, normalization or trailing-LF removal. */
export async function rawDigest(bytes: string | Uint8Array): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** H(value). Browser and Node use the same UTF-8 bytes and digest domain. */
export function canonicalDigest(value: unknown): Promise<string> {
  return rawDigest(canonicalize(value));
}

/** stable-id/1: callers supply the allocation owner explicitly. */
export async function stableId(ownerId: string, slot: string, stableKey: string): Promise<string> {
  if ([ownerId, slot, stableKey].some(value => typeof value !== "string")) throw new ProfileContractError("profile-type");
  return `g_${await canonicalDigest(["profile-mechanism/1", ownerId, slot, stableKey])}`;
}
