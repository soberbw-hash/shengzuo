import { applyTextReplacementRules } from "@ai-voice-studio/audio-tools";
import type { PronunciationRule } from "@ai-voice-studio/shared-types";

export const hasSpeakableText = (value: string): boolean =>
  /[\p{L}\p{N}]/u.test(value);

export const prepareReadingText = (
  text: string,
  rules: readonly PronunciationRule[] = [],
): string => applyTextReplacementRules(text, rules);

export const prepareReadingSegments = <T extends { text: string }>(
  segments: readonly T[],
  rules: readonly PronunciationRule[] = [],
): { segments: T[]; skippedCount: number } => {
  const prepared = segments
    .map((segment) => ({
      ...segment,
      text: prepareReadingText(segment.text, rules),
    }))
    .filter((segment) => hasSpeakableText(segment.text));
  return {
    segments: prepared,
    skippedCount: segments.length - prepared.length,
  };
};
