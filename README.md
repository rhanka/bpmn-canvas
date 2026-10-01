# @sentropic/bpmn-canvas

Provisional name. A BPMN 2.0 editing canvas built on [bpmn-js](https://github.com/bpmn-io/bpmn-js):
framework-independent core, optional React and assistant-ui adapters.

Status: pre-release, not published. The API below is implemented and tested but not frozen.

```ts
import { createBpmnCanvas } from "@sentropic/bpmn-canvas";

const canvas = createBpmnCanvas(document.getElementById("host")!, {
  xml,
  onChange: ({ revision, cause }) => { /* signal only: pull with getXml() */ },
  onDiagnostic: (d) => console.warn(d.code, d.ids),
});
await canvas.ready;               // never rejects
const saved = await canvas.getXml();
canvas.destroy();                 // valid in every state, idempotent
```

The BPMN XML is authoritative. The canvas never generates DI, never lays out on import, and
never calls the network.

## Entry points

| Import | Content |
|---|---|
| `@sentropic/bpmn-canvas` | `createBpmnCanvas`, `renderDiagrams`, `analyzeXml`. Importable without a DOM; the engine loads when a canvas or render is created. |
| `@sentropic/bpmn-canvas/react` | `<BpmnCanvas>`. Optional peer: `react` 19 (qualified with 19.3.0). |
| `@sentropic/bpmn-canvas/assistant-ui` | `createBpmnToolkit`, `BpmnToolCard`. Structural coupling only: no import of `@assistant-ui/react`. Checked against 0.15.22. |
| `@sentropic/bpmn-canvas/styles.css` | The same CSS the canvas installs itself, for `styles: "external"` hosts. |

## Contract

- **Handle.** `createBpmnCanvas` returns synchronously. `ready` resolves after the first load
  attempt whatever its outcome. `state` is `loading | ready | error | destroyed`.
- **Superseded work.** A `setXml`, `selectDiagram` or `autoLayout` that is superseded or pending at
  `destroy()` rejects with an `AbortError`. A later `setXml` supersedes every earlier operation; a later
  `selectDiagram` supersedes earlier ones. Operations otherwise run in order.
- **Exact bytes.** While no command has run since the last `setXml`, `getXml()` returns the input
  bytes. After any command, even an undo back to the base, it returns the serialiser output.
- **Revisions.** `onChange` carries `revision` (local content token) and `baseRevision` (the host
  revision of the last `setXml`). Re-sending an emitted or applied revision to `setXml` is an echo and is
  ignored, so undo and camera survive a host round trip. `diagram-switch` changes no content revision.
- **Diagram switch.** `selectDiagram` is the native bpmn-js `open()` on one imported document. It
  clears the undo stack: there is no undo across a diagram switch.
- **Read-only.** Enforced by veto at this instance's command stack, with direct editing cancelled and
  palette and context pad hidden. Zoom, scroll and diagram switch keep working.
- **Isolation.** No prototype patch, no storage, no global, no fixed DOM or SVG id. Each instance
  prefixes what it creates. Styles install once per root node; the font is declared at document level.
- **Wheel.** `wheel: "page-scroll"` lets the page scroll and zooms on Ctrl/Meta + wheel only.

## Supported inputs

| Input | Behavior |
|---|---|
| Valid BPMN with full DI | Editable. |
| Several diagrams, repeated names, several pools, message flows, shared root elements, collapsed sub-process with its own plane | Editable. Whole document, native `open()`; nothing is sliced or merged. |
| Extension attributes and `extensionElements` content | Preserved. |
| Element outside `extensionElements` that bpmn-moddle cannot read (`unparsable-content`), reference to a missing id (`unresolved-reference`), duplicate id (`duplicate-id`), XML comment (`comments-present`) | **Read-only by default**, with a diagnostic naming the ids. Saving would drop that content. `allowLossyEdit: true` overrides. |
| No `BPMNDiagram` | State `error`, diagnostic `missing-di` with the undrawn ids. DI is not generated. `getXml()` returns the input. |
| Some elements without shape or edge | Editable, diagnostic `partial-di` with the ids. |
| `ioSpecification` without `inputSet`/`outputSet` | Editable, diagnostic `incomplete-io-specification`. It is invalid against the OMG schema and is reported, never fixed silently. |
| Malformed XML | `invalid-xml`. An initial one leaves the handle in `error`; a later `setXml` returns `{applied:false, reason:"invalid"}` and keeps the last good document. |

Diagnostic codes: `invalid-xml`, `import-failed`, `import-warning`, `unresolved-reference`,
`unparsable-content`, `duplicate-id`, `comments-present`, `missing-di`, `partial-di`,
`incomplete-io-specification`, `filtered-small`, `render-failed`, `layout-unsupported`,
`layout-failed`, `read-only-lossy`, `save-failed`.

## Profiles

`profile: "standard"` (default) is upstream bpmn-js: its renderer, palette and context pad, so every
BPMN element is drawn with standard notation. `profile: "legend"` is an opt-in look (rounded task
boxes, `[App]`/`[Doc]` annotations, a legend palette) that draws only the shapes it can draw
faithfully; everything else falls through to the upstream renderer.

## Layout

`autoLayout()` re-positions existing DI in one undo step and returns `{ changed, skipped }`. Boundary
events, data stores, groups and pools without `processRef` are listed in `skipped`, not moved.
Never runs implicitly.

## Static render

`renderDiagrams(xml, { profile?, minSize?, signal? })` returns one SVG per diagram and a diagnostic
for every diagram it did not return, including `filtered-small`. It needs a browser DOM.

## Styles and CSP

`styles: "auto"` installs the CSS once per root node (document or shadow root) at mount and honors
`styleNonce`. For a strict CSP use `styles: "external"` and load `styles.css`; font files are
separate assets, not `data:` URIs.

## Errors and edge cases

| Situation | Result |
|---|---|
| `setXml` superseded by a later `setXml`, or pending at `destroy()` | Rejects with an `AbortError`. |
| Any `setXml`, `selectDiagram`, `autoLayout` or `getXml` after `destroy()` | Rejects with an `AbortError`. |
| `selectDiagram(id)` with an id that is not in the document | Rejects with an error named `UnknownDiagramError`. |
| `setXml` with invalid XML or a document without DI | Resolves `{ applied: false, reason: "invalid" }`, emits the diagnostics, keeps the last good document. |
| `setXml` with a revision already applied or emitted | Resolves `{ applied: false, reason: "echo" }`; nothing is re-imported. |
| Initial `xml` invalid | `createBpmnCanvas` still returns a handle, in state `error`; `ready` resolves. |
| `autoLayout` on a read-only canvas, or with nothing placeable | Resolves `{ changed: 0, skipped }` and emits `layout-unsupported`. |
| `autoLayout` while the canvas is destroyed or the document replaced | Rejects with an `AbortError`; nothing is moved. |
| `getXml()` while nothing is displayed | Returns the last XML the host supplied. |

## Known limitations

- No DI generation, no Draw.io or Sparx export, no PNG/PDF export, no server-side rendering, no BPMN
  execution, no complete BPMN conformance claim.
- No undo across a diagram switch (`open()` clears the stack).
- Layout does not reposition boundary events, data stores, groups or pools without a `processRef`;
  it lists them in `skipped`. A boundary event keeps its old position when its host moves.
- The `legend` profile has no token for a second gradient tone or a distinct flow stroke.
- The assistant-ui adapter is structural and renders static previews; the host mounts the editable canvas.
- The Sentropic mount adapter and a diagram-core projection are not part of this version.
- Only React 19.3.0 and assistant-ui 0.15.22 are qualified.

## License

MIT for this package's own source. The bpmn.io watermark required by bpmn-js stays visible and
linked on every instance. Third-party terms, including the OFL-1.1 BPMN font and Adobe AFM metrics,
are in `THIRD_PARTY_NOTICES.md` and `licenses/`.
