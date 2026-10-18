import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BpmnModdle } from "bpmn-moddle";
import * as io from "../../dist/io/index.js";
import { readReferencePages } from "../../dist/io/reference-model.js";

export { io, readReferencePages };
export const descriptor = JSON.parse(readFileSync(new URL("../fixtures/io/reference/semantics.json", import.meta.url)));
export const config = { host: "test-host", drawio: { agent: "test-agent" }, sparx: { exporter: "test-exporter", exporterVersion: "9.9" } };
export const text = (bytes) => new TextDecoder().decode(bytes);
export const fixture = (c, file = "semantic.bpmn") => readFileSync(new URL(`../fixtures/io/reference/${c}/${file}`, import.meta.url), "utf8");
export async function model(c = "C1") {
  const moddle = new BpmnModdle({ sem: descriptor });
  const parsed = await moddle.fromXML(fixture(c));
  assert.deepEqual(parsed.warnings, []);
  return { ...parsed, moddle, definitions: parsed.rootElement };
}
export const info = (e) => e.extensionElements?.values.find((v) => v.$type === "sem:Info");
export function replaceType(m, id, type) {
  const old = m.elementsById[id];
  const replacement = m.moddle.create(type);
  const keys = new Set(replacement.$descriptor.properties.map((p) => p.name));
  for (const key of keys) if (old[key] !== undefined) replacement[key] = old[key];
  replacement.$parent = old.$parent;
  const seen = new Set();
  function visit(obj) {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return;
    seen.add(obj);
    for (const key of new Set([...Object.keys(obj), ...(obj.$descriptor?.properties ?? []).map((p) => p.name)])) {
      if (obj[key] === old) obj[key] = replacement;
      else visit(obj[key]);
    }
  }
  visit(m.definitions);
  m.elementsById[id] = replacement;
  return replacement;
}
export const pages = (m) => readReferencePages(m.definitions);
export async function outputs(m) {
  io.initializeCodecs(config);
  return { drawio: text(await io.export(m.definitions, "drawio")), sparx: text(await io.export(m.definitions, "sparx")) };
}
export async function refuses(m, code, ids) {
  for (const format of ["drawio", "sparx"]) await assert.rejects(() => io.export(m.definitions, format), (e) => {
    assert.ok(e instanceof io.IoError);
    assert.equal(e.code, code);
    assert.deepEqual(e.ids, ids);
    return true;
  });
}
export function freezeGraph(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) freezeGraph(value[key], seen);
  Object.freeze(value);
}
