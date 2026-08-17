import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_EXPORT_NAMING_TEMPLATE } from "@ai-voice-studio/shared-types";

import { ExportPreferencesStore } from "../src/main/exportPreferences";

void test("export naming rule and last folder survive restart", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-export-name-"));
  const filePath = path.join(root, "workspace", "export-preferences.json");
  const exportDirectory = path.join(root, "exports");
  try {
    const first = new ExportPreferencesStore(filePath);
    assert.deepEqual(await first.getSettings(), {
      template: DEFAULT_EXPORT_NAMING_TEMPLATE,
    });
    await first.updateNamingTemplate("{项目}_{类型}_{日期}");
    await first.rememberDirectory(exportDirectory);

    const reopened = new ExportPreferencesStore(filePath);
    assert.deepEqual(await reopened.getSettings(), {
      template: "{项目}_{类型}_{日期}",
    });
    assert.equal(await reopened.getLastDirectory(), exportDirectory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("export naming rule rejects unknown placeholders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-export-name-"));
  try {
    const store = new ExportPreferencesStore(path.join(root, "settings.json"));
    await assert.rejects(
      store.updateNamingTemplate("{项目}_{不存在}"),
      /命名规则无效/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
