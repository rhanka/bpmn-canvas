// Successor draw.io goldens (stage B2 phase 2): the reference codec with the sealed synthetic fixture policy.
// Run after `npm run build`: node tests/fixtures/io/reference/build-successors.mjs
import { writeFileSync } from "node:fs";
import { model, outputs } from "../../../helpers/semantic.mjs";
for (let i = 1; i <= 7; i++) {
  const { drawio } = await outputs(await model(`C${i}`));
  writeFileSync(new URL(`./C${i}/expected.drawio`, import.meta.url), drawio);
}
