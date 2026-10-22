import type { CompiledProfile } from "./public-compiler.js";
import { compiledState } from "./public-compiler.js";
import type { DescriptorContext } from "./descriptor-context.js";
import { requireSingleContext } from "./descriptor-context.js";
import { canonicalDigest, rawDigest } from "./canonical.js";
import { validateNativeReferences } from "./native-contracts.js";
import { validateSnapshot } from "./presentation-contracts.js";
import type { Snapshot, SnapshotContext } from "./presentation-contracts.js";
import type { PureResult } from "./results.js";
import { Lot5Canvas } from "./lot5-canvas.js";
import type { Lot5SnapshotInput } from "./lot5-canvas.js";
import { attachNativeProfileUi } from "./lot5-ui.js";
import type { NativeUiOptions } from "./lot5-ui.js";
import { refusedResult, type Rec } from "./lot5-support.js";
import type { UnicodeCaseTable } from "./unicode-case.js";

export interface NativeProfileCanvasOptions extends NativeUiOptions {
  readonly compiled: CompiledProfile;
  readonly descriptorContext: DescriptorContext;
  readonly metricBytes: ReadonlyMap<string, Uint8Array>;
  readonly unicodeCase?: UnicodeCaseTable;
  readonly readOnly?: boolean;
  readonly snapshot?: Snapshot;
}

export interface NativeProfileCanvasHandle {
  getDefinitions(): Rec;
  getSnapshot(): Rec;
  setDefinitions(envelope: Rec): Promise<Rec>;
  restoreSnapshot(snapshot: Snapshot): Promise<Rec>;
  applyCommands(request: Parameters<Lot5Canvas["applyCommands"]>[0]): Promise<Rec>;
  undo(request: Parameters<Lot5Canvas["restore"]>[1]): Promise<Rec>;
  redo(request: Parameters<Lot5Canvas["restore"]>[1]): Promise<Rec>;
  setTheme(themeId: string): Promise<Rec>;
  listEntries(query: Parameters<Lot5Canvas["listEntries"]>[0]): Rec;
  listFields(query: Parameters<Lot5Canvas["listFields"]>[0]): Rec;
  checkField(query: Parameters<Lot5Canvas["checkField"]>[0]): Rec;
  queryReferences(query: Omit<Parameters<Lot5Canvas["queryReferences"]>[0], "field"> & { fieldId: string }): Rec;
  copy(query: Parameters<Lot5Canvas["copy"]>[0]): Rec;
  navigationIndex(): Rec;
  navigate(query: Parameters<Lot5Canvas["navigate"]>[0]): Rec;
  onChange(listener: (event: Rec) => void): Rec;
  unsubscribe(id: string): Rec;
  performGesture(gesture: Rec): Promise<Rec>;
  export(request: Parameters<Lot5Canvas["workshopExport"]>[0]): Promise<Rec>;
  dispose(): Promise<Rec>;
}

/** Native editing is opt-in and carries one verified descriptor context.
 * The legacy XML constructor remains the existing compatibility entry point. */
export async function createNativeProfileCanvas(host: HTMLElement, options: NativeProfileCanvasOptions): Promise<PureResult<NativeProfileCanvasHandle>> {
  try {
    requireSingleContext(options.descriptorContext, options.descriptorContext);
    const state = compiledState(options.compiled);
    if (canonicalDigest(options.compiled.identity.descriptors) !== canonicalDigest(options.descriptorContext.packages)) {
      return { status: "refused", code: "descriptor-mismatch", diagnostics: [] };
    }
    const profile = state.validated.profile as unknown as Rec;
    const metrics = (profile.resources as Rec[]).filter(r => r.kind === "metrics");
    for (const resource of metrics) {
      const bytes = options.metricBytes.get(resource.id as string);
      if (!bytes || rawDigest(bytes) !== resource.sha256) return { status: "refused", code: "profile-resource-digest-mismatch", diagnostics: [] };
    }
    const metric = metrics[0];
    const session = new Lot5Canvas({ compiled: options.compiled, profileDocument: profile,
      descriptorTypes: state.registry.descriptors, metricsId: metric?.id as string ?? "", metricsSha256: metric?.sha256 as string ?? "",
      metricsPins: metrics.map(resource => ({ id: resource.id as string, sha256: resource.sha256 as string })),
      metricBytes: new Map(options.metricBytes), unicodeCase: options.unicodeCase, readOnly: options.readOnly ?? false });
    session.setDescriptorPins(options.compiled.identity.descriptors as unknown as Rec[]);
    const checkedSnapshot = async (value: Snapshot): Promise<Snapshot> => validateSnapshot(value, {
      profile: state.validated.profile, envelope: value.envelope, hostProfileIdentity: options.compiled.identity,
      metricPins: metrics.map(r => ({ id: r.id as string, sha256: r.sha256 as string })),
      validateEnvelope: async envelope => {
        const given = envelope as Snapshot["envelope"];
        validateNativeReferences(given.tree, options.descriptorContext.descriptors, state.idRefScalars);
        return given;
      },
      validateDi: diagrams => {
        if (!diagrams.length) return true;
        try { validateNativeReferences({ ...value.envelope.tree, diagrams }, options.descriptorContext.descriptors, state.idRefScalars); return true; } catch { return false; }
      },
    } satisfies SnapshotContext);
    if (options.snapshot) session.loadSnapshot(await checkedSnapshot(options.snapshot) as unknown as Lot5SnapshotInput);
    const ui = attachNativeProfileUi(host, session, options);
    const handle: NativeProfileCanvasHandle = {
      getDefinitions: () => session.getDefinitions(), getSnapshot: () => session.getSnapshot().result,
      async setDefinitions(envelope) { const result = session.setDefinitions({ envelope }); ui.render(); return result; },
      async restoreSnapshot(snapshot) {
        try { const result = session.restoreSnapshot(await checkedSnapshot(snapshot) as unknown as Lot5SnapshotInput).result; ui.render(); return result; }
        catch (error) { return refusedResult("restoreSnapshot", (error as { code?: string }).code ?? "snapshot-schema", { identity: options.compiled.identity }); }
      },
      async applyCommands(request) { const result = (await session.applyCommands(request)).result; ui.render(); return result; },
      async undo(request) { const result = session.restore("undo", request).result; ui.render(); return result; },
      async redo(request) { const result = session.restore("redo", request).result; ui.render(); return result; },
      async setTheme(themeId) { const result = session.setTheme(themeId).result; ui.render(); return result; },
      listEntries: query => session.listEntries(query), listFields: query => session.listFields(query),
      checkField: query => session.checkField(query), queryReferences: query => session.queryReferences({ ...query, field: query.fieldId }),
      copy: query => session.copy(query), navigationIndex: () => session.navigationIndex(),
      navigate(query) { const result = session.navigate(query).result; ui.render(); return result; },
      onChange: listener => session.onChange(listener), unsubscribe: id => session.unsubscribe(id),
      performGesture: gesture => ui.perform(gesture),
      async export(request) {
        const before = session.getSnapshot().result;
        if (before.status !== "ok") return { result: before, events: [] };
        const result = await session.workshopExport(request);
        const after = session.getSnapshot().result;
        if (after.status !== "ok" || (after.payload as Rec).viewRevision !== (before.payload as Rec).viewRevision) {
          return { download: { prepared: refusedResult("prepareExport", after.status !== "ok" ? "canvas-disposed" : "render-stale",
            { base: (before.payload as Rec).envelope ? ((before.payload as Rec).envelope as Rec).semanticRevision as string : "", identity: options.compiled.identity }),
            callbacks: [], diagnosticsShown: true }, events: [] };
        }
        for (const context of (result.download?.callbacks ?? []) as Rec[]) options.onDownload?.(context);
        return result;
      },
      async dispose() { ui.dispose(); return session.dispose(); },
    };
    return { status: "ok", payload: handle, diagnostics: [] };
  } catch (error) {
    return { status: "refused", code: (error as { code?: string }).code ?? "operation-error", diagnostics: [] } as PureResult<NativeProfileCanvasHandle>;
  }
}
