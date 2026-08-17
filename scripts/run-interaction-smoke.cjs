const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const desktopRoot = path.join(root, "apps", "desktop");
const electronModule = require.resolve("electron", { paths: [desktopRoot] });
const electronBinary = require(electronModule);
const helper = path.join(root, "tests", "interaction-smoke-main.cjs");
const result = spawnSync(electronBinary, [helper], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status !== 0) process.exit(result.status || 1);
