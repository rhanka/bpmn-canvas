/**
 * Idempotent style installer per RootNode (Document or ShadowRoot). The BPMN font
 * `@font-face` is always declared at document level because Chrome ignores it inside a
 * shadow root; the remaining rules go to the node that actually holds the canvas.
 */
import { inlineAssetUrls } from "./assets.generated.js";
import { ASSET_PLACEHOLDER, BASE_CSS } from "./css.generated.js";

const installed = new WeakSet<Node>();
let resolvedCss: string | undefined;

/** The base rules with each shipped image file resolved next to this module (no data: URI). */
function baseCss(): string {
  if (resolvedCss === undefined) {
    const urls = inlineAssetUrls();
    resolvedCss = BASE_CSS.split(ASSET_PLACEHOLDER).map((part, i) => {
      if (i === 0) return part;
      const name = /^inline-\d{2}\.svg/.exec(part)?.[0];
      const url = name ? urls[name] : undefined;
      if (!name || !url) throw new Error("unknown inline asset in the generated CSS");
      return url + part.slice(name.length);
    }).join("");
  }
  return resolvedCss;
}
const FONT_MARK = "data-bpmn-canvas-font";
const STYLE_MARK = "data-bpmn-canvas-styles";

/**
 * One literal URL per font file so bundlers (Vite, webpack, Rollup) can detect and emit
 * them. A directory URL would not be rewritten.
 */
function fontFaceCss(): string {
  const woff2 = new URL("../assets/bpmn-font/font/bpmn.woff2", import.meta.url).href;
  const woff = new URL("../assets/bpmn-font/font/bpmn.woff", import.meta.url).href;
  const ttf = new URL("../assets/bpmn-font/font/bpmn.ttf", import.meta.url).href;
  return `@font-face{font-family:'bpmn';src:url('${woff2}') format('woff2'),url('${woff}') format('woff'),url('${ttf}') format('truetype');font-weight:normal;font-style:normal;}`;
}

function addStyle(parent: Node & { appendChild<T extends Node>(n: T): T }, mark: string, css: string, nonce: string | undefined): void {
  const doc = parent.ownerDocument ?? (parent as Document);
  const style = doc.createElement("style");
  style.setAttribute(mark, "");
  if (nonce) style.setAttribute("nonce", nonce);
  style.textContent = css;
  parent.appendChild(style);
}

export function installStyles(host: HTMLElement, nonce?: string): void {
  const root = host.getRootNode();
  const doc = host.ownerDocument;
  if (!installed.has(doc)) {
    installed.add(doc);
    if (!doc.head.querySelector(`style[${FONT_MARK}]`)) {
      addStyle(doc.head, FONT_MARK, fontFaceCss(), nonce);
    }
  }
  const target: Node = root instanceof ShadowRoot ? root : doc.head;
  if (installed.has(target)) return;
  installed.add(target);
  if (target instanceof ShadowRoot || !doc.head.querySelector(`style[${STYLE_MARK}]`)) {
    addStyle(target as Node & { appendChild<T extends Node>(n: T): T }, STYLE_MARK, baseCss(), nonce);
  }
}
