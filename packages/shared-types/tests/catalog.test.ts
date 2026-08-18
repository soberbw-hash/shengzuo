import assert from "node:assert/strict";
import test from "node:test";

import {
  countMeaningfulCharacters,
  createTitleFromText,
  isAddVoiceSampleRequest,
  isCreateVoiceProfileRequest,
  isEngineCommand,
  isExportNamingTemplate,
  isExportAudioRequest,
  isSetAudioFavoriteRequest,
  isSmartApiBaseUrl,
  isSmartDialogueScriptRequest,
  isSmartTextRequest,
  isUpdateSmartApiConfigRequest,
  getModelGenerationCapabilities,
  isRenameVoiceProfileRequest,
  isRemoveVoiceSampleRequest,
  isSelectVoiceSampleRequest,
  LANGUAGE_OPTIONS,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  renderExportFileStem,
  takeMeaningfulPrefix,
} from "../src/index";

void test("export naming template renders a safe predictable file name", () => {
  assert.equal(
    renderExportFileStem("{项目}_{类型}_{模型}_{日期}_{时间}", {
      title: "新品/介绍",
      kind: "subtitles",
      modelName: "VoxCPM2",
      createdAt: "2026-08-17T14:26:08",
    }),
    "新品-介绍_字幕配音_VoxCPM2_2026-08-17_14-26-08",
  );
  assert.equal(isExportNamingTemplate("{项目}_{日期}"), true);
  assert.equal(isExportNamingTemplate("{项目}_{未知内容}"), false);
  assert.equal(isExportNamingTemplate("{项目}_{"), false);
});

void test("model catalog contains three distinct recommended choices", () => {
  assert.deepEqual(
    MODEL_CATALOG.map((model) => model.name),
    ["VoxCPM2", "Fun-CosyVoice3 0.5B 2512", "IndexTTS-2.5"],
  );
  assert.deepEqual(
    MODEL_CATALOG.filter((model) => model.available).map((model) => model.id),
    ["voxcpm2", "fun-cosyvoice3-0.5b", "indextts2-5"],
  );
  assert.deepEqual(
    MODEL_CATALOG.map((model) => model.badge),
    ["首选", "方言多", "情绪强"],
  );
  assert.deepEqual(
    MODEL_CATALOG.map((model) => [model.rating, model.ratingLabel]),
    [
      [5, "综合最推荐"],
      [4.5, "方言创作首选"],
      [4.8, "表现力推荐"],
    ],
  );
});

void test("text helpers ignore whitespace and create a useful short title", () => {
  assert.equal(countMeaningfulCharacters("大家好\n\n 我是 郑轮"), 7);
  assert.equal(
    createTitleFromText("  大家好\n我是郑轮，今天介绍系统更新内容"),
    "大家好我是郑轮，今天介绍",
  );
  assert.equal(createTitleFromText(" \n "), "单段配音");
  assert.equal(
    takeMeaningfulPrefix("大家好\n 我是郑轮，今天开始配音。", 8),
    "大家好\n 我是郑轮，",
  );
});

void test("each model exposes only its documented language choices", () => {
  assert.ok(
    MODEL_CATALOG.every((model) =>
      MODEL_LANGUAGE_SUPPORT[model.id].includes("auto"),
    ),
  );
  assert.ok(MODEL_LANGUAGE_SUPPORT["fun-cosyvoice3-0.5b"].includes("yue"));
  assert.ok(MODEL_LANGUAGE_SUPPORT.voxcpm2.includes("he"));
  assert.equal(MODEL_LANGUAGE_SUPPORT.voxcpm2.length, 40);
  assert.equal(MODEL_LANGUAGE_SUPPORT["fun-cosyvoice3-0.5b"].length, 29);
  assert.deepEqual(MODEL_LANGUAGE_SUPPORT["indextts2-5"], [
    "auto",
    "zh",
    "en",
    "ja",
    "es",
    "ar",
  ]);
  assert.equal(
    LANGUAGE_OPTIONS.filter(
      (option) =>
        option.group === "dialect" &&
        MODEL_LANGUAGE_SUPPORT["fun-cosyvoice3-0.5b"].includes(option.id),
    ).length,
    19,
  );
  assert.ok(
    Object.values(MODEL_LANGUAGE_SUPPORT)
      .flat()
      .every((id) => LANGUAGE_OPTIONS.some((option) => option.id === id)),
  );
});

void test("generation controls follow each model's real worker capabilities", () => {
  assert.deepEqual(getModelGenerationCapabilities("voxcpm2", "zh"), {
    emotion: false,
    expression: true,
    presets: ["natural", "longform", "expressive"],
  });
  assert.deepEqual(
    getModelGenerationCapabilities("fun-cosyvoice3-0.5b", "zh"),
    {
      emotion: false,
      expression: false,
      presets: ["natural", "longform"],
    },
  );
  assert.deepEqual(
    getModelGenerationCapabilities("fun-cosyvoice3-0.5b", "dialect-sichuan"),
    {
      emotion: false,
      expression: true,
      presets: ["natural", "longform", "expressive"],
    },
  );
  assert.deepEqual(getModelGenerationCapabilities("indextts2-5", "zh"), {
    emotion: true,
    expression: true,
    presets: ["natural", "longform", "expressive"],
  });
});

void test("smart API guards allow secure providers and bounded text requests", () => {
  assert.equal(isSmartApiBaseUrl("https://api.example.com/v1"), true);
  assert.equal(isSmartApiBaseUrl("http://127.0.0.1:11434/v1"), true);
  assert.equal(isSmartApiBaseUrl("http://api.example.com/v1"), false);
  assert.equal(isSmartApiBaseUrl("https://user:secret@example.com/v1"), false);
  assert.equal(
    isUpdateSmartApiConfigRequest({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "example-model",
      apiKey: "secret",
    }),
    true,
  );
  assert.equal(
    isSmartTextRequest({
      action: "spoken",
      text: "请把这段文字改得自然一些。",
      modelId: "voxcpm2",
      language: "zh",
    }),
    true,
  );
  assert.equal(
    isSmartTextRequest({
      action: "spoken",
      text: `${"文".repeat(20_000)}${" \n".repeat(10_000)}`,
      modelId: "voxcpm2",
      language: "zh",
    }),
    true,
  );
  assert.equal(
    isSmartTextRequest({
      action: "custom",
      text: "测试",
      modelId: "voxcpm2",
      language: "zh",
    }),
    false,
  );
  assert.equal(
    isSmartDialogueScriptRequest({
      text: "【夜晚】\n小林：我们出发吧。",
    }),
    true,
  );
  assert.equal(isSmartDialogueScriptRequest({ text: " \n " }), false);
});

void test("IPC runtime guards reject malformed renderer payloads", () => {
  assert.equal(
    isEngineCommand({
      type: "generate",
      request: {
        requestId: "preview-1",
        title: "试听 30 字",
        modelId: "voxcpm2",
        voiceId: "voice-1234",
        text: "大家好，我是郑轮。",
        expression: "自然、清晰",
        language: "zh",
        emotion: "温暖",
        speed: 1,
        volume: 100,
        format: "mp3",
        preview: true,
        projectId: "project-12345678",
      },
    }),
    true,
  );
  assert.equal(
    isEngineCommand({
      type: "generate",
      request: {
        requestId: "preview-2",
        title: "试听 30 字",
        modelId: "voxcpm2",
        voiceId: "voice-1234",
        text: "大家好，我是郑轮。",
        expression: "自然、清晰",
        language: "zh",
        emotion: "自然",
        speed: 1,
        volume: 100,
        format: "mp3",
        projectId: "../private-project",
      },
    }),
    false,
  );
  assert.equal(
    isEngineCommand({
      type: "generate-batch",
      request: {
        requestId: "dialogue-1",
        modelId: "voxcpm2",
        segments: [
          {
            id: "line-1",
            voiceId: "voice-1234",
            text: "我们开始吧。",
            label: "林舟",
            expression: "像久别重逢一样",
            emotion: "开心",
            speed: 1.1,
          },
        ],
        language: "zh",
        emotion: "自然",
        speed: 1,
        volume: 100,
        pauseMs: 260,
        format: "mp3",
        title: "多人对话",
        kind: "dialogue",
      },
    }),
    true,
  );
  assert.equal(
    isEngineCommand({
      type: "generate",
      request: {
        requestId: "test",
        modelId: "unknown-model",
        text: "hello",
      },
    }),
    false,
  );
  assert.equal(
    isExportAudioRequest({
      resultId: "result-1",
      suggestedName: "preview.exe",
      format: "exe",
    }),
    false,
  );
  assert.equal(
    isSetAudioFavoriteRequest({ resultId: "result-1", favorite: true }),
    true,
  );
  assert.equal(
    isSetAudioFavoriteRequest({ resultId: "../result-1", favorite: true }),
    false,
  );
  assert.equal(
    isCreateVoiceProfileRequest({
      sampleToken: "sample-1",
      name: "我的声音",
      referenceText: "这段文字与录音内容一致。",
    }),
    true,
  );
  assert.equal(
    isCreateVoiceProfileRequest({
      sampleToken: "sample-1",
      name: "",
      referenceText: "测试",
    }),
    false,
  );
  assert.equal(
    isRenameVoiceProfileRequest({ voiceId: "voice-1234", name: "旁白声音" }),
    true,
  );
  assert.equal(
    isRenameVoiceProfileRequest({ voiceId: "voice-1234", name: "   " }),
    false,
  );
  assert.equal(
    isAddVoiceSampleRequest({
      voiceId: "voice-1234",
      sampleToken: "abcd-1234",
      referenceText: "这一段录音对应的原文。",
    }),
    true,
  );
  assert.equal(
    isSelectVoiceSampleRequest({
      voiceId: "voice-1234",
      sampleId: "sample-abcd-1234",
    }),
    true,
  );
  assert.equal(
    isRemoveVoiceSampleRequest({
      voiceId: "voice-1234",
      sampleId: "../sample-abcd-1234",
    }),
    false,
  );
});
