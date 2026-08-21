import assert from "node:assert/strict";
import test from "node:test";

import { MAX_GENERATION_RETRY_EPOCH } from "@ai-voice-studio/shared-types";

import {
  BATCH_CACHE_VERSION,
  createBatchGenerationSeed,
  createSegmentFingerprint,
  deriveRetryGenerationSeed,
  emptyBatchCache,
  isBatchCacheManifestV2,
  isCachedSegmentRequestCompatible,
  nextGenerationRetryEpoch,
} from "../src/main/generationStability";

const seedFor = (
  overrides: Partial<{
    expression: string;
    referenceSampleId: string;
    referenceSampleSha256: string;
    retryEpoch: number;
  }> = {},
): number =>
  createBatchGenerationSeed({
    cacheKey: "project-stable-id",
    modelId: "voxcpm2",
    voiceId: "voice-a",
    language: "auto",
    expression: overrides.expression ?? "自然、清晰",
    emotion: "自然",
    voxMode: "controlled",
    referenceSampleId: overrides.referenceSampleId ?? "sample-a",
    referenceSampleSha256: overrides.referenceSampleSha256 ?? "a".repeat(64),
    retryEpoch: overrides.retryEpoch,
  });

const fingerprintFor = (text: string): string => {
  const generationSeed = seedFor();
  return createSegmentFingerprint({
    modelId: "voxcpm2",
    voiceId: "voice-a",
    text,
    expression: "自然、清晰",
    voxMode: "controlled",
    language: "auto",
    emotion: "自然",
    speed: 1,
    volume: 1,
    presetId: "natural",
    referenceSampleId: "sample-a",
    referenceSampleSha256: "a".repeat(64),
    generationSeed,
    longForm: true,
  });
};

const seedForSubmission = (
  taskId: string,
  segmentId: string,
  text: string,
): number => {
  void taskId;
  void segmentId;
  void text;
  return seedFor();
};

void test("keeps batch seeds stable when a project is submitted under a new task id", () => {
  const fromFirstTask = seedForSubmission("task-a", "line-1", "第一版正文");
  const fromSecondTask = seedForSubmission("task-b", "line-1", "第一版正文");
  assert.equal(fromSecondTask, fromFirstTask);
});

void test("changes only unfinished segment seeds on a failed-task retry", () => {
  const initialSeed = seedFor();
  assert.equal(seedFor({ retryEpoch: 0 }), initialSeed);
  const firstRetrySeed = seedFor({ retryEpoch: 1 });
  const sameFirstRetrySeed = seedFor({ retryEpoch: 1 });
  const secondRetrySeed = seedFor({ retryEpoch: 2 });
  assert.notEqual(firstRetrySeed, initialSeed);
  assert.equal(firstRetrySeed, sameFirstRetrySeed);
  assert.notEqual(secondRetrySeed, firstRetrySeed);

  const staticInput = {
    modelId: "voxcpm2",
    voiceId: "voice-a",
    text: "已经生成并通过检查的第一句",
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
  } as const;
  const cached = {
    generationSeed: initialSeed,
    fingerprint: createSegmentFingerprint({
      ...staticInput,
      generationSeed: initialSeed,
    }),
  };
  assert.equal(isCachedSegmentRequestCompatible(staticInput, cached), true);
  assert.equal(
    isCachedSegmentRequestCompatible(
      { ...staticInput, text: "这一句后来被修改了" },
      cached,
    ),
    false,
  );
});

void test("increments retry epochs while keeping legacy tasks at epoch zero", () => {
  assert.equal(nextGenerationRetryEpoch(), 1);
  assert.equal(nextGenerationRetryEpoch(7), 8);
  assert.throws(
    () => nextGenerationRetryEpoch(MAX_GENERATION_RETRY_EPOCH),
    /重试太多次/u,
  );
});

void test("shares one base seed across text segments in the same voice and style group", () => {
  const firstLine = seedForSubmission("task-a", "line-1", "第一句");
  const differentTextAndSegment = seedForSubmission(
    "task-a",
    "line-2",
    "完全不同的第二句",
  );
  assert.equal(differentTextAndSegment, firstLine);
  assert.notEqual(seedFor({ expression: "温暖、轻柔" }), firstLine);
  assert.notEqual(
    seedFor({
      referenceSampleId: "sample-b",
      referenceSampleSha256: "b".repeat(64),
    }),
    firstLine,
  );
});

void test("uses distinct deterministic retry seeds for each segment and attempt", () => {
  const base = seedFor();
  assert.equal(
    deriveRetryGenerationSeed(base, 1, "line-1"),
    deriveRetryGenerationSeed(base, 1, "line-1"),
  );
  assert.notEqual(
    deriveRetryGenerationSeed(base, 1, "line-1"),
    deriveRetryGenerationSeed(base, 2, "line-1"),
  );
  assert.notEqual(
    deriveRetryGenerationSeed(base, 1, "line-1"),
    deriveRetryGenerationSeed(base, 1, "line-2"),
  );
});

void test("invalidates only the edited segment fingerprint", () => {
  const firstBefore = fingerprintFor("第一句没有修改");
  const secondBefore = fingerprintFor("第二句原稿");
  const firstAfter = fingerprintFor("第一句没有修改");
  const secondAfter = fingerprintFor("第二句已经修改");
  assert.equal(firstAfter, firstBefore);
  assert.notEqual(secondAfter, secondBefore);
});

void test("changes a segment fingerprint when the active reference sample changes", () => {
  const generationSeed = seedFor();
  const base = {
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
    generationSeed,
    longForm: true,
  } as const;
  const first = createSegmentFingerprint({
    ...base,
    referenceSampleId: "sample-a",
    referenceSampleSha256: "a".repeat(64),
  });
  const second = createSegmentFingerprint({
    ...base,
    referenceSampleId: "sample-b",
    referenceSampleSha256: "b".repeat(64),
  });
  assert.notEqual(second, first);
});

void test("rejects v1 or quality-less cache entries", () => {
  const projectId = "project-stable-id";
  assert.equal(
    isBatchCacheManifestV2(
      {
        projectId,
        segments: {
          line: { fingerprint: "old", durationSeconds: 1, fileId: "part" },
        },
      },
      projectId,
    ),
    false,
  );
  const current = emptyBatchCache(projectId);
  assert.equal(current.version, BATCH_CACHE_VERSION);
  assert.equal(isBatchCacheManifestV2(current, projectId), true);
});

void test("keeps a cached warning assessment instead of upgrading it to passed", () => {
  const projectId = "project-stable-id";
  const current = emptyBatchCache(projectId);
  current.segments.line = {
    fingerprint: "fingerprint-v2",
    durationSeconds: 2.5,
    fileId: "part-1",
    fileSha256: "b".repeat(64),
    generationSeed: 3407,
    assessment: {
      issues: ["语速明显变快"],
      critical: false,
      score: 75,
      secondsPerUnit: 0.09,
      medianPitchHz: 205,
      stabilityDeviation: 0.3,
    },
    retried: true,
  };
  assert.equal(isBatchCacheManifestV2(current, projectId), true);
  assert.deepEqual(current.segments.line.assessment.issues, ["语速明显变快"]);
  assert.equal(current.segments.line.retried, true);
});
