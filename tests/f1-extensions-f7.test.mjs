import { test } from "node:test";
import assert from "node:assert/strict";
import * as io from "../dist/io/index.js";
import { createModdle } from "../dist/io/index.js";
import { xmlStructure, xmlDocument } from "./helpers/workbench-xml.mjs";

const text = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

function minimalModel(moddle) {
  const definitions = moddle.create("bpmn:Definitions", { id: "Defs_1", targetNamespace: "urn:example:target" });
  const process = moddle.create("bpmn:Process", { id: "Proc_1" });
  definitions.set("rootElements", [process]);
  return definitions;
}

function genericModel(moddle) {
  const definitions = minimalModel(moddle);
  const note = moddle.createAny("ext:note", "urn:example:ext", { id: "Note_1", "ext:level": "high" });
  note.$body = "hello";
  const inner = moddle.createAny("ext:inner", "urn:example:ext", { id: "Inner_1" });
  inner.$body = "deep";
  inner.$parent = note;
  note.$children = [inner];
  const extensions = moddle.create("bpmn:ExtensionElements", {});
  extensions.set("values", [note]);
  definitions.$attrs["xmlns:ext"] = "urn:example:ext";
  definitions.rootElements[0].set("extensionElements", extensions);
  return definitions;
}

test("F1/F7 writer should pin the minimal document bytes", async () => {
  const bytes = await io.serializeBpmn(minimalModel(createModdle()), { format: false, preamble: false });
  assert.equal(
    text(bytes),
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="urn:example:target"><bpmn:process id="Proc_1" /></bpmn:definitions>`,
  );
});

test("F1/F7 writer should pin generic extension bytes, preamble and formatting", async () => {
  const first = await io.serializeBpmn(genericModel(createModdle()), { format: false, preamble: false });
  const firstText = text(first);
  assert.ok(firstText.includes(`xmlns:ext="urn:example:ext"`));
  assert.ok(firstText.includes("<ext:note"));
  assert.ok(firstText.includes("hello"));
  assert.ok(firstText.includes("<ext:inner"));
  const preamble = await io.serializeBpmn(genericModel(createModdle()), { format: false, preamble: true });
  assert.ok(text(preamble).startsWith(`<?xml version="1.0" encoding="UTF-8"?>`));
  const formatted = await io.serializeBpmn(genericModel(createModdle()), { format: true, preamble: false });
  assert.ok(text(formatted).includes("\n"));
  assert.equal(text(await io.serializeBpmn(genericModel(createModdle()), { format: false, preamble: false })), firstText);
});

test("F1/F7 writer should keep a typed prefixed foreign attribute with its prefix", async () => {
  const moddle = createModdle();
  const definitions = minimalModel(moddle);
  definitions.$attrs["xmlns:ext"] = "urn:example:ext";
  definitions.rootElements[0].$attrs["ext:release"] = "7";
  const first = text(await io.serializeBpmn(definitions, { format: false, preamble: false }));
  assert.ok(first.includes('ext:release="7"'));
  assert.ok(first.includes('xmlns:ext="urn:example:ext"'));
  const reparsed = await moddle.fromXML(first);
  assert.deepEqual(reparsed.warnings, []);
  assert.equal(reparsed.rootElement.rootElements[0].$attrs["ext:release"], "7");
  const second = text(await io.serializeBpmn(reparsed.rootElement, { format: false, preamble: false }));
  assert.equal(second, first);
});

test("F1/F7 writer should match upstream on the generic same-namespace prefix loss", async () => {
  // Upstream parity (D-prefix-parity): the pinned writer strips a generic
  // attribute prefix matching its element namespace (ext:level -> level).
  // The loss is stable: the reparse rewrites byte-identically.
  const moddle = createModdle();
  const first = text(await io.serializeBpmn(genericModel(moddle), { format: false, preamble: false }));
  assert.ok(first.includes('level="high"'));
  assert.ok(!first.includes("ext:level"));
  const reparsed = await moddle.fromXML(first);
  assert.deepEqual(reparsed.warnings, []);
  const note = reparsed.rootElement.rootElements[0].extensionElements.values[0];
  assert.equal(note.level, "high");
  const second = text(await io.serializeBpmn(reparsed.rootElement, { format: false, preamble: false }));
  assert.equal(second, first);
});

test("F1/F7 writer should refuse unencodable strings before encoding", async () => {
  const bad = ["a\0b", "a\ud800b", "a\udc00b", "a\x01b", "a\ufffeb", "a\uffffb"];
  for (const value of bad) {
    const moddle = createModdle();
    const model = minimalModel(moddle);
    model.rootElements[0].set("name", value);
    await assert.rejects(() => io.serializeBpmn(model, { format: false, preamble: false }), (error) => error.code === "invalid-xml-character");
    const generic = genericModel(createModdle());
    generic.rootElements[0].extensionElements.values[0].$body = value;
    await assert.rejects(() => io.serializeBpmn(generic, { format: false, preamble: false }), (error) => error.code === "invalid-xml-character");
  }
  const moddle = createModdle();
  const ok = minimalModel(moddle);
  ok.rootElements[0].set("name", "a\tb\nc\rd \u{1F600}");
  const bytes = await io.serializeBpmn(ok, { format: false, preamble: false });
  // The pinned writer escapes LF as a character reference and keeps TAB, CR
  // and valid supplementary characters literal; all three write without refusal.
  assert.ok(text(bytes).includes("a\tb&#10;c\rd \u{1F600}"));
  const reparsed = await moddle.fromXML(text(bytes));
  assert.equal(reparsed.rootElement.rootElements[0].name, "a\tb\nc\rd \u{1F600}");
});

test("F1/F7 writer should refuse generic reference targets and shared containment", async () => {
  const moddle = createModdle();
  const model = minimalModel(moddle);
  const note = moddle.createAny("ext:note", "urn:example:ext", { id: "Note_1" });
  const extensions = moddle.create("bpmn:ExtensionElements", {});
  extensions.set("values", [note]);
  model.rootElements[0].set("extensionElements", extensions);
  const flow = moddle.create("bpmn:SequenceFlow", { id: "Flow_1" });
  flow.set("sourceRef", note);
  model.rootElements[0].set("flowElements", [flow]);
  await assert.rejects(() => io.serializeBpmn(model, { format: false, preamble: false }), (error) => error.code === "invalid-reference");
});

test("F1/F7 writer should keep native parse/write structurally stable on generics", async () => {
  const moddle = createModdle();
  const bytes = await io.serializeBpmn(genericModel(moddle), { format: false, preamble: false });
  const reparsed = await moddle.fromXML(text(bytes));
  const rewritten = text(await io.serializeBpmn(reparsed.rootElement, { format: false, preamble: false }));
  assert.equal(rewritten, text(bytes));
  assert.deepEqual(xmlStructure(xmlDocument(bytes)), xmlStructure(xmlDocument(new TextEncoder().encode(rewritten))));
});

test("F1/F7 comparison helper should resolve unprefixed xsi types against the default namespace", () => {
  const doc = xmlDocument(new TextEncoder().encode(
    `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><process id="P1" xsi:type="Process"/></definitions>`,
  ));
  const structure = xmlStructure(doc);
  assert.deepEqual(structure.attrs, []);
  const discriminator = structure.children[0].attrs.find((entry) => entry[0][0] === "http://www.w3.org/2001/XMLSchema-instance");
  assert.deepEqual(discriminator, [["http://www.w3.org/2001/XMLSchema-instance", "type"], ["http://www.omg.org/spec/BPMN/20100524/MODEL", "Process"]]);
});
