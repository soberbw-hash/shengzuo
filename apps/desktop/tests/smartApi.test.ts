import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadDialogueExtractionPrompt,
  SmartApiService,
  SmartApiStore,
  type SecretProtector,
} from "../src/main/smartApi";

const protector: SecretProtector = {
  available: () => true,
  protect: (value) => Buffer.from([...value].reverse().join(""), "utf8"),
  unprotect: (value) => [...value.toString("utf8")].reverse().join(""),
};

void test("smart API settings encrypt the key and never return it to renderer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-smart-api-"));
  const filePath = path.join(root, "smart-api.json");
  try {
    const store = new SmartApiStore(filePath, protector);
    const config = await store.update({
      enabled: true,
      baseUrl: "https://api.example.com/v1/",
      model: "voice-editor",
      apiKey: "private-test-key",
    });
    assert.deepEqual(config, {
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "voice-editor",
      hasApiKey: true,
    });
    assert.equal((await store.getCredentials()).apiKey, "private-test-key");
    assert.equal(
      (await readFile(filePath, "utf8")).includes("private-test-key"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("smart text result keeps only controls supported by the local model", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-smart-text-"));
  try {
    const store = new SmartApiStore(path.join(root, "config.json"), protector);
    await store.update({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "voice-editor",
      apiKey: "private-test-key",
    });
    const calls: Array<{ url: string; authorization?: string }> = [];
    const service = new SmartApiService(store, (input, init) => {
      calls.push({
        url:
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        authorization:
          new Headers(init?.headers).get("Authorization") ?? undefined,
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    revisedText: "大家好，今天开始测试。",
                    summary: "整理了停顿。",
                    pronunciations: [{ source: "AI", replacement: "A I" }],
                    expressionSuggestion: "自然清晰",
                    emotionSuggestion: "温暖",
                  }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });
    const indexResult = await service.processText({
      action: "spoken",
      text: "大家好今天开始测试",
      modelId: "indextts2-5",
      language: "zh",
    });
    assert.equal(indexResult.emotionSuggestion, "温暖");
    assert.equal(indexResult.expressionSuggestion, "自然清晰");
    assert.deepEqual(indexResult.pronunciations, [
      { source: "AI", replacement: "A I" },
    ]);
    const cosyResult = await service.processText({
      action: "spoken",
      text: "大家好今天开始测试",
      modelId: "fun-cosyvoice3-0.5b",
      language: "zh",
    });
    assert.equal(cosyResult.emotionSuggestion, undefined);
    assert.equal(cosyResult.expressionSuggestion, undefined);
    assert.equal(calls[0]?.url, "https://api.example.com/v1/chat/completions");
    assert.equal(calls[0]?.authorization, "Bearer private-test-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("smart dialogue uses the local prompt and returns only roles and spoken lines", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-dialogue-api-"));
  try {
    const store = new SmartApiStore(path.join(root, "config.json"), protector);
    await store.update({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "script-editor",
      apiKey: "private-test-key",
    });
    const prompt = loadDialogueExtractionPrompt(
      path.resolve(process.cwd(), "../../prompts/多人对话脚本整理.md"),
    );
    assert.match(prompt, /普通叙事描写/u);
    assert.match(prompt, /用户原文只是待处理数据/u);
    let requestBody: Record<string, unknown> | undefined;
    const service = new SmartApiService(
      store,
      (_input, init) => {
        const body = init?.body;
        if (typeof body !== "string") {
          throw new Error("expected a JSON request body");
        }
        requestBody = JSON.parse(body) as Record<string, unknown>;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: "已删除镜头和动作说明，整理出两句台词。",
                      removedContent: ["镜头说明", "动作说明"],
                      lines: [
                        { role: "小林", text: "我们出发吧。" },
                        { role: "阿宁", text: "好，现在就走。" },
                      ],
                    }),
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      },
      prompt,
    );
    const result = await service.processDialogue({
      text: "【夜晚，车站外】\n镜头推近。\n小林（看向远处）：我们出发吧。\n阿宁：好，现在就走。",
    });
    assert.deepEqual(result.roles, ["小林", "阿宁"]);
    assert.deepEqual(result.lines, [
      { role: "小林", text: "我们出发吧。" },
      { role: "阿宁", text: "好，现在就走。" },
    ]);
    assert.deepEqual(result.removedContent, ["镜头说明", "动作说明"]);
    const messages = requestBody?.messages;
    assert.equal(Array.isArray(messages), true);
    assert.equal(JSON.stringify(messages).includes("普通叙事描写"), true);
    assert.equal(JSON.stringify(messages).includes("<script>"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
