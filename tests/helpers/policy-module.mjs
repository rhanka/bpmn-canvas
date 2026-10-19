import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../../", import.meta.url);
const ledger = JSON.parse(readFileSync(new URL("tests/fixtures/x24-externalization/expectations/ledger.json", root)));
const hash = value => createHash("sha256").update(value).digest("hex");
const walk = path => readdirSync(new URL(path, root), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${path}/${e.name}`) : [`${path}/${e.name}`]);
let sources;
export async function policyModule(masked) {
  const identity = ledger.files[masked]?.pathSha256;
  sources ??= walk("src");
  const category = masked.replace("src/profiles/", "src/presentation/").replace(/\{LX-TH-1:[a-f0-9]+\}/g, "annotated").replace(/\{LX-TH-2:[a-f0-9]+\}/g, "recolor").replace(/\{LX-TH-5:[a-f0-9]+\}/g, "flat");
  const source = sources.find(path => hash(path) === identity) ?? sources.find(path => path === category);
  if (!source) throw new Error("Source identity unavailable");
  const url = new URL(source.replace(/^src\//, "dist/").replace(/\.tsx?$/, ".js"), root);
  let code = readFileSync(url, "utf8");
  code = code.replace(/import (.+?) from "([^"]+)";/g, (statement, names, spec) => {
    if (spec.includes("CommandInterceptor")) return `class ${names} { constructor(bus) { this.bus = bus; } preExecute(name, callback) { this.bus.on(name, callback); } }`;
    if (spec.startsWith("diagram-js/")) return names.startsWith("{") ? `const ${names} = new Proxy({}, { get: () => () => ({}) });` : `class ${names} {}`;
    if (spec.startsWith("bpmn-js/")) {
      if (names.includes("BpmnUpdater")) return `class ${names} { static $inject = []; updateSemanticParent() {} }`;
      return `const ${names} = new Proxy({ is: (element, type) => (element.businessObject ?? element).$instanceOf?.(type) ?? false, getDi: element => element.di ?? {}, isExpanded: () => false, isHorizontal: () => true }, { get: (target, key) => target[key] ?? (() => undefined) });`;
    }
    if (spec === "tiny-svg") {
      const entries = [...names.matchAll(/(\w+) as (\w+)/g)].map(([, , alias]) => `${alias} = () => undefined`);
      return `const ${entries.join(", ")};`;
    }
    return statement.replace(spec, spec.startsWith(".") ? new URL(spec, url).href : import.meta.resolve(spec));
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return { module, member: digest => Object.entries(module).find(([name]) => hash(name) === digest)?.[1] };
}
