import {
  type Emotion,
  type GenerationPresetId,
  type Language,
  type ModelId,
  type PronunciationRule,
  type SmartPerformanceSegment,
  type VoxVoiceMode,
} from "@ai-voice-studio/shared-types";

export type DraftKind = "single" | "subtitles" | "dialogue";

const STORAGE_KEY_PREFIX = "shengzuo-creation-draft";
const SESSION_KEY_PREFIX = "shengzuo-creation-page-visited";
const MAX_DRAFT_AGE_DAYS = 90;

interface DraftBase {
  kind: DraftKind;
  title: string;
  projectId?: string;
  updatedAt?: string;
  modelId: ModelId;
  language: Language;
  emotion: Emotion;
  expression: string;
  presetId: GenerationPresetId;
  speed: number;
  volume: number;
  selectedVoice: string;
  pronunciationRules: PronunciationRule[];
}

export interface SingleCreationDraft extends DraftBase {
  kind: "single";
  text: string;
  performanceSegments: SmartPerformanceSegment[];
  voxMode?: VoxVoiceMode;
  voiceDescription?: string;
}

export interface SubtitlesCreationDraft extends DraftBase {
  kind: "subtitles";
  sourceText: string;
  fileName?: string;
  pauseMs: number;
  segments: {
    id: string;
    text: string;
    startTime?: string;
    endTime?: string;
  }[];
}

export interface DialogueCreationDraft extends DraftBase {
  kind: "dialogue";
  scriptInput: string;
  lines: { id: string; role: string; text: string }[];
  voiceAssignments: Record<string, string>;
  roleEmotions: Record<string, Emotion>;
  roleSpeeds: Record<string, number>;
}

export type CreationDraft =
  | SingleCreationDraft
  | SubtitlesCreationDraft
  | DialogueCreationDraft;

type StoredDraft<TDraft extends CreationDraft> = Omit<
  TDraft,
  "pronunciationRules"
> & {
  /** 早期草稿没有保存朗读规则；读取时统一补为空数组。 */
  pronunciationRules?: PronunciationRule[];
};

type StoredSingleCreationDraft = StoredDraft<SingleCreationDraft>;
type StoredSubtitlesCreationDraft = StoredDraft<SubtitlesCreationDraft>;
type StoredDialogueCreationDraft = StoredDraft<DialogueCreationDraft>;

const storageKey = (kind: DraftKind): string => `${STORAGE_KEY_PREFIX}-${kind}`;

export const markCreationPageVisited = (kind: DraftKind): boolean => {
  if (typeof window === "undefined") return false;
  const key = `${SESSION_KEY_PREFIX}-${kind}`;
  const visited = sessionStorage.getItem(key) === "1";
  sessionStorage.setItem(key, "1");
  return visited;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isEmotion = (value: unknown): value is Emotion =>
  typeof value === "string" &&
  ["自然", "温暖", "开心", "沉稳", "激动", "悲伤", "镇定"].includes(value);

const isLanguage = (value: unknown): value is Language =>
  typeof value === "string";

const isModelId = (value: unknown): value is ModelId =>
  typeof value === "string";

const isGenerationPresetId = (value: unknown): value is GenerationPresetId =>
  typeof value === "string";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPronunciationRule = (value: unknown): value is PronunciationRule => {
  if (!isObject(value)) return false;
  const action = value.action ?? "replace";
  return (
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    value.source.trim().length > 0 &&
    value.source.length <= 80 &&
    typeof value.replacement === "string" &&
    value.replacement.length <= 160 &&
    (action === "skip" ||
      (action === "replace" && value.replacement.trim().length > 0)) &&
    typeof value.enabled === "boolean"
  );
};

const isPronunciationRules = (value: unknown): value is PronunciationRule[] =>
  Array.isArray(value) &&
  value.length <= 50 &&
  value.every(isPronunciationRule);

const isStoredPronunciationRules = (
  value: unknown,
): value is PronunciationRule[] | undefined =>
  value === undefined || isPronunciationRules(value);

const isRecentDraft = (updatedAt?: string): boolean => {
  if (!updatedAt) return false;
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(updated)) return false;
  const ageInMs = Date.now() - updated;
  return ageInMs <= MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;
};

const isSingleDraft = (value: unknown): value is StoredSingleCreationDraft => {
  if (!isObject(value) || value.kind !== "single") return false;
  return (
    isNonEmptyString(value.title) &&
    isModelId(value.modelId) &&
    isLanguage(value.language) &&
    isEmotion(value.emotion) &&
    typeof value.expression === "string" &&
    isGenerationPresetId(value.presetId) &&
    isNumber(value.speed) &&
    isNumber(value.volume) &&
    typeof value.selectedVoice === "string" &&
    isStoredPronunciationRules(value.pronunciationRules) &&
    isNonEmptyString(value.updatedAt) &&
    Array.isArray(value.performanceSegments) &&
    (value.voxMode === undefined ||
      value.voxMode === "controlled" ||
      value.voxMode === "ultimate" ||
      value.voxMode === "design") &&
    (value.voiceDescription === undefined ||
      typeof value.voiceDescription === "string") &&
    typeof value.text === "string"
  );
};

const isSubtitlesDraft = (
  value: unknown,
): value is StoredSubtitlesCreationDraft => {
  if (!isObject(value) || value.kind !== "subtitles") return false;
  return (
    isNonEmptyString(value.title) &&
    isModelId(value.modelId) &&
    isLanguage(value.language) &&
    isEmotion(value.emotion) &&
    typeof value.expression === "string" &&
    isGenerationPresetId(value.presetId) &&
    isNumber(value.speed) &&
    isNumber(value.volume) &&
    typeof value.selectedVoice === "string" &&
    isStoredPronunciationRules(value.pronunciationRules) &&
    isNumber(value.pauseMs) &&
    typeof value.sourceText === "string" &&
    Array.isArray(value.segments)
  );
};

const isDialogueDraft = (
  value: unknown,
): value is StoredDialogueCreationDraft => {
  if (!isObject(value) || value.kind !== "dialogue") return false;
  return (
    isNonEmptyString(value.title) &&
    isModelId(value.modelId) &&
    isLanguage(value.language) &&
    isEmotion(value.emotion) &&
    typeof value.expression === "string" &&
    isGenerationPresetId(value.presetId) &&
    isNumber(value.speed) &&
    isNumber(value.volume) &&
    typeof value.selectedVoice === "string" &&
    isStoredPronunciationRules(value.pronunciationRules) &&
    typeof value.scriptInput === "string" &&
    Array.isArray(value.lines) &&
    isObject(value.voiceAssignments) &&
    isObject(value.roleEmotions) &&
    isObject(value.roleSpeeds)
  );
};

const castSingle = (value: unknown): SingleCreationDraft | null => {
  if (!isSingleDraft(value) || !isRecentDraft(value.updatedAt)) return null;
  return {
    ...value,
    pronunciationRules: value.pronunciationRules ?? [],
    projectId:
      typeof value.projectId === "string" && value.projectId
        ? value.projectId
        : undefined,
    expression: value.expression,
    voxMode: value.voxMode ?? "controlled",
    voiceDescription:
      typeof value.voiceDescription === "string" ? value.voiceDescription : "",
  };
};

const castSubtitles = (value: unknown): SubtitlesCreationDraft | null => {
  if (!isSubtitlesDraft(value) || !isRecentDraft(value.updatedAt)) return null;
  return {
    ...value,
    pronunciationRules: value.pronunciationRules ?? [],
    projectId:
      typeof value.projectId === "string" && value.projectId
        ? value.projectId
        : undefined,
    fileName:
      typeof value.fileName === "string" && value.fileName
        ? value.fileName
        : undefined,
    sourceText: typeof value.sourceText === "string" ? value.sourceText : "",
    segments: value.segments.filter(
      (
        item,
      ): item is {
        id: string;
        text: string;
        startTime?: string;
        endTime?: string;
      } =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        isNonEmptyString((item as { text?: unknown }).text),
    ),
  };
};

const castDialogue = (value: unknown): DialogueCreationDraft | null => {
  if (!isDialogueDraft(value) || !isRecentDraft(value.updatedAt)) return null;
  return {
    ...value,
    pronunciationRules: value.pronunciationRules ?? [],
    projectId:
      typeof value.projectId === "string" && value.projectId
        ? value.projectId
        : undefined,
    scriptInput: typeof value.scriptInput === "string" ? value.scriptInput : "",
    lines: value.lines.filter(
      (item): item is { id: string; role: string; text: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.role === "string" &&
        typeof item.text === "string",
    ),
    voiceAssignments: sanitizeStringRecord(value.voiceAssignments),
    roleEmotions: sanitizeEmotionRecord(value.roleEmotions),
    roleSpeeds: sanitizeNumberRecord(value.roleSpeeds),
  };
};

const sanitizeStringRecord = (value: unknown): Record<string, string> => {
  if (!isObject(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, rawVoiceId] of Object.entries(value)) {
    if (isNonEmptyString(key) && isNonEmptyString(rawVoiceId)) {
      result[key] = rawVoiceId;
    }
  }
  return result;
};

const sanitizeEmotionRecord = (value: unknown): Record<string, Emotion> => {
  if (!isObject(value)) return {};
  const result: Record<string, Emotion> = {};
  for (const [key, emotion] of Object.entries(value)) {
    if (isNonEmptyString(key) && isEmotion(emotion)) {
      result[key] = emotion;
    }
  }
  return result;
};

const sanitizeNumberRecord = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, rawSpeed] of Object.entries(value)) {
    if (isNonEmptyString(key) && isNumber(rawSpeed)) {
      result[key] = rawSpeed;
    }
  }
  return result;
};

const parseDraft = (draft: unknown): CreationDraft | null => {
  if (!isObject(draft) || typeof draft.kind !== "string") return null;
  if (draft.kind === "single") return castSingle(draft);
  if (draft.kind === "subtitles") return castSubtitles(draft);
  if (draft.kind === "dialogue") return castDialogue(draft);
  return null;
};

export function loadCreationDraft(kind: "single"): SingleCreationDraft | null;
export function loadCreationDraft(
  kind: "subtitles",
): SubtitlesCreationDraft | null;
export function loadCreationDraft(
  kind: "dialogue",
): DialogueCreationDraft | null;
export function loadCreationDraft(kind: DraftKind): CreationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const draft = parseDraft(parsed);
    return draft?.kind === kind ? draft : null;
  } catch {
    return null;
  }
}

export const saveCreationDraft = (draft: CreationDraft): void => {
  if (typeof window === "undefined") return;
  const withTimestamp: CreationDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey(draft.kind), JSON.stringify(withTimestamp));
};

export const clearCreationDraft = (kind: DraftKind): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(kind));
};

export const hasMeaningfulDraftContent = (
  draft: CreationDraft | null,
): boolean => {
  if (!draft) return false;
  if (!draft.title.trim()) return false;
  if (draft.kind === "single") {
    return draft.text.trim().length > 0;
  }
  if (draft.kind === "subtitles") {
    return draft.sourceText.trim().length > 0;
  }
  return (
    draft.scriptInput.trim().length > 0 ||
    draft.lines.some((line) => line.text.trim().length > 0) ||
    draft.pronunciationRules.length > 0
  );
};
