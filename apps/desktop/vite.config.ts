import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(directory, "src/renderer"),
  publicDir: path.join(directory, "public"),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@renderer": path.join(directory, "src/renderer/src"),
    },
  },
  build: {
    outDir: path.join(directory, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
