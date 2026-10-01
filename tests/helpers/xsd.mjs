import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateXML } from "xmllint-wasm";

const BASE = "https://www.omg.org/spec/BPMN/20100501/";
// Order matters: the main schema first. Hashes: tests/fixtures/xsd/SOURCE.md.
const FILES = [
  ["BPMN20.xsd", "a07c159cb0594573dd7c97b1370dd116112378f377e43c89a8bf512ac5030705"],
  ["Semantic.xsd", "c4318842f7d2bbc262d7954c9452c501db16f0868eac0b8732ec5d7fb384d9a7"],
  ["BPMNDI.xsd", "f0dff1cd559d1514d8ebfc8c646f58402bcaced27ec22e2aa6456c2dcc80b038"],
  ["DC.xsd", "a2f90e5ad9bb48c6915e4e034b4e27ac838264a1d4f27bfc70dbdfc69351312d"],
  ["DI.xsd", "8220b179c175572df74e08a51bffabe957867962035cee7b5fee0b6acb4c4498"],
];

const sha = (s) => createHash("sha256").update(s).digest("hex");
const cacheDir = fileURLToPath(new URL("../../node_modules/.cache/bpmn-xsd/", import.meta.url));

async function loadFile(dir, name, expected) {
  const path = join(dir, name);
  let text = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (text === undefined) {
    if (dir !== cacheDir) throw new Error(`${path} not found`);
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`download ${BASE + name} failed: HTTP ${res.status}`);
    text = Buffer.from(await res.arrayBuffer()).toString("utf8");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, text);
  }
  const actual = sha(text);
  if (actual !== expected) throw new Error(`${name}: sha256 ${actual} does not match pinned ${expected}`);
  return { fileName: name, contents: text };
}

let schemas;
async function getSchemas() {
  schemas ??= (async () => {
    const dir = process.env.BPMN_XSD_DIR ? process.env.BPMN_XSD_DIR.replace(/\/?$/, "/") : cacheDir;
    return Promise.all(FILES.map(([n, h]) => loadFile(dir, n, h)));
  })();
  return schemas;
}

/** Validate a BPMN 2.0 document against the OMG XSD set. Throws if the schemas cannot be loaded and verified. */
export async function validateBpmnXsd(xml) {
  const [main, ...rest] = await getSchemas();
  const result = await validateXML({
    xml: [{ fileName: "doc.bpmn", contents: xml }],
    schema: [main],
    preload: rest,
  });
  return { valid: result.valid, errors: result.errors.map((e) => e.rawMessage ?? String(e)) };
}
