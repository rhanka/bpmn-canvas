import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import ts from "typescript";

// Replay the current discriminating tests against the submitted source bytes,
// without changing a ref, index, worktree source or independent expectation.
const base = "bfed4a302446a3abbfec8b6bba46843dec432eca";
const scratch = `.compiler-base-${process.pid}`;
const git = args => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error("base source unavailable");
  return result.stdout;
};
try {
  mkdirSync(scratch);
  const paths = git(["ls-tree", "-r", "--name-only", base, "src/profile"]).trim().split("\n").filter(path => path.endsWith(".ts"));
  for (const path of paths) {
    const source = git(["show", `${base}:${path}`]);
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
    writeFileSync(`${scratch}/${path.slice("src/profile/".length).replace(/\.ts$/, ".js")}`, outputText);
  }
  const tests = readFileSync("tests/profile-compiler-j2.test.mjs", "utf8")
    .replaceAll("../dist/profile/", "./")
    .replaceAll("./helpers/", "../tests/helpers/");
  writeFileSync(`${scratch}/regressions.test.mjs`, tests);
  const result = spawnSync("timeout", ["--kill-after=5s", "90s", process.execPath, "--test", "--test-reporter=./tests/helpers/compiler-reporter.mjs", `${scratch}/regressions.test.mjs`], { encoding: "utf8" });
  process.stdout.write(`BASE ${base}\n${result.stdout}`);
  if (result.stderr) process.stderr.write("base runner emitted stderr\n");
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
