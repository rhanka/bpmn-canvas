import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  assert.deepEqual(Object.keys(pkg.exports).sort(), [".", "./assistant-ui", "./io", "./layout", "./package.json", "./react", "./styles.css"]);
  for (const [key, target] of Object.entries(pkg.exports)) {
    const files = typeof target === "string" ? [target] : Object.values(target);
    for (const f of files) assert.ok(existsSync(root + f), `${key} -> ${f} must exist after build`);
  }
});

test("root entry imports in Node without DOM and exposes the core API", async () => {
  const mod = await import(root + "dist/index.js");
  assert.deepEqual(Object.keys(mod).sort(), ["analyzeXml", "createBpmnCanvas", "renderDiagrams"]);
  await assert.rejects(() => mod.renderDiagrams("<x/>"), /needs a browser DOM/);
});

test("react peer is optional and no UI library is a dependency", () => {
  assert.equal(pkg.peerDependenciesMeta.react.optional, true);
  const deps = Object.keys(pkg.dependencies).sort();
  assert.deepEqual(deps, ["bpmn-auto-layout", "bpmn-js", "bpmn-moddle", "diagram-js", "tiny-svg"]);
});

test("shipped BPMN font bytes equal bpmn-font 0.13.0 (unmodified)", () => {
  const expected = {
    "dist/assets/bpmn-font/font/bpmn.eot": "3c6a141e80cda5dfc973e1fffc97359af45bb0bee5f9649e0326adc115cca48d",
    "dist/assets/bpmn-font/font/bpmn.svg": "7ceeb3c3934d47d9c42a2848372533c367c9d651af7a8ccf23f39727f2c897f7",
    "dist/assets/bpmn-font/font/bpmn.ttf": "dc0ed1bbe9a4ec02aefc12d63948caa3896f61928c676bf3724ad13b3ed4a8be",
    "dist/assets/bpmn-font/font/bpmn.woff": "47230fa23929798dd5ec8b4a59bf23f96024804572b36c7db4888af6723d7e76",
    "dist/assets/bpmn-font/font/bpmn.woff2": "3cb77a7fa2461bb23b2e1af4cc70133fe1e3377ca73ff827394439b6b9335848",
    "dist/assets/bpmn-font/css/bpmn.css": "fc426b4a5586e4b99149fa3232afc03302cb1d44cb307b7bae7e6c62e59d8016",
  };
  for (const [path, hash] of Object.entries(expected)) assert.equal(sha(path), hash, path);
});

test("dist carries no brand, no storage, no global render hook, no watermark suppression", () => {
  const files = execFileSync("find", ["dist", "-type", "f", "(", "-name", "*.js", "-o", "-name", "*.css", "-o", "-name", "*.d.ts", ")"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(files.length > 10);
  for (const f of files) {
    const text = read(f).toString("utf8");
    assert.ok(!/localStorage|sessionStorage|D[2]dRender|DS_TOKENS|d[2]d/i.test(text), `${f} has a banned symbol`);
    const hides = /bjs-powered-by[^}]*display\s*:\s*none/.test(text) || /bjs-powered-by[^;]*\.remove\(/.test(text);
    assert.ok(!hides, `${f} hides the bpmn.io watermark`);
  }
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
  for (const must of ["dist/react/index.js", "dist/assistant-ui/index.js", "dist/styles.css", "dist/assets/bpmn-font/font/bpmn.woff2", "licenses/bpmn-font.OFL-1.1.txt"]) {
    assert.ok(info.files.some((f) => f.path === must), `${must} must be packed`);
  }
  assert.ok(info.files.some((f) => f.path === "LICENSE"));
  assert.ok(!info.files.some((f) => /\.map$/.test(f.path)), "no source maps");
  assert.ok(!info.files.some((f) => f.path.startsWith("tests/")), "no test files in the tarball");
  assert.ok(!info.files.some((f) => /\.xsd$/i.test(f.path)), "no XSD in the tarball (test-only)");
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

test("every new URL(..., import.meta.url) in dist points to a shipped file", () => {
  const files = execFileSync("find", ["dist", "-type", "f", "-name", "*.js"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  let checked = 0;
  for (const f of files) {
    const text = read(f).toString("utf8");
    for (const m of text.matchAll(/new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) {
      const target = fileURLToPath(new URL(m[1], pathToFileURL(root + f)));
      assert.ok(existsSync(target), `${f}: ${m[1]} -> ${target} is missing`);
      checked++;
    }
  }
  assert.ok(checked >= 3, "the font URLs must be checked");
});
