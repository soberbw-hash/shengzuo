import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const bundlePaths = [
  path.join(
    projectRoot,
    "apps",
    "desktop",
    "dist-electron",
    "main",
    "index.cjs",
  ),
  path.join(
    projectRoot,
    "apps",
    "desktop",
    "dist-electron",
    "preload",
    "index.cjs",
  ),
];

for (const bundlePath of bundlePaths) {
  const source = await readFile(bundlePath, "utf8");
  if (/require\(["']@ai-voice-studio\//u.test(source)) {
    throw new Error(
      `${path.relative(projectRoot, bundlePath)} 仍引用工作区 TypeScript 源码，Electron 将无法直接启动。`,
    );
  }
}

console.log(
  "Desktop bundles contain no external workspace TypeScript imports.",
);
