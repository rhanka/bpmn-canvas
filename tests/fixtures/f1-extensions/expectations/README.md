# F1 extension expectations — independent seal

## Authorship

These expectations were authored in the spec role for F1 step 2 (Q1),
independently from the pinned reference rules and the plan's literal neutral
cases. No F1 runtime output was observed before sealing: `hydrate`,
`project` and the XML serializer were not executed to produce, adjust or
check any expected value, and no codec or serializer output is a golden
here. Native trees below are written by hand from the descriptor tables
and the reader/writer source rules; projected JSON forms state the tree
through the lossless F1 projection defined by the plan, with explicit
descriptor defaults filled in from the descriptor tables.

## Pinned references used

- Plan: F1 extensions plan, revision d, step 2 (Q1), including the wire
  model, safety/diagnostics tables, limits, and step-1 note on the Python
  reserved members.
- Native reader/writer semantics: bpmn-moddle 10.3.1 with moddle-xml
  12.3.1, moddle 8.2.1 and saxen 11.2.0, read as source (entity decoding,
  `createAny` generic elements, generic descendant handling, per-element
  unknown-attribute warnings, encoding question handling, generic body
  and children retention).
- Descriptor tables of the pinned BPMN package (effective defaults:
  Definitions `expressionLanguage`/`typeLanguage`, Activity
  `isForCompensation`/`startQuantity`/`completionQuantity`, StartEvent
  `parallelMultiple`/`isInterrupting`, Documentation `textFormat`).
- The Python twin's generic-element source only as a naming authority for
  the cross-runtime reserved-name union (its slot and method names), in
  the same way the plan's step-1 note prescribes. No Python code or output
  is used as a golden.

## Layout

- `reserved-names.json` — the closed reserved-name union (single
  normative list for both runtimes).
- `01-reserved-names.json` — XML and JSON collision vectors.
- `02-warning-truncation.json` — the 1001-warning truncation vector.
- `03-doctype-entity.json` — DOCTYPE/ENTITY refusal vectors.
- `04-entity-references.json` — predefined/uppercase entity variants and
  numeric character references (`&#x1F600;`, `&#0;`, `&#xD800;` and
  controls).
- `05-encoding.json` — declared ISO-8859-1, UTF-8 default/declared,
  unsupported and malformed encoding vectors (raw-byte inputs, base64).
- `06-generic-namespaces.json` — no-namespace URI and the
  generic-descendant rule.
- `07-round-trips.json` — `project(hydrate(J)) == J` vectors.
- `seal.json` — byte length and SHA-256 of every other file in this
  directory (the seal itself is excluded).

## Conventions

- Pointer domain `f1-expectations-pointer/1`: RFC 6901 JSON Pointers
  (`~` as `~0`, `/` as `~1`) over the input JSON for JSON vectors, and
  over the expected projected JSON for XML vectors. The document-level
  pointer is the empty string.
- Vector `expectedNative` values are F1 projected JSON in sealed normal
  form (explicit defaults present, containment/array order significant,
  object key order normalised by UTF-16 code-unit order on comparison).
- Diagnostics assert `code` and `pointer` tuples only; message text is
  not compared.
- Raw-byte inputs carry `base64`, `byteLength` and `sha256` of the exact
  bytes; text inputs are the exact string shown.
- Expected strings that turn on exact code points also carry an explicit
  `expectedCodePoints` array of Unicode scalar/code-unit values where the
  distinction matters (truncated numeric references, C1 controls).

## Design defaults chosen where step 1 is not yet sealed

Recorded here because the contract freeze they belong to is still open;
each is a default, not a runtime observation.

1. Encoding registry: only UTF-8 (default when no declaration, or a
   declared UTF-8 spelling) and ISO-8859-1 are admitted. ISO-8859-1 maps
   byte `b` to U+0000+b (so 0x80–0x9F map to U+0080–U+009F, never to
   Windows-1252 replacements). Any other declared encoding is
   `unsupported-encoding`; malformed bytes for the admitted encoding are
   `invalid-encoding`.
2. No-namespace URI: an element with no prefix and no in-scope default
   namespace has `$name.uri` equal to the empty string `""` (the field
   stays a string).
3. Generic descendants: once the native reader handles an element
   generically, every descendant stays generic, including descendants
   whose QName belongs to a registered namespace.
4. Document-level priority: entity-declaration and doctype checks run as
   lexical boundary refusals before native construction; a document that
   contains a DOCTYPE reports `xml-doctype-forbidden`, and the standalone
   ENTITY vectors (no DOCTYPE) isolate `xml-entity-declaration-forbidden`.
   Within one element, `reserved-name` precedes other name/binding
   refusals.
5. Numeric-reference truncation: the native decoder's 16-bit truncation
   is retained (for example `&#x1F600;` decodes to the single code unit
   U+F600), reported as `moddle-content-normalized` at the containing
   text location. A resulting string that is not a valid XML string
   (NUL U+0000, lone surrogate U+D800) is additionally refused by the
   writer stage as `invalid-xml-character`; raw valid supplementary
   characters in the source are positive controls with no diagnostic.
6. Warning mapping and cap: each native warning becomes one
   `moddle-warning` diagnostic at the projected location of its element
   or attribute; at most 1000 are emitted, followed by one
   `moddle-warning-truncated` whose pointer is the location of the first
   omitted (1001st) warning.
7. Named entity references: only the five predefined names and their
   all-uppercase variants decode; any other named reference, including
   mixed-case spellings, is `xml-entity-reference-unsupported` at the
   boundary.
8. Reserved names: `reserved-names.json` freezes the closed union across
   both runtimes (F1 wire fields, native element runtime members, the
   twin's underscore slots/methods, directly nameable dunder members, and
   prototype hooks). Fields owned by the schema are allowed only in their
   defined positions; the same names inside `$attrs` or as foreign
   XML attributes/properties are `reserved-name` refusals before native
   construction.

## Verification

Offline, with Node only: recompute SHA-256 and byte length of each file
listed in `seal.json` and compare; any byte drift, missing or extra file
fails the seal. The seal check reads sealed bytes only and executes no
codec.
