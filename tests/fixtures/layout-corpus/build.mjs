// Builds the canonical layout corpus: invented cases (cases.json), the layout every one of them gets (expected.json,
// every ProcessLayout field) and VERSION (hashes of both files, of the layout sources, and the layout dependencies).
// Run after `npm run build`, and only when the layout is meant to change: node tests/fixtures/layout-corpus/build.mjs
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutProcess } from "../../../dist/layout/index.js";
import { normalize } from "../../../dist/internal/processModel.js";
import { C1, C3, C4 } from "../io/reference/cases.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../../");
const n = (type, label, extra = {}) => ({ type, label, ...extra });
const c = (source, target, extra = {}) => ({ source, target, ...extra });

export const CASES = {
  "base-order": C1.processes[0],
  "base-review": C4.processes[0],
  "homonymous-lanes": {
    name: "Homonymous lanes",
    lanes: [
      { name: "Team", nodes: [n("START", "Begin"), n("TASK", "First step")] },
      { name: "Partner", nodes: [n("TASK", "Partner step")] },
      { name: "Team", nodes: [n("TASK", "Last step"), n("END", "Finish")] },
    ],
    connections: [c("Begin", "First step"), c("First step", "Partner step"), c("Partner step", "Last step"), c("Last step", "Finish")],
  },
  "lane-block-boundary": C3.processes[0],
  "unnamed-lane": {
    name: "Unnamed lane",
    lanes: [
      { name: "", nodes: [n("START", "Open"), n("TASK", "Sort mail")] },
      { name: "Mailroom", nodes: [n("TASK", "Send mail"), n("END", "Closed")] },
    ],
    connections: [c("Open", "Sort mail"), c("Sort mail", "Send mail"), c("Send mail", "Closed")],
  },
  "shared-item": {
    name: "Shared item",
    lanes: [{ name: "Desk", nodes: [n("START", "In"), n("TASK", "Write"), n("TASK_OUTPUT", "Draft"), n("TASK", "Read"), n("DOCUMENT", "Style guide"), n("END", "Out")] }],
    connections: [
      c("In", "Write"), c("Write", "Read"), c("Read", "Out"),
      c("Write", "Draft", { kind: "DATA" }), c("Draft", "Read", { kind: "DATA" }),
      c("Style guide", "Write", { kind: "DOC" }), c("Style guide", "Read", { kind: "DOC" }),
    ],
  },
  "duplicate-names": {
    name: "Duplicate names",
    lanes: [{ name: "Unit", nodes: [n("START", "s"), n("TASK", "t1", { text: "Check" }), n("TASK", "t2", { text: "Check" }), n("END", "e")] }],
    connections: [c("s", "t1"), c("t1", "t2"), c("t2", "e")],
  },
};

export const SOURCES = () => [
  "src/internal/swimlaneLayout.ts",
  "src/internal/textMetrics.ts",
  ...readdirSync(join(repo, "src/layout")).sort().map((f) => `src/layout/${f}`),
];
export function sourcesSha256() {
  const h = createHash("sha256");
  for (const f of SOURCES()) h.update(`${f}\n`).update(readFileSync(join(repo, f)));
  return h.digest("hex");
}
const sha = (s) => createHash("sha256").update(s).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const expected = {};
  for (const [name, proc] of Object.entries(CASES)) expected[name] = await layoutProcess(normalize(structuredClone(proc)));
  const cases = JSON.stringify(CASES, null, 1) + "\n";
  const exp = JSON.stringify(expected, null, 1) + "\n";
  writeFileSync(join(here, "cases.json"), cases);
  writeFileSync(join(here, "expected.json"), exp);
  const version = { format: 1, casesSha256: sha(cases), expectedSha256: sha(exp), sourcesSha256: sourcesSha256(), "bpmn-auto-layout": "1.3.0", "bpmn-io": "0.1.0" };
  writeFileSync(join(here, "VERSION"), JSON.stringify(version, null, 1) + "\n");
  console.log("layout corpus written:", Object.keys(CASES).join(", "));
}
