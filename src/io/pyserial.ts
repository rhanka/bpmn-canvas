// Python serialisation rules the reference exports reproduce byte for byte: number formatting (round, repr, the
// export's own formatter) and the two XML writers used by the original exporters, ElementTree (`tostring`) and
// minidom (`toprettyxml(indent="    ")`, Python 3.8–3.12 escaping). String builders only; no DOM.

/** Python `round(x, 3)`: round half to even on the exact binary value of `x`. */
export function pyRound3(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
  // A tie at the 4th decimal is a dyadic rational with a short expansion: 25 digits are exact for every tie.
  const s = x.toFixed(25);
  const neg = s.startsWith("-");
  const [int, frac = ""] = (neg ? s.slice(1) : s).split(".");
  const rest = frac.slice(3);
  let digits = BigInt(int + frac.slice(0, 3));
  const tie = rest[0] === "5" && /^0*$/.test(rest.slice(1));
  if (rest[0]! > "5" || (rest[0] === "5" && !tie)) digits += 1n;
  else if (tie && digits % 2n === 1n) digits += 1n;
  const v = Number(digits) / 1000;
  return neg && v !== 0 ? -v : neg ? -0 : v;
}

/** Python `repr(float)` in the range the exports use (no exponent form). */
export function pyFloatStr(x: number): string {
  if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
  if (Math.abs(x) >= 1e16 || (x !== 0 && Math.abs(x) < 1e-4)) throw new RangeError(`outside the emulated repr range: ${x}`);
  if (Object.is(x, -0)) return "-0.0";
  return Number.isInteger(x) ? `${x}.0` : String(x);
}

/** The export's number formatter: `round(v, 3)`, written as an integer when integral. */
export function pyFmt(v: number): string {
  const r = pyRound3(v);
  return Number.isInteger(r) ? String(Object.is(r, -0) ? 0 : r) : String(r);
}

/** `str()` of a stored DI value: the original layout stores integers, an edited document may carry floats. */
export function pyNum(v: number): string {
  if (!Number.isFinite(v)) throw new RangeError(`not a finite number: ${v}`);
  return Number.isInteger(v) && !Object.is(v, -0) ? String(v) : pyFloatStr(v);
}

/** ElementTree attribute escaping. */
export function etAttr(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;").replace(/\n/g, "&#10;").replace(/\t/g, "&#09;");
}

/** ElementTree text escaping. */
export function etText(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** minidom `_write_data` (Python 3.8–3.12): one escaping for attribute values and text. */
export function mdData(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/>/g, "&gt;");
}

/** One XML element for the two writers: attributes in insertion order, then either text or children. */
export interface XmlNode {
  readonly tag: string;
  readonly attrs: ReadonlyArray<readonly [string, string]>;
  readonly children?: readonly XmlNode[];
  readonly text?: string;
}

export const xmlNode = (tag: string, attrs: Record<string, string> = {}, children: XmlNode[] = [], text?: string): XmlNode =>
  ({ tag, attrs: Object.entries(attrs), children, ...(text !== undefined ? { text } : {}) });

/** `ElementTree.tostring(root, encoding="unicode")` body. */
export function etSerialize(node: XmlNode): string {
  let out = `<${node.tag}`;
  for (const [k, v] of node.attrs) out += ` ${k}="${etAttr(v)}"`;
  const children = node.children ?? [];
  if (!node.text && children.length === 0) return `${out} />`;
  out += ">";
  if (node.text) out += etText(node.text);
  for (const c of children) out += etSerialize(c);
  return `${out}</${node.tag}>`;
}

/** `ElementTree.tostring(root, encoding="unicode", xml_declaration=True)`. */
export function etDocument(root: XmlNode, declaredEncoding = "utf-8"): string {
  return `<?xml version='1.0' encoding='${declaredEncoding}'?>\n${etSerialize(root)}`;
}

/**
 * `minidom.parseString(ElementTree.tostring(root)).toprettyxml(indent="    ")`. The round trip through an XML parser
 * normalises line ends in text content (CR LF and CR become LF); attribute values keep them (ElementTree wrote them as
 * character references).
 */
export function mdPretty(root: XmlNode): string {
  const lines: string[] = ['<?xml version="1.0" ?>'];
  const write = (node: XmlNode, depth: number): void => {
    const pad = "    ".repeat(depth);
    let open = `${pad}<${node.tag}`;
    for (const [k, v] of node.attrs) open += ` ${k}="${mdData(v)}"`;
    const children = node.children ?? [];
    const text = node.text ? node.text.replace(/\r\n?/g, "\n") : "";
    if (!text && children.length === 0) {
      lines.push(`${open}/>`);
      return;
    }
    if (text && children.length === 0) {
      lines.push(`${open}>${mdData(text)}</${node.tag}>`);
      return;
    }
    lines.push(`${open}>`);
    for (const c of children) write(c, depth + 1);
    lines.push(`${pad}</${node.tag}>`);
  };
  write(root, 0);
  return lines.join("\n") + "\n";
}
