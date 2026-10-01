# Third-party notices

This package depends on, or will carry, the third-party material below. Exact
license texts are in `licenses/`. The AFM and font entries describe material
that is added to this tree in a later phase; this file states the terms that
apply once those files are present.

## bpmn-js (declared dependency)

- Version pinned by this package: `~18.30.1`.
- License: MIT-style grant by Camunda Services GmbH **plus a mandatory
  watermark condition**: the source code that displays the bpmn.io watermark
  linking to https://bpmn.io MUST NOT be removed or changed, and the watermark
  must stay fully visible and not visually overlapped by other elements.
- Text: `licenses/bpmn-js.LICENSE`.
- Treatment here: the badge is kept visible with its working link on every
  canvas instance. No stylesheet or script in this package hides or removes it.

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
- Treatment: kept as an external npm dependency, never vendored or bundled.
  Bundling it would require resolving this missing notice first.

## BPMN font (to be added unmodified in a later phase)

- Source: `bpmn-font` 0.13.0 (npm integrity
  `sha512-NrD6fhpCIPyQQmgPJcFUFm55oXD3EIwRhP5bdXTDNTEAfg9HwuvhXThOuM/XPUrruJoATi2ROeOfFeCIM+ftSw==`).
- Copyright (c) 2014-present, Camunda Services GmbH.
- License: **SIL Open Font License 1.1** (not MIT). Text:
  `licenses/bpmn-font.OFL-1.1.txt`.
- Treatment: font bytes are shipped unmodified, with the copyright notice and
  license text alongside.

## Adobe Helvetica metrics (to be added in a later phase)

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
