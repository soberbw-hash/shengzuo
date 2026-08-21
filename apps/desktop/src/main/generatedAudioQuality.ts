import type {
  GenerationPresetId,
  GenerationQualityMode,
  ModelId,
} from "@ai-voice-studio/shared-types";

export interface GeneratedAudioMetrics {
  durationSeconds: number;
  peakDb: number;
  rmsDb: number;
  silenceRatio: number;
  clippedRatio: number;
  leadingSilenceSeconds: number;
  trailingSilenceSeconds: number;
  medianPitchHz?: number;
}

export interface GeneratedAudioAssessment {
  issues: string[];
  critical: boolean;
  score: number;
  secondsPerUnit?: number;
  medianPitchHz?: number;
  pitchSemitoneDelta?: number;
  stabilityDeviation?: number;
}

export interface FrozenQualityBaseline {
  secondsPerUnit?: number;
  medianPitchHz?: number;
  previousPitchHz?: number;
}

interface PendingQualityBaseline {
  target: number;
  paceSamples: number[];
  pitchSamples: number[];
  previousPitchHz?: number;
  frozen: FrozenQualityBaseline;
}

const median = (values: readonly number[]): number | undefined => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const commonSpelledInitialisms = new Set([
  "AI",
  "API",
  "CPU",
  "CUDA",
  "DXP",
  "GPU",
  "RAM",
  "TTS",
  "URL",
  "USB",
  "VRAM",
]);

const estimateEnglishSyllables = (source: string): number => {
  const word = source.toLocaleLowerCase("en-US").replace(/[^a-z]/gu, "");
  if (!word) return 0;
  if (commonSpelledInitialisms.has(source.toLocaleUpperCase("en-US"))) {
    return source.length;
  }
  if (word.length <= 3) return 1;
  const withoutSilentEnding = word
    .replace(/(?:[^aeiou]e)$/u, "")
    .replace(/(?:[^aeiou]es|[^aeiou]ed)$/u, "");
  const groups = withoutSilentEnding.match(/[aeiouy]+/gu)?.length ?? 0;
  const consonantLe = /[^aeiou]le$/u.test(word) ? 1 : 0;
  return Math.max(1, groups + consonantLe);
};

/**
 * 粗略估算实际会被朗读的单位。汉字按字，英文按音节（短缩写按字母），
 * 数字按位，其他语言按 Unicode 字母或数字计数；空白与标点不参与。
 */
export const estimateSpokenUnits = (text: string): number => {
  let units = 0;
  const tokens = text.matchAll(
    /[\p{Script=Han}]|[A-Za-z]+(?:['’-][A-Za-z]+)*|[0-9]+|[\p{L}\p{N}]/gu,
  );
  for (const match of tokens) {
    const token = match[0];
    if (/^[\p{Script=Han}]$/u.test(token)) {
      units += 1;
    } else if (/^[A-Za-z]/u.test(token)) {
      units += estimateEnglishSyllables(token);
    } else if (/^[0-9]+$/u.test(token)) {
      units += token.length;
    } else {
      units += 1;
    }
  }
  return units;
};

/** Keep Main's long-form boundary aligned with the Vox worker. */
export const estimateVisibleCharacters = (text: string): number =>
  Array.from(text).filter((character) => !/\s/u.test(character)).length;

export const generationQualityModeFor = (request: {
  modelId: ModelId;
  presetId?: GenerationPresetId;
  text: string;
  longForm?: boolean;
}): GenerationQualityMode => {
  if (request.presetId === "longform" || request.presetId === "expressive") {
    return "careful";
  }
  if (
    request.modelId === "voxcpm2" &&
    (request.longForm ||
      estimateSpokenUnits(request.text) > 70 ||
      estimateVisibleCharacters(request.text) > 70)
  ) {
    return "careful";
  }
  return "standard";
};

export const shouldUseVoxLongForm = (request: {
  modelId: ModelId;
  presetId?: GenerationPresetId;
  segmentCount: number;
  totalSpokenUnits: number;
  totalVisibleCharacters: number;
}): boolean =>
  request.modelId === "voxcpm2" &&
  (request.presetId === "longform" ||
    request.segmentCount >= 3 ||
    request.totalSpokenUnits > 70 ||
    request.totalVisibleCharacters > 70);

/**
 * 每组声音与表达只采纳前 2–3 个通过检查的片段，随后冻结中位数。
 * 冻结后异常片段不会反向拖动基线，避免越读越快被 EMA 当成“新正常”。
 */
export class FrozenQualityBaselineTracker {
  private readonly groups = new Map<string, PendingQualityBaseline>();

  get(key: string): FrozenQualityBaseline | undefined {
    const current = this.groups.get(key);
    const frozen = current?.frozen;
    return frozen?.secondsPerUnit !== undefined ||
      frozen?.medianPitchHz !== undefined ||
      current?.previousPitchHz !== undefined
      ? { ...frozen, previousPitchHz: current?.previousPitchHz }
      : undefined;
  }

  observe(
    key: string,
    assessment: GeneratedAudioAssessment,
    requestedTarget = 3,
  ): FrozenQualityBaseline | undefined {
    const target = Math.max(2, Math.min(3, Math.round(requestedTarget)));
    const current = this.groups.get(key) ?? {
      target,
      paceSamples: [],
      pitchSamples: [],
      previousPitchHz: undefined,
      frozen: {},
    };
    this.groups.set(key, current);
    if (assessment.critical || assessment.issues.length > 0) {
      return this.get(key);
    }

    if (
      current.frozen.secondsPerUnit === undefined &&
      assessment.secondsPerUnit !== undefined
    ) {
      current.paceSamples.push(assessment.secondsPerUnit);
      if (current.paceSamples.length >= current.target) {
        current.frozen.secondsPerUnit = median(
          current.paceSamples.slice(0, current.target),
        );
      }
    }
    if (
      current.frozen.medianPitchHz === undefined &&
      assessment.medianPitchHz !== undefined
    ) {
      current.pitchSamples.push(assessment.medianPitchHz);
      if (current.pitchSamples.length >= current.target) {
        current.frozen.medianPitchHz = median(
          current.pitchSamples.slice(0, current.target),
        );
      }
    }
    if (assessment.medianPitchHz !== undefined) {
      const frozenPitch = current.frozen.medianPitchHz;
      const deltaFromFrozen =
        frozenPitch === undefined
          ? 0
          : Math.abs(12 * Math.log2(assessment.medianPitchHz / frozenPitch));
      if (deltaFromFrozen <= 4.8) {
        current.previousPitchHz = assessment.medianPitchHz;
      }
    }
    return this.get(key);
  }
}

export const isAssessmentBetter = (
  candidate: GeneratedAudioAssessment,
  current: GeneratedAudioAssessment,
): boolean => {
  if (candidate.critical !== current.critical) return !candidate.critical;
  if (candidate.score !== current.score) return candidate.score < current.score;
  return (
    (candidate.stabilityDeviation ?? Number.POSITIVE_INFINITY) <
    (current.stabilityDeviation ?? Number.POSITIVE_INFINITY)
  );
};

export const assessGeneratedAudio = (
  metrics: GeneratedAudioMetrics,
  text: string,
  mode: GenerationQualityMode,
  baselineSecondsPerUnit?: number,
  baselinePitchHz?: number,
  requestedSpeed = 1,
  modelId?: ModelId,
  calibration = false,
  previousPitchHz?: number,
): GeneratedAudioAssessment => {
  const issues: string[] = [];
  let score = 0;
  let critical = false;
  const units = estimateSpokenUnits(text);
  const paceDuration =
    metrics.durationSeconds *
    (Number.isFinite(requestedSpeed) &&
    requestedSpeed >= 0.5 &&
    requestedSpeed <= 2
      ? requestedSpeed
      : 1);
  const secondsPerUnit = units >= 4 ? paceDuration / units : undefined;
  const medianPitchHz =
    units >= 10 &&
    metrics.durationSeconds >= 1 &&
    metrics.medianPitchHz !== undefined &&
    Number.isFinite(metrics.medianPitchHz) &&
    metrics.medianPitchHz > 0
      ? metrics.medianPitchHz
      : undefined;
  let stabilityDeviation = 0;

  const add = (code: string, weight: number, isCritical = false) => {
    if (!issues.includes(code)) issues.push(code);
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
    const minimum = mode === "careful" ? 0.07 : 0.05;
    const maximum = mode === "careful" ? 1 : 1.2;
    if (secondsPerUnit < minimum) {
      stabilityDeviation += Math.abs(Math.log(secondsPerUnit / minimum));
      add(
        "疑似漏读或语速异常",
        80,
        mode === "careful" && secondsPerUnit < minimum * 0.65,
      );
    }
    if (secondsPerUnit > maximum) {
      stabilityDeviation += Math.abs(Math.log(secondsPerUnit / maximum));
      add(
        "疑似异常停顿",
        50,
        mode === "careful" && secondsPerUnit > maximum * 1.6,
      );
    }
    if (
      baselineSecondsPerUnit !== undefined &&
      Number.isFinite(baselineSecondsPerUnit) &&
      baselineSecondsPerUnit > 0
    ) {
      const ratio = secondsPerUnit / baselineSecondsPerUnit;
      stabilityDeviation += Math.abs(Math.log(ratio));
      const fastRatio = calibration ? 0.86 : 0.78;
      const slowRatio = calibration ? 1.18 : 1.4;
      if (ratio < fastRatio) {
        add(
          "语速明显变快",
          75,
          mode === "careful" && (modelId === "voxcpm2" || ratio < 0.65),
        );
      } else if (ratio > slowRatio) {
        add(
          "语速明显变慢",
          70,
          mode === "careful" && (modelId === "voxcpm2" || ratio > 1.65),
        );
      }
    }
  }

  let pitchSemitoneDelta: number | undefined;
  const pitchReferences = [baselinePitchHz, previousPitchHz].filter(
    (value): value is number =>
      value !== undefined && Number.isFinite(value) && value > 0,
  );
  if (
    units >= 10 &&
    metrics.durationSeconds >= 1 &&
    modelId === "voxcpm2" &&
    medianPitchHz !== undefined &&
    pitchReferences.length > 0
  ) {
    pitchSemitoneDelta = pitchReferences
      .map((reference) => 12 * Math.log2(medianPitchHz / reference))
      .sort((left, right) => Math.abs(right) - Math.abs(left))[0]!;
    stabilityDeviation += Math.abs(pitchSemitoneDelta) / 12;
    if (Math.abs(pitchSemitoneDelta) > 4.8) {
      add("音高明显变化", 80, mode === "careful");
    }
  }

  return {
    issues,
    critical,
    score,
    secondsPerUnit,
    medianPitchHz,
    pitchSemitoneDelta,
    stabilityDeviation:
      stabilityDeviation > 0 ||
      baselineSecondsPerUnit !== undefined ||
      pitchReferences.length > 0
        ? stabilityDeviation
        : undefined,
  };
};
