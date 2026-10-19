import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, linkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { EXPECTATIONS } from "./helpers/f1-sealed.mjs";

async function mutation(change) {
  const directory = mkdtempSync(join(tmpdir(), "j5-seal-"));
  try {
    const expectations = join(directory, "expectations");
    cpSync(EXPECTATIONS, expectations, { recursive: true });
    const source = process.env.F1_SEAL_BASELINE === "1"
      ? readFileSync(new URL("./fixtures/f1-seal-baseline.mjs", import.meta.url), "utf8")
      : readFileSync(new URL("./helpers/f1-sealed.mjs", import.meta.url), "utf8");
    if (process.env.F1_SEAL_BASELINE === "1") {
      assert.equal(createHash("sha256").update(source).digest("hex"), "9fb90c6d92c501c7b3265f8bb31480db7d37681d20f570a5960d7a7d2b92f245", "unchanged bfed4a3 seal verifier");
    }
    const helper = join(directory, "runner.mjs");
    writeFileSync(helper, source.replace('../fixtures/f1-extensions/expectations/', './expectations/'));
    const { verifySeal } = await import(pathToFileURL(helper).href);
    const sealPath = join(expectations, "seal.json");
    const seal = JSON.parse(readFileSync(sealPath));
    change(expectations, seal);
    writeFileSync(sealPath, JSON.stringify(seal));
    assert.throws(() => verifySeal(), /^Error: seal /);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("J5 #25 should reject unlisted seal payloads", () => mutation(directory => writeFileSync(join(directory, "extra.json"), "{}")));
test("J5 #25 should reject duplicate seal entries", () => mutation((directory, seal) => seal.files.push(seal.files[0])));
test("J5 #25 should reject linked seal entries", () => mutation(directory => {
  const path = join(directory, "01-reserved-names.json");
  writeFileSync(join(directory, "../linked-payload.json"), readFileSync(path));
  rmSync(path); symlinkSync("../linked-payload.json", path);
}));
test("J5 #25 should reject hard-linked seal entries", () => mutation(directory => linkSync(join(directory, "reserved-names.json"), join(directory, "extra.json"))));
test("J5 #25 should reject path escaping before opening entries", () => mutation((directory, seal) => { seal.files[0].path = "../escape.json"; }));
test("J5 #25 should reject URL and encoded path escaping", async () => {
  for (const path of ["file:///escape.json", "%2e%2e/escape.json", "a\\b.json", "/escape.json"])
    await mutation((directory, seal) => { seal.files[0].path = path; });
});
test("J5 #25 should reject an invalid seal format", () => mutation((directory, seal) => { seal.format = "unknown/1"; }));
