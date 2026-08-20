import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSpeakableText,
  prepareReadingSegments,
  prepareReadingText,
} from "../src/main/readingRules";

void test("reading rules remove skipped text before it reaches a model", () => {
  const rules = [
    {
      id: "skip-note",
      source: "（画面切换）",
      replacement: "",
      enabled: true,
      action: "skip" as const,
    },
  ];
  assert.equal(prepareReadingText("开场（画面切换）继续", rules), "开场继续");
});

void test("fully skipped or punctuation-only segments never reach a worker", () => {
  const result = prepareReadingSegments(
    [
      { id: "one", text: "保留这句。" },
      { id: "two", text: "（删除）！" },
      { id: "three", text: "……" },
    ],
    [
      {
        id: "skip-delete",
        source: "（删除）",
        replacement: "",
        enabled: true,
        action: "skip",
      },
    ],
  );
  assert.deepEqual(result.segments, [{ id: "one", text: "保留这句。" }]);
  assert.equal(result.skippedCount, 2);
  assert.equal(hasSpeakableText("？！……"), false);
});

void test("all skipped segments produce an empty prepared list", () => {
  const result = prepareReadingSegments(
    [{ id: "only", text: "片头" }],
    [
      {
        id: "skip-all",
        source: "片头",
        replacement: "",
        enabled: true,
        action: "skip",
      },
    ],
  );
  assert.deepEqual(result, { segments: [], skippedCount: 1 });
});
