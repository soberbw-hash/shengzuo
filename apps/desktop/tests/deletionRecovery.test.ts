import assert from "node:assert/strict";
import test from "node:test";
import { restoreDeletedItem } from "../src/renderer/src/lib/deletionRecovery";
import { pauseOtherAudio } from "../src/renderer/src/lib/audioFocus";

void test("undo restores the original position without overwriting surviving edits", () => {
  const removed = { id: "b", text: "保留原句和角色" };
  assert.deepEqual(
    restoreDeletedItem(
      [
        { id: "a", text: "已经编辑" },
        { id: "c", text: "第三句" },
      ],
      { item: removed, index: 1 },
      200,
    ),
    [{ id: "a", text: "已经编辑" }, removed, { id: "c", text: "第三句" }],
  );
});
void test("undo replaces only the untouched dialogue placeholder", () => {
  const item = { id: "old", text: "最后一句" };
  const replacement = { id: "empty", text: "" };
  assert.deepEqual(
    restoreDeletedItem([replacement], { item, replacement, index: 0 }, 200),
    [item],
  );
  const edited = { ...replacement, text: "新输入的句子" };
  assert.deepEqual(
    restoreDeletedItem([edited], { item, replacement, index: 0 }, 200),
    [item, edited],
  );
});
void test("undo never duplicates IDs or exceeds the list limit", () => {
  const item = { id: "same" };
  const original = [item];
  assert.equal(restoreDeletedItem(original, { item, index: 0 }, 200), original);
  assert.equal(
    restoreDeletedItem(original, { item: { id: "different" }, index: 0 }, 1),
    original,
  );
});
void test("starting one preview stops other active audio, not the chosen or already paused audio", () => {
  const active = {
    paused: false,
    pause: () => assert.fail("active audio must keep playing"),
  };
  let stopped = false;
  const other = {
    paused: false,
    pause: () => {
      stopped = true;
    },
  };
  const idle = {
    paused: true,
    pause: () => assert.fail("idle audio needs no pause"),
  };
  pauseOtherAudio(active, [active, other, idle]);
  assert.ok(stopped);
});
