import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultProjectTitle,
  createDefaultVoiceName,
  isAutomaticTimeTitle,
  resolveProjectTitle,
  resolveResultTitle,
} from "../src/renderer/src/lib/projectNaming";

void test("default project title includes local date and time down to seconds", () => {
  assert.equal(
    createDefaultProjectTitle(new Date(2026, 7, 20, 9, 5, 7)),
    "2026-08-20 09:05:07",
  );
});

void test("legacy date-only projects gain their original creation time", () => {
  assert.equal(
    resolveProjectTitle("2026-08-20", "2026-08-20T01:05:07"),
    "2026-08-20 01:05:07",
  );
  assert.equal(
    resolveProjectTitle("产品介绍", "2026-08-20T01:05:07"),
    "产品介绍",
  );
  assert.equal(
    resolveProjectTitle("2026-08-19", "2026-08-20T01:05:07"),
    "2026-08-19",
  );
  assert.equal(resolveProjectTitle("2026-08-20", "not-a-date"), "2026-08-20");
});

void test("automatic recording titles use each result's own time", () => {
  assert.equal(
    resolveResultTitle(
      "2026-08-20 09:05:07",
      "2026-08-20",
      "2026-08-20T10:11:12",
      "单段配音",
    ),
    "2026-08-20 10:11:12",
  );
  assert.equal(
    resolveResultTitle("产品介绍", "旧标题", "2026-08-20T10:11:12", "单段配音"),
    "产品介绍",
  );
  assert.equal(
    resolveResultTitle(undefined, undefined, "2026-08-20T10:11:12", "单段配音"),
    "2026-08-20 10:11:12",
  );
  assert.equal(
    resolveResultTitle("2026-08-20", undefined, "not-a-date", "单段配音"),
    "2026-08-20",
  );
  assert.equal(
    resolveResultTitle(undefined, undefined, "not-a-date", "单段配音"),
    "单段配音",
  );
});

void test("default voice names include the current local date and time", () => {
  assert.equal(
    createDefaultVoiceName(new Date(2026, 7, 20, 9, 5, 7)),
    "声音 2026-08-20 09:05:07",
  );
});

void test("automatic timestamp titles are recognized for tidy export names", () => {
  assert.equal(isAutomaticTimeTitle("2026-08-20"), true);
  assert.equal(isAutomaticTimeTitle("2026-08-20 22:11:09"), true);
  assert.equal(isAutomaticTimeTitle("新品介绍 2026-08-20"), false);
});
