import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SaveProjectRequest } from "@ai-voice-studio/shared-types";

import { ProjectStore } from "../src/main/projectStore";

const baseProject: SaveProjectRequest = {
  title: "朗读规则兼容测试",
  kind: "single",
  modelId: "voxcpm2",
  language: "auto",
  emotion: "自然",
  speed: 1,
  volume: 100,
  pauseMs: 0,
  expression: "自然、清晰",
  sourceText: "AI 助手（画面说明）",
  segments: [
    {
      id: "single-1",
      text: "AI 助手（画面说明）",
      voiceId: "voice-test",
    },
  ],
};

void test("projects preserve legacy replace rules and explicit skip rules", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "shengzuo-pronunciation-project-test-"),
  );
  try {
    const store = new ProjectStore(root);
    const saved = await store.save({
      ...baseProject,
      pronunciationRules: [
        {
          id: "legacy-replace",
          source: "AI",
          replacement: "A I",
          enabled: true,
        },
        {
          id: "explicit-skip",
          source: "（画面说明）",
          replacement: "",
          enabled: true,
          action: "skip",
        },
      ],
    });

    const restored = await store.get(saved.id);
    assert.deepEqual(restored?.pronunciationRules, [
      {
        id: "legacy-replace",
        source: "AI",
        replacement: "A I",
        enabled: true,
      },
      {
        id: "explicit-skip",
        source: "（画面说明）",
        replacement: "",
        enabled: true,
        action: "skip",
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
