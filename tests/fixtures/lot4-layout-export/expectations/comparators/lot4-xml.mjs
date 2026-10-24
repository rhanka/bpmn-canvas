// Minimal standalone XML 1.0 reader for the lot-4 structural comparators.
// Elements, ordered attributes (attribute-value normalization applied), text,
// CDATA, comments, processing instructions, predefined entities and character
// references. DOCTYPE and undeclared entities are refused. Imports nothing.

const NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*/;
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'" };

function decodeReferences(raw, where) {
  let out = "", i = 0;
  for (;;) {
    const amp = raw.indexOf("&", i);
    if (amp < 0) return out + raw.slice(i);
    out += raw.slice(i, amp);
    const m = /^&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/.exec(raw.slice(amp));
    if (!m) throw new Error(`xml: bare ampersand in ${where}`);
    const ref = m[1];
    if (ref[0] === "#") {
      const cp = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!(cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff))) throw new Error(`xml: invalid character reference in ${where}`);
      out += String.fromCodePoint(cp);
    } else {
      if (!Object.hasOwn(ENTITIES, ref)) throw new Error(`xml: undeclared entity ${ref} in ${where}`);
      out += ENTITIES[ref];
    }
    i = amp + m[0].length;
  }
}
// Attribute-value normalization (XML 1.0 section 3.3.3, CDATA attributes):
// literal tab, line feed and carriage return become spaces; references do not.
const normalizeAttribute = raw => decodeReferences(raw.replace(/\r\n|[\t\n\r]/g, " "), "attribute");

export function parseXml(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let i = 0;
  const root = { type: "document", children: [] };
  const stack = [root];
  const fail = msg => { throw new Error(`xml: ${msg} at ${i}`); };
  while (i < text.length) {
    if (text.startsWith("<!--", i)) { const end = text.indexOf("-->", i + 4); if (end < 0) fail("open comment"); i = end + 3; continue; }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9); if (end < 0) fail("open CDATA");
      if (stack.length === 1) fail("CDATA outside the root element");
      stack[stack.length - 1].children.push({ type: "text", value: text.slice(i + 9, end) }); i = end + 3; continue;
    }
    if (text.startsWith("<!", i)) fail("DOCTYPE or declaration refused");
    if (text.startsWith("<?", i)) { const end = text.indexOf("?>", i + 2); if (end < 0) fail("open processing instruction"); i = end + 2; continue; }
    if (text.startsWith("</", i)) {
      const m = NAME.exec(text.slice(i + 2)); if (!m) fail("end tag name");
      const top = stack.pop();
      if (!top || top.type !== "element" || top.name !== m[0]) fail(`mismatched end tag ${m[0]}`);
      i += 2 + m[0].length;
      while (/\s/.test(text[i])) i++;
      if (text[i] !== ">") fail("end tag");
      i++; continue;
    }
    if (text[i] === "<") {
      const m = NAME.exec(text.slice(i + 1)); if (!m) fail("start tag name");
      const el = { type: "element", name: m[0], local: m[0].includes(":") ? m[0].slice(m[0].indexOf(":") + 1) : m[0], attributes: [], children: [] };
      i += 1 + m[0].length;
      for (;;) {
        const ws = /^\s*/.exec(text.slice(i))[0]; i += ws.length;
        if (text.startsWith("/>", i)) { i += 2; el.selfClosing = true; break; }
        if (text[i] === ">") { i += 1; break; }
        if (!ws.length) fail("attribute separator");
        const a = NAME.exec(text.slice(i)); if (!a) fail("attribute name");
        i += a[0].length;
        const eq = /^\s*=\s*/.exec(text.slice(i)); if (!eq) fail("attribute equals"); i += eq[0].length;
        const q = text[i]; if (q !== "\"" && q !== "'") fail("attribute quote");
        const end = text.indexOf(q, i + 1); if (end < 0) fail("open attribute");
        const raw = text.slice(i + 1, end);
        if (raw.includes("<")) fail("< in attribute");
        if (el.attributes.some(([n]) => n === a[0])) fail(`duplicate attribute ${a[0]}`);
        el.attributes.push([a[0], normalizeAttribute(raw)]);
        i = end + 1;
      }
      const parent = stack[stack.length - 1];
      if (parent === root && root.children.some(c => c.type === "element")) fail("second root element");
      parent.children.push(el);
      if (!el.selfClosing) stack.push(el);
      continue;
    }
    const next = text.indexOf("<", i), end = next < 0 ? text.length : next;
    const raw = text.slice(i, end);
    if (stack.length === 1) { if (raw.trim()) fail("text outside the root element"); }
    else stack[stack.length - 1].children.push({ type: "text", value: decodeReferences(raw, "text") });
    i = end;
  }
  if (stack.length !== 1) fail("unclosed element");
  const top = root.children.filter(c => c.type === "element");
  if (top.length !== 1) fail("one root element required");
  return top[0];
}
export const attribute = (el, name) => el.attributes.find(([n]) => n === name)?.[1];
export const elements = el => el.children.filter(c => c.type === "element");
export const textOf = el => el.children.map(c => (c.type === "text" ? c.value : textOf(c))).join("");
export function* walkElements(el, parent = null) {
  yield { el, parent };
  for (const c of elements(el)) yield* walkElements(c, el);
}
