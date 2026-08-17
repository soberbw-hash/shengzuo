import assert from "node:assert/strict";
import test from "node:test";

import {
  isCreateVoiceProfileRequest,
  isEngineCommand,
  isExportNamingTemplate,
  isExportAudioRequest,
  isSetAudioFavoriteRequest,
  LANGUAGE_OPTIONS,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  renderExportFileStem,
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
    ["综合最推荐", "方言更多", "情绪演绎"],
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

void test("IPC runtime guards reject malformed renderer payloads", () => {
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
});
