// License texts of the packages a bundle contains, from its esbuild metafile inputs.
// Each package's own license file is copied as is. A package that declares MIT but ships no license file gets a
// factual notice (declared license, declared author, standard MIT text, no copyright line invented). Anything
// else without a license text fails the build.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The standard MIT text only (no copyright line, nothing from this package's own LICENSE).
export const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const DECLARED_ONLY = {
  "bpmn-auto-layout": () => [
    "License: MIT, as declared in the package's package.json (\"license\": \"MIT\") and in its README (License section: \"MIT\").",
    "The package ships no license file and publishes no copyright line; none is invented here.",
    "Author, as declared in its package.json: bpmn.io contributors (https://github.com/bpmn-io).",
    "Source: https://github.com/bpmn-io/bpmn-auto-layout",
    "",
    "Standard MIT license text:",
    "",
    MIT_BODY,
  ].join("\n"),
};

function authorOf(meta) {
  const a = meta.author;
  if (!a) return "not declared";
  if (typeof a === "string") return a;
  return [a.name, a.url ? `(${a.url})` : ""].filter(Boolean).join(" ");
}

function declaredMit(meta) {
  const repo = typeof meta.repository === "string" ? meta.repository : meta.repository?.url;
  return [
    "License: MIT, as declared in the package's package.json (\"license\": \"MIT\").",
    "The package ships no license file; no copyright line is invented here.",
    `Author, as declared in its package.json: ${authorOf(meta)}.`,
    ...(repo ? [`Source: ${repo}`] : []),
    "",
    "Standard MIT license text:",
    "",
    MIT_BODY,
  ].join("\n");
}

/** name -> { version, license, text } for every node_modules package among the metafile inputs. */
export function bundledPackages(root, inputs) {
  const packages = new Map();
  for (const input of inputs) {
    const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (!m || packages.has(m[1])) continue;
    const dir = join(root, input.slice(0, input.indexOf(m[0]) + m[0].length));
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const license = meta.license ?? "UNKNOWN";
    let text = file ? readFileSync(join(dir, file), "utf8").trim() : null;
    if (!text && license === "MIT") text = DECLARED_ONLY[m[1]] ? DECLARED_ONLY[m[1]]() : declaredMit(meta);
    packages.set(m[1], { version: meta.version, license, text });
  }
  const missing = [...packages].filter(([, p]) => !p.text).map(([n]) => n);
  if (missing.length) throw new Error(`no license text for bundled package(s): ${missing.join(", ")}`);
  return packages;
}

/** The licenses document: a heading, this package's own LICENSE, then every bundled package. */
export function licensesDocument({ heading, root, pkg, packages }) {
  const own = readFileSync(join(root, "LICENSE"), "utf8").trim();
  return [
    heading,
    "",
    `== ${pkg.name} ${pkg.version} (MIT) ==`,
    own,
    ...[...packages].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, p]) => ["", `== ${name} ${p.version} (${p.license}) ==`, p.text]),
    "",
  ].join("\n");
}
