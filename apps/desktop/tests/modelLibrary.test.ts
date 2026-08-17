import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MODEL_LIBRARY_FOLDER,
  moveModelLibrary,
  resolveModelLibrarySelection,
} from "../src/main/modelLibrary";

void test("model library moves as one unit and persists its new location", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-model-move-"));
  const source = path.join(root, "old-library");
  const destination = path.join(root, "new-parent", MODEL_LIBRARY_FOLDER);
  const configurationPath = path.join(root, "settings", "model-library.json");
  try {
    await mkdir(path.join(source, "voxcpm2", "weights"), { recursive: true });
    await writeFile(
      path.join(source, "voxcpm2", "weights", "partial.bin"),
      "resume-data",
      "utf8",
    );

    const result = await moveModelLibrary(
      source,
      destination,
      configurationPath,
    );

    assert.equal(result.moved, true);
    assert.equal(existsSync(source), false);
    assert.equal(
      await readFile(
        path.join(destination, "voxcpm2", "weights", "partial.bin"),
        "utf8",
      ),
      "resume-data",
    );
    const configuration: unknown = JSON.parse(
      await readFile(configurationPath, "utf8"),
    );
    assert.deepEqual(configuration, {
      path: destination,
      updatedAt: (configuration as { updatedAt: string }).updatedAt,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("model library refuses to overwrite another populated library", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "shengzuo-model-conflict-"),
  );
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  try {
    await Promise.all([
      mkdir(path.join(source, "voxcpm2"), { recursive: true }),
      mkdir(path.join(destination, "fun-cosyvoice3"), { recursive: true }),
    ]);
    await assert.rejects(
      moveModelLibrary(
        source,
        destination,
        path.join(root, "model-library.json"),
      ),
      /已有另一套模型/u,
    );
    assert.equal(existsSync(source), true);
    assert.equal(existsSync(destination), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("selected parent receives one tidy model-library folder", () => {
  const parent = path.join("D:\\", "AudioTools");
  assert.equal(
    resolveModelLibrarySelection(parent),
    path.join(parent, MODEL_LIBRARY_FOLDER),
  );
  assert.equal(
    resolveModelLibrarySelection(path.join(parent, MODEL_LIBRARY_FOLDER)),
    path.join(parent, MODEL_LIBRARY_FOLDER),
  );
});
