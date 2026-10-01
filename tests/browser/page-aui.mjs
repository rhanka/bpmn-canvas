import { StrictMode, createElement as h, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  MessagePrimitive,
  ThreadPrimitive,
  Tools,
  useLocalRuntime,
} from "@assistant-ui/react";
import { createBpmnToolkit } from "../../dist/assistant-ui/index.js";

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? null });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = fn(); if (v) return v; } catch {}
    await sleep(25);
  }
  return fn();
};
const mountPoint = () => {
  const el = document.createElement("div");
  document.getElementById("app").appendChild(el);
  return el;
};
const gate = () => {
  let open;
  const promise = new Promise((r) => (open = r));
  return { promise, open };
};

// Real assistant-ui chain: useLocalRuntime(chatModelAdapter) -> AssistantRuntimeProvider(config: AuiConfig({tools: Tools({toolkit})}))
// -> ThreadPrimitive.Messages -> MessagePrimitive.Parts (tool-call parts are rendered by the registered toolkit entry).
function Message() {
  return h("div", { "data-msg": "" }, h(MessagePrimitive.Parts, { components: { Text: () => null } }));
}

function Chat({ chatModel, toolkit, onRuntime }) {
  const runtime = useLocalRuntime(chatModel);
  const config = useMemo(() => AuiConfig({ tools: Tools({ toolkit }) }), [toolkit]);
  useEffect(() => { onRuntime(runtime); }, [runtime, onRuntime]);
  return h(
    AssistantRuntimeProvider,
    { runtime, config },
    h(ThreadPrimitive.Root, null, h(ThreadPrimitive.Messages, null, () => h(Message))),
  );
}

function mountChat({ chatModel, resolveArtifact, onOpen, strict = false }) {
  const el = mountPoint();
  const root = createRoot(el);
  const toolkit = createBpmnToolkit({ toolNames: ["draw_process"], resolveArtifact, onOpen });
  let runtime;
  const node = h(Chat, { chatModel, toolkit, onRuntime: (r) => { runtime = r; } });
  root.render(strict ? h(StrictMode, null, node) : node);
  return {
    el,
    root,
    switchNewThread: async () => { await runtime.threads.switchToNewThread(); },
    send: async (text = "draw") => {
      await waitFor(() => runtime);
      runtime.thread.append({ role: "user", content: [{ type: "text", text }] });
    },
  };
}

const toolPart = (id, extra = {}) => ({ type: "tool-call", toolCallId: id, toolName: "draw_process", args: { name: id }, argsText: JSON.stringify({ name: id }), ...extra });

window.runAui = async ({ corpus }) => {
  results.length = 0;

  // (1) + (2): running -> completed, preview matches the resolver's documentId, Open calls onOpen once and starts no run.
  {
    const g = gate();
    let runs = 0;
    const adapter = {
      async *run() {
        runs++;
        yield { content: [toolPart("call-1")] };
        await g.promise;
        yield { content: [toolPart("call-1", { result: { ok: true } })] };
      },
    };
    const resolved = [];
    const opened = [];
    const resolveArtifact = async (part) => {
      resolved.push(part.toolCallId);
      return { documentId: "doc-" + part.toolCallId, revision: "1", xml: corpus.ce4, title: "Doc " + part.toolCallId };
    };
    const c = mountChat({ chatModel: adapter, resolveArtifact, onOpen: (a) => opened.push(a) });
    await c.send();
    const running = await waitFor(() => c.el.querySelector('[data-bpmn-tool-card][data-state="running"] [role="status"]'));
    check("(1) real tool-call part shows the running status while the call has no result", !!running);
    check("(1) the resolver is not called while running", resolved.length === 0, resolved);
    g.open();
    const img = await waitFor(() => c.el.querySelector('[data-bpmn-tool-card][data-state="complete"] img'), 30000);
    check("(1) completed part renders a data: image preview", !!img && img.src.startsWith("data:image/svg+xml"), img?.src?.slice(0, 40));
    check("(1) the preview belongs to the document the resolver returned", img?.alt === "Doc call-1" && resolved.join() === "call-1", { alt: img?.alt, resolved });
    const runsBefore = runs;
    await sleep(300);
    const runsSettled = runs;
    c.el.querySelector("button").click();
    await sleep(500);
    check("(2) Open calls onOpen once with the artifact", opened.length === 1 && opened[0].documentId === "doc-call-1", opened.map((a) => a.documentId));
    check("(2) clicking Open starts no new run", runs === runsSettled, { runsBefore, runsSettled, runsAfterClick: runs });
    window.__runInfo = { runsBefore, runsSettled, runsAfterClick: runs };
    c.root.unmount();
  }

  // (3) failed tool call and incomplete message: failed state, resolver never called.
  {
    let resolveCalls = 0;
    const resolveArtifact = async () => { resolveCalls++; return null; };
    const failing = { async *run() { yield { content: [toolPart("bad", { result: "boom", isError: true })] }; } };
    const c = mountChat({ chatModel: failing, resolveArtifact });
    await c.send();
    const failed = await waitFor(() => c.el.querySelector('[data-bpmn-tool-card][data-state="failed"] [role="alert"]'));
    check("(3) isError tool call shows the failed state", !!failed);
    await sleep(300);
    check("(3) the resolver is never called for a failed call", resolveCalls === 0, resolveCalls);
    c.root.unmount();

    const incomplete = { async *run() { yield { content: [toolPart("cut")], status: { type: "incomplete", reason: "error", error: "x" } }; } };
    const c2 = mountChat({ chatModel: incomplete, resolveArtifact });
    await c2.send();
    const failed2 = await waitFor(() => c2.el.querySelector('[data-bpmn-tool-card][data-state="failed"] [role="alert"]'));
    check("(3) incomplete message status shows the failed state", !!failed2, c2.el.innerHTML.slice(0, 200));
    await sleep(300);
    check("(3) the resolver is never called for an incomplete call", resolveCalls === 0, resolveCalls);
    c2.root.unmount();
  }

  // (4) stale resolution dropped on unmount and on a new thread/message list.
  {
    const slow = gate();
    let resolvedLate = 0;
    const adapter = { async *run() { yield { content: [toolPart("late", { result: { ok: true } })] }; } };
    const resolveArtifact = async (part) => {
      await slow.promise;
      resolvedLate++;
      return { documentId: "OLD", revision: "1", xml: corpus.ce4, title: "OLD" };
    };
    const c = mountChat({ chatModel: adapter, resolveArtifact });
    await c.send();
    await waitFor(() => c.el.querySelector('[data-bpmn-tool-card][data-state="complete"] [role="status"]'));
    c.root.unmount();
    slow.open();
    await sleep(800);
    check("(4) unmount while pending: the late resolution produces no preview anywhere", resolvedLate === 1 && document.querySelectorAll("img[alt='OLD']").length === 0);

    // New message list: runtime switches to a fresh thread while the first resolution is pending.
    const slow2 = gate();
    const resolve2 = async (part) => {
      if (part.toolCallId === "first") await slow2.promise;
      return { documentId: part.toolCallId, revision: "1", xml: corpus.ce4, title: part.toolCallId };
    };
    let n = 0;
    const adapter2 = { async *run() { n++; yield { content: [toolPart(n === 1 ? "first" : "second", { result: { ok: true } })] }; } };
    const c2 = mountChat({ chatModel: adapter2, resolveArtifact: resolve2 });
    await c2.send("one");
    await waitFor(() => c2.el.querySelector('[data-bpmn-tool-card="first"]'));
    check("(4) first part is mounted and pending", true);
    await c2.switchNewThread();
    await sleep(100);
    check("(4) the real runtime switched to an empty thread: the old card is unmounted", c2.el.querySelectorAll("[data-bpmn-tool-card]").length === 0, c2.el.innerHTML.slice(0, 120));
    slow2.open();
    await sleep(800);
    check("(4) the stale first resolution produces no preview after the thread switch", document.querySelectorAll("img[alt='first']").length === 0);
    await c2.send("two");
    const img2 = await waitFor(() => c2.el.querySelector("img[alt='second']"), 30000);
    check("(4) the new thread renders its own part normally", !!img2);
    c2.root.unmount();
  }

  // (5) five completed diagram parts in one thread.
  {
    let runs = 0;
    const adapter = {
      async *run() {
        runs++;
        if (runs > 1) return;
        yield { content: ["a", "b", "c", "d", "e"].map((k) => toolPart("p-" + k, { result: { ok: true } })) };
      },
    };
    const resolveArtifact = async (part) => ({ documentId: part.toolCallId, revision: "1", xml: corpus.ce4, title: part.toolCallId });
    const c = mountChat({ chatModel: adapter, resolveArtifact });
    await c.send();
    await waitFor(() => c.el.querySelectorAll("img").length === 5, 40000);
    check("(5) five completed parts give five static previews", c.el.querySelectorAll("img").length === 5, c.el.querySelectorAll("img").length);
    check("(5) zero .djs-container and zero inline svg in the thread", document.querySelectorAll(".djs-container").length === 0 && c.el.querySelectorAll("svg").length === 0);
    c.root.unmount();
  }

  results.push({ name: "info: run counts", pass: true, detail: window.__runInfo });
  return results;
};
window.__ready = true;
