import assert from "node:assert/strict";
import test from "node:test";

import {
  hasMeaningfulDraftContent,
  loadCreationDraft,
  type DialogueCreationDraft,
} from "../src/renderer/src/lib/projectDrafts";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

const withBrowserStorage = <T>(run: (storage: Storage) => T): T => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    return run(storage);
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (storageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
};

const baseDraft = {
  title: "旧草稿",
  modelId: "voxcpm2",
  language: "auto",
  emotion: "自然",
  expression: "自然、清晰",
  presetId: "natural",
  speed: 1,
  volume: 100,
  selectedVoice: "voice-test",
  updatedAt: new Date().toISOString(),
} as const;

void test("legacy drafts without pronunciation rules load with an empty rule list", () => {
  withBrowserStorage((storage) => {
    storage.setItem(
      "shengzuo-creation-draft-single",
      JSON.stringify({
        ...baseDraft,
        kind: "single",
        text: "旧版单人草稿",
        performanceSegments: [],
      }),
    );
    storage.setItem(
      "shengzuo-creation-draft-subtitles",
      JSON.stringify({
        ...baseDraft,
        kind: "subtitles",
        sourceText: "旧版字幕草稿",
        pauseMs: 420,
        segments: [{ id: "subtitle-1", text: "旧版字幕草稿" }],
      }),
    );
    storage.setItem(
      "shengzuo-creation-draft-dialogue",
      JSON.stringify({
        ...baseDraft,
        kind: "dialogue",
        scriptInput: "旁白：旧版对话草稿",
        lines: [{ id: "dialogue-1", role: "旁白", text: "旧版对话草稿" }],
        voiceAssignments: {},
        roleEmotions: {},
        roleSpeeds: {},
      }),
    );

    assert.deepEqual(loadCreationDraft("single")?.pronunciationRules, []);
    assert.deepEqual(loadCreationDraft("subtitles")?.pronunciationRules, []);
    assert.deepEqual(loadCreationDraft("dialogue")?.pronunciationRules, []);
  });
});

void test("malformed pronunciation rules still reject the stored draft", () => {
  withBrowserStorage((storage) => {
    storage.setItem(
      "shengzuo-creation-draft-single",
      JSON.stringify({
        ...baseDraft,
        kind: "single",
        text: "不能加载",
        performanceSegments: [],
        pronunciationRules: [
          {
            id: "bad-rule",
            source: "AI",
            replacement: "",
            enabled: true,
            action: "replace",
          },
        ],
      }),
    );

    assert.equal(loadCreationDraft("single"), null);
  });
});

const dialogueDraft = (
  changes: Partial<DialogueCreationDraft>,
): DialogueCreationDraft => ({
  ...baseDraft,
  kind: "dialogue",
  scriptInput: "",
  lines: [{ id: "dialogue-1", role: "旁白", text: "" }],
  pronunciationRules: [],
  voiceAssignments: {},
  roleEmotions: {},
  roleSpeeds: {},
  ...changes,
});

void test("manual dialogue lines and reading rules both keep a draft meaningful", () => {
  assert.equal(
    hasMeaningfulDraftContent(
      dialogueDraft({
        lines: [{ id: "dialogue-1", role: "旁白", text: "手工填写的台词" }],
      }),
    ),
    true,
  );
  assert.equal(
    hasMeaningfulDraftContent(
      dialogueDraft({
        pronunciationRules: [
          {
            id: "skip-note",
            source: "（画面）",
            replacement: "",
            enabled: true,
            action: "skip",
          },
        ],
      }),
    ),
    true,
  );
  assert.equal(hasMeaningfulDraftContent(dialogueDraft({})), false);
});
