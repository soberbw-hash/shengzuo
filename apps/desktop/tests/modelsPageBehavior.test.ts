import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/renderer/src/pages/ModelsPage.tsx", import.meta.url),
  "utf8",
);

void test("model page keeps successful initialization data when one request fails", () => {
  assert.match(source, /Promise\.allSettled\(/u);
  assert.match(
    source,
    /setStorage\(\(current\) => \(\{ \.\.\.current, \.\.\.storageUpdates \}\)\)/u,
  );
  assert.match(source, /部分模型信息没有刷新/u);
  assert.match(source, /空间信息暂时没有读到/u);
});

void test("model management actions do not silently change the creation model", () => {
  const actionStart = source.indexOf("const actionFor = async");
  const actionEnd = source.indexOf("\n  return (", actionStart);
  const actionSource = source.slice(actionStart, actionEnd);
  const selectionCalls =
    actionSource.match(/setSelectedModel\(modelId\);/gu) ?? [];

  assert.equal(selectionCalls.length, 1);
  assert.match(
    actionSource,
    /else if \(isExplicitModelUseStatus\(status\)\)[\s\S]*setSelectedModel\(modelId\);/u,
  );
  assert.match(source, /return \{ label: "下载", icon: Download \};/u);
  assert.doesNotMatch(source, /下载并使用/u);
});
