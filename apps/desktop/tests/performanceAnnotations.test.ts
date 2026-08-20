import assert from "node:assert/strict";
import test from "node:test";

import {
  createPerformanceAnnotationParts,
  performancePauseLabel,
} from "../src/renderer/src/lib/performanceAnnotations";

void test("performance annotations explain the applied controls in plain Chinese", () => {
  assert.deepEqual(
    createPerformanceAnnotationParts({
      text: "请慢一点说。",
      pauseAfterMs: 480,
      mood: "沉稳",
      expression: "语速平缓，语气克制",
    }),
    [
      { tone: "mood", label: "语气参考：沉稳" },
      { tone: "pause", label: "停顿：段落停顿" },
      { tone: "expression", label: "表达：语速平缓，语气克制" },
    ],
  );
});

void test("emotion-capable models label real emotion separately from reference mood", () => {
  const parts = createPerformanceAnnotationParts({
    text: "今天真好。",
    pauseAfterMs: 120,
    mood: "开心",
    emotion: "开心",
  });
  assert.equal(parts[0]?.label, "情绪：开心");
  assert.equal(performancePauseLabel(120), "轻停顿");
});
