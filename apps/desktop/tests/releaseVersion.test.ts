import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_VERSION } from "@ai-voice-studio/shared-types";

void test("application, workspace and displayed version agree", () => {
  for (const relative of ["../package.json", "../../../package.json"]) {
    const metadata: unknown = JSON.parse(
      readFileSync(new URL(relative, import.meta.url), "utf8"),
    );
    assert.ok(
      typeof metadata === "object" &&
        metadata !== null &&
        "version" in metadata,
    );
    assert.equal(metadata.version, APP_VERSION);
  }
});

void test("Windows packager uses the installed desktop runtime version", () => {
  const desktop: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.ok(
    typeof desktop === "object" &&
      desktop !== null &&
      "devDependencies" in desktop,
  );
  const dependencies = desktop.devDependencies;
  assert.ok(
    typeof dependencies === "object" &&
      dependencies !== null &&
      "electron" in dependencies,
  );
  const config = readFileSync(
    new URL("../electron-builder.yml", import.meta.url),
    "utf8",
  );
  assert.equal(
    /^electronVersion:\s*(\S+)$/mu.exec(config)?.[1],
    dependencies.electron,
  );
  assert.match(config, /output:\s*["']?apps\/desktop\/release\/\$\{version\}/u);
});
