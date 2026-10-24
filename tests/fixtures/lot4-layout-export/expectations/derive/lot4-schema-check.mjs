// Spec-author syntax check for the synthetic lot-4 packages against the
// vendored profile-mechanism/1 JSON Schema. It implements only the closed
// keyword subset used by that schema. It is a data check, not a profile
// loader or compiler: no CR rule, descriptor or evaluation semantics.
const KEYWORDS = new Set(["$schema", "$id", "$comment", "title", "$defs", "$ref", "type", "properties", "required",
  "additionalProperties", "items", "minItems", "maxItems", "uniqueItems", "minLength", "pattern", "enum", "const",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "description"]);

const typeOf = v => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const sameJson = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}
const codePoints = s => [...s].length;

export function validate(schema, root = schema) {
  const errors = [];
  function resolve(ref) {
    if (!ref.startsWith("#/")) throw new Error(`external $ref ${ref}`);
    return ref.slice(2).split("/").reduce((node, part) => node[part.replace(/~1/g, "/").replace(/~0/g, "~")], root);
  }
  function check(s, v, path) {
    if (s === true) return true;
    if (s === false) return false;
    for (const k of Object.keys(s)) if (!KEYWORDS.has(k)) throw new Error(`unsupported keyword ${k}`);
    let ok = true;
    const fail = why => { ok = false; errors.push(`${path || "/"}: ${why}`); };
    if (s.$ref && !check(resolve(s.$ref), v, path)) ok = false;
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type], t = typeOf(v);
      if (!types.some(x => x === t || (x === "number" && t === "integer"))) fail(`type ${t} not ${types}`);
    }
    if (s.const !== undefined && !sameJson(s.const, v)) fail("const");
    if (s.enum && !s.enum.some(e => sameJson(e, v))) fail(`enum ${JSON.stringify(v)}`);
    if (typeof v === "string") {
      if (s.minLength !== undefined && codePoints(v) < s.minLength) fail("minLength");
      if (s.pattern !== undefined && !new RegExp(s.pattern, "u").test(v)) fail(`pattern ${s.pattern} ${JSON.stringify(v)}`);
    }
    if (typeof v === "number") {
      if (s.minimum !== undefined && v < s.minimum) fail("minimum");
      if (s.maximum !== undefined && v > s.maximum) fail("maximum");
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) fail("exclusiveMinimum");
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) fail("exclusiveMaximum");
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) fail("minItems");
      if (s.maxItems !== undefined && v.length > s.maxItems) fail("maxItems");
      if (s.uniqueItems && new Set(v.map(x => JSON.stringify(sortKeys(x)))).size !== v.length) fail("uniqueItems");
      if (s.items !== undefined) v.forEach((x, i) => { if (!check(s.items, x, `${path}/${i}`)) ok = false; });
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const r of s.required ?? []) if (!Object.hasOwn(v, r)) fail(`required ${r}`);
      const props = s.properties ?? {};
      for (const [k, x] of Object.entries(v)) {
        if (Object.hasOwn(props, k)) { if (!check(props[k], x, `${path}/${k}`)) ok = false; }
        else if (s.additionalProperties === false) fail(`additional ${k}`);
        else if (s.additionalProperties && typeof s.additionalProperties === "object" && !check(s.additionalProperties, x, `${path}/${k}`)) ok = false;
      }
    }
    if (s.allOf) for (const sub of s.allOf) if (!check(sub, v, path)) ok = false;
    const quiet = sub => { const before = errors.length; const r = check(sub, v, path); errors.length = before; return r; };
    if (s.anyOf && !s.anyOf.some(quiet)) fail("anyOf");
    if (s.oneOf && s.oneOf.filter(quiet).length !== 1) fail(`oneOf (${s.oneOf.filter(quiet).length})`);
    if (s.not && quiet(s.not)) fail("not");
    if (s.if !== undefined) {
      if (quiet(s.if)) { if (s.then !== undefined && !check(s.then, v, path)) ok = false; }
      else if (s.else !== undefined && !check(s.else, v, path)) ok = false;
    }
    return ok;
  }
  return { check: value => { errors.length = 0; const ok = check(schema, value, ""); return { ok, errors: [...errors] }; } };
}
