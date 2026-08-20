import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "main/index": "src/main/index.ts",
    "preload/index": "src/preload/index.ts",
  },
  outDir: "dist-electron",
  format: ["cjs"],
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: true,
  clean: true,
  external: ["electron"],
  noExternal: [/^@ai-voice-studio\//, "fflate"],
  outExtension: () => ({ js: ".cjs" }),
});
