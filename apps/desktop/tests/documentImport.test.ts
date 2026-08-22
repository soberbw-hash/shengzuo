import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import { readImportedDocument } from "../src/main/documentImport";

const createOfficeArchive = async (
  root: string,
  extension: "docx" | "xlsx",
  files: Array<{ name: string; content: string }>,
): Promise<string> => {
  const officePath = path.join(root, `文稿.${extension}`);
  await writeFile(
    officePath,
    zipSync(
      Object.fromEntries(
        files.map((file) => [file.name, strToU8(file.content)]),
      ),
    ),
  );
  return officePath;
};

void test("imports text from Word DOCX documents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-docx-"));
  try {
    const filePath = await createOfficeArchive(root, "docx", [
      {
        name: "word/document.xml",
        content:
          '<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>第一段台词</w:t></w:r></w:p><w:p><w:r><w:t>第二段&amp;内容</w:t></w:r></w:p></w:body></w:document>',
      },
    ]);
    const result = await readImportedDocument(filePath);
    assert.equal(result.kind, "word");
    assert.equal(result.text, "第一段台词\n第二段&内容");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("imports rows and shared strings from Excel XLSX documents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-xlsx-"));
  try {
    const filePath = await createOfficeArchive(root, "xlsx", [
      {
        name: "xl/sharedStrings.xml",
        content:
          '<sst xmlns="sheet"><si><t>角色</t></si><si><t>台词</t></si><si><t>旁白</t></si><si><t>故事开始了</t></si></sst>',
      },
      {
        name: "xl/worksheets/sheet1.xml",
        content:
          '<worksheet xmlns="sheet"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>',
      },
    ]);
    const result = await readImportedDocument(filePath);
    assert.equal(result.kind, "excel");
    assert.equal(result.text, "角色\t台词\n旁白\t故事开始了");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("keeps dialogue cells after self-closing empty Excel cells", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-xlsx-empty-"));
  try {
    const filePath = await createOfficeArchive(root, "xlsx", [
      {
        name: "xl/sharedStrings.xml",
        content:
          '<sst xmlns="sheet"><si><t>壹</t></si><si><t>第一句台词</t></si></sst>',
      },
      {
        name: "xl/worksheets/sheet1.xml",
        content:
          '<worksheet xmlns="sheet"><sheetData><row r="4"><c r="A4" t="s"><v>0</v></c><c r="B4"><v>1</v></c><c r="C4"/><c r="D4"/><c r="E4"/><c r="F4" t="s"><v>1</v></c></row></sheetData></worksheet>',
      },
    ]);
    const result = await readImportedDocument(filePath);
    assert.equal(result.text, "壹\t1\t\t\t\t第一句台词");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("rejects unsafe paths inside Office documents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-unsafe-docx-"));
  try {
    const filePath = await createOfficeArchive(root, "docx", [
      {
        name: "word/document.xml",
        content: "<w:document><w:p><w:t>安全正文</w:t></w:p></w:document>",
      },
      {
        name: "../outside.xml",
        content: "不应读取",
      },
    ]);
    await assert.rejects(readImportedDocument(filePath), /包含不安全的路径/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("rejects highly compressed oversized Office entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-large-docx-"));
  try {
    const filePath = path.join(root, "超大文稿.docx");
    await writeFile(
      filePath,
      zipSync({
        "word/document.xml": new Uint8Array(24 * 1024 * 1024 + 1).fill(65),
      }),
    );
    await assert.rejects(readImportedDocument(filePath), /内容过大/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
