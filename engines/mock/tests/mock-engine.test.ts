import assert from "node:assert/strict";
import test from "node:test";

import type {
  EngineStatus,
  GenerationRequest,
} from "@ai-voice-studio/shared-types";

import { MockEngine } from "../src/index";

const request: GenerationRequest = {
  requestId: "test-request",
  title: "测试配音",
  modelId: "voxcpm2",
  voiceId: "voice-test",
  text: "这是一段用于自动化测试的文字。",
  expression: "自然",
  language: "zh",
  emotion: "自然",
  speed: 1,
  volume: 100,
  format: "mp3",
};

void test("mock engine can expose every required status deterministically", () => {
  const engine = new MockEngine();
  const statuses: EngineStatus[] = [
    "not-installed",
    "downloading",
    "download-paused",
    "download-failed",
    "installing",
    "loading",
    "ready",
    "generating",
    "success",
    "generation-failed",
    "stopped",
  ];

  for (const status of statuses) {
    engine.command({ type: "set-mock-state", status });
    assert.equal(engine.getSnapshot().status, status);
  }
  engine.dispose();
});

void test("empty generation request becomes a retryable natural-language failure", () => {
  const engine = new MockEngine();
  engine.command({ type: "set-mock-state", status: "ready" });
  engine.command({ type: "generate", request: { ...request, text: "" } });
  const snapshot = engine.getSnapshot();

  assert.equal(snapshot.status, "generation-failed");
  assert.equal(snapshot.canRetry, true);
  assert.match(snapshot.message, /请输入/);
  engine.dispose();
});

void test("user can stop an active generation", () => {
  const engine = new MockEngine();
  engine.command({ type: "set-mock-state", status: "ready" });
  const active = engine.command({ type: "generate", request });
  assert.equal(active.status, "generating");
  assert.ok(active.jobId);
  engine.command({ type: "cancel", jobId: active.jobId ?? "" });
  assert.equal(engine.getSnapshot().status, "stopped");
  engine.dispose();
});

void test("model installation can be paused and resumed", () => {
  const engine = new MockEngine();
  engine.command({ type: "set-mock-state", status: "installing" });
  engine.command({ type: "pause-download", modelId: "voxcpm2" });
  assert.equal(engine.getSnapshot().status, "download-paused");
  engine.command({ type: "resume-download", modelId: "voxcpm2" });
  assert.equal(engine.getSnapshot().status, "downloading");
  engine.dispose();
});
