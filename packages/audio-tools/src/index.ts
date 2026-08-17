export interface DialogueLine {
  id: string;
  character: string;
  text: string;
  isNarration: boolean;
}

export interface SubtitleTextSegment {
  text: string;
  startTime?: string;
  endTime?: string;
}

export type SubtitleDocumentType = "auto" | "srt" | "txt";

export const splitTextByPunctuation = (input: string): string[] =>
  input
    .replaceAll("\r", "")
    .split(/(?<=[。！？!?；;])\s*|\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

const subtitleTiming =
  /^(?<start>\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(?<end>\d{1,2}:\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$/u;

const cleanSubtitleCue = (value: string): string =>
  value
    .replace(/<[^>]+>/gu, "")
    .replace(/\{\\[^}]+\}/gu, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/gu, " ")
    .trim();

const parseSrt = (input: string): SubtitleTextSegment[] => {
  const lines = input
    .replace(/^\uFEFF/u, "")
    .replaceAll("\r", "")
    .trim()
    .split("\n");
  const result: SubtitleTextSegment[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = subtitleTiming.exec(lines[index]?.trim() ?? "");
    const startTime = match?.groups?.start;
    const endTime = match?.groups?.end;
    if (!startTime || !endTime) continue;
    const cueLines: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index]?.trim() ?? "";
      const nextLine = lines[index + 1]?.trim() ?? "";
      const reachedNextCue =
        subtitleTiming.test(line) ||
        (/^\d+$/u.test(line) && subtitleTiming.test(nextLine));
      if (reachedNextCue) {
        index -= 1;
        break;
      }
      if (!line && cueLines.length > 0) break;
      if (line) cueLines.push(line);
    }
    const text = cleanSubtitleCue(cueLines.join(" "));
    if (text) {
      result.push({
        text,
        startTime: startTime.replace(",", "."),
        endTime: endTime.replace(",", "."),
      });
    }
  }
  return result;
};

export const parseSubtitleDocument = (
  input: string,
  type: SubtitleDocumentType = "auto",
): SubtitleTextSegment[] => {
  const normalized = input.replace(/^\uFEFF/u, "").trim();
  if (!normalized) return [];
  const shouldParseSrt =
    type === "srt" || (type === "auto" && normalized.includes("-->"));
  if (shouldParseSrt) {
    const cues = parseSrt(normalized);
    if (cues.length > 0) return cues;
  }
  return splitTextByPunctuation(normalized).map((text) => ({ text }));
};

export const parseDialogueScript = (input: string): DialogueLine[] =>
  input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = /^(?<character>[^：:]{1,24})[：:]\s*(?<text>.+)$/u.exec(
        line,
      );
      const character = match?.groups?.character?.trim() || "旁白";
      const text = match?.groups?.text?.trim() || line;
      return {
        id: `line-${index + 1}`,
        character,
        text,
        isNarration: character === "旁白",
      };
    });
