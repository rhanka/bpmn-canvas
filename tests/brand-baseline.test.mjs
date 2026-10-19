import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { brandTokens, hashOf } from "./helpers/brand.mjs";
import { predecessorPin, successorPin } from "./helpers/lot0-history-pins.mjs";

const repo = new URL("../", import.meta.url);
const fixture = path => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
const loadGuard = () => import("./helpers/brand-baseline.mjs");
const leaks = new Set([
  "fcb3d245658a5ecf9e75f59050fcc0fd20a92c9eeeb223a99632cd4ef789452c",
  "db66fe349809217e7926360ab81ae6ff26f9816c09a4b362e7dbfd5825b688be"
]);

test("should reject every tracked occurrence outside the approved business baseline", async () => {
  const { scanTracked, parseBaseline, outsideBaseline } = await loadGuard();
  const baseline = parseBaseline(fixture("brand-baseline.tsv"));
  assert.deepEqual(outsideBaseline(scanTracked(repo), baseline), []);
});

test("should keep the emptied lot 2 baseline closed to additions and substitutions", async () => {
  const { parseBaseline, verifyBaseline } = await loadGuard();
  const text = fixture("brand-baseline.tsv");
  const pin = JSON.parse(fixture("brand-baseline.pin.json"));
  const rows = parseBaseline(text);
  assert.deepEqual(rows, []);
  assert.deepEqual(verifyBaseline(text, pin), []);
  const added = `tests/neutral-probe.txt:1\t${hashOf("neutralprobe")}`;
  assert.throws(() => verifyBaseline(`${added}\n`, pin), /baseline/);
  assert.throws(() => verifyBaseline(`${added}\n${added}\n`, pin), /baseline/);
});

test("should reject synthetic new files, lines and hashes without disclosing their text", async () => {
  const { scanText, outsideBaseline } = await loadGuard();
  const hash = hashOf("neutralprobe");
  const allowed = [`tests/neutral.txt:1\t${hash}`];
  assert.deepEqual(outsideBaseline(scanText("tests/neutral.txt", "neutralprobe", [hash]), allowed), []);
  for (const [path, text] of [["tests/new.txt", "neutralprobe"], ["tests/neutral.txt", "\nneutralprobe"]]) {
    const found = outsideBaseline(scanText(path, text, [hash]), allowed);
    assert.equal(found.length, 1);
    assert.match(found[0], /:[12]\t[a-f0-9]{64}$/);
    assert.ok(!found[0].includes("neutralprobe"));
  }
  const other = hashOf("neutralother");
  assert.equal(outsideBaseline(scanText("tests/neutral.txt", "neutralother", [other]), allowed).length, 1);
});

test("should remove both leak hashes from every tracked file and path", () => {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean);
  const found = [];
  for (const path of paths) {
    const lines = readFileSync(new URL(path, repo), "utf8").split("\n");
    for (const [index, text] of [path, ...lines].entries()) {
      for (const token of brandTokens(text)) {
        const hash = hashOf(token.toLowerCase());
        if (leaks.has(hash)) found.push(`${path}:${index}\t${hash}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test("should point the review receipt at the renamed local folder", () => {
  const receipt = readFileSync(new URL("docs/design/receipts/lot0-s12.json", repo), "utf8");
  assert.ok(receipt.includes(".h2a/reviews/profile/LOT0-CANVAS-PLAN.md"));
});

test("should preserve the original DESIGN line digest alongside a neutral quotation", async () => {
  const evidence = JSON.parse(fixture("profile-lot0/design-provenance.json"));
  const line = evidence.lines.find(line => line.ref === "DESIGN.md:606");
  assert.equal(line.authoritySha256, "47efe86ff95fdaed0796081df4a5d04ea000bfba781cb9012a628ebe798e9b69");
  assert.equal(line.sha256, hashOf(line.text));
  const { verifyExpectations, verifyDesignProvenance } = await import("./helpers/profile-seal.mjs");
  const expectations = verifyExpectations();
  verifyDesignProvenance(expectations, evidence);
  const damaged = structuredClone(evidence);
  damaged.lines.find(line => line.ref === "DESIGN.md:606").authoritySha256 = "0".repeat(64);
  assert.throws(() => verifyDesignProvenance(expectations, damaged), /provenance/);
});


test("should verify every remediation successor against the original and current bytes", () => {
  const receipt = JSON.parse(readFileSync(new URL("docs/design/receipts/lot0-brand-remediation.json", repo)));
  const closure = JSON.parse(readFileSync(new URL("docs/design/receipts/lot0-reconciliation-closed.json", repo)));
  assert.equal(receipt.initialHead, "f3a54c5");
  const pin = bytes => ({ bytes: bytes.length, sha256: hashOf(bytes) });
  for (const entry of receipt.supersedesFiles) {
    assert.deepEqual(predecessorPin(entry.predecessorCommit ?? receipt.initialHead, entry.path), entry.old, `${entry.path} predecessor`);
    const closed = closure.supersedesFiles.find(record => record.path === entry.path);
    if (closed) assert.deepEqual(closed.old, entry.new, `${entry.path} closure predecessor`);
    assert.deepEqual(pin(readFileSync(new URL(entry.path, repo))), successorPin(entry.path, closed?.new ?? entry.new), `${entry.path} successor`);
  }
  const current = new Map();
  for (const step of receipt.reseals) for (const entry of step.files) {
    const prior = current.get(entry.path) ?? receipt.supersedesFiles.find(record => record.path === entry.path).old;
    assert.deepEqual(entry.old, prior, `${entry.path} reseal predecessor`);
    current.set(entry.path, entry.new);
  }
  for (const entry of receipt.supersedesFiles) assert.deepEqual(current.get(entry.path), entry.new, `${entry.path} reseal successor`);
});
