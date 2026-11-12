# Migrating from 0.3 to 0.4

0.4 injects the compatibility data 0.3 used to ship. The package carries no compatibility defaults:
every look value, measurement, navigation rule and codec fact is caller data. This guide lists each
removed default and its injected replacement. Published identifiers below are the 0.4 API.

## 1. Staying on 0.3

`^0.3.0` and `~0.3.0` ranges keep resolving 0.3.0: a caret on 0.x pins the minor. 0.3.0 stays published,
unchanged and not deprecated. An existing consumer stays on its accepted release until an explicit
migration preserves its appearance and export behaviour.

## 2. The injected business policy

- Read and validate it with `readBusinessPolicy(text)` and `validateBusinessPolicy(value)`.
- Pass it as `businessPolicy` to `createBpmnCanvas`, `renderDiagrams`, the workshop, the assistant-ui
  `renderOptions` and the io options. Codec callers also pass their descriptor package and its
  `descriptorId`.
- Refusals: `profile-resource-missing` (no layout, metrics or token data) and `profile-symbol` (look
  alias not injected).

## 3. Removed defaults and their injected replacement

| Removed default | Replacement |
| --- | --- |
| the three 0.3 look ids | `presentation.looks[].alias` |
| the default token tables of both looks | `looks[].tokens` |
| the annotation role markers | `classification.annotationRoles` |
| the text metrics tables, the width-table export and the ambient accent decomposition | `metrics` with an explicit alias table |
| layout dimensions behind `./layout` | `presentation.layout`; `layoutProcess(proc, options, businessPolicy)`, `textWidth(text, size, bold, businessPolicy)`, `wrapText(text, size, width, bold, businessPolicy)`, `parseProcesses(xml, businessPolicy)` |
| layout input item vocabulary | neutral types: `start`, `end`, `task`, `subprocess`, `gateway`, `event`, `call`, `object-in`, `object-out`, `port-in`, `port-out`, `document`; application field `application` |
| palette entries and the five `./browser` token and palette exports | `presentation.palette.entries` |
| reference export styles | `presentation.exportStyles.drawio` |
| draw.io decode rules, including the annotation shape | `presentation.exportStyles.decode.kinds` and `presentation.exportStyles.decode.roles` |
| the 0.3 default resolver | `navigation.mode`: `called-element` (default), `legacy-default` or `legacy-rules` with the categories; the 0.3 default resolver export takes two optional trailing parameters (policy, navigation index) |
| DOM classes and renderer service names | category names (`annotated-*`, `bpmn-canvas--recolor`, `annotatedRenderer`, `recolorRenderer`, `flatRenderer`); CSS variables `--bpmn-canvas-annotated-icon`, `--bpmn-canvas-annotated-accent` and `--bpmn-canvas-annotated-glyph`, with the scope class `bpmn-canvas--recolor` |
| the 0.3 attachment retarget | none (preserve-report) |

The package palette CSS (icons, token colours, glyph) applies to entries whose id is
`annotated.<action>`, for the 16 actions of the README list. Workshop format ids and palette ids are
caller data; use `annotated.<action>` to get the package icons.

## 4. The legacy adapter

`createLegacyAdapter(data)` binds the compatibility readers to a snapshot of caller data. Its methods:
`classify`, `kind`, `textWidth`, `wrapText`, `badgeSize`, `badgeBoxes`, `documentRect`, `selectLook`,
`paletteEntries`, `attachedAnnotations`, `movedShapes`, `navigate`, `layoutInput`, `layout`, `parse`,
`export`, `import` and `render`. The package ships no legacy data.

## 5. Published names kept

- The published look-token type and both look-token options of `BpmnCanvasOptions`/`RenderOptions` apply
  on top of the injected look. The category aliases `AnnotatedTokens`, `annotatedTokens` and
  `recolorTokens` are equivalent.
- The published rule union type and the rule resolver export keep their 0.4 names (see the README API
  section). Each published rule maps to its policy category.

## 6. Not shipped (never published)

The descriptor subpath, the descriptor and checksum exports, the packed layout corpus and the workshop
`navigation` prop. For the prop, pass the rule resolver to the workshop's resolver prop or
`businessPolicy.navigation`.

## 7. Checklist

Supply a policy; map look ids to aliases; inject layout and metrics; supply the descriptor; rename
layout input fields; update CSS selectors. Workshop format ids and palette ids are caller data; use
`annotated.<action>` to get the package icons.
