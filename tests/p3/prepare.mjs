// Builds the package, packs it, installs the TARBALL into a consumer outside the repo,
// and builds that consumer with Vite. Returns hashes for the evidence.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)])).sort();
}

export function distHash() {
  const dist = join(repo, "dist");
  const h = createHash("sha256");
  for (const f of listFiles(dist)) h.update(f + "\0" + sha(readFileSync(join(dist, f))) + "\n");
  return h.digest("hex");
}

export function prepare({ workdir = process.env.P3_WORKDIR ?? join(homedir(), ".cache-tmp", "bpmn-canvas-p3") } = {}) {
  const log = [];
  const sh = (cmd, args, cwd) => {
    log.push(`$ (${cwd}) ${cmd} ${args.join(" ")}`);
    return run(cmd, args, cwd);
  };
  rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });

  sh("npm", ["run", "build"], repo);
  const head = run("git", ["rev-parse", "HEAD"], repo).trim();
  const dirty = run("git", ["status", "--porcelain", "--", ".", ":!proofs"], repo).trim() !== "";
  const packOut = JSON.parse(sh("npm", ["pack", "--json", "--pack-destination", workdir], repo));
  const tarball = join(workdir, packOut[0].filename);
  const tarSha = sha(readFileSync(tarball));

  const consumer = join(workdir, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "p3-consumer", private: true, type: "module", version: "0.0.0" }, null, 2));
  sh("npm", ["install", "--no-audit", "--no-fund", tarball, "react@19.3.0", "react-dom@19.3.0", "vite"], consumer);
  const installed = JSON.parse(readFileSync(join(consumer, "node_modules/@sentropic/bpmn-canvas/package.json"), "utf8"));

  const src = join(repo, "tests/p3/consumer");
  for (const f of readdirSync(src)) if (/\.(html|js|mjs)$/.test(f)) cpSync(join(src, f), join(consumer, f));
  const corpus = join(consumer, "public/corpus");
  mkdirSync(corpus, { recursive: true });
  for (const d of ["experiments/e3/corpus", "tests/fixtures/corpus"]) for (const f of readdirSync(join(repo, d))) if (f.endsWith(".bpmn")) cpSync(join(repo, d, f), join(corpus, f));
  sh("npx", ["vite", "build"], consumer);
  const out = join(consumer, "out");
  if (!existsSync(join(out, "lab.html"))) throw new Error("consumer build produced no lab.html");

  return { workdir, consumer, out, tarball, tarSha, tarName: packOut[0].filename, distHash: distHash(), head, dirty, installedVersion: installed.version, log, packFiles: packOut[0].files.map((f) => f.path) };
}
