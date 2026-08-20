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

export interface TextReplacementRule {
  source: string;
  replacement: string;
  enabled?: boolean;
  /** 旧规则未保存此字段时按“改读音”处理。 */
  action?: "replace" | "skip";
}

const activeTextReplacementRules = (
  rules: readonly TextReplacementRule[],
): TextReplacementRule[] =>
  [...rules]
    .filter((rule) => {
      const action = rule.action ?? "replace";
      return (
        rule.enabled !== false &&
        rule.source.trim().length > 0 &&
        (action === "skip" ||
          (action === "replace" && rule.replacement.trim().length > 0))
      );
    })
    .sort((left, right) => right.source.length - left.source.length);

/** Applies literal, longest-first pronunciation replacements. */
export const applyTextReplacementRules = (
  input: string,
  rules: readonly TextReplacementRule[] = [],
): string => {
  const active = activeTextReplacementRules(rules);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const matched = active.find((rule) =>
      input.startsWith(rule.source, cursor),
    );
    if (matched) {
      result +=
        (matched.action ?? "replace") === "skip" ? "" : matched.replacement;
      cursor += matched.source.length;
    } else {
      result += input[cursor] ?? "";
      cursor += 1;
    }
  }
  return result;
};

/** Builds a spoken preview and its matching end offset in the original text. */
export const createTextReplacementPreview = (
  input: string,
  rules: readonly TextReplacementRule[] = [],
  meaningfulLimit = 30,
): { text: string; sourceEnd: number } => {
  if (!Number.isInteger(meaningfulLimit) || meaningfulLimit < 1) {
    return { text: "", sourceEnd: 0 };
  }
  const active = activeTextReplacementRules(rules);
  let text = "";
  let meaningfulCount = 0;
  let sourceEnd = 0;
  const append = (value: string): boolean => {
    for (const character of value) {
      text += character;
      if (!/\s/u.test(character)) meaningfulCount += 1;
      if (meaningfulCount >= meaningfulLimit) return false;
    }
    return true;
  };

  while (sourceEnd < input.length && meaningfulCount < meaningfulLimit) {
    const matched = active.find((rule) =>
      input.startsWith(rule.source, sourceEnd),
    );
    if (matched) {
      sourceEnd += matched.source.length;
      if (
        (matched.action ?? "replace") !== "skip" &&
        !append(matched.replacement)
      ) {
        break;
      }
      continue;
    }
    const codePoint = input.codePointAt(sourceEnd);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    sourceEnd += character.length;
    if (!append(character)) break;
  }
  return { text: text.trim(), sourceEnd };
};

export const speechPauseAfter = (text: string, basePauseMs = 80): number => {
  const trimmed = text.trimEnd();
  if (/[…—]{2,}$/u.test(trimmed)) return Math.max(basePauseMs, 260);
  if (/[。！？!?；;]$/u.test(trimmed)) return Math.max(basePauseMs, 180);
  if (/[，,、：:]$/u.test(trimmed)) return Math.max(basePauseMs, 100);
  return basePauseMs;
};

export const splitTextByPunctuation = (input: string): string[] =>
  input
    .replaceAll("\r", "")
    .split(/(?<=[。！？!?；;])\s*|\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

const meaningfulLength = (input: string): number =>
  Array.from(input.replace(/\s/gu, "")).length;

const hardSplitSpeechText = (input: string, limit: number): string[] => {
  const parts: string[] = [];
  let current = "";
  let count = 0;
  for (const character of input) {
    const characterCount = /\s/u.test(character) ? 0 : 1;
    if (current && count + characterCount > limit) {
      parts.push(current.trim());
      current = "";
      count = 0;
    }
    current += character;
    count += characterCount;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

/**
 * Keeps short scripts intact, while breaking long speech into bounded chunks.
 * Punctuation stays attached to its clause so joining the chunks never drops
 * any spoken character from the source text.
 */
export const splitTextForSpeech = (
  input: string,
  maxMeaningfulCharacters = 160,
): string[] => {
  if (
    !Number.isInteger(maxMeaningfulCharacters) ||
    maxMeaningfulCharacters < 20
  ) {
    throw new RangeError(
      "maxMeaningfulCharacters must be an integer of at least 20",
    );
  }
  const normalized = input.replaceAll("\r", "").replace(/\s+/gu, " ").trim();
  if (!normalized) return [];
  if (meaningfulLength(normalized) <= maxMeaningfulCharacters) {
    return [normalized];
  }

  const clauses = splitTextByPunctuation(input).flatMap((sentence) => {
    if (meaningfulLength(sentence) <= maxMeaningfulCharacters)
      return [sentence];
    return sentence
      .split(/(?<=[，,、：:])\s*/u)
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) =>
        meaningfulLength(part) <= maxMeaningfulCharacters
          ? [part]
          : hardSplitSpeechText(part, maxMeaningfulCharacters),
      );
  });

  const chunks: string[] = [];
  let current = "";
  for (const clause of clauses) {
    const candidate = current ? `${current} ${clause}` : clause;
    if (current && meaningfulLength(candidate) > maxMeaningfulCharacters) {
      chunks.push(current);
      current = clause;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

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
    .flatMap((line, index) => {
      const match = /^(?<character>[^：:]{1,24})[：:]\s*(?<text>.+)$/u.exec(
        line,
      );
      const character = match?.groups?.character?.trim();
      const text = match?.groups?.text?.trim();
      return character && text
        ? [
            {
              id: `line-${index + 1}`,
              character,
              text,
              isNarration: character === "旁白",
            },
          ]
        : [];
    });
