import { build } from "esbuild";
import { readFileSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

/** Bundle only the sealed scenario's inputs and commands, never its expected
 * artifacts, authoring modules, comparator or seal. */
export async function buildNativeDemo(root, site) {
  const fixtureRoot = join(root, "tests/fixtures/lot5-ui/expectations");
  const read = path => readFileSync(join(fixtureRoot, path), "utf8");
  const file = readdirSync(join(fixtureRoot, "cases")).find(name => name.includes("demo-001"));
  const record = JSON.parse(read(`cases/${file}`));
  const data = {
    profileText: read(record.profileArtifact.path),
    baseText: read("fixtures/ui-neutral-base.json"),
    descriptorText: read("fixtures/ui-neutral-descriptors.json"),
    metricsText: read("fixtures/ui-neutral-metrics.json"),
    registry: JSON.parse(read("fixtures/ui-neutral-registry.json")),
    schemaText: readFileSync(join(root, "schemas/profile/profile-mechanism-1.schema.json"), "utf8"),
    snapshot: JSON.parse(read(record.inputArtifacts.find(a => a.role === "snapshot").path)),
    steps: record.commandArtifact.json.steps,
  };
  const result = await build({
    entryPoints: [join(root, "docs/demo/native.mjs")], outfile: join(site, "page/native.js"),
    bundle: true, format: "esm", minify: true, platform: "browser", metafile: true, legalComments: "eof",
    plugins: [{ name: "neutral-demo-inputs", setup(builder) {
      builder.onResolve({ filter: /^neutral-demo-inputs$/ }, () => ({ path: "inputs", namespace: "neutral-demo" }));
      builder.onLoad({ filter: /.*/, namespace: "neutral-demo" }, () => ({ contents: `export default ${JSON.stringify(data)};`, loader: "js" }));
    } }],
  });
  copyFileSync(join(root, "docs/demo/native.html"), join(site, "native.html"));
  return result;
}
