import assert from "node:assert/strict";
import test from "node:test";

import { assessGeneratedAudio } from "../src/main/generatedAudioQuality";

const healthy = {
  durationSeconds: 4,
  peakDb: -3,
  rmsDb: -18,
  silenceRatio: 0.08,
  clippedRatio: 0,
  leadingSilenceSeconds: 0.05,
  trailingSilenceSeconds: 0.08,
};

void test("accepts a healthy spoken segment", () => {
  const result = assessGeneratedAudio(
    healthy,
    "这是一次正常的配音测试。",
    "careful",
  );
  assert.equal(result.issues.length, 0);
  assert.equal(result.critical, false);
});

void test("keeps suspiciously fast speech as a warning instead of losing output", () => {
  const result = assessGeneratedAudio(
    { ...healthy, durationSeconds: 0.35 },
    "这是一段明显不可能在零点三秒内完整读完的中文稿件。",
    "careful",
  );
  assert.equal(result.critical, false);
  assert.ok(result.issues.includes("疑似漏读或语速异常"));
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
