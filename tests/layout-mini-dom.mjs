// Test-only: a tiny XML tree exposing the Element subset that processModel.ts reads
// (localName, children, parentElement, getAttribute, getElementsByTagName("*"), textContent),
// so the parser can be unit-tested under Node without a DOM implementation.

class MiniElement {
  constructor(name, attrs, parent) {
    this.nodeName = name;
    this.localName = name.includes(":") ? name.split(":")[1] : name;
    this.attrs = attrs;
    this.parentElement = parent;
    this.children = [];
    this.text = "";
  }
  getAttribute(n) {
    return Object.hasOwn(this.attrs, n) ? this.attrs[n] : null;
  }
  getElementsByTagName(tag) {
    const out = [];
    const walk = (e) => {
      for (const c of e.children) {
        if (tag === "*" || c.nodeName === tag || c.localName === tag) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
}

const unescapeXml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

export function parseXml(xml) {
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let root = null;
  let cur = null;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      if (cur) cur.text += unescapeXml(m[5]);
      continue;
    }
    if (!m[2]) continue;
    if (m[1]) {
      cur = cur?.parentElement ?? null;
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = unescapeXml(a[2]);
    const el = new MiniElement(m[2], attrs, cur);
    if (cur) cur.children.push(el);
    else root = el;
    if (!m[4]) cur = el;
  }
  return { documentElement: root };
}

export function installMiniDomParser() {
  globalThis.DOMParser = class {
    parseFromString(xml) {
      return parseXml(xml);
    }
  };
}
