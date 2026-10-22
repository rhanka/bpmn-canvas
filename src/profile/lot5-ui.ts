import type { Lot5Canvas } from "./lot5-canvas.js";
import { TreeIndex, type Rec } from "./lot5-support.js";

export interface NativeUiOptions {
  readonly locale?: string;
  readonly onOutcome?: (outcome: Rec) => void;
  readonly onDownload?: (context: Rec) => void;
  readonly gestureContext?: () => { transactionId: string; insertionKey?: string };
}
export interface NativeUiHandle {
  render(): void;
  perform(gesture: Rec): Promise<Rec>;
  dispose(): void;
}

/** Native DOM adapter. Every input goes through the session, including keyboard
 * and programmatic gestures. It keeps no semantic model or separate history. */
export function attachNativeProfileUi(host: HTMLElement, session: Lot5Canvas, options: NativeUiOptions = {}): NativeUiHandle {
  const doc = host.ownerDocument;
  const root = doc.createElement("section");
  root.className = "native-profile-canvas";
  root.tabIndex = 0;
  root.setAttribute("aria-label", "Diagram editor");
  host.append(root);
  let sequence = 0, busy = false, disposed = false;
  let suppressClick = false;
  let preview: { element: SVGElement; transform: string | null; kind: string; edge?: string;
    pageId: string; occurrenceKey: string; pointerId?: number; clientX: number; clientY: number;
    scaleX: number; scaleY: number; dx: number; dy: number; bounds: Rec; transactionId: string;
    semanticRevision: string; viewRevision: string } | undefined;
  let clipboard: Rec | undefined;
  const nextContext = () => {
    const fallback = `ui-${++sequence}`, injected = options.gestureContext?.();
    return { transactionId: injected?.transactionId ?? fallback, insertionKey: injected?.insertionKey ?? fallback };
  };
  const snapshot = () => session.getSnapshot().result.payload as Rec | undefined;
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const node = doc.createElement("button"); node.type = "button"; node.textContent = label;
    node.addEventListener("click", action); return node;
  };
  const outcome = (value: Rec): void => {
    const result = (value.result ?? value.outcome ?? value) as Rec;
    if (typeof result.code === "string") {
      root.querySelector("[data-native-diagnostic]")?.remove();
      const notice = doc.createElement("p"); notice.setAttribute("role", "alert");
      notice.setAttribute("data-native-diagnostic", result.code); notice.textContent = `Action refused: ${result.code}`;
      root.append(notice);
    }
    options.onOutcome?.(value);
  };
  const clearPreview = (): typeof preview => {
    const before = preview; preview = undefined;
    if (before) {
      if (before.transform === null) before.element.removeAttribute("transform");
      else before.element.setAttribute("transform", before.transform);
      if (before.pointerId !== undefined && before.element.hasPointerCapture?.(before.pointerId)) before.element.releasePointerCapture(before.pointerId);
    }
    return before;
  };
  const perform = async (gesture: Rec): Promise<Rec> => {
    if (disposed || busy) return { outcome: { staged: false, code: disposed ? "canvas-disposed" : "transaction-reentrant" } };
    busy = true;
    const baseRevision = session.currentRevision, expectedViewRevision = session.stateViewRevision();
    try {
      const translated = await session.gesture(gesture);
      if (translated.clipboard) clipboard = translated.clipboard;
      if (translated.outcome) {
        outcome(translated);
        const prompt = translated.outcome.prompt as Rec | undefined;
        if (prompt?.kind === "set-selection") {
          const choice = doc.createElement("select"); choice.setAttribute("aria-label", "Choose input set");
          const empty = doc.createElement("option"); empty.textContent = "Choose input set"; empty.value = ""; choice.append(empty);
          for (const id of prompt.candidates as string[]) {
            const option = doc.createElement("option"); option.value = id;
            const current = snapshot(); option.textContent = current ? semantic(current).get(id)?.node.name as string ?? id : id;
            choice.append(option);
          }
          choice.addEventListener("change", () => { if (choice.value) void perform({ ...gesture, choice: { value: choice.value } }); });
          root.append(choice); choice.focus();
        }
        return translated;
      }
      const staged = translated.staged!;
      const committed = staged.presentation ? await session.commitPresentation(staged) : await session.applyCommands({
        baseRevision, expectedViewRevision,
        transactionId: staged.transactionId as string, commands: staged.commands as Rec[] });
      const result = { ...translated, ...committed };
      render(); outcome(result); return result;
    } finally { busy = false; }
  };
  const entries = (surface: string, subject: string): Rec[] => {
    const result = session.listEntries({ baseRevision: session.currentRevision, surface, subject, locale: options.locale ?? "en" });
    return result.status === "ok" ? ((result.payload as Rec).groups as Rec[]).flatMap(group => group.entries as Rec[]) : [];
  };
  const semantic = (s: Rec): TreeIndex => new TreeIndex((s.envelope as Rec).tree as never);
  const ownerOf = (s: Rec, id: string): string => {
    const index = semantic(s), node = index.get(id);
    return node ? index.processOf(node)?.node.id as string ?? id : id;
  };
  const selection = (s: Rec): Rec[] => (s.presentation as Rec).selection as Rec[];
  const selectedIds = (s: Rec): string[] => {
    const geometry = ((s.presentation as Rec).layout as Rec).geometry as Rec[];
    return selection(s).map(p => geometry.find(g => g.pageId === p.pageId && g.occurrenceKey === p.occurrenceKey)?.semanticId as string).filter(Boolean);
  };
  const runEntry = async (entry: Rec, s: Rec, target: string, value = ""): Promise<void> => {
    const definition = session.profileView.entryById.get(entry.id as string)!;
    const transaction = nextContext(), insertionKey = transaction.insertionKey, context: Rec = {};
    const values: Rec = { owner: ownerOf(s, target), source: target, target, key: insertionKey, value };
    const subject = definition.surface === "palette" || definition.surface === "paste" ? "owner"
      : definition.surface === "append" || definition.surface === "connect" ? "source" : "target";
    context[subject] = values[subject];
    for (const binding of definition.parameters as Rec[]) context[binding.source as string] = values[binding.source as string];
    const result = await session.applyCommands({ baseRevision: session.currentRevision, expectedViewRevision: session.stateViewRevision(),
      transactionId: transaction.transactionId, commands: [{ command: "surface", entry: entry.id, context }] });
    render(); outcome(result);
  };

  function render(): void {
    if (disposed) return;
    const s = snapshot(); root.replaceChildren();
    if (!s) return;
    const presentation = s.presentation as Rec, layout = presentation.layout as Rec;
    const pages = layout.pages as Rec[], active = presentation.activePageId as string;
    const page = pages.find(p => p.pageId === active);
    const navigation = doc.createElement("nav"); navigation.setAttribute("aria-label", "Diagram pages");
    for (const p of pages) {
      const tab = button(p.name as string, () => { session.select(p.pageId as string, []); render(); });
      tab.setAttribute("aria-current", String(p.pageId === active)); navigation.append(tab);
    }
    root.append(navigation);
    if (!page) return;
    const owner = page.semanticRootId as string;
    if (!session.isReadOnly()) {
      const palette = doc.createElement("aside"); palette.setAttribute("aria-label", "Palette");
      for (const entry of entries("palette", owner)) {
        const control = button((entry.label as Rec).text as string, () => {
          const transaction = nextContext(); void perform({ gesture: "palette-drop", entry: entry.id, container: owner,
            pageId: active, point: { x: 0, y: 0 }, ...transaction });
        });
        control.dataset.entry = entry.id as string;
        control.draggable = true;
        control.addEventListener("dragstart", event => event.dataTransfer?.setData("text/plain", entry.id as string));
        palette.append(control);
      }
      root.append(palette);
    }
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", page.name as string);
    const bounds = page.bounds as Rec;
    svg.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    svg.style.width = "100%"; svg.style.minHeight = "300px";
    const rendered = session.renderData();
    if (rendered.status !== "ok") {
      const notice = doc.createElement("p"); notice.setAttribute("role", "status"); notice.textContent = `Rendering refused: ${rendered.code}`;
      root.append(notice); return;
    }
    const records = (rendered.payload as Rec).occurrences as Rec[];
    const index = semantic(s);
    for (const geometry of records.filter(g => g.pageId === active)) {
      const group = doc.createElementNS(svg.namespaceURI, "g") as SVGGElement;
      group.dataset.occurrence = geometry.occurrenceKey as string;
      group.dataset.semanticId = geometry.semanticId as string;
      const style = new Map(((geometry.style ?? []) as Rec[]).map(t => [t.name, t.value]));
      const b = geometry.bounds as Rec;
      const edge = Array.isArray(geometry.waypoints);
      const native = index.get(geometry.semanticId as string)?.node.$type;
      const round = native === "bpmn:StartEvent" || native === "bpmn:EndEvent";
      const gateway = native?.endsWith("Gateway");
      const primitive = doc.createElementNS(svg.namespaceURI, edge ? "polyline" : round ? "ellipse" : gateway ? "polygon" : "rect");
      if (edge) primitive.setAttribute("points", (geometry.waypoints as Rec[]).map(p => `${p.x},${p.y}`).join(" "));
      else if (round) {
        primitive.setAttribute("cx", String(Number(b.x) + Number(b.width) / 2)); primitive.setAttribute("cy", String(Number(b.y) + Number(b.height) / 2));
        primitive.setAttribute("rx", String(Number(b.width) / 2)); primitive.setAttribute("ry", String(Number(b.height) / 2));
      } else if (gateway) {
        const x = Number(b.x), y = Number(b.y), w = Number(b.width), h = Number(b.height);
        primitive.setAttribute("points", `${x + w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}`);
      }
      else for (const field of ["x", "y", "width", "height"]) primitive.setAttribute(field, String(b[field]));
      primitive.setAttribute("fill", edge ? "none" : String(style.get("fill") ?? "#ffffff"));
      primitive.setAttribute("stroke", String(style.get("stroke") ?? "#334155"));
      primitive.setAttribute("stroke-width", String(style.get("strokeWidth") ?? 1000));
      primitive.setAttribute("data-base-stroke-width", primitive.getAttribute("stroke-width")!);
      if (selection(s).some(p => p.pageId === active && p.occurrenceKey === geometry.occurrenceKey)) primitive.setAttribute("stroke-width", "4000");
      group.append(primitive);
      const node = index.get(geometry.semanticId as string)?.node as Rec | undefined;
      const text = doc.createElementNS(svg.namespaceURI, "text") as SVGTextElement;
      const labelBounds = (geometry.label as Rec | undefined)?.bounds as Rec | undefined ?? b;
      text.setAttribute("x", String(Number(labelBounds.x) + 4000)); text.setAttribute("y", String(Number(labelBounds.y) + 16000));
      text.setAttribute("font-size", "12000"); text.setAttribute("fill", String(style.get("textColor") ?? "#0f172a"));
      text.textContent = (geometry.label as Rec | undefined)?.text as string ?? node?.name as string ?? "";
      group.append(text);
      group.addEventListener("click", event => {
        if (suppressClick) { event.preventDefault(); suppressClick = false; return; }
        const pair = { pageId: active, occurrenceKey: geometry.occurrenceKey };
        const current = snapshot() ?? s;
        const selected = event.ctrlKey || event.metaKey ? [...selection(current).filter(p => p.occurrenceKey !== pair.occurrenceKey || p.pageId !== active), pair] : [pair];
        session.select(active, selected);
        for (const peer of root.querySelectorAll<SVGGElement>("g[data-occurrence]")) {
          const body = peer.firstElementChild;
          body?.setAttribute("stroke-width", selected.some(p => p.pageId === active && p.occurrenceKey === peer.dataset.occurrence) ? "4000" : body.getAttribute("data-base-stroke-width") ?? "1000");
        }
        renderContext(snapshot()!);
      });
      if (!session.isReadOnly()) group.addEventListener("dblclick", () => {
        if (edge) return;
        const direct = entries("direct-edit", geometry.semanticId as string)[0];
        if (!direct) return;
        const input = doc.createElement("input"); input.setAttribute("aria-label", "Edit label");
        const listed = session.listFields({ baseRevision: session.currentRevision, targetId: geometry.semanticId as string, locale: options.locale ?? "en" });
        const command = session.profileView.entryById.get(direct.id as string)?.recipe;
        const field = ((listed.payload as Rec | undefined)?.fields as Rec[] | undefined)?.find(f =>
          ((session.profileView.notionById.get(f.notion as string)?.fields ?? []) as Rec[]).some(d => d.id === f.field && d.command === command));
        input.value = typeof field?.display === "string" ? field.display : node?.name as string ?? "";
        root.append(input); input.focus();
        input.addEventListener("keydown", event => {
          if (event.key === "Escape") { input.remove(); root.focus(); }
          if (event.key === "Enter") void perform({ gesture: "direct-edit", occurrence: { pageId: active, occurrenceKey: geometry.occurrenceKey }, text: input.value, transactionId: nextContext().transactionId });
        });
      });
      if (!session.isReadOnly()) {
        if (!edge) for (const side of ["east", "south-east"]) {
          const resize = doc.createElementNS(svg.namespaceURI, "rect");
          resize.setAttribute("data-resize", side); resize.setAttribute("width", "6000"); resize.setAttribute("height", "6000");
          resize.setAttribute("x", String(Number(b.x) + Number(b.width) - 3000));
          resize.setAttribute("y", String(Number(b.y) + (side === "east" ? Number(b.height) / 2 : Number(b.height)) - 3000));
          resize.setAttribute("fill", "#64748b"); group.append(resize);
        }
        group.addEventListener("pointerdown", event => {
          if (event.button !== 0 || busy || edge) return;
          const hit = event.target as SVGElement;
          const side = hit.getAttribute("data-resize");
          const original = (layout.geometry as Rec[]).find(g => g.pageId === active && g.occurrenceKey === geometry.occurrenceKey);
          const kind = side ? "resize" : hit.localName === "text" && original?.label ? "label-move" : "drag";
          const box = svg.getBoundingClientRect();
          preview = { element: kind === "label-move" ? text : group, transform: null, kind,
            ...(side ? { edge: side } : {}), pageId: active, occurrenceKey: geometry.occurrenceKey as string,
            ...(Number.isInteger(event.pointerId) ? { pointerId: event.pointerId } : {}),
            clientX: event.clientX, clientY: event.clientY,
            scaleX: box.width ? Number(bounds.width) / box.width : 1000,
            scaleY: box.height ? Number(bounds.height) / box.height : 1000,
            dx: 0, dy: 0, bounds: b, transactionId: nextContext().transactionId,
            semanticRevision: session.currentRevision, viewRevision: session.stateViewRevision() };
          preview.transform = preview.element.getAttribute("transform");
          if (preview.pointerId !== undefined) preview.element.setPointerCapture?.(preview.pointerId);
          root.focus(); event.preventDefault();
        });
        if (edge) group.addEventListener("dblclick", event => {
          const box = svg.getBoundingClientRect(), transaction = nextContext();
          void perform({ gesture: "bendpoint-add", occurrence: { pageId: active, occurrenceKey: geometry.occurrenceKey },
            point: { x: Math.round(Number(bounds.x) + (event.clientX - box.left) * (box.width ? Number(bounds.width) / box.width : 1000)),
              y: Math.round(Number(bounds.y) + (event.clientY - box.top) * (box.height ? Number(bounds.height) / box.height : 1000)) }, transactionId: transaction.transactionId });
        });
      }
      svg.append(group);
    }
    svg.addEventListener("dragover", event => event.preventDefault());
    svg.addEventListener("drop", event => {
      event.preventDefault(); if (session.isReadOnly()) return;
      const entry = event.dataTransfer?.getData("text/plain"); if (!entry) return;
      const transaction = nextContext(); void perform({ gesture: "palette-drop", entry, container: owner, pageId: active,
        ...transaction, point: { x: Math.round(event.offsetX * 1000), y: Math.round(event.offsetY * 1000) } });
    });
    root.append(svg);
    renderContext(s);
  }
  function renderContext(s: Rec): void {
    root.querySelector("menu[data-native-context]")?.remove();
    const active = (s.presentation as Rec).activePageId;
    const ids = selectedIds(s);
    if (!session.isReadOnly()) {
      const controls = doc.createElement("menu"); controls.setAttribute("aria-label", "Context actions");
      controls.setAttribute("data-native-context", "");
      if (ids.length === 1) for (const surface of ["context", "append", "replace", "delete"]) {
        for (const entry of entries(surface, ids[0]!)) {
          const control = button((entry.label as Rec).text as string, () => { void runEntry(entry, s, ids[0]!); });
          control.dataset.entry = entry.id as string; controls.append(control);
        }
      }
      if (ids.length === 2) controls.append(button("Connect selection", () => {
        const transaction = nextContext(); void perform({ gesture: "connect", source: { pageId: active, semanticId: ids[0] },
          target: { pageId: active, semanticId: ids[1] }, ...transaction });
      }));
      for (const action of ["undo", "redo"] as const) controls.append(button(action, () => {
        const result = session.restore(action, { expectedRevision: session.currentRevision, expectedViewRevision: session.stateViewRevision() }); render(); outcome(result);
      }));
      root.append(controls);
    }
  }
  const keyboard = (event: KeyboardEvent): void => {
    if (preview && event.key === "Escape") {
      event.preventDefault(); const before = clearPreview()!;
      void perform({ gesture: before.kind, cancel: "escape-before-drop", transactionId: before.transactionId }); return;
    }
    if ((event.target as HTMLElement).matches("input, textarea, select")) return;
    const s = snapshot(); if (!s) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && (event.key === "c" || event.key === "C")) {
      event.preventDefault(); const result = session.copy({ baseRevision: session.currentRevision, elementIds: selectedIds(s) });
      if (result.status === "ok") clipboard = result.payload as Rec;
      outcome({ result }); return;
    }
    if (session.isReadOnly()) return;
    if (mod && (event.key === "z" || event.key === "Z" || event.key === "y" || event.key === "Y")) {
      if (busy) return;
      event.preventDefault(); const redo = event.shiftKey || event.key === "y" || event.key === "Y";
      const result = session.restore(redo ? "redo" : "undo", { expectedRevision: session.currentRevision, expectedViewRevision: session.stateViewRevision() }); render(); outcome(result); return;
    }
    const action = mod && (event.key === "x" || event.key === "X") ? "Ctrl+X"
      : mod && (event.key === "v" || event.key === "V") ? "Ctrl+V" : event.key;
    if (!["Delete", "Backspace", "Ctrl+X", "Ctrl+V"].includes(action)) return;
    event.preventDefault(); const transaction = nextContext();
    const presentation = s.presentation as Rec;
    const page = ((presentation.layout as Rec).pages as Rec[]).find(p => p.pageId === presentation.activePageId);
    void perform({ gesture: "keyboard", key: action, selection: selection(s), fragment: clipboard,
      container: page?.semanticRootId, ...transaction });
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!preview) return;
    preview.dx = Math.round((event.clientX - preview.clientX) * preview.scaleX);
    preview.dy = Math.round((event.clientY - preview.clientY) * preview.scaleY);
    if (preview.kind === "resize") {
      preview.dx = Math.max(1000 - Number(preview.bounds.width), preview.dx);
      preview.dy = preview.edge === "east" ? 0 : Math.max(1000 - Number(preview.bounds.height), preview.dy);
      const b = preview.bounds;
      preview.element.setAttribute("transform", `translate(${b.x} ${b.y}) scale(${(Number(b.width) + preview.dx) / Number(b.width)} ${(Number(b.height) + preview.dy) / Number(b.height)}) translate(${-Number(b.x)} ${-Number(b.y)})`);
    } else preview.element.setAttribute("transform", `translate(${preview.dx} ${preview.dy})`);
  };
  const pointerUp = (): void => {
    const before = clearPreview(); if (!before || before.dx === 0 && before.dy === 0) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (before.semanticRevision !== session.currentRevision || before.viewRevision !== session.stateViewRevision()) {
      outcome({ outcome: { staged: false, code: "operation-error" } }); return;
    }
    void perform({ gesture: before.kind, occurrence: { pageId: before.pageId, occurrenceKey: before.occurrenceKey },
      delta: { x: before.dx, y: before.dy }, ...(before.edge ? { edge: before.edge } : {}), transactionId: before.transactionId });
  };
  const pointerCancel = (): void => {
    const before = clearPreview(); if (before) void perform({ gesture: before.kind, cancel: "pointer-cancel", transactionId: before.transactionId });
  };
  root.addEventListener("keydown", keyboard);
  root.addEventListener("pointermove", pointerMove);
  root.addEventListener("pointerup", pointerUp);
  root.addEventListener("pointercancel", pointerCancel);
  render();
  return { render, perform, dispose() {
    disposed = true; clearPreview(); root.removeEventListener("keydown", keyboard);
    root.removeEventListener("pointermove", pointerMove); root.removeEventListener("pointerup", pointerUp);
    root.removeEventListener("pointercancel", pointerCancel); root.remove();
  } };
}
