import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationRequest } from "@ai-voice-studio/shared-types";

import { canTransition, validateGenerationRequest } from "../src/index";

const validRequest: GenerationRequest = {
  requestId: "request-1",
  modelId: "voxcpm2",
  voiceId: "voice-warm-narrator",
  text: "你好，欢迎使用 AI Voice Studio。",
  expression: "自然、清晰",
  language: "zh",
  emotion: "自然",
  speed: 1,
  volume: 100,
  format: "mp3",
};

void test("engine transition guard accepts valid and rejects invalid transitions", () => {
  assert.equal(canTransition("ready", "generating"), true);
  assert.equal(canTransition("ready", "installing"), false);
});

void test("generation validation reports natural Chinese messages", () => {
  assert.deepEqual(validateGenerationRequest(validRequest), []);
  assert.deepEqual(validateGenerationRequest({ ...validRequest, text: " " }), [
    "请输入需要配音的文字。",
  ]);
});
