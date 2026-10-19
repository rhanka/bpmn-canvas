import { test } from "node:test";
import assert from "node:assert/strict";
import * as io from "../dist/io/index.js";
import { configuration } from "./helpers/workbench.mjs";

const MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const EXT = "urn:example:ext";
const envelope = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="${MODEL}" id="Defs_1" targetNamespace="urn:example:target">${inner}</bpmn:definitions>`;
const defsWithValues = (values) => ({
  $type: "bpmn:Definitions",
  id: "Defs_1",
  targetNamespace: "urn:example:target",
  rootElements: [{
    $type: "bpmn:Process",
    id: "Proc_1",
    extensionElements: { $type: "bpmn:ExtensionElements", values },
  }],
});

function safetyRefusal(input, code) {
  const text = typeof input === "string" ? input : io.decodeF1Bytes(input).text;
  assert.throws(() => io.assertF1XmlSafety(text), (error) => error instanceof io.IoError && error.code === code);
}

test("F1 safety should refuse DOCTYPE before native construction", () => {
  const xml = `<?xml version="1.0"?><!DOCTYPE definitions [<!ENTITY e "x">]><bpmn:definitions xmlns:bpmn="${MODEL}" id="D1" targetNamespace="urn:x"/>`;
  safetyRefusal(xml, "xml-doctype-forbidden");
  safetyRefusal(new TextEncoder().encode(xml), "xml-doctype-forbidden");
  assert.rejects(
    () => io.parseF1Xml(xml, configuration),
    (error) => error instanceof io.IoError && error.code === "xml-doctype-forbidden",
  );
});

test("F1 safety should refuse standalone ENTITY declarations with their own code", () => {
  const xml = `<?xml version="1.0"?><!ENTITY e "x"><bpmn:definitions xmlns:bpmn="${MODEL}" id="D1" targetNamespace="urn:x"/>`;
  safetyRefusal(xml, "xml-entity-declaration-forbidden");
});

test("F1 safety should refuse undeclared and mixed-case named references", () => {
  safetyRefusal(envelope(`<bpmn:process id="P1" name="a&unknown;b"/>`), "xml-entity-reference-unsupported");
  safetyRefusal(envelope(`<bpmn:process id="P1" name="a&Amp;b"/>`), "xml-entity-reference-unsupported");
});

test("F1 tag integrity should refuse duplicate keys and namespaces before construction", () => {
  assert.throws(
    () => io.assertF1TagIntegrity(envelope(`<bpmn:process id="P1" id="P2"/>`)),
    (error) => error instanceof io.IoError && error.code === "duplicate-key",
  );
  assert.throws(
    () => io.assertF1TagIntegrity(`<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="${MODEL}" xmlns:ext="${EXT}" xmlns:ext="${EXT}" id="D1" targetNamespace="urn:x"/>`),
    (error) => error instanceof io.IoError && error.code === "duplicate-namespace",
  );
  assert.throws(
    () => io.assertF1TagIntegrity(`<a xmlns:p="urn:x" xmlns:p="urn:y"/>`),
    (error) => error instanceof io.IoError && error.code === "duplicate-namespace",
  );
  assert.throws(
    () => io.assertF1TagIntegrity(`<a xmlns="urn:x" xmlns="urn:y"/>`),
    (error) => error instanceof io.IoError && error.code === "duplicate-namespace",
  );
  // Nested shadowing across elements stays legal: only same-tag redeclaration refuses.
  io.assertF1TagIntegrity(envelope(`<bpmn:process id="P1"><bpmn:extensionElements><thing xmlns="urn:example:ext"><inner xmlns=""><plain/></inner></thing></bpmn:extensionElements></bpmn:process>`));
  // A repeated key on a later sibling still refuses.
  assert.throws(
    () => io.assertF1TagIntegrity(`<a><b id="1" id="2"/></a>`),
    (error) => error instanceof io.IoError && error.code === "duplicate-key",
  );
});

test("F1 tag integrity should refuse unbound prefixes with scope tracking", () => {
  assert.throws(
    () => io.assertF1TagIntegrity(envelope(`<bpmn:process id="P1"><bpmn:extensionElements><foo:note id="N1">hi</foo:note></bpmn:extensionElements></bpmn:process>`)),
    (error) => error instanceof io.IoError && error.code === "unbound-prefix",
  );
  assert.throws(
    () => io.assertF1TagIntegrity(envelope(`<bpmn:process id="P1" foo:level="high"/>`)),
    (error) => error instanceof io.IoError && error.code === "unbound-prefix",
  );
  // Declarations on the tag itself are in scope for that tag; xml: needs none.
  io.assertF1TagIntegrity(envelope(`<bpmn:process id="P1"><bpmn:extensionElements><ext:thing xmlns:ext="urn:example:ext" ext:level="high"/></bpmn:extensionElements></bpmn:process>`));
  io.assertF1TagIntegrity(envelope(`<bpmn:process id="P1" xml:lang="en"/>`));
  // A prefix that leaves scope with its element is unbound afterwards.
  assert.throws(
    () => io.assertF1TagIntegrity(`<a><b xmlns:p="urn:x"><c/></b><p:d/></a>`),
    (error) => error instanceof io.IoError && error.code === "unbound-prefix",
  );
});

test("F1 tag integrity should surface through parseF1Xml with document pointers", async () => {
  await assert.rejects(
    () => io.parseF1Xml(envelope(`<bpmn:process id="P1" id="P2"/>`), configuration),
    (error) => error.code === "duplicate-key",
  );
  await assert.rejects(
    () => io.parseF1Xml(envelope(`<bpmn:process id="P1" foo:level="high"/>`), configuration),
    (error) => error.code === "unbound-prefix",
  );
  await assert.rejects(
    () => io.parseF1Xml(`<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="${MODEL}" xmlns:ext="${EXT}" xmlns:ext="urn:example:other" id="Defs_1" targetNamespace="urn:example:target"><bpmn:process id="P1"/></bpmn:definitions>`),
    (error) => error.code === "duplicate-namespace",
  );
});

test("F1 safety should accept the five predefined references with native uppercase variants", async () => {
  const xml = envelope(`<bpmn:process id="P1" name="a&amp;b&lt;c&gt;d&quot;e&apos;f&AMP;g&LT;h&GT;i&QUOT;j&APOS;k"/>`);
  io.assertF1XmlSafety(xml);
  const parsed = await io.parseF1Xml(xml, configuration);
  assert.equal(parsed.rootElement.rootElements[0].name, "a&b<c>d\"e'f&g<h>i\"j'k");
  assert.deepEqual(parsed.diagnostics, []);
});

test("F1 safety should decode numeric references with pinned native semantics", async () => {
  const read = async (entity) => {
    const xml = envelope(`<bpmn:process id="P1" name="a${entity}b"/>`);
    io.assertF1XmlSafety(xml);
    return (await io.parseF1Xml(xml, configuration)).rootElement.rootElements[0].name;
  };
  // The native decoder keeps the low 16 bits: astral references truncate.
  assert.equal(await read("&#x1F600;"), "a\uf600b");
  assert.equal(await read("&#65;"), "aAb");
  assert.equal(await read("&#0;"), "a\0b");
  assert.equal(await read("&#xD800;"), "a\ud800b");
  const truncated = io.scanF1XmlLosses(envelope(`<bpmn:process id="P1" name="a&#x1F600;b"/>`));
  assert.equal(truncated.length, 1);
  assert.equal(truncated[0].code, "moddle-content-normalized");
  assert.ok(truncated[0].message.includes("U+F600"));
  assert.deepEqual(io.scanF1XmlLosses(envelope(`<bpmn:process id="P1" name="a&#65;b"/>`)), []);
});

test("F1 safety should ignore entity-like text inside CDATA when scanning", () => {
  const xml = envelope(`<bpmn:process id="P1"><bpmn:extensionElements><bpmn:documentation><![CDATA[a&unknown;b]]></bpmn:documentation></bpmn:extensionElements></bpmn:process>`);
  io.assertF1XmlSafety(xml);
});

test("F1 encoding should decode declared ISO-8859-1 with the true byte mapping", () => {
  const head = new TextEncoder().encode(`<?xml version="1.0" encoding="ISO-8859-1"?><x>`);
  const tail = new TextEncoder().encode("</x>");
  const joined = new Uint8Array([...head, 0xe9, 0x85, ...tail]);
  const decoded = io.decodeF1Bytes(joined);
  assert.equal(decoded.encoding, "ISO-8859-1");
  assert.ok(decoded.text.includes("é"));
  assert.ok(decoded.text.includes(""));
  assert.ok(!decoded.text.includes("…"));
});

test("F1 encoding should refuse unsupported labels and malformed UTF-8", () => {
  const shifted = new TextEncoder().encode(`<?xml version="1.0" encoding="SHIFT_JIS"?><x/>`);
  assert.throws(() => io.decodeF1Bytes(shifted), (error) => error instanceof io.IoError && error.code === "unsupported-encoding");
  assert.throws(() => io.decodeF1Bytes(new Uint8Array([0x3c, 0x78, 0xff, 0x3e])), (error) => error instanceof io.IoError && error.code === "invalid-encoding");
});

test("F1 encoding registry should expose exactly the supported labels", () => {
  const registry = io.F1_ENCODING_REGISTRY;
  const labels = registry.flatMap((entry) => entry.labels.map((label) => label.toLowerCase())).sort();
  assert.deepEqual(labels, ["iso-8859-1", "latin1", "utf-8", "utf8"]);
  assert.ok(Object.isFrozen(registry));
});

test("F1 limits should refuse oversized raw input at limit plus one", () => {
  const limit = io.F1_LIMITS.maxRawBytes;
  assert.equal(limit, 67108864);
  const make = (size) => new Uint8Array(size).fill(0x61);
  assert.throws(() => io.assertF1InputSize(make(limit + 1)), (error) => error.code === "xml-input-size-limit");
  io.assertF1InputSize(make(limit));
  io.assertF1InputSize(make(limit - 1));
});

test("F1 limits should measure objects in UTF-8 JCS bytes with exact boundaries", () => {
  assert.equal(io.canonicalJsonBytes({}), 2);
  assert.equal(io.canonicalJsonBytes({ b: 1, a: "x" }), 15);
  assert.equal(io.canonicalJsonBytes("é"), 4);
  const unit = io.F1_LIMITS.maxObjectBytes;
  const fitting = {
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
        values: [{ $type: "$any", $name: { qname: "ext:note", uri: EXT }, $attrs: {}, $body: "" }],
      },
    }],
  };
  const overhead = io.canonicalJsonBytes(fitting);
  fitting.rootElements[0].extensionElements.values[0].$body = "v".repeat(unit - overhead);
  assert.equal(io.canonicalJsonBytes(fitting), unit);
  io.hydrate(fitting, configuration);
  fitting.rootElements[0].extensionElements.values[0].$body += "v";
  assert.equal(io.canonicalJsonBytes(fitting), unit + 1);
  assert.throws(() => io.hydrate(fitting, configuration), (error) => error.code === "xml-input-size-limit");
});

test("F1 limits should enforce nesting depth with root counting as one", () => {
  const nest = (wraps) => {
    let child = { $type: "$any", $name: { qname: "ext:leaf", uri: EXT }, $attrs: {} };
    for (let level = 0; level < wraps; level++) {
      child = { $type: "$any", $name: { qname: "ext:node", uri: EXT }, $attrs: {}, $children: [child] };
    }
    return child;
  };
  assert.throws(() => io.hydrate(defsWithValues([nest(253)]), configuration), (error) => error.code === "xml-depth-limit");
  io.hydrate(defsWithValues([nest(252)]), configuration);
});

test("F1 limits should enforce one million elements on direct traversal", () => {
  const values = [];
  for (let index = 0; index < 1000001; index++) {
    values.push({ $type: "$any", $name: { qname: "e:n", uri: "u" }, $attrs: {} });
  }
  const input = defsWithValues(values);
  assert.ok(io.canonicalJsonBytes(input) < io.F1_LIMITS.maxObjectBytes);
  assert.equal(io.F1_LIMITS.maxElements, 1000000);
  assert.throws(() => io.hydrate(input, configuration), (error) => error.code === "xml-element-count-limit");
}, { timeout: 120000 });

test("F1 limits should enforce 1024 attributes per element including declarations", () => {
  const attrs = {};
  for (let index = 0; index < 1025; index++) attrs[`ext:a${index}`] = "v";
  const input = defsWithValues([{ $type: "$any", $name: { qname: "ext:node", uri: EXT }, $attrs: attrs }]);
  assert.throws(() => io.hydrate(input, configuration), (error) => error.code === "xml-attribute-count-limit");
  const allowed = defsWithValues([{
    $type: "$any",
    $name: { qname: "ext:node", uri: EXT },
    $attrs: Object.fromEntries(Object.entries(attrs).slice(0, 1024)),
  }]);
  assert.equal(io.hydrate(allowed, configuration).rootElements[0].extensionElements.values[0]["ext:a0"], "v");
  const inside = defsWithValues([{
    $type: "$any",
    $name: { qname: "ext:node", uri: EXT },
    $attrs: Object.fromEntries(Object.entries(attrs).slice(0, 1023)),
  }]);
  io.hydrate(inside, configuration);
});

test("F1 limits should enforce UTF-16 length on attribute names and values", () => {
  const unit = io.F1_LIMITS.maxAttributeUtf16Units;
  assert.equal(unit, 1048576);
  const longValue = "v".repeat(unit + 1);
  assert.throws(
    () => io.hydrate(defsWithValues([{ $type: "$any", $name: { qname: "ext:node", uri: EXT }, $attrs: { id: longValue } }]), configuration),
    (error) => error.code === "xml-attribute-length-limit",
  );
  const edge = "v".repeat(unit);
  const kept = io.hydrate(defsWithValues([{ $type: "$any", $name: { qname: "ext:node", uri: EXT }, $attrs: { id: edge } }]), configuration);
  assert.equal(kept.rootElements[0].extensionElements.values[0].id, edge);
  const inside = "v".repeat(unit - 1);
  const alsoKept = io.hydrate(defsWithValues([{ $type: "$any", $name: { qname: "ext:node", uri: EXT }, $attrs: { id: inside } }]), configuration);
  assert.equal(alsoKept.rootElements[0].extensionElements.values[0].id, inside);
});
