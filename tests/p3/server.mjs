// Ephemeral static server bound to 127.0.0.1 on a free port. csp.html gets a strict
// Content-Security-Policy with a per-request nonce.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".bpmn": "application/xml; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

export function startServer(root) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, rel === "/" ? "index.html" : rel);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = await readFile(file);
      const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" };
      if (file.endsWith("csp.html")) {
        const nonce = randomBytes(16).toString("base64");
        body = Buffer.from(body.toString("utf8").replaceAll("__NONCE__", nonce));
        headers["Content-Security-Policy"] = `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'`;
      }
      requests.push({ path: url.pathname, status: 200 });
      res.writeHead(200, headers).end(body);
    } catch {
      requests.push({ path: url.pathname, status: 404 });
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ port, origin: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
