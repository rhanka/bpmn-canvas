import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const directory = new URL("../fixtures/unicode-case-15.0.0/", import.meta.url);
const pinUrl = new URL("../fixtures/unicode-case-15.0.0.pin.json", import.meta.url);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function vendoredUnicodeCaseFiles() {
  const read = name => readFileSync(new URL(name, directory), "utf8");
  return {
    table: JSON.parse(read("case-table.json")),
    manifest: JSON.parse(read("manifest.json")),
    vectors: JSON.parse(read("vectors.json")),
    pin: JSON.parse(readFileSync(pinUrl, "utf8")),
    bytes: {
      "case-table.json": read("case-table.json"),
      "manifest.json": read("manifest.json"),
      "vectors.json": read("vectors.json"),
    },
  };
}

/** Loader input: the vendored table plus the manifest identity and sources. */
export function vendoredUnicodeCaseDocument() {
  const { table, manifest } = vendoredUnicodeCaseFiles();
  return { ...table, manifest: { unicodeVersion: manifest.unicodeVersion, sources: manifest.sources } };
}

/** Offline byte-identity check of the vendored contract against its pin. */
export function verifyUnicodeCasePin() {
  const { pin, bytes } = vendoredUnicodeCaseFiles();
  assert.equal(pin.format, "unicode-case-pin/1");
  assert.equal(pin.unicodeVersion, "15.0.0");
  assert.equal(pin.contractFormat, "unicode-case/1");
  assert.equal(pin.provenance.status, "provisional until the contract lands on the Python main");
  for (const [name, sha256] of Object.entries(pin.files)) {
    const leaf = name.split("/").at(-1);
    assert.equal(digest(bytes[leaf]), sha256, name);
  }
  return pin;
}
