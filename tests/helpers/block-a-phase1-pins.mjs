import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Explicit branch successors meet at the integrated bytes; historical
 * receipts and their original predecessor checks remain unchanged. */
export function phase1SourcePin(path, previous) {
  const receipt = JSON.parse(readFileSync(new URL("../../docs/design/receipts/block-a-phase1-reseal.json", import.meta.url)));
  assert.equal(receipt.format, "block-a-phase1-reseal/1");
  assert.equal(receipt.baseCommit, "bfed4a302446a3abbfec8b6bba46843dec432eca");
  const entry = receipt.files.find(entry => entry.path === path);
  if (!entry) return previous;
  for (const [file, commit] of [["j2-reseal.json", "c831c49"], ["block-a-j5-reseal.json", "72ad7e8"]]) {
    const branch = JSON.parse(readFileSync(new URL(`../../docs/design/receipts/${file}`, import.meta.url)));
    const declared = branch.supersedesFiles.find(candidate => candidate.path === path);
    if (!declared) continue;
    for (const [revision, expected] of [["bfed4a3", declared.old], [commit, declared.new]]) {
      const recorded = entry.predecessors.find(candidate => candidate.commit === revision);
      assert.ok(recorded, `${path} ${revision} predecessor present`);
      assert.deepEqual({ bytes: recorded.bytes, sha256: recorded.sha256 }, expected, `${path} ${revision} branch reseal`);
    }
  }
  const pin = { bytes: previous.bytes, sha256: previous.sha256 };
  assert.ok([...entry.predecessors, entry.current].some(candidate => candidate.bytes === pin.bytes && candidate.sha256 === pin.sha256), `${path} phase 1 reseal predecessor`);
  return entry.current;
}
