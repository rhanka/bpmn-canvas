// Runner for independently sealed F1 expectations (format f1-expectations/1).
//
// Another author sealed vectors into tests/fixtures/f1-extensions/expectations/
// on another branch; nothing here owns those bytes. This helper discovers the
// sealed files, verifies the seal (byte length + SHA-256 per seal.json) and
// executes every vector against the F1 runtime, returning the observed outcome
// in a canonical shape. Comparison against sealed bytes happens in the test so
// a mismatch stays a recorded dispute, never a silent reseal.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTATIONS = new URL("../fixtures/f1-extensions/expectations/", import.meta.url);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Sealed vector files (`NN-*.json`), sorted. The seal and README are not vectors. */
export function sealedVectorFiles() {
  let entries;
  try {
    entries = readdirSync(EXPECTATIONS, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^\d\d-.*\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Recompute byte length and SHA-256 of every file listed in seal.json and
 * compare with the sealed values. Reads sealed bytes only; executes no codec.
 * Throws on any drift, missing or extra listed file.
 */
export function verifySeal(root = EXPECTATIONS) {
  const directory = root instanceof URL ? fileURLToPath(root) : resolve(root);
  const refuse = reason => { throw new Error(`seal ${reason}`); };
  const safe = path => {
    if (typeof path !== "string" || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) ||
      path.split("/").some(part => part === "." || part === "..")) refuse("unsafe path");
    return path;
  };
  const inventory = [];
  function walk(path, relative = "") {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) refuse("linked entry");
    if (stat.isDirectory()) {
      const names = readdirSync(path).sort();
      if (!names.length) refuse("empty inventory directory");
      for (const name of names) walk(join(path, name), relative ? `${relative}/${name}` : name);
    } else {
      if (!stat.isFile() || stat.nlink !== 1) refuse("nonregular or linked entry");
      inventory.push(safe(relative));
    }
  }
  walk(directory);
  const seal = JSON.parse(readFileSync(join(directory, "seal.json"), "utf8"));
  if (seal.format !== "f1-expectations-seal/1" || !Array.isArray(seal.files) ||
    JSON.stringify(seal.excluded) !== '["seal.json"]') refuse("format");
  const paths = seal.files.map(file => {
    if (!file || Object.keys(file).sort().join(",") !== "bytes,path,sha256" ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) refuse("entry shape");
    return safe(file.path);
  });
  if (new Set(paths).size !== paths.length || paths.includes("seal.json")) refuse("duplicate entry");
  if (JSON.stringify(inventory.sort()) !== JSON.stringify([...paths, "seal.json"].sort())) refuse("inventory mismatch");
  const checked = [];
  for (const file of seal.files) {
    const bytes = readFileSync(join(directory, file.path));
    const observed = { path: file.path, bytes: bytes.length, sha256: sha256(bytes) };
    if (observed.bytes !== file.bytes || observed.sha256 !== file.sha256) {
      throw new Error(`seal drift in ${file.path}: observed ${observed.bytes} bytes ${observed.sha256}`);
    }
    checked.push(observed);
  }
  return checked;
}

export function loadSealedFile(name) {
  return JSON.parse(readFileSync(new URL(name, EXPECTATIONS), "utf8"));
}

/** Every sealed vector with its file, in file order. */
export function loadSealedVectors() {
  const vectors = [];
  for (const file of sealedVectorFiles()) {
    const document = loadSealedFile(file);
    if (document.format !== "f1-expectations/1" || !Array.isArray(document.vectors)) {
      throw new Error(`sealed file ${file} is not format f1-expectations/1`);
    }
    for (const vector of document.vectors) vectors.push({ file, vector });
  }
  return vectors;
}

const tuple = (diagnostic) => ({ code: diagnostic.code, pointer: diagnostic.pointer ?? diagnostic.path });
const diagnosticOf = (error) => error?.diagnostic ?? { code: error?.code, path: error?.path ?? "" };

/**
 * Execute one sealed vector. Returns the observed outcome:
 * - refused vectors: `{ status: "refused", code, pointer }`
 * - ok vectors: `{ status: "ok", json, diagnostics: [{ code, pointer }] }`
 * - round trips: `{ status: "ok", json, twice }` where twice is the second
 *   project(hydrate()) application (fixed-point check), diagnostics `[]`.
 */
export async function runSealedVector(vector, runtime) {
  const { hydrate, project, parseF1Xml, configuration, freeze } = runtime;
  const operation = vector.operation;
  if (operation === "f1-json-hydrate") {
    let observed = null;
    try {
      hydrate(freeze(structuredClone(vector.input.json)), configuration);
    } catch (error) {
      const diagnostic = diagnosticOf(error);
      observed = { code: diagnostic.code, pointer: diagnostic.path };
    }
    if (observed === null) return { status: "ok", json: null, diagnostics: [] };
    return { status: "refused", code: observed.code, pointer: observed.pointer };
  }
  if (operation === "f1-json-round-trip") {
    const model = hydrate(freeze(structuredClone(vector.input.json)), configuration);
    const json = project(model, configuration);
    const twice = project(hydrate(json, configuration), configuration);
    return { status: "ok", json, twice, diagnostics: [] };
  }
  if (operation === "f1-xml-to-native" || operation === "f1-xml-boundary" || operation === "f1-xml-bytes-to-native") {
    const input = vector.input.kind === "xml-bytes" ? Buffer.from(vector.input.base64, "base64") : vector.input.text;
    let parsed;
    try {
      parsed = await parseF1Xml(input, configuration);
    } catch (error) {
      const diagnostic = diagnosticOf(error);
      return { status: "refused", code: diagnostic.code, pointer: diagnostic.path };
    }
    const json = project(parsed.rootElement, configuration);
    return { status: "ok", json, diagnostics: parsed.diagnostics.map(tuple) };
  }
  throw new Error(`sealed vector ${vector.caseId} uses an unknown operation ${operation}`);
}
