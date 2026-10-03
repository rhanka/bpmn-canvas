// Live demo: the complete canvas (BpmnWorkshop, multi-tab) inside an app, next to a chat built with assistant-ui.
// The assistant is simulated: no model, no network. It answers from a few scripted intents and drives the canvas
// the way a real agent would (diagram drafts as tool calls with a preview card, auto-layout, look switch).
import { createElement as h, useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, AuiConfig, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, Tools, useLocalRuntime } from "@assistant-ui/react";
import { BpmnWorkshop } from "../../dist/react/index.js";
import { createBpmnToolkit } from "../../dist/assistant-ui/index.js";
import onboarding from "./C.4.0.bpmn";
import customer from "./C.5.0.bpmn";
import reference from "./B.1.0.bpmn";
import { DEMO_TOKENS } from "./palette.mjs";

const MODELS = {
  onboarding: { title: "Employee onboarding", xml: onboarding, tabs: 4, source: "C.4.0" },
  customer: { title: "New customer", xml: customer, tabs: 2, source: "C.5.0" },
  reference: { title: "Notation reference", xml: reference, tabs: 1, source: "B.1.0" },
};

const FORMATS = [
  { id: "custom", label: "Custom", profile: "legend" },
  { id: "bpmn", label: "BPMN", profile: "colored", tokens: DEMO_TOKENS },
];

const SUGGESTIONS = [
  "Draw an employee onboarding process",
  "Show a new customer process",
  "Arrange the diagram",
  "Switch to the BPMN look",
];

const HELP =
  "I am a simulated assistant: no model runs here. Ask me to draw an employee onboarding process (4 diagrams, " +
  "one tab each), a new customer process (2 diagrams) or the notation reference (sub-processes, call activities). " +
  "I can also arrange the open diagram or switch between the Custom and BPMN looks. Everything else is in the canvas: " +
  "edit, undo, tabs, zoom, export.";

const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
});

function intentOf(text) {
  const t = text.toLowerCase();
  if (/onboard|employ|hire|intégr|embauch/.test(t)) return { kind: "draw", model: "onboarding" };
  if (/customer|client|bank|banque|kyc/.test(t)) return { kind: "draw", model: "customer" };
  if (/reference|référence|sub-?process|sous-processus|notation|call activit/.test(t)) return { kind: "draw", model: "reference" };
  if (/arrange|layout|tidy|mise en page|range|organis/.test(t)) return { kind: "layout" };
  if (/bpmn look|look bpmn|vue bpmn|bpmn view|standard look|notation look/.test(t)) return { kind: "look", format: "bpmn" };
  if (/custom/.test(t)) return { kind: "look", format: "custom" };
  return { kind: "help" };
}

let callSeq = 0;

/** The simulated model: streams a short answer, then emits a tool call or acts on the canvas. */
function simulatedModel(app) {
  return {
    async *run({ messages, abortSignal }) {
      const last = messages[messages.length - 1];
      const text = (last?.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join(" ");
      const intent = intentOf(text);
      const say = async function* (sentence, extra = []) {
        let out = "";
        for (const word of sentence.split(/(\s+)/)) {
          if (abortSignal?.aborted) return;
          out += word;
          await sleep(18, abortSignal);
          yield { content: [{ type: "text", text: out }, ...extra] };
        }
      };
      if (intent.kind === "draw") {
        const m = MODELS[intent.model];
        const intro = `Here is a draft of "${m.title}"${m.tabs > 1 ? `, with ${m.tabs} diagrams (one tab each)` : ""}. Open it in the canvas to edit it.`;
        yield* say(intro);
        const call = { type: "tool-call", toolCallId: `draw-${++callSeq}`, toolName: "draw_process", args: { model: intent.model }, argsText: JSON.stringify({ model: intent.model }) };
        yield { content: [{ type: "text", text: intro }, call] };
        await sleep(700, abortSignal);
        yield { content: [{ type: "text", text: intro }, { ...call, result: { model: intent.model, diagrams: m.tabs } }] };
        return;
      }
      if (intent.kind === "layout") {
        const result = await app.layout();
        yield* say(result === null ? "Open a diagram first." : `Arranged: ${result.changed} element(s) moved${result.skipped.length ? `, ${result.skipped.length} left in place` : ""}. One undo (Ctrl+Z) restores the previous layout.`);
        return;
      }
      if (intent.kind === "look") {
        app.setFormat(intent.format);
        yield* say(intent.format === "bpmn" ? "Switched to the BPMN look: the standard notation, recoloured." : "Switched to the Custom look.");
        return;
      }
      yield* say(HELP);
    },
  };
}

const Text = ({ text }) => h("p", null, text);
const UserMessage = () => h(MessagePrimitive.Root, { className: "msg user" }, h(MessagePrimitive.Parts, { components: { Text } }));
const AssistantMessage = () => h(MessagePrimitive.Root, { className: "msg assistant" }, h(MessagePrimitive.Parts, { components: { Text } }));

function Chat({ app }) {
  const model = useMemo(() => simulatedModel(app), [app]);
  const runtime = useLocalRuntime(model);
  const toolkit = useMemo(() => createBpmnToolkit({
    toolNames: ["draw_process"],
    resolveArtifact: (part) => {
      const key = part.args?.model;
      const m = MODELS[key];
      return m ? { documentId: key, revision: "1", xml: m.xml, title: m.title } : null;
    },
    onOpen: (artifact) => app.open(artifact.documentId),
    labels: { running: "Drawing…", open: "Open in the canvas" },
  }), [app]);
  const config = useMemo(() => AuiConfig({ tools: Tools({ toolkit }) }), [toolkit]);
  const ask = (text) => runtime.thread.append({ role: "user", content: [{ type: "text", text }] });
  return h(AssistantRuntimeProvider, { runtime, config },
    h(ThreadPrimitive.Root, { className: "thread" },
      h(ThreadPrimitive.Viewport, { className: "viewport" },
        h(ThreadPrimitive.Empty, null,
          h("div", { className: "welcome" },
            h("p", null, "Simulated assistant (no model, no network). Try:"),
            h("div", { className: "suggestions" }, ...SUGGESTIONS.map((s) => h("button", { key: s, type: "button", onClick: () => ask(s) }, s))))),
        h(ThreadPrimitive.Messages, { components: { UserMessage, AssistantMessage } })),
      h(ComposerPrimitive.Root, { className: "composer" },
        h(ComposerPrimitive.Input, { className: "composer-input", placeholder: "Ask the simulated assistant…", "aria-label": "Message" }),
        h(ComposerPrimitive.Send, { className: "composer-send" }, "Send"))));
}

function App() {
  const workshop = useRef(null);
  const [doc, setDoc] = useState({ key: "onboarding", xml: MODELS.onboarding.xml, revision: undefined });
  const [format, setFormat] = useState("custom");
  const app = useMemo(() => ({
    open: (key) => { const m = MODELS[key]; if (m) setDoc({ key, xml: m.xml, revision: undefined }); },
    layout: async () => { const c = workshop.current?.canvas; return c ? c.autoLayout() : null; },
    setFormat: (id) => setFormat(id),
  }), []);
  const onXmlChange = useCallback((xml, change) => setDoc((d) => ({ ...d, xml, revision: change.revision })), []);
  return h("div", { className: "app" },
    h("aside", { className: "chat", "aria-label": "Assistant" }, h(Chat, { app })),
    h("main", { className: "canvas", "aria-label": "Diagram" },
      h(BpmnWorkshop, {
        ref: workshop,
        xml: doc.xml,
        revision: doc.revision,
        formats: FORMATS,
        format,
        onFormatChange: setFormat,
        onXmlChange,
        fitMode: "whole",
        wheel: "zoom-cursor",
        testId: "demo-workshop",
      })));
}

createRoot(document.getElementById("app")).render(h(App));
