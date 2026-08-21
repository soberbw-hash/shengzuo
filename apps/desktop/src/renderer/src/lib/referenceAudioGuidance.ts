export const ULTIMATE_REFERENCE_MAX_SECONDS = 30;

export interface ReferenceDurationGuidance {
  label: string;
  tone: "success" | "warning";
}

export const isUltimateReferenceTooLong = (
  durationSeconds: number | undefined,
): boolean =>
  Number.isFinite(durationSeconds) &&
  (durationSeconds ?? 0) > ULTIMATE_REFERENCE_MAX_SECONDS;

export const getReferenceDurationGuidance = (
  durationSeconds: number | undefined,
): ReferenceDurationGuidance | null => {
  if (!Number.isFinite(durationSeconds) || durationSeconds === undefined) {
    return null;
  }
  if (durationSeconds < 3 || durationSeconds > 60) return null;
  if (durationSeconds < 5) {
    return { label: "录音偏短，5–15 秒更稳定", tone: "warning" };
  }
  if (durationSeconds <= 15) {
    return { label: "推荐时长，适合克隆", tone: "success" };
  }
  if (durationSeconds <= ULTIMATE_REFERENCE_MAX_SECONDS) {
    return { label: "时长可用，5–15 秒通常更稳定", tone: "success" };
  }
  return { label: "较长录音：仅用于可控克隆", tone: "warning" };
};
