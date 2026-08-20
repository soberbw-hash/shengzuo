import assert from "node:assert/strict";
import test from "node:test";

import {
  appRoutes,
  primaryRoutes,
  settingsRoute,
  toolRoutes,
} from "../src/renderer/src/routes";

void test("desktop navigation leads with the creator's core workflows", () => {
  assert.deepEqual(
    [...primaryRoutes, settingsRoute].map((route) => route.label),
    ["单段配音", "长稿配音", "多人对话", "我的声音", "项目与记录", "设置"],
  );
  assert.deepEqual(
    primaryRoutes.slice(0, 3).map(({ label, caption }) => [label, caption]),
    [
      ["单段配音", "一段文字 · 一个声音"],
      ["长稿配音", "整篇文稿 · 逐句调整"],
      ["多人对话", "多个角色 · 分配声音"],
    ],
  );
  assert.deepEqual(
    primaryRoutes.map((route) => route.area),
    ["create", "create", "create", "library", "library"],
  );
});

void test("model management stays visible without downgrading creation tools", () => {
  assert.deepEqual(
    toolRoutes.map(({ label, caption }) => [label, caption]),
    [["本地模型", "下载与管理"]],
  );
  assert.equal(appRoutes.length, 7);
  assert.equal(
    appRoutes.some((route) => route.path === "/help"),
    false,
  );
});

void test("the feature registry has unique routable entries", () => {
  assert.equal(
    new Set(appRoutes.map((route) => route.path)).size,
    appRoutes.length,
  );
  assert.equal(
    new Set(appRoutes.map((route) => route.id)).size,
    appRoutes.length,
  );
  assert.ok(appRoutes.every((route) => route.area.length > 0));
});
