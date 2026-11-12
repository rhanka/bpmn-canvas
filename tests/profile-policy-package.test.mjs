import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as io from "../dist/io/index.js";
import * as browser from "../dist/browser/bpmn-canvas.min.js";
import { compareCase } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const root = new URL("../", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const walk = path => readdirSync(new URL(path, root), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${path}/${e.name}`) : [`${path}/${e.name}`]);
const lexicon = load("tests/fixtures/x24-externalization/expectations/lexicon.json");
for (const name of ["x24-R-004-no-forced-descriptor", "x24-R-008-browser-entry-defaults"]) {
  const c = load(`tests/fixtures/x24-externalization/expectations/cases/${name}.json`);
  test(`${c.caseId} sealed package surface`, () => {
    const subject = { packageExports: load("package.json").exports, distMembers: walk("dist"), ioExports: Object.keys(io), browserExports: Object.keys(browser), codecPackagesWithoutInjection: io.createModdle().getPackages().map(p => p.prefix).sort() };
    assert.deepEqual(compareCase(c, { status: "success", artifacts: { subject } }, { lexicon }).failures, [], c.caseId);
  });
}
