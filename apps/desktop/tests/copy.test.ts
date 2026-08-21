import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rendererRoot = path.join(process.cwd(), "src", "renderer", "src");
const mainRoot = path.join(process.cwd(), "src", "main");
const repositoryRoot = path.resolve(process.cwd(), "..", "..");

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
    "开始创作",
    "字幕配音",
    "保存并测试",
  ];
  for (const phrase of removedPhrases) {
    assert.equal(source.includes(phrase), false, `界面中不应出现：${phrase}`);
  }
  assert.equal(source.includes('title="API配置"'), true);
  assert.equal(source.includes("已保存；如需更换，请输入新的 API Key"), true);
});

void test("main process messages do not leak model internals into the interface", () => {
  const source = collectSourceFiles(mainRoot)
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  const removedPhrases = [
    "本地引擎",
    "正在准备独立 Python",
    "Python 安装包 SHA-256",
    "本地 FFmpeg 已安装",
    "模型进程意外中断",
  ];
  for (const phrase of removedPhrases) {
    assert.equal(
      source.includes(phrase),
      false,
      `用户消息中不应出现：${phrase}`,
    );
  }
});

void test("public guides use the same workflow names as the application", () => {
  const publicFiles = [
    "README.md",
    "SUPPORT.md",
    path.join("scripts", "create-share-package.ps1"),
    path.join("scripts", "create-complete-package-with-models.ps1"),
  ];
  const source = publicFiles
    .map((filePath) =>
      readFileSync(path.join(repositoryRoot, filePath), "utf8"),
    )
    .join("\n");
  for (const phrase of ["“开始创作”", "“字幕配音”", "“本地引擎”"]) {
    assert.equal(
      source.includes(phrase),
      false,
      `公开说明中不应出现：${phrase}`,
    );
  }
});

void test("portable launcher rejects an incomplete extraction before Windows does", () => {
  const script = readFileSync(
    path.join(repositoryRoot, "scripts", "create-share-package.ps1"),
    "utf8",
  );
  assert.equal(script.includes("EXPECTED_ELECTRON_BYTES"), true);
  assert.equal(script.includes("EXPECTED_ELECTRON_SHA256"), true);
  assert.equal(script.includes('if not "%%~zF"'), true);
  assert.equal(script.includes("程序文件没有完整解压"), true);
  assert.equal(script.includes("等待解压进度完全结束"), true);
  assert.equal(script.includes("if errorlevel 1 goto launch_failed"), true);
  assert.equal(script.includes("Windows 未能启动声作"), true);
});
