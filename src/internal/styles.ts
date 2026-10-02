/**
 * Idempotent style installer per RootNode (Document or ShadowRoot). The BPMN font
 * `@font-face` is always declared at document level because Chrome ignores it inside a
 * shadow root; the remaining rules go to the node that actually holds the canvas.
 */
import { inlineAssetUrls } from "./assets.generated.js";
import { ASSET_PLACEHOLDER, BASE_CSS } from "./css.generated.js";

const installed = new WeakSet<Node>();
const resolvedCss = new Map<string, string>();

/** The base rules with each shipped image file resolved (no data: URI), next to this module or under `base`. */
function baseCss(base: URL | undefined): string {
  const key = base?.href ?? "";
  let css = resolvedCss.get(key);
  if (css === undefined) {
    css = BASE_CSS.split(ASSET_PLACEHOLDER).map((part, i) => {
      if (i === 0) return part;
      const name = /^inline-\d{2}\.svg/.exec(part)?.[0];
      if (!name) throw new Error("unknown inline asset in the generated CSS");
      return imageUrl(name, base) + part.slice(name.length);
    }).join("");
    resolvedCss.set(key, css);
  }
  return css;
}
const FONT_MARK = "data-bpmn-canvas-font";
const STYLE_MARK = "data-bpmn-canvas-styles";

/**
 * One literal URL per font file so bundlers (Vite, webpack, Rollup) can detect and emit
 * them. A directory URL would not be rewritten.
 */
function fontFaceCss(base: URL | undefined): string {
  const font = (file: string): string => (base ? new URL(`bpmn-font/font/${file}`, base).href : "");
  const woff2 = base ? font("bpmn.woff2") : new URL("../assets/bpmn-font/font/bpmn.woff2", import.meta.url).href;
  const woff = base ? font("bpmn.woff") : new URL("../assets/bpmn-font/font/bpmn.woff", import.meta.url).href;
  const ttf = base ? font("bpmn.ttf") : new URL("../assets/bpmn-font/font/bpmn.ttf", import.meta.url).href;
  return `@font-face{font-family:'bpmn';src:url('${woff2}') format('woff2'),url('${woff}') format('woff'),url('${ttf}') format('truetype');font-weight:normal;font-style:normal;}`;
}

/**
 * The asset directory a host named (`assetBase`), as an absolute URL ending with a slash.
 * Throws when it is not an absolute http(s) or file URL: an inlined bundle has no base to resolve against.
 */
export function assetBaseUrl(assetBase: string): URL {
  const url = new URL(assetBase);
  if (!/^(https?|file):$/.test(url.protocol)) throw new Error(`assetBase must be an absolute http(s) URL, got ${assetBase}`);
  if (url.search || url.hash) throw new Error(`assetBase must name a directory, without query or fragment, got ${assetBase}`);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

/** URL of the BPMN icon font (woff2), from `assetBase` or next to this module. */
export function fontUrl(base: URL | undefined): string {
  return base ? new URL("bpmn-font/font/bpmn.woff2", base).href : new URL("../assets/bpmn-font/font/bpmn.woff2", import.meta.url).href;
}

/** URL of one shipped image, from `assetBase` or next to this module. */
export function imageUrl(name: string, base: URL | undefined): string {
  if (base) return new URL(`inline/${name}`, base).href;
  const url = inlineAssetUrls()[name];
  if (!url) throw new Error(`unknown inline asset ${name}`);
  return url;
}

function addStyle(parent: Node & { appendChild<T extends Node>(n: T): T }, mark: string, css: string, nonce: string | undefined): void {
  const doc = parent.ownerDocument ?? (parent as Document);
  const style = doc.createElement("style");
  style.setAttribute(mark, "");
  if (nonce) style.setAttribute("nonce", nonce);
  style.textContent = css;
  parent.appendChild(style);
}

export function installStyles(host: HTMLElement, nonce?: string, base?: URL): void {
  const root = host.getRootNode();
  const doc = host.ownerDocument;
  if (!installed.has(doc)) {
    installed.add(doc);
    if (!doc.head.querySelector(`style[${FONT_MARK}]`)) {
      addStyle(doc.head, FONT_MARK, fontFaceCss(base), nonce);
    }
  }
  const target: Node = root instanceof ShadowRoot ? root : doc.head;
  if (installed.has(target)) return;
  installed.add(target);
  if (target instanceof ShadowRoot || !doc.head.querySelector(`style[${STYLE_MARK}]`)) {
    addStyle(target as Node & { appendChild<T extends Node>(n: T): T }, STYLE_MARK, baseCss(base), nonce);
  }
}
