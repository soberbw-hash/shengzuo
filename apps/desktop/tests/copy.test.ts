import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rendererRoot = path.join(process.cwd(), "src", "renderer", "src");

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
  });

void test("renderer copy avoids internal jargon and keeps the API settings name exact", () => {
  const source = collectSourceFiles(rendererRoot)
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  const removedPhrases = [
    "已安全保存，留空不会修改",
    "OpenAI 兼容接口",
    "安装收据",
    "环回端口",
    "API 配置",
  ];
  for (const phrase of removedPhrases) {
    assert.equal(source.includes(phrase), false, `界面中不应出现：${phrase}`);
  }
  assert.equal(source.includes('title="API配置"'), true);
  assert.equal(source.includes("已保存；如需更换，请输入新的 API Key"), true);
});
