import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

for (const subpath of ["", "/io", "/layout", "/react", "/assistant-ui", "/browser"]) test(`built ${subpath || "root"} declarations compile for an isolated strict consumer without private shims`, () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "io-consumer-"));
  try {
    cpSync(join(root, "dist"), join(dir, "package/dist"), { recursive: true });
    cpSync(join(root, "package.json"), join(dir, "package/package.json"));
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    const source = subpath === "/io" || subpath === "/browser" ? `
import * as entry from "@sentropic/bpmn-canvas${subpath}";
import { createModdle, parseDefinitions, export as exportModel } from "@sentropic/bpmn-canvas${subpath}";
import type { BpmnDefinitions, ModdleElement } from "@sentropic/bpmn-canvas${subpath}";
import { hydrate, project, semanticDescriptor, ModdleJsonError } from "@sentropic/bpmn-canvas${subpath}";
import type { JsonCodecConfiguration, ModdleJsonElement } from "@sentropic/bpmn-canvas${subpath}";
import { serializeBpmn } from "@sentropic/bpmn-canvas${subpath}";
import type { BpmnXmlOptions } from "@sentropic/bpmn-canvas${subpath}";
const config: JsonCodecConfiguration = { contractVersion: "1", defaults: "explicit", descriptors: { sem: semanticDescriptor } };
const json: ModdleJsonElement = { $type: "bpmn:Definitions", id: "Defs", rootElements: [] };
const model: BpmnDefinitions = hydrate(json, config);
const projected: ModdleJsonElement = project(model, config);
const xmlOptions: BpmnXmlOptions = { format: true, preamble: true };
const directXml: Uint8Array = await serializeBpmn(model, xmlOptions);
const path: string = new ModdleJsonError("dangling-reference", "$.rootElements", "Missing reference").path;
void projected; void path; void directXml;
const moddle = createModdle();
const task: ModdleElement = moddle.create("bpmn:Task", { id: "Task" });
const parsed = await moddle.fromXML("<xml />");
const definitions: BpmnDefinitions = parsed.rootElement;
const xml: string = (await moddle.toXML(definitions, { format: true })).xml;
const bytes: Uint8Array = await exportModel((await parseDefinitions(xml)).rootElement, "bpmn");
void task; void bytes; void entry;
` : `import * as entry from "@sentropic/bpmn-canvas${subpath}"; void entry;`;
    writeFileSync(join(dir, "package/consumer.ts"), source);
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: false, noEmit: true, types: [] }, files: ["package/consumer.ts"] }));
    const result = spawnSync("node", [join(root, "node_modules/typescript/bin/tsc"), "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
