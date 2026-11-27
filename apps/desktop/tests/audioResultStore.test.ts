import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AudioResultStore } from "../src/main/audioResultStore";

void test("retired model audio can still be played, listed, favorited and removed", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "shengzuo-retired-record-"),
  );
  try {
    const store = new AudioResultStore(root);
    const audio = path.join(root, "result-legacy.mp3");
    await writeFile(audio, Buffer.from("test audio"));
    await writeFile(
      path.join(root, "result-legacy.json"),
      JSON.stringify({
        id: "result-legacy",
        title: "以前的配音",
        modelId: "zonos3-mini",
        createdAt: "2026-11-27T00:00:00.000Z",
      }),
    );
    assert.equal(store.getResultPath("result-legacy"), audio);
    const [result] = await store.listResults();
    assert.equal(result?.modelId, "zonos3-mini");
    assert.equal(result?.url, "shengzuo-audio://result/result-legacy");
    assert.equal(
      (await store.setResultFavorite("result-legacy", true))?.favorite,
      true,
    );
    assert.equal((await store.listResults())[0]?.favorite, true);
    assert.equal(await store.removeResult("result-legacy"), true);
    assert.deepEqual(await store.listResults(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
