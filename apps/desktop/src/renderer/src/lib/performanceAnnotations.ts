import type { SmartPerformanceSegment } from "@ai-voice-studio/shared-types";

export type PerformanceAnnotationTone = "mood" | "pause" | "expression";

export interface PerformanceAnnotationPart {
  label: string;
  tone: PerformanceAnnotationTone;
}

export const performancePauseLabel = (pauseAfterMs: number): string => {
  if (pauseAfterMs >= 800) return "明显转场";
  if (pauseAfterMs >= 480) return "段落停顿";
  if (pauseAfterMs >= 260) return "短停顿";
  return "轻停顿";
};

export const createPerformanceAnnotationParts = (
  segment: SmartPerformanceSegment,
): PerformanceAnnotationPart[] => [
  {
    tone: "mood",
    label: segment.emotion
      ? `情绪：${segment.emotion}`
      : `语气参考：${segment.mood}`,
  },
  {
    tone: "pause",
    label: `停顿：${performancePauseLabel(segment.pauseAfterMs)}`,
  },
  ...(segment.expression
    ? [{ tone: "expression" as const, label: `表达：${segment.expression}` }]
    : []),
];
