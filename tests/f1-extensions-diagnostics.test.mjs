import { test } from "node:test";
import assert from "node:assert/strict";
import * as io from "../dist/io/index.js";
import { configuration } from "./helpers/workbench.mjs";

const MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const EXT = "urn:example:ext";
const envelope = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="${MODEL}" xmlns:ext="${EXT}" id="Defs_1" targetNamespace="urn:example:target">${inner}</bpmn:definitions>`;

test("F1 diagnostics should cap native warnings at 1000 with a truncation pointer", async () => {
  const strays = Array.from({ length: 1001 }, (_, index) => `<ext:stray id="S${index}"/>`).join("");
  const parsed = await io.parseF1Xml(envelope(`<bpmn:process id="P1"/>${strays}`), configuration);
  assert.equal(parsed.diagnostics.length, 1001);
  const kept = parsed.diagnostics.slice(0, 1000);
  assert.ok(kept.every((diagnostic) => diagnostic.code !== "moddle-warning-truncated"));
  const truncation = parsed.diagnostics[1000];
  assert.equal(truncation.code, "moddle-warning-truncated");
  assert.equal(typeof truncation.path, "string");
  assert.ok(truncation.message.includes("1000"));
});

test("F1 diagnostics should keep exactly one thousand warnings without truncation", async () => {
  const strays = Array.from({ length: 1000 }, (_, index) => `<ext:stray id="S${index}"/>`).join("");
  const parsed = await io.parseF1Xml(envelope(`<bpmn:process id="P1"/>${strays}`), configuration);
  assert.equal(parsed.diagnostics.length, 1000);
  assert.ok(parsed.diagnostics.every((diagnostic) => diagnostic.code !== "moddle-warning-truncated"));
}, { timeout: 120000 });

test("F1 diagnostics should type dropped unknown children with a document pointer", async () => {
  const parsed = await io.parseF1Xml(envelope(`<bpmn:process id="P1"/><ext:stray id="S1"/>`), configuration);
  const dropped = parsed.diagnostics.filter((diagnostic) => diagnostic.code === "moddle-content-dropped");
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].path, "");
});

test("F1 diagnostics should stay silent for retained unknown data", async () => {
  const parsed = await io.parseF1Xml(
    envelope(`<bpmn:process id="P1" ext:release="7"/>`),
    configuration,
  );
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.rootElement.rootElements[0].$attrs["ext:release"], "7");
});

test("F1 diagnostics should report comment, PI and CDATA classes without a token stream", () => {
  const losses = io.scanF1XmlLosses(envelope(`<!-- note --><?track step?><bpmn:process id="P1"><bpmn:documentation><![CDATA[raw]]></bpmn:documentation></bpmn:process>`));
  const codes = losses.map((loss) => loss.code).sort();
  assert.deepEqual(codes, ["moddle-content-normalized", "moddle-content-normalized", "moddle-content-normalized"]);
  assert.ok(losses.every((loss) => typeof loss.path === "string"));
  assert.deepEqual(io.scanF1XmlLosses(envelope(`<bpmn:process id="P1"/>`)), []);
});

test("F1 diagnostics should report mixed text and child ordering loss at the generic node", () => {
  const model = io.hydrate({
    $type: "bpmn:Definitions",
    id: "Defs_1",
    targetNamespace: "urn:example:target",
    rootElements: [{
      $type: "bpmn:Process",
      id: "Proc_1",
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [{
          $type: "$any",
          $name: { qname: "ext:note", uri: EXT },
          $attrs: { id: "Note_1" },
          $body: "hello",
          $children: [{ $type: "$any", $name: { qname: "ext:inner", uri: EXT }, $attrs: { id: "Inner_1" } }],
        }],
      },
    }],
  }, configuration);
  const { json, diagnostics } = io.projectWithDiagnostics(model, configuration);
  assert.equal(json.rootElements[0].extensionElements.values[0].$body, "hello");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "moddle-content-normalized");
  assert.equal(diagnostics[0].path, "/rootElements/0/extensionElements/values/0");
});

test("F1 diagnostics should treat attribute order as the explicit preservation exception", async () => {
  const first = await io.parseF1Xml(envelope(`<bpmn:process id="P1" ext:a="1" ext:b="2"/>`), configuration);
  const second = await io.parseF1Xml(envelope(`<bpmn:process id="P1" ext:b="2" ext:a="1"/>`), configuration);
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(second.diagnostics, []);
  assert.equal(JSON.stringify(io.project(first.rootElement, configuration)), JSON.stringify(io.project(second.rootElement, configuration)));
});

test("F1 diagnostics should locate unknown attributes on nested elements", async () => {
  const parsed = await io.parseF1Xml(
    envelope(`<bpmn:process id="P1"><bpmn:task id="T1" wzzz="q"/></bpmn:process>`),
    configuration,
  );
  assert.equal(parsed.diagnostics.length, 1);
  assert.equal(parsed.diagnostics[0].code, "moddle-warning");
  assert.equal(parsed.diagnostics[0].path, "/rootElements/0/flowElements/0/$attrs/wzzz");
});

test("F1 diagnostics should drop the reader encoding notice owned by the F1 registry", async () => {
  const head = new TextEncoder().encode(`<?xml version="1.0" encoding="ISO-8859-1"?><bpmn:definitions xmlns:bpmn="${MODEL}" id="D1" targetNamespace="urn:x"><bpmn:process id="P1"/></bpmn:definitions>`);
  const parsed = await io.parseF1Xml(head, configuration);
  assert.deepEqual(parsed.diagnostics, []);
});

test("F1 generic should round-trip the empty no-namespace URI", () => {
  const input = {
    $type: "bpmn:Definitions",
    id: "Defs_1",
    targetNamespace: "urn:example:target",
    rootElements: [{
      $type: "bpmn:Process",
      id: "Proc_1",
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [{ $type: "$any", $name: { qname: "plain", uri: "" }, $attrs: {}, $body: "hello" }],
      },
    }],
  };
  const projected = io.project(io.hydrate(structuredClone(input), configuration), configuration);
  assert.equal(projected.rootElements[0].extensionElements.values[0].$name.uri, "");
  assert.equal(projected.rootElements[0].extensionElements.values[0].$body, "hello");
});

test("F1 pointers should escape segments per RFC 6901 and keep dots and indexes", () => {
  assert.equal(io.f1Pointer([]), "");
  assert.equal(io.f1Pointer(["rootElements", 0, "extensionElements"]), "/rootElements/0/extensionElements");
  assert.equal(io.f1Pointer(["a.b", "c/d", "e~f"]), "/a.b/c~1d/e~0f");
});

test("F1 diagnostics should target the nearest ID-bearing ancestor for ID-less data", () => {
  const input = {
    $type: "bpmn:Definitions",
    id: "Defs_1",
    targetNamespace: "urn:example:target",
    rootElements: [{
      $type: "bpmn:Process",
      id: "Proc_1",
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [{ $type: "$any", $name: { qname: "ext:note", uri: EXT }, $attrs: { $parent: "x" } }],
      },
    }],
  };
  assert.throws(() => io.hydrate(input, configuration), (error) => (
    error.code === "reserved-name"
    && error.path === "$.rootElements[0].extensionElements.values[0].$attrs.$parent"
    && Array.isArray(error.ids)
    && error.ids[0] === "Proc_1"
  ));
});
