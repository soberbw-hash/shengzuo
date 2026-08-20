export const APP_NAME = "声作";
export const APP_VERSION = "1.0.0";
export const APP_DESCRIPTOR = "本地声音创作工作台";
export const APP_TAGLINE = "让自己的声音，成为作品。";

export const MODEL_CATALOG = [
  {
    id: "voxcpm2",
    name: "VoxCPM2",
    purpose: "描述造声、声音克隆、旁白",
    summary: "既能克隆，也能只靠描述创造新声音。",
    badge: "首选",
    rating: 5,
    ratingLabel: "综合最推荐",
    version: "2.0.3 / 2026-08",
    estimatedSize: "约 15 GB",
    recommendedHardware: "NVIDIA 显卡，8GB 显存",
    hardwareNote: "30 种语言、9 种中文方言",
    license: "Apache License 2.0",
    usageRestriction: null,
    suitable: true,
    available: true,
  },
  {
    id: "fun-cosyvoice3-0.5b",
    name: "Fun-CosyVoice3 0.5B 2512",
    purpose: "方言配音、地方口音",
    summary: "想说方言，就用这个。",
    badge: "方言多",
    rating: 4.5,
    ratingLabel: "方言创作首选",
    version: "2512 / 2026-05",
    estimatedSize: "约 16 GB",
    recommendedHardware: "NVIDIA 显卡，8GB 显存",
    hardwareNote: "19 种中文方言和口音",
    license: "Apache License 2.0",
    usageRestriction: null,
    suitable: true,
    available: true,
  },
  {
    id: "indextts2-5",
    name: "IndexTTS-2.5",
    purpose: "情绪旁白、角色台词",
    summary: "想要更细腻的语气，就用这个。",
    badge: "情绪强",
    rating: 4.8,
    ratingLabel: "表现力推荐",
    version: "2.5 / 2026-08",
    estimatedSize: "约 18 GB",
    recommendedHardware: "NVIDIA 显卡，12GB 显存",
    hardwareNote: "中文、英语、日语、西语、阿语",
    license: "bilibili Model Use License",
    usageRestriction: "仅限非商业",
    suitable: true,
    available: true,
  },
] as const;

export type ModelId = (typeof MODEL_CATALOG)[number]["id"];

export type VoxVoiceMode = "controlled" | "ultimate" | "design";

export const VOX_VOICE_MODES = [
  {
    id: "controlled",
    label: "可控克隆",
    description: "参考录音克隆，可调整语气。",
  },
  {
    id: "ultimate",
    label: "极致克隆",
    description: "录音加完整原文，最大程度还原。",
  },
  {
    id: "design",
    label: "描述造声",
    description: "不用录音，用文字创造声音。",
  },
] as const satisfies readonly {
  id: VoxVoiceMode;
  label: string;
  description: string;
}[];

export const MODEL_VOICE_MODE_SUPPORT: Record<
  ModelId,
  readonly VoxVoiceMode[]
> = {
  voxcpm2: ["controlled", "ultimate", "design"],
  "fun-cosyvoice3-0.5b": ["controlled"],
  "indextts2-5": ["controlled"],
};

export const SINGLE_GENERATION_TEXT_LIMITS: Record<ModelId, number> = {
  voxcpm2: 2_000,
  "fun-cosyvoice3-0.5b": 2_000,
  "indextts2-5": 2_000,
};

export const countMeaningfulCharacters = (text: string): number =>
  Array.from(text.replace(/\s/gu, "")).length;

export const createTitleFromText = (
  text: string,
  fallback = "单段配音",
): string => {
  const compact = Array.from(text.replace(/\s/gu, ""))
    .slice(0, 12)
    .join("")
    .replace(/[，。！？!?；;：:、,.]+$/gu, "");
  return compact || fallback;
};

export const takeMeaningfulPrefix = (text: string, limit: number): string => {
  if (!Number.isInteger(limit) || limit < 1) return "";
  let result = "";
  let count = 0;
  for (const character of text) {
    result += character;
    if (!/\s/u.test(character)) count += 1;
    if (count >= limit) break;
  }
  return result.trim();
};

export const LANGUAGE_OPTIONS = [
  { id: "auto", label: "自动识别", group: "common" },
  { id: "zh", label: "普通话", group: "common" },
  { id: "en", label: "英语", group: "common" },
  { id: "ja", label: "日语", group: "common" },
  { id: "ko", label: "韩语", group: "common" },
  { id: "yue", label: "粤语", group: "dialect" },
  { id: "dialect-dongbei", label: "东北话", group: "dialect" },
  { id: "dialect-gansu", label: "甘肃话", group: "dialect" },
  { id: "dialect-guizhou", label: "贵州话", group: "dialect" },
  { id: "dialect-henan", label: "河南话", group: "dialect" },
  { id: "dialect-hubei", label: "湖北话", group: "dialect" },
  { id: "dialect-hunan", label: "湖南话", group: "dialect" },
  { id: "dialect-jiangxi", label: "江西话", group: "dialect" },
  { id: "dialect-minnan", label: "闽南话", group: "dialect" },
  { id: "dialect-ningxia", label: "宁夏话", group: "dialect" },
  { id: "dialect-shanxi", label: "山西话", group: "dialect" },
  { id: "dialect-shaanxi", label: "陕西话", group: "dialect" },
  { id: "dialect-shandong", label: "山东话", group: "dialect" },
  { id: "dialect-shanghai", label: "上海话", group: "dialect" },
  { id: "dialect-sichuan", label: "四川话", group: "dialect" },
  { id: "dialect-suhang", label: "苏杭口音", group: "dialect" },
  { id: "dialect-tianjin", label: "天津话", group: "dialect" },
  { id: "dialect-wu", label: "吴语", group: "dialect" },
  { id: "dialect-wuzhong", label: "吴中口音", group: "dialect" },
  { id: "dialect-yunnan", label: "云南话", group: "dialect" },
  { id: "ar", label: "阿拉伯语", group: "more" },
  { id: "my", label: "缅甸语", group: "more" },
  { id: "da", label: "丹麦语", group: "more" },
  { id: "nl", label: "荷兰语", group: "more" },
  { id: "fi", label: "芬兰语", group: "more" },
  { id: "fr", label: "法语", group: "more" },
  { id: "de", label: "德语", group: "more" },
  { id: "el", label: "希腊语", group: "more" },
  { id: "he", label: "希伯来语", group: "more" },
  { id: "hi", label: "印地语", group: "more" },
  { id: "id", label: "印度尼西亚语", group: "more" },
  { id: "it", label: "意大利语", group: "more" },
  { id: "km", label: "高棉语", group: "more" },
  { id: "lo", label: "老挝语", group: "more" },
  { id: "ms", label: "马来语", group: "more" },
  { id: "no", label: "挪威语", group: "more" },
  { id: "pl", label: "波兰语", group: "more" },
  { id: "pt", label: "葡萄牙语", group: "more" },
  { id: "ru", label: "俄语", group: "more" },
  { id: "es", label: "西班牙语", group: "more" },
  { id: "sw", label: "斯瓦希里语", group: "more" },
  { id: "sv", label: "瑞典语", group: "more" },
  { id: "tl", label: "他加禄语", group: "more" },
  { id: "th", label: "泰语", group: "more" },
  { id: "tr", label: "土耳其语", group: "more" },
  { id: "vi", label: "越南语", group: "more" },
] as const;

export type Language = (typeof LANGUAGE_OPTIONS)[number]["id"];

export const isDialectLanguage = (language: Language): boolean =>
  LANGUAGE_OPTIONS.find((option) => option.id === language)?.group ===
  "dialect";

export const getModelGenerationCapabilities = (
  modelId: ModelId,
  language: Language,
): {
  emotion: boolean;
  expression: boolean;
  presets: readonly GenerationPresetId[];
} => {
  const configured = MODEL_GENERATION_CAPABILITIES[modelId];
  const expression =
    configured.expression === "always" ||
    (configured.expression === "dialect-only" && isDialectLanguage(language));
  return {
    emotion: configured.emotion,
    expression,
    presets:
      configured.expression === "dialect-only" && !expression
        ? configured.presets.filter((preset) => preset !== "expressive")
        : configured.presets,
  };
};

export const MODEL_LANGUAGE_SUPPORT: Record<ModelId, readonly Language[]> = {
  voxcpm2: [
    "auto",
    "zh",
    "yue",
    "en",
    "ja",
    "ko",
    "dialect-dongbei",
    "dialect-henan",
    "dialect-minnan",
    "dialect-shaanxi",
    "dialect-shandong",
    "dialect-sichuan",
    "dialect-tianjin",
    "dialect-wu",
    "ar",
    "my",
    "da",
    "nl",
    "fi",
    "de",
    "fr",
    "el",
    "he",
    "hi",
    "id",
    "es",
    "it",
    "km",
    "lo",
    "ms",
    "no",
    "pl",
    "pt",
    "ru",
    "sw",
    "sv",
    "tl",
    "th",
    "tr",
    "vi",
  ],
  "fun-cosyvoice3-0.5b": [
    "auto",
    "zh",
    "yue",
    "en",
    "ja",
    "ko",
    "dialect-dongbei",
    "dialect-gansu",
    "dialect-guizhou",
    "dialect-henan",
    "dialect-hubei",
    "dialect-hunan",
    "dialect-jiangxi",
    "dialect-minnan",
    "dialect-ningxia",
    "dialect-shanxi",
    "dialect-shaanxi",
    "dialect-shandong",
    "dialect-shanghai",
    "dialect-sichuan",
    "dialect-suhang",
    "dialect-tianjin",
    "dialect-wuzhong",
    "dialect-yunnan",
    "de",
    "es",
    "fr",
    "it",
    "ru",
  ],
  "indextts2-5": ["auto", "zh", "en", "ja", "es", "ar"],
};

export type EngineStatus =
  | "not-installed"
  | "downloading"
  | "download-paused"
  | "download-failed"
  | "installing"
  | "loading"
  | "ready"
  | "generating"
  | "success"
  | "generation-failed"
  | "stopped";

export type OutputFormat = "mp3";
export type Emotion = "自然" | "温暖" | "开心" | "沉稳" | "激动" | "悲伤";
export const EMOTION_OPTIONS: readonly Emotion[] = [
  "自然",
  "温暖",
  "开心",
  "沉稳",
  "激动",
  "悲伤",
];

export type GenerationPresetId = "natural" | "longform" | "expressive";
export type GenerationQualityMode = "standard" | "careful";
export type ModelExpressionSupport = "always" | "dialect-only" | "none";

export const GENERATION_PRESETS = [
  {
    id: "natural",
    label: "自然口播",
    description: "速度和停顿更接近日常说话",
    qualityMode: "standard",
  },
  {
    id: "longform",
    label: "稳健长稿",
    description: "分段更短，逐段检查并自动重试",
    qualityMode: "careful",
  },
] as const satisfies readonly {
  id: GenerationPresetId;
  label: string;
  description: string;
  qualityMode: GenerationQualityMode;
}[];

export const MODEL_GENERATION_CAPABILITIES: Record<
  ModelId,
  {
    emotion: boolean;
    expression: ModelExpressionSupport;
    presets: readonly GenerationPresetId[];
  }
> = {
  voxcpm2: {
    emotion: false,
    expression: "always",
    presets: ["natural", "longform"],
  },
  "fun-cosyvoice3-0.5b": {
    emotion: false,
    expression: "always",
    presets: ["natural", "longform"],
  },
  "indextts2-5": {
    emotion: true,
    expression: "always",
    presets: ["natural", "longform"],
  },
};

export const getGenerationPreset = (presetId?: GenerationPresetId) =>
  GENERATION_PRESETS.find((preset) => preset.id === (presetId ?? "natural")) ??
  (presetId === "expressive" ? GENERATION_PRESETS[1] : GENERATION_PRESETS[0]);

export const normalizeGenerationControls = ({
  modelId,
  language,
  emotion,
  expression,
  presetId,
}: {
  modelId: ModelId;
  language: Language;
  emotion: Emotion;
  expression: string;
  presetId?: GenerationPresetId;
}): {
  emotion: Emotion;
  expression: string;
  presetId: GenerationPresetId;
} => {
  const capabilities = getModelGenerationCapabilities(modelId, language);
  return {
    emotion: capabilities.emotion ? emotion : "自然",
    expression: capabilities.expression ? expression.trim() : "自然、清晰",
    presetId: capabilities.presets.includes(presetId ?? "natural")
      ? (presetId ?? "natural")
      : presetId === "expressive" && capabilities.presets.includes("longform")
        ? "longform"
        : "natural",
  };
};

export type PronunciationRuleAction = "replace" | "skip";

export interface PronunciationRule {
  id: string;
  source: string;
  replacement: string;
  enabled: boolean;
  /** 旧项目未保存此字段时按“改读音”处理。 */
  action?: PronunciationRuleAction;
}

export interface GenerationQualitySummary {
  status: "passed" | "warning";
  checkedSegments: number;
  retriedSegments: number;
  note: string;
}

export const DEFAULT_EXPORT_NAMING_TEMPLATE = "{项目}_{日期}_{时间}";

export const EXPORT_NAMING_TOKENS = [
  { token: "{项目}", label: "项目名称" },
  { token: "{日期}", label: "日期" },
  { token: "{时间}", label: "时间" },
  { token: "{类型}", label: "配音类型" },
  { token: "{模型}", label: "模型" },
] as const;

export interface AudioResult {
  id: string;
  url: string;
  durationSeconds: number;
  format: OutputFormat;
  createdAt: string;
  favorite?: boolean;
  modelId?: ModelId;
  title?: string;
  kind?: "single" | "subtitles" | "dialogue";
  preview?: boolean;
  projectId?: string;
  takeNumber?: number;
  quality?: GenerationQualitySummary;
  voiceNames?: string[];
  language?: Language;
  emotion?: Emotion;
  expression?: string;
  presetId?: GenerationPresetId;
  /** 文稿在生成这一版音频时的快照，用于从历史版本继续编辑。 */
  sourceText?: string;
  voxMode?: VoxVoiceMode;
  voiceDescription?: string;
}

export interface ExportNamingSettings {
  template: string;
}

export interface UpdateExportNamingSettingsRequest {
  template: string;
}

export interface ExportNameContext {
  title?: string;
  kind?: AudioResult["kind"];
  modelName?: string;
  createdAt: string;
}

const exportNamingTokenValues = new Set<string>(
  EXPORT_NAMING_TOKENS.map((item) => item.token),
);

export const isExportNamingTemplate = (value: unknown): value is string => {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  if (value.length > 120) return false;
  const tokens = value.match(/\{[^{}]+\}/gu) ?? [];
  if (!tokens.every((token) => exportNamingTokenValues.has(token)))
    return false;
  const textWithoutTokens = tokens.reduce(
    (text, token) => text.replaceAll(token, ""),
    value,
  );
  return !/[{}]/u.test(textWithoutTokens);
};

const padDatePart = (value: number): string => String(value).padStart(2, "0");
const invalidWindowsFileNameCharacters = new Set('<>:"/\\|?*');

export const renderExportFileStem = (
  template: string,
  context: ExportNameContext,
): string => {
  const date = new Date(context.createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const dateValue = [
    safeDate.getFullYear(),
    padDatePart(safeDate.getMonth() + 1),
    padDatePart(safeDate.getDate()),
  ].join("-");
  const timeValue = [
    padDatePart(safeDate.getHours()),
    padDatePart(safeDate.getMinutes()),
    padDatePart(safeDate.getSeconds()),
  ].join("-");
  const kindValue =
    context.kind === "subtitles"
      ? "长稿配音"
      : context.kind === "dialogue"
        ? "多人对话"
        : "单段配音";
  const replacements: Record<string, string> = {
    "{项目}": context.title?.trim() || "配音",
    "{日期}": dateValue,
    "{时间}": timeValue,
    "{类型}": kindValue,
    "{模型}": context.modelName?.trim() || "本地模型",
  };
  const source = isExportNamingTemplate(template)
    ? template
    : DEFAULT_EXPORT_NAMING_TEMPLATE;
  const rendered = Object.entries(replacements).reduce(
    (value, [token, replacement]) => value.replaceAll(token, replacement),
    source,
  );
  return (
    [...rendered]
      .map((character) =>
        character.charCodeAt(0) < 32 ||
        invalidWindowsFileNameCharacters.has(character)
          ? "-"
          : character,
      )
      .join("")
      .replace(/\s+/gu, " ")
      .replace(/[. ]+$/gu, "")
      .trim()
      .slice(0, 120) || "配音"
  );
};

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  kind: "cloned";
  modelId: ModelId;
  model: string;
  color: string;
  sampleName: string;
  hasReferenceText: boolean;
  referenceTextLength?: number;
  createdAt: string;
  referenceSamples?: VoiceReferenceSample[];
  previewUrl?: string;
}

export interface VoiceReferenceSample {
  id: string;
  name: string;
  createdAt: string;
  active: boolean;
}

export interface VoiceSampleSelection {
  canceled: boolean;
  sampleToken?: string;
  fileName?: string;
  previewUrl?: string;
  quality?: VoiceSampleQuality;
}

export interface VoiceSampleQuality {
  durationSeconds?: number;
  peakDb?: number;
  averageDb?: number;
  noiseFloorDb?: number;
  status: "good" | "warning" | "unavailable";
  checks: Array<{
    code: string;
    label: string;
    tone: "success" | "warning" | "danger";
  }>;
}

export interface CreateVoiceProfileRequest {
  sampleToken: string;
  name: string;
  referenceText: string;
}

export interface RenameVoiceProfileRequest {
  voiceId: string;
  name: string;
}

export interface AddVoiceSampleRequest {
  voiceId: string;
  sampleToken: string;
  referenceText: string;
}

export interface SelectVoiceSampleRequest {
  voiceId: string;
  sampleId: string;
}

export interface RemoveVoiceSampleRequest {
  voiceId: string;
  sampleId: string;
}

export interface EngineSnapshot {
  status: EngineStatus;
  modelId: ModelId;
  progress: number;
  message: string;
  jobId?: string;
  result?: AudioResult;
  errorCode?: string;
  canRetry: boolean;
  downloadedBytes?: number;
  requiredBytes?: number;
  freeBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  downloadSource?: DownloadSource;
}

export type DownloadSource = "official" | "mirror";

export interface GenerationRequest {
  requestId: string;
  title: string;
  modelId: ModelId;
  voiceId: string;
  text: string;
  expression: string;
  language: Language;
  emotion: Emotion;
  speed: number;
  volume: number;
  format: OutputFormat;
  preview?: boolean;
  projectId?: string;
  presetId?: GenerationPresetId;
  pronunciationRules?: PronunciationRule[];
  performanceSegments?: BatchGenerationSegment[];
  voxMode?: VoxVoiceMode;
  voiceDescription?: string;
}

export interface BatchGenerationSegment {
  id: string;
  voiceId: string;
  text: string;
  label?: string;
  expression?: string;
  emotion?: Emotion;
  speed?: number;
  pauseAfterMs?: number;
}

export interface BatchGenerationRequest {
  requestId: string;
  modelId: ModelId;
  segments: BatchGenerationSegment[];
  language: Language;
  emotion: Emotion;
  speed: number;
  volume: number;
  pauseMs: number;
  format: OutputFormat;
  title: string;
  kind: "subtitles" | "dialogue";
  projectId?: string;
  presetId?: GenerationPresetId;
  pronunciationRules?: PronunciationRule[];
  /** 原始项目文稿；生成记录用它恢复当时的编辑内容。 */
  sourceText?: string;
  /** VoxCPM2 的克隆方式；旧任务未保存时按可控克隆处理。 */
  voxMode?: VoxVoiceMode;
  /** 描述造声使用的声音说明；其他模式不应携带。 */
  voiceDescription?: string;
}

export type ImportedDocumentKind = "text" | "word" | "excel";

export interface ImportedTextDocument {
  name: string;
  kind: ImportedDocumentKind;
  text: string;
}

export type ProjectKind = "single" | "subtitles" | "dialogue";

export interface ProjectSegment {
  id: string;
  text: string;
  voiceId?: string;
  label?: string;
  expression?: string;
  mood?: Emotion;
  emotion?: Emotion;
  speed?: number;
  pauseAfterMs?: number;
  startTime?: string;
  endTime?: string;
}

export interface GenerationProject {
  id: string;
  title: string;
  kind: ProjectKind;
  modelId: ModelId;
  language: Language;
  emotion: Emotion;
  speed: number;
  volume: number;
  pauseMs: number;
  expression: string;
  sourceText: string;
  segments: ProjectSegment[];
  presetId?: GenerationPresetId;
  pronunciationRules?: PronunciationRule[];
  voxMode?: VoxVoiceMode;
  voiceDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export type SaveProjectRequest = Omit<
  GenerationProject,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };

export type GenerationTaskStatus =
  | "queued"
  | "running"
  | "failed"
  | "completed"
  | "canceled";

export interface GenerationTask {
  id: string;
  title: string;
  kind: ProjectKind;
  modelId: ModelId;
  status: GenerationTaskStatus;
  progress: number;
  message: string;
  currentSegment: number;
  totalSegments: number;
  projectId?: string;
  resultId?: string;
  errorCode?: string;
  preview?: boolean;
  voiceNames?: string[];
  emotion?: Emotion;
  presetId?: GenerationPresetId;
  createdAt: string;
  updatedAt: string;
}

export type EnqueueTaskRequest =
  | { type: "generate"; request: GenerationRequest; projectId?: string }
  | {
      type: "generate-batch";
      request: BatchGenerationRequest;
      projectId?: string;
    };

export interface ModelStorageInfo {
  modelId: ModelId;
  installed: boolean;
  requiredBytes: number;
  currentBytes: number;
  freeBytes: number;
  downloadSource: DownloadSource;
}

export interface OfflineModelImportResult {
  canceled: boolean;
  imported?: boolean;
  message?: string;
}

export interface ModelLibraryChangeResult {
  canceled: boolean;
  path: string;
  moved?: boolean;
  movedBytes?: number;
  cleanupRequired?: boolean;
}

export interface DiagnosticsExportResult {
  canceled: boolean;
  filePath?: string;
}

export type SmartTextAction = "performance";

export interface SmartApiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyStatus: "missing" | "ready" | "unreadable";
}

export interface UpdateSmartApiConfigRequest {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface SmartApiConnectionResult {
  ok: boolean;
  message: string;
  model: string;
}

export interface SmartTextRequest {
  action: SmartTextAction;
  text: string;
  modelId: ModelId;
  language: Language;
}

export interface SmartPerformanceSegment {
  text: string;
  pauseAfterMs: number;
  mood: Emotion;
  emotion?: Emotion;
  expression?: string;
}

export interface SmartTextResult {
  summary: string;
  segments: SmartPerformanceSegment[];
}

export interface SmartDialogueScriptRequest {
  text: string;
}

export interface SmartDialogueLine {
  role: string;
  text: string;
}

export interface SmartDialogueScriptResult {
  lines: SmartDialogueLine[];
  roles: string[];
  summary: string;
  removedContent: string[];
}

export type SmartScriptDestination = "subtitles" | "dialogue";

/** 单个说话人适合统一声音逐句配音；两个及以上说话人需要分别分配声音。 */
export const getSmartScriptDestination = (
  result: Pick<SmartDialogueScriptResult, "lines">,
): SmartScriptDestination => {
  const roles = new Set(
    result.lines
      .filter((line) => line.text.trim())
      .map((line) => line.role.trim() || "旁白"),
  );
  return roles.size >= 2 ? "dialogue" : "subtitles";
};

export interface AppUpdateCheckResult {
  checkedAt: string;
  status: "up-to-date" | "available";
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseUrl: string;
  downloadUrl?: string;
  publishedAt?: string;
}

export type SystemCheckItemStatus = "ok" | "repaired" | "notice" | "attention";

export interface SystemCheckItem {
  id: string;
  label: string;
  status: SystemCheckItemStatus;
  detail: string;
}

export interface SystemCheckResult {
  checkedAt: string;
  overall: "healthy" | "attention";
  repairedCount: number;
  attentionCount: number;
  readyModelCount: number;
  items: SystemCheckItem[];
}

export type EngineCommand =
  | { type: "install"; modelId: ModelId }
  | { type: "pause-download"; modelId: ModelId }
  | { type: "resume-download"; modelId: ModelId }
  | { type: "retry"; modelId: ModelId }
  | { type: "prepare"; modelId: ModelId }
  | { type: "generate"; request: GenerationRequest }
  | { type: "generate-batch"; request: BatchGenerationRequest }
  | { type: "cancel"; jobId: string }
  | { type: "set-mock-state"; status: EngineStatus; modelId?: ModelId };

export interface ExportAudioRequest {
  resultId: string;
  suggestedName: string;
  format: OutputFormat;
}

export interface SetAudioFavoriteRequest {
  resultId: string;
  favorite: boolean;
}

export interface ExportAudioResult {
  canceled: boolean;
  filePath?: string;
}

export interface AppRuntimeInfo {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
  mockOnly: boolean;
  hardware: {
    computeMode: "cuda" | "cpu";
    gpuName: string;
    nvidiaDriver?: string;
    vramGb?: number;
    systemMemoryGb: number;
    summary: string;
  };
}

export interface DesktopApi {
  app: {
    getRuntimeInfo: () => Promise<AppRuntimeInfo>;
    getModelsPath: () => Promise<string>;
    openModelsFolder: () => Promise<boolean>;
    changeModelsPath: () => Promise<ModelLibraryChangeResult>;
    checkAndRepair: () => Promise<SystemCheckResult>;
    checkForUpdates: () => Promise<AppUpdateCheckResult>;
    openUpdatesPage: () => Promise<boolean>;
    exportDiagnostics: () => Promise<DiagnosticsExportResult>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  engine: {
    getSnapshot: () => Promise<EngineSnapshot>;
    listSnapshots: () => Promise<EngineSnapshot[]>;
    command: (command: EngineCommand) => Promise<EngineSnapshot>;
    onSnapshot: (listener: (snapshot: EngineSnapshot) => void) => () => void;
  };
  models: {
    getStorageInfo: (modelId: ModelId) => Promise<ModelStorageInfo>;
    getDownloadSource: () => Promise<DownloadSource>;
    setDownloadSource: (source: DownloadSource) => Promise<DownloadSource>;
    importOffline: (modelId: ModelId) => Promise<OfflineModelImportResult>;
  };
  projects: {
    list: () => Promise<GenerationProject[]>;
    get: (projectId: string) => Promise<GenerationProject | null>;
    save: (request: SaveProjectRequest) => Promise<GenerationProject>;
    remove: (projectId: string) => Promise<boolean>;
  };
  tasks: {
    list: () => Promise<GenerationTask[]>;
    enqueue: (request: EnqueueTaskRequest) => Promise<GenerationTask>;
    retry: (taskId: string) => Promise<GenerationTask>;
    cancel: (taskId: string) => Promise<GenerationTask>;
    remove: (taskId: string) => Promise<boolean>;
    onChanged: (listener: (task: GenerationTask) => void) => () => void;
  };
  voices: {
    list: () => Promise<VoiceProfile[]>;
    selectSample: () => Promise<VoiceSampleSelection>;
    selectDroppedSample: (file: File) => Promise<VoiceSampleSelection>;
    create: (request: CreateVoiceProfileRequest) => Promise<VoiceProfile>;
    rename: (request: RenameVoiceProfileRequest) => Promise<VoiceProfile>;
    addSample: (request: AddVoiceSampleRequest) => Promise<VoiceProfile>;
    selectSampleForVoice: (
      request: SelectVoiceSampleRequest,
    ) => Promise<VoiceProfile>;
    removeSample: (request: RemoveVoiceSampleRequest) => Promise<VoiceProfile>;
    remove: (voiceId: string) => Promise<boolean>;
    openFolder: () => Promise<boolean>;
  };
  documents: {
    select: () => Promise<ImportedTextDocument | null>;
    readDropped: (file: File) => Promise<ImportedTextDocument>;
  };
  audio: {
    listResults: () => Promise<AudioResult[]>;
    getExportNamingSettings: () => Promise<ExportNamingSettings>;
    updateExportNamingSettings: (
      request: UpdateExportNamingSettingsRequest,
    ) => Promise<ExportNamingSettings>;
    setFavorite: (request: SetAudioFavoriteRequest) => Promise<AudioResult>;
    removeResult: (resultId: string) => Promise<boolean>;
    exportResult: (request: ExportAudioRequest) => Promise<ExportAudioResult>;
    openExportFolder: () => Promise<boolean>;
  };
  smart: {
    getConfig: () => Promise<SmartApiConfig>;
    updateConfig: (
      request: UpdateSmartApiConfigRequest,
    ) => Promise<SmartApiConfig>;
    testConnection: () => Promise<SmartApiConnectionResult>;
    processText: (request: SmartTextRequest) => Promise<SmartTextResult>;
    processDialogue: (
      request: SmartDialogueScriptRequest,
    ) => Promise<SmartDialogueScriptResult>;
  };
}

export const IPC_CHANNELS = {
  app: {
    runtimeInfo: "app:runtime-info",
    modelsPath: "app:models-path",
    openModelsFolder: "app:open-models-folder",
    changeModelsPath: "app:change-models-path",
    checkAndRepair: "app:check-and-repair",
    checkForUpdates: "app:check-for-updates",
    openUpdatesPage: "app:open-updates-page",
    exportDiagnostics: "app:export-diagnostics",
  },
  window: {
    minimize: "window:minimize",
    toggleMaximize: "window:toggle-maximize",
    close: "window:close",
  },
  engine: {
    getSnapshot: "engine:get-snapshot",
    listSnapshots: "engine:list-snapshots",
    command: "engine:command",
    snapshot: "engine:snapshot",
  },
  models: {
    storageInfo: "models:storage-info",
    getDownloadSource: "models:get-download-source",
    setDownloadSource: "models:set-download-source",
    importOffline: "models:import-offline",
  },
  projects: {
    list: "projects:list",
    get: "projects:get",
    save: "projects:save",
    remove: "projects:remove",
  },
  tasks: {
    list: "tasks:list",
    enqueue: "tasks:enqueue",
    retry: "tasks:retry",
    cancel: "tasks:cancel",
    remove: "tasks:remove",
    changed: "tasks:changed",
  },
  voices: {
    list: "voices:list",
    selectSample: "voices:select-sample",
    selectDroppedSample: "voices:select-dropped-sample",
    create: "voices:create",
    rename: "voices:rename",
    addSample: "voices:add-sample",
    selectSampleForVoice: "voices:select-sample-for-voice",
    removeSample: "voices:remove-sample",
    remove: "voices:remove",
    openFolder: "voices:open-folder",
  },
  documents: {
    select: "documents:select",
    readDropped: "documents:read-dropped",
  },
  audio: {
    listResults: "audio:list-results",
    getExportNamingSettings: "audio:get-export-naming-settings",
    updateExportNamingSettings: "audio:update-export-naming-settings",
    setFavorite: "audio:set-favorite",
    removeResult: "audio:remove-result",
    exportResult: "audio:export-result",
    openExportFolder: "audio:open-export-folder",
  },
  smart: {
    getConfig: "smart:get-config",
    updateConfig: "smart:update-config",
    testConnection: "smart:test-connection",
    processText: "smart:process-text",
    processDialogue: "smart:process-dialogue",
  },
} as const;

export const ENGINE_STATUS_COPY: Record<
  EngineStatus,
  {
    label: string;
    message: string;
    tone: "neutral" | "info" | "success" | "warning" | "danger";
  }
> = {
  "not-installed": {
    label: "未下载",
    message: "点击“下载并使用”，系统会自动完成准备。",
    tone: "neutral",
  },
  downloading: {
    label: "正在下载",
    message: "正在下载模型文件，可随时暂停。",
    tone: "info",
  },
  "download-paused": {
    label: "下载已暂停",
    message: "已保留下载进度。",
    tone: "warning",
  },
  "download-failed": {
    label: "下载未完成",
    message: "下载中断，请重试。",
    tone: "danger",
  },
  installing: {
    label: "正在安装",
    message: "正在完成安装。",
    tone: "info",
  },
  loading: {
    label: "正在准备模型",
    message: "正在加载模型。",
    tone: "info",
  },
  ready: {
    label: "可以使用",
    message: "已就绪。",
    tone: "success",
  },
  generating: {
    label: "正在生成",
    message: "正在生成音频。",
    tone: "info",
  },
  success: {
    label: "已生成",
    message: "可试听或导出。",
    tone: "success",
  },
  "generation-failed": {
    label: "生成失败",
    message: "请检查文字、录音或模型后重试。",
    tone: "danger",
  },
  stopped: {
    label: "已停止",
    message: "已保留文本和设置。",
    tone: "warning",
  },
};

const engineStatuses = new Set<EngineStatus>(
  Object.keys(ENGINE_STATUS_COPY) as EngineStatus[],
);
const modelIds = new Set<ModelId>(MODEL_CATALOG.map((model) => model.id));
const outputFormats = new Set<OutputFormat>(["mp3"]);
const languages = new Set<Language>(
  LANGUAGE_OPTIONS.map((language) => language.id),
);
const emotions = new Set<Emotion>(EMOTION_OPTIONS);
const generationPresetIds = new Set<GenerationPresetId>(
  GENERATION_PRESETS.map((preset) => preset.id),
);
const voxVoiceModes = new Set<VoxVoiceMode>(
  VOX_VOICE_MODES.map((mode) => mode.id),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPronunciationRule = (value: unknown): value is PronunciationRule => {
  if (!isRecord(value)) return false;
  const action = value.action ?? "replace";
  return (
    typeof value.id === "string" &&
    /^[a-zA-Z0-9-]{1,120}$/u.test(value.id) &&
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

const hasValidGenerationOptions = (value: Record<string, unknown>): boolean =>
  (value.presetId === undefined ||
    (typeof value.presetId === "string" &&
      generationPresetIds.has(value.presetId as GenerationPresetId))) &&
  (value.pronunciationRules === undefined ||
    (Array.isArray(value.pronunciationRules) &&
      value.pronunciationRules.length <= 50 &&
      value.pronunciationRules.every(isPronunciationRule))) &&
  (value.performanceSegments === undefined ||
    (Array.isArray(value.performanceSegments) &&
      value.performanceSegments.length > 0 &&
      value.performanceSegments.length <= 200 &&
      value.performanceSegments.every(isBatchGenerationSegment))) &&
  (value.voxMode === undefined ||
    (value.modelId === "voxcpm2" &&
      typeof value.voxMode === "string" &&
      voxVoiceModes.has(value.voxMode as VoxVoiceMode))) &&
  (value.voxMode === "design"
    ? typeof value.voiceDescription === "string" &&
      value.voiceDescription.trim().length >= 4 &&
      value.voiceDescription.length <= 240
    : value.voiceDescription === undefined);

const isBatchGenerationSegment = (
  segment: unknown,
): segment is BatchGenerationSegment =>
  isRecord(segment) &&
  typeof segment.id === "string" &&
  /^[a-zA-Z0-9-]+$/u.test(segment.id) &&
  isVoiceId(segment.voiceId) &&
  typeof segment.text === "string" &&
  segment.text.trim().length > 0 &&
  segment.text.length <= 10_000 &&
  countMeaningfulCharacters(segment.text) <= 2_000 &&
  (segment.label === undefined ||
    (typeof segment.label === "string" && segment.label.length <= 40)) &&
  (segment.expression === undefined ||
    (typeof segment.expression === "string" &&
      segment.expression.length <= 500)) &&
  (segment.emotion === undefined ||
    (typeof segment.emotion === "string" &&
      emotions.has(segment.emotion as Emotion))) &&
  (segment.speed === undefined ||
    (typeof segment.speed === "number" &&
      segment.speed >= 0.5 &&
      segment.speed <= 2)) &&
  (segment.pauseAfterMs === undefined ||
    (typeof segment.pauseAfterMs === "number" &&
      Number.isInteger(segment.pauseAfterMs) &&
      segment.pauseAfterMs >= 0 &&
      segment.pauseAfterMs <= 5_000));

export const isEngineStatus = (value: unknown): value is EngineStatus =>
  typeof value === "string" && engineStatuses.has(value as EngineStatus);

export const isModelId = (value: unknown): value is ModelId =>
  typeof value === "string" && modelIds.has(value as ModelId);

export const isGenerationRequest = (
  value: unknown,
): value is GenerationRequest => {
  if (!isRecord(value)) return false;
  const isVoiceDesign =
    value.modelId === "voxcpm2" &&
    value.voxMode === "design" &&
    typeof value.voiceDescription === "string" &&
    value.voiceDescription.trim().length >= 4 &&
    value.voiceDescription.length <= 240;
  return (
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    value.requestId.length <= 120 &&
    /^[a-zA-Z0-9-]+$/u.test(value.requestId) &&
    isModelId(value.modelId) &&
    (isVoiceId(value.voiceId) ||
      (isVoiceDesign &&
        (value.voiceId === "" || value.voiceId === undefined))) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 120 &&
    typeof value.text === "string" &&
    value.text.length <= 50_000 &&
    countMeaningfulCharacters(value.text) <=
      SINGLE_GENERATION_TEXT_LIMITS[value.modelId] &&
    typeof value.expression === "string" &&
    value.expression.length <= 500 &&
    typeof value.language === "string" &&
    languages.has(value.language as Language) &&
    typeof value.emotion === "string" &&
    emotions.has(value.emotion as Emotion) &&
    typeof value.speed === "number" &&
    value.speed >= 0.5 &&
    value.speed <= 2 &&
    typeof value.volume === "number" &&
    value.volume >= 0 &&
    value.volume <= 150 &&
    typeof value.format === "string" &&
    outputFormats.has(value.format as OutputFormat) &&
    (value.preview === undefined || typeof value.preview === "boolean") &&
    (value.projectId === undefined || isProjectId(value.projectId)) &&
    hasValidGenerationOptions(value)
  );
};

export const isBatchGenerationRequest = (
  value: unknown,
): value is BatchGenerationRequest => {
  if (!isRecord(value) || !Array.isArray(value.segments)) return false;
  return (
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    value.requestId.length <= 120 &&
    /^[a-zA-Z0-9-]+$/u.test(value.requestId) &&
    isModelId(value.modelId) &&
    value.segments.length > 0 &&
    value.segments.length <= 200 &&
    value.segments.every(isBatchGenerationSegment) &&
    typeof value.language === "string" &&
    languages.has(value.language as Language) &&
    typeof value.emotion === "string" &&
    emotions.has(value.emotion as Emotion) &&
    typeof value.speed === "number" &&
    value.speed >= 0.5 &&
    value.speed <= 2 &&
    typeof value.volume === "number" &&
    value.volume >= 0 &&
    value.volume <= 150 &&
    typeof value.pauseMs === "number" &&
    Number.isInteger(value.pauseMs) &&
    value.pauseMs >= 0 &&
    value.pauseMs <= 5_000 &&
    typeof value.format === "string" &&
    outputFormats.has(value.format as OutputFormat) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 120 &&
    (value.kind === "subtitles" || value.kind === "dialogue") &&
    (value.projectId === undefined || isProjectId(value.projectId)) &&
    (value.sourceText === undefined ||
      (typeof value.sourceText === "string" &&
        value.sourceText.length <= 50_000)) &&
    hasValidGenerationOptions(value)
  );
};

export const isProjectId = (value: unknown): value is string =>
  typeof value === "string" && /^project-[a-f0-9-]{8,120}$/u.test(value);

export const isDownloadSource = (value: unknown): value is DownloadSource =>
  value === "official" || value === "mirror";

const isProjectSegment = (value: unknown): value is ProjectSegment =>
  isRecord(value) &&
  typeof value.id === "string" &&
  /^[a-zA-Z0-9-]+$/u.test(value.id) &&
  typeof value.text === "string" &&
  value.text.length <= 10_000 &&
  countMeaningfulCharacters(value.text) <= 2_000 &&
  (value.voiceId === undefined ||
    value.voiceId === "" ||
    isVoiceId(value.voiceId)) &&
  (value.label === undefined ||
    (typeof value.label === "string" && value.label.length <= 40)) &&
  (value.expression === undefined ||
    (typeof value.expression === "string" && value.expression.length <= 500)) &&
  (value.mood === undefined ||
    (typeof value.mood === "string" && emotions.has(value.mood as Emotion))) &&
  (value.emotion === undefined ||
    (typeof value.emotion === "string" &&
      emotions.has(value.emotion as Emotion))) &&
  (value.speed === undefined ||
    (typeof value.speed === "number" &&
      value.speed >= 0.5 &&
      value.speed <= 2)) &&
  (value.pauseAfterMs === undefined ||
    (typeof value.pauseAfterMs === "number" &&
      Number.isInteger(value.pauseAfterMs) &&
      value.pauseAfterMs >= 0 &&
      value.pauseAfterMs <= 5_000)) &&
  (value.startTime === undefined ||
    (typeof value.startTime === "string" && value.startTime.length <= 24)) &&
  (value.endTime === undefined ||
    (typeof value.endTime === "string" && value.endTime.length <= 24));

export const isSaveProjectRequest = (
  value: unknown,
): value is SaveProjectRequest => {
  if (!isRecord(value) || !Array.isArray(value.segments)) return false;
  return (
    (value.id === undefined || isProjectId(value.id)) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 120 &&
    (value.kind === "single" ||
      value.kind === "subtitles" ||
      value.kind === "dialogue") &&
    isModelId(value.modelId) &&
    typeof value.language === "string" &&
    languages.has(value.language as Language) &&
    typeof value.emotion === "string" &&
    emotions.has(value.emotion as Emotion) &&
    typeof value.speed === "number" &&
    value.speed >= 0.5 &&
    value.speed <= 2 &&
    typeof value.volume === "number" &&
    value.volume >= 0 &&
    value.volume <= 150 &&
    typeof value.pauseMs === "number" &&
    Number.isInteger(value.pauseMs) &&
    value.pauseMs >= 0 &&
    value.pauseMs <= 5_000 &&
    typeof value.expression === "string" &&
    value.expression.length <= 500 &&
    typeof value.sourceText === "string" &&
    value.sourceText.length <= 50_000 &&
    value.segments.length <= 200 &&
    value.segments.every(isProjectSegment) &&
    hasValidGenerationOptions(value) &&
    (value.voxMode !== "design" ||
      (value.modelId === "voxcpm2" &&
        typeof value.voiceDescription === "string" &&
        value.voiceDescription.trim().length >= 4))
  );
};

export const isEnqueueTaskRequest = (
  value: unknown,
): value is EnqueueTaskRequest => {
  if (!isRecord(value)) return false;
  const validProject =
    value.projectId === undefined || isProjectId(value.projectId);
  if (!validProject) return false;
  if (value.type === "generate") return isGenerationRequest(value.request);
  if (value.type === "generate-batch")
    return isBatchGenerationRequest(value.request);
  return false;
};

export const isEngineCommand = (value: unknown): value is EngineCommand => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "install":
    case "pause-download":
    case "resume-download":
    case "retry":
    case "prepare":
      return isModelId(value.modelId);
    case "generate":
      return isGenerationRequest(value.request);
    case "generate-batch":
      return isBatchGenerationRequest(value.request);
    case "cancel":
      return isVoiceId(value.jobId);
    case "set-mock-state":
      return (
        isEngineStatus(value.status) &&
        (value.modelId === undefined || isModelId(value.modelId))
      );
    default:
      return false;
  }
};

export const isExportAudioRequest = (
  value: unknown,
): value is ExportAudioRequest => {
  if (!isRecord(value)) return false;
  return (
    isVoiceId(value.resultId) &&
    typeof value.suggestedName === "string" &&
    value.suggestedName.length > 0 &&
    value.suggestedName.length <= 180 &&
    typeof value.format === "string" &&
    outputFormats.has(value.format as OutputFormat)
  );
};

export const isSetAudioFavoriteRequest = (
  value: unknown,
): value is SetAudioFavoriteRequest => {
  if (!isRecord(value)) return false;
  return isVoiceId(value.resultId) && typeof value.favorite === "boolean";
};

export const isUpdateExportNamingSettingsRequest = (
  value: unknown,
): value is UpdateExportNamingSettingsRequest =>
  isRecord(value) && isExportNamingTemplate(value.template);

const smartTextActions = new Set<SmartTextAction>(["performance"]);

export const isSmartApiBaseUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 2_048) {
    return false;
  }
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || localHttp) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export const isUpdateSmartApiConfigRequest = (
  value: unknown,
): value is UpdateSmartApiConfigRequest =>
  isRecord(value) &&
  typeof value.enabled === "boolean" &&
  isSmartApiBaseUrl(value.baseUrl) &&
  typeof value.model === "string" &&
  value.model.trim().length > 0 &&
  value.model.length <= 120 &&
  (value.apiKey === undefined ||
    (typeof value.apiKey === "string" && value.apiKey.length <= 500)) &&
  (value.clearApiKey === undefined || typeof value.clearApiKey === "boolean");

export const isSmartTextRequest = (value: unknown): value is SmartTextRequest =>
  isRecord(value) &&
  typeof value.action === "string" &&
  smartTextActions.has(value.action as SmartTextAction) &&
  typeof value.text === "string" &&
  value.text.trim().length > 0 &&
  value.text.length <= 50_000 &&
  countMeaningfulCharacters(value.text) <= 20_000 &&
  isModelId(value.modelId) &&
  typeof value.language === "string" &&
  languages.has(value.language as Language);

export const isSmartDialogueScriptRequest = (
  value: unknown,
): value is SmartDialogueScriptRequest =>
  isRecord(value) &&
  typeof value.text === "string" &&
  value.text.trim().length > 0 &&
  value.text.length <= 50_000 &&
  countMeaningfulCharacters(value.text) <= 40_000;

export const isCreateVoiceProfileRequest = (
  value: unknown,
): value is CreateVoiceProfileRequest => {
  if (!isRecord(value)) return false;
  return (
    typeof value.sampleToken === "string" &&
    value.sampleToken.length > 0 &&
    value.sampleToken.length <= 120 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 24 &&
    typeof value.referenceText === "string" &&
    value.referenceText.length <= 1_000
  );
};

export const isRenameVoiceProfileRequest = (
  value: unknown,
): value is RenameVoiceProfileRequest =>
  isRecord(value) &&
  isVoiceId(value.voiceId) &&
  typeof value.name === "string" &&
  value.name.trim().length > 0 &&
  value.name.length <= 24;

const isVoiceSampleId = (value: unknown): value is string =>
  typeof value === "string" && /^sample-[a-zA-Z0-9-]{1,120}$/u.test(value);

export const isAddVoiceSampleRequest = (
  value: unknown,
): value is AddVoiceSampleRequest =>
  isRecord(value) &&
  isVoiceId(value.voiceId) &&
  typeof value.sampleToken === "string" &&
  /^[a-f0-9-]{1,120}$/u.test(value.sampleToken) &&
  typeof value.referenceText === "string" &&
  value.referenceText.length <= 1_000;

export const isSelectVoiceSampleRequest = (
  value: unknown,
): value is SelectVoiceSampleRequest =>
  isRecord(value) &&
  isVoiceId(value.voiceId) &&
  isVoiceSampleId(value.sampleId);

export const isRemoveVoiceSampleRequest = (
  value: unknown,
): value is RemoveVoiceSampleRequest => isSelectVoiceSampleRequest(value);

export const isVoiceId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 120 &&
  /^[a-zA-Z0-9-]+$/u.test(value);
