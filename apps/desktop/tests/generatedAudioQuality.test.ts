import assert from "node:assert/strict";
import test from "node:test";

import {
  assessGeneratedAudio,
  estimateSpokenUnits,
  estimateVisibleCharacters,
  FrozenQualityBaselineTracker,
  generationQualityModeFor,
  generationQualityRetryCount,
  isAssessmentBetter,
  shouldUseVoxLongForm,
  type GeneratedAudioAssessment,
} from "../src/main/generatedAudioQuality";

const healthy = {
  durationSeconds: 4,
  peakDb: -3,
  rmsDb: -18,
  silenceRatio: 0.08,
  clippedRatio: 0,
  leadingSilenceSeconds: 0.05,
  trailingSilenceSeconds: 0.08,
};

void test("gives full careful generations more recovery attempts", () => {
  assert.equal(generationQualityRetryCount("careful", false), 4);
  assert.equal(generationQualityRetryCount("careful", true), 1);
  assert.equal(generationQualityRetryCount("standard", false), 1);
});

void test("accepts a healthy spoken segment", () => {
  const result = assessGeneratedAudio(
    healthy,
    "这是一次正常的配音测试。",
    "careful",
  );
  assert.equal(result.issues.length, 0);
  assert.equal(result.critical, false);
});

void test("treats an impossibly fast careful segment as critical after retries", () => {
  const result = assessGeneratedAudio(
    { ...healthy, durationSeconds: 0.35 },
    "这是一段明显不可能在零点三秒内完整读完的中文稿件。",
    "careful",
  );
  assert.equal(result.critical, true);
  assert.ok(result.issues.includes("疑似漏读或语速异常"));
});

void test("counts Chinese, English syllables and digits but ignores whitespace", () => {
  const compact = estimateSpokenUnits("你好 CPU 2026 performance");
  const spaced = estimateSpokenUnits("  你好\n\nCPU   2026   performance  ");
  assert.equal(spaced, compact);
  assert.ok(compact >= 11);
  assert.ok(compact < 20);
  assert.ok(estimateSpokenUnits("natural language generation") < 12);
  assert.ok(estimateSpokenUnits("THIS IS A SHORT TEST") < 10);
  assert.equal(estimateSpokenUnits("CPU GPU DXP480T"), 13);
  assert.equal(estimateSpokenUnits("THIS IS DXP480T"), 9);
  assert.equal(estimateVisibleCharacters(" A B\n中 "), 3);
});

void test("upgrades a long Vox natural take to careful without changing its preset", () => {
  const mode = generationQualityModeFor({
    modelId: "voxcpm2",
    presetId: "natural",
    text: "这是一段用于长稿稳定性检测的文字。".repeat(6),
  });
  assert.equal(mode, "careful");
});

void test("keeps two short dialogue lines natural but stabilizes real long-form work", () => {
  assert.equal(
    shouldUseVoxLongForm({
      modelId: "voxcpm2",
      presetId: "natural",
      segmentCount: 2,
      totalSpokenUnits: 18,
      totalVisibleCharacters: 18,
    }),
    false,
  );
  assert.equal(
    shouldUseVoxLongForm({
      modelId: "voxcpm2",
      presetId: "natural",
      segmentCount: 3,
      totalSpokenUnits: 24,
      totalVisibleCharacters: 24,
    }),
    true,
  );
  assert.equal(
    shouldUseVoxLongForm({
      modelId: "voxcpm2",
      presetId: "natural",
      segmentCount: 2,
      totalSpokenUnits: 90,
      totalVisibleCharacters: 90,
    }),
    true,
  );
  assert.equal(
    shouldUseVoxLongForm({
      modelId: "voxcpm2",
      presetId: "longform",
      segmentCount: 1,
      totalSpokenUnits: 20,
      totalVisibleCharacters: 20,
    }),
    true,
  );
});

void test("stabilizes a long Latin script even when its syllable estimate is low", () => {
  const latinText = "THIS IS A SHORT TEST ".repeat(5).trim();
  assert.ok(estimateSpokenUnits(latinText) < 70);
  assert.ok(estimateVisibleCharacters(latinText) > 70);
  assert.equal(
    generationQualityModeFor({
      modelId: "voxcpm2",
      presetId: "natural",
      text: latinText,
    }),
    "careful",
  );
  assert.equal(
    shouldUseVoxLongForm({
      modelId: "voxcpm2",
      presetId: "natural",
      segmentCount: 2,
      totalSpokenUnits: estimateSpokenUnits(latinText),
      totalVisibleCharacters: estimateVisibleCharacters(latinText),
    }),
    true,
  );
});

void test("detects both severe acceleration and slowdown against a frozen pace", () => {
  const text = "这段文字共有足够多的朗读单位用于比较速度。";
  const units = estimateSpokenUnits(text);
  const faster = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.1 },
    text,
    "careful",
    0.2,
  );
  const slower = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.36 },
    text,
    "careful",
    0.2,
  );
  assert.ok(faster.issues.includes("语速明显变快"));
  assert.equal(faster.critical, true);
  assert.ok(slower.issues.includes("语速明显变慢"));
  assert.equal(slower.critical, true);
});

void test("does not merge a careful long-form segment with moderate pace drift", () => {
  const text = "这段文字共有足够多的朗读单位用于比较长稿速度。";
  const units = estimateSpokenUnits(text);
  const faster = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.15 },
    text,
    "careful",
    0.2,
    undefined,
    1,
    "voxcpm2",
  );
  const slower = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.3 },
    text,
    "careful",
    0.2,
    undefined,
    1,
    "voxcpm2",
  );
  assert.ok(faster.issues.includes("语速明显变快"));
  assert.equal(faster.critical, true);
  assert.ok(slower.issues.includes("语速明显变慢"));
  assert.equal(slower.critical, true);
});

void test("accepts a short structural heading's natural delivery shift", () => {
  const text = "四、相册：宝宝农历生日 + 大事记";
  const result = assessGeneratedAudio(
    {
      ...healthy,
      durationSeconds: estimateSpokenUnits(text) * 0.32,
      medianPitchHz: 360,
    },
    text,
    "careful",
    0.22,
    240,
    1,
    "voxcpm2",
  );
  assert.equal(result.issues.length, 0);
  assert.equal(result.critical, false);
});

void test("still rejects an extreme structural heading shift", () => {
  const text = "四、相册：宝宝农历生日 + 大事记";
  const result = assessGeneratedAudio(
    {
      ...healthy,
      durationSeconds: estimateSpokenUnits(text) * 0.46,
      medianPitchHz: 480,
    },
    text,
    "careful",
    0.22,
    240,
    1,
    "voxcpm2",
  );
  assert.ok(result.issues.includes("语速明显变慢"));
  assert.ok(result.issues.includes("音高明显变化"));
  assert.equal(result.critical, true);
});

void test("still rejects the same pace and pitch drift in ordinary narration", () => {
  const text = "宝宝相册现在支持设置农历生日，时间轴也会自动对齐。";
  const result = assessGeneratedAudio(
    {
      ...healthy,
      durationSeconds: estimateSpokenUnits(text) * 0.32,
      medianPitchHz: 360,
    },
    text,
    "careful",
    0.22,
    240,
    1,
    "voxcpm2",
  );
  assert.equal(result.critical, true);
});

void test("keeps unvalidated moderate pace drift as a warning on other models", () => {
  const text = "这段文字用于确认其他模型不会套用 Vox 的严格失败门槛。";
  const result = assessGeneratedAudio(
    {
      ...healthy,
      durationSeconds: estimateSpokenUnits(text) * 0.15,
    },
    text,
    "careful",
    0.2,
    undefined,
    1,
    "indextts2-5",
  );
  assert.ok(result.issues.includes("语速明显变快"));
  assert.equal(result.critical, false);
});

void test("freezes the median baseline and never absorbs later outliers", () => {
  const tracker = new FrozenQualityBaselineTracker();
  const accepted = (
    secondsPerUnit: number,
    medianPitchHz: number,
  ): GeneratedAudioAssessment => ({
    issues: [],
    critical: false,
    score: 0,
    secondsPerUnit,
    medianPitchHz,
  });
  assert.deepEqual(tracker.observe("voice-style", accepted(0.2, 200)), {
    previousPitchHz: 200,
  });
  assert.deepEqual(tracker.observe("voice-style", accepted(0.22, 204)), {
    previousPitchHz: 204,
  });
  const frozen = tracker.observe("voice-style", accepted(0.21, 202));
  assert.deepEqual(frozen, {
    secondsPerUnit: 0.21,
    medianPitchHz: 202,
    previousPitchHz: 202,
  });
  tracker.observe("voice-style", accepted(0.08, 310));
  assert.deepEqual(tracker.get("voice-style"), frozen);
});

void test("keeps collecting after short segments without measurable pace or pitch", () => {
  const tracker = new FrozenQualityBaselineTracker();
  const short: GeneratedAudioAssessment = {
    issues: [],
    critical: false,
    score: 0,
  };
  tracker.observe("voice-style", short);
  tracker.observe("voice-style", short);
  tracker.observe("voice-style", short);
  assert.equal(tracker.get("voice-style"), undefined);

  for (const secondsPerUnit of [0.19, 0.2, 0.21]) {
    tracker.observe("voice-style", {
      ...short,
      secondsPerUnit,
      medianPitchHz: 205,
    });
  }
  assert.deepEqual(tracker.get("voice-style"), {
    secondsPerUnit: 0.2,
    medianPitchHz: 205,
    previousPitchHz: 205,
  });
});

void test("rechecking the first calibration segments catches an early outlier", () => {
  const tracker = new FrozenQualityBaselineTracker();
  const accepted = (secondsPerUnit: number): GeneratedAudioAssessment => ({
    issues: [],
    critical: false,
    score: 0,
    secondsPerUnit,
    medianPitchHz: 205,
  });
  tracker.observe("voice-style", accepted(0.1));
  tracker.observe("voice-style", accepted(0.2));
  const baseline = tracker.observe("voice-style", accepted(0.21));
  assert.equal(baseline?.secondsPerUnit, 0.2);

  const text = "这段校准文字足够长可以重新检查开头的异常速度。";
  const reassessed = assessGeneratedAudio(
    {
      ...healthy,
      durationSeconds: estimateSpokenUnits(text) * 0.1,
      medianPitchHz: 205,
    },
    text,
    "careful",
    baseline?.secondsPerUnit,
    baseline?.medianPitchHz,
  );
  assert.ok(reassessed.issues.includes("语速明显变快"));
  assert.equal(reassessed.critical, true);
});

void test("uses a tighter pace spread only while rechecking calibration audio", () => {
  const text = "这段校准文字用于检查逐步加速是否会从前三段漏过去。";
  const units = estimateSpokenUnits(text);
  const regular = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.145 },
    text,
    "careful",
    0.17,
    undefined,
    1,
    "voxcpm2",
  );
  const calibration = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.145 },
    text,
    "careful",
    0.17,
    undefined,
    1,
    "voxcpm2",
    true,
  );
  assert.equal(regular.issues.includes("语速明显变快"), false);
  assert.equal(calibration.issues.includes("语速明显变快"), true);
});

void test("flags a reliable whole-segment pitch jump over four semitones", () => {
  const result = assessGeneratedAudio(
    { ...healthy, medianPitchHz: 300 },
    "这是一段长度足够的音高稳定性检查文字。",
    "careful",
    undefined,
    200,
    1,
    "voxcpm2",
  );
  assert.ok(result.issues.includes("音高明显变化"));
  assert.equal(result.critical, true);
});

void test("flags a sudden adjacent pitch jump even when both segments are near the median", () => {
  const result = assessGeneratedAudio(
    { ...healthy, medianPitchHz: 233.38 },
    "这是一段长度足够的相邻音高稳定性检查文字。",
    "careful",
    undefined,
    257,
    1,
    "voxcpm2",
    false,
    320.11,
  );
  assert.ok(result.issues.includes("音高明显变化"));
  assert.ok(Math.abs(result.pitchSemitoneDelta ?? 0) > 4.8);
});

void test("waits for a frozen baseline before enforcing moderate adjacent pitch drift", () => {
  const result = assessGeneratedAudio(
    { ...healthy, medianPitchHz: 220 },
    "第二段正文会从开场的高昂语气自然回落到正常口播。",
    "careful",
    undefined,
    undefined,
    1,
    "voxcpm2",
    false,
    330,
  );
  assert.equal(result.issues.includes("音高明显变化"), false);
  assert.equal(result.critical, false);
});

void test("does not enforce the unvalidated pitch gate on other models", () => {
  const result = assessGeneratedAudio(
    { ...healthy, medianPitchHz: 300 },
    "这是一段长度足够的其他模型音高检查文字。",
    "careful",
    undefined,
    200,
    1,
    "fun-cosyvoice3-0.5b",
  );
  assert.equal(result.issues.includes("音高明显变化"), false);
  assert.equal(result.critical, false);
});

void test("normalizes pace checks for the user's requested speed", () => {
  const text = "这段文字会用两倍语速生成但仍应按原始朗读速度检查。";
  const units = estimateSpokenUnits(text);
  const result = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.08 },
    text,
    "careful",
    0.16,
    undefined,
    2,
    "voxcpm2",
  );
  assert.equal(result.issues.length, 0);
});

void test("chooses the same-warning retry closer to the safe pace boundary", () => {
  const text = "这段文字用于比较同类异常候选";
  const units = estimateSpokenUnits(text);
  const first = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.046 },
    text,
    "careful",
  );
  const closer = assessGeneratedAudio(
    { ...healthy, durationSeconds: units * 0.06 },
    text,
    "careful",
  );
  assert.equal(first.score, closer.score);
  assert.ok(isAssessmentBetter(closer, first));
});

void test("detects pace drift against earlier chunks", () => {
  const result = assessGeneratedAudio(
    { ...healthy, durationSeconds: 1.4 },
    "这里共有十几个中文字用于检查速度变化。",
    "careful",
    0.22,
  );
  assert.ok(result.issues.includes("语速明显变快"));
});
