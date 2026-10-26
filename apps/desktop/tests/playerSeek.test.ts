import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlaybackTime,
  keyboardSeekTime,
} from "../src/renderer/src/lib/playerSeek";

void test("player keyboard seeking respects the beginning and end", () => {
  assert.equal(keyboardSeekTime("ArrowLeft", 2, 10), 0);
  assert.equal(keyboardSeekTime("ArrowRight", 8, 10), 10);
  assert.equal(keyboardSeekTime("Home", 8, 10), 0);
  assert.equal(keyboardSeekTime("End", 8, 10), 10);
  assert.equal(keyboardSeekTime("Enter", 8, 10), undefined);
  assert.equal(clampPlaybackTime(-30, 10), 0);
  assert.equal(clampPlaybackTime(Infinity, 10), 0);
});
