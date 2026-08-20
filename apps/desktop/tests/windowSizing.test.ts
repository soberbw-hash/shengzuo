import assert from "node:assert/strict";
import test from "node:test";

import { getMainWindowSizing } from "../src/main/windowSizing";

void test("the main window opens larger on a standard 1080p work area", () => {
  assert.deepEqual(getMainWindowSizing({ width: 1920, height: 1040 }), {
    width: 1840,
    height: 1024,
    minWidth: 1280,
    minHeight: 720,
  });
});

void test("the main window fits scaled or smaller displays without hiding behind the taskbar", () => {
  assert.deepEqual(getMainWindowSizing({ width: 1536, height: 824 }), {
    width: 1520,
    height: 808,
    minWidth: 1280,
    minHeight: 720,
  });
  assert.deepEqual(getMainWindowSizing({ width: 1200, height: 680 }), {
    width: 1184,
    height: 664,
    minWidth: 1184,
    minHeight: 664,
  });
});
