import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testsRoot = fileURLToPath(new URL("./", import.meta.url));
const systemBrowser = /\/snap\/|\/(?:usr|opt|bin|Applications)\/[^\s"'`]*(?:chrom(?:e|ium)|msedge)|[a-z]:[\\/][^\n"'`]*(?:chrome|msedge)\.exe|\b(?:[a-z]+[-]chrome(?:-stable)?|chromium[-]browser)\b/i;

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?[jt]sx?|html)$/.test(entry.name) ? [path] : [];
  });
}

const descendants = (node, predicate) => {
  const found = [];
  const visit = child => {
    if (predicate(child)) found.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};
const member = node => ts.isPropertyAccessExpression(node) ? node.name.text
  : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
const property = (node, name) => node && ts.isObjectLiteralExpression(node)
  ? node.properties.find(p => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) && p.name.text === name)?.initializer
  : undefined;

// Accept a narrow, auditable launch shape; an unrecognised launch fails closed.
function inspectSource(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const errors = [];
  const report = (node, reason) => errors.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${reason}`);
  const imports = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
      imports.set(binding.name.text, [statement.moduleSpecifier.text, (binding.propertyName ?? binding.name).text]);
    }
  }
  const definition = identifier => {
    for (let scope = identifier.parent; scope; scope = scope.parent) {
      if (ts.isFunctionLike(scope) && scope.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === identifier.text)) return undefined;
      if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
      for (const statement of scope.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const declaration = statement.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === identifier.text);
        if (declaration) return statement.declarationList.flags & ts.NodeFlags.Const ? declaration : undefined;
      }
    }
  };
  const imported = (node, module, name) => ts.isIdentifier(node) && imports.get(node.text)?.[0] === module && imports.get(node.text)?.[1] === name;
  const call = (node, module, name) => node && ts.isCallExpression(node) && imported(node.expression, module, name);
  const bundled = node => node && ts.isCallExpression(node) && member(node.expression) === "executablePath"
    && imported(node.expression.expression, "playwright-core", "chromium") && node.arguments.length === 0;

  if (systemBrowser.test(source)) errors.push(`${path}: system browser reference`);
  for (const node of descendants(file, ts.isCallExpression)) {
    const method = member(node.expression) ?? (ts.isIdentifier(node.expression) ? node.expression.text : undefined);
    if (method === "connectOverCDP" || method === "connect") {
      report(node, "external browser connection");
      continue;
    }
    if (method !== "launch" && method !== "launchPersistentContext") continue;
    if (method !== "launchPersistentContext" || !node.expression.expression || !imported(node.expression.expression, "playwright-core", "chromium")) {
      report(node, "use a persistent context with an explicit temporary profile");
      continue;
    }
    const [profile, options] = node.arguments;
    const declaration = profile && ts.isIdentifier(profile) ? definition(profile) : undefined;
    const allocation = declaration?.initializer;
    const directory = call(allocation, "node:fs", "mkdtempSync") && allocation.arguments[0];
    const temporary = call(directory, "node:path", "join") && directory.arguments.length === 2
      && call(directory.arguments[0], "node:os", "tmpdir")
      && ts.isStringLiteralLike(directory.arguments[1]) && directory.arguments[1].text.length > 0;
    if (!temporary) report(node, "profile must be freshly allocated under the OS temporary directory");
    const optionNames = options && ts.isObjectLiteralExpression(options) ? options.properties.map(p =>
      ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : undefined) : [];
    const args = property(options, "args");
    if (!bundled(property(options, "executablePath")) || optionNames.some(name => !name)
      || new Set(optionNames).size !== optionNames.length || property(options, "channel") || property(options, "ignoreDefaultArgs")) {
      report(node, "use only the bundled executable lookup");
    }
    if (args && (!ts.isArrayLiteralExpression(args) || args.elements.some(arg => !ts.isStringLiteralLike(arg)
      || /^--(?:user-data-dir|profile-directory)(?:=|$)/.test(arg.text)))) report(node, "do not override profile arguments");
    const cleanup = [];
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (!ts.isTryStatement(parent) || !parent.finallyBlock || node.pos < parent.tryBlock.pos || node.end > parent.tryBlock.end) continue;
      cleanup.push(...descendants(parent.finallyBlock, child => call(child, "node:fs", "rmSync")
        && child.arguments[0] && ts.isIdentifier(child.arguments[0]) && definition(child.arguments[0]) === declaration
        && property(child.arguments[1], "recursive")?.kind === ts.SyntaxKind.TrueKeyword
        && property(child.arguments[1], "force")?.kind === ts.SyntaxKind.TrueKeyword));
    }
    if (!declaration || cleanup.length === 0) report(node, "remove the dedicated profile in finally");
  }
  return errors;
}

function inspectTree(root) {
  return sourceFiles(root).flatMap(path => inspectSource(relative(root, path), readFileSync(path, "utf8")));
}

test("browser launch guard: every test uses the bundled engine and a temporary profile", () => {
  assert.deepEqual(inspectTree(testsRoot), []);
});

// Finding 21: a long TMPDIR must not break Chromium. Every browser profile is
// allocated with a short prefix and fails fast when the profile path leaves no
// room for Chromium IPC sockets; the golden-independence exhaustive test
// carries its own 3600 s timeout while the global --test-timeout is unchanged.
test("browser launch guard: short profile prefix, socket path check and golden timeout", () => {
  for (const rel of ["browser/harness.mjs", "profile-native-demo.browser.test.mjs", "demo.browser.test.mjs", "browser-dist.browser.test.mjs", "p3/run.mjs"]) {
    const source = readFileSync(join(testsRoot, rel), "utf8");
    assert.ok(source.includes('join(tmpdir(), "b-")'), `${rel} allocates its profile with a short prefix`);
    assert.match(source, /profile\.length/, `${rel} checks the profile socket path length`);
  }
  const golden = readFileSync(join(testsRoot, "profile-golden-independence.test.mjs"), "utf8");
  assert.match(golden, /timeout:\s*3600000/, "golden-independence carries its own 3600 s timeout");
});

// Finding 22: the launch guard covers more than tests/. Helper scripts that
// launch Chromium must use the bundled engine, never a system browser path.
test("browser launch guard: helper scripts use the bundled engine", () => {
  for (const rel of ["../scripts/gen-demo-svg.mjs", "../experiments/e3/run.mjs"]) {
    const source = readFileSync(join(testsRoot, rel), "utf8");
    assert.doesNotMatch(source, systemBrowser, `${rel} must not reference a system browser`);
  }
});

test("browser launch guard discriminates unsafe mutations on an OS-temporary scratch copy", t => {
  const scratch = mkdtempSync(join(tmpdir(), "browser-guard-"));
  const paths = ["browser/harness.mjs", "profile-native-demo.browser.test.mjs", "demo.browser.test.mjs", "browser-dist.browser.test.mjs", "p3/run.mjs"];
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      copyFileSync(join(testsRoot, path), join(scratch, path));
    }
    assert.deepEqual(inspectTree(scratch), [], "the unmodified scratch copy passes");
    let rejected = 0;
    for (const path of paths) {
      const target = join(scratch, path);
      const source = readFileSync(target, "utf8");
      const mutated = source.replace("launchPersistentContext(profile,", "launch(");
      assert.notEqual(mutated, source, `${path} changes the scratch copy`);
      writeFileSync(target, mutated);
      assert.ok(inspectTree(scratch).length > 0, `${path} must reject a non-persistent launch`);
      rejected++;
      writeFileSync(target, source);
    }
    const target = join(scratch, paths[0]);
    const source = readFileSync(target, "utf8");
    const mutations = [
      ["non-persistent launch", source.replace("launchPersistentContext(profile,", "launch(")],
      ["empty profile", source.replace("launchPersistentContext(profile,", 'launchPersistentContext("",')],
      ["fixed profile", source.replace("mkdtempSync(join(tmpdir(), \"b-\"))", '"shared-profile"')],
      ["checkout profile", source.replace("join(tmpdir(), \"b-\")", 'join(root, "b-")')],
      ["no profile removal", source.replace("rmSync(profile, { recursive: true, force: true });", "")],
      ["environment executable", source.replace("chromium.executablePath()", "process.env.CHROMIUM")],
      ["missing executable lookup", source.replace("executablePath: chromium.executablePath(),", "")],
      ["duplicate executable option", source.replace("executablePath: chromium.executablePath(),", "executablePath: chromium.executablePath(), executablePath: process.env.CHROMIUM,")],
      ["spread executable option", source.replace("headless: true,", "headless: true, ...process.env,")],
      ["profile argument override", source.replace('"--no-first-run"', '"--user-data-dir=shared-profile"')],
      ["system executable", source.replace("chromium.executablePath()", JSON.stringify(["", "usr", "bin", "chromium"].join("/")))],
      ["snap reference", source + `\n// ${["", "snap", "bin", "chromium"].join("/")}\n`],
      ["external connection", source + '\nchromium.connectOverCDP(process.env.CDP_URL);\n'],
      ["bracket launch", source + '\nchromium["launch"]({});\n'],
    ];
    for (const [name, mutated] of mutations) {
      assert.notEqual(mutated, source, `${name} changes the scratch copy`);
      writeFileSync(target, mutated);
      assert.ok(inspectTree(scratch).length > 0, `${name} must fail the guard`);
      rejected++;
    }
    writeFileSync(target, source);
    // Strings and comments that merely mention launch APIs are not launch calls.
    writeFileSync(join(scratch, "mentions.mjs"), 'const note = "chromium.launch({})"; // chromium.launchPersistentContext()\n');
    assert.deepEqual(inspectTree(scratch), [], "the restored copy and harmless mentions pass");
    t.diagnostic(`Scratch copy: baseline accepted; ${rejected} unsafe mutations rejected; restored copy accepted.`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
