import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getUserErrorMessage } from "../src/renderer/src/lib/errorMessage";

void test("removes Electron IPC and repeated Error prefixes", () => {
  const error = new Error(
    "Error invoking remote method 'smart:process-text': Error: Error: AI 改动了原稿或没有正确分段，请重试。",
  );

  assert.equal(
    getUserErrorMessage(error, "请稍后重试。"),
    "AI 改动了原稿或没有正确分段，请重试。",
  );
});

void test("uses a nested Error cause when the wrapper has no useful message", () => {
  const error = new Error("Error", {
    cause: new Error("模型文件不完整，请重新下载。"),
  });

  assert.equal(
    getUserErrorMessage(error, "请稍后重试。"),
    "模型文件不完整，请重新下载。",
  );
});

void test("keeps an ordinary Chinese error unchanged", () => {
  assert.equal(
    getUserErrorMessage(new Error("磁盘空间不足，请清理后重试。"), "请重试。"),
    "磁盘空间不足，请清理后重试。",
  );
});

void test("uses the supplied fallback for unknown values", () => {
  assert.equal(
    getUserErrorMessage("network failure", "请检查网络后重试。"),
    "请检查网络后重试。",
  );
  assert.equal(getUserErrorMessage(null, "请稍后重试。"), "请稍后重试。");
  assert.equal(
    getUserErrorMessage(new Error("[object Object]"), "请稍后重试。"),
    "请稍后重试。",
  );
});

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
  });

void test("renderer never sends a caught Error message to the interface directly", () => {
  const rendererRoot = path.join(process.cwd(), "src", "renderer", "src");
  const source = collectSourceFiles(rendererRoot)
    .filter((filePath) => !filePath.endsWith(`${path.sep}errorMessage.ts`))
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /\berror\s*\.\s*message\b/u);
});
