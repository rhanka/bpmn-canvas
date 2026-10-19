import { test } from "node:test";
import assert from "node:assert/strict";
import { BpmnModdle } from "bpmn-moddle";
import * as io from "../dist/io/index.js";
import { assertF1XmlLimits } from "../dist/io/f1-extensions.js";
import { configuration } from "./helpers/workbench.mjs";

const MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const options = { format: false, preamble: false };
const xml = (inner, before = "") => `${before}<bpmn:definitions xmlns:bpmn="${MODEL}" targetNamespace="urn:test">${inner}</bpmn:definitions>`;
const extensions = (inner) => xml(`<bpmn:extensionElements>${inner}</bpmn:extensionElements>`);
const json = (values) => ({
  $type: "bpmn:Definitions", targetNamespace: "urn:test",
  extensionElements: { $type: "bpmn:ExtensionElements", values },
});
const any = (attrs = {}, body) => ({
  $type: "$any", $name: { qname: "x:note", uri: "urn:test:ext" }, $attrs: attrs,
  ...(body === undefined ? {} : { $body: body }),
});
const refusal = (code) => (error) => error instanceof io.IoError && error.code === code;
function nativeAny(name = "x:note", uri = "urn:test:ext", attrs = {}) {
  const moddle = new BpmnModdle(structuredClone(configuration.descriptors));
  const root = moddle.create("bpmn:Definitions", { targetNamespace: "urn:test" });
  const note = moddle.createAny(name, uri, attrs);
  root.extensionElements = moddle.create("bpmn:ExtensionElements", { values: [note] });
  return { root, note, moddle };
}

for (const depth of [255, 256, 257]) {
  test(`J3 #15 XML depth ${depth} should enforce the limit before construction`, async () => {
    const input = extensions('<x:n xmlns:x="urn:test:ext">' + "<x:n>".repeat(depth - 3) + "</x:n>".repeat(depth - 2));
    if (depth > 256) await assert.rejects(() => io.parseF1Xml(input, configuration), refusal("xml-depth-limit"));
    else assert.ok((await io.parseF1Xml(input, configuration)).rootElement);
  });
}
for (const count of [1023, 1024, 1025]) {
  test(`J3 #15 XML attributes ${count} should count declarations before construction`, async () => {
    const attrs = Array.from({ length: count - 1 }, (_, i) => `a${i}="v"`).join(" ");
    const input = extensions(`<x:n xmlns:x="urn:test:ext" ${attrs}/>`);
    if (count > 1024) await assert.rejects(() => io.parseF1Xml(input, configuration), refusal("xml-attribute-count-limit"));
    else assert.ok((await io.parseF1Xml(input, configuration)).rootElement);
  });
}
for (const length of [1048575, 1048576, 1048577]) {
  test(`J3 #15 XML attribute length ${length} should bound UTF-16 units`, async () => {
    const input = extensions(`<x:n xmlns:x="urn:test:ext" value="${"v".repeat(length)}"/>`);
    if (length > 1048576) await assert.rejects(() => io.parseF1Xml(input, configuration), refusal("xml-attribute-length-limit"));
    else assert.ok((await io.parseF1Xml(input, configuration)).rootElement);
  });
}
test("J3 #15 hydrate should refuse 6000 levels without a stack overflow", () => {
  const top = any();
  let cursor = top;
  for (let i = 0; i < 6000; i++) { const child = any(); cursor.$children = [child]; cursor = child; }
  assert.throws(() => io.hydrate(json([top]), configuration), refusal("xml-depth-limit"));
});
test("J3 #15 F7 should enforce projected object size before invoking the writer", async () => {
  const { root, note, moddle } = nativeAny();
  note.$body = "\\".repeat(1024 * 1024);
  root.extensionElements.values = Array.from({ length: 33 }, () => {
    const child = moddle.createAny("x:note", "urn:test:ext", {}); child.$body = note.$body; return child;
  });
  await assert.rejects(() => io.serializeBpmn(root, options), refusal("xml-input-size-limit"));
});
test("J3 #15 all boundaries should count typed and foreign attributes together", async () => {
  for (const count of [1023, 1024, 1025]) {
    const attrs = Object.fromEntries(Array.from({ length: count - 1 }, (_, i) => [`a${i}`, "v"]));
    const input = { $type: "bpmn:Definitions", targetNamespace: "urn:test", $attrs: attrs };
    const { root } = nativeAny(); Object.assign(root.$attrs, attrs);
    if (count > 1024) {
      assert.throws(() => io.hydrate(input, configuration), refusal("xml-attribute-count-limit"));
      assert.throws(() => io.project(root, configuration), refusal("xml-attribute-count-limit"));
      await assert.rejects(() => io.serializeBpmn(root, options), refusal("xml-attribute-count-limit"));
    } else {
      io.hydrate(input, configuration); io.project(root, configuration); await io.serializeBpmn(root, options);
    }
  }
});
test("J3 #15 all boundaries should enforce typed attribute UTF-16 length", async () => {
  for (const length of [1048575, 1048576, 1048577]) {
    const targetNamespace = "v".repeat(length);
    const input = { $type: "bpmn:Definitions", targetNamespace };
    const { root } = nativeAny(); root.targetNamespace = targetNamespace;
    if (length > 1048576) {
      assert.throws(() => io.hydrate(input, configuration), refusal("xml-attribute-length-limit"));
      assert.throws(() => io.project(root, configuration), refusal("xml-attribute-length-limit"));
      await assert.rejects(() => io.serializeBpmn(root, options), refusal("xml-attribute-length-limit"));
    } else {
      io.hydrate(input, configuration); io.project(root, configuration); await io.serializeBpmn(root, options);
    }
  }
});
test("J3 #15 tokenizer should count one million elements without constructing a tree", () => {
  for (const count of [999999, 1000000, 1000001]) {
    const input = "<n>" + "<n/>".repeat(count - 1) + "</n>";
    if (count > 1000000) assert.throws(() => assertF1XmlLimits(input), refusal("xml-element-count-limit"));
    else assertF1XmlLimits(input);
  }
});
test("J3 #15 F7 should use exact JCS byte boundaries without allocating serialized JSON", async () => {
  const { root, note } = nativeAny(); note.$body = "";
  const overhead = io.canonicalJsonBytes(io.project(root, configuration));
  let calls = 0;
  root.$model.toXML = async () => { calls++; return { xml: "" }; };
  for (const delta of [-1, 0, 1]) {
    note.$body = "v".repeat(io.F1_LIMITS.maxObjectBytes - overhead + delta);
    if (delta > 0) await assert.rejects(() => io.serializeBpmn(root, options), refusal("xml-input-size-limit"));
    else await io.serializeBpmn(root, options);
  }
  assert.equal(calls, 2);
});
test("J3 #15 XML should enforce object size even when raw and decoded sizes fit", async () => {
  const body = "\\".repeat(1024 * 1024);
  const input = extensions(`<x:n xmlns:x="urn:test:ext">${Array.from({ length: 33 }, () => `<x:n>${body}</x:n>`).join("")}</x:n>`);
  assert.ok(Buffer.byteLength(input) < io.F1_LIMITS.maxRawBytes);
  await assert.rejects(() => io.parseF1Xml(input, configuration), refusal("xml-input-size-limit"));
});

for (const hint of ['<!-- encoding="latin1" -->', '<?hint encoding="latin1"?>', ""]) {
  test(`J3 #16 encoding should ignore ${hint ? "nondeclaration " + hint.slice(0, 4) : "ordinary attribute"}`, async () => {
    const input = xml(`<bpmn:process id="P" name="é"${hint ? "" : ' encoding="latin1"'}/>`, hint);
    const parsed = await io.parseF1Xml(new TextEncoder().encode(input), configuration);
    assert.equal(parsed.rootElement.rootElements[0].name, "é");
  });
}
test("J3 #16 encoding should honor only an initial declaration including BOM", async () => {
  for (const bom of ["", "\ufeff"]) {
    const input = xml('<bpmn:process id="P" name="é"/>', bom + '<?xml version="1.0" encoding="UTF-8"?>');
    assert.equal((await io.parseF1Xml(new TextEncoder().encode(input), configuration)).rootElement.rootElements[0].name, "é");
  }
  const input = xml('<bpmn:process id="P" name="é"/>', '<?xml version="1.0" encoding="ISO-8859-1"?>');
  assert.equal((await io.parseF1Xml(Buffer.from(input, "latin1"), configuration)).rootElement.rootElements[0].name, "é");
});

test("J3 #17 reserved attributes should allow attribute-shaped documentation", async () => {
  const parsed = await io.parseF1Xml(xml('<bpmn:documentation>Use get="abc" here</bpmn:documentation>'), configuration);
  assert.equal(parsed.rootElement.documentation[0].text, 'Use get="abc" here');
  await assert.rejects(() => io.parseF1Xml(xml('<bpmn:process get="abc"/>'), configuration), refusal("reserved-name"));
});
for (const name of ["foo_bar", "_foo", "é", "a.b", "a-b", "a:b", "\u{10000}"]) {
  test(`J3 #17 entity ${name} should be refused before native construction`, async () => {
    await assert.rejects(() => io.parseF1Xml(xml(`<bpmn:process name="&${name};"/>`), configuration), refusal("xml-entity-reference-unsupported"));
  });
}
test("J3 #17 entity and reserved scans should exempt comments PI and CDATA", async () => {
  const parsed = await io.parseF1Xml(xml('<bpmn:documentation><![CDATA[&foo_bar; get="abc"]]></bpmn:documentation>', '<!-- &foo_bar; get="abc" --><?hint &a.b;?>'), configuration);
  assert.equal(parsed.rootElement.documentation[0].text, '&foo_bar; get="abc"');
});

test("J3 #18 XML should reject duplicate expanded attribute names", async () => {
  await assert.rejects(() => io.parseF1Xml(extensions('<x:n xmlns:x="urn:x" xmlns:a="urn:a" xmlns:b="urn:a" a:x="1" b:x="2"/>'), configuration), refusal("duplicate-attribute"));
});
test("J3 #18 namespace aliases should resolve declarations and preserve distinct values", async () => {
  await assert.rejects(() => io.parseF1Xml(extensions('<x:n xmlns:x="urn:x" xmlns:a="urn:&#97;" xmlns:b="urn:a" a:x="1" b:x="2"/>'), configuration), refusal("duplicate-attribute"));
  const parsed = await io.parseF1Xml(extensions('<x:n xmlns:x="urn:x" xmlns:a="urn:a" xmlns:b="urn:b" a:x="1" b:x="2"/>'), configuration);
  const attrs = io.project(parsed.rootElement, configuration).extensionElements.values[0].$attrs;
  assert.equal(attrs["a:x"], "1"); assert.equal(attrs["b:x"], "2");
  const input = json([any({ "xmlns:a": "urn:a", "xmlns:b": "urn:a", "a:x": "1", "b:x": "2" })]);
  assert.throws(() => io.hydrate(input, configuration), refusal("duplicate-attribute"));
  const { root } = nativeAny("x:note", "urn:test:ext", input.extensionElements.values[0].$attrs);
  assert.throws(() => io.project(root, configuration), refusal("duplicate-attribute"));
  await assert.rejects(() => io.serializeBpmn(root, options), refusal("duplicate-attribute"));
});
test("J3 #18 JSON and F7 should refuse foreign attributes colliding with declared names", async () => {
  const input = json([]); input.name = "typed"; input.$attrs = { "bpmn:name": "foreign" };
  assert.throws(() => io.hydrate(input, configuration), refusal("duplicate-attribute"));
  const { root } = nativeAny(); root.name = "typed"; root.$attrs["bpmn:name"] = "foreign";
  await assert.rejects(() => io.serializeBpmn(root, options), refusal("duplicate-attribute"));
});
test("J3 #18 project should refuse native foreign attributes colliding with declared names", () => {
  const { root } = nativeAny(); root.name = "typed"; root.$attrs["bpmn:name"] = "foreign";
  assert.throws(() => io.project(root, configuration), refusal("duplicate-attribute"));
});
test("J3 #18 F7 should refuse a declared attribute overwrite independently of hydration", async () => {
  const { root } = nativeAny(); root.name = "typed"; root.$attrs["bpmn:name"] = "foreign";
  await assert.rejects(() => io.serializeBpmn(root, options), refusal("duplicate-attribute"));
});
test("J3 #18 generic local rebinding should survive project and hydrate", async () => {
  const parsed = await io.parseF1Xml(extensions('<x:n xmlns:x="urn:x" xmlns:bpmn="urn:local"><bpmn:child bpmn:value="kept"/></x:n>'), configuration);
  const projected = io.project(parsed.rootElement, configuration);
  const rebuilt = io.hydrate(projected, configuration);
  assert.deepEqual(io.project(rebuilt, configuration), projected);
});

test("J3 #19 F7 should refuse malformed generic QName before writing", async () => {
  const { root } = nativeAny("x:bad name");
  await assert.rejects(() => io.serializeBpmn(root, options), refusal("malformed-qname"));
});
for (const [label, uri] of [["NUL", "urn:x\0"], ["surrogate", "urn:x\ud800"]]) {
  test(`J3 #19 F7 should refuse generic namespace ${label} before encoding`, async () => {
    const { root } = nativeAny("x:note", uri);
    await assert.rejects(() => io.serializeBpmn(root, options), refusal("invalid-xml-character"));
  });
}
test("J3 #20 reader to F7 should accept a generic element without namespace URI", async () => {
  const parsed = await io.parseF1Xml(extensions("<note>t</note>"), configuration);
  const note = parsed.rootElement.extensionElements.values[0];
  assert.equal(note.$descriptor.ns.uri, undefined);
  const expected = new TextEncoder().encode((await parsed.rootElement.$model.toXML(parsed.rootElement, options)).xml);
  assert.deepEqual(await io.serializeBpmn(parsed.rootElement, options), expected);
  assert.equal(note.$descriptor.ns.uri, undefined);
});
