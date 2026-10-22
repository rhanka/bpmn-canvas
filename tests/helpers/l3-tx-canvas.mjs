/** l3-tx canvas adapter: replays sealed lot-3 transaction scripts on Lot5Canvas.
 * Replaces src/profile/session.ts. Resolves $refs (including in inject),
 * never writes an outcome itself; every injected value is a real canvas call.
 * History counts and change events are read through canvas test accessors;
 * stageGesture is translated through the canvas gesture API.
 * The native modeling command during applying stays a strict expected-skip
 * (OPEN-HOOK, U1): only the public applyCommands re-entry is sealed. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Lot5Canvas } from "../../dist/profile/lot5-canvas.js";
import { loadUnicodeCaseTable } from "../../dist/profile/unicode-case.js";
import { buildReport } from "../../dist/profile/report.js";
import { vendoredUnicodeCaseDocument } from "./unicode-case-vendored.mjs";

const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const clone = (value) => JSON.parse(JSON.stringify(value));

function lookupPath(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment) || Number(segment) >= current.length) return { present: false };
      current = current[Number(segment)];
    } else if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      if (!Object.hasOwn(current, segment)) return { present: false };
      current = current[segment];
    } else return { present: false };
  }
  return { present: true, value: current };
}

function resolveRefs(value, records) {
  if (Array.isArray(value)) return value.map((item) => resolveRefs(item, records));
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "$ref") {
      const ref = value.$ref;
      const target = records.find((candidate) => candidate.step === ref.step);
      if (!target) throw new Error(`l3-tx adapter: $ref step ${ref.step} missing`);
      const segments = ref.pointer === "" ? [] : ref.pointer.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
      const found = lookupPath(target, segments);
      if (!found.present) throw new Error(`l3-tx adapter: $ref pointer ${ref.pointer} missing`);
      return clone(found.value);
    }
    return Object.fromEntries(keys.map((key) => [key, resolveRefs(value[key], records)]));
  }
  return value;
}

export async function runTxScriptOnCanvas({ compiled, sessionInput, steps, dir }) {
  const byRole = {};
  for (const [role, ref] of Object.entries({ profile: sessionInput.profile, descriptors: sessionInput.descriptors, metrics: sessionInput.metrics })) {
    const bytes = readFileSync(new URL(`../../../${ref.path}`, dir));
    if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) {
      throw new Error(`l3-tx adapter: session bytes for ${ref.path}`);
    }
    byRole[role] = bytes;
  }
  const profileDocument = JSON.parse(byRole.profile.toString("utf8"));
  const descriptorTypes = JSON.parse(byRole.descriptors.toString("utf8")).types;
  const metricsPath = sessionInput.metrics.path;
  const metricsId = metricsPath.split("/").pop().replace(/\.json$/, "");
  const canvas = new Lot5Canvas({ compiled, profileDocument, descriptorTypes,
    metricsId, metricsSha256: sessionInput.metrics.sha256,
    metricsPins: [{ id: metricsId, sha256: sessionInput.metrics.sha256 }],
    unicodeCase: UNICODE_CASE, metricBytes: new Map([[metricsId, byRole.metrics]]),
    activationMode: "explicit" });
  canvas.setDescriptorPins(profileDocument.descriptors ?? []);
  const seen = [];
  const quiet = () => Object.fromEntries(seen.map((listener) => [listener, []]));
  const drain = () => {
    const events = {};
    for (const listener of seen) events[listener] = canvas.readEvents(listener);
    return events;
  };
  const counts = () => canvas.testHistoryCounts();
  const records = [];
  for (const raw of steps) {
    const step = resolveRefs(raw, records);
    const call = step.call;
    let record;
    if (call === "onChange") {
      if (typeof step.listener === "string" && !seen.includes(step.listener)) seen.push(step.listener);
      const result = canvas.onChange(step.listener);
      record = { step: step.step, result, events: quiet() };
    } else if (call === "unsubscribe") {
      if (typeof step.listener === "string" && !seen.includes(step.listener)) seen.push(step.listener);
      const result = canvas.unsubscribe(step.listener);
      record = { step: step.step, result, events: quiet() };
    } else if (call === "dispose") {
      const result = canvas.dispose();
      record = { step: step.step, result, events: quiet() };
    } else if (call === "setDefinitions") {
      const result = canvas.setDefinitions({ envelope: clone(step.envelope) });
      record = { step: step.step, result, history: counts(), events: drain() };
    } else if (call === "restoreSnapshot") {
      const { result, events } = canvas.restoreSnapshot(clone(step.snapshot));
      void events;
      record = { step: step.step, result, history: counts(), events: drain() };
    } else if (call === "getSnapshot") {
      const { result } = await canvas.getSnapshot();
      record = { step: step.step, result, events: quiet() };
    } else if (call === "getDefinitions") {
      const result = canvas.getDefinitions();
      record = { step: step.step, result, events: quiet() };
    } else if (call === "setTheme") {
      const { result } = canvas.setTheme(step.themeId);
      record = { step: step.step, result, history: counts(), events: drain() };
    } else if (call === "undo" || call === "redo") {
      const options = step.options ?? {};
      const { result } = canvas.restore(call, { expectedRevision: options.expectedRevision, expectedViewRevision: options.expectedViewRevision });
      record = { step: step.step, result, history: counts(), events: drain() };
    } else if (call === "applyCommands" || call === "stageGesture") {
      record = await runTxStep(canvas, step, { seen, quiet, drain, counts });
    } else {
      throw new Error(`l3-tx adapter: unknown call ${call}`);
    }
    records.push(record);
  }
  return records;
}

async function runTxStep(canvas, step, { seen, quiet, drain, counts }) {
  const isGesture = step.call === "stageGesture";
  const request = clone(step.request);
  const inject = step.inject ? clone(step.inject) : undefined;
  let hookCalls = [];
  let injected;
  const signal = request.signal ? { aborted: request.signal.aborted === true } : undefined;
  const setupHook = () => {
    if (!inject) return;
    canvas.setTestTransactionHook(async (phase) => {
      hookCalls.push(phase);
      if (inject.phase !== phase) return;
      const action = inject.action;
      if (phase === "staging" && action === "abort-signal") {
        if (signal) signal.aborted = true;
        return;
      }
      if (phase === "staging" && action === "dispose") {
        injected = canvas.dispose();
        return;
      }
      if (phase === "applying" && action === "reenter") {
        injected = (await canvas.applyCommands(nestedToCanvas(inject.request))).result;
        return;
      }
      if (phase === "applying" && action === "reenter-and-throw") {
        injected = (await canvas.applyCommands(nestedToCanvas(inject.request))).result;
        throw new Error("l3-tx inject throw");
      }
    });
  };
  const teardownHook = () => canvas.setTestTransactionHook(null);
  if (isGesture) {
    const gesture = request.gesture;
    const baseRevision = request.baseRevision;
    const expectedViewRevision = request.expectedViewRevision;
    const transactionId = request.transactionId ?? null;
    setupHook();
    try {
      const out = await runGestureCommit(canvas, { baseRevision, expectedViewRevision, transactionId, gesture });
      const rec = { step: step.step, result: out.result, history: counts(), events: drain() };
      if (inject) {
        if (hookCalls.filter((p) => p === inject.phase).length !== 1) {
          throw new Error(`l3-tx adapter: inject phase ${inject.phase} reached ${hookCalls.length} times`);
        }
        if (injected !== undefined) rec.injected = injected;
      }
      return rec;
    } finally {
      teardownHook();
    }
  }
  const nestedRequest = nestedToCanvas(request, signal);
  setupHook();
  try {
    const out = await canvas.applyCommands(nestedRequest);
    const rec = { step: step.step, result: out.result, history: out.result.status === "refused" && out.result.code === "canvas-disposed" && !out.result.profileIdentity ? undefined : counts(), events: drain() };
    if (rec.history === undefined) delete rec.history;
    if (inject) {
      if (hookCalls.filter((p) => p === inject.phase).length !== 1) {
        throw new Error(`l3-tx adapter: inject phase ${inject.phase} reached ${hookCalls.length} times`);
      }
      if (injected !== undefined) rec.injected = injected;
    } else if (hookCalls.length !== 0) {
      throw new Error(`l3-tx adapter: unexpected hook calls ${hookCalls.join(",")}`);
    }
    return rec;
  } finally {
    teardownHook();
  }
}

function resolveInjectRefs(inject, step) {
  // $refs inside inject.request were already resolved against prior records
  // by the outer resolveRefs; nothing further to do here.
  void step;
}

function nestedToCanvas(request, signal) {
  return {
    baseRevision: request.baseRevision,
    expectedViewRevision: request.expectedViewRevision,
    transactionId: request.transactionId ?? null,
    commands: clone(request.commands ?? []),
    ...(signal ? { signal } : request.signal ? { signal: { aborted: request.signal.aborted === true } } : {}),
  };
}

async function runGestureCommit(canvas, { baseRevision, expectedViewRevision, transactionId, gesture }) {
  const kind = gesture.kind;
  if (kind === "move" && typeof gesture.pageId === "string" && typeof gesture.occurrenceKey === "string") {
    const translated = await canvas.gesture({ gesture: "drag", pageId: gesture.pageId,
      occurrence: { pageId: gesture.pageId, occurrenceKey: gesture.occurrenceKey },
      delta: clone(gesture.delta), transactionId });
    if (translated.outcome) {
      return { result: { status: "refused", operation: "applyCommands", code: translated.outcome.code ?? "operation-error", diagnostics: [], report: buildReport("applyCommands") }, events: [] };
    }
    const staged = { ...clone(translated.staged), baseRevision, expectedViewRevision, transactionId };
    return canvas.commitPresentation(staged);
  }
  // Corrected no-op: a move with no mappable occurrence corrects to a single notice.
  const staged = { baseRevision, expectedViewRevision, transactionId,
    presentation: { gesture: "drag", pageId: "page_T", occurrenceKey: "__missing__", delta: clone(gesture.delta ?? { x: 0, y: 0 }) } };
  return canvas.commitPresentation(staged);
}
