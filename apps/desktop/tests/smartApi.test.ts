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
      apiKeyStatus: "ready",
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

void test("an unreadable saved API key is reported instead of pretending to be ready", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-smart-key-"));
  const filePath = path.join(root, "smart-api.json");
  try {
    const store = new SmartApiStore(filePath, protector);
    await store.update({
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "private-test-key",
    });
    const unreadableStore = new SmartApiStore(filePath, {
      ...protector,
      unprotect: () => {
        throw new Error("wrong Windows encryption context");
      },
    });
    assert.deepEqual(await unreadableStore.getConfig(), {
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      hasApiKey: false,
      apiKeyStatus: "unreadable",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("smart performance markers preserve the script and filter model controls", async () => {
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
                    summary: "原稿未修改，整理了停顿和表演提示。",
                    annotations: [
                      {
                        id: "S001",
                        pauseAfterMs: 260,
                        mood: "温暖",
                        expression: "语气温和自然，速度平缓",
                      },
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
    });
    const indexResult = await service.processText({
      action: "performance",
      text: "大家好今天开始测试",
      modelId: "indextts2-5",
      language: "zh",
    });
    assert.equal(indexResult.segments[0]?.text, "大家好今天开始测试");
    assert.equal(indexResult.segments[0]?.mood, "温暖");
    assert.equal(indexResult.segments[0]?.emotion, "温暖");
    assert.equal(indexResult.segments[0]?.expression, undefined);
    const cosyResult = await service.processText({
      action: "performance",
      text: "大家好今天开始测试",
      modelId: "fun-cosyvoice3-0.5b",
      language: "zh",
    });
    assert.equal(cosyResult.segments[0]?.emotion, undefined);
    assert.equal(cosyResult.segments[0]?.expression, "语气温和自然，速度平缓");
    assert.equal(calls[0]?.url, "https://api.example.com/v1/chat/completions");
    assert.equal(calls[0]?.authorization, "Bearer private-test-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("DeepSeek requests disable thinking mode for fast, stable JSON work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-deepseek-api-"));
  try {
    const store = new SmartApiStore(path.join(root, "config.json"), protector);
    await store.update({
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "private-test-key",
    });
    let requestBody: Record<string, unknown> | undefined;
    const service = new SmartApiService(store, (_input, init) => {
      const body = init?.body;
      if (typeof body !== "string") {
        throw new Error("expected a JSON request body");
      }
      requestBody = JSON.parse(body) as Record<string, unknown>;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "连接成功" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    await service.testConnection();
    assert.deepEqual(requestBody?.thinking, { type: "disabled" });
    assert.equal(requestBody?.model, "deepseek-v4-flash");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("DeepSeek balance errors are not misreported as missing configuration", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "shengzuo-deepseek-balance-"),
  );
  try {
    const store = new SmartApiStore(path.join(root, "config.json"), protector);
    await store.update({
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "private-test-key",
    });
    const service = new SmartApiService(store, () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { message: "Insufficient Balance" } }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await assert.rejects(
      () => service.testConnection(),
      /API 账户余额不足，请充值后重试。/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("smart performance markers always keep the locally split script", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "shengzuo-smart-integrity-"),
  );
  try {
    const store = new SmartApiStore(path.join(root, "config.json"), protector);
    await store.update({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "voice-editor",
      apiKey: "private-test-key",
    });
    const service = new SmartApiService(store, () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "错误地改写了原稿。",
                    segments: [
                      {
                        id: "S001",
                        text: "大家好，今天开始正式测试。",
                        pauseAfterMs: 260,
                        mood: "自然",
                        expression: "自然表达",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await service.processText({
      action: "performance",
      text: "大家好，今天开始测试。",
      modelId: "indextts2-5",
      language: "zh",
    });
    assert.equal(result.segments[0]?.text, "大家好，今天开始测试。");
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
