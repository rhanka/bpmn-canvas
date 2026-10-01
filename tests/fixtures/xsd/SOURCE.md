# OMG BPMN 2.0 XSD: source record (files NOT stored in this tree)

Status: **the XSD files are deliberately not committed.** The OMG redistribution
terms are not clear (see below), so the schemas are downloaded on demand into an
untracked cache and verified against the sha256 below. They are test-only and are
never part of the npm tarball (the pack test enforces this).

## Retrieval record

Retrieved 2026-10-01 from the OMG site, HTTP 200, formal/13-12-09 family
(BPMN 2.0.2, schema files dated 2010-05-01 in the URL).

| File | URL | Bytes | sha256 |
|---|---|---|---|
| BPMN20.xsd | https://www.omg.org/spec/BPMN/20100501/BPMN20.xsd | 1941 | `a07c159cb0594573dd7c97b1370dd116112378f377e43c89a8bf512ac5030705` |
| Semantic.xsd | https://www.omg.org/spec/BPMN/20100501/Semantic.xsd | 62507 | `c4318842f7d2bbc262d7954c9452c501db16f0868eac0b8732ec5d7fb384d9a7` |
| BPMNDI.xsd | https://www.omg.org/spec/BPMN/20100501/BPMNDI.xsd | 4010 | `f0dff1cd559d1514d8ebfc8c646f58402bcaced27ec22e2aa6456c2dcc80b038` |
| DC.xsd | https://www.omg.org/spec/BPMN/20100501/DC.xsd | 1324 | `a2f90e5ad9bb48c6915e4e034b4e27ac838264a1d4f27bfc70dbdfc69351312d` |
| DI.xsd | https://www.omg.org/spec/BPMN/20100501/DI.xsd | 3470 | `8220b179c175572df74e08a51bffabe957867962035cee7b5fee0b6acb4c4498` |

Import graph: `BPMN20.xsd` imports `BPMNDI.xsd` and includes `Semantic.xsd`;
`BPMNDI.xsd` imports `DC.xsd` and `DI.xsd`; `DI.xsd` imports `DC.xsd`.
The files carry **no copyright or license header** of their own.

## Why they are not redistributed here

- The spec page https://www.omg.org/spec/BPMN/2.0.2/ lists these files under
  "Normative Machine Readable Documents" and its embedded metadata names a
  license `https://www.omg.org/techprocess/ab/SpecificationMetadata/MITLicense`.
  That URL returns **HTTP 404**, so no license text could be read from it.
- The specification PDF (https://www.omg.org/spec/BPMN/2.0.2/PDF, formal/13-12-09)
  states the terms: a license "without the right to sublicense", valid
  "provided that: (1) both the copyright notice identified above and this
  permission notice appear on any copies of this specification; (2) the use of the
  specifications is for informational purposes and will not be copied or posted on
  any network computer or broadcast in any media and will not be otherwise resold
  or transferred for commercial purposes; and (3) no modifications are made to
  this specification."
- Condition (1) cannot be met by a bare `.xsd` copy (no notice inside), and
  condition (2) conflicts with posting the files in a public repository.
  The owner or conductor must decide before any XSD enters the tree.

## How the tests get them

`tests/helpers/xsd.mjs` resolves the schemas in this order and fails (never skips)
if none works:

1. directory in the `BPMN_XSD_DIR` environment variable, if set;
2. cache `node_modules/.cache/bpmn-xsd/` (untracked);
3. download from the URLs above into that cache, then verify every sha256.

A sha256 mismatch aborts the run.

## Validator (test-only)

`xmllint-wasm` 5.3.0, MIT (`COPYING`: "MIT licensed, just like libxml";
copyright 1998-2018 libxml and libxml.js authors). It ports libxml2 (2.13.8 per its
README), also MIT. Dev dependency only, not distributed.
