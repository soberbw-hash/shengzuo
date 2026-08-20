import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { GenerationTask } from "@ai-voice-studio/shared-types";

import {
  findLatestSegmentGenerationTask,
  resolveSegmentGenerationState,
} from "../src/renderer/src/lib/segmentGenerationState";

const createTask = (
  overrides: Partial<GenerationTask> = {},
): GenerationTask => ({
  id: "task-1",
  title: "测试长稿",
  kind: "subtitles",
  modelId: "voxcpm2",
  status: "queued",
  progress: 0,
  message: "等待生成",
  currentSegment: 0,
  totalSegments: 4,
  projectId: "project-1",
  createdAt: "2026-08-21T02:00:00.000Z",
  updatedAt: "2026-08-21T02:00:00.000Z",
  ...overrides,
});

void test("运行中任务只把当前句标为处理中", () => {
  const task = createTask({
    status: "running",
    currentSegment: 2,
    message: "正在生成第 2 / 4 句…",
  });

  assert.deepEqual(
    [0, 1, 2, 3].map((index) => resolveSegmentGenerationState(task, index)),
    ["generated", "processing", "pending", "pending"],
  );
});

void test("缓存句和合并阶段不会被误标为正在生成", () => {
  const cached = createTask({
    status: "running",
    currentSegment: 2,
    message: "第 2 / 4 句已经生成，直接使用已有音频…",
  });
  const merging = createTask({
    status: "running",
    currentSegment: 4,
    message: "正在合并音频…",
  });

  assert.deepEqual(
    [0, 1, 2, 3].map((index) => resolveSegmentGenerationState(cached, index)),
    ["generated", "generated", "pending", "pending"],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => resolveSegmentGenerationState(merging, index)),
    ["generated", "generated", "generated", "generated"],
  );
});

void test("重试前准备模型时不伪造当前句正在生成", () => {
  const task = createTask({
    status: "running",
    currentSegment: 3,
    message: "正在准备本地模型…",
  });

  assert.deepEqual(
    [0, 1, 2, 3].map((index) => resolveSegmentGenerationState(task, index)),
    ["generated", "generated", "pending", "pending"],
  );
});

void test("失败任务保留已生成句，只标记确定失败的当前句", () => {
  const task = createTask({
    status: "failed",
    currentSegment: 3,
    message: "生成失败。已保存 2 / 4 句；重试时会从未完成处继续。",
  });

  assert.deepEqual(
    [0, 1, 2, 3].map((index) => resolveSegmentGenerationState(task, index)),
    ["generated", "generated", "failed", "pending"],
  );
});

void test("合并失败和预检失败不伪造某句失败", () => {
  const mergeFailure = createTask({
    status: "failed",
    currentSegment: 4,
    message: "合并音频失败。已保存 4 / 4 句；重试时会从未完成处继续。",
  });
  const preflightFailure = createTask({
    status: "failed",
    currentSegment: 0,
    errorCode: "TASK_PREFLIGHT_FAILED",
    message: "没有找到这条声音的录音。",
  });

  assert.deepEqual(
    [0, 1, 2, 3].map((index) =>
      resolveSegmentGenerationState(mergeFailure, index),
    ),
    ["generated", "generated", "generated", "generated"],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((index) =>
      resolveSegmentGenerationState(preflightFailure, index),
    ),
    ["pending", "pending", "pending", "pending"],
  );
});

void test("只选择当前项目保存后创建的最新逐句任务", () => {
  const staleTask = createTask({
    id: "stale",
    status: "completed",
    createdAt: "2026-08-21T01:00:00.000Z",
  });
  const currentTask = createTask({
    id: "current",
    status: "running",
    createdAt: "2026-08-21T03:00:00.000Z",
    updatedAt: "2026-08-21T03:01:00.000Z",
  });
  const unrelatedTask = createTask({
    id: "other-project",
    projectId: "project-2",
    createdAt: "2026-08-21T04:00:00.000Z",
  });

  assert.equal(
    findLatestSegmentGenerationTask([staleTask, unrelatedTask, currentTask], {
      projectId: "project-1",
      kind: "subtitles",
      totalSegments: 4,
      projectUpdatedAt: "2026-08-21T02:30:00.000Z",
    })?.id,
    "current",
  );
  assert.equal(
    findLatestSegmentGenerationTask([staleTask], {
      projectId: "project-1",
      kind: "subtitles",
      totalSegments: 4,
      projectUpdatedAt: "2026-08-21T02:30:00.000Z",
    }),
    undefined,
  );
});

void test("长稿句和对话台词在 DOM 中暴露同一套状态与辅助说明", () => {
  const subtitlePage = readFileSync(
    new URL("../src/renderer/src/pages/SubtitlesPage.tsx", import.meta.url),
    "utf8",
  );
  const dialoguePage = readFileSync(
    new URL("../src/renderer/src/pages/DialoguePage.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../src/renderer/src/styles/index.css", import.meta.url),
    "utf8",
  );

  assert.match(subtitlePage, /data-state=\{segmentState\}/u);
  assert.match(
    subtitlePage,
    /aria-label=\{`第 \$\{index \+ 1\} 句，\$\{SEGMENT_GENERATION_STATE_LABEL\[segmentState\]\}`\}/u,
  );
  assert.match(dialoguePage, /data-state=\{lineState\}/u);
  assert.match(
    dialoguePage,
    /aria-label=\{`第 \$\{index \+ 1\} 句台词，\$\{SEGMENT_GENERATION_STATE_LABEL\[lineState\]\}`\}/u,
  );
  assert.match(styles, /\.subtitle-segment::before/u);
  assert.match(styles, /\.dialogue-line-editor::before/u);
  assert.match(styles, /width: 3px/u);
  for (const state of ["pending", "processing", "generated", "failed"]) {
    assert.match(styles, new RegExp(`data-state="${state}"`, "u"));
  }
});
