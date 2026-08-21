import assert from "node:assert/strict";
import test from "node:test";

import { isBatchGenerationRequest, isGenerationRequest } from "../src/index";

const single = {
  requestId: "regeneration-single",
  title: "重新生成测试",
  modelId: "voxcpm2",
  voiceId: "voice-1234",
  text: "重新生成这一段。",
  expression: "自然、清晰",
  language: "zh",
  emotion: "自然",
  speed: 1,
  volume: 100,
  format: "mp3",
} as const;

const batch = {
  requestId: "regeneration-batch",
  modelId: "voxcpm2",
  segments: [{ id: "line-1", voiceId: "voice-1234", text: "第一句。" }],
  language: "zh",
  emotion: "自然",
  speed: 1,
  volume: 100,
  pauseMs: 260,
  format: "mp3",
  title: "重新生成批量测试",
  kind: "subtitles",
} as const;

void test("生成请求只接受有界且可持久化的重新生成标识", () => {
  assert.equal(isGenerationRequest(single), true);
  assert.equal(
    isGenerationRequest({ ...single, regenerationId: "take-1234" }),
    true,
  );
  assert.equal(isBatchGenerationRequest(batch), true);
  assert.equal(
    isBatchGenerationRequest({ ...batch, regenerationId: "take-5678" }),
    true,
  );
  assert.equal(isGenerationRequest({ ...single, regenerationId: "" }), false);
  assert.equal(
    isBatchGenerationRequest({ ...batch, regenerationId: "带 空格" }),
    false,
  );
  assert.equal(
    isGenerationRequest({ ...single, regenerationId: "x".repeat(121) }),
    false,
  );
});
