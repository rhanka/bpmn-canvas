// Draw.io pages: raw or compressed (base64 -> raw deflate -> URI-decoded XML). Adapted from an
// internal implementation.
import { IoError, resolveIoOptions } from "./errors.js";
import type { IoOptions } from "./errors.js";
import { parseDiagramXml } from "./xml.js";

const mib = (bytes: number): number => Math.round(bytes / 1048576);

async function inflatePage(text: string, maxBytes: number): Promise<string> {
  if (typeof DecompressionStream === "undefined") throw new IoError("compressed-unsupported", "This browser cannot decode compressed Draw.io pages");
  try {
    return await inflate(text, maxBytes);
  } catch (error) {
    if (error instanceof IoError) throw error;
    throw new IoError("unsupported-page", "Unreadable compressed Draw.io page");
  }
}

async function inflate(text: string, maxBytes: number): Promise<string> {
  const bytes = Uint8Array.from(atob(text.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = input.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new IoError("too-large", `Decompressed Draw.io page exceeds ${mib(maxBytes)} MiB`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return decodeURIComponent(new TextDecoder("utf-8", { fatal: true }).decode(joined));
}

export interface DrawioPage {
  readonly id: string;
  readonly name: string;
  readonly model: Element;
}

export async function drawioPages(xml: string, options?: IoOptions): Promise<DrawioPage[]> {
  const { maxBytes } = resolveIoOptions(options);
  const doc = parseDiagramXml(xml, options);
  if (doc.documentElement.localName !== "mxfile") throw new IoError("not-drawio", "Expected a Draw.io mxfile");
  const diagrams = Array.from(doc.documentElement.children);
  if (!diagrams.length || diagrams.some((e) => e.localName !== "diagram")) throw new IoError("no-pages", "Draw.io has no supported pages");
  const pages: DrawioPage[] = [];
  let length = 0;
  for (const [i, diagram] of diagrams.entries()) {
    const direct = diagram.firstElementChild;
    if (diagram.children.length > 1) throw new IoError("unsupported-page", "Unsupported Draw.io page structure");
    const pageXml = direct ? new XMLSerializer().serializeToString(direct) : await inflatePage(diagram.textContent || "", maxBytes);
    length += new TextEncoder().encode(pageXml).length;
    if (length > maxBytes) throw new IoError("too-large", `Decompressed Draw.io pages exceed ${mib(maxBytes)} MiB`);
    const model = parseDiagramXml(pageXml, options).documentElement;
    if (model.localName !== "mxGraphModel") throw new IoError("unsupported-model", "Unsupported Draw.io page model");
    pages.push({ id: `page_${i}`, name: diagram.getAttribute("name") || `Process ${i + 1}`, model });
  }
  return pages;
}
