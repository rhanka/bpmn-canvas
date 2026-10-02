import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

test("no commit message carries an AI attribution trailer (checked before any publication)", () => {
  const messages = git("log", "--all", "--format=%H%x00%B%x01").split("\x01").map((s) => s.trim()).filter(Boolean);
  assert.ok(messages.length > 0);
  const banned = /co-authored-by|generated with|claude-session|noreply@anthropic\.com|claude code/i;
  for (const m of messages) {
    const [sha, body] = m.split("\x00");
    assert.ok(!banned.test(body ?? ""), `commit ${sha?.slice(0, 8)} carries an attribution trailer`);
  }
});

test("no author or committer identity names an AI tool", () => {
  const ids = git("log", "--all", "--format=%an <%ae>%n%cn <%ce>").split("\n").filter(Boolean);
  for (const id of ids) assert.ok(!/claude|anthropic/i.test(id), `identity ${id}`);
});

test("tracked files carry no AI attribution", () => {
  let out = "";
  try {
    out = git("grep", "-liE", "co-authored-by:|generated with \\[?claude|claude-session", "--", ".", ":!tests", ":!package-lock.json").trim();
  } catch (e) {
    if (e.status !== 1) throw e; // git grep exits 1 when nothing matches
  }
  assert.equal(out, "");
});
