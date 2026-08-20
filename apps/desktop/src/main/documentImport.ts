import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ImportedTextDocument } from "@ai-voice-studio/shared-types";

const execFileAsync = promisify(execFile);
const maxDocumentBytes = 20 * 1024 * 1024;
const maxTextLength = 50_000;
const textExtensions = new Set([".txt", ".srt", ".md", ".markdown", ".csv"]);

const decodeXml = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);/giu, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

const normalizeImportedText = (value: string): string =>
  value
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

const ensureUsableText = (value: string): string => {
  const text = normalizeImportedText(value);
  if (!text) throw new Error("文件里没有可读取的文字。");
  if (text.length > maxTextLength) {
    throw new Error("文稿超过 50,000 字，请拆成几个文件后再导入。");
  }
  return text;
};

const listArchiveEntries = async (filePath: string): Promise<string[]> => {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("tar", ["-tf", filePath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }));
  } catch {
    throw new Error("这个 Office 文件无法读取，请确认文件没有损坏。");
  }
  const entries = stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim().replaceAll("\\", "/"))
    .filter(Boolean);
  if (
    entries.some(
      (entry) =>
        entry.startsWith("/") ||
        /^[a-z]:/iu.test(entry) ||
        entry.split("/").includes(".."),
    )
  ) {
    throw new Error("这个 Office 文件包含不安全的路径，已停止读取。");
  }
  return entries;
};

const archiveText = async (
  filePath: string,
  entry: string,
): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("tar", ["-xOf", filePath, entry], {
      encoding: "utf8",
      maxBuffer: 24 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch {
    throw new Error("这个 Office 文件缺少正文内容，可能已经损坏。");
  }
};

const readDocx = async (filePath: string): Promise<string> => {
  const entries = await listArchiveEntries(filePath);
  if (!entries.includes("word/document.xml")) {
    throw new Error("没有在这个 Word 文件里找到正文。");
  }
  const xml = await archiveText(filePath, "word/document.xml");
  return ensureUsableText(
    decodeXml(
      xml
        .replace(/<w:tab\b[^>]*\/?\s*>/giu, "\t")
        .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/giu, "\n")
        .replace(/<\/w:p>/giu, "\n")
        .replace(/<[^>]+>/gu, ""),
    ),
  );
};

const textNodes = (xml: string): string =>
  [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/giu)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");

const columnNumber = (reference: string): number => {
  const letters = reference.match(/^[A-Z]+/iu)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
};

const readXlsx = async (filePath: string): Promise<string> => {
  const entries = await listArchiveEntries(filePath);
  const sheetEntries = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
  if (!sheetEntries.length) {
    throw new Error("没有在这个 Excel 文件里找到工作表。");
  }
  const sharedEntry = entries.find((entry) => entry === "xl/sharedStrings.xml");
  const sharedStrings = sharedEntry
    ? [
        ...(await archiveText(filePath, sharedEntry)).matchAll(
          /<si\b[^>]*>([\s\S]*?)<\/si>/giu,
        ),
      ].map((match) => textNodes(match[1] ?? ""))
    : [];
  const sheets: string[] = [];
  for (const [sheetIndex, entry] of sheetEntries.entries()) {
    const xml = await archiveText(filePath, entry);
    const rows: string[] = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/giu)) {
      const cells: string[] = [];
      for (const cellMatch of (rowMatch[1] ?? "").matchAll(
        /<c\b([^>]*)>([\s\S]*?)<\/c>/giu,
      )) {
        const attributes = cellMatch[1] ?? "";
        const body = cellMatch[2] ?? "";
        const reference = /\br="([A-Z]+\d+)"/iu.exec(attributes)?.[1] ?? "A1";
        const type = /\bt="([^"]+)"/iu.exec(attributes)?.[1] ?? "";
        const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/iu.exec(body)?.[1] ?? "";
        let value = "";
        if (type === "s") {
          value = sharedStrings[Number.parseInt(rawValue, 10)] ?? "";
        } else if (type === "inlineStr") {
          value = textNodes(body);
        } else {
          value = decodeXml(rawValue);
        }
        const index = Math.min(columnNumber(reference), 100) - 1;
        while (cells.length < index) cells.push("");
        cells[index] = value.trim();
      }
      const row = cells.join("\t").replace(/\t+$/u, "").trim();
      if (row) rows.push(row);
    }
    if (rows.length) {
      sheets.push(
        sheetEntries.length > 1
          ? `【工作表 ${sheetIndex + 1}】\n${rows.join("\n")}`
          : rows.join("\n"),
      );
    }
  }
  return ensureUsableText(sheets.join("\n\n"));
};

export const importedDocumentExtensions = [
  "txt",
  "srt",
  "md",
  "markdown",
  "csv",
  "docx",
  "xlsx",
] as const;

export const readImportedDocument = async (
  filePath: string,
): Promise<ImportedTextDocument> => {
  if (!path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("没有读取到这个文件，请重新选择。");
  }
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size === 0) {
    throw new Error("这个文件不存在或内容为空。");
  }
  if (fileStat.size > maxDocumentBytes) {
    throw new Error("文件超过 20 MB，请拆成较小的文稿后再导入。");
  }
  const extension = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (textExtensions.has(extension)) {
    const raw = await readFile(filePath, "utf8");
    return {
      name,
      kind: "text",
      text: ensureUsableText(raw),
    };
  }
  if (extension === ".docx") {
    return { name, kind: "word", text: await readDocx(filePath) };
  }
  if (extension === ".xlsx") {
    return { name, kind: "excel", text: await readXlsx(filePath) };
  }
  if (extension === ".doc" || extension === ".xls") {
    throw new Error("旧版 DOC/XLS 暂不支持，请在 Office 中另存为 DOCX/XLSX。");
  }
  throw new Error("请选择 TXT、SRT、MD、CSV、DOCX 或 XLSX 文件。");
};
