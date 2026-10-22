// Seal and independence checks for the lot-5 UI expectations
// (tests/fixtures/lot5-ui/expectations). Reads sealed bytes only; executes no
// loader, compiler, evaluator, codec, layout, exporter or command.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTATIONS = new URL("../fixtures/lot5-ui/expectations/", import.meta.url);
export const SEAL_FORMAT = "lot5-ui-expectations-seal/2";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const refuse = reason => { throw new Error(`seal ${reason}`); };
const safe = path => {
  if (typeof path !== "string" || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.split("/").some(part => part === "." || part === "..")) refuse("unsafe path");
  return path;
};

/** Every regular file below root (relative paths, sorted); links and empty directories refuse. */
export function inventory(root = EXPECTATIONS) {
  const directory = root instanceof URL ? fileURLToPath(root) : resolve(root);
  const found = [];
  (function walk(path, relative) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) refuse("linked entry");
    if (stat.isDirectory()) {
      const names = readdirSync(path).sort();
      if (!names.length) refuse("empty directory");
      for (const name of names) walk(join(path, name), relative ? `${relative}/${name}` : name);
    } else {
      if (!stat.isFile() || stat.nlink !== 1) refuse("nonregular or linked entry");
      found.push(safe(relative));
    }
  })(directory, "");
  return found.sort();
}

/**
 * Verify seal.json against the bytes on disk, or against overrides (path -> Buffer)
 * standing in for single files. Throws on any drift, missing, extra or unsafe entry.
 */
export function verifySeal(root = EXPECTATIONS, overrides = new Map()) {
  const directory = root instanceof URL ? fileURLToPath(root) : resolve(root);
  const read = path => overrides.has(path) ? overrides.get(path) : readFileSync(join(directory, path));
  const seal = JSON.parse(read("seal.json").toString("utf8"));
  if (seal.format !== SEAL_FORMAT || !Array.isArray(seal.files) || JSON.stringify(seal.excluded) !== '["seal.json"]' || !Array.isArray(seal.executables)) refuse("format");
  const paths = seal.files.map(file => {
    if (!file || Object.keys(file).sort().join(",") !== "bytes,path,sha256" || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)) refuse("entry shape");
    return safe(file.path);
  });
  if (new Set(paths).size !== paths.length || paths.includes("seal.json")) refuse("duplicate entry");
  if (JSON.stringify(inventory(directory)) !== JSON.stringify([...paths, "seal.json"].sort())) refuse("inventory mismatch");
  for (const file of seal.files) {
    const bytes = read(file.path);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`seal drift in ${file.path}`);
  }
  for (const exe of seal.executables) {
    const entry = seal.files.find(f => f.path === exe.path);
    if (!entry || entry.sha256 !== exe.sha256) refuse("executable pin");
  }
  return seal.files;
}

// ---------------------------------------------------------------- module-loading guard (token based, fail closed)
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const IDENT_START = /[A-Za-z_$ -￿]/u, IDENT_PART = /[A-Za-z0-9_$ -￿‌‍]/u;
/**
 * Tokenize JavaScript module source: comments and string/template/regex
 * literal bodies are opaque; template substitutions are tokenized as code.
 * Throws on any unterminated or unscannable construct (fail closed).
 */
export function tokenize(source) {
  const tokens = [], opaque = []; // opaque: [start, end, kind] ranges of comments and literal bodies
  let i = 0;
  const stack = []; // template brace depth contexts
  const prevSignificant = () => tokens[tokens.length - 1];
  const regexAllowed = () => {
    const p = prevSignificant();
    if (!p) return true;
    if (p.type === "num" || p.type === "str" || p.type === "tpl" || p.type === "regex") return false;
    if (p.type === "id") return KEYWORDS_BEFORE_REGEX.has(p.value);
    return ![")", "]", "}"].includes(p.value);
  };
  const scanTemplate = start => { // i points just after the backtick or the closing brace of a substitution
    let text = "";
    while (i < source.length) {
      const c = source[i];
      if (c === "\\") { text += source.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { i++; return { done: true, text }; }
      if (c === "$" && source[i + 1] === "{") { i += 2; return { done: false, text }; }
      text += c; i++;
    }
    throw new Error(`unterminated template literal at ${start}`);
  };
  if (source.startsWith("#!")) { const end = source.indexOf("\n"); opaque.push([0, end < 0 ? source.length : end, "comment"]); i = end < 0 ? source.length : end; }
  while (i < source.length) {
    const c = source[i];
    if (/\s/u.test(c)) { i++; continue; }
    if (c === "/" && source[i + 1] === "/") { const end = source.indexOf("\n", i); opaque.push([i, end < 0 ? source.length : end, "comment"]); i = end < 0 ? source.length : end; continue; }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new Error(`unterminated comment at ${i}`);
      opaque.push([i, end + 2, "comment"]); i = end + 2; continue;
    }
    if (c === "'" || c === "\"") {
      const start = i; let value = ""; i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === "\n") throw new Error(`newline in string at ${start}`);
        if (source[i] === "\\") { value += source[i + 1] === undefined ? "" : decodeEscape(source, i); i += escapeLength(source, i); continue; }
        value += source[i]; i++;
      }
      if (i >= source.length) throw new Error(`unterminated string at ${start}`);
      i++; opaque.push([start, i, "string"]); tokens.push({ type: "str", value, start, end: i }); continue;
    }
    if (c === "`") {
      const start = i; i++;
      const part = scanTemplate(start);
      opaque.push([start, i, "template"]);
      if (part.done) tokens.push({ type: "tpl", value: part.text, substitutions: false, start, end: i });
      else { tokens.push({ type: "tpl", value: part.text, substitutions: true, start, end: i }); stack.push(0); }
      continue;
    }
    if (c === "}" && stack.length && stack[stack.length - 1] === 0) {
      stack.pop(); const start = i; i++;
      const part = scanTemplate(start);
      opaque.push([start, i, "template"]);
      tokens.push({ type: "tpl", value: part.text, substitutions: !part.done, start, end: i });
      if (!part.done) stack.push(0);
      continue;
    }
    if (c === "/" && regexAllowed()) {
      const start = i; i++; let inClass = false;
      while (i < source.length) {
        const d = source[i];
        if (d === "\n") throw new Error(`newline in regex at ${start}`);
        if (d === "\\") { i += 2; continue; }
        if (d === "[") inClass = true; else if (d === "]") inClass = false; else if (d === "/" && !inClass) break;
        i++;
      }
      if (i >= source.length) throw new Error(`unterminated regex at ${start}`);
      i++; while (i < source.length && /[a-z]/.test(source[i])) i++;
      opaque.push([start, i, "regex"]); tokens.push({ type: "regex", value: source.slice(start, i), start, end: i }); continue;
    }
    if (c === "\\") throw new Error(`escape outside a literal at ${i}`);
    if (IDENT_START.test(c)) {
      const start = i; while (i < source.length && (IDENT_PART.test(source[i]))) i++;
      if (source[i] === "\\") throw new Error(`escaped identifier at ${start}`);
      tokens.push({ type: "id", value: source.slice(start, i), start, end: i }); continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const start = i; while (i < source.length && /[0-9A-Za-z_.]/.test(source[i])) i++;
      tokens.push({ type: "num", value: source.slice(start, i), start, end: i }); continue;
    }
    const three = source.slice(i, i + 3), two = source.slice(i, i + 2);
    const punct = ["...", "===", "!==", "**=", "<<=", ">>=", "&&=", "||=", "??="].includes(three) ? three
      : ["=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"].includes(two) ? two : c;
    if (stack.length) { if (punct === "{") stack[stack.length - 1]++; else if (punct === "}") stack[stack.length - 1]--; }
    tokens.push({ type: "punct", value: punct, start: i, end: i + punct.length }); i += punct.length;
  }
  if (stack.length) throw new Error("unterminated template substitution");
  return { tokens, opaque };
}
function escapeLength(s, i) {
  const n = s[i + 1];
  if (n === "u") return s[i + 2] === "{" ? s.indexOf("}", i) - i + 1 : 6;
  if (n === "x") return 4;
  return 2;
}
function decodeEscape(s, i) {
  const n = s[i + 1];
  if (n === "u") { const hex = s[i + 2] === "{" ? s.slice(i + 3, s.indexOf("}", i)) : s.slice(i + 2, i + 6); return String.fromCodePoint(parseInt(hex, 16)); }
  if (n === "x") return String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16));
  return { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" }[n] ?? n;
}

const LOADERS = new Set(["require", "createRequire", "eval", "Function", "importScripts", "globalThis", "global", "module", "exports", "WebAssembly"]);
/**
 * Every module-loading construct of a source: {specifiers, violations}. A
 * static import/export-from contributes its specifier; dynamic import(),
 * require, eval, Function, import.meta beyond .url, process beyond .argv,
 * template or computed specifiers and any unscannable text are violations.
 */
export function scanModuleLoads(source) {
  const specifiers = [], violations = [];
  let scan;
  try { scan = tokenize(source); } catch (error) { return { specifiers, violations: [`unscannable: ${error.message}`] }; }
  const t = scan.tokens;
  const at = k => t[k] ?? { type: "eof", value: "" };
  for (let k = 0; k < t.length; k++) {
    const tok = t[k];
    if (tok.type !== "id") continue;
    const prev = at(k - 1), next = at(k + 1);
    const isMember = prev.type === "punct" && (prev.value === "." || prev.value === "?.");
    if (tok.value === "import" && !isMember) {
      if (next.value === ".") {
        if (at(k + 2).value === "meta" && at(k + 3).value === "." && at(k + 4).value === "url") continue;
        violations.push(`import.meta beyond url at ${tok.start}`); continue;
      }
      if (next.value === "(") { violations.push(`dynamic import at ${tok.start}`); continue; }
      const statementStart = !prev.value || [";", "}", "{"].includes(prev.value) && prev.type === "punct";
      if (!statementStart) { violations.push(`unrecognized import at ${tok.start}`); continue; }
      // import "x";  import clause from "x";  (attributes after the specifier are tolerated only as `with {…}`)
      let j = k + 1;
      if (at(j).type !== "str") {
        while (j < t.length && !(at(j).type === "id" && at(j).value === "from") && at(j).value !== ";") j++;
        if (!(at(j).type === "id" && at(j).value === "from")) { violations.push(`import without from at ${tok.start}`); continue; }
        j++;
      }
      if (at(j).type !== "str") { violations.push(`non-literal import specifier at ${tok.start}`); continue; }
      specifiers.push(at(j).value);
      if (at(j + 1).type === "id" && ["with", "assert"].includes(at(j + 1).value)) violations.push(`import attributes at ${tok.start}`);
      continue;
    }
    if (tok.value === "export" && !isMember) {
      let j = k + 1;
      if (at(j).value === "*" || at(j).value === "{") {
        let depth = 0;
        for (; j < t.length; j++) {
          if (at(j).value === "{") depth++; else if (at(j).value === "}") depth--;
          if (depth === 0 && (at(j).value === "}" || at(j).value === "*")) { j++; break; }
        }
        if (at(j).type === "id" && at(j).value === "as") j += 2;
        if (at(j).type === "id" && at(j).value === "from") {
          if (at(j + 1).type !== "str") violations.push(`non-literal export specifier at ${tok.start}`);
          else specifiers.push(at(j + 1).value);
        }
      }
      continue;
    }
    if (LOADERS.has(tok.value)) { violations.push(`${tok.value} at ${tok.start}`); continue; }
    if (tok.value === "process" && !isMember) {
      if (!(next.value === "." && at(k + 2).value === "argv")) violations.push(`process access at ${tok.start}`);
      continue;
    }
  }
  // Fail closed: every raw occurrence of a loading word must be a classified token, or lie in a comment or a string/template body.
  for (const m of source.matchAll(/(?<![A-Za-z0-9_$])(?:import|require|createRequire|eval|Function|process)(?![A-Za-z0-9_$])/g)) {
    const pos = m.index;
    if (t.some(x => x.type === "id" && x.start === pos)) continue;
    const range = scan.opaque.find(([a, b]) => pos >= a && pos < b);
    if (range && range[2] !== "regex") continue;
    violations.push(`${m[0]} hidden ${range ? "in a regex literal" : "from the tokenizer"} at ${pos}`);
  }
  return { specifiers, violations };
}
const BUILTINS = new Set(["node:crypto", "node:fs", "node:path", "node:url"]);
/** Allowed loads: authoring helpers may load Node crypto/fs/path/url, sibling ./lot5-*.mjs modules and the pinned comparator; the comparator only node:crypto. */
export function forbiddenImports(source, { comparator = false } = {}) {
  const { specifiers, violations } = scanModuleLoads(source);
  const allowed = s => comparator ? s === "node:crypto" : BUILTINS.has(s) || /^\.\/lot5-[a-z0-9-]+\.mjs$/.test(s) || s === "../comparators/lot5-compare.mjs";
  return [...violations, ...specifiers.filter(s => !allowed(s))];
}
/** Every derivation helper and the comparator executable, with their guard profile. */
export function derivationHelpers(root = EXPECTATIONS) {
  const out = [];
  for (const dir of ["author", "comparators"]) {
    const directory = new URL(`${dir}/`, root);
    for (const name of readdirSync(directory).filter(n => n.endsWith(".mjs")).sort()) {
      out.push({ name: `${dir}/${name}`, comparator: dir === "comparators", source: readFileSync(new URL(name, directory), "utf8") });
    }
  }
  return out;
}
