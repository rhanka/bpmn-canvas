# Third-party notices

This package depends on, or carries, the third-party material below. Exact
license texts are in `licenses/`.

## bpmn-js (declared dependency)

- Version pinned by this package: `~18.30.1`.
- License: MIT-style grant by Camunda Services GmbH **plus a mandatory
  watermark condition**: the source code that displays the bpmn.io watermark
  linking to https://bpmn.io MUST NOT be removed or changed, and the watermark
  must stay fully visible and not visually overlapped by other elements.
- Text: `licenses/bpmn-js.LICENSE`.
- Treatment here: the badge is kept visible with its working link on every
  canvas instance by default. The watermark code is never removed or changed.
  The package hides the badge of one canvas only when the host passes
  `watermark: { hidden: true, license: "<reference>" }`, naming a license that
  allows it; without a non-blank reference the request is refused (diagnostic
  `watermark-refused`) and the badge stays. The package does not check that
  license: whether hiding is allowed is the host's responsibility.

## diagram-js, tiny-svg, bpmn-moddle (declared dependencies)

- diagram-js `~15.27.1`, tiny-svg `~4.1.4`, bpmn-moddle (transitive through
  bpmn-js, 10.3.1 observed): MIT.
- Texts: `licenses/diagram-js.LICENSE`, `licenses/tiny-svg.LICENSE`,
  `licenses/bpmn-moddle.LICENSE`.
- They are consumed as external npm dependencies. If a build step bundles any
  of their code into `dist/`, this notice and the matching license text must
  stay in the tarball.

## bpmn-auto-layout (declared dependency)

- Version: `1.3.0`. The npm registry metadata and the upstream README at
  commit `50b69fe91732a64916fd09a90d24f749430d5858` declare MIT. The declared
  author is "bpmn.io contributors" (https://github.com/bpmn-io).
- Limit: the upstream tree at that commit contains no `LICENSE`, `COPYING` or
  `NOTICE` file, so no upstream full license text or copyright year is
  available to reproduce. None is invented here.
- Treatment: an external npm dependency of the module build. The browser build
  (`dist/browser/`) bundles it; `dist/browser/bpmn-canvas.licenses.txt` then states
  the declared license, the declared author and the standard MIT text, without a
  copyright line since upstream publishes none.

## BPMN font (shipped unmodified)

- Source: `bpmn-font` 0.13.0 (npm integrity
  `sha512-NrD6fhpCIPyQQmgPJcFUFm55oXD3EIwRhP5bdXTDNTEAfg9HwuvhXThOuM/XPUrruJoATi2ROeOfFeCIM+ftSw==`).
- Copyright (c) 2014-present, Camunda Services GmbH.
- License: **SIL Open Font License 1.1** (not MIT). Text:
  `licenses/bpmn-font.OFL-1.1.txt`.
- Treatment: the font files and `bpmn.css` are copied byte for byte to
  `dist/assets/bpmn-font/`; a test compares their sha256 to the official
  tarball. The copyright notice and license text are in
  `licenses/bpmn-font.OFL-1.1.txt`.

## Adobe Helvetica metrics (in `src/internal/textMetrics.ts`)

- Source: Adobe PostScript AFM data for Helvetica and Helvetica-Bold, as
  redistributed in the Matplotlib v3.10.7 `pdfcorefonts` directory.
- The package carries a 95-entry ASCII width table for each face, extracted
  from those AFM files. **This is a modified extraction** and is marked as such
  in the source file that holds it. Unicode apostrophe and grave map to the
  `quotesingle` and `grave` glyphs, not to the numeric PostScript codes at the
  same positions.
- Terms: Adobe's permission paragraph (`licenses/Adobe-AFM-readme.txt`) and the
  copyright and trademark notices (`licenses/Adobe-AFM-copyright.txt`) must
  travel with the data. This data is not MIT-licensed. No Helvetica outline or
  binary is included.

## Adaptation provenance

Parts of the swimlane layout, text fitting and process normalization logic are
TypeScript adaptations of an internal Python implementation, itself carrying
MIT and third-party notices. Only the generic TypeScript adaptation is
published here. The Python code, its vendored tree and its fixtures are not.

## Not included

No brand tokens, brand fonts, logos or proprietary reference diagrams are part
of this package.

## Test-only material (not distributed)

These are used by the test suite only. They are not in the npm tarball and not
in `dist/`; the pack test enforces that.

- **xmllint-wasm** 5.3.0 (devDependency), MIT. Copyright 1998-2018 libxml and
  libxml.js authors. It is a WebAssembly port of libxml2 (2.13.8 per its README),
  also MIT.
- **axe-core** 4.13.0 (devDependency), MPL-2.0. Used by the accessibility check in `tests/p3/run.mjs`;
  never bundled or shipped.
- **Vite** (installed at run time into a scratch consumer outside this repository by
  `tests/p3/prepare.mjs`), MIT. It builds the consumer pages that import the packed tarball.
- **OMG BPMN 2.0 XSD** (BPMN20, Semantic, BPMNDI, DC, DI; formal/13-12-09).
  Test-only, not distributed, and **not stored in this repository**: the OMG terms
  for redistribution are unclear, so the tests download them into an untracked
  cache and verify their sha256. Source URLs, retrieval date and hashes:
  `tests/fixtures/xsd/SOURCE.md`.
- **BPMN MIWG reference models B.1.0, C.4.0 and C.5.0** (`docs/demo/*.bpmn`), CC BY 3.0, OMG BPMN Model Interchange
  Working Group, https://github.com/bpmn-miwg/bpmn-miwg-test-suite (folder `Reference`). B.1.0 is re-encoded from
  ISO-8859-1 to UTF-8 (the XML declaration says so). C.4.0 and C.5.0 lose their BPMN-in-Color attributes
  (`color:background-color="#ffffff"`, `color:border-color="#000000"`, `color:color="#000000"`), which would
  otherwise override the looks. Nothing else changed. They feed the demo images and the live demo; they are not part
  of the npm package.

## Browser build (`dist/browser/`)

- `bpmn-canvas.min.js` and `bpmn-canvas.iife.min.js` bundle the runtime dependencies (bpmn-js,
  diagram-js, bpmn-moddle, bpmn-auto-layout, tiny-svg and their own dependencies). The list and
  each package's license text, copied from the package at build time, are in
  `dist/browser/bpmn-canvas.licenses.txt`; the build fails if a bundled package has no license
  text and no recorded treatment.
- bpmn-js is under the bpmn.io license (MIT-style grant plus the watermark condition); diagram-js
  and the other bundled packages are under their own licenses (MIT, ISC, Apache-2.0), as listed.
  The bpmn.io watermark code is bundled unchanged and the badge stays visible by default (see the
  README for the explicit, licensed `watermark` option).
