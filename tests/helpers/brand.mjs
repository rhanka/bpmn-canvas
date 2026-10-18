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
  "32ed8e0a3026bc02976abc70f27ddfe1f149b8f4dc5dad00a1451dd7e86e42e9",
  "53d8731524013c0d509f1e36af2a69726f60270f88c360d562af794f0bc15fb9",
  "583423608eda0cb63146a67a6ad655858bc511ba6f0d4fd742c0d898b684295a",
  "db66fe349809217e7926360ab81ae6ff26f9816c09a4b362e7dbfd5825b688be",
  "fcb3d245658a5ecf9e75f59050fcc0fd20a92c9eeeb223a99632cd4ef789452c",
]);

const sha = (s) => createHash("sha256").update(s).digest("hex");
export const brandHashesSha256 = sha([...HASHES].sort().join("\n"));

/** Identifiers, adjacent word pairs and bracketed forms of `text` whose hash is banned. */
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
  for (const match of text.matchAll(/(?=\b([A-Za-z]+ [A-Za-z]+)\b)/g)) check(match[1]);
  for (const match of text.matchAll(/\[[A-Za-z0-9_]+\]/g)) check(match[0]);
  return [...found];
}

export const hashOf = sha;
