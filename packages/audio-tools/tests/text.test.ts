import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDialogueScript,
  parseSubtitleDocument,
  splitTextByPunctuation,
} from "../src/index";

void test("splits mixed Chinese punctuation into stable segments", () => {
  assert.deepEqual(
    splitTextByPunctuation("你好！欢迎使用 AI Voice Studio。Let's begin?"),
    ["你好！", "欢迎使用 AI Voice Studio。", "Let's begin?"],
  );
});

void test("splits plain text on punctuation and line breaks", () => {
  assert.deepEqual(splitTextByPunctuation("第一行没有句号\n第二行。第三句！"), [
    "第一行没有句号",
    "第二行。",
    "第三句！",
  ]);
});

void test("parses SRT cues without losing cue boundaries or timestamps", () => {
  assert.deepEqual(
    parseSubtitleDocument(
      "1\n00:00:01,200 --> 00:00:03,400\n<i>第一条字幕</i>\n第二行\n\n2\n00:00:04,000 --> 00:00:06,500\n第二条字幕。",
      "srt",
    ),
    [
      {
        text: "第一条字幕 第二行",
        startTime: "00:00:01.200",
        endTime: "00:00:03.400",
      },
      {
        text: "第二条字幕。",
        startTime: "00:00:04.000",
        endTime: "00:00:06.500",
      },
    ],
  );
});

void test("falls back to plain text when pasted content is not valid SRT", () => {
  assert.deepEqual(parseSubtitleDocument("这不是 --> 时间码。", "auto"), [
    { text: "这不是 --> 时间码。" },
  ]);
});

void test("parses SRT cues even when blank separators are missing", () => {
  assert.deepEqual(
    parseSubtitleDocument(
      "1\n00:00:00,000 --> 00:00:01,000\n第一句\n2\n00:00:01,000 --> 00:00:02,000\n第二句",
      "srt",
    ).map((segment) => segment.text),
    ["第一句", "第二句"],
  );
});

void test("parses character lines and falls back to narration", () => {
  const lines = parseDialogueScript("林舟：我们开始吧。\n镜头缓缓推进。");
  assert.equal(lines[0]?.character, "林舟");
  assert.equal(lines[1]?.character, "旁白");
  assert.equal(lines[1]?.isNarration, true);
});
