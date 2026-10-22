/** Test-only dependency/import inventory (moved out of shipped source, G9).
 * Pure helper: which of the listed packages are declared in package.json
 * fields, and which are imported by the entry-point sources. */
const clone = value => JSON.parse(JSON.stringify(value));

const asRecord = value => (value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined);

export function packageSurface(query) {
  const { packages, fields, entrySources, packageJsonText } = query;
  const packageJson = JSON.parse(packageJsonText);
  const depFields = fields.length > 0 ? fields : ["dependencies", "peerDependencies", "optionalDependencies"];
  const declared = packages.filter(name => depFields.some(field => {
    const deps = asRecord(packageJson[field] ?? {});
    return deps !== undefined && Object.hasOwn(deps, name);
  }));
  const imported = new Set();
  const visited = new Set();
  const specifierOf = source => {
    const found = [];
    const patterns = [/from\s+["']([^"']+)["']/g, /import\s*\(\s*["']([^"']+)["']\s*\)/g, /require\s*\(\s*["']([^"']+)["']\s*\)/g,
      /import\s+["']([^"']+)["']/g, /export\s+[^"']*from\s+["']([^"']+)["']/g];
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(source)) !== null) {
        if (match[1] !== undefined) found.push(match[1]);
      }
    }
    return found;
  };
  const visit = name => {
    if (visited.has(name)) return;
    visited.add(name);
    const source = entrySources[name];
    if (source === undefined) return;
    for (const spec of specifierOf(source)) {
      if (!spec.startsWith(".")) {
        for (const pkg of packages) {
          if (spec === pkg || spec.startsWith(`${pkg}/`)) imported.add(pkg);
        }
        continue;
      }
      const base = name.split("/").slice(0, -1).join("/");
      const parts = (base ? `${base}/${spec}` : spec).split("/");
      const stack = [];
      for (const part of parts) {
        if (part === "." || part === "") continue;
        if (part === "..") stack.pop();
        else stack.push(part);
      }
      const resolved = stack.join("/");
      const candidates = [resolved, `${resolved}.ts`, resolved.replace(/\.js$/, ".ts"),
        resolved.replace(/\.js$/, ".tsx"), `${resolved}/index.ts`];
      for (const candidate of candidates) {
        if (Object.hasOwn(entrySources, candidate)) {
          visit(candidate);
          break;
        }
      }
    }
  };
  for (const name of Object.keys(entrySources)) visit(name);
  return { status: "ok", payload: clone({ declared, importedByEntryPoints: [...imported].sort() }), diagnostics: [] };
}
