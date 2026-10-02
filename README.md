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
| `@sentropic/bpmn-canvas/react` | `<BpmnCanvas>` (the canvas alone) and `<BpmnWorkshop>` (the complete editor). Optional peer: `react` 19 (qualified with 19.3.0). |
| `@sentropic/bpmn-canvas/assistant-ui` | `createBpmnToolkit`, `BpmnToolCard`. Structural coupling only: no import of `@assistant-ui/react`. Checked against 0.15.22. |
| `@sentropic/bpmn-canvas/layout` | Pure swimlane layout: `layoutProcess`, `parseProcesses`, `textWidth`, `wrapText`. |
| `@sentropic/bpmn-canvas/io` | Draw.io and Sparx codecs: `exportDiagram`, `importDiagram`, `encodeDrawio`, `decodeDrawio`, `bpmnGraph`, `graphBpmn`, `validateNativeBpmn`, `IoError`. Needs a browser DOM (or jsdom). |
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

## The workshop (`/react`)

`<BpmnWorkshop>` is a complete, generic editor around the canvas: toolbar, diagram tabs, busy veil, format switch,
export and import. No UI library is needed on the host: the menu, the tabs and the icons are part of the package.

```tsx
import { BpmnWorkshop } from "@sentropic/bpmn-canvas/react";

<BpmnWorkshop
  xml={xml}
  revision={revision}
  onXmlChange={(next, change) => { setXml(next); setRevision(change.revision); }}
  readOnly={busy}
  formats={[{ id: "bpmn", label: "BPMN", profile: "standard" }, { id: "legend", label: "Legend", profile: "legend", tokens }]}
  labels={{ undo: "Annuler", export: "Exporter" /* …every text is a prop */ }}
/>
```

- **Toolbar** (`role="toolbar"`): undo and redo (disabled until there is something to undo, following the canvas
  history), zoom out and in, a fit menu (fit, 50 %, 100 %), auto-layout, the format menu (only when more than one
  `formats` entry is given), export (BPMN, Draw.io, Sparx) and import, plus a `toolbarTrailing` slot.
- **Tabs**: one per diagram (`tablist`, `tab`, `tabpanel`, roving tabindex, arrows, Home and End, with wrapping).
  A click on a sub-process marker or drill-down button opens the diagram `resolveTarget(click, diagrams, activeId)`
  returns. The default looks at the called element, then at the exact name; a host can bring its own, fuzzier rule.
- **Busy** (`readOnly`): editing is locked, the canvas is `inert`, a veil with a status message covers it and the toolbar
  is disabled. Navigation by tabs is the host's choice, not the veil's.
- **Format**: switching recreates the modeler with the same document, diagram and view, and the undo stack is lost.
  `format` and `onFormatChange` make it controlled; the host persists the choice if it wants to.
- **Export** gives the exact BPMN bytes (Sparx included) or a Draw.io projection, with the fidelity notice shown as a
  message; a refusal is shown as an alert and nothing is downloaded. `onDownload(file)` replaces the default Blob link.
- **Import** (a file field): native BPMN or Draw.io. With `onImport(result)` the host receives the validated result and
  stores it; without it the workshop applies it to its own canvas. Fidelity notices and refusals are shown as messages.
- **Documents**: `onXmlChange(xml, change)` is called after every edit with the complete document (pulled once per
  change, in order). Pass the xml and the `revision` back so the echo is ignored and the undo stack survives. The `ref`
  gives `{ getXml(), canvas }`; `getXml()` waits for pending saves.
- **Links** inside the editor are inert, except the bpmn.io badge, which stays visible and active.
- **Texts**: `labels` is a typed set of every string (English by default, `DEFAULT_LABELS`). **Theme**: CSS custom
  properties `--bpmn-workshop-bg`, `-fg`, `-muted`, `-border`, `-accent`, `-focus`, `-hover`, `-radius`, with light and dark
  defaults, visible focus rings and a forced-colors mode. It works inside a shadow root and under React StrictMode.

## Draw.io and Sparx (`/io`)

```ts
import { exportDiagram, importDiagram, IoError } from "@sentropic/bpmn-canvas/io";

const file = exportDiagram(await canvas.getXml(), "drawio"); // { xml, filename, mimeType, fidelity }
const result = await importDiagram(text);                       // { xml, projected, fidelity }
```

- `bpmn` and `sparx` return the exact input bytes (Sparx accepts BPMN 2.0 XML as an interchange format; no EA/XMI
  conversion is performed). `drawio` is a **projection**: one participant per page, no nested sub-process content,
  no conditional flows or boundary events, every element with its DI. Anything else is refused.
- A conversion never returns a partial result. It returns the file and a `fidelity` list (what it kept or
  regenerated), or throws an `IoError` with a stable `code` (`unsupported-element`, `nested-subprocess`,
  `multiple-participants`, `element-without-di`, `missing-endpoint`, `too-large`, `dtd`, `duplicate-id`,
  `not-bpmn`, `missing-di`, `import-warning`, `unsupported-shape`, `unsupported-structure`, and others) and the
  `ids` involved.
- Importing Draw.io decodes pages (raw or compressed) and regenerates BPMN: ids and DI are regenerated, data links
  become associations, HTML labels become text. The regenerated BPMN is valid against the OMG schema (flow elements
  before artifacts, every root element before the diagrams). Native BPMN is validated by importing every diagram
  in an off-screen viewer and is returned unchanged.
- Raw and decompressed input is bounded (8 MiB by default, `maxBytes`), and DTDs and entities are refused.
- Options carry file-format names so a host can keep reading files written by earlier tools: `kindAttribute`
  (default `bpmnKind`), `legacyKindAttributes`, `host`, `targetNamespace`.

## View, zoom and navigation (0.2)

- `fitMode: "readable" | "whole"` and `fit({ mode, inset })`: `whole` fits the whole diagram; `readable` fits it when
  it stays readable, otherwise zooms on the start of the process. The canvas observes its own size: the first
  fit happens once it has one, later resizes keep the user's view in `readable`, and `whole` re-fits on every
  resize. `setFitMode(mode)` re-fits after a layout change (maximise, minimise).
- `zoomTo(scale)`, `zoomBy(factor)`, `getZoom()`, and `zoomLimits: { min, max }` (defaults 0.2 and 4).
- `wheel: "zoom-cursor"`: a plain wheel zooms around the cursor (x1.15 in, x0.87 out, within the limits);
  Ctrl/Meta+wheel and pinch stay native. `"page-scroll"` and `"zoom"` are unchanged.
- `onElementClick({ id, type, name, calledElement?, marker })`: fires for clicks on elements, also when read-only,
  never for the empty canvas. `marker` is true for a click on a sub-process expansion marker (`legend` profile)
  or on the bpmn-js drill-down button (both profiles). The host decides what a marker click means, for
  instance a lookup by `name`/`calledElement` followed by `selectDiagram(id)`.
- `drilldown: "native" | "event"`: `native` (default) lets bpmn-js navigate to the sub-process plane; the active
  diagram follows and `onChange` fires with cause `diagram-switch`. `event` reports the drill-down click as a marker
  click and navigates nowhere.
- `onHistoryChange({ canUndo, canRedo })`: fires when undo/redo availability may have changed, including after a
  diagram or profile switch, so toolbar buttons need no polling.
- `setProfile(profile, legendTokens?)`: changes the look without changing the document. The modeler is recreated
  with the same XML, active diagram and viewbox; read-only is kept. **The undo stack is lost.** `onChange` fires
  with cause `profile-switch` and no new content revision. If nothing was edited, `getXml()` still returns the
  input bytes. A switch pending at `destroy()` rejects with an `AbortError`.
- `legendTokens` on `createBpmnCanvas` and `renderDiagrams`: see "Legend profile".

## Layout

`autoLayout()` re-positions existing DI in one undo step and returns `{ changed, skipped }`. Boundary events stay
on the border of their host, on the same side and at the same fraction along it, and the connections that start or
end on them are routed afresh, all in the same command. Data stores, groups and pools without `processRef` are listed
in `skipped`, not moved. Never runs implicitly, never creates DI.

`@sentropic/bpmn-canvas/layout` exposes the pure layout (`layoutProcess`, `parseProcesses`, `textWidth`, `wrapText`)
with no modeler. `layoutProcess` also runs in Node. It is checked against two golden cases produced by the original
Python implementation of the algorithm: nodes, labels, applications, lanes, pool, connections, edges and edge
labels are identical.

## Static render

`renderDiagrams(xml, { profile?, minSize?, signal? })` returns one SVG per diagram and a diagnostic
for every diagram it did not return, including `filtered-small`. It needs a browser DOM.

## Testing a host with vitest

bpmn-js ships ES modules whose relative imports have no file extension, which Node cannot resolve natively. Vitest
therefore must process the package instead of loading it as an external dependency:
`test: { server: { deps: { inline: ["@sentropic/bpmn-canvas"] } } }`. The canvas needs SVG APIs that jsdom lacks (`getBBox`,
`getTotalLength`, `transform`, `createSVGMatrix`, ...): polyfill them in the test setup; jsdom has no layout, so geometry cannot be
asserted there, only DOM and state.

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
- Layout does not reposition data stores, groups or pools without a `processRef`; it lists them in `skipped`.
- Switching profile (`setProfile`) loses the undo stack.
- The assistant-ui adapter is structural and renders static previews; the host mounts the editable canvas.
- The Sentropic mount adapter and a diagram-core projection are not part of this version.
- Only React 19.3.0 and assistant-ui 0.15.22 are qualified.
- The palette (creating elements) is mouse-driven: bpmn-js has no keyboard creation, so full keyboard editing is
  not claimed. The workshop's toolbar, menus, tabs, import and export are keyboard-operable.
- Accessibility was checked with axe-core and real keyboard input in Chromium; no screen reader and no other
  browser engine was tried.
- The workshop has no persistence of its own: the chosen format, the document and the downloads belong to the host.
  There is no BPMN-in-Color popover, no `onModeler` escape hatch and no snapshot callback (use the `ref`).
- The format menu appears only when more than one `formats` entry is given.
- The `colored` profile changes colours only: no `strokeWidth`, no gradient (`taskFillEnd`), no fonts, and groups and
  plain markers keep the upstream colours. Only nine palette entries of the upstream palette are recoloured.
- The `legend` palette icons are monochrome masks: only line colours feed them, not fills.
- Layout parity with the original Python implementation is proven on two golden cases only; boundary events have no
  golden because the original does not handle them.
- Draw.io import regenerates ids and DI and turns data links into associations (declared in `fidelity`).

## License

MIT for this package's own source. The bpmn.io watermark required by bpmn-js stays visible and
linked on every instance. Third-party terms, including the OFL-1.1 BPMN font and Adobe AFM metrics,
are in `THIRD_PARTY_NOTICES.md` and `licenses/`.

## Legend profile

Opt-in look: `createBpmnCanvas(host, { profile: "legend", legendTokens })` and
`renderDiagrams(xml, { profile: "legend", legendTokens })`. No brand value ships in this package; the host
supplies its own.

### Tokens

`legendTokens` is a `Partial<LegendTokens>`. Missing keys use neutral defaults. Two conveniences: `stroke` feeds
every `*Line` and `flow` you did not name, `fill` feeds `taskFill`; `taskFillEnd` is derived from `taskFill`
when you do not name it. An explicit per-type value always wins.

| Group | Keys |
|---|---|
| Text | `fontFamily`, `fontSize`, `text`, `headerText` (pool and lane header columns), `labelText` (labels outside their shape; `colored`: follows `text`, `legend`: upstream colour unless named) |
| Strokes | `strokeWidth`, `stroke`, `flow` (sequence flows), `link` (associations, data links), `docLink` + `docLinkDash` (associations to a `[Doc]`, directional ones included and drawn without arrow; default: same as `link`, `5 5`) |
| Task | `taskLine`, `taskFill`, `taskFillEnd` (horizontal gradient from `taskFill` to `taskFillEnd`) |
| Event, gateway | `eventLine`, `eventFill`, `gatewayLine`, `gatewayFill` |
| Pool, lane | `poolLine`, `poolFill`, `laneLine`, `laneFill`, `laneHeaderFill` (header column, default: `laneFill`) |
| External process, external input, process output | `externalLine`, `externalFill` |
| `[Doc]` annotation | `docLine`, `docFill` |
| Task input and output (data object) | `dataLine`, `dataFill` |
| `[App]` annotation (component box) | `appLine`, `appFill` |

A BPMN-in-Color fill or stroke set on an element in the XML wins over the token.

### Palette action ids

The legend palette replaces the default palette. Each entry carries a stable `data-action` equal to its id, also
exported as `LEGEND_ACTION_IDS` from the profile module. The icon CSS ships with the package (monochrome masks,
no asset file) and only matches `data-action^="legend."`; recolor with `--bpmn-canvas-legend-icon` and
`--bpmn-canvas-legend-accent`.

`legend.start`, `legend.end`, `legend.intermediate-event`, `legend.task`, `legend.subprocess`,
`legend.external-process`, `legend.gateway-or`, `legend.gateway-and`, `legend.data-input`,
`legend.data-output`, `legend.external-input`, `legend.process-output`, `legend.document`,
`legend.application`, `legend.lane`, `legend.sequence-flow`.

### Navigation markers

The collapsed sub-process `[+]` and the external-process icon carry `data-marker` and the class
`legend-marker`. The lib's CSS lets a click land on the marker itself and keeps the body of the element
selectable and draggable, so a host can tell a body click from a marker click.

## Palette layout and icon colours

- `paletteColumns: 1 | 2 | "auto"`: one column, two columns, or the diagram-js default (`auto`, which switches to two
  columns when the canvas is short). The choice survives resizes, read-only toggles and `setProfile`. The measured
  palette width (48 px in one column, 94 px in two) is what `fit` keeps clear.
- For the `legend` and `colored` profiles the palette icons take their colour from tokens, through CSS custom
  properties set on the canvas root (`--bpmn-canvas-icon-start`, `-end`, `-intermediate` from `eventLine`; `-task`,
  `-subprocess` from `taskLine`; `-external` from `externalLine`; `-gateway` from `gatewayLine`; `-data` from
  `dataLine`; `-document` from `docLine`; `-application` from `appLine`; `-lane` from `laneLine`; `-pool` from
  `poolLine`; `-flow` from `flow`). They are set with the CSSOM, so a strict `style-src` CSP is not violated, and they are
  scoped to one instance. In the `colored` profile the upstream palette entries carry the class `bpmn-canvas--colored`.
  A canvas without tokens keeps the neutral defaults. The `standard` profile palette is exactly upstream.

## Colored profile

`profile: "colored"` keeps the **upstream bpmn-js notation** and recolours it per element kind from tokens. The
upstream renderer draws every element, its inner decorations and its markers; this profile only chooses the
`fill` and `stroke` it is given, then sets the text colour. No geometry changes, so inclusive, event-based and
complex gateways, boundary events, groups, data stores and transactions keep their standard notation.

```ts
createBpmnCanvas(host, { xml, profile: "colored", coloredTokens: { taskLine: "#1f3a5f", taskFill: "#eaf1fb", flow: "#37475a" } });
renderDiagrams(xml, { profile: "colored", coloredTokens });
await canvas.setProfile("colored", coloredTokens);
```

- **Tokens** are the 33 `LegendTokens` fields; any subset is accepted and missing keys fall back to neutral defaults
  (`stroke` feeds every `*Line` and `flow` not given; `fill` feeds `taskFill`). With **no token at all** the profile adds
  no module and draws exactly like `standard`.
- **Kinds**: task (every activity except call activity), event, gateway, pool, lane, external (call activity, data
  input and output), data (data object and data store), doc and app (text annotations starting `[Doc]` / `[App]`),
  flow (sequence and message flows), link (associations and data associations). Plain annotations use `stroke`; groups
  keep the upstream colours. Text uses `text`, pool and lane titles use `headerText`, external labels use `labelText` (default: `text`). `dataLinkArrow: false` (legend look) draws task input and output associations without the arrow head.
- Colours set on an element itself (BPMN-in-Color) keep priority over the tokens.
- Markers (arrowheads, message-flow ends, conditional markers) are created by the upstream renderer with the flow
  colour and with ids unique to the instance, so two instances with different tokens never share one.
- Not applied: `strokeWidth` (it would also change the inner decorations), `taskFillEnd` (no gradient is drawn) and the
  font tokens. The `[Doc]`/`[App]` background is the only thing added to the upstream drawing: a fill on the existing
  annotation box.
