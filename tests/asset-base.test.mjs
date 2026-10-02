import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { assetBaseUrl, fontUrl, imageUrl } = await import(root + "dist/internal/styles.js");

test("assetBase: an absolute directory URL, the slash added to the path", () => {
  assert.equal(assetBaseUrl("https://cdn.example/npm/p@1/dist/assets").href, "https://cdn.example/npm/p@1/dist/assets/");
  assert.equal(assetBaseUrl("https://cdn.example/npm/p@1/dist/assets/").href, "https://cdn.example/npm/p@1/dist/assets/");
  const base = assetBaseUrl("https://cdn.example/a/assets");
  assert.equal(fontUrl(base), "https://cdn.example/a/assets/bpmn-font/font/bpmn.woff2");
  assert.equal(imageUrl("inline-01.svg", base), "https://cdn.example/a/assets/inline/inline-01.svg");
});

test("assetBase: refused when relative, with a query or fragment, or not http(s)/file", () => {
  for (const bad of ["assets/", "/dist/assets/", "https://cdn.example/assets?cache=x", "https://cdn.example/assets#x", "javascript:alert(1)", "data:text/plain,x", "ftp://cdn.example/assets/"]) {
    assert.throws(() => assetBaseUrl(bad), undefined, bad);
  }
});

test("without assetBase the files resolve next to the module", () => {
  assert.ok(fontUrl(undefined).endsWith("/dist/assets/bpmn-font/font/bpmn.woff2"));
  assert.ok(imageUrl("inline-01.svg", undefined).endsWith("/dist/assets/inline/inline-01.svg"));
});
