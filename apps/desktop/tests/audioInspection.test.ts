import assert from "node:assert/strict";
import test from "node:test";

import { retryAudioInspection } from "../src/main/audioInspection";

void test("retries one transient audio inspection failure", async () => {
  let attempts = 0;
  const result = await retryAudioInspection(() => {
    attempts += 1;
    if (attempts === 1) {
      return Promise.reject(new Error("AUDIO_INSPECTION_3221225477"));
    }
    return Promise.resolve("checked");
  });

  assert.equal(result, "checked");
  assert.equal(attempts, 2);
});

void test("surfaces a persistent audio inspection failure after one retry", async () => {
  let attempts = 0;
  await assert.rejects(
    retryAudioInspection(() => {
      attempts += 1;
      return Promise.reject(new Error("INVALID_AUDIO_INSPECTION"));
    }),
    /INVALID_AUDIO_INSPECTION/u,
  );
  assert.equal(attempts, 2);
});
