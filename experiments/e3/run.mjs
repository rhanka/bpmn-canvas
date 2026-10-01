// E3 runner: real bpmn-js Modeler in a real (headless, local, throw-away profile) Chromium.
// Never touches the owner's Chrome on CDP 9222.
import { chromium } from "playwright-core";
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL("./", import.meta.url));
const root = join(here, "../../");
const outDir = join(root, "proofs/e3");
mkdirSync(outDir, { recursive: true });
const executablePath = process.env.CHROMIUM ?? "/snap/bin/chromium";

await build({
  entryPoints: [join(here, "page.mjs")],
  bundle: true,
  format: "esm",
  outdir: join(here, "dist"),
  logLevel: "warning",
  loader: { ".css": "css" },
  absWorkingDir: root,
});

const corpusFile = (n) => readFileSync(join(here, "corpus", n), "utf8");
const cases = [
  {
    file: "ce1-homonyms.bpmn",
    spec: {
      name: "CE1 two homonymous processes, two collaborations, two diagrams",
      edits: [
        { element: "TA", name: "A-task-EDITED" },
        { open: "DB", element: "TB", name: "B-task-EDITED" },
      ],
      revisit: { open: "DA", element: "TA", expectName: "A-task-EDITED" },
      mustExist: ["PA", "PB", "TA", "TB", "C1", "C2", "P1", "P2", "DA", "DB"],
      attrs: [["P1", "processRef", "PA"], ["P2", "processRef", "PB"]],
      diagramCount: 2,
    },
  },
  {
    file: "ce3-collapsed-subprocess.bpmn",
    spec: {
      name: "CE3 collapsed subprocess with its own plane",
      edits: [
        { element: "Sub_1", name: "Sub-EDITED" },
        { open: "BD2", element: "Inner", name: "Inner-EDITED" },
      ],
      revisit: { open: "BD1", element: "Sub_1", expectName: "Sub-EDITED" },
      mustExist: ["Process_1", "Sub_1", "Inner", "BD1", "BD2"],
      attrs: [["Pl2", "bpmnElement", "Sub_1"]],
      diagramCount: 2,
    },
  },
  {
    file: "ce4-two-pools-message.bpmn",
    spec: {
      name: "CE4 two pools, message flow, root message, one diagram",
      edits: [
        { element: "T1", name: "Send-EDITED" },
        { element: "T2", name: "Receive-EDITED" },
      ],
      mustExist: ["PX", "PY", "Msg1", "MF", "Pa", "Pb", "ST2", "EMF", "MED"],
      attrs: [
        ["Pb", "processRef", "PY"], ["MF", "sourceRef", "T1"], ["MF", "targetRef", "T2"],
        ["MF", "messageRef", "Msg1"], ["ST2", "bpmnElement", "T2"], ["MED", "messageRef", "Msg1"],
      ],
      diagramCount: 1,
    },
  },
  {
    file: "ce5-two-diagrams-shared-root.bpmn",
    spec: {
      name: "CE5 two diagrams, shared root message used by a message flow",
      edits: [
        { element: "TS", name: "Send-EDITED" },
        { open: "DiagB", element: "TO", name: "Other-EDITED" },
      ],
      revisit: { open: "DiagA", element: "TS", expectName: "Send-EDITED" },
      mustExist: ["MsgShared", "MFA", "PS", "PR", "PO", "CA", "CB", "ER", "MEDR", "DiagA", "DiagB"],
      attrs: [
        ["MFA", "messageRef", "MsgShared"], ["MFA", "sourceRef", "TS"], ["MFA", "targetRef", "ER"],
        ["MEDR", "messageRef", "MsgShared"], ["PbA", "processRef", "PR"], ["PaB", "processRef", "PO"],
      ],
      diagramCount: 2,
    },
  },
].map((c) => ({ ...c, xml: corpusFile(c.file) }));

const profile = mkdtempSync(join(root, "proofs-profile-"));
const consoleLines = [];
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  await page.goto(pathToFileURL(join(here, "index.html")).href);
  await page.waitForFunction(() => window.__e3Ready === true, null, { timeout: 30000 });
  const browserVersion = context.browser()?.version() ?? "unknown";
  const results = await page.evaluate((cs) => window.runE3(cs), cases.map(({ spec, xml }) => ({ spec, xml })));
  await page.screenshot({ path: join(outDir, "e3-page.png") });

  const sha = (s) => createHash("sha256").update(s).digest("hex");
  for (const [i, r] of results.entries()) {
    if (r.savedXml) writeFileSync(join(outDir, `${cases[i].file}.saved.bpmn`), r.savedXml);
  }
  const summary = {
    experiment: "E3",
    date: new Date().toISOString(),
    browser: browserVersion,
    executablePath,
    bpmnJs: JSON.parse(readFileSync(join(root, "node_modules/bpmn-js/package.json"), "utf8")).version,
    corpus: cases.map((c) => ({ file: c.file, sha256: sha(c.xml) })),
    results: results.map((r) => ({ ...r, savedXml: undefined, savedXmlSha256: r.savedXml ? sha(r.savedXml) : null })),
    console: consoleLines,
  };
  writeFileSync(join(outDir, "e3-results.json"), JSON.stringify(summary, null, 2) + "\n");

  let failed = 0;
  for (const r of results) {
    const bad = r.checks.filter((c) => !c.pass);
    failed += bad.length + r.errors.length;
    console.log(`\n== ${r.name}\n   checks ${r.checks.length - bad.length}/${r.checks.length} ok, errors ${r.errors.length}`);
    for (const b of bad) console.log(`   FAIL ${b.name} :: ${JSON.stringify(b.detail)}`);
    for (const e of r.errors) console.log(`   ERROR ${e.split("\n")[0]}`);
    for (const s of r.steps) console.log(`   - ${s.what} ${JSON.stringify({ ...s, what: undefined })}`);
    console.log(`   watermark ${JSON.stringify(r.watermark)}`);
  }
  console.log(`\nconsole lines: ${consoleLines.length}`);
  process.exitCode = failed ? 1 : 0;
} finally {
  await context?.close();
  rmSync(profile, { recursive: true, force: true });
}
