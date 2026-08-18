import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SaveProjectRequest } from "@ai-voice-studio/shared-types";

import { ProjectStore } from "../src/main/projectStore";
import { TaskStore, type StoredGenerationTask } from "../src/main/taskStore";

const projectRequest: SaveProjectRequest = {
  title: "测试字幕项目",
  kind: "subtitles",
  modelId: "voxcpm2",
  language: "auto",
  emotion: "自然",
  speed: 1,
  volume: 100,
  pauseMs: 420,
  expression: "自然、清晰",
  sourceText: "第一句\n第二句",
  segments: [
    { id: "subtitle-1", text: "第一句", voiceId: "voice-test" },
    { id: "subtitle-2", text: "第二句", voiceId: "voice-test" },
  ],
};

void test("projects are atomically saved, updated and removed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-project-test-"));
  try {
    const store = new ProjectStore(root);
    const created = await store.save(projectRequest);
    assert.match(created.id, /^project-/u);
    assert.equal((await store.list()).length, 1);

    const updated = await store.save({
      ...projectRequest,
      id: created.id,
      title: "修改后的项目",
    });
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal((await store.get(created.id))?.title, "修改后的项目");
    assert.equal(await store.remove(created.id), true);
    assert.equal(await store.get(created.id), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("a task interrupted during generation is recovered into the queue", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-task-test-"));
  try {
    const store = new TaskStore(root);
    const now = new Date().toISOString();
    const task: StoredGenerationTask = {
      id: "task-recovery-test",
      title: "长字幕配音",
      kind: "subtitles",
      modelId: "voxcpm2",
      status: "running",
      progress: 46,
      message: "正在生成第 46 / 100 句…",
      currentSegment: 46,
      totalSegments: 100,
      projectId: "project-12345678",
      createdAt: now,
      updatedAt: now,
      command: {
        type: "generate-batch",
        projectId: "project-12345678",
        request: {
          requestId: "task-recovery-test",
          modelId: "voxcpm2",
          segments: [
            { id: "subtitle-46", voiceId: "voice-test", text: "继续生成" },
          ],
          language: "auto",
          emotion: "自然",
          speed: 1,
          volume: 100,
          pauseMs: 420,
          format: "mp3",
          title: "长字幕配音",
          kind: "subtitles",
          projectId: "project-12345678",
        },
      },
    };
    await store.save([task]);
    const recovered = await store.load();
    assert.equal(recovered[0]?.status, "queued");
    assert.match(recovered[0]?.message ?? "", /已经重新排队/u);
    assert.equal(recovered[0]?.progress, 46);
    assert.equal(recovered[0]?.currentSegment, 46);

    const persisted = JSON.parse(
      await readFile(path.join(root, "generation-tasks.json"), "utf8"),
    ) as unknown[];
    assert.equal(persisted.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("a damaged project file is quarantined and restored from backup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-recovery-test-"));
  try {
    const store = new ProjectStore(root);
    const created = await store.save(projectRequest);
    await store.save({ ...projectRequest, id: created.id, title: "第二版" });
    const filePath = path.join(root, `${created.id}.json`);
    await writeFile(filePath, "{broken", "utf8");

    const restored = await store.get(created.id);
    assert.equal(restored?.title, projectRequest.title);
    const files = await readdir(root);
    assert.ok(files.some((name) => name.includes(".corrupt-")));
    const restoredText = await readFile(filePath, "utf8");
    assert.doesNotThrow(() => {
      JSON.parse(restoredText) as unknown;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
