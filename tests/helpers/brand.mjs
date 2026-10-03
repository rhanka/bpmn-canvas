// Words that must never appear in the package, its sources or its docs: a brand and the identifiers of the
// internal project this code was extracted from. Only their SHA-256 (lower case) is written here, so the
// words themselves appear nowhere in the repository.
import { createHash } from "node:crypto";

const HASHES = new Set([
  "36aa04f4333ebc94260a496b27815226e288d9f946e5eca92362e42c09626290",
  "138a62a1a80d724e866794bf5417ccf20e4c406452c2d4b2ba102fbd2288a30e",
  "d040b14773a422aa0191db4a5ebba83974ef6bc308aeca0aebcf35d73d398252",
  "c8e73184b9b79668836ee7b6ebf7da95b1716c2d03410e11937a7fe45326d677",
  "6ee912f4da943f9aa092e0630a282f4cb60cb152b228b19ae33bab9f4150e046",
  "edf9539d742397cb3c267b7ed30d2e5b3060f999b9512612de63a588f975bfc5",
]);

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Identifiers of `text` (whole, and their snake_case / camelCase parts) whose hash is banned. */
export function brandTokens(text, extraHashes = []) {
  const banned = new Set([...HASHES, ...extraHashes]);
  const cache = new Map();
  const found = new Set();
  const check = (t) => {
    if (t.length < 3) return;
    const k = t.toLowerCase();
    let h = cache.get(k);
    if (h === undefined) cache.set(k, (h = sha(k)));
    if (banned.has(h)) found.add(t);
  };
  for (const token of text.split(/[^A-Za-z0-9_]+/)) {
    if (!token) continue;
    check(token);
    for (const part of token.split(/_+|(?<=[a-z0-9])(?=[A-Z])/)) if (part && part !== token) check(part);
  }
  return [...found];
}

export const hashOf = sha;
