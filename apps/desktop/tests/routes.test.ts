import assert from "node:assert/strict";
import test from "node:test";

import {
  appRoutes,
  helpRoute,
  primaryRoutes,
  settingsRoute,
  toolRoutes,
} from "../src/renderer/src/routes";

void test("desktop navigation leads with the creator's four core destinations", () => {
  assert.deepEqual(
    [...primaryRoutes, settingsRoute].map((route) => route.label),
    ["开始创作", "我的声音", "项目与记录", "设置"],
  );
});

void test("advanced tools remain available without crowding the main navigation", () => {
  assert.deepEqual(
    toolRoutes.map((route) => route.label),
    ["字幕配音", "多人对话", "本地引擎"],
  );
  assert.equal(helpRoute.label, "使用帮助");
  assert.equal(appRoutes.length, 8);
});
