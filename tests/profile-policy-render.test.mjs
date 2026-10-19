import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const hash = text => createHash("sha256").update(text).digest("hex");
const source = "src/profiles/{LX-TH-1:ba29297b}/style.ts";
const pathHash = load("ledger.json").files[source].pathSha256;
const dirs = readdirSync(new URL("../src/profiles/", import.meta.url));
const dir = dirs.find(dir => hash(`src/profiles/${dir}/style.ts`) === pathHash);
assert.ok(dir, "source module identity");
const exports = await import(`../dist/profiles/${dir}/style.js`);
const members = new Map(Object.entries(exports).map(([name, value]) => [hash(name), value]));
const size = members.get("f3902178f562e8df73808d57ce2ebcc7229b6982698d917ddfd47d1627c3e9e9");
const row = members.get("1b82f18171ee7a4975410dc43411ae61aae3b4b7c26245d4aaf0e3453e81130f");
const rect = members.get("232f794d8829de06f95adbf2faf32ed3f000f892f1cd333b749e6e51863999da");
const kind = members.get("5ab160c6874c973412631b96a35a729550696a1be8e590097d31210505a0e1dc");
const input = (c, role) => {
  const a = c.inputArtifacts.find(a => a.role === role);
  if (!a) return undefined;
  if (!a.path) return a.json;
  const bytes = readFileSync(new URL(a.path, root));
  assert.equal(hash(bytes), a.sha256);
  return JSON.parse(bytes);
};
for (const entry of load("manifest.json").cases) {
  const c = load(entry.path);
  if (!["x24.render.badges", "x24.classify.kind"].includes(c.operation)) continue;
  if (c.operation === "x24.classify.kind" && input(c, "renderer") !== "annotated") continue;
  test(`${c.caseId} sealed drawing policy`, () => {
    for (const suffix of c.inputArtifacts.some(a => a.role === "policy-a") ? ["a", "b"] : [""]) {
      const policy = input(c, suffix ? `policy-${suffix}` : "policy");
      const actual = input(c, "vectors").map(v => {
        if (c.operation === "x24.classify.kind") return { text: v.text, kind: kind({ $type: "bpmn:TextAnnotation", text: v.text }, {}, policy) ?? null };
        const result = v.measure === "badge-row" ? row(v.names, v.hostWidth, v.hostHeight, policy)
          : v.measure === "badge-box" ? size(v.name, v.hostWidth, policy) : rect(v.width, v.height, policy);
        return { ...v, result };
      });
      const expected = c.expectedArtifacts.find(a => a.role === (suffix ? `results-${suffix}` : "results")).json;
      assert.deepEqual(actual, expected, c.caseId);
    }
  });
}
