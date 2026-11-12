# Changelog

## 0.4.0

Compatibility data is injected instead of shipped; see `docs/migration-0.3-to-0.4.md`.

- Added: `readBusinessPolicy`, `validateBusinessPolicy`, `createLegacyAdapter`, the io model API
  (`parseDefinitions`, `createModdle`, `listDiagrams`, `importDiagram`, `export`), and the profile
  entries (`presentation.looks`, `presentation.palette`, `presentation.layout`, `metrics`,
  `classification`, `navigation`, `exportFacts`).
- Changed: the injected mechanism and the category names; the palette action-id prefix
  (`annotated.<action>`) and the CSS variables under category names
  (`--bpmn-canvas-annotated-icon`, `--bpmn-canvas-annotated-accent`,
  `--bpmn-canvas-annotated-glyph`).
- Removed: the 0.3 look ids, the default token tables, the annotation role markers, the text metrics
  tables and the width-table export, the layout dimensions behind `./layout`, the layout input item
  vocabulary, the palette entries and the `./browser` token and palette exports, the reference export
  styles, the draw.io decode rules, the 0.3 default resolver, the DOM classes and renderer service
  names, and the 0.3 attachment retarget. Also removed: the package palette entries and the
  action-id export.
- Not shipped: the descriptor subpath, the descriptor and checksum exports, the packed layout corpus
  and the workshop `navigation` prop.

## 0.3.0

See [Upgrading from 0.2](README.md#upgrading-from-02).

## 0.2.0

See [Upgrading from 0.1](README.md#upgrading-from-01).

## 0.1.0

Initial release.
