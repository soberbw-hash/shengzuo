import { createHash } from "node:crypto";

import { MAX_GENERATION_RETRY_EPOCH } from "@ai-voice-studio/shared-types";

import type { GeneratedAudioAssessment } from "./generatedAudioQuality";

export const GENERATION_STABILITY_VERSION = "vox-longform-v2";
export const BATCH_CACHE_VERSION = 2;

export interface SegmentFingerprintInput {
  modelId: string;
  voiceId: string;
  text: string;
  expression: string;
  voxMode?: string;
  voiceDescription?: string;
  language: string;
  emotion: string;
  speed: number;
  volume: number;
  presetId: string;
  referenceSampleId?: string;
  referenceSampleSha256?: string;
  generationSeed: number;
  longForm: boolean;
  regenerationId?: string;
}

export interface BatchGenerationSeedInput {
  cacheKey: string;
  modelId: string;
  voiceId: string;
  language: string;
  expression: string;
  emotion: string;
  voxMode?: string;
  voiceDescription?: string;
  referenceSampleId?: string;
  referenceSampleSha256?: string;
  retryEpoch?: number;
  regenerationId?: string;
}

export interface BatchCacheSegmentV2 {
  fingerprint: string;
  durationSeconds: number;
  fileId: string;
  fileSha256: string;
  generationSeed: number;
  assessment: GeneratedAudioAssessment;
  retried: boolean;
}

export interface BatchCacheManifestV2 {
  version: typeof BATCH_CACHE_VERSION;
  stabilityVersion: typeof GENERATION_STABILITY_VERSION;
  projectId: string;
  segments: Record<string, BatchCacheSegmentV2>;
}

const digestJson = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isOptionalFiniteNumber = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && Number.isFinite(value));

const isAssessment = (value: unknown): value is GeneratedAudioAssessment =>
  isUnknownRecord(value) &&
  Array.isArray(value.issues) &&
  value.issues.every((issue) => typeof issue === "string") &&
  typeof value.critical === "boolean" &&
  typeof value.score === "number" &&
  Number.isFinite(value.score) &&
  isOptionalFiniteNumber(value.secondsPerUnit) &&
  isOptionalFiniteNumber(value.medianPitchHz) &&
  isOptionalFiniteNumber(value.pitchSemitoneDelta) &&
  isOptionalFiniteNumber(value.stabilityDeviation);

export const createStableGenerationSeed = (value: unknown): number =>
  Number.parseInt(digestJson(value).slice(0, 8), 16);

export const nextGenerationRetryEpoch = (current?: number): number => {
  const normalized = current ?? 0;
  if (
    !Number.isInteger(normalized) ||
    normalized < 0 ||
    normalized >= MAX_GENERATION_RETRY_EPOCH
  ) {
    throw new Error("这个任务已经重试太多次，请新建任务后再试。");
  }
  return normalized + 1;
};

export const createBatchGenerationSeed = (
  input: BatchGenerationSeedInput,
): number =>
  createStableGenerationSeed({
    version: GENERATION_STABILITY_VERSION,
    cacheKey: input.cacheKey,
    modelId: input.modelId,
    voiceId: input.voiceId,
    language: input.language,
    expression: input.expression,
    emotion: input.emotion,
    voxMode: input.voxMode,
    voiceDescription: input.voiceDescription,
    referenceSampleId: input.referenceSampleId,
    referenceSampleSha256: input.referenceSampleSha256,
    ...(input.retryEpoch ? { retryEpoch: input.retryEpoch } : {}),
    ...(input.regenerationId ? { regenerationId: input.regenerationId } : {}),
  });

export const deriveRetryGenerationSeed = (
  baseSeed: number,
  attempt: number,
  segmentScope?: string,
): number =>
  createStableGenerationSeed({
    version: GENERATION_STABILITY_VERSION,
    baseSeed,
    attempt,
    segmentScope,
  });

export const createSegmentFingerprint = (
  input: SegmentFingerprintInput,
): string =>
  digestJson({
    qualityVersion: BATCH_CACHE_VERSION,
    stabilityVersion: GENERATION_STABILITY_VERSION,
    modelId: input.modelId,
    voiceId: input.voiceId,
    text: input.text,
    expression: input.expression,
    voxMode: input.voxMode,
    voiceDescription: input.voiceDescription,
    language: input.language,
    emotion: input.emotion,
    speed: input.speed,
    volume: input.volume,
    presetId: input.presetId,
    referenceSampleId: input.referenceSampleId,
    referenceSampleSha256: input.referenceSampleSha256,
    generationSeed: input.generationSeed,
    longForm: input.longForm,
    ...(input.regenerationId ? { regenerationId: input.regenerationId } : {}),
  });

/**
 * 重试轮次会换掉待生成片段的种子，但已落盘片段仍用它原来的种子校验。
 * 这里只检查静态生成参数；文件哈希与质量结果仍由调用方单独核对。
 */
export const isCachedSegmentRequestCompatible = (
  input: Omit<SegmentFingerprintInput, "generationSeed">,
  cached: Pick<BatchCacheSegmentV2, "fingerprint" | "generationSeed">,
): boolean =>
  cached.fingerprint ===
  createSegmentFingerprint({
    ...input,
    generationSeed: cached.generationSeed,
  });

export const emptyBatchCache = (projectId: string): BatchCacheManifestV2 => ({
  version: BATCH_CACHE_VERSION,
  stabilityVersion: GENERATION_STABILITY_VERSION,
  projectId,
  segments: {},
});

export const isBatchCacheManifestV2 = (
  value: unknown,
  projectId: string,
): value is BatchCacheManifestV2 => {
  if (
    !isUnknownRecord(value) ||
    value.version !== BATCH_CACHE_VERSION ||
    value.stabilityVersion !== GENERATION_STABILITY_VERSION ||
    value.projectId !== projectId ||
    !isUnknownRecord(value.segments)
  ) {
    return false;
  }
  return Object.values(value.segments).every(
    (segment) =>
      isUnknownRecord(segment) &&
      typeof segment.fingerprint === "string" &&
      typeof segment.durationSeconds === "number" &&
      Number.isFinite(segment.durationSeconds) &&
      segment.durationSeconds > 0 &&
      typeof segment.fileId === "string" &&
      typeof segment.fileSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(segment.fileSha256) &&
      typeof segment.generationSeed === "number" &&
      Number.isInteger(segment.generationSeed) &&
      segment.generationSeed >= 0 &&
      segment.generationSeed <= 0xffff_ffff &&
      isAssessment(segment.assessment) &&
      typeof segment.retried === "boolean",
  );
};
