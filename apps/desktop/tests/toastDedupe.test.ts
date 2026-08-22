import assert from "node:assert/strict";
import test from "node:test";

import { useStudioStore } from "../src/renderer/src/store/studioStore";

void test("keeps one current result toast per task across retries", () => {
  for (const toast of useStudioStore.getState().toasts) {
    useStudioStore.getState().dismissToast(toast.id);
  }

  const push = useStudioStore.getState().pushToast;
  push({
    title: "第一次失败",
    tone: "danger",
    dedupeKey: "task-failed:task-1:first",
    replaceKey: "task-result:task-1",
  });
  push({
    title: "第一次失败",
    tone: "danger",
    dedupeKey: "task-failed:task-1:first",
    replaceKey: "task-result:task-1",
  });
  assert.equal(useStudioStore.getState().toasts.length, 1);

  push({
    title: "重试后仍失败",
    tone: "danger",
    dedupeKey: "task-failed:task-1:second",
    replaceKey: "task-result:task-1",
  });
  assert.equal(useStudioStore.getState().toasts.length, 1);
  assert.equal(useStudioStore.getState().toasts[0]?.title, "重试后仍失败");

  push({
    title: "已经生成",
    tone: "success",
    dedupeKey: "task-completed:task-1:third",
    replaceKey: "task-result:task-1",
  });
  assert.equal(useStudioStore.getState().toasts.length, 1);
  assert.equal(useStudioStore.getState().toasts[0]?.title, "已经生成");
});
