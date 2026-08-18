export interface GeneratedAudioMetrics {
  durationSeconds: number;
  peakDb: number;
  rmsDb: number;
  silenceRatio: number;
  clippedRatio: number;
  leadingSilenceSeconds: number;
  trailingSilenceSeconds: number;
}

export interface GeneratedAudioAssessment {
  issues: string[];
  critical: boolean;
  score: number;
  secondsPerUnit?: number;
}

const chineseCharacters = (text: string): number =>
  Array.from(text.matchAll(/[\p{Script=Han}]/gu)).length;

export const assessGeneratedAudio = (
  metrics: GeneratedAudioMetrics,
  text: string,
  mode: "standard" | "careful",
  baselineSecondsPerUnit?: number,
): GeneratedAudioAssessment => {
  const issues: string[] = [];
  let score = 0;
  let critical = false;
  const units = chineseCharacters(text);
  const secondsPerUnit =
    units >= 4 ? metrics.durationSeconds / units : undefined;

  const add = (code: string, weight: number, isCritical = false) => {
    issues.push(code);
    score += weight;
    critical ||= isCritical;
  };

  if (metrics.durationSeconds < 0.25) add("音频过短", 100, true);
  if (metrics.rmsDb < -42 || metrics.peakDb < -34)
    add("声音几乎听不见", 100, true);
  if (metrics.silenceRatio > 0.88 && metrics.durationSeconds > 1)
    add("静音过多", 90, true);
  if (metrics.clippedRatio > 0.03) add("削波失真", 45);
  if (
    metrics.trailingSilenceSeconds > 2.5 ||
    metrics.leadingSilenceSeconds > 2.5
  )
    add("首尾空白过长", 30);

  if (secondsPerUnit !== undefined) {
    const minimum = mode === "careful" ? 0.075 : 0.055;
    if (secondsPerUnit < minimum) add("疑似漏读或语速异常", 80, true);
    if (secondsPerUnit > 1.2) add("疑似异常停顿", 50);
    if (
      baselineSecondsPerUnit !== undefined &&
      secondsPerUnit <
        baselineSecondsPerUnit * (mode === "careful" ? 0.72 : 0.64)
    )
      add("语速明显变快", 70, mode === "careful");
  }

  return { issues, critical, score, secondsPerUnit };
};
