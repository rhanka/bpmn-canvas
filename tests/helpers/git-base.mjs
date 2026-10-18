import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Integration-base resolution shared by every test that reads the base
// history. Prefers the local main branch, then the remote-tracking main
// (detached checkouts have no local branch). Missing both fails loudly:
// callers must never silently skip a guard when the base is unavailable.
const candidates = Object.freeze(["refs/heads/main", "refs/remotes/origin/main"]);

export function resolveBaseRevision(root = new URL("../../", import.meta.url)) {
  const cwd = root instanceof URL ? fileURLToPath(root) : root;
  for (const ref of candidates) {
    try {
      execFileSync("git", ["show-ref", "--verify", ref], {
        cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
      return ref === "refs/heads/main" ? "main" : ref;
    } catch {
      continue;
    }
  }
  throw new Error("base revision unavailable: neither main nor origin/main exists");
}
