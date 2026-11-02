import * as ioBase from "../../dist/io/index.js";
// Browser twin: the io calls receive the fixture descriptor and policy of the Node twins (window.__fixture).
const OPTION_INDEX = { createModdle: 0, parseDefinitions: 1, listDiagrams: 1, importDiagram: 1, decodeDrawio: 1, encodeDrawio: 1, bpmnGraph: 1, export: 2 };
const injected = (mod) => new Proxy(mod, {
  get: (target, name) => {
    const fn = target[name];
    if (typeof fn !== "function" || !(name in OPTION_INDEX)) return fn;
    const index = OPTION_INDEX[name];
    return (...args) => {
      const next = args.slice();
      next[index] = { ...window.__fixture, ...next[index] };
      return fn(...next);
    };
  },
});
window.injected = injected;
const io = injected(ioBase);

const wrap = async (fn) => {
  try {
    return { ok: await fn() };
  } catch (e) {
    return { err: { name: e?.name, code: e?.code, message: String(e?.message ?? e), ids: e?.ids ?? [] } };
  }
};

async function deflateBase64(text) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

window.io = {
  call: (name, ...args) => wrap(async () => {
    if (name === "projectFile") return { xml: io.encodeDrawio(io.bpmnGraph(args[0], args[2]), args[2]), filename: "diagram.drawio", mimeType: "application/vnd.jgraph.mxfile", fidelity: [{code: "projection"}] };
    if (name === "modelFile") { const fmt = args[1]; const xml = new TextDecoder().decode(await io.export((await io.parseDefinitions(args[0])).rootElement, fmt)); return {xml, filename: fmt === "bpmn" ? "diagram.bpmn" : "diagram.sparx.xml", mimeType: fmt === "bpmn" ? "application/bpmn+xml" : "application/xml", fidelity: []}; }
    return io[name](...args);
  }),
  deflateBase64,
  async compressPages(mxfile) {
    const doc = new DOMParser().parseFromString(mxfile, "application/xml");
    for (const page of doc.querySelectorAll("diagram")) {
      const model = new XMLSerializer().serializeToString(page.firstElementChild);
      page.textContent = await deflateBase64(encodeURIComponent(model));
    }
    return new XMLSerializer().serializeToString(doc);
  },
  async bomb(size) {
    return `<mxfile><diagram>${await deflateBase64("x".repeat(size))}</diagram></mxfile>`;
  },
  hasDecompression: typeof DecompressionStream !== "undefined",
};
window.__ready = true;
