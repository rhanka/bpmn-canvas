import { JSDOM } from "jsdom";

export const xmlText = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
export const xmlDocument = (bytes) => new JSDOM(xmlText(bytes), { contentType: "application/xml" }).window.document;
// Local comparator: expanded names, ordered children and exact text. Never hide leaf whitespace.
export function xmlStructure(doc) {
  function visit(node) {
    if (node.nodeType === 3 || node.nodeType === 4) {
      if (!node.textContent.trim() && node.parentNode.children.length > 0) return null;
      return { text: node.textContent };
    }
    const attributes = [...node.attributes].filter((a) => a.namespaceURI !== "http://www.w3.org/2000/xmlns/").map((a) => {
      if (a.namespaceURI === "http://www.w3.org/2001/XMLSchema-instance" && a.localName === "type") {
        const parts = a.value.split(":");
        // An unprefixed discriminator resolves against the default namespace,
        // never against a prefix spelled like the value itself.
        const value = parts.length > 1
          ? [node.lookupNamespaceURI(parts[0]), parts.at(-1)]
          : [node.lookupNamespaceURI(null), a.value];
        return [[a.namespaceURI, a.localName], value];
      }
      return [[a.namespaceURI, a.localName], a.value];
    }).sort((a, b) => JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : JSON.stringify(a[0]) > JSON.stringify(b[0]) ? 1 : 0);
    return { name: [node.namespaceURI, node.localName], attrs: attributes, children: [...node.childNodes].map(visit).filter((v) => v !== null) };
  }
  return visit(doc.documentElement);
}
