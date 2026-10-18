import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { publishedCommitExceptions } from "./helpers/brand-baseline.mjs";
import { resolveBaseRevision } from "./helpers/git-base.mjs";

const root = new URL("../", import.meta.url);
const base = resolveBaseRevision(root);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const historyReads = new Set(["show", "rev-parse", "cat-file", "log"]);
// Closed allowance: only the two published main commits needed by the brand
// occurrence exception. Receipt provenance is data, never a Git object source.
const allowed = publishedCommitExceptions.map(entry => entry.commit);

function scanHistoryReads(path, text, mainCommits) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  // Bind identifiers by lexical scope, including aliases and parameter shadowing.
  const program = ts.createProgram([path], { allowJs: true, noLib: true, noResolve: true }, {
    getSourceFile: name => name === path ? source : undefined,
    getDefaultLibFileName: () => "", writeFile() {}, getCurrentDirectory: () => "",
    getDirectories: () => [], fileExists: name => name === path,
    readFile: name => name === path ? text : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  });
  const checker = program.getTypeChecker();
  const hits = [];
  const references = new Map();
  function collect(node) {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (!references.has(symbol)) references.set(symbol, []);
      references.get(symbol).push(node);
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  const declaration = node => checker.getSymbolAtLocation(node)?.valueDeclaration;
  const isConst = node => node && ts.isVariableDeclaration(node)
    && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const);
  function resolve(node, seen = new Set()) {
    if (!node) return undefined;
    if (ts.isParenthesizedExpression(node)) return resolve(node.expression, seen);
    if (!ts.isIdentifier(node)) return node;
    const binding = declaration(node);
    if (!isConst(binding) || seen.has(binding)) return undefined;
    return resolve(binding.initializer, new Set([...seen, binding]));
  }
  function literal(node, seen = new Set()) {
    node = resolve(node);
    if (!node || seen.has(node)) return undefined;
    seen = new Set([...seen, node]);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = literal(span.expression, seen);
        // Only an unresolved path after a fixed revision is harmless.
        if (part === undefined && !value.includes(":")) return undefined;
        value += (part ?? "__computed__") + span.literal.text;
      }
      return value;
    }
    return undefined;
  }
  const processApis = new Set(["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]);
  const isProcessModule = node => node && ts.isStringLiteral(node)
    && ["child_process", "node:child_process"].includes(node.text);
  function isCreateRequireAlias(name) {
    const binding = checker.getSymbolAtLocation(name)?.declarations?.[0];
    return !!(binding && ts.isVariableDeclaration(binding) && ts.isCallExpression(binding.initializer)
      && ((ts.isIdentifier(binding.initializer.expression) && binding.initializer.expression.text === "createRequire")
        || (ts.isPropertyAccessExpression(binding.initializer.expression) && binding.initializer.expression.name.text === "createRequire")));
  }
  function processBinding(node, seen = new Set()) {
    if (!node || seen.has(node)) return undefined;
    seen = new Set([...seen, node]);
    if (ts.isParenthesizedExpression(node)) return processBinding(node.expression, seen);
    if (ts.isAwaitExpression(node)) return processBinding(node.expression, seen);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const spec = node.arguments[0];
      const mod = spec ? literal(spec) : undefined;
      const isProcMod = mod !== undefined && ["child_process", "node:child_process"].includes(mod);
      const isUnresolvedMod = !!spec && mod === undefined;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        if (isProcMod || isUnresolvedMod) return "module";
      } else if (ts.isIdentifier(callee)
        && ((callee.text === "require" && !declaration(callee)) || isCreateRequireAlias(callee))) {
        if (isProcMod || isUnresolvedMod || isProcessModule(spec)) return "module";
      } else if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
        const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : literal(callee.argumentExpression);
        if (method === "require" && (isProcMod || isUnresolvedMod)) return "module";
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (processBinding(node.expression, seen) !== "module") return undefined;
      const name = ts.isPropertyAccessExpression(node) ? node.name.text : literal(node.argumentExpression);
      return processApis.has(name) ? name : undefined;
    }
    if (!ts.isIdentifier(node)) return undefined;
    const binding = checker.getSymbolAtLocation(node)?.declarations?.[0];
    // Unbound names support the standalone regression snippets below. Bound
    // lookalikes and shadowed parameters are never classified by spelling.
    if (!binding) return processApis.has(node.text) ? node.text : undefined;
    if (ts.isImportSpecifier(binding) && isProcessModule(binding.parent.parent.parent.moduleSpecifier)) {
      const name = (binding.propertyName ?? binding.name).text;
      return processApis.has(name) ? name : undefined;
    }
    if (ts.isNamespaceImport(binding) && isProcessModule(binding.parent.parent.moduleSpecifier)) return "module";
    if (ts.isImportClause(binding) && isProcessModule(binding.parent.moduleSpecifier)) return "module";
    if (ts.isVariableDeclaration(binding)) return processBinding(binding.initializer, seen);
    if (ts.isBindingElement(binding) && ts.isObjectBindingPattern(binding.parent)
      && ts.isVariableDeclaration(binding.parent.parent)
      && processBinding(binding.parent.parent.initializer, seen) === "module") {
      const name = binding.propertyName ? literal(binding.propertyName) ?? binding.propertyName.getText(source) : binding.name.getText(source);
      return processApis.has(name) ? name : undefined;
    }
    return undefined;
  }
  const reject = node => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    hits.push(`${path}:${line}: unapproved Git revision`);
  };
  // Preserve the existing expression-only git wrappers. Their parameters are
  // checked at each git(...) call; arbitrary forwarding functions are refused.
  function wrapper(node) {
    const binding = ts.isIdentifier(node) ? declaration(node) : undefined;
    const fn = resolve(node);
    if (!isConst(binding) || !fn || !ts.isArrowFunction(fn)) return undefined;
    let call = fn.body;
    if (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)
      && call.expression.name.text === "trim") call = call.expression.expression;
    if (!ts.isCallExpression(call) || processBinding(call.expression) !== "execFileSync") return undefined;
    let argument = call.arguments[1];
    if (literal(call.arguments[0]) === "rtk" && argument && ts.isArrayLiteralExpression(argument)
      && argument.elements.length === 3 && literal(argument.elements[0]) === "proxy"
      && literal(argument.elements[1]) === "git" && ts.isSpreadElement(argument.elements[2])) {
      argument = argument.elements[2].expression;
    } else if (literal(call.arguments[0]) !== "git") return undefined;
    const parameter = argument && ts.isIdentifier(argument) ? declaration(argument) : undefined;
    const index = fn.parameters.indexOf(parameter);
    if (!parameter || index < 0 || index !== fn.parameters.length - 1
      || index > 1 || (!parameter.dotDotDotToken && index !== 1)) return undefined;
    const uses = references.get(checker.getSymbolAtLocation(argument)) ?? [];
    if (!uses.every(ref => ref === parameter.name || ref === argument)) return undefined;
    return { call, index, rest: !!parameter.dotDotDotToken };
  }
  function forwarded(node, argv) {
    const parameter = ts.isIdentifier(argv) ? declaration(argv) : undefined;
    if (!parameter || !ts.isParameter(parameter)) return false;
    const fn = parameter.parent;
    if (!ts.isArrowFunction(fn) || !ts.isVariableDeclaration(fn.parent)
      || fn.parent.name.getText(source) !== "git") return false;
    return wrapper(fn.parent.name)?.call === node;
  }
  function arrayIsControlled(symbol, seen = new Set()) {
    if (seen.has(symbol)) return true;
    seen = new Set([...seen, symbol]);
    return (references.get(symbol) ?? []).every(ref => {
      const parent = ref.parent;
      if (ts.isVariableDeclaration(parent)) {
        if (parent.name === ref) return true;
        return parent.initializer === ref && isConst(parent) && ts.isIdentifier(parent.name)
          && arrayIsControlled(checker.getSymbolAtLocation(parent.name), seen);
      }
      if (!ts.isCallExpression(parent)) return false;
      const callee = processBinding(parent.expression);
      if (["execFileSync", "execFile", "spawnSync", "spawn"].includes(callee)
        && literal(parent.arguments[0]) === "git" && parent.arguments[1] === ref) return true;
      const forwarding = wrapper(parent.expression);
      return ts.isIdentifier(parent.expression) && parent.expression.text === "git"
        && forwarding && !forwarding.rest && parent.arguments[forwarding.index] === ref;
    });
  }
  function argv(node, seen = new Set()) {
    if (!node) return undefined;
    if (ts.isParenthesizedExpression(node)) return argv(node.expression, seen);
    if (ts.isArrayLiteralExpression(node)) return [...node.elements];
    if (!ts.isIdentifier(node)) return undefined;
    const binding = declaration(node);
    // Validate every binding in the alias chain, including the originating
    // array even when its initializer is parenthesized.
    if (!isConst(binding) || seen.has(binding)
      || !arrayIsControlled(checker.getSymbolAtLocation(node))) return undefined;
    return argv(binding.initializer, new Set([...seen, binding]));
  }
  function callArguments(elements) {
    const result = [];
    for (const element of elements) {
      if (!ts.isSpreadElement(element)) { result.push(element); continue; }
      const array = argv(element.expression);
      const expanded = array && callArguments(array);
      if (!expanded) return undefined;
      result.push(...expanded);
    }
    return result;
  }
  function inspect(node, args) {
    if (!args?.length) { reject(node); return; }
    let command = 0;
    // Other global options can alter the repository, configuration or command.
    const globals = new Set(["--no-pager", "--paginate", "--no-optional-locks", "--literal-pathspecs", "--no-replace-objects"]);
    while (globals.has(literal(args[command]))) command++;
    const name = literal(args[command]);
    if (!name || name.startsWith("-")) { reject(node); return; }
    const options = args.slice(command + 1);
    const end = options.findIndex(arg => literal(arg) === "--");
    if (options.slice(0, end < 0 ? undefined : end).some(arg => {
      const value = literal(arg);
      return /^--stdin(?:=|$)/.test(value ?? "") || (name === "cat-file" && /^--batch/.test(value ?? ""));
    })) { reject(node); return; }
    if (!historyReads.has(name)) return;
    for (const arg of args.slice(command + 1)) {
      const value = literal(arg);
      if (value === "--") break;
      if (value?.startsWith("-")) continue;
      // A computed file path after a fixed revision does not select an object.
      const ref = value?.split(":")[0];
      if (ref === "HEAD" || ref === "main") continue;
      if (ref && /^[a-f0-9]{7,40}(?:[~^]\d*)*$/i.test(ref)) {
        const sha = ref.split(/[~^]/)[0].toLowerCase();
        const matches = mainCommits.filter(commit => commit.startsWith(sha));
        if (matches.length === 1 || allowed.includes(sha)) continue;
      }
      reject(node);
      return;
    }
  }
  function isIndirectProcessCall(node) {
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr) && !ts.isElementAccessExpression(expr)) return false;
    const receiverApi = processBinding(expr.expression);
    if (receiverApi && receiverApi !== "module" && processApis.has(receiverApi)) return true;
    const receiver = expr.expression;
    const isReflect = (ts.isIdentifier(receiver) && receiver.text === "Reflect")
      || (ts.isPropertyAccessExpression(receiver) && receiver.name.text === "Reflect")
      || (ts.isElementAccessExpression(receiver) && literal(receiver.argumentExpression) === "Reflect");
    if (isReflect) {
      const target = node.arguments[0];
      const api = target && processBinding(target);
      if (api && api !== "module" && processApis.has(api)) return true;
    }
    return false;
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (isIndirectProcessCall(node)) {
        reject(node);
        ts.forEachChild(node, visit);
        return;
      }
      const expanded = callArguments(node.arguments);
      const args = expanded ?? [...node.arguments];
      const callee = processBinding(node.expression);
      const processCall = processApis.has(callee);
      const second = resolve(args[1]);
      const options = args[2] ?? (second && ts.isObjectLiteralExpression(second) ? args[1] : undefined);
      // Process options must be inline and closed too: a mutable object could
      // enable a shell after its initializer, just like a mutable argv array.
      const shell = processCall && options && (!ts.isObjectLiteralExpression(options)
        || options.properties.some(property => ts.isSpreadAssignment(property)
          || (property.name && ts.isComputedPropertyName(property.name))
          || ((property.name?.getText(source).replace(/["']/g, "") === "shell")
            && (!ts.isPropertyAssignment(property) || property.initializer.kind !== ts.SyntaxKind.FalseKeyword))));
      const forwarding = wrapper(node.expression);
      const executable = resolve(args[0]);
      const command = executable && (ts.isStringLiteral(executable) || ts.isNoSubstitutionTemplateLiteral(executable))
        ? executable.text : undefined;
      const shellLauncher = /(?:^|[/\\])(?:sh|bash|dash|zsh|cmd(?:\.exe)?|powershell|pwsh)$/i.test(command ?? "");
      const shellArgs = shell || shellLauncher ? argv(args[1]) : undefined;
      const shellGit = /\bgit\b/i.test(command ?? "")
        || shellArgs?.some(arg => literal(arg) === undefined || /\bgit\b/i.test(literal(arg)));
      if (processCall && (!expanded || command === undefined)) {
        reject(node);
      } else if (processCall && (shell || callee === "execSync" || callee === "exec")
        && shellGit) {
        reject(node);
      } else if (processCall && shellLauncher && (!shellArgs || shellGit)) {
        reject(node);
      } else if (forwarding || (ts.isIdentifier(node.expression) && node.expression.text === "git")) {
        if (declaration(node.expression) && !forwarding) reject(node);
        else inspect(node, forwarding?.rest ? args.slice(forwarding.index)
          : forwarding ? argv(args[forwarding.index]) : args);
      } else if (/(?:^|[/\\])git(?:\.exe)?$/i.test(literal(args[0]) ?? "")) {
        if (!forwarded(node, args[1])) inspect(node, argv(args[1]));
      } else {
        // Preserve detection of Git command strings passed to other helpers.
        if (command && /\bgit\s/.test(command)) reject(node);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return hits;
}

test("should reject test Git object reads outside main and the closed published allowance", () => {
  assert.deepEqual(allowed, ["07be09e21d852beb592314d50e0370e883c9b842", "45aa6903174462e8dd95137971510f28ba5b4a19"]);
  const mainCommits = git("rev-list", base).split("\n");
  const files = directory => readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path) : /\.(?:[cm]?js|tsx?)$/.test(path) ? [path] : [];
  });
  assert.deepEqual(files("tests").flatMap(path => scanHistoryReads(path, readFileSync(new URL(path, root), "utf8"), mainCommits)), []);
});

test("should reject missing and branch revisions for every history command including computed targets", () => {
  const main = "1".repeat(40), branch = "2".repeat(40);
  for (const command of historyReads) {
    for (const target of [JSON.stringify(branch), JSON.stringify(branch.slice(0, 7)), "receipt.initialHead", "`${receipt.initialHead}:tests/neutral.mjs`", "`HEAD${suffix}`", JSON.stringify(`${main}^..${branch}`), '"topic"']) {
      for (const code of [`execFileSync("git", ["${command}", ${target}]);`, `git("${command}", ${target});`]) {
        assert.equal(scanHistoryReads("probe.mjs", code, [main]).length, 1, code);
      }
    }
    for (const ref of [main, main.slice(0, 7), "HEAD", "main", ...allowed]) {
      const code = `git("${command}", "${ref}:tests/neutral.mjs");`;
      assert.deepEqual(scanHistoryReads("probe.mjs", code, [main]), [], code);
    }
    assert.equal(scanHistoryReads("probe.mjs", `execSync("git ${command} ${branch}");`, [main]).length, 1);
    assert.equal(scanHistoryReads("probe.mjs", `execSync(\`git ${command} \$\{receipt.initialHead\}\`);`, [main]).length, 1);
    assert.equal(scanHistoryReads("probe.mjs", `const args = ["${command}", "${branch}"]; execFileSync("git", args);`, [main]).length, 1);
  }
  assert.deepEqual(scanHistoryReads("probe.mjs", 'git("show", `HEAD:${path}`); git("log", "--all", "--format=%H");', [main]), []);
  assert.deepEqual(scanHistoryReads("probe.mjs", `const receipt = { initialHead: "${branch}" };`, [main]), []);
});

test("should treat sibling corpus identifiers as data and reject local object reads of them", () => {
  for (const sha of [
    "cb46b3b8f893996a83c056f31f8aa92aa2364bd3",
    "0c6bf891f147079e175a46d0d34f42ff308d235c",
    "dfb8a986933dd86ad176022df13efecb6c73b325",
  ]) {
    const data = `const provenance = { repository: "bpmn-moddle-py", sha: "${sha}" };`;
    assert.deepEqual(scanHistoryReads("probe.mjs", data, []), []);
    for (const command of historyReads) {
      assert.equal(scanHistoryReads("probe.mjs", `${data} git("${command}", "${sha}");`, []).length, 1);
    }
  }
});

test("should reject a Git argument array mutated after its initializer", () => {
  const branch = "2".repeat(40);
  const code = `const args = ["show"]; args.push("${branch}:package.json"); execFileSync("git", args);`;
  assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1);
});

test("should reject an off-main read with a constant Git subcommand", () => {
  const branch = "2".repeat(40);
  const code = `const command = "show"; execFileSync("git", [command, "${branch}:package.json"]);`;
  assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1);
});

test("should reject shell Git even when global options precede the subcommand", () => {
  const branch = "2".repeat(40);
  const code = `execSync("git --no-pager show ${branch}:package.json");`;
  assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1);
});

test("should fail closed on mutated, escaped and unresolved Git arguments", () => {
  const branch = "2".repeat(40);
  const rejected = [
    'execFileSync("git", args);',
    'execFileSync("git", makeArgs());',
    'execFileSync("git", [command, "HEAD:package.json"]);',
    'git(command, "HEAD:package.json");',
    'execFileSync("git", [...args]);',
    'let command = "show"; execFileSync("git", [command, "HEAD:package.json"]);',
    'const args = ["show", "HEAD:package.json"]; args[1] = target; execFileSync("git", args);',
    'const args = ["show", "HEAD:package.json"]; mutate(args); execFileSync("git", args);',
    'const args = ["show"]; const alias = args; alias.push(target); execFileSync("git", args);',
    'const args = (["show"]); args.push(target); const alias = args; execFileSync("git", alias);',
    'const args = ["show", "HEAD:package.json"]; const alias = args; execFileSync("git", alias); args.pop();',
    'const args = ["show", "HEAD:package.json"]; function change() { args.push(target); } execFileSync("git", args);',
    'const args = ["show", "HEAD:package.json"]; { const args = unknown; execFileSync("git", args); }',
    'const command = "status"; function read(command) { execFileSync("git", [command, "HEAD:package.json"]); }',
    'const args = ["show", "HEAD:package.json"]; function read(args) { execFileSync("git", args); }',
    'const a = b; const b = a; execFileSync("git", a);',
    'const command = `${command}`; execFileSync("git", [command, "HEAD:package.json"]);',
    'execFileSync("git", ["--unknown", "show", "HEAD:package.json"]);',
    `const executable = "git"; const command = "show"; const target = "${branch}:package.json"; execFileSync(executable, [command, target]);`,
    `execFileSync("git", ["--no-pager", "show", "${branch}:package.json"]);`,
    'const command = "git --no-pager show HEAD:package.json"; execSync(command);',
    'execSync(command);',
    'execSync("git show HEAD:package.json");',
    'spawnSync("sh", ["-c", "git --no-pager show HEAD:package.json"]);',
    'execFileSync("git", ["show", "HEAD:package.json"], options);',
    'execFileSync("git", ["show", "HEAD:package.json"], { ...options });',
    'execFileSync("git", ["show", "HEAD:package.json"], { shell: true });',
    'const options = {}; options.shell = true; execFileSync("git", ["show", "HEAD:package.json"], options);',
    'spawnSync(`git --no-pager show ${target}`, { shell: true });',
    `execFileSync("/usr/bin/git", ["show", "${branch}:package.json"]);`,
    `const git = (...args) => execFileSync("git", args); const read = git; read("show", "${branch}:package.json");`,
  ];
  for (const code of rejected) assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1, code);
  for (const code of [
    'const args = ["show", "HEAD:package.json"]; mutate("git", args); execFileSync("git", args);',
    `const git = (...args) => execFileSync("git", args, { cwd: args.push("${branch}:package.json") }); git("show");`,
    `const git = (args, unused) => execFileSync("git", args); git(["show", "${branch}:package.json"], ["show", "HEAD:package.json"]);`,
    `const git = (...args) => { args.push("${branch}:package.json"); return execFileSync("git", args); }; git("show");`,
  ]) assert.ok(scanHistoryReads("probe.mjs", code, []).length > 0, code);
});

test("should resolve immutable constants and preserve controlled HEAD and main reads", () => {
  const main = "1".repeat(40);
  for (const ref of ["HEAD", "main", main, main.slice(0, 7), ...allowed]) {
    const code = `const executable = "git"; const command = "show"; const revision = "${ref}:package.json";
      const args = [command, revision]; const alias = args; execFileSync(executable, alias);`;
    assert.deepEqual(scanHistoryReads("probe.mjs", code, [main]), [], code);
  }
  for (const code of [
    'const command = "show"; git(command, "HEAD:package.json");',
    'const args = ["show", "HEAD:package.json"]; { const args = []; args.push(target); } execFileSync("git", args);',
    'const args = (["show", "HEAD:package.json"]); const alias = args; execFileSync("git", alias);',
    'execFileSync("git", ["--no-pager", "show", "main:package.json"]);',
    'const git = (...args) => execFileSync("git", args); git("show", "HEAD:package.json");',
    'const git = (root, ...args) => execFileSync("git", args, { cwd: root }); git(root, "show", "main:package.json");',
    'const git = (root, args) => execFileSync("git", args, { cwd: root }); git(root, ["show", "HEAD:package.json"]);',
    'const git = (...args) => execFileSync("rtk", ["proxy", "git", ...args]).trim(); git("show", "HEAD:package.json");',
    'const git = (...args) => execFileSync("git", args); const read = git; read("show", "HEAD:package.json");',
    'run("git", ["rev-parse", "HEAD"], root);',
  ]) assert.deepEqual(scanHistoryReads("probe.mjs", code, [main]), [], code);
});

test("should reject review 5 unresolved process calls by their child_process bindings", () => {
  const prefix = 'import * as childProcess from "node:child_process"; import { execFileSync, execSync as runShell } from "node:child_process";';
  const branch = "2".repeat(40);
  const rejected = [
    `const e = "gi" + "t"; execFileSync(e, ["show", "${branch}:package.json"]);`,
    `execFileSync(...["git", ["show", "${branch}:package.json"]]);`,
    `childProcess.exec("git " + "show " + "${branch}:package.json");`,
    `runShell("git " + "show " + "${branch}:package.json");`,
    'const run = execFileSync; run(executable, ["show", "HEAD:package.json"]);',
    'const { execFileSync: run } = childProcess; run(executable, []);',
    'const cp = childProcess; cp.execFileSync(executable, []);',
    'childProcess["execFileSync"](executable, []);',
    'const { spawnSync: run } = childProcess; run(...parameters);',
    'childProcess.execFileSync(executable, []);',
    'childProcess.execFileSync("git", ["show", "HEAD:package.json"], { shell: true });',
    'childProcess.spawnSync("bash", ["-c", "git show HEAD:package.json"]);',
    'childProcess.exec("git show HEAD:package.json");',
    'runShell("git show HEAD:package.json");',
  ];
  for (const code of rejected) assert.equal(scanHistoryReads("probe.mjs", `${prefix} ${code}`, []).length, 1, code);
  for (const binding of [
    'import { execFileSync as launch } from "child_process";',
    'import cp from "node:child_process"; const launch = cp.execFileSync;',
    'import * as cp from "node:child_process"; const { execFileSync: launch } = cp;',
    'const cp = require("node:child_process"); const launch = cp["execFileSync"];',
    'const { execFileSync: launch } = require("child_process");',
  ]) {
    for (const executable of ['"gi" + "t"', 'executable']) {
      const code = `${binding} launch(${executable}, ["show", "${branch}:package.json"]);`;
      assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1, code);
    }
    const code = `${binding} launch(...["git", ["show", "${branch}:package.json"]]);`;
    assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1, code);
  }
});

test("should reject review 5 Git revision modes that read stdin on any subcommand", () => {
  const branch = "2".repeat(40);
  for (const mode of ["--batch", "--batch-check", "--batch-command", "--batch=%(objectname)", "--batch-check=%(objectname)"]) {
    const code = `execFileSync("git", ["cat-file", "${mode}"], { input: "${branch}" + ":package.json\\n" });`;
    assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1, code);
    assert.equal(scanHistoryReads("probe.mjs", `git("cat-file", "${mode}");`, []).length, 1, mode);
  }
  for (const command of ["log", "rev-list", "show", "cat-file", "hash-object"]) {
    for (const option of ["--stdin", "--stdin=anything"]) {
      const code = `execFileSync("git", ["${command}", "${option}"], { input: "${branch}\\n" });`;
      assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1, code);
    }
  }
  assert.deepEqual(scanHistoryReads("probe.mjs", 'git("show", "HEAD:--stdin"); git("show", "HEAD", "--", "--stdin");', []), []);
});

test("should preserve safe process bindings and unrelated functions with matching names", () => {
  const prefix = 'import childProcess from "node:child_process"; import { execFileSync as run } from "node:child_process";';
  for (const ref of ["HEAD", "main", "1".repeat(40), ...allowed]) {
    for (const call of ['run', 'childProcess.execFileSync', 'childProcess["execFileSync"]']) {
      const code = `${prefix} ${call}("git", ["show", "${ref}:package.json"]);`;
      assert.deepEqual(scanHistoryReads("probe.mjs", code, ["1".repeat(40)]), [], code);
    }
  }
  for (const code of [
    'function execSync(command) {} execSync(command);',
    'const other = { execSync(command) {} }; other.execSync(command);',
    `${prefix} function probe(run) { run(command); }`,
    `${prefix} childProcess.execSync("echo neutral");`,
    `${prefix} childProcess.spawnSync("sh", ["-c", "echo neutral"]);`,
    `${prefix} const { spawnSync: launch } = childProcess; launch("node", [script]);`,
    `${prefix} run(...["git", ["show", "HEAD:package.json"]]);`,
    `${prefix} const git = (...args) => run("git", args); git("show", "HEAD:package.json");`,
  ]) assert.deepEqual(scanHistoryReads("probe.mjs", code, []), [], code);
});

test("should reject indirect process invocation through call/apply/bind and Reflect", () => {
  const branch = "2".repeat(40);
  const prefix = 'import { execFileSync, execSync, spawnSync } from "node:child_process"; import * as cp from "node:child_process";';
  const rejected = [
    `execFileSync.call(null, "git", ["show", "${branch}:package.json"]);`,
    `execFileSync.apply(null, ["git", ["show", "${branch}:package.json"]]);`,
    `execFileSync.bind(null, "git", ["show", "${branch}:package.json"]);`,
    `cp.execFileSync.call(null, "git", ["show", "${branch}:package.json"]);`,
    `execFileSync["call"](null, "git", ["show", "${branch}:package.json"]);`,
    `spawnSync.call(null, "git", ["show", "${branch}:package.json"]);`,
    `execSync.call(null, "git show ${branch}:package.json");`,
    `Reflect.apply(execFileSync, null, ["git", ["show", "${branch}:package.json"]]);`,
    `Reflect.apply(cp.execFileSync, null, ["git", ["show", "${branch}:package.json"]]);`,
    `execFileSync.call(null, "git", ["cat-file", "--batch"], { input: "${branch}\\n" });`,
    `const g = execFileSync.bind(null, "git", ["show", "${branch}:package.json"]); g();`,
  ];
  for (const code of rejected) assert.equal(scanHistoryReads("probe.mjs", `${prefix} ${code}`, []).length, 1, code);
});

test("should reject unresolved executables through dynamic import and variable require specifiers", () => {
  const branch = "2".repeat(40);
  const rejected = [
    `const cp = await import("node:child_process"); cp.execFileSync(executable, ["show", "HEAD:package.json"]);`,
    `const cp = await import("node:child_process"); cp.execFileSync("git", ["cat-file", "--batch"], { input: executable });`,
    `import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const cp = require("node:child_process"); cp.execFileSync(executable, []);`,
    `const m = "node:child_process"; const cp = require(m); cp.execFileSync(executable, []);`,
    `const m = "node:child_process"; const cp = require(m); cp.execFileSync("git", ["show", "${branch}:package.json"]);`,
    `const spec = "node:child_process"; const mod = await import(spec); mod.execFileSync(executable, []);`,
  ];
  for (const code of rejected) assert.equal(scanHistoryReads("probe.mjs", code, []).length, 1, code);
  assert.deepEqual(scanHistoryReads("probe.mjs", `const cp = await import("node:child_process"); cp.execFileSync("git", ["show", "HEAD:package.json"]);`, []), []);
});

test("should verify corpus reseals and runtime twins without intermediate Git objects", t => {
  const scratch = mkdtempSync(join(tmpdir(), "corpus-history-free-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const shim = join(scratch, "git");
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(shim, `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const command = args.findIndex(arg => ${JSON.stringify([...historyReads])}.includes(arg));
if (command >= 0 && args.slice(command + 1).some(arg => /\\b[a-f0-9]{7,40}\\b/i.test(arg))) process.exit(97);
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
`);
  chmodSync(shim, 0o755);
  assert.equal(spawnSync("node", [shim, "show", `${"a".repeat(40)}:tests/neutral.mjs`]).status, 97);
  assert.equal(spawnSync("node", [shim, "--no-pager", "show", `${"a".repeat(40)}:tests/neutral.mjs`]).status, 97);
  assert.equal(spawnSync("node", [shim, "rev-parse", "HEAD"]).status, 0);
  assert.equal(spawnSync("node", [shim, "rev-parse", base]).status, 0);
  const env = { ...process.env, PATH: `${scratch}:${process.env.PATH}` };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync("node", ["--test", "tests/profile-corpus-revendor.test.mjs", "tests/profile-twin-proof.test.mjs"], {
    cwd: root, encoding: "utf8", env, timeout: 30000,
  });
  assert.equal(result.status, 0, (result.stdout + result.stderr).split("\n").filter(line => /not ok|# fail|error:/.test(line)).join("\n"));
  assert.match(result.stdout, /^# tests 157$/m);
});
