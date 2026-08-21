import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBatchGenerationSeed,
  createSegmentFingerprint,
  isCachedSegmentRequestCompatible,
} from "../src/main/generationStability";

const staticSegmentInput = (regenerationId?: string) => ({
  modelId: "voxcpm2",
  voiceId: "voice-a",
  text: "同一句台词",
  expression: "自然、清晰",
  voxMode: "controlled",
  language: "auto",
  emotion: "自然",
  speed: 1,
  volume: 1,
  presetId: "natural",
  referenceSampleId: "sample-a",
  referenceSampleSha256: "a".repeat(64),
  longForm: true,
  regenerationId,
});

const seedFor = (regenerationId?: string, retryEpoch?: number): number =>
  createBatchGenerationSeed({
    cacheKey: "project-stable-id",
    modelId: "voxcpm2",
    voiceId: "voice-a",
    language: "auto",
    expression: "自然、清晰",
    emotion: "自然",
    voxMode: "controlled",
    referenceSampleId: "sample-a",
    referenceSampleSha256: "a".repeat(64),
    regenerationId,
    retryEpoch,
  });

void test("主动重新生成会换一套种子，并拒绝复用上一版分段", () => {
  const previousSeed = seedFor();
  const previous = {
    generationSeed: previousSeed,
    fingerprint: createSegmentFingerprint({
      ...staticSegmentInput(),
      generationSeed: previousSeed,
    }),
  };
  const regenerationId = "regeneration-new-take";

  assert.notEqual(seedFor(regenerationId), previousSeed);
  assert.equal(
    isCachedSegmentRequestCompatible(
      staticSegmentInput(regenerationId),
      previous,
    ),
    false,
  );
});

void test("同一次重新生成失败后，重试仍复用已经完成的新分段", () => {
  const regenerationId = "regeneration-same-take";
  const initialSeed = seedFor(regenerationId);
  const cached = {
    generationSeed: initialSeed,
    fingerprint: createSegmentFingerprint({
      ...staticSegmentInput(regenerationId),
      generationSeed: initialSeed,
    }),
  };

  assert.notEqual(seedFor(regenerationId, 1), initialSeed);
  assert.equal(
    isCachedSegmentRequestCompatible(
      staticSegmentInput(regenerationId),
      cached,
    ),
    true,
  );
});

void test("三个创作页只有点击成功结果的重新生成时才创建新版本标识", () => {
  for (const page of ["GeneratePage", "SubtitlesPage", "DialoguePage"]) {
    const source = readFileSync(
      new URL(`../src/renderer/src/pages/${page}.tsx`, import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /const generate = async \(regenerationId\?: string\)/u,
    );
    assert.match(source, /regenerationId,/u);
    assert.match(source, /generate\(crypto\.randomUUID\(\)\)/u);
  }
});
