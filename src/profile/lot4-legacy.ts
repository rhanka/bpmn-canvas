// Lot-4 legacy seams: look resolution through the compatibility aliases,
// the theme-switch geometry check, the published per-adapter manifest and
// the legacy diagnostic mapping.
import { ProfileContractError } from "./canonical.js";
import { sha256 } from "./sha256.js";
import { failContract } from "./native-contracts.js";
import type { PureResult } from "./results.js";
import { compareText, requireTrue } from "./lot4-query.js";
import { sortReportEntries } from "./lot4-result.js";

const refusedSeam = (code: string): PureResult<never> =>
  ({ status: "refused", code, diagnostics: [] }) as PureResult<never>;

// resolveLegacyTheme: a legacy look name to the current theme id through an
// explicit-adapter compatibility alias. Aliases are never consulted by the
// render path itself.
export function resolveLegacyTheme(profile: Record<string, any>, look: unknown): PureResult<{ readonly themeId: string }> {
  try {
    if (typeof look !== "string" || look === "") failContract("render-stale");
    const aliases = ((profile.compatibilityAliases ?? []) as any[]).filter(a => a.kind === "theme");
    const matches = aliases.filter(a => a.old === look);
    if (matches.length !== 1) failContract("render-stale");
    const alias = matches[0];
    if (alias.mode !== "explicit-adapter") failContract("render-stale");
    const themes = profile.themes as any[];
    if (!themes.some(t => t.id === alias.destination)) failContract("render-stale");
    return { status: "ok", payload: { themeId: alias.destination }, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedSeam(code);
  }
}

// checkThemeSwitch: whether moving from one theme to another needs a new layout.
export function checkThemeSwitch(ctx: {
  readonly profile: Record<string, any>; readonly metricBytes: Map<string, Uint8Array>;
}, from: string, to: string): PureResult<{ readonly relayoutRequired: boolean }> {
  try {
    const themes = ctx.profile.themes as any[];
    const resolve = (requested: string): any | undefined => {
      if (themes.some(t => t.id === requested)) return themes.find(t => t.id === requested);
      const listing = themes.filter(t => (t.aliases ?? []).includes(requested));
      return listing.length === 1 ? listing[0] : undefined;
    };
    const fromTheme = resolve(from), toTheme = resolve(to);
    if (!fromTheme || !toTheme) failContract("render-stale");
    if (fromTheme.geometry === "theme" || toTheme.geometry === "theme") {
      return { status: "refused", code: "profile-open", diagnostics: [] };
    }
    const chainOf = (theme: any): any[] | undefined => {
      const chain: any[] = [];
      for (let current: any | undefined = theme; current !== undefined;) {
        if (chain.includes(current)) return undefined;
        chain.push(current);
        current = themes.find(t => t.id === current.fallback);
      }
      return chain;
    };
    const fromChain = chainOf(fromTheme), toChain = chainOf(toTheme);
    requireTrue(!!fromChain && !!toChain, "render-stale");
    if (!fromChain || !toChain) failContract("render-stale");
    const tokenOf = (chain: any[], name: string): unknown => {
      for (const theme of chain) {
        const found = (theme.tokens as any[]).find(t => t.name === name);
        if (found) return found.value;
      }
      return undefined;
    };
    const regionFields = (chain: any[]): string[] => {
      const names = new Set<string>();
      for (const theme of chain) {
        for (const token of theme.tokens as any[]) {
          if (typeof token.name === "string" && token.name.startsWith("region.")) names.add(token.name);
        }
      }
      return [...names].sort(compareText);
    };
    const geometryNames = [...new Set([...regionFields(fromChain), ...regionFields(toChain), "fontFamily", "fontSize", "fontWeight"])].sort(compareText);
    const digestOf = (value: unknown): string => JSON.stringify(value) ?? "null";
    for (const name of geometryNames) {
      if (digestOf(tokenOf(fromChain, name)) !== digestOf(tokenOf(toChain, name))) {
        return { status: "refused", code: "theme-geometry-conflict", diagnostics: [] };
      }
    }
    const metricsOf = (chain: any[]): string => {
      const ids = [...new Set(chain.map((t: any) => t.metricsResource))].sort(compareText);
      return digestOf(ids.map(id => {
        const bytes = ctx.metricBytes.get(id);
        if (!bytes) failContract("render-stale");
        return { id, sha256: sha256(bytes as Uint8Array) };
      }));
    };
    if (metricsOf(fromChain) !== metricsOf(toChain)) {
      return { status: "refused", code: "theme-geometry-conflict", diagnostics: [] };
    }
    return { status: "ok", payload: { relayoutRequired: false }, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedSeam(code);
  }
}

// The published per-adapter manifest: the finite per-code table each export
// adapter publishes before lot 4 maps its legacy diagnostics through. The
// fallback inventories and the provenance strings are injected profile data,
// never source literals: the caller passes the sealed per-adapter code lists
// and provenance record it publishes.
export function adapterManifest(injected: {
  readonly fallbackCodes: readonly string[]; readonly workshopCodes: readonly string[];
  readonly provenance: { readonly reviewedAgainst: string; readonly pythonTwinEntry: string };
}): Record<string, unknown> {
  const mapped = (legacyCode: string, code: string, messageKey: string, emitted: boolean): Record<string, unknown> => ({
    legacyCode, code, messageKey, classification: "integrity", severity: "error",
    disposition: "refused", perId: true, emitted,
  });
  const designMapped = [
    mapped("unknown-format", "export-format-unsupported", "export.format-unsupported", false),
    mapped("unsupported-format", "export-format-unsupported", "export.format-unsupported", false),
    mapped("invalid-reference", "reference-dangling", "reference-dangling", false),
    mapped("missing-endpoint", "reference-dangling", "reference-dangling", true),
    mapped("duplicate-id", "id-collision", "id-collision", true),
  ];
  const exportInventory = [...injected.fallbackCodes];
  return {
    format: "legacy-adapter-manifest/1",
    revision: 2,
    reviewedAgainst: injected.provenance.reviewedAgainst,
    closedLossClasses: ["semantic-type", "relation-kind", "navigation", "appearance", "layout", "metadata", "unsupported-feature", "provenance-unavailable"],
    closedFallback: {
      code: "legacy-unmapped", messageKey: "legacy.unmapped", classification: "integrity",
      severity: "error", disposition: "refused", coordinates: "unavailable",
      legacyCode: "exact string code when present, otherwise omitted",
    },
    adapters: [
      {
        id: "js-legacy-export",
        entry: "io export(definitions, format): byte-or-throw legacy export for bpmn, drawio and sparx",
        producerShape: "IoError(code, message, ids)",
        mapped: designMapped, fallbackInventory: exportInventory, notices: [],
        codeless: "closed fallback without legacyCode",
      },
      {
        id: "js-workshop-export",
        entry: "workshop download: initializeCodecs, parseDefinitions, then js-legacy-export; cancellation stays operation-cancelled",
        producerShape: "IoError(code, message, ids)",
        mapped: designMapped,
        fallbackInventory: [...injected.workshopCodes],
        notices: [], codeless: "closed fallback without legacyCode",
      },
      {
        id: "assistant-ui-export",
        entry: "no legacy export entry point at block A head (render only)",
        producerShape: "none", mapped: [], fallbackInventory: [], notices: [],
        codeless: "closed fallback without legacyCode",
      },
      {
        id: "python-twin-legacy-export",
        entry: injected.provenance.pythonTwinEntry,
        producerShape: "none", mapped: [], fallbackInventory: [], notices: [],
        codeless: "closed fallback without legacyCode",
      },
    ],
  };
}

const unavailable = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };

// mapLegacyDiagnostics: a legacy adapter outcome to Report/2 entries.
export function mapLegacyDiagnostics(input: {
  readonly adapterId: string; readonly legacy: any;
  readonly sourceIndex: Record<string, string>; readonly manifest: Record<string, any>;
}): PureResult<readonly Record<string, unknown>[]> {
  try {
    const manifest = input.manifest as any;
    const closed = manifest.closedLossClasses as string[];
    const adapter = (manifest.adapters as any[]).find(a => a.id === input.adapterId);
    const legacy = input.legacy;
    const entries: Record<string, unknown>[] = [];
    const fallback = (legacyCode: string | undefined, source: unknown): Record<string, unknown> => ({
      code: "legacy-unmapped", severity: "error", classification: "integrity", stage: "export",
      ruleId: "adapter", messageKey: "legacy.unmapped", disposition: "refused",
      source, result: unavailable, beforePresent: false, afterPresent: false,
      ...(legacyCode === undefined ? {} : { legacyCode }),
    });
    if (legacy?.kind === "FidelityNotice" && typeof legacy.code === "string") {
      const notice = adapter?.notices?.find((n: any) => n.legacyCode === legacy.code);
      if (notice && closed.includes(notice.lossClass)) {
        entries.push({
          code: `export-loss/${notice.lossClass}`, severity: "warn", classification: "loss", stage: "export",
          ruleId: "adapter", messageKey: `export.loss.${notice.lossClass}`, disposition: "mapped",
          source: unavailable, result: unavailable, beforePresent: false, afterPresent: false,
          legacyCode: legacy.code, lossClass: notice.lossClass,
        });
      } else {
        entries.push(fallback(legacy.code, unavailable));
      }
    } else if (legacy?.kind === "IoError" && typeof legacy.code === "string") {
      const mapping = adapter?.mapped?.find((m: any) => m.legacyCode === legacy.code);
      if (mapping) {
        const ids = ((legacy.ids ?? []) as unknown[]).filter(id => typeof id === "string" && id !== "");
        if (!ids.length) {
          entries.push({
            code: mapping.code, severity: "error", classification: "integrity", stage: "export",
            ruleId: "adapter", messageKey: mapping.messageKey, disposition: "refused",
            source: unavailable, result: unavailable, beforePresent: false, afterPresent: false,
            legacyCode: legacy.code,
          });
        } else {
          for (const id of ids as string[]) {
            const pointer = input.sourceIndex[id] ?? null;
            entries.push({
              code: mapping.code, severity: "error", classification: "integrity", stage: "export",
              ruleId: "adapter", messageKey: mapping.messageKey, disposition: "refused",
              source: { domain: "tree", pointer, targetId: id, provenance: pointer === null ? "unavailable" : "exact" },
              result: unavailable, beforePresent: false, afterPresent: false,
              legacyCode: legacy.code,
            });
          }
        }
      } else {
        const ids = ((legacy.ids ?? []) as unknown[]).filter(id => typeof id === "string" && id !== "");
        entries.push(fallback(legacy.code, ids.length
          ? { domain: "tree", pointer: null, targetId: ids[0], provenance: "unavailable" }
          : unavailable));
      }
    } else {
      entries.push(fallback(undefined, unavailable));
    }
    // Full Report/2 within-stage order (ruleId, source domain/pointer,
    // targetId, code, pageId, occurrenceKey, canonical before/after):
    // entries sharing one source pointer still sort deterministically.
    return { status: "ok", payload: sortReportEntries(entries), diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedSeam(code);
  }
}
