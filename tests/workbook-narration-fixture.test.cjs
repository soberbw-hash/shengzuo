const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { strToU8, zipSync } = require(
  require.resolve("fflate", {
    paths: [path.join(__dirname, "..", "apps", "desktop")],
  }),
);
const readNarration = require("./workbook-narration-fixture.cjs");

test("long-form fixture preserves all paragraphs inside a narration cell", () => {
  const bytes = zipSync({
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData><row><c r="B1"><v>1</v></c><c r="E1"/><c r="F1" t="inlineStr"><is><t>第一段\n第二段也必须读出 &amp; 结尾。</t></is></c></row></sheetData></worksheet>',
    ),
  });
  assert.deepEqual(readNarration(bytes, 5), [
    "第一段\n第二段也必须读出 & 结尾。",
  ]);
});
test("shared-string fixture keeps rich text and skips unnumbered production notes", () => {
  const bytes = zipSync({
    "xl/sharedStrings.xml": strToU8(
      "<sst><si><r><t>旁白第一行\n</t></r><r><t>完整第二行</t></r></si></sst>",
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData><row><c r="B1"><v>1</v></c><c r="F1" t="s"><v>0</v></c></row><row><c r="F2" t="inlineStr"><is><t>摄制说明不参与朗读</t></is></c></row></sheetData></worksheet>',
    ),
  });
  assert.deepEqual(readNarration(bytes, 5), ["旁白第一行\n完整第二行"]);
});
