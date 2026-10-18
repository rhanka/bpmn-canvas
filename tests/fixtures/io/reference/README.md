# Reference export fixtures

Invented content only. Every process, lane, task, item, document and application name in these cases was written
for these tests (`cases.mjs`). No customer, project or production document is included, neither as is nor
neutralised; the brand guard of `tests/package-shape.test.mjs` runs over this folder.

## Files per case

| File | What it is |
|---|---|
| `diagram.bpmn` | The document, shaped like the BPMN the original engine writes: one collaboration and process per page, lanes, data objects, `ioSpecification`, `[Doc]` and `[App]` annotations, DI planes in the engine's order (pool, lanes, nodes, links, applications). |
| `process.json` | The normalised ProcessList saved with it (keys sorted, `json.dumps` separators and ASCII escapes), the input of `readFacts`. |
| `expected.drawio`, `expected.sparx.xml` | Reference exports with the facts. |
| `expected-nofacts.drawio`, `expected-nofacts.sparx.xml` | Reference exports without facts (C1–C4, C7). |

Cases: **C1** basic, **C2** page links, **C3** homonymous and unnamed lanes with a lane-block boundary, **C4** shared
item and document with labelled links, **C5** C1 after two tasks were renamed to the same name (its facts are those
of C1, joined on C1 and kept by id), **C6** text that needs escaping and non-integer DI values with ties at the 4th
decimal, **C7** artifacts whose DI order differs from the ProcessList order.

## How the files were produced

1. `build.mjs` (run after `npm run build`: `node tests/fixtures/io/reference/build.mjs`) builds `diagram.bpmn` and
   `process.json` from `cases.mjs` with this library's own layout port and `bpmn-moddle`, then applies the edits of
   C5, C6 and C7.
2. The expected export bytes are the output of this library's reference codecs, reviewed by hand against the rules
   of the original exporters (cell order, ids, style strings, offsets, anchors, serializer rules), and cross-checked
   with an independent prototype of the same rules (label-keyed, without facts): on every case it can read (C1–C4,
   C6, C7 without facts) the prototype's Draw.io and Sparx bytes are identical to `expected-nofacts.*`.
3. The targeted assertions of `tests/io-reference-codec.test.mjs` and `tests/io-facts.test.mjs` check each rule
   independently of these files (lane quirks, page links, escaping, rounding, attachments, order).

These expectations are **unverified as a parity proof**: no engine output is involved. The parity of the codecs with
the original engine's files is proven only by the host's private corpus gate, on real served files that never enter
this repository.
