import assert from "node:assert/strict";
import test from "node:test";

import {
  getReferenceDurationGuidance,
  isUltimateReferenceTooLong,
} from "../src/renderer/src/lib/referenceAudioGuidance";

void test("reference duration guidance recommends the stable recording range", () => {
  assert.deepEqual(getReferenceDurationGuidance(4.2), {
    label: "录音偏短，5–15 秒更稳定",
    tone: "warning",
  });
  assert.deepEqual(getReferenceDurationGuidance(10), {
    label: "推荐时长，适合克隆",
    tone: "success",
  });
  assert.deepEqual(getReferenceDurationGuidance(24), {
    label: "时长可用，5–15 秒通常更稳定",
    tone: "success",
  });
});

void test("recordings over thirty seconds are kept for controlled clone only", () => {
  assert.equal(isUltimateReferenceTooLong(undefined), false);
  assert.equal(isUltimateReferenceTooLong(30), false);
  assert.equal(isUltimateReferenceTooLong(30.01), true);
  assert.deepEqual(getReferenceDurationGuidance(42), {
    label: "较长录音：仅用于可控克隆",
    tone: "warning",
  });
});

void test("hard-invalid durations keep the existing danger check as the single message", () => {
  assert.equal(getReferenceDurationGuidance(undefined), null);
  assert.equal(getReferenceDurationGuidance(2.9), null);
  assert.equal(getReferenceDurationGuidance(60.1), null);
});
