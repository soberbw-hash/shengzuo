import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTextReplacementRules,
  createTextReplacementPreview,
  parseDialogueScript,
  parseSubtitleDocument,
  speechPauseAfter,
  splitTextByPunctuation,
  splitTextForSpeech,
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

void test("keeps a short speech in one natural chunk", () => {
  assert.deepEqual(splitTextForSpeech("大家好，我是小林。今天开始录音。"), [
    "大家好，我是小林。今天开始录音。",
  ]);
});

void test("splits long speech without dropping or reordering characters", () => {
  const source = `${"第一句很长，".repeat(24)}最后一句。\n${"第二段内容！".repeat(12)}`;
  const chunks = splitTextForSpeech(source, 60);
  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every((chunk) => Array.from(chunk.replace(/\s/gu, "")).length <= 60),
  );
  assert.equal(chunks.join("").replace(/\s/gu, ""), source.replace(/\s/gu, ""));
});

void test("hard-splits a long sentence without punctuation", () => {
  const source = "长".repeat(145);
  const chunks = splitTextForSpeech(source, 60);
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [49, 48, 48],
  );
  assert.equal(chunks.join(""), source);
});

void test("rebalances a tiny hard-split tail instead of generating it alone", () => {
  const source = "甲".repeat(56);
  const chunks = splitTextForSpeech(source, 52);

  assert.deepEqual(
    chunks.map((chunk) => Array.from(chunk.replace(/\s/gu, "")).length),
    [28, 28],
  );
  assert.equal(chunks.join("").replace(/\s/gu, ""), source);
});

void test("rebalances a short final sentence without losing mixed text", () => {
  const source = `${"长稿内容DXP480T".repeat(5)}。结束。`;
  const chunks = splitTextForSpeech(source, 52);
  const lengths = chunks.map(
    (chunk) => Array.from(chunk.replace(/\s/gu, "")).length,
  );

  assert.ok(lengths.every((length) => length <= 52));
  assert.ok(lengths.every((length) => length >= 20));
  assert.equal(chunks.join("").replace(/\s/gu, ""), source);
});

void test("pronunciation replacements are literal and longest-first", () => {
  assert.equal(
    applyTextReplacementRules("AI助手和A助手", [
      { source: "A", replacement: "诶" },
      { source: "AI", replacement: "A I" },
    ]),
    "A I助手和诶助手",
  );
  assert.equal(
    applyTextReplacementRules("C++", [
      { source: "C++", replacement: "C plus plus" },
    ]),
    "C plus plus",
  );
});

void test("skip rules remove literal text and stay longest-first", () => {
  assert.equal(
    applyTextReplacementRules("【旁白】旁白：AI助手。", [
      { source: "旁白", replacement: "", action: "skip" },
      { source: "【旁白】", replacement: "", action: "skip" },
      { source: "AI", replacement: "A I", action: "replace" },
    ]),
    "：A I助手。",
  );
});

void test("skip and replace rules can be mixed without applying disabled rules", () => {
  assert.equal(
    applyTextReplacementRules("保留【音效】删除【画面】和AI", [
      {
        source: "【音效】",
        replacement: "",
        action: "skip",
        enabled: false,
      },
      { source: "【画面】", replacement: "", action: "skip" },
      { source: "AI", replacement: "人工智能" },
      { source: "删除", replacement: "", action: "replace" },
    ]),
    "保留【音效】删除和人工智能",
  );
});

void test("skip rules may remove all matched content", () => {
  assert.equal(
    applyTextReplacementRules("【不朗读】", [
      { source: "【不朗读】", replacement: "", action: "skip" },
    ]),
    "",
  );
});

void test("spoken preview maps skipped and replaced text to the original range", () => {
  assert.deepEqual(
    createTextReplacementPreview(
      "（片头）AI助手继续",
      [
        { source: "（片头）", replacement: "", action: "skip" },
        { source: "AI", replacement: "A I" },
      ],
      4,
    ),
    { text: "A I助手", sourceEnd: 8 },
  );
  assert.deepEqual(createTextReplacementPreview("文字", [], 0), {
    text: "",
    sourceEnd: 0,
  });
});

void test("semantic pauses follow punctuation without becoming excessive", () => {
  assert.equal(speechPauseAfter("第一句。", 80), 180);
  assert.equal(speechPauseAfter("还有，", 80), 100);
  assert.equal(speechPauseAfter("继续", 80), 80);
  assert.equal(speechPauseAfter("等等……", 80), 260);
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

void test("parses formatted character lines and ignores unformatted descriptions", () => {
  const lines = parseDialogueScript("林舟：我们开始吧。\n镜头缓缓推进。");
  assert.equal(lines[0]?.character, "林舟");
  assert.equal(lines.length, 1);
});

void test("keeps custom names when a dialogue has more than four roles", () => {
  const source = ["旁白", "林舟", "阿宁", "老周", "小雨", "店长"]
    .map((role, index) => `${role}：这是第 ${index + 1} 句。`)
    .join("\n");
  const lines = parseDialogueScript(source);
  assert.deepEqual(
    lines.map((line) => line.character),
    ["旁白", "林舟", "阿宁", "老周", "小雨", "店长"],
  );
});
