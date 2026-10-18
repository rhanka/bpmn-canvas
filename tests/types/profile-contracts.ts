import type { ProfileBoundary, Result, PureResult } from "../../src/profile/results.js";
import type { DocumentEnvelope } from "../../src/profile/envelope.js";
import type { Snapshot } from "../../src/profile/presentation-contracts.js";
declare const api: ProfileBoundary;
const read: Result<DocumentEnvelope> = api.getDefinitions();
const snapshot: Result<Snapshot> = api.getSnapshot();
const queued: Promise<Result<Snapshot>> = api.undo({expectedRevision:"r",expectedViewRevision:"v"});
const disposed: Promise<PureResult<{ readonly disposed: true }>> = api.dispose();
// @ts-expect-error getters are synchronous
const asyncRead: Promise<Result<DocumentEnvelope>> = api.getDefinitions();
// @ts-expect-error mutations are queued
const syncWrite: Result<Snapshot> = api.redo({expectedRevision:"r",expectedViewRevision:"v"});
// @ts-expect-error refusal has no payload
const candidate: Result<Snapshot> = { status: "refused", operation: "getSnapshot", code: "x", diagnostics: [], report: {}, payload: {} };
void [read, snapshot, queued, disposed, asyncRead, syncWrite, candidate];

declare const envelope: DocumentEnvelope;
declare const compiled: unknown;
void api.setDefinitions(envelope, {mode:"draft",expectedRevision:"r",expectedViewRevision:"v",signal:new AbortController().signal});
void api.applyCommands({baseRevision:"r",expectedViewRevision:"v",commands:[],transactionId:"t",signal:new AbortController().signal});
void api.activateBusinessProfile(compiled, {id:"explicit"});
void api.restoreSnapshot({} as Snapshot, {expectedRevision:"r",signal:new AbortController().signal});
void api.prepareExport(compiled, envelope, {format:"neutral-ir",themeId:"plain",overrides:{semantic:[],occurrence:[]},diStyles:{native:[],bioc:[]}});
// @ts-expect-error load requires explicit options and mode
void api.setDefinitions(envelope);
// @ts-expect-error commands require revision and transaction context
void api.applyCommands([]);
// @ts-expect-error history requires both expected revisions
void api.undo();
// @ts-expect-error restore requires options
void api.restoreSnapshot({} as Snapshot);
// @ts-expect-error preparation requires the compiled profile, envelope and options
void api.prepareExport({});
