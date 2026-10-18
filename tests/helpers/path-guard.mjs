import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBaseRevision } from "./git-base.mjs";

// No exceptions or allowlist. Diagnostics contain only repository paths and lines.
const forbidden = /\/home\/|\/Users\/|c:[\\/]+users/i;
const directory = root => root instanceof URL ? fileURLToPath(root) : root;
const git = (root, args) => execFileSync("git", args, {
  cwd: directory(root), encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});

export function scanPathText(path, text) {
  return text.split("\n").flatMap((line, index) => forbidden.test(line) ? [`${path}:${index + 1}`] : []);
}

export function scanTrackedPaths(root) {
  const paths = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
  return paths.flatMap(path => {
    const absolute = join(directory(root), path);
    const text = lstatSync(absolute).isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute, "utf8");
    return [...scanPathText(path, text), ...scanPathText(path, path).map(() => `${path}:0`)];
  });
}

export function scanAddedPaths(root) {
  try {
    const options = ["--no-ext-diff", "--no-textconv", "--text", "--no-renames", "--no-color", "--unified=0"];
    const range = `${resolveBaseRevision(root)}...HEAD`;
    const paths = git(root, ["diff", "--name-only", "-z", range]).split("\0").filter(Boolean);
    return paths.flatMap(path => {
      const diff = git(root, ["diff", ...options, range, "--", path]);
      const found = [];
      let lineNumber;
      for (const line of diff.split("\n")) {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (hunk) { lineNumber = Number(hunk[1]); continue; }
        if (lineNumber === undefined) continue;
        if (line.startsWith("+")) {
          if (forbidden.test(line.slice(1))) found.push(`${path}:${lineNumber}`);
          lineNumber++;
        } else if (line.startsWith(" ")) lineNumber++;
      }
      return found;
    });
  } catch {
    throw new Error("path diff unavailable");
  }
}
