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
