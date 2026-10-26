const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electron = require(
  require.resolve("electron", { paths: [path.join(root, "apps", "desktop")] }),
);
const child = spawn(
  electron,
  [
    path.join(root, "tests", "real-generation-main.cjs"),
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
  },
);
child.once("error", () => process.exit(1));
child.once("exit", (code) => process.exit(code ?? 1));
