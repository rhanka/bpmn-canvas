import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  base: "./",
  publicDir: join(here, "public"),
  build: {
    outDir: join(here, "out"),
    emptyOutDir: true,
    assetsInlineLimit: 0, // no data: fonts: strict CSP uses font-src 'self'
    target: "es2022",
    rollupOptions: {
      input: {
        min: join(here, "min.html"),
        lab: join(here, "lab.html"),
        csp: join(here, "csp.html"),
        shadow: join(here, "shadow.html"),
        react: join(here, "react.html"),
      },
    },
  },
});
