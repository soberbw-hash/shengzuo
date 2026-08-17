import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createCpuProfile } from "@ai-voice-studio/hardware-detector";

import { checkAndRepairSystem } from "../src/main/systemCheck";

const workerFiles = [
  "common/runtime/install-runtime.ps1",
  "common/worker/server_core.py",
  "common/worker/install_assets.py",
  "common/worker/merge_audio.py",
  "voxcpm2/worker/server.py",
  "voxcpm2/model-manifest.json",
  "fun-cosyvoice3/worker/server.py",
  "fun-cosyvoice3/model-manifest.json",
  "indextts2-5/worker/server.py",
  "indextts2-5/model-manifest.json",
] as const;

const prepareWorkerFiles = async (root: string) => {
  for (const relativePath of workerFiles) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "test", "utf8");
  }
};

void test("system check repairs writable data folders and accepts optional models", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-check-"));
  try {
    const plugins = path.join(root, "engines");
    await prepareWorkerFiles(plugins);
    const result = await checkAndRepairSystem({
      modelLibraryRoot: path.join(root, "models"),
      userDataRoot: path.join(root, "data"),
      enginePluginsRoot: plugins,
      hardware: createCpuProfile(32),
      snapshots: [],
      guideWasMissing: true,
    });
    assert.equal(result.overall, "healthy");
    assert.equal(result.readyModelCount, 0);
    assert.equal(result.attentionCount, 0);
    assert.equal(
      result.items.find((item) => item.id === "storage")?.status,
      "repaired",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("system check identifies an incomplete model without deleting its files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-check-"));
  try {
    const plugins = path.join(root, "engines");
    await prepareWorkerFiles(plugins);
    const modelLibraryRoot = path.join(root, "models");
    const partialRuntime = path.join(modelLibraryRoot, "voxcpm2", "runtime");
    await mkdir(partialRuntime, { recursive: true });
    await writeFile(path.join(partialRuntime, "python.exe"), "test", "utf8");
    const result = await checkAndRepairSystem({
      modelLibraryRoot,
      userDataRoot: path.join(root, "data"),
      enginePluginsRoot: plugins,
      hardware: createCpuProfile(32),
      snapshots: [],
      guideWasMissing: false,
    });
    assert.equal(result.overall, "attention");
    assert.equal(
      result.items.find((item) => item.id === "model-voxcpm2")?.status,
      "attention",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
