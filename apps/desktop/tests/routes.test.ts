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
    ["开始创作", "字幕配音", "多人对话", "我的声音", "项目与记录", "设置"],
  );
});

void test("model management stays visible without downgrading creation tools", () => {
  assert.deepEqual(
    toolRoutes.map((route) => route.label),
    ["本地引擎"],
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
