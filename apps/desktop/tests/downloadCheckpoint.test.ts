import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readDownloadCheckpoint,
  removeDownloadCheckpoint,
  writeDownloadCheckpoint,
} from "../src/main/downloadCheckpoint";

void test("download checkpoint survives restart and can be removed after installation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-download-"));
  const checkpointPath = path.join(root, "download-state.json");
  try {
    writeDownloadCheckpoint(checkpointPath, {
      modelId: "voxcpm2",
      state: "paused",
      progress: 37,
      downloadedBytes: 3_700,
      requiredBytes: 10_000,
      updatedAt: "2026-08-17T00:00:00.000Z",
    });

    assert.deepEqual(readDownloadCheckpoint(checkpointPath, "voxcpm2"), {
      modelId: "voxcpm2",
      state: "paused",
      progress: 37,
      downloadedBytes: 3_700,
      requiredBytes: 10_000,
      updatedAt: "2026-08-17T00:00:00.000Z",
    });

    writeDownloadCheckpoint(checkpointPath, {
      modelId: "voxcpm2",
      state: "active",
      progress: 38,
      downloadedBytes: 3_800,
      requiredBytes: 10_000,
      updatedAt: "2026-08-17T00:00:01.000Z",
    });
    assert.equal(
      readDownloadCheckpoint(checkpointPath, "voxcpm2")?.downloadedBytes,
      3_800,
    );
    assert.equal(
      readDownloadCheckpoint(checkpointPath, "fun-cosyvoice3-0.5b"),
      undefined,
    );

    removeDownloadCheckpoint(checkpointPath);
    assert.equal(readDownloadCheckpoint(checkpointPath, "voxcpm2"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
