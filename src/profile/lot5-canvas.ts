/** Lot-5 UI canvas: the headless command/session layer over the block-A profile
 * mechanism (DESIGN §8.1–§8.3, §14.2 row 5). One canvas owns one document:
 * snapshot state, presentation layout, exactly-one-entry history, change events,
 * gesture translation, read queries, navigation, static viewing and workshop
 * export. Browser-safe: no Node builtins. */
import type { NativeNode } from "./native-contracts.js";
import { validateBindingKeys, validateNativeReferences } from "./native-contracts.js";
import { compiledState } from "./public-compiler.js";
import { ProfileContractError, canonicalize } from "./canonical.js";
import { profileIdentity } from "./envelope.js";
import { runLayout } from "./lot4-layout.js";
import { resolveTheme } from "./lot4-render.js";
import { ratFromNumber, ratRoundEvenTicks } from "./lot4-query.js";
import { mapExport, serializePrepared } from "./lot4-export.js";
import { sortReportEntries } from "./lot4-result.js";
import { previewNativeJson } from "./native-bridge.js";
import { normalize } from "./normalize.js";
import { sha256 as sha256Bytes } from "./sha256.js";
import {
  TreeIndex, clone, H, stableId, reportFor, okResult, refusedResult, pureOk, pureRefused,
  digestsOf, viewRevisionOf, overridesDigestOf, diStylesDigestOf, EMPTY_OVERRIDES, EMPTY_STYLES, sortGeometry, removeOccurrences,
  pairKey, asRecord, asArray, revisionOf, type Rec, type PresentationDigests,
} from "./lot5-support.js";
import {
  viewOf, subjectScope, handleOf, evalPredicate, evalValue, holdsResult, recipeWhenResult,
  type Lot5ProfileView,
} from "./lot5-eval.js";
import { executeTransaction, copyFragment } from "./lot5-commands.js";
import {
  listEntries, listFields, checkField, queryReferences, localizeQuery, copyQuery,
  upstreamFilter, navigationIndex, navigateCall,
  type NavigationPage,
} from "./lot5-queries.js";

export interface Lot5Layout extends Rec { layoutVersion: string; pages: Rec[]; geometry: Rec[] }
export interface Lot5Presentation extends Rec {
  layout: Lot5Layout; themeId: string; overrides: Rec; diStyles: Rec;
  importedDi: Rec; selection: Rec[]; activePageId: string;
}
export interface Lot5SnapshotInput { envelope: Rec; presentation: Lot5Presentation; viewRevision: string }
export interface Lot5StoredState { envelope: Rec; presentation: Lot5Presentation; viewRevision: string }

export interface Lot5CanvasOptions {
  compiled: object;
  profileDocument: Rec;
  descriptorTypes: Rec;
  metricsId: string;
  metricsSha256: string;
  /** Every metrics resource pin; defaults to the single metricsId/metricsSha256
   * pair. The digest sorts all pins by id (DESIGN §9.2). */
  metricsPins?: { id: string; sha256: string }[];
  unicodeCase?: import("./unicode-case.js").UnicodeCaseTable | undefined;
  readOnly?: boolean;
  metricBytes?: Map<string, Uint8Array>;
  /** A canvas has a configured profile before load; a headless bridge
   * acquires the active identity only when it loads and activates a document. */
  activationMode?: "configured" | "explicit";
}

const EMPTY_LAYOUT: Lot5Layout = { layoutVersion: "1", pages: [], geometry: [] };

const pagesOf = (presentation: Lot5Presentation): NavigationPage[] =>
  (presentation.layout.pages as Rec[]).map(p => ({ pageId: p.pageId as string, order: p.order as number,
    diagramId: p.pageId as string, semanticRootId: p.semanticRootId as string, name: p.name as string }));

export class Lot5Canvas {
  private view: Lot5ProfileView;
  private compiled: object;
  private identity: Rec;
  private digests: PresentationDigests;
  private readonly metricPins: { id: string; sha256: string }[];
  private readonly readOnly: boolean;
  private readonly unicodeCase: import("./unicode-case.js").UnicodeCaseTable | undefined;
  private readonly metricBytes: Map<string, Uint8Array>;
  private readonly activationMode: "configured" | "explicit";
  private loaded = false;
  private disposed = false;
  private state: Lot5StoredState | null = null;
  private history: { before: Lot5StoredState; after: Lot5StoredState; transactionId: string | null }[] = [];
  private cursor = -1;
  private epoch = 0;
  private subscribers = new Map<string, Rec[]>();
  private subscriptionCount = 0;
  private descriptorPins: Rec[] = [];
  private guard: "idle" | "staging" | "applying" | "restoring" = "idle";
  private listeners = new Map<string, (event: Rec) => void>();
  private gesturePlacement: { transactionId: unknown; pageId: string; point: Rec } | undefined;
  private testHook: ((phase: "staging" | "applying") => void | Promise<void>) | null = null;

  constructor(options: Lot5CanvasOptions) {
    const trusted = compiledState(options.compiled as never);
    this.compiled = options.compiled;
    this.view = viewOf(trusted.validated.profile as unknown as Rec, options.compiled as never, trusted.registry.descriptors as Rec, options.unicodeCase);
    this.identity = clone(((options.compiled as unknown as { identity: Rec }).identity ?? {}));
    this.metricPins = [...(options.metricsPins ?? [{ id: options.metricsId, sha256: options.metricsSha256 }])];
    this.digests = digestsOf(options.profileDocument, this.metricPins);
    this.readOnly = options.readOnly ?? false;
    this.unicodeCase = options.unicodeCase;
    this.metricBytes = new Map(options.metricBytes ?? []);
    this.activationMode = options.activationMode ?? "configured";
  }

  get profileView(): Lot5ProfileView {
    return this.view;
  }

  get profileIdentity(): Rec {
    return clone(this.identity);
  }

  /** Test-only transaction-phase hook (README "Transaction-phase hook"): staging
   * after the entry checks and the guard change to staging, before C; applying
   * after C, pre-N, N and post-N and the guard change to applying, before any
   * state, history or event mutation. Reachable only through direct canvas
   * construction in tests; never via the public factory, its options or the
   * package exports. */
  setTestTransactionHook(hook: ((phase: "staging" | "applying") => void | Promise<void>) | null): void {
    this.testHook = hook;
  }

  get currentRevision(): string {
    return this.state ? (this.state.envelope.semanticRevision as string) : "";
  }

  stateViewRevision(): string {
    return this.state ? this.state.viewRevision : "";
  }

  /** Test-only history counts for the transaction-script adapter (past = committed
   * entries at or below the cursor, future = entries above it). Reachable only
   * through direct canvas construction in tests. */
  testHistoryCounts(): { past: number; future: number } {
    return { past: this.cursor + 1, future: this.history.length - (this.cursor + 1) };
  }

  // ------------------------------------------------------------ state helpers
  private snapshotPayload(): Rec {
    const state = this.state!;
    return { snapshotVersion: "1", envelope: clone(state.envelope),
      presentation: clone(state.presentation), viewRevision: state.viewRevision };
  }

  private snapshotResult(): Rec {
    const revision = this.currentRevision;
    const rep = reportFor("getSnapshot", { identity: this.identity, input: revision, output: revision });
    return okResult("getSnapshot", revision, revision, this.snapshotPayload(), rep, this.identity);
  }

  private pushEvent(event: Rec): void {
    const previousGuard = this.guard;
    if (this.guard === "idle") this.guard = event.origin === "undo" || event.origin === "redo" ? "restoring" : "applying";
    try {
    for (const queue of this.subscribers.values()) queue.push(clone(event));
    for (const listener of [...this.listeners.values()]) {
      try { listener(clone(event)); } catch { /* A host callback cannot undo a committed transaction. */ }
    }
    } finally { this.guard = previousGuard; }
  }

  private computeView(envelope: Rec, layout: Lot5Layout, themeId: string,
    presentation: { overrides: Rec; diStyles: Rec }): string {
    const digests: PresentationDigests = { ...this.digests,
      overridesDigest: overridesDigestOf(presentation.overrides),
      diStylesDigest: diStylesDigestOf(presentation.diStyles) };
    return viewRevisionOf(envelope.semanticRevision as string, layout, themeId, digests);
  }

  private checkUsable(operation: string): Rec | null {
    const options = this.activationMode === "configured" ? { identity: this.identity } : {};
    if (this.disposed) return refusedResult(operation, "canvas-disposed", options);
    if (!this.loaded || !this.state) return refusedResult(operation, "document-not-loaded", options);
    return null;
  }

  /** Strict document admission at load (harmonization C1 step 4): document
   * version, exact envelope shape, descriptor member and containment-slot
   * admission, reference integrity and binding endpoint existence. Returns the
   * refusal code, or null when the envelope may proceed to digest checks. */
  private admitLoadedEnvelope(envelope: Rec): string | null {
    if (envelope.documentVersion !== "1") return "document-version-unsupported";
    for (const key of Object.keys(envelope)) {
      if (!["documentVersion", "profileIdentity", "tree", "bindings", "semanticRevision"].includes(key)) return "profile-schema";
    }
    const treeRecord = asRecord(envelope.tree);
    if (!asRecord(envelope.profileIdentity) || !treeRecord || typeof treeRecord.$type !== "string"
      || typeof envelope.semanticRevision !== "string") return "profile-schema";
    if (envelope.bindings !== undefined && !Array.isArray(envelope.bindings)) return "profile-schema";
    try {
      const state = compiledState(this.compiled as never);
      const descriptors = this.view.descriptors;
      const index = validateNativeReferences(envelope.tree as unknown as NativeNode,
        descriptors, (state as unknown as { idRefScalars: readonly string[] }).idRefScalars ?? []);
      for (const entry of index.entries) {
        if (entry.property === undefined || entry.parent === undefined) continue;
        const slot = descriptors[entry.parent.$type]?.containment[entry.property];
        if (!slot || !slot.includes(entry.node.$type)) return "profile-type";
      }
      const bindings = ((envelope.bindings ?? []) as { ownerId: string; role: string; targetId: string }[]);
      validateBindingKeys(bindings as never);
      for (const binding of bindings) {
        if (!index.byId.has(binding.ownerId) || !index.byId.has(binding.targetId)) return "support-binding-conflict";
      }
    } catch (error) {
      return (error as { code?: string }).code ?? "profile-schema";
    }
    return null;
  }

  // ------------------------------------------------------------ lifecycle
  setDefinitions(input: { xml?: string; envelope?: Rec; mode?: string; importedDi?: Rec }): Rec {
    if (this.disposed) return refusedResult("setDefinitions", "canvas-disposed", this.activationMode === "configured" ? { identity: this.identity } : {});
    if (this.guard !== "idle") return refusedResult("setDefinitions", "transaction-reentrant", { base: this.currentRevision, identity: this.identity });
    if ((input.xml !== undefined && input.envelope !== undefined)
      || (input.xml === undefined && input.envelope === undefined)) {
      return refusedResult("setDefinitions", "input-conflict", { identity: this.identity });
    }
    if (input.xml !== undefined) return refusedResult("setDefinitions", "operation-error", { identity: this.identity });
    const envelope = clone(input.envelope) as Rec;
    const admission = this.admitLoadedEnvelope(envelope);
    if (admission) {
      return refusedResult("setDefinitions", admission,
        { base: envelope.semanticRevision as string, identity: envelope.profileIdentity as Rec });
    }
    if (H(envelope.profileIdentity) !== H(this.identity)) {
      return refusedResult("setDefinitions", "profile-digest-mismatch",
        { base: envelope.semanticRevision as string, identity: envelope.profileIdentity as Rec });
    }
    const revision = revisionOf(envelope.tree as unknown as NativeNode,
      envelope.profileIdentity as never, (envelope.bindings ?? []) as never);
    if (revision !== envelope.semanticRevision) {
      return refusedResult("setDefinitions", "profile-schema",
        { base: envelope.semanticRevision as string, identity: envelope.profileIdentity as Rec });
    }
    this.loaded = true;
    this.history = [];
    this.cursor = -1;
    const presentation: Lot5Presentation = {
      layout: clone(EMPTY_LAYOUT),
      themeId: this.view.themes[0]?.id as string ?? "",
      overrides: clone(EMPTY_OVERRIDES),
      diStyles: clone(EMPTY_STYLES),
      importedDi: input.importedDi ? clone(input.importedDi) : (() => {
        const descriptorDigest = H(this.identity.descriptors);
        return { descriptorDigest, diagrams: [], sha256: H({ descriptorDigest, diagrams: [] }) };
      })(),
      selection: [],
      activePageId: "",
    };
    this.state = { envelope, presentation, viewRevision: this.computeView(envelope, presentation.layout, presentation.themeId, presentation) };
    const report = reportFor("setDefinitions", { identity: this.identity, input: revision, output: revision });
    const result = okResult("setDefinitions", revision, revision,
      { envelope: clone(envelope), semanticRevision: revision, viewRevision: this.state.viewRevision }, report, this.identity);
    this.pushEvent({
      envelope: clone(this.state.envelope),
      semanticRevision: revision,
      viewRevision: this.state.viewRevision,
      transactionId: null,
      origin: "load",
      report: clone(report),
    });
    return result;
  }

  getDefinitions(): Rec {
    const blocked = this.checkUsable("getDefinitions");
    if (blocked) return blocked;
    const revision = this.currentRevision;
    const report = reportFor("getDefinitions", { identity: this.identity, input: revision, output: revision });
    return okResult("getDefinitions", revision, revision,
      clone(this.state!.envelope), report, this.identity);
  }

  /** Adopt the supplied compiled profile and profile state (DESIGN §8.1):
   * both inputs are validated with their own code, the descriptor context
   * still has to match, and adoption is an atomic, coherent
   * envelope/profile/revision transition: the loaded envelope is re-bound to
   * the offered identity with its revision recomputed, history is cleared
   * and a new history epoch starts. An identity change that needs a
   * migration (DESIGN §3.3) succeeds only after an actually validated and
   * executed migration; a supplied plan alone is intent, never evidence, and
   * never counts. Activation never silently migrates. */
  activateBusinessProfile(compiled: object, profileDocument: Rec, descriptorPins: Rec[], explicitMigrationPlan?: unknown): Rec {
    const blocked = this.checkUsable("activateBusinessProfile");
    if (blocked) return blocked;
    if (this.guard !== "idle") return refusedResult("activateBusinessProfile", "transaction-reentrant", { base: this.currentRevision, identity: this.identity });
    const revision = this.currentRevision;
    try {
      compiledState(compiled as never);
    } catch (error) {
      return refusedResult("activateBusinessProfile",
        error instanceof ProfileContractError ? (error.code ?? "operation-error") : "operation-error",
        { base: revision, identity: this.identity });
    }
    let offered: Rec;
    try {
      offered = profileIdentity(profileDocument as never) as unknown as Rec;
    } catch (error) {
      return refusedResult("activateBusinessProfile",
        error instanceof ProfileContractError ? (error.code ?? "operation-error") : "operation-error",
        { base: revision, identity: this.identity });
    }
    const pins = (this.descriptorPins as Rec[]).map(p => ({ id: p.id, version: p.version, sha256: p.sha256 }));
    const offeredPins = (descriptorPins as Rec[]).map(p => ({ id: p.id, version: p.version, sha256: p.sha256 }));
    if (H(pins) !== H(offeredPins)) {
      return refusedResult("activateBusinessProfile", "descriptor-mismatch", { base: revision, identity: this.identity });
    }
    if (H(offered) !== H((compiled as unknown as { identity: Rec }).identity)) {
      return refusedResult("activateBusinessProfile", "profile-digest-mismatch", { base: revision, identity: this.identity });
    }
    if (this.state) {
      const current = this.state.envelope.profileIdentity as Rec;
      if (H(current) !== H(offered)) {
        const gate = activationGate(current, offered);
        // DESIGN §3.3: the gate code refuses even when an explicit migration
        // plan is supplied. Selecting a migration is intent, never evidence
        // that a migration was validated and executed (source validated with
        // its source profile, copy transformed with approved recipes, target
        // validated, losses/ID map emitted, target identity committed once),
        // so a token, flag or argument alone — including false — never counts.
        // A same-version digest conflict is never waivable by a plan.
        void explicitMigrationPlan;
        if (gate !== null) {
          return refusedResult("activateBusinessProfile", gate, { base: revision, identity: this.identity });
        }
      }
    }
    this.compiled = compiled;
    this.view = viewOf(clone(profileDocument), compiled as never, this.view.descriptorTypes, this.unicodeCase);
    this.identity = clone(offered);
    this.digests = digestsOf(clone(profileDocument), this.metricPins);
    this.epoch += 1;
    this.history = [];
    this.cursor = -1;
    if (this.state) {
      const presentation = clone(this.state.presentation);
      const envelope: Rec = { ...(clone(this.state.envelope) as Rec), profileIdentity: clone(offered) };
      envelope.semanticRevision = revisionOf(envelope.tree as unknown as NativeNode,
        offered as never, (envelope.bindings ?? []) as never);
      const viewRevision = this.computeView(envelope, presentation.layout,
        presentation.themeId as string, presentation);
      this.state = { envelope, presentation, viewRevision };
    }
    const output = this.currentRevision;
    const report = reportFor("activateBusinessProfile", { identity: this.identity, input: revision, output });
    return okResult("activateBusinessProfile", revision, output,
      { envelope: clone(this.state!.envelope), semanticRevision: output,
        viewRevision: this.state!.viewRevision, historyEpoch: String(this.epoch) }, report, this.identity);
  }

  setDescriptorPins(pins: Rec[]): void {
    this.descriptorPins = clone(pins);
  }

  onChange(name: string | ((event: Rec) => void)): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    this.subscriptionCount += 1;
    const id = typeof name === "string" ? name : `listener-${this.subscriptionCount}`;
    if (typeof name === "function") this.listeners.set(id, name);
    else this.subscribers.set(id, []);
    return pureOk({ subscriptionId: id });
  }

  unsubscribe(id: string): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    this.listeners.delete(id);
    this.subscribers.delete(id);
    return pureOk({ unsubscribed: true });
  }

  readEvents(name: string): Rec[] {
    const queue = this.subscribers.get(name) ?? [];
    this.subscribers.set(name, []);
    return queue.map(e => clone(e));
  }

  dispose(): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    this.disposed = true;
    this.subscribers.clear();
    this.listeners.clear();
    return pureOk({ disposed: true });
  }

  // ------------------------------------------------------------ snapshots
  loadSnapshot(snapshot: Lot5SnapshotInput): void {
    this.loaded = true;
    this.history = [];
    this.cursor = -1;
    this.state = { envelope: clone(snapshot.envelope), presentation: clone(snapshot.presentation), viewRevision: snapshot.viewRevision };
  }

  restoreSnapshot(snapshot: Lot5SnapshotInput): { result: Rec; events: Rec[] } {
    if (this.disposed) return { result: refusedResult("restoreSnapshot", "canvas-disposed"), events: [] };
    if (this.guard !== "idle") return { result: refusedResult("restoreSnapshot", "transaction-reentrant", { base: this.currentRevision, identity: this.identity }), events: [] };
    this.epoch += 1;
    this.loaded = true;
    this.history = [];
    this.cursor = -1;
    this.state = { envelope: clone(snapshot.envelope), presentation: clone(snapshot.presentation), viewRevision: snapshot.viewRevision };
    const revision = this.currentRevision;
    const report = reportFor("restoreSnapshot", { identity: this.identity, input: revision, output: revision });
    const result = okResult("restoreSnapshot", revision, revision,
      { envelope: clone(snapshot.envelope), semanticRevision: revision,
        viewRevision: snapshot.viewRevision, historyEpoch: String(this.epoch) }, report, this.identity);
    const event: Rec = {
      envelope: clone(this.state.envelope),
      semanticRevision: revision,
      viewRevision: snapshot.viewRevision,
      transactionId: "",
      origin: "snapshot",
      report: clone(report),
    };
    this.pushEvent(event);
    return { result, events: [event] };
  }

  getSnapshot(): { result: Rec; events: Rec[] } {
    const blocked = this.checkUsable("getSnapshot");
    if (blocked) return { result: blocked, events: [] };
    return { result: this.snapshotResult(), events: [] };
  }

  // ------------------------------------------------------------ applyCommands
  async applyCommands(request: { baseRevision?: string; expectedViewRevision?: string; transactionId?: string | null;
    commands?: Rec[]; signal?: { aborted: boolean }; placementIntent?: Rec[] }): Promise<{ result: Rec; events: Rec[] }> {
    const operation = "applyCommands";
    const unusable = this.checkUsable(operation);
    if (unusable) return { result: unusable, events: [] };
    const revision = this.currentRevision;
    if (this.readOnly) return { result: refusedResult(operation, "operation-error", { base: revision, identity: this.identity }), events: [] };
    if (request.signal?.aborted) {
      return { result: refusedResult(operation, "operation-cancelled", { base: revision, identity: this.identity }), events: [] };
    }
    if (request.baseRevision !== revision || request.expectedViewRevision !== this.state!.viewRevision) {
      return { result: refusedResult(operation, "operation-error", { base: revision, identity: this.identity }), events: [] };
    }
    if (this.guard !== "idle") return { result: refusedResult(operation, "transaction-reentrant", { base: revision, identity: this.identity }), events: [] };
    const commands = request.commands ?? [];
    const transactionId = request.transactionId ?? null;
    const placement = this.gesturePlacement?.transactionId === transactionId ? this.gesturePlacement : undefined;
    this.gesturePlacement = undefined;
    if (commands.length === 0) {
      const report = reportFor(operation, { identity: this.identity, input: revision, output: revision });
      const result = okResult(operation, revision, revision,
        { envelope: clone(this.state!.envelope), semanticRevision: revision,
          viewRevision: this.state!.viewRevision, transactionId, changed: false }, report, this.identity);
      return { result, events: [] };
    }
    const tree = this.state!.envelope.tree as unknown as NativeNode;
    const bindings = (this.state!.envelope.bindings ?? []) as { ownerId: string; role: string; targetId: string }[];
    this.guard = "staging";
    try {
      if (this.testHook) {
        try {
          await this.testHook("staging");
        } catch {
          return { result: refusedResult(operation, "operation-error", { base: revision, identity: this.identity, entries: [] }), events: [] };
        }
      }
      if (this.disposed) return { result: refusedResult(operation, "canvas-disposed", this.activationMode === "configured" ? { identity: this.identity } : {}), events: [] };
      if (request.signal?.aborted) return { result: refusedResult(operation, "operation-cancelled", { base: revision, identity: this.identity }), events: [] };
      const outcome = await executeTransaction(this.view, this.compiled, { tree: clone(tree), bindings: clone(bindings) }, commands, this.identity,
        request.placementIntent);
      if (this.disposed) return { result: refusedResult(operation, "canvas-disposed", this.activationMode === "configured" ? { identity: this.identity } : {}), events: [] };
      if (request.signal?.aborted) return { result: refusedResult(operation, "operation-cancelled", { base: revision, identity: this.identity }), events: [] };
      if ("code" in outcome) return { result: refusedResult(operation, outcome.code, { base: revision, identity: this.identity, entries: outcome.entries }), events: [] };
      this.guard = "applying";
      if (this.testHook) {
        try {
          await this.testHook("applying");
        } catch {
          const lint = (outcome.entries as Rec[]).filter(e => e.stage === "pre-normalize" || e.stage === "post-normalize");
          return { result: refusedResult(operation, "operation-error", { base: revision, identity: this.identity, entries: lint }), events: [] };
        }
      }
      return this.commitOutcome(outcome, { origin: "command", transactionId, gesturePage: placement?.pageId ?? null,
        ...(placement ? { point: placement.point } : {}) });
    } catch (error) {
      const entries = (error as { entries?: Rec[] }).entries ?? [];
      return { result: refusedResult(operation, (error as { code?: string }).code ?? "operation-error", { base: revision, identity: this.identity, entries }), events: [] };
    } finally {
      this.guard = "idle";
    }
  }

  /** Commit a staged transaction: semantic change, presentation-only change, or no-op. */
  private commitOutcome(outcome: { tree: NativeNode; bindings: readonly { ownerId: string; role: string; targetId: string }[];
    completeEntries: readonly Rec[]; idMap: readonly Rec[]; created: readonly string[]; removed: readonly string[]; entries: readonly Rec[] },
    options: { origin: string; transactionId: string | null; gesturePage: string | null; point?: Rec; layoutPatch?: (layout: Lot5Layout) => Lot5Layout },
  ): { result: Rec; events: Rec[] } {
    const operation = "applyCommands";
    const base = this.currentRevision;
    const finalRevision = revisionOf(outcome.tree, this.identity as never, outcome.bindings as never);
    const removedIds = new Set(outcome.removed);
    let layout = clone(this.state!.presentation.layout);
    if (removedIds.size > 0) layout = removeOccurrences(layout, removedIds) as Lot5Layout;
    if (options.layoutPatch) layout = options.layoutPatch(layout);
    if (outcome.created.length > 0) {
      layout = this.placeCreated(layout, outcome, options.gesturePage, options.point);
    }
    const treeChanged = finalRevision !== base;
    const layoutChanged = H(layout) !== H(this.state!.presentation.layout);
    if (!treeChanged && !layoutChanged) {
      const report = reportFor(operation, { identity: this.identity, input: base, output: base, entries: outcome.entries });
      const result = okResult(operation, base, base,
        { envelope: clone(this.state!.envelope), semanticRevision: base,
          viewRevision: this.state!.viewRevision, transactionId: options.transactionId, changed: false }, report, this.identity);
      return { result, events: [] };
    }
    const envelope = { ...(clone(this.state!.envelope) as Rec), tree: clone(outcome.tree),
      bindings: clone(outcome.bindings), semanticRevision: finalRevision };
    const presentation = { ...(clone(this.state!.presentation) as Lot5Presentation), layout };
    presentation.selection = this.nextSelection(presentation);
    const viewRevision = this.computeView(envelope, layout, presentation.themeId, presentation);
    const before = { envelope: clone(this.state!.envelope), presentation: clone(this.state!.presentation), viewRevision: this.state!.viewRevision };
    const after = { envelope, presentation, viewRevision };
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push({ before, after, transactionId: options.transactionId });
    this.cursor = this.history.length - 1;
    this.state = after;
    const report = reportFor(operation, { identity: this.identity, input: base, output: finalRevision,
      entries: outcome.entries, idMap: outcome.idMap });
    const result = okResult(operation, base, finalRevision,
      { envelope: clone(envelope), semanticRevision: finalRevision, viewRevision,
        transactionId: options.transactionId, changed: treeChanged }, report, this.identity);
    const event: Rec = { envelope: clone(envelope), semanticRevision: finalRevision, viewRevision,
      transactionId: options.transactionId, origin: options.origin, report: clone(report) };
    this.pushEvent(event);
    return { result, events: [event] };
  }

  private commitPage(outcome: { created: readonly string[] }, gesturePage: string | null): string | null {
    void outcome;
    if (gesturePage) return gesturePage;
    const active = this.state!.presentation.activePageId;
    const pages = pagesOf(this.state!.presentation);
    if (pages.some(p => p.pageId === active)) return active;
    return pages[0]?.pageId ?? null;
  }

  private placeCreated(layout: Lot5Layout, outcome: { tree: NativeNode; created: readonly string[] }, gesturePage: string | null, point?: Rec): Lot5Layout {
    const pageId = this.commitPage(outcome, gesturePage);
    if (!pageId) return layout;
    const index = new TreeIndex(outcome.tree);
    const geometry = [...(layout.geometry as Rec[])];
    const onPage = new Set(geometry.filter(g => g.pageId === pageId).map(g => g.occurrenceKey as string));
    const bindings = (this.state!.envelope.bindings ?? []) as never;
    const visual = outcome.created.filter(id => {
      const scope = subjectScope(this.view, outcome.tree, index, id, bindings);
      return isEdgeType(index.get(id)!.node.$type) || scope && this.view.notions.some(n => evalPredicate(this.view, n.recognition, scope) && (n.renderBindings as Rec[]).length > 0);
    });
    visual.sort((a, b) => Number(isEdgeType(index.get(a)!.node.$type)) - Number(isEdgeType(index.get(b)!.node.$type)));
    for (const id of visual) {
      const key = `occ:${id}`;
      if (onPage.has(key)) continue;
      onPage.add(key);
      const node = (index.get(id)?.node ?? {}) as unknown as Rec;
      if (isEdgeType((node.$type as string) ?? "")) {
        const ownerId = index.get(id)?.parent?.node.id;
        const sourceId = node.$type === "bpmn:DataOutputAssociation" ? ownerId : Array.isArray(node.sourceRef) ? node.sourceRef[0] : node.sourceRef;
        const targetId = node.$type === "bpmn:DataInputAssociation" ? ownerId : node.targetRef;
        const source = geometry.find(g => g.pageId === pageId && g.semanticId === sourceId);
        const target = geometry.find(g => g.pageId === pageId && g.semanticId === targetId);
        if (!source || !target) continue;
        // Endpoint centres quantize once to integer ticks (ties to even);
        // the edge bounds box the waypoints instead of staying zero.
        const centre = (origin: number, size: number): number =>
          ratRoundEvenTicks(ratFromNumber(origin + size / 2));
        const waypoints = [source, target].map(g => { const b = g.bounds as Rec;
          return { x: centre(Number(b.x), Number(b.width)), y: centre(Number(b.y), Number(b.height)) }; });
        const xs = waypoints.map(p => p.x), ys = waypoints.map(p => p.y);
        geometry.push({ pageId, occurrenceKey: key, role: "content", semanticId: id,
          sourceOccurrence: { pageId, occurrenceKey: source.occurrenceKey },
          targetOccurrence: { pageId, occurrenceKey: target.occurrenceKey },
          waypoints,
          bounds: { x: Math.min(...xs), y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } });
      } else {
        const x = Number.isSafeInteger(point?.x) ? Number(point!.x) - 50000 : 80000 + (geometry.length % 5) * 120000;
        const y = Number.isSafeInteger(point?.y) ? Number(point!.y) - 40000 : 180000 + Math.floor(geometry.length / 5) * 100000;
        geometry.push({ pageId, occurrenceKey: key, role: "content", semanticId: id,
          bounds: { x, y, width: 100000, height: 80000 } });
      }
    }
    return { ...layout, geometry: sortGeometry(layout.pages, geometry as never) as Rec[] };
  }

  /** Selection after a commit: the input selection minus vanished occurrences. */
  private nextSelection(presentation: Lot5Presentation): Rec[] {
    const live = new Set((presentation.layout.geometry as Rec[]).map(g => pairKey(g.pageId as string, g.occurrenceKey as string)));
    return (this.state!.presentation.selection as Rec[]).filter(pair =>
      live.has(pairKey(pair.pageId as string, pair.occurrenceKey as string)));
  }

  // ------------------------------------------------------------ gesture translation (§8.3 L647–648)
  /** Translate a gesture to staged commands or a not-staged outcome. */
  async gesture(gesture: Rec): Promise<{ staged?: Rec; outcome?: Rec; clipboard?: Rec }> {
    const unusable = this.checkUsable("applyCommands");
    if (unusable || this.readOnly) return { outcome: { staged: false, code: unusable?.code ?? "operation-error" } };
    if (gesture.cancel !== undefined) return { outcome: { staged: false, cancelled: true } };
    const kind = gesture.gesture as string;
    if (kind === "palette-drop" && typeof gesture.pageId === "string" && asRecord(gesture.point)) {
      this.gesturePlacement = { transactionId: gesture.transactionId, pageId: gesture.pageId, point: clone(gesture.point as Rec) };
    }
    const tree = this.state!.envelope.tree as unknown as NativeNode;
    const index = new TreeIndex(tree);
    const bindings = (this.state!.envelope.bindings ?? []) as { ownerId: string; role: string; targetId: string }[];
    switch (kind) {
      case "palette-drop": return this.paletteGesture(gesture, index, bindings);
      case "context-pad": return this.contextPadGesture(gesture, index, bindings);
      case "replace-menu": {
        const element = this.gestureElement(gesture);
        if (typeof gesture.entry !== "string" || element === null || typeof gesture.insertionKey !== "string") {
          return { outcome: { staged: false, code: element === null ? "reference-dangling" : "operation-error" } };
        }
        return { staged: this.commandTransaction([{ command: "surface", entry: gesture.entry,
          context: { target: element, key: gesture.insertionKey } }], gesture) };
      }
      case "connect": return this.connectGesture(gesture, index, bindings);
      case "keyboard": return this.keyboardGesture(gesture, index, bindings);
      case "direct-edit": return this.directEditGesture(gesture, index, bindings);
      case "field-submit": {
        const element = this.gestureElement(gesture);
        if (typeof gesture.notion !== "string" || typeof gesture.field !== "string"
          || element === null || gesture.value === undefined) {
          return { outcome: { staged: false, code: "operation-error" } };
        }
        return { staged: this.commandTransaction([{ command: "field", notion: gesture.notion, field: gesture.field,
          context: { target: element, value: clone(gesture.value) } }], gesture) };
      }
      case "drag":
      case "resize":
      case "label-move":
      case "bendpoint": return this.presentationGesture(gesture, index);
      case "bendpoint-add": return this.presentationGesture({ ...gesture, gesture: "bendpoint" }, index);
      case "reconnect": return { outcome: { staged: false, reconnectAllowed: false } };
      case "drag-cancelled": return { outcome: { staged: false, cancelled: true } };
      default: return { outcome: { staged: false, code: "operation-error" } };
    }
  }

  private commandTransaction(commands: Rec[], gesture: Rec): Rec {
    return {
      transactionId: (gesture.transactionId as string | undefined) ?? null,
      commands: clone(commands),
    };
  }

  private paletteGesture(gesture: Rec, index: TreeIndex, bindings: { ownerId: string; role: string; targetId: string }[]):
    { staged?: Rec; outcome?: Rec } {
    const entry = this.view.entryById.get(gesture.entry as string);
    if (!entry || entry.surface !== "palette" || typeof gesture.container !== "string" || typeof gesture.insertionKey !== "string") {
      return { outcome: { staged: false, code: "operation-error" } };
    }
    const owner = gesture.container as string;
    const recipe = this.view.recipeById.get(entry.recipe as string);
    if ((recipe?.steps as Rec[]).some(step => step.op === "create" && step.type === "bpmn:DataInput")
      && (entry.parameters as Rec[]).some(p => p.source === "target")) {
      const sets = inputSetsOf(index, owner);
      if (sets === null) return { outcome: { staged: false, code: "profile-producer" } };
      const choice = asRecord(gesture.choice)?.value;
      if (typeof choice === "string") {
        return { staged: this.commandTransaction([{ command: "surface", entry: entry.id,
          context: { owner, target: choice, key: gesture.insertionKey, value: "" } }], gesture) };
      }
      if (sets.length === 1) {
        return { staged: this.commandTransaction([{ command: "surface", entry: entry.id,
          context: { owner, target: sets[0], key: gesture.insertionKey, value: "" } }], gesture) };
      }
      return { outcome: { staged: false,
        prompt: { kind: "set-selection", entry: entry.id, parameter: "set", source: "target", candidates: sets } } };
    }
    return { staged: this.commandTransaction([{ command: "surface", entry: entry.id,
      context: { owner, key: gesture.insertionKey, value: "" } }], gesture) };
  }

  private contextPadGesture(gesture: Rec, index: TreeIndex, bindings: { ownerId: string; role: string; targetId: string }[]):
    { staged?: Rec; outcome?: Rec } {
    void index;
    void bindings;
    const action = gesture.action as string | undefined;
    const element = this.gestureElement(gesture) ?? undefined;
    if ((action === "delete" || this.view.entryById.get(gesture.entry as string)?.surface === "delete") && typeof element === "string") {
      const entry = typeof gesture.entry === "string" ? gesture.entry : this.entryFor("delete", element);
      if (typeof entry !== "string") return { outcome: { staged: false, code: Lot5Canvas.missingEntryCode(entry) } };
      return { staged: this.commandTransaction([{ command: "surface", entry, context: { target: element } }], gesture) };
    }
    const entry = typeof gesture.entry === "string" ? this.view.entryById.get(gesture.entry) : undefined;
    if (!entry || entry.surface !== "append" || typeof element !== "string" || typeof gesture.insertionKey !== "string") {
      return { outcome: { staged: false, code: "operation-error" } };
    }
    const tree = this.state!.envelope.tree as unknown as NativeNode;
    const owner = containerProcessOf(new TreeIndex(tree), element);
    if (!owner) return { outcome: { staged: false, code: "reference-dangling" } };
    return { staged: this.commandTransaction([{ command: "surface", entry: entry.id,
      context: { owner, source: element, key: gesture.insertionKey, value: "" } }], gesture) };
  }

  private connectGesture(gesture: Rec, index: TreeIndex, bindings: { ownerId: string; role: string; targetId: string }[]):
    { staged?: Rec; outcome?: Rec } {
    const source = this.gestureElement({ occurrence: gesture.source }) ?? undefined;
    const target = this.gestureElement({ occurrence: gesture.target }) ?? undefined;
    if (typeof source !== "string" || typeof target !== "string" || typeof gesture.insertionKey !== "string") {
      return { outcome: { staged: false, code: "operation-error" } };
    }
    const tree = this.state!.envelope.tree as unknown as NativeNode;
    const scope = subjectScope(this.view, tree, index, source, bindings);
    if (!scope) return { outcome: { staged: false, code: "reference-dangling" } };
    const owner = containerProcessOf(index, source) ?? source;
    // Predicate refusals outside notion recognition propagate with the
    // evaluator's original code; only boolean non-matches filter.
    let refusal: string | undefined;
    const candidates = this.view.entries.filter(e => {
      if (e.surface !== "connect") return false;
      const held = holdsResult(this.view, e.when, scope);
      if (typeof held === "string") {
        if (refusal === undefined) refusal = held;
        return false;
      }
      return held;
    });
    const runnable = candidates.filter(e => {
      const recipe = this.view.recipeById.get(e.recipe as string);
      if (!recipe) return false;
      const held = recipeWhenResult(this.view, recipe, tree, index, { source, target }, bindings);
      if (typeof held === "string") {
        if (refusal === undefined) refusal = held;
        return false;
      }
      return held;
    });
    if (refusal !== undefined) return { outcome: { staged: false, code: refusal } };
    if (runnable.length === 0) return { outcome: { staged: false, connectionAllowed: false } };
    const entry = runnable[0]!;
    return { staged: this.commandTransaction([{ command: "surface", entry: entry.id,
      context: { owner, source, target, key: gesture.insertionKey } }], gesture) };
  }

  private keyboardGesture(gesture: Rec, index: TreeIndex, bindings: { ownerId: string; role: string; targetId: string }[]):
    { staged?: Rec; outcome?: Rec; clipboard?: Rec } {
    const key = gesture.key as string;
    if (key === "Delete" || key === "Backspace") {
      const ids = selectedSemanticIds(this.state!.presentation, gesture);
      const resolved = ids.map(id => ({ id, entry: this.entryFor("delete", id) }));
      const missing = resolved.find(r => typeof r.entry !== "string");
      if (missing) return { outcome: { staged: false, code: Lot5Canvas.missingEntryCode(missing.entry) } };
      const commands = resolved.map(r => ({ command: "surface", entry: r.entry as string, context: { target: r.id } }));
      return { staged: this.commandTransaction(commands, gesture) };
    }
    if (key === "Ctrl+V") {
      const fragment = asRecord(gesture.fragment);
      const container = gesture.container as string | undefined;
      if (!fragment || typeof container !== "string" || typeof gesture.insertionKey !== "string") {
        return { outcome: { staged: false, code: "operation-error" } };
      }
      const entry = this.entryFor("paste", container);
      if (typeof entry !== "string") return { outcome: { staged: false, code: Lot5Canvas.missingEntryCode(entry) } };
      return { staged: this.commandTransaction([{ command: "surface", entry,
        context: { owner: container, key: gesture.insertionKey }, fragment: clone(fragment) }], gesture) };
    }
    if (key === "Ctrl+X") {
      const ids = selectedSemanticIds(this.state!.presentation, gesture);
      const tree = this.state!.envelope.tree as unknown as NativeNode;
      const copied = copyFragment(tree, index, ids, this.currentRevision);
      if ("code" in copied) return { outcome: { staged: false, code: copied.code } };
      const resolved = ids.map(id => ({ id, entry: this.entryFor("delete", id) }));
      const missing = resolved.find(r => typeof r.entry !== "string");
      if (missing) return { outcome: { staged: false, code: Lot5Canvas.missingEntryCode(missing.entry) } };
      const commands = resolved.map(r => ({ command: "surface", entry: r.entry as string, context: { target: r.id } }));
      return { clipboard: clone(copied.fragment) as unknown as Rec,
        staged: this.commandTransaction(commands, gesture) };
    }
    void bindings;
    return { outcome: { staged: false, code: "operation-error" } };
  }

  /** Element targeted by a gesture: an ID, or an occurrence resolved to its semantic element. */
  private gestureElement(gesture: Rec): string | null {
    if (typeof gesture.element === "string") return gesture.element;
    if (typeof gesture.target === "string") return gesture.target;
    const occurrence = asRecord(gesture.occurrence);
    if (occurrence && typeof occurrence.occurrenceKey === "string" && typeof occurrence.pageId === "string") {
      const geometry = this.state!.presentation.layout.geometry as Rec[];
      return geometry.find(g => g.pageId === occurrence.pageId && g.occurrenceKey === occurrence.occurrenceKey)?.semanticId as string ?? null;
    }
    if (occurrence && typeof occurrence.semanticId === "string") {
      const geometry = (this.state!.presentation.layout.geometry ?? []) as Rec[];
      const pageId = occurrence.pageId as string | undefined;
      const found = geometry.some(g => g.semanticId === occurrence.semanticId && (pageId === undefined || g.pageId === pageId));
      return found ? (occurrence.semanticId as string) : null;
    }
    return null;
  }

  private directEditGesture(gesture: Rec, index: TreeIndex, bindings: { ownerId: string; role: string; targetId: string }[]):
    { staged?: Rec; outcome?: Rec } {
    const element = this.gestureElement(gesture);
    const value = gesture.text as string | undefined;
    if (element === null || typeof value !== "string") {
      return { outcome: { staged: false, code: "operation-error" } };
    }
    const tree = this.state!.envelope.tree as unknown as NativeNode;
    const scope = subjectScope(this.view, tree, index, element, bindings);
    if (!scope) return { outcome: { staged: false, code: "reference-dangling" } };
    let refusal: string | undefined;
    const candidates = this.view.entries.filter(e => {
      if (e.surface !== "direct-edit") return false;
      const held = holdsResult(this.view, e.when, scope);
      if (typeof held === "string") {
        if (refusal === undefined) refusal = held;
        return false;
      }
      return held;
    });
    const runnable = candidates.filter(e => {
      const recipe = this.view.recipeById.get(e.recipe as string);
      if (!recipe) return false;
      const held = recipeWhenResult(this.view, recipe, tree, index, { self: element, target: element }, bindings);
      if (typeof held === "string") {
        if (refusal === undefined) refusal = held;
        return false;
      }
      return held;
    });
    if (refusal !== undefined) return { outcome: { staged: false, code: refusal } };
    if (runnable.length === 0) return { outcome: { staged: false, code: "profile-producer" } };
    const entry = runnable[0]!;
    return { staged: this.commandTransaction([{ command: "surface", entry: entry.id,
      context: { target: element, value } }], gesture) };
  }

  /** First enabled entry id for a surface/subject: undefined when a successful
   * query lists none, or the query refusal carrier when the listEntries query
   * refuses, so implicit callers propagate the original code (DESIGN :141,
   * :649) instead of substituting a producer denial. */
  private entryFor(surface: string, subject: string): string | undefined | { code: string } {
    const listed = this.listEntries({ baseRevision: this.currentRevision, surface, subject, locale: this.view.fallbackLocale });
    if (listed.status !== "ok") return { code: listed.code as string };
    return ((listed.payload as Rec | undefined)?.groups as Rec[] | undefined)?.flatMap(group => group.entries as Rec[])[0]?.id as string | undefined;
  }

  /** Denial for an unresolved implicit entry: the query refusal code when the
   * lookup refused, otherwise the producer denial for a successful empty
   * query. */
  private static missingEntryCode(entry: string | undefined | { code: string }): string {
    return typeof entry === "object" && entry !== null ? (entry.code as string) : "profile-producer";
  }

  private presentationGesture(gesture: Rec, _index: TreeIndex): { staged?: Rec; outcome?: Rec } {
    const occurrence = asRecord(gesture.occurrence);
    const pageId = (occurrence?.pageId ?? gesture.pageId) as string | undefined;
    if (!occurrence || typeof occurrence.occurrenceKey !== "string" || typeof pageId !== "string") {
      return { outcome: { staged: false, code: "operation-error" } };
    }
    const patch: Rec = { gesture: gesture.gesture, pageId, occurrenceKey: occurrence.occurrenceKey as string };
    if (gesture.delta !== undefined) patch.delta = clone(gesture.delta);
    if (gesture.point !== undefined) patch.point = clone(gesture.point);
    if (gesture.edge !== undefined) patch.edge = gesture.edge;
    return { staged: {
      baseRevision: this.currentRevision,
      expectedViewRevision: this.state!.viewRevision,
      transactionId: (gesture.transactionId as string | undefined) ?? null,
      presentation: patch,
    } };
  }

  // ------------------------------------------------------------ presentation commit (DI-only)
  // A drag/resize/label move is never a bare DI patch: the owner requires
  // correction after a drag, so the patched stage runs C, pre-N checks, N
  // with the placement intent of the moved occurrence and a post-N postcheck
  // before one reversible entry is committed (DESIGN L554, L631, L937).
  async commitPresentation(staged: Rec): Promise<{ result: Rec; events: Rec[] }> {
    const operation = "applyCommands";
    const unusable = this.checkUsable(operation);
    if (unusable) return { result: unusable, events: [] };
    if (this.readOnly || this.guard !== "idle") return {
      result: refusedResult(operation, this.readOnly ? "operation-error" : "transaction-reentrant", { base: this.currentRevision, identity: this.identity }), events: [],
    };
    if (staged.baseRevision !== this.currentRevision || staged.expectedViewRevision !== this.stateViewRevision()) return {
      result: refusedResult(operation, "operation-error", { base: this.currentRevision, identity: this.identity }), events: [],
    };
    const revision = this.currentRevision;
    const transactionId = (staged.transactionId as string | null) ?? null;
    const layout = clone(this.state!.presentation.layout);
    const patched = applyPresentationPatch(layout, staged.presentation as Rec);
    if (!patched || H(patched) === H(layout)) {
      // DESIGN L641: a corrected gesture reports a single correction notice.
      const notice: Rec = { code: "normalize/gesture-corrected", severity: "info", classification: "repairable",
        stage: "normalize", ruleId: "gesture-correction", messageKey: "normalize.gesture-corrected",
        disposition: "corrected",
        source: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" },
        result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" },
        beforePresent: false, afterPresent: false };
      const report = reportFor(operation, { identity: this.identity, input: revision, output: revision, entries: [notice] });
      const result = okResult(operation, revision, revision,
        { envelope: clone(this.state!.envelope), semanticRevision: revision,
          viewRevision: this.state!.viewRevision, transactionId, changed: false }, report, this.identity);
      return { result, events: [] };
    }
    const failed = (code: string, entries: Rec[]): { result: Rec; events: Rec[] } => ({
      result: refusedResult(operation, code, { base: revision, identity: this.identity, entries }), events: [],
    });
    const placementIntent = this.placementIntentFor(staged.presentation as Rec, patched);
    const { complete } = await import("./completion.js");
    const { validate } = await import("./validate.js");
    this.guard = "staging";
    try {
      if (this.testHook) {
        try {
          await this.testHook("staging");
        } catch {
          return failed("operation-error", []);
        }
      }
      const stagedEnvelope = { documentVersion: "1", profileIdentity: clone(this.identity),
        tree: clone(this.state!.envelope.tree), bindings: clone(this.state!.envelope.bindings ?? []),
        semanticRevision: revision };
      const completed = await complete(this.compiled as never, stagedEnvelope as never, "retained", undefined);
      if (completed.status !== "ok") {
        return failed((completed as unknown as { code?: string }).code ?? "operation-error", []);
      }
      const completedPayload = (completed as unknown as { payload: Rec }).payload;
      const completeEntries = resultEntries(completed);
      const pre = validate(this.compiled as never, completedPayload as never,
        { phase: "pre-normalize", readinessPolicy: "draft" } as never);
      const preEntries = resultEntries(pre);
      const preError = preEntries.find(entry => entry.severity === "error");
      if (pre.status !== "ok" || preError) {
        return failed(pre.status !== "ok" ? (pre as unknown as { code: string }).code : preError!.code as string, preEntries);
      }
      const normalized = await normalize(this.compiled as never, completedPayload as never, "edit", placementIntent);
      if (normalized.status !== "ok") {
        return failed((normalized as unknown as { code?: string }).code ?? "operation-error", preEntries);
      }
      const normalizedPayload = (normalized as unknown as { payload: { envelope: Rec } }).payload.envelope;
      const post = validate(this.compiled as never, normalizedPayload as never,
        { phase: "post-normalize", readinessPolicy: "draft" } as never);
      const postEntries = resultEntries(post);
      const postError = postEntries.find(entry => entry.severity === "error");
      if (post.status !== "ok" || postError) {
        return failed(post.status !== "ok" ? (post as unknown as { code: string }).code : postError!.code as string,
          [...completeEntries, ...preEntries, ...postEntries]);
      }
      this.guard = "applying";
      if (this.testHook) {
        try {
          await this.testHook("applying");
        } catch {
          return failed("operation-error", [...preEntries, ...postEntries]);
        }
      }
      const correctionEntries = [...completeEntries, ...preEntries,
        ...resultEntries(normalized), ...postEntries];
      const normalizedPlacements = ((normalized as unknown as { payload: { placements: Rec[] } })
        .payload.placements ?? []) as Rec[];
      const corrected = this.correctLayout(normalizedPayload, normalizedPlacements, patched,
        this.state!.presentation.themeId as string);
      if ("code" in corrected) return failed(corrected.code, correctionEntries);
      const finalTree = (normalizedPayload.tree ?? completedPayload.tree) as Rec;
      const finalBindings = ((normalizedPayload as Rec).bindings ?? (completedPayload as Rec).bindings ?? []) as Rec[];
      const finalRevision = revisionOf(finalTree as unknown as NativeNode, this.identity as never, finalBindings as never);
      const presentation = { ...(clone(this.state!.presentation) as Lot5Presentation), layout: corrected.layout };
      const envelope = { ...(clone(this.state!.envelope) as Rec), tree: clone(finalTree),
        bindings: clone(finalBindings), semanticRevision: finalRevision };
      const viewRevision = this.computeView(envelope, corrected.layout, presentation.themeId, presentation);
      const before = { envelope: clone(this.state!.envelope), presentation: clone(this.state!.presentation), viewRevision: this.state!.viewRevision };
      const after = { envelope, presentation, viewRevision };
      this.history = this.history.slice(0, this.cursor + 1);
      this.history.push({ before, after, transactionId });
      this.cursor = this.history.length - 1;
      this.state = after;
      const report = reportFor(operation, { identity: this.identity, input: revision, output: finalRevision,
        entries: correctionEntries });
      const result = okResult(operation, revision, finalRevision,
        { envelope: clone(envelope), semanticRevision: finalRevision, viewRevision,
          transactionId, changed: true }, report, this.identity);
      const event: Rec = { envelope: clone(envelope), semanticRevision: finalRevision, viewRevision,
        transactionId, origin: "command", report: clone(report) };
      this.pushEvent(event);
      return { result, events: [event] };
    } finally {
      this.guard = "idle";
    }
  }

  /** Layout correction of a staged DI gesture (DESIGN L631): the N
   * placements of reserved regions (an owner/region support binding exists)
   * run through the lot-4 layout primitive on the patched stage; other
   * placements keep the patched geometry. Pure: no state mutation. */
  private correctLayout(normalizedEnvelope: Rec, placements: Rec[], patched: Lot5Layout, themeId: string):
    { layout: Lot5Layout } | { code: string } {
    const bound = new Set(((normalizedEnvelope.bindings ?? []) as Rec[])
      .map(binding => `${binding.ownerId as string} ${binding.role as string}`));
    const reserved = placements.filter(placement =>
      bound.has(`${placement.ownerProcessId as string} ${placement.regionKey as string}`));
    const laid = runLayout({
      profile: this.view.document,
      descriptors: this.view.descriptors,
      notions: this.view.notionById,
      ...(this.unicodeCase ? { unicodeCase: this.unicodeCase } : {}),
    }, {
      envelope: normalizedEnvelope, placements: reserved,
      baseGeometry: { pages: patched.pages, geometry: patched.geometry }, themeId,
    });
    if (laid.status !== "ok") return { code: (laid as unknown as { code?: string }).code ?? "operation-error" };
    return { layout: clone((laid as unknown as { payload: Lot5Layout }).payload) };
  }

  /** Placement intent of a staged DI gesture: the semantic element of every
   * moved, resized or reattached occurrence (DESIGN L631). */
  private placementIntentFor(stagedPresentation: Rec, layout: Lot5Layout): Rec[] {
    const geometry = (layout.geometry ?? []) as Rec[];
    const pageId = stagedPresentation.pageId as string | undefined;
    const occurrenceKey = stagedPresentation.occurrenceKey as string | undefined;
    const occurrence = geometry.find(g => g.pageId === pageId && g.occurrenceKey === occurrenceKey);
    const semanticId = occurrence?.semanticId as string | undefined;
    return typeof semanticId === "string" && semanticId !== "" ? [{ elementId: semanticId }] : [];
  }

  // ------------------------------------------------------------ undo/redo (H1–H4)
  restore(which: "undo" | "redo", request: { expectedRevision?: string; expectedViewRevision?: string }):
    { result: Rec; events: Rec[] } {
    const revision = this.currentRevision;
    if (this.disposed) return { result: refusedResult(which, "canvas-disposed", this.activationMode === "configured" ? { identity: this.identity } : {}), events: [] };
    if (this.guard !== "idle") return { result: refusedResult(which, "transaction-reentrant", { base: revision, identity: this.identity }), events: [] };
    const store = which === "undo" ? this.history.slice(0, this.cursor + 1) : this.history.slice(this.cursor + 1);
    if (store.length === 0) {
      return { result: refusedResult(which, "operation-error", { base: revision, identity: this.identity }), events: [] };
    }
    if ((request.expectedRevision !== undefined && request.expectedRevision !== revision)
      || (request.expectedViewRevision !== undefined && request.expectedViewRevision !== this.state!.viewRevision)) {
      return { result: refusedResult(which, "operation-error", { base: revision, identity: this.identity }), events: [] };
    }
    this.cursor += which === "undo" ? -1 : 1;
    const slot = (which === "undo" ? this.history[this.cursor + 1] : this.history[this.cursor])!;
    const slotTransactionId = slot.transactionId;
    const wanted = (which === "undo" ? slot.before : slot.after) as Lot5StoredState;
    const restored: Lot5StoredState = { envelope: clone(wanted.envelope),
      presentation: clone(wanted.presentation), viewRevision: wanted.viewRevision };
    if ((restored.presentation.themeId as string) !== (this.state!.presentation.themeId as string)) {
      restored.presentation = { ...restored.presentation, themeId: this.state!.presentation.themeId };
      restored.viewRevision = this.computeView(restored.envelope, restored.presentation.layout,
        restored.presentation.themeId as string, restored.presentation);
    }
    this.state = restored;
    const reached = this.currentRevision;
    const report = reportFor(which, { identity: this.identity, input: revision, output: reached });
    const result = okResult(which, revision, reached,
      { snapshotVersion: "1", envelope: clone(restored.envelope), presentation: clone(restored.presentation),
        viewRevision: restored.viewRevision }, report, this.identity);
    const event: Rec = { envelope: clone(restored.envelope), semanticRevision: reached,
      viewRevision: restored.viewRevision, transactionId: slotTransactionId, origin: which, report: clone(report) };
    this.pushEvent(event);
    return { result, events: [event] };
  }

  historyProbe(): Rec {
    if (!this.loaded || this.state === null) {
      return { probe: refusedResult("undo", "operation-error"), probeEvents: [], rootTransactions: 0 };
    }
    return {
      probe: refusedResult("undo", "operation-error", { base: this.currentRevision, identity: this.identity }),
      probeEvents: [],
      rootTransactions: this.history.length,
    };
  }

  fullHistory(): Rec {
    const rootTransactions = this.history.length;
    if (this.cursor < 0) return this.historyProbe();
    const undo = this.restore("undo", { expectedRevision: this.currentRevision, expectedViewRevision: this.stateViewRevision() });
    const redo = this.restore("redo", { expectedRevision: this.currentRevision, expectedViewRevision: this.stateViewRevision() });
    return { undo, redo, rootTransactions };
  }

  // ------------------------------------------------------------ theme and selection
  setTheme(themeId: string): { result: Rec; snapshot: Rec; events: Rec[] } {
    const operation = "setTheme";
    const blocked = this.checkUsable(operation);
    if (blocked) return { result: blocked, snapshot: this.getSnapshot().result, events: [] };
    const revision = this.currentRevision;
    if (!this.view.themes.some(theme => theme.id === themeId)) return {
      result: refusedResult(operation, "operation-error", { base: revision, identity: this.identity }), snapshot: this.snapshotResult(), events: [],
    };
    if (this.guard !== "idle") return { result: refusedResult(operation, "transaction-reentrant", { base: revision, identity: this.identity }), snapshot: this.snapshotResult(), events: [] };
    this.state = { envelope: clone(this.state!.envelope),
      presentation: { ...(clone(this.state!.presentation) as Lot5Presentation), themeId },
      viewRevision: "" };
    this.state.viewRevision = this.computeView(this.state.envelope, this.state.presentation.layout, themeId, this.state.presentation);
    const report = reportFor(operation, { identity: this.identity, input: revision, output: revision });
    const result = okResult(operation, revision, revision, { viewRevision: this.state.viewRevision }, report, this.identity);
    const event: Rec = { envelope: clone(this.state!.envelope), semanticRevision: revision,
      viewRevision: this.state!.viewRevision, transactionId: "", origin: "theme", report: clone(report) };
    this.pushEvent(event);
    return { result, snapshot: this.snapshotResult(), events: [event] };
  }

  // ------------------------------------------------------------ read queries (no history, no events)
  private queryTree(): { tree: NativeNode; index: TreeIndex; bindings: { ownerId: string; role: string; targetId: string }[] } {
    const tree = this.state!.envelope.tree as unknown as NativeNode;
    return { tree, index: new TreeIndex(tree),
      bindings: (this.state!.envelope.bindings ?? []) as { ownerId: string; role: string; targetId: string }[] };
  }

  private checkQuery(query: { baseRevision?: string }): Rec | null {
    if (this.disposed) return pureRefused("canvas-disposed");
    if (!this.loaded || !this.state) return pureRefused("document-not-loaded");
    if (query.baseRevision !== undefined && query.baseRevision !== this.currentRevision) {
      return pureRefused("operation-error");
    }
    return null;
  }

  listEntries(query: { baseRevision: string; surface: string; subject: string; locale: string }): Rec {
    const blocked = this.checkQuery(query);
    if (blocked) return blocked;
    const { tree, index, bindings } = this.queryTree();
    return listEntries(this.view, tree, index, query.surface, query.subject, query.locale, this.currentRevision, bindings);
  }

  listFields(query: { baseRevision: string; targetId: string; locale: string }): Rec {
    const blocked = this.checkQuery(query);
    if (blocked) return blocked;
    const { tree, index, bindings } = this.queryTree();
    return listFields(this.view, tree, index, query.targetId, query.locale, this.currentRevision, bindings);
  }

  checkField(query: { baseRevision: string; targetId: string; fieldId: string; value: unknown }): Rec {
    const blocked = this.checkQuery(query);
    if (blocked) return blocked;
    const { tree, index, bindings } = this.queryTree();
    return checkField(this.view, tree, index, query.targetId, query.fieldId, query.value, this.currentRevision, bindings);
  }

  queryReferences(query: { baseRevision: string; targetId: string; field: string; query: string; offset: number; limit: number }): Rec {
    const blocked = this.checkQuery(query);
    if (blocked) return blocked;
    const { tree, index, bindings } = this.queryTree();
    return queryReferences(this.view, tree, index, query.targetId, query.field, query.query,
      query.offset, query.limit, this.currentRevision, bindings);
  }

  localize(query: { key: string; locale: string }): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    return localizeQuery(this.view, query.key, query.locale);
  }

  copy(query: { baseRevision: string; elementIds: string[] }): Rec {
    const blocked = this.checkQuery(query);
    if (blocked) return blocked;
    const { tree, index } = this.queryTree();
    return copyQuery(tree, index, query.elementIds, this.currentRevision);
  }

  upstreamFilter(tools: readonly (Rec | string)[], subject?: string): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    const tree = this.queryTree();
    return upstreamFilter(this.view, tools, subject ? subjectScope(this.view, tree.tree, tree.index, subject, tree.bindings) : undefined);
  }

  // ------------------------------------------------------------ navigation (§8.1)
  navigationIndex(): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    if (!this.loaded || !this.state) return pureRefused("document-not-loaded");
    const { tree, index } = this.queryTree();
    return navigationIndex(pagesOf(this.state.presentation), this.currentRevision, tree, index);
  }

  navigate(query: { callId: string; currentDiagramId?: string; diagramId?: string }):
    { result: Rec; snapshot: Rec; events: Rec[] } {
    const blocked = this.checkUsable("navigate");
    if (blocked) return { result: blocked, snapshot: this.getSnapshot().result, events: [] };
    const { tree, index } = this.queryTree();
    const result = navigateCall(pagesOf(this.state!.presentation), this.currentRevision, tree, index,
      query.callId, query.currentDiagramId ?? this.state!.presentation.activePageId, query.diagramId);
    if (result.status !== "ok" || (result.payload as Rec).resolution !== "open") return { result, snapshot: this.snapshotResult(), events: [] };
    this.state = { envelope: clone(this.state!.envelope),
      presentation: { ...(clone(this.state!.presentation) as Lot5Presentation),
        activePageId: (result as unknown as { payload: { diagramId: string } }).payload.diagramId },
      viewRevision: this.state!.viewRevision };
    return { result, snapshot: this.snapshotResult(), events: [] };
  }

  select(activatePage: string | undefined, select: Rec[]): { snapshot: Rec; events: Rec[]; history: Rec } {
    if (activatePage !== undefined) {
      this.state = { envelope: clone(this.state!.envelope),
        presentation: { ...(clone(this.state!.presentation) as Lot5Presentation), activePageId: activatePage },
        viewRevision: this.state!.viewRevision };
    }
    if (select !== undefined) {
      this.state = { envelope: clone(this.state!.envelope),
        presentation: { ...(clone(this.state!.presentation) as Lot5Presentation), selection: clone(select) },
        viewRevision: this.state!.viewRevision };
    }
    return { snapshot: this.snapshotResult(), events: [], history: this.historyProbe() };
  }

  isReadOnly(): boolean { return this.readOnly; }

  renderData(): Rec {
    const blocked = this.checkUsable("resolveTheme");
    if (blocked) return blocked;
    const envelope = this.state!.envelope;
    const themeId = this.state!.presentation.themeId;
    const layout = this.renderLayout(envelope, themeId);
    const labelCode = (layout as { code?: unknown }).code;
    if (typeof labelCode === "string") return refusedResult("resolveTheme", labelCode, { identity: this.identity });
    return resolveTheme({ profile: this.view.document, descriptors: this.view.descriptors,
      notions: new Map(this.view.notions.map(n => [n.id as string, n as { recognition: unknown }])),
      unicodeCase: this.unicodeCase, metricBytes: this.metricBytes },
      { envelope, layout, themeId,
        overrides: this.state!.presentation.overrides, diStyles: this.state!.presentation.diStyles }) as unknown as Rec;
  }

  /** Layout with evaluated labels. A refused label evaluation returns the
   * original refusal carrier (DESIGN :111, :114, :134, :698, :735) instead of
   * deleting the label, so renderData and prepareExport refuse with its code.
   * A successful MISSING, an explicitly empty label and an absent expression
   * keep their current successful meaning (label deleted). */
  private renderLayout(envelope: Rec, themeId: string): Lot5Layout | { code: string } {
    const layout = clone(this.state!.presentation.layout);
    const finalTree = envelope.tree as NativeNode;
    const finalBindings = (envelope.bindings ?? []) as never;
    const index = new TreeIndex(finalTree);
    for (const geometry of layout.geometry as Rec[]) {
      if (typeof geometry.semanticId !== "string") continue;
      const scope = subjectScope(this.view, finalTree, index, geometry.semanticId, finalBindings);
      if (!scope) continue;
      const notion = this.view.notions.find(n => evalPredicate(this.view, n.recognition, scope) && (n.renderBindings as Rec[]).length > 0);
      let binding: Rec | undefined;
      for (let theme: string | undefined = themeId; theme && !binding;) {
        binding = (notion?.renderBindings as Rec[] | undefined)?.find(b => b.theme === theme);
        theme = this.view.themes.find(t => t.id === theme)?.fallback as string | undefined;
      }
      const label = binding ? evalValue(this.view, binding.label ?? { op: "literal", value: "" }, scope, "label") : undefined;
      if (label !== undefined && !label.ok) return { code: label.code };
      if (label?.ok && typeof label.value === "string" && label.value !== "") {
        geometry.label = { text: label.value, lines: label.value.split("\n"), bounds: clone((geometry.label as Rec | undefined)?.bounds ?? geometry.bounds) };
      } else delete geometry.label;
    }
    return layout;
  }

  // ------------------------------------------------------------ static viewer (§8.1)
  /** Headless static surface: fixed capability inventory, envelope preview, or
   * rendered pages. Never normalizes, never commits, never emits. */
  viewerStatic(input: { snapshot?: Lot5SnapshotInput; envelope?: Rec; props?: Rec }): Rec {
    if (input.envelope !== undefined) {
      return pureOk({ previewEnvelope: clone(input.envelope), completionRun: false,
        normalizationRun: false, sourceEnvelopeUnchanged: true });
    }
    if (input.snapshot === undefined) return pureRefused("operation-error");
    if (input.props !== undefined) {
      return pureOk({
        mutationOperations: [],
        changeCallbacks: [],
        palette: "absent",
        contextPad: "absent",
        gestures: { "direct-edit": "no-staged-command", "drag-move": "no-staged-command",
          "keyboard-delete": "no-staged-command", "keyboard-paste": "no-staged-command" },
        sourceEnvelopeUnchanged: true,
      });
    }
    return pureOk({ renderedPages: this.renderedPages(input.snapshot.presentation.layout) });
  }

  private renderedPages(layout: Lot5Layout): Rec[] {
    return (layout.pages as Rec[]).map(page => ({
      pageId: page.pageId,
      name: page.name,
      order: page.order,
      semanticRootId: page.semanticRootId,
    }));
  }

  importPreview(nativeJson: unknown): { preview: Rec; firstGesture: Rec; result: Rec } {
    const preview = previewNativeJson(JSON.stringify(nativeJson), this.view.descriptors, []);
    if (preview.status !== "ok") return { preview: {}, firstGesture: { staged: false, code: preview.code }, result: refusedResult("applyCommands", preview.code, { identity: this.identity }) };
    return {
      preview: { mode: "generic-read-only", tree: clone(preview.payload.tree), activated: false, committed: false,
        events: [], surfaces: { palette: [], paste: [] } },
      firstGesture: { staged: false, code: "operation-error" },
      result: refusedResult("applyCommands", "profile-metadata-missing", { identity: this.identity }),
    };
  }

  // ------------------------------------------------------------ workshop (§8.1)
  workshopPreview(): Rec {
    if (this.disposed) return pureRefused("canvas-disposed");
    if (!this.loaded || !this.state) return pureRefused("document-not-loaded");
    return pureOk({ renderedPages: this.renderedPages(this.state.presentation.layout), callbacks: [] });
  }

  /** Final-only export: prepare (C + accept gates + draft lint) then serialize. */
  async workshopExport(request: { label: string; themeId: string; formatId?: string }):
    Promise<{ download?: Rec; events: Rec[]; result?: Rec }> {
    const operation = "export";
    const blocked = this.checkUsable(operation);
    if (blocked) return { result: blocked, events: [] };
    const revision = this.currentRevision;
    const endpoint = this.view.exports.find(e => e.id === request.formatId);
    if (!endpoint) {
      // An unknown display label refuses inside the prepared record; the host
      // still receives the download callbacks shape with the diagnosis shown.
      const refusal = refusedResult("prepareExport", "export-format-unsupported",
        { base: revision, identity: this.identity });
      return { download: { prepared: refusal, callbacks: [], diagnosticsShown: true }, events: [] };
    }
    const prepared = await this.prepareExport(endpoint, request.themeId);
    if ("code" in prepared) {
      const refusal = refusedResult("prepareExport", prepared.code,
        { base: revision, identity: this.identity, entries: prepared.entries });
      return { download: { prepared: refusal, callbacks: [], diagnosticsShown: true }, events: [] };
    }
    const download = this.serializePrepared(endpoint, prepared, request);
    return { download, events: [] };
  }

  /** Workshop autosave payload: the prepared export serialized (F1). */
  async workshopAutosave(options: { format: string; label: string; theme: string }): Promise<Rec> {
    if (this.disposed) return pureRefused("canvas-disposed");
    if (!this.loaded || !this.state) return pureRefused("document-not-loaded");
    const endpoint = this.view.exports.find(e => (e.label as string) === options.label);
    if (!endpoint) return pureRefused("export-format-unsupported");
    const prepared = await this.prepareExport(endpoint, options.theme);
    if ("code" in prepared) return pureRefused((prepared as { code: string }).code);
    const download = this.serializePrepared(endpoint, prepared, { label: options.label, themeId: options.theme });
    const serialized = download.serialized as Rec;
    return pureOk({ bytes: serialized.bytes, digest: serialized.digest,
      idMap: clone((download.prepared as Rec).payload ? ((download.prepared as Rec).payload as Rec).idMap : []),
      options: clone(options) });
  }

  private async prepareExport(endpoint: Rec, themeId: string):
    Promise<{ report: Rec; payload: Rec; entries: Rec[] } | { code: string; entries: Rec[] }> {
    const { complete } = await import("./completion.js");
    const { validate } = await import("./validate.js");
    const tree = clone(this.state!.envelope.tree);
    const bindings = clone(this.state!.envelope.bindings ?? []);
    const staged = { documentVersion: "1", profileIdentity: clone(this.identity),
      tree, bindings, semanticRevision: revisionOf(tree as NativeNode, this.identity as never, bindings as never) };
    const completed = await complete(this.compiled as never, staged as never, "retained", undefined);
    if (completed.status !== "ok") {
      return { code: (completed as unknown as { code?: string }).code ?? "operation-error",
        entries: [...clone(resultEntries(completed))] };
    }
    const completedPayload = (completed as unknown as { payload: Rec }).payload;
    const completeEntries = [...clone(resultEntries(completed))];
    // Accept gates first (C19 names the first error); the draft stages are
    // sealed only on the final export of a corrected document. The gates
    // run in DESIGN stage order — C, pre-normalize, N, post-normalize, then
    // layout, post-layout, release — and every refusal keeps the report
    // accumulated so far.
    const preAccept = validate(this.compiled as never, completedPayload as never,
      { phase: "pre-normalize", readinessPolicy: "accept" } as never);
    const preGate = gateErrors(preAccept);
    if (preGate) return { code: firstErrorCode(preGate),
      entries: [...clone(completeEntries), ...clone(resultEntries(preAccept))] };
    const normalized = await normalize(this.compiled as never, completedPayload as never, "edit", undefined);
    if (normalized.status !== "ok") {
      return { code: (normalized as unknown as { code?: string }).code ?? "operation-error",
        entries: [...clone(completeEntries), ...clone(resultEntries(preAccept)), ...clone(resultEntries(normalized))] };
    }
    const finalPayload = (normalized.payload as { envelope: Rec }).envelope;
    const finalTree = finalPayload.tree as unknown as NativeNode;
    const finalBindings = (finalPayload.bindings ?? []) as { ownerId: string; role: string; targetId: string }[];
    const postAccept = validate(this.compiled as never, finalPayload as never,
      { phase: "post-normalize", readinessPolicy: "accept" } as never);
    const postGate = gateErrors(postAccept);
    if (postGate) return { code: firstErrorCode(postGate),
      entries: [...clone(completeEntries), ...clone(resultEntries(preAccept)),
        ...clone(resultEntries(normalized)), ...clone(resultEntries(postAccept))] };
    const entries: Rec[] = [...clone(completeEntries), ...clone(resultEntries(preAccept)),
      ...clone(resultEntries(normalized)), ...clone(resultEntries(postAccept))];
    const preDraft = validate(this.compiled as never, completedPayload as never,
      { phase: "pre-normalize", readinessPolicy: "draft" } as never);
    const postDraft = validate(this.compiled as never, finalPayload as never,
      { phase: "post-normalize", readinessPolicy: "draft" } as never);
    entries.push(...draftEntries(preDraft), ...draftEntries(postDraft));
    const finalRevision = revisionOf(finalTree, this.identity as never, finalBindings as never);
    const state = compiledState(this.compiled as never);
    const context = { profile: this.view.document, descriptors: this.view.descriptors,
      notions: new Map(this.view.notions.map(n => [n.id as string, n as { recognition: unknown }])),
      unicodeCase: this.unicodeCase, metricBytes: this.metricBytes, registry: state.registry };
    const layout = this.renderLayout(finalPayload, themeId);
    const labelCode = (layout as { code?: unknown }).code;
    if (typeof labelCode === "string") return { code: labelCode, entries: canonicalEntries([...entries]) };
    // Post-layout and release accept gates run on the laid-out document
    // before R/map (DESIGN §6.2 prepareExport order); layout changes only
    // geometry, so the post-N tree is the gate input.
    const postLayoutAccept = validate(this.compiled as never, finalPayload as never,
      { phase: "post-layout", readinessPolicy: "accept" } as never);
    const postLayoutGate = gateErrors(postLayoutAccept);
    if (postLayoutGate) return { code: firstErrorCode(postLayoutGate),
      entries: canonicalEntries([...clone(entries), ...clone(resultEntries(postLayoutAccept))]) };
    const releaseAccept = validate(this.compiled as never, finalPayload as never,
      { phase: "release", readinessPolicy: "accept" } as never);
    const releaseGate = gateErrors(releaseAccept);
    if (releaseGate) return { code: firstErrorCode(releaseGate),
      entries: canonicalEntries([...clone(entries), ...clone(resultEntries(postLayoutAccept)), ...clone(resultEntries(releaseAccept))]) };
    entries.push(...clone(resultEntries(postLayoutAccept)), ...clone(resultEntries(releaseAccept)));
    const rendered = resolveTheme(context, { envelope: finalPayload, layout,
      themeId, overrides: this.state!.presentation.overrides, diStyles: this.state!.presentation.diStyles });
    if (rendered.status !== "ok") return { code: rendered.code,
      entries: canonicalEntries([...entries, ...clone(resultEntries(rendered))]) };
    const mapped = mapExport(context as never, { envelope: finalPayload, layout,
      render: rendered.payload, format: endpoint.format as string });
    if (mapped.status !== "ok") {
      const mappedEntries = clone(((mapped as unknown as { report?: { entries?: Rec[] } }).report?.entries ?? [])) as Rec[];
      return { code: mapped.code, entries: canonicalEntries([...entries, ...mappedEntries]) };
    }
    // The prepared report keeps the whole mapExport report: its loss entries,
    // idMap and artifacts (entryIndexes remapped onto the merged entries),
    // so every loss stays reachable through entryIndexes (DESIGN L753).
    const mappedPayload = clone(mapped.payload) as Rec;
    const mappedReport = (mappedPayload.report ?? {}) as Rec;
    const mappedEntries = (mappedReport.entries ?? []) as Rec[];
    const merged = canonicalEntries([...entries, ...mappedEntries]);
    const position = new Map<Rec, number>();
    merged.forEach((entry, index) => {
      if (!position.has(entry)) position.set(entry, index);
    });
    const artifacts = ((mappedReport.artifacts ?? []) as Rec[]).map(artifact => ({
      ...clone(artifact),
      entryIndexes: ((artifact.entryIndexes ?? []) as number[]).map(i => position.get(mappedEntries[i]!) ?? -1),
    }));
    const payload = mappedPayload;
    payload.idMap = clone((mappedPayload.idMap ?? []) as Rec[]);
    const report = reportFor("prepareExport", { identity: this.identity, input: this.currentRevision,
      output: finalRevision, entries: merged, idMap: payload.idMap as Rec[], artifacts });
    payload.report = clone(report);
    return { report, payload, entries: merged };
  }

  private serializePrepared(endpoint: Rec, prepared: { report: Rec; payload: Rec; entries: Rec[] },
    request: { label: string; themeId: string }): Rec {
    void request;
    const payload = prepared.payload;
    // The terminal writer is driven by the profile export spec serializer
    // carried on the endpoint, never by a hard-coded version.
    const serialized = serializePrepared({ prepared: payload, writerOptions: clone(endpoint.serializer ?? {}) }) as unknown as Rec;
    serialized.operation = "exportPrepared";
    serialized.report = reportFor("exportPrepared", { identity: this.identity, input: this.currentRevision,
      output: payload.semanticRevision as string, artifacts: (serialized.report as Rec).artifacts as Rec[] });
    const preparedResult = okResult("prepareExport", this.currentRevision, payload.semanticRevision as string,
      payload, prepared.report, this.identity);
    if (serialized.status !== "ok") return { prepared: preparedResult, serialized, callbacks: [], diagnosticsShown: true };
    const body = serialized.payload as Rec;
    return { prepared: preparedResult, serialized,
      callbacks: [{ ...body, semanticRevision: payload.semanticRevision, viewRevision: payload.viewRevision,
        profileIdentity: clone(this.identity), report: clone(prepared.report) }] };
  }

}

/** DESIGN §3.3 gate for an activation identity change, rows applied in table
 * order with their exact codes, or null only when P = D in every compared
 * dimension. Source-dependent rows (P1) yield `profile-source-unavailable`
 * when either version is not a release triplet or either digest is unknown.
 * A same-version digest conflict requires two known unequal digests and can
 * never be waived by a plan. */
const activationGate = (current: Rec, offered: Rec): string | null => {
  const digestsKnown = typeof offered.sha256 === "string" && /^[0-9a-f]{64}$/.test(offered.sha256 as string)
    && typeof current.sha256 === "string" && /^[0-9a-f]{64}$/.test(current.sha256 as string);
  const semver = (version: unknown): readonly bigint[] | undefined =>
    typeof version === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)
      ? version.split(".").map(BigInt) as readonly bigint[] : undefined;
  const target = semver(offered.version), source = semver(current.version);
  const sourceAvailable = !!target && !!source && digestsKnown;
  // P1: at the first applicable source-dependent row, an unknown document
  // version/digest yields profile-source-unavailable instead of that row's
  // migration/mismatch code. Selecting a migration alone establishes neither
  // source availability nor successful migration.
  const sourceRemedy = (code: string): string => (sourceAvailable ? code : "profile-source-unavailable");
  if (offered.mechanismVersion !== current.mechanismVersion) return sourceRemedy("mechanism-migration-required");
  if (offered.schemaVersion !== current.schemaVersion) return sourceRemedy("profile-schema-migration-required");
  if (H(offered.base) !== H(current.base)) return sourceRemedy("base-mismatch");
  if (H(offered.descriptors) !== H(current.descriptors)) return sourceRemedy("descriptor-mismatch");
  if (!target || !source) return "profile-source-unavailable";
  if (offered.profile !== current.profile || target[0] !== source[0]) return sourceRemedy("profile-major-mismatch");
  if (offered.version === current.version && digestsKnown && offered.sha256 !== current.sha256) {
    return "profile-digest-mismatch";
  }
  if (!sourceAvailable) return "profile-source-unavailable";
  if (target[1] === source[1]) {
    if (target[2]! > source[2]!) return "profile-patch-migration-required";
    if (target[2]! < source[2]!) return "profile-patch-downgrade-required";
  }
  if (target[1]! > source[1]!) return "profile-minor-migration-required";
  if (target[1]! < source[1]!) return "profile-minor-downgrade-required";
  return null;
};

const gateErrors = (linted: unknown): Rec[] | null => {
  const entries = ((asRecord((linted as unknown as { report?: unknown }).report) as Rec | undefined)?.entries ?? []) as Rec[];
  const errors = entries.filter(e => (e as Rec).severity === "error").map(e => clone(e));
  return errors.length > 0 ? errors : null;
};

const draftEntries = (linted: unknown): Rec[] => {
  const report = asRecord((linted as unknown as { report?: unknown }).report) as Rec | undefined;
  return (((report as Rec)?.entries ?? []) as Rec[]).map(e => clone(e));
};

/** Entries carried by a C/N stage result: report entries on success, the
 * refusal diagnostics otherwise (mirrors the command transaction path). */
const resultEntries = (result: unknown): Rec[] => {
  const record = asRecord(result as Rec) ?? {};
  const source = record.status === "ok" ? asRecord(record.report as Rec)?.entries : record.diagnostics;
  return [...(clone(asArray(source as Rec) ?? []) as Rec[])];
};

const firstErrorCode = (errors: Rec[]): string => (errors[0]?.code as string | undefined) ?? "operation-error";

// Late refusals merge draft pre/post entries after the accept entries, so the
// merged list is sorted into canonical report order with exact duplicates
// removed before it is returned.
const canonicalEntries = (list: Rec[]): Rec[] => {
  const seen = new Set<string>();
  return (sortReportEntries(list) as Rec[]).filter(entry => {
    const key = canonicalize(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export type { NavigationPage };

/** Container process of an element (nearest Process ancestor-or-self). */
function containerProcessOf(index: TreeIndex, elementId: string): string | null {
  let current = index.get(elementId) ?? null;
  while (current) {
    if (current.node.$type === "bpmn:Process" && typeof current.node.id === "string") return current.node.id;
    current = current.parent;
  }
  return null;
}

/** InputSet children of the owner's ioSpecification; null when not configured (C16). */
function inputSetsOf(index: TreeIndex, ownerId: string): string[] | null {
  const owner = index.get(ownerId);
  if (!owner) return null;
  const node = owner.node as unknown as Rec;
  const io = node.ioSpecification as Rec | undefined;
  if (!io || !Array.isArray(io.inputSets)) return null;
  return (io.inputSets as Rec[]).filter(s => typeof s.id === "string").map(s => s.id as string);
}

function selectedSemanticIds(presentation: Lot5Presentation, gesture: Rec): string[] {
  const explicit = asArray(gesture.selection)?.map(pair => asRecord(pair));
  const pairs = explicit && explicit.length > 0 ? explicit : (presentation.selection as Rec[]);
  const ids = new Set<string>();
  const geometry = presentation.layout.geometry as Rec[];
  for (const pair of pairs) {
    if (!pair || typeof pair.pageId !== "string" || typeof pair.occurrenceKey !== "string") continue;
    const occurrence = geometry.find(g => g.pageId === pair.pageId && g.occurrenceKey === pair.occurrenceKey);
    if (occurrence && typeof occurrence.semanticId === "string") ids.add(occurrence.semanticId as string);
  }
  return [...ids];
}

function isEdgeType(type: string): boolean {
  return type === "bpmn:SequenceFlow" || type === "bpmn:MessageFlow" || type.endsWith("Association");
}

/** Apply a DI-only staged presentation patch; null when nothing changes. */
function applyPresentationPatch(layout: Lot5Layout, staged: Rec): Lot5Layout | null {
  const geometry = (layout.geometry as Rec[]).map(g => clone(g));
  const target = geometry.find(g => g.pageId === staged.pageId && g.occurrenceKey === staged.occurrenceKey);
  if (!target) return null;
  const kind = staged.gesture as string;
  const delta = asRecord(staged.delta) ?? {};
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) ? value : null);
  if (kind === "drag") {
    const dx = num(delta.x);
    const dy = num(delta.y);
    if (dx === null || dy === null) return null;
    const bounds = { ...(target.bounds as Rec) };
    bounds.x = (bounds.x as number) + dx;
    bounds.y = (bounds.y as number) + dy;
    target.bounds = bounds;
    return { ...layout, geometry };
  }
  if (kind === "resize") {
    const edge = staged.edge as string | undefined;
    const dx = num(delta.x);
    const dy = num(delta.y);
    if (!edge || dx === null || dy === null) return null;
    const bounds = { ...(target.bounds as Rec) };
    if (edge === "east" || edge === "south-east") bounds.width = (bounds.width as number) + dx;
    if (edge === "south" || edge === "south-east") bounds.height = (bounds.height as number) + dy;
    target.bounds = bounds;
    return { ...layout, geometry };
  }
  if (kind === "label-move") {
    const dy = num(delta.y);
    if (dy === null || !target.label) return null;
    const label = { ...(target.label as Rec), bounds: { ...((target.label as Rec).bounds as Rec) } };
    (label.bounds as Rec).y = ((label.bounds as Rec).y as number) + dy;
    target.label = label;
    return { ...layout, geometry };
  }
  if (kind === "bendpoint") {
    const point = asRecord(staged.point);
    const px = num(point?.x);
    const py = num(point?.y);
    const waypoints = [...((target.waypoints ?? []) as Rec[])];
    if (px === null || py === null || waypoints.length < 2) return null;
    waypoints.splice(1, 0, { x: px, y: py });
    target.waypoints = waypoints;
    return { ...layout, geometry };
  }
  return null;
}
