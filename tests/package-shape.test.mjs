import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFileSync(root + p);
const sha = (p) => createHash("sha256").update(read(p)).digest("hex");
const pkg = JSON.parse(read("package.json").toString("utf8"));

test("package identity and license", () => {
  assert.equal(pkg.name, "@sentropic/bpmn-canvas");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.type, "module");
});

test("exports name only implemented entries", () => {
  for (const [key, target] of Object.entries(pkg.exports)) {
    const files = typeof target === "string" ? [target] : Object.values(target);
    for (const f of files) {
      if (f.startsWith("./dist/")) continue; // checked after build below
      assert.ok(existsSync(root + f), `${key} -> ${f} must exist`);
    }
  }
  assert.deepEqual(Object.keys(pkg.exports).sort(), [".", "./package.json"]);
});

test("built entry matches exports and imports in Node without DOM", async () => {
  assert.ok(existsSync(root + "dist/index.js"), "run npm run build first");
  assert.ok(existsSync(root + "dist/index.d.ts"));
  const mod = await import(root + "dist/index.js");
  assert.equal(mod.PACKAGE_NAME, "@sentropic/bpmn-canvas");
});

test("third-party license texts are byte-exact", () => {
  const expected = {
    "licenses/bpmn-js.LICENSE": "5788cf8bd61481776cee1c943595525499a1355c045e9244f92e6c8092c06770",
    "licenses/diagram-js.LICENSE": "39e5358fd556ba6cb3b7eb1ff69ff43766e2f29c4e1d67e43cab08ad74016632",
    "licenses/tiny-svg.LICENSE": "ee9092be4d5377d9aa640656edb7ee2a42991664b95c53a5e4a6abf071e27669",
    "licenses/bpmn-moddle.LICENSE": "3082b548bd9c98364ebbed1cbd40bfe1721c7edf2376f26f25fb06c729cc077a",
    "licenses/bpmn-font.OFL-1.1.txt": "e8b9c680806960866fef0bddc98903f61b0e4a53de59fb1e90c0c2723eb06c02",
    "licenses/Adobe-AFM-readme.txt": "311bfca694884d86006fb96de443b0f4359635921b95fc6c161bb94d013b7292",
  };
  for (const [path, hash] of Object.entries(expected)) assert.equal(sha(path), hash, path);
  assert.match(read("licenses/Adobe-AFM-copyright.txt").toString("utf8"), /Adobe Systems Incorporated/);
});

test("notices cover each mandatory third-party obligation", () => {
  const n = read("THIRD_PARTY_NOTICES.md").toString("utf8");
  for (const needle of ["bpmn-js", "watermark", "OFL", "Adobe", "bpmn-auto-layout", "no `LICENSE`"]) {
    assert.ok(n.includes(needle), `NOTICE mentions ${needle}`);
  }
});

test("npm pack contents stay inside the positive allowlist", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
  });
  const [info] = JSON.parse(out);
  const allowed = [/^dist\//, /^LICENSE$/, /^THIRD_PARTY_NOTICES\.md$/, /^licenses\//, /^README\.md$/, /^package\.json$/];
  for (const f of info.files) {
    assert.ok(allowed.some((re) => re.test(f.path)), `unexpected packed file: ${f.path}`);
  }
  assert.ok(info.files.some((f) => f.path === "dist/index.js"));
  assert.ok(info.files.some((f) => f.path === "LICENSE"));
  assert.ok(!info.files.some((f) => /\.map$/.test(f.path)), "no source maps");
});

test("no Python, no AI trailer files, no private markers in tree", () => {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert.ok(!tracked.some((f) => /\.py$|requirements\.txt$|pyproject\.toml$/.test(f)), "no Python");
  for (const f of tracked) {
    if (!/\.(ts|mjs|json|md|css)$/.test(f) || f.startsWith("tests/")) continue;
    const text = read(f).toString("utf8");
    assert.ok(!/DS_TOKENS|D[2]dRender|localStorage/.test(text), `${f} has a banned symbol`);
  }
});
