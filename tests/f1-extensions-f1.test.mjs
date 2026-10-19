import { assertDisputed } from "./helpers/f1-disputes.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as io from "../dist/io/index.js";
import { canon, configuration, freeze, snapshot } from "./helpers/workbench.mjs";
import { loadSealedVectors, runSealedVector, verifySeal } from "./helpers/f1-sealed.mjs";

const EXT = "urn:example:ext";
const LOC = "urn:example:loc";
const OTHER = "urn:example:other";

// Smallest neutral document carrying nested generic content: foreign
// attributes on typed and generic owners, a local namespace declaration, a
// body and ordered children, including an explicitly empty body and child list.
function genericJson() {
  return {
    $type: "bpmn:Definitions",
    id: "Defs_1",
    targetNamespace: "urn:example:target",
    expressionLanguage: "http://www.w3.org/1999/XPath",
    typeLanguage: "http://www.w3.org/2001/XMLSchema",
    $attrs: { "xmlns:ext": EXT, "xmlns:loc": LOC, "ext:release": "7" },
    rootElements: [{
      $type: "bpmn:Process",
      id: "Proc_1",
      isExecutable: false,
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [{
          $type: "$any",
          $name: { qname: "ext:note", uri: EXT },
          $attrs: { id: "Note_1", "ext:level": "high", "xmlns:loc": LOC },
          $body: "hello",
          $children: [
            {
              $type: "$any",
              $name: { qname: "loc:deep", uri: LOC },
              $attrs: { id: "Deep_1", "loc:tag": "t" },
              $body: "deep",
            },
            {
              $type: "$any",
              $name: { qname: "ext:tail", uri: EXT },
              $attrs: {},
              $body: "",
              $children: [],
            },
          ],
        }],
      },
    }],
  };
}

function refusal(fn, code, path) {
  assert.throws(fn, (error) => error instanceof io.IoError && error.code === code && error.path === path);
}

test("F1 generic should round-trip nested $any content with declarations, bodies and order", () => {
  const input = freeze(genericJson());
  const before = canon(input);
  const model = io.hydrate(input, configuration);
  const nativeBefore = snapshot(model);
  const projected = io.project(model, configuration);
  assert.equal(canon(projected), before);
  assert.equal(canon(io.project(io.hydrate(projected, configuration), configuration)), before);
  assert.equal(snapshot(model), nativeBefore);
  const note = model.rootElements[0].extensionElements.values[0];
  assert.equal(note.$descriptor.isGeneric, true);
  assert.equal(note.$type, "ext:note");
  assert.equal(note.$body, "hello");
  assert.equal(note.$children.length, 2);
  assert.strictEqual(note.$children[0].$parent, note);
  assert.strictEqual(note.$parent, model.rootElements[0].extensionElements);
});

test("F1 generic should dispatch on $any before registered types, even in a registered namespace", () => {
  const input = freeze({
    $type: "bpmn:Definitions",
    id: "Defs_1",
    targetNamespace: "urn:example:target",
    expressionLanguage: "http://www.w3.org/1999/XPath",
    typeLanguage: "http://www.w3.org/2001/XMLSchema",
    rootElements: [{
      $type: "bpmn:Process",
      id: "Proc_1",
      isExecutable: false,
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [{ $type: "$any", $name: { qname: "bpmn:Task", uri: "http://www.omg.org/spec/BPMN/20100524/MODEL" }, $attrs: { id: "G_1" } }],
      },
    }],
  });
  const model = io.hydrate(input, configuration);
  const generic = model.rootElements[0].extensionElements.values[0];
  assert.equal(generic.$descriptor.isGeneric, true);
  assert.equal(generic.$type, "bpmn:Task");
  assert.equal(generic.id, "G_1");
  assert.equal(canon(io.project(model, configuration)), canon(input));
});

test("F1 generic should preserve foreign attributes on typed owners instead of refusing them", () => {
  const input = freeze(genericJson());
  const projected = io.project(io.hydrate(input, configuration), configuration);
  assert.deepEqual(projected.$attrs, input.$attrs);
  assert.equal(projected.$attrs["ext:release"], "7");
});

test("F1 generic should default a missing $attrs to {} and stay a fixed point", () => {
  const input = genericJson();
  delete input.rootElements[0].extensionElements.values[0].$children[1].$attrs;
  const once = io.project(io.hydrate(freeze(input), configuration), configuration);
  assert.deepEqual(once.rootElements[0].extensionElements.values[0].$children[1].$attrs, {});
  assert.equal(canon(io.project(io.hydrate(once, configuration), configuration)), canon(once));
});

test("F1 generic should distinguish absent and explicitly empty $body/$children", () => {
  const bare = { $type: "$any", $name: { qname: "ext:bare", uri: EXT }, $attrs: {} };
  const input = freeze({
    $type: "bpmn:Definitions",
    id: "Defs_1",
    targetNamespace: "urn:example:target",
    rootElements: [{
      $type: "bpmn:Process",
      id: "Proc_1",
      extensionElements: { $type: "bpmn:ExtensionElements", values: [bare] },
    }],
  });
  const projected = io.project(io.hydrate(input, configuration), configuration);
  assert.ok(!Object.hasOwn(projected.rootElements[0].extensionElements.values[0], "$body"));
  assert.ok(!Object.hasOwn(projected.rootElements[0].extensionElements.values[0], "$children"));
  const tail = genericJson().rootElements[0].extensionElements.values[0].$children[1];
  assert.equal(tail.$body, "");
  assert.deepEqual(tail.$children, []);
});

test("F1 generic should keep generic IDs outside the typed ID index", () => {
  const input = genericJson();
  input.rootElements[0].extensionElements.values[0].$children[0].$attrs.id = "Note_1";
  const model = io.hydrate(freeze(input), configuration);
  assert.equal(canon(io.project(model, configuration)), canon(input));
  const clashing = genericJson();
  clashing.rootElements[0].extensionElements.values[0].$attrs.id = "Proc_1";
  assert.equal(canon(io.project(io.hydrate(freeze(clashing), configuration), configuration)), canon(clashing));
});

test("F1 generic should refuse generic nodes in incompatible typed slots", () => {
  const misplaced = genericJson();
  misplaced.rootElements[0].flowElements = [misplaced.rootElements[0].extensionElements.values[0]];
  refusal(() => io.hydrate(freeze(misplaced), configuration), "invalid-containment", "$.rootElements[0].flowElements[0]");
});

test("F1 generic should refuse generics as typed reference targets", () => {
  const input = genericJson();
  input.rootElements[0].flowElements = [
    { $type: "bpmn:SequenceFlow", id: "Flow_1", sourceRef: "Note_1", targetRef: "Note_1" },
  ];
  refusal(() => io.hydrate(freeze(input), configuration), "dangling-reference", "$.rootElements[0].flowElements[0].sourceRef");
});

test("F1 generic should refuse shared or cyclic generic children", () => {
  const shared = genericJson();
  const note = shared.rootElements[0].extensionElements.values[0];
  note.$children.push(note.$children[0]);
  refusal(() => io.hydrate(freeze(shared), configuration), "invalid-containment", "$.rootElements[0].extensionElements.values[0].$children[2]");
  const cyclic = genericJson();
  cyclic.rootElements[0].extensionElements.values[0].$children.push(cyclic.rootElements[0].extensionElements.values[0]);
  refusal(() => io.hydrate(freeze(cyclic), configuration), "invalid-containment", "$.rootElements[0].extensionElements.values[0].$children[2]");
});

test("F1 generic should refuse malformed generic wire shapes with typed codes", () => {
  const noName = genericJson();
  delete noName.rootElements[0].extensionElements.values[0].$name;
  refusal(() => io.hydrate(freeze(noName), configuration), "invalid-any", "$.rootElements[0].extensionElements.values[0]");
  const badQName = genericJson();
  badQName.rootElements[0].extensionElements.values[0].$name = { qname: "9lives", uri: EXT };
  refusal(() => io.hydrate(freeze(badQName), configuration), "malformed-qname", "$.rootElements[0].extensionElements.values[0].$name");
  const missingUri = genericJson();
  missingUri.rootElements[0].extensionElements.values[0].$name = { qname: "ext:note" };
  refusal(() => io.hydrate(freeze(missingUri), configuration), "invalid-namespace", "$.rootElements[0].extensionElements.values[0].$name");
  const badBody = genericJson();
  badBody.rootElements[0].extensionElements.values[0].$body = 7;
  refusal(() => io.hydrate(freeze(badBody), configuration), "invalid-any", "$.rootElements[0].extensionElements.values[0].$body");
});

test("F1 generic should refuse reserved names in foreign attributes before native construction", () => {
  const reserved = ["$type", "$attrs", "$body", "$children", "$parent", "$descriptor", "$model", "__proto__", "constructor", "get", "set", "type_", "to_canonical_dict", "__class__"];
  for (const name of reserved) {
    const input = genericJson();
    // defineProperty: a plain assignment would trigger the prototype setter
    // for __proto__ instead of creating the colliding foreign attribute.
    Object.defineProperty(input.rootElements[0].extensionElements.values[0].$attrs, name, {
      value: "x",
      enumerable: true,
      writable: true,
      configurable: true,
    });
    refusal(
      () => io.hydrate(freeze(input), configuration),
      "reserved-name",
      "$.rootElements[0].extensionElements.values[0].$attrs." + name,
    );
  }
  const typed = genericJson();
  typed.$attrs["$parent"] = "x";
  refusal(() => io.hydrate(freeze(typed), configuration), "reserved-name", "$.$attrs.$parent");
});

test("F1 generic should leave inputs and configuration unchanged across repeated calls", () => {
  const first = freeze(genericJson());
  const second = freeze(genericJson());
  const before = canon(first);
  const configBefore = canon(configuration);
  const a = io.hydrate(first, configuration);
  const b = io.hydrate(second, configuration);
  assert.notStrictEqual(a.rootElements[0], b.rootElements[0]);
  assert.equal(canon(first), before);
  assert.equal(canon(configuration), configBefore);
});

test("F1 sealed expectations should seal-check without executing a codec", () => {
  const checked = verifySeal();
  assert.equal(checked.length, 9);
});

test("F1 sealed expectations should all execute with agreed, fixed or disputed outcomes", async () => {
  const disputes = JSON.parse(readFileSync(new URL("../docs/design/receipts/block-a-f1-disputes.json", import.meta.url), "utf8"));
  const disputed = new Set(disputes.vectorResults.disputed.map((entry) => entry.split("#")[1]));
  const runtime = { hydrate: io.hydrate, project: io.project, parseF1Xml: io.parseF1Xml, configuration, freeze };
  let agreed = 0, disputedCount = 0;
  for (const { file, vector } of loadSealedVectors()) {
    const id = `${file}#${vector.caseId}`;
    const observed = await runSealedVector(vector, runtime);
    if (disputed.has(vector.caseId)) {
      assertDisputed(id, vector, observed, disputes);
      disputedCount++;
    } else {
      assertAgreed(id, vector, observed);
      agreed++;
    }
  }
  assert.equal(agreed + disputedCount, 51);
});

function assertAgreed(id, vector, observed) {
  if (vector.expected.kind === "refused") {
    assert.equal(observed.status, "refused", id);
    assert.deepEqual(
      { code: observed.code, pointer: observed.pointer },
      vector.expected.diagnostics[0],
      id,
    );
    return;
  }
  assert.equal(observed.status, "ok", id);
  if (vector.operation === "f1-json-round-trip") {
    assert.equal(canon(observed.json), canon(vector.expected.json), id);
    assert.equal(canon(observed.twice), canon(vector.expected.json), `${id} fixed point`);
    return;
  }
  assert.equal(canon(observed.json), canon(vector.expected.json), id);
  assert.deepEqual(observed.diagnostics, vector.expected.diagnostics ?? [], id);
}
