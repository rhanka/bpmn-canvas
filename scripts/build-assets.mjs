// Post-tsc step: ship the BPMN font unmodified and build dist/styles.css.
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const fontSrc = root + "node_modules/bpmn-js/dist/assets/bpmn-font/";
const fontDst = root + "dist/assets/bpmn-font/";

mkdirSync(fontDst + "font", { recursive: true });
mkdirSync(fontDst + "css", { recursive: true });
for (const f of ["bpmn.eot", "bpmn.svg", "bpmn.ttf", "bpmn.woff", "bpmn.woff2"]) {
  copyFileSync(fontSrc + "font/" + f, fontDst + "font/" + f);
}
copyFileSync(fontSrc + "css/bpmn.css", fontDst + "css/bpmn.css");

const gen = readFileSync(root + "src/internal/css.generated.ts", "utf8");
const grab = (name) => JSON.parse(new RegExp(`export const ${name} = (".*");`).exec(gen)[1]);
const placeholder = grab("FONT_BASE_PLACEHOLDER");
cpSync(root + ".gen/inline/", root + "dist/assets/inline/", { recursive: true });
const css = grab("FONT_FACE_CSS").replaceAll(placeholder, "./assets/bpmn-font/font/") + "\n" + grab("BASE_CSS").replaceAll(grab("ASSET_PLACEHOLDER"), "./assets/inline/");
writeFileSync(root + "dist/styles.css", css);
console.log(`dist/styles.css ${css.length} bytes; font assets copied unmodified`);

// The canonical layout corpus (tests/fixtures/layout-corpus), shipped so a host can mirror it and compare layouts.
const corpus = root + "tests/fixtures/layout-corpus/";
const shipped = {
  version: JSON.parse(readFileSync(corpus + "VERSION", "utf8")),
  cases: JSON.parse(readFileSync(corpus + "cases.json", "utf8")),
  expected: JSON.parse(readFileSync(corpus + "expected.json", "utf8")),
};
writeFileSync(root + "dist/layout-corpus.json", JSON.stringify(shipped) + "\n");
console.log(`dist/layout-corpus.json: ${Object.keys(shipped.cases).length} cases, VERSION ${shipped.version.expectedSha256.slice(0, 12)}`);

// The shared descriptor is shipped verbatim; its file hash is the public fingerprint.
copyFileSync(root + "src/io/semantics.json", root + "dist/io/semantics.json");
