import {
  AudioLines,
  CircleStop,
  Headphones,
  LockKeyhole,
  Mic2,
  Play,
  Plus,
  Save,
  Upload,
  WandSparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  createTextReplacementPreview,
  parseSubtitleDocument,
} from "@ai-voice-studio/audio-tools";

import {
  ENGINE_STATUS_COPY,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  MODEL_VOICE_MODE_SUPPORT,
  SINGLE_GENERATION_TEXT_LIMITS,
  VOX_VOICE_MODES,
  countMeaningfulCharacters,
  getSmartScriptDestination,
  type EngineSnapshot,
  type GenerationProject,
  type GenerationRequest,
  type SmartDialogueScriptResult,
  type ModelId,
  type VoxVoiceMode,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  Modal,
  SelectField,
  SliderField,
} from "@ai-voice-studio/ui";

import { AudioPlayer } from "../components/AudioPlayer";
import { EngineStatusPanel } from "../components/EngineStatusPanel";
import { GenerationAssistControls } from "../components/GenerationAssistControls";
import { ModelLanguageSelect } from "../components/ModelLanguageSelect";
import { PageHeader } from "../components/PageHeader";
import { PerformanceAnnotatedText } from "../components/PerformanceAnnotatedText";
import { PerformanceControls } from "../components/PerformanceControls";
import { SectionHeading } from "../components/SectionHeading";
import { SmartDialogueExtractor } from "../components/SmartDialogueExtractor";
import { SmartTextAssistant } from "../components/SmartTextAssistant";
import { desktopApi } from "../lib/desktopApi";
import { getUserErrorMessage } from "../lib/errorMessage";
import {
  createDefaultProjectTitle,
  resolveProjectTitle,
} from "../lib/projectNaming";
import {
  clearCreationDraft,
  hasMeaningfulDraftContent,
  loadCreationDraft,
  markCreationPageVisited,
  saveCreationDraft,
  type SingleCreationDraft,
} from "../lib/projectDrafts";
import { isUltimateReferenceTooLong } from "../lib/referenceAudioGuidance";
import { useStudioStore } from "../store/studioStore";

const createInitialSnapshot = (): EngineSnapshot => ({
  status: "not-installed",
  modelId: "voxcpm2",
  progress: 0,
  message: ENGINE_STATUS_COPY["not-installed"].message,
  canRetry: false,
});

export const GeneratePage = () => {
  const store = useStudioStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState(createDefaultProjectTitle);
  const [voxMode, setVoxMode] = useState<VoxVoiceMode>("controlled");
  const [voiceModeHint, setVoiceModeHint] = useState<VoxVoiceMode | null>(null);
  const [voiceDescription, setVoiceDescription] = useState("");
  const [selectedVoiceDurationSeconds, setSelectedVoiceDurationSeconds] =
    useState<number>();
  const [draggingScript, setDraggingScript] = useState(false);
  const [scriptView, setScriptView] = useState<"edit" | "annotations">("edit");
  const [resumePrompt, setResumePrompt] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<SingleCreationDraft | null>(
    null,
  );
  const snapshot =
    store.engines[store.selectedModel] ??
    store.engine ??
    createInitialSnapshot();
  const selectedVoice = store.voiceProfiles.find(
    (voice) => voice.id === store.selectedVoice,
  );
  const ultimateReferenceTooLong = isUltimateReferenceTooLong(
    selectedVoiceDurationSeconds,
  );
  const supportedVoiceModes = MODEL_VOICE_MODE_SUPPORT[store.selectedModel];
  const displayedVoiceMode = supportedVoiceModes.includes(voxMode)
    ? voxMode
    : "controlled";
  const usesVoiceDesign =
    store.selectedModel === "voxcpm2" && displayedVoiceMode === "design";
  const voiceDescriptionReady =
    countMeaningfulCharacters(voiceDescription) >= 4;
  const hasVoiceSource = usesVoiceDesign
    ? voiceDescriptionReady
    : Boolean(selectedVoice);
  const canGenerate = [
    "ready",
    "success",
    "generation-failed",
    "stopped",
  ].includes(snapshot.status);
  const hasText = Boolean(store.text.trim());
  const textLimit = SINGLE_GENERATION_TEXT_LIMITS[store.selectedModel];
  const textCharacterCount = countMeaningfulCharacters(store.text);
  const textTooLong = textCharacterCount > textLimit;
  const previewScope = createTextReplacementPreview(
    store.text,
    store.pronunciationRules,
    30,
  );
  const previewText = /[\p{L}\p{N}]/u.test(previewScope.text)
    ? previewScope.text
    : "";
  const activeVoxMode = VOX_VOICE_MODES.find(
    (mode) => mode.id === displayedVoiceMode,
  );
  const expressionDisabledReason =
    store.selectedModel !== "voxcpm2"
      ? undefined
      : voxMode === "ultimate"
        ? "极致克隆会跟随参考录音，不使用表达要求"
        : voxMode === "design"
          ? "描述造声的声音特征在上方统一填写"
          : undefined;
  const resultTextMatches =
    snapshot.result?.sourceText !== undefined &&
    snapshot.result.sourceText ===
      (snapshot.result.preview ? previewText : store.text);
  const resultProjectMatches = snapshot.result?.preview
    ? resultTextMatches
    : snapshot.result?.projectId
      ? Boolean(projectId) && snapshot.result.projectId === projectId
      : snapshot.result?.kind === "single" && resultTextMatches;
  const visibleResult =
    snapshot.result && resultTextMatches && resultProjectMatches
      ? snapshot.result
      : undefined;
  useEffect(() => {
    if (
      !MODEL_VOICE_MODE_SUPPORT[store.selectedModel].includes(voxMode) ||
      (voxMode === "ultimate" && ultimateReferenceTooLong)
    ) {
      setVoxMode("controlled");
    }
  }, [store.selectedModel, ultimateReferenceTooLong, voxMode]);

  useEffect(() => {
    setSelectedVoiceDurationSeconds(undefined);
    if (!selectedVoice?.previewUrl) return;

    const audio = document.createElement("audio");
    const readDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setSelectedVoiceDurationSeconds(audio.duration);
      }
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", readDuration);
    audio.src = selectedVoice.previewUrl;
    return () => {
      audio.removeEventListener("loadedmetadata", readDuration);
      audio.removeAttribute("src");
      audio.load();
    };
  }, [selectedVoice?.id, selectedVoice?.previewUrl]);

  useEffect(() => {
    setScriptView(store.performanceSegments.length ? "annotations" : "edit");
  }, [store.performanceSegments]);

  const importScriptFile = async (file: File) => {
    try {
      const imported = await desktopApi.documents.readDropped(file);
      const text = imported.name.toLocaleLowerCase().endsWith(".srt")
        ? parseSubtitleDocument(imported.text, "srt")
            .map((segment) => segment.text)
            .join("\n")
        : imported.text;
      store.setText(text);
      store.pushToast({
        title: `已导入 ${imported.name}`,
        description: "文字已放入文稿，可以继续编辑或智能处理。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "文稿没有导入",
        description: getUserErrorMessage(error, "请重新选择文件。"),
        tone: "danger",
      });
    }
  };

  const selectScriptFile = async () => {
    try {
      const imported = await desktopApi.documents.select();
      if (!imported) return;
      const text = imported.name.toLocaleLowerCase().endsWith(".srt")
        ? parseSubtitleDocument(imported.text, "srt")
            .map((segment) => segment.text)
            .join("\n")
        : imported.text;
      store.setText(text);
      store.pushToast({
        title: `已导入 ${imported.name}`,
        description: "文字已放入文稿，可以继续编辑或智能处理。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "文稿没有导入",
        description: getUserErrorMessage(error, "请重新选择文件。"),
        tone: "danger",
      });
    }
  };

  const handleScriptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingScript(false);
    const file = event.dataTransfer.files[0];
    if (file) void importScriptFile(file);
  };

  const currentDraftState = useMemo(
    () => ({
      kind: "single" as const,
      title: projectTitle.trim(),
      projectId: projectId || undefined,
      modelId: store.selectedModel,
      text: store.text,
      language: store.language,
      emotion: store.emotion,
      expression: store.expression,
      presetId: store.presetId,
      speed: store.speed,
      volume: store.volume,
      selectedVoice: store.selectedVoice,
      voxMode,
      voiceDescription,
      pronunciationRules: store.pronunciationRules,
      performanceSegments: store.performanceSegments,
    }),
    [
      projectId,
      projectTitle,
      store.emotion,
      store.expression,
      store.language,
      store.performanceSegments,
      store.presetId,
      store.pronunciationRules,
      store.selectedModel,
      store.selectedVoice,
      store.speed,
      store.text,
      store.volume,
      voiceDescription,
      voxMode,
    ],
  );

  const clearResumeState = () => {
    setResumeDraft(null);
    setResumePrompt(false);
  };

  const resetForNewProject = useCallback(() => {
    setResumeDraft(null);
    setResumePrompt(false);
    clearCreationDraft("single");
    setProjectId("");
    setProjectTitle(createDefaultProjectTitle());
    const current = useStudioStore.getState();
    current.setText("");
    current.setPerformanceSegments([]);
    current.setPronunciationRules([]);
    current.setPresetId("natural");
    setVoxMode("controlled");
    setVoiceDescription("");
    const fallbackVoice =
      current.voiceProfiles.find((item) => item.id === current.selectedVoice)
        ?.id ??
      current.voiceProfiles[0]?.id ??
      "";
    if (fallbackVoice) current.setSelectedVoice(fallbackVoice);
    setDraftHydrated(true);
  }, []);

  const applyDraft = useCallback((draft: SingleCreationDraft) => {
    const current = useStudioStore.getState();
    setResumeDraft(null);
    setResumePrompt(false);
    setProjectId(draft.projectId || "");
    setProjectTitle(draft.title);
    current.setSelectedModel(draft.modelId);
    current.setLanguage(draft.language);
    current.setEmotion(draft.emotion);
    current.setExpression(draft.expression);
    current.setSpeed(draft.speed);
    current.setVolume(draft.volume);
    current.setPresetId(draft.presetId);
    setVoxMode(draft.voxMode ?? "controlled");
    setVoiceDescription(draft.voiceDescription ?? "");
    current.setPronunciationRules(draft.pronunciationRules);
    current.setText(draft.text);
    current.setPerformanceSegments(draft.performanceSegments);
    if (
      draft.selectedVoice &&
      current.voiceProfiles.some((item) => item.id === draft.selectedVoice)
    ) {
      current.setSelectedVoice(draft.selectedVoice);
    }
    setDraftHydrated(true);
  }, []);

  const continueDraft = () => {
    if (!resumeDraft) {
      setResumePrompt(false);
      return;
    }
    applyDraft(resumeDraft);
  };

  const startNewProject = () => {
    resetForNewProject();
  };

  useEffect(() => {
    const revisitingThisSession = markCreationPageVisited("single");
    const requestedId = searchParams.get("project");
    if (requestedId) {
      return void desktopApi.projects.get(requestedId).then((project) => {
        if (!project || project.kind !== "single") return;
        setProjectId(project.id);
        setProjectTitle(resolveProjectTitle(project.title, project.createdAt));
        const current = useStudioStore.getState();
        const requestedResult = searchParams.get("result");
        const result = requestedResult
          ? current.results.find((item) => item.id === requestedResult)
          : undefined;
        current.setText(result?.sourceText ?? project.sourceText);
        current.setExpression(result?.expression ?? project.expression);
        current.setSelectedModel(result?.modelId ?? project.modelId);
        current.setLanguage(result?.language ?? project.language);
        current.setEmotion(result?.emotion ?? project.emotion);
        current.setSpeed(project.speed);
        current.setVolume(project.volume);
        current.setPresetId(result?.presetId ?? project.presetId ?? "natural");
        setVoxMode(result?.voxMode ?? project.voxMode ?? "controlled");
        setVoiceDescription(
          result?.voiceDescription ?? project.voiceDescription ?? "",
        );
        current.setPronunciationRules(project.pronunciationRules ?? []);
        current.setPerformanceSegments(
          project.segments.some((segment) => segment.pauseAfterMs !== undefined)
            ? project.segments.map((segment) => ({
                text: segment.text,
                pauseAfterMs: segment.pauseAfterMs ?? 260,
                mood: segment.mood ?? segment.emotion ?? "自然",
                emotion: segment.emotion,
                expression: segment.expression,
              }))
            : [],
        );
        const voiceId = project.segments[0]?.voiceId;
        if (voiceId) current.setSelectedVoice(voiceId);
        setDraftHydrated(true);
      });
    }

    const resume = loadCreationDraft("single");
    if (resume && hasMeaningfulDraftContent(resume)) {
      if (revisitingThisSession) {
        applyDraft(resume);
        return;
      }
      setResumeDraft(resume);
      setResumePrompt(true);
      return;
    }
    setProjectId("");
    setProjectTitle("");
    setResumeDraft(null);
    clearResumeState();
    const current = useStudioStore.getState();
    current.setText("");
    current.setPerformanceSegments([]);
    current.setPresetId("natural");
    setVoxMode("controlled");
    setVoiceDescription("");
    current.setPronunciationRules([]);
    setProjectTitle(createDefaultProjectTitle());
    setDraftHydrated(true);
  }, [applyDraft, resetForNewProject, searchParams]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (searchParams.get("project")) return;
    if (!currentDraftState.text.trim()) {
      clearCreationDraft("single");
      return;
    }
    if (hasMeaningfulDraftContent(currentDraftState)) {
      saveCreationDraft(currentDraftState);
    } else {
      clearCreationDraft("single");
    }
  }, [currentDraftState, draftHydrated, searchParams]);

  const saveProject = async (): Promise<GenerationProject | null> => {
    if (!projectTitle.trim()) {
      store.pushToast({
        title: "请先新建项目",
        description: "在项目名称里输入一个名字后再保存。",
        tone: "warning",
      });
      return null;
    }
    if (!store.text.trim()) {
      store.pushToast({ title: "先输入要配音的文字", tone: "warning" });
      return null;
    }
    if (textTooLong) {
      store.pushToast({
        title: `这段文字超过 ${textLimit.toLocaleString("zh-CN")} 字`,
        description: "请删短一些，或改用长稿配音逐句生成。",
        tone: "warning",
      });
      return null;
    }
    if (usesVoiceDesign && !voiceDescriptionReady) {
      store.pushToast({
        title: "先描述想要的声音",
        description: "例如：沉稳男声，音色温暖，语速自然。",
        tone: "warning",
      });
      return null;
    }
    const projectVoiceId = usesVoiceDesign
      ? undefined
      : store.selectedVoice || undefined;
    const project = await desktopApi.projects.save({
      id: projectId || undefined,
      title: projectTitle.trim(),
      kind: "single",
      modelId: store.selectedModel,
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: 0,
      expression: store.expression,
      sourceText: store.text,
      segments: store.performanceSegments.length
        ? store.performanceSegments.map((segment, index) => ({
            id: `single-${index + 1}`,
            text: segment.text,
            voiceId: projectVoiceId,
            expression: segment.expression,
            mood: segment.mood,
            emotion: segment.emotion,
            pauseAfterMs: segment.pauseAfterMs,
          }))
        : [
            {
              id: "single-1",
              text: store.text,
              voiceId: projectVoiceId,
            },
          ],
      presetId: store.presetId,
      pronunciationRules: store.pronunciationRules,
      voxMode: store.selectedModel === "voxcpm2" ? voxMode : undefined,
      voiceDescription: usesVoiceDesign ? voiceDescription.trim() : undefined,
    });
    setProjectId(project.id);
    setProjectTitle(project.title);
    saveCreationDraft({
      ...currentDraftState,
      projectId: project.id,
      title: project.title,
    });
    setResumeDraft(null);
    setResumePrompt(false);
    store.updateProject(project);
    return project;
  };

  const generate = async (regenerationId?: string) => {
    if (usesVoiceDesign && !voiceDescriptionReady) {
      store.pushToast({
        title: "先描述想要的声音",
        description: "写清楚性别、年龄感、音色和说话节奏即可。",
        tone: "warning",
      });
      return;
    }
    if (!usesVoiceDesign && !selectedVoice) {
      store.pushToast({
        title: "先克隆一个声音",
        description: "当前没有可用声音，完成克隆后才能生成。",
        tone: "warning",
      });
      return;
    }
    if (
      store.selectedModel === "voxcpm2" &&
      voxMode === "ultimate" &&
      ultimateReferenceTooLong
    ) {
      store.pushToast({
        title: "这段录音不适合极致克隆",
        description: "请换用 30 秒内录音，或改用可控克隆。",
        tone: "warning",
      });
      return;
    }
    if (
      store.selectedModel === "voxcpm2" &&
      voxMode === "ultimate" &&
      (!selectedVoice?.hasReferenceText ||
        (selectedVoice.referenceTextLength ?? 0) < 4)
    ) {
      store.pushToast({
        title: "这条声音缺少准确的录音原文",
        description:
          "极致克隆必须填写录音里实际说的完整文字；可以先改用“可控克隆”。",
        tone: "warning",
      });
      return;
    }
    if (!projectTitle.trim()) {
      store.pushToast({
        title: "请先新建项目",
        description: "在项目名称里输入一个名字后再生成。",
        tone: "warning",
      });
      return;
    }
    if (!store.text.trim()) {
      store.pushToast({ title: "先输入要说的话", tone: "warning" });
      return;
    }
    if (textTooLong) {
      store.pushToast({
        title: `最多输入 ${textLimit.toLocaleString("zh-CN")} 个字`,
        description: `当前有 ${textCharacterCount.toLocaleString("zh-CN")} 个字，空格和空行没有计入。`,
        tone: "warning",
      });
      return;
    }
    if (!canGenerate) {
      store.pushToast({
        title: "先下载当前模型",
        description: "打开“本地模型”，点击当前模型的“下载并使用”。",
        tone: "info",
      });
      return;
    }
    try {
      const project = await saveProject();
      if (!project) return;
      const request: GenerationRequest = {
        requestId: crypto.randomUUID(),
        title: project.title,
        modelId: store.selectedModel,
        voiceId: usesVoiceDesign ? "" : store.selectedVoice,
        text: store.text,
        expression: store.expression,
        language: store.language,
        emotion: store.emotion,
        speed: store.speed,
        volume: store.volume,
        format: store.format,
        presetId: store.presetId,
        pronunciationRules: store.pronunciationRules,
        performanceSegments:
          !usesVoiceDesign && store.performanceSegments.length
            ? store.performanceSegments.map((segment, index) => ({
                id: `single-${index + 1}`,
                voiceId: store.selectedVoice,
                text: segment.text,
                expression: segment.expression,
                emotion: segment.emotion,
                pauseAfterMs: segment.pauseAfterMs,
              }))
            : undefined,
        voxMode: store.selectedModel === "voxcpm2" ? voxMode : undefined,
        voiceDescription: usesVoiceDesign ? voiceDescription.trim() : undefined,
        regenerationId,
      };
      const task = await desktopApi.tasks.enqueue({
        type: "generate",
        request,
        projectId: project.id,
      });
      store.updateTask(task);
      store.pushToast({
        title: "已加入任务队列",
        description: "可以继续准备下一份稿件，任务会依次生成。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "配音没有开始生成",
        description: getUserErrorMessage(error, "请检查声音和模型后重试。"),
        tone: "danger",
      });
    }
  };

  const preview = async () => {
    if (!hasVoiceSource || !previewText || !canGenerate || textTooLong) return;
    if (
      store.selectedModel === "voxcpm2" &&
      voxMode === "ultimate" &&
      ultimateReferenceTooLong
    ) {
      store.pushToast({
        title: "这段录音不适合极致克隆",
        description: "请换用 30 秒内录音，或改用可控克隆。",
        tone: "warning",
      });
      return;
    }
    if (
      store.selectedModel === "voxcpm2" &&
      voxMode === "ultimate" &&
      (!selectedVoice?.hasReferenceText ||
        (selectedVoice.referenceTextLength ?? 0) < 4)
    ) {
      store.pushToast({
        title: "极致克隆需要完整录音原文",
        description: "请先改用“可控克隆”，或重新添加带准确原文的录音。",
        tone: "warning",
      });
      return;
    }
    const textArea =
      document.querySelector<HTMLTextAreaElement>("#script-text");
    if (textArea) {
      textArea.focus();
      textArea.setSelectionRange(0, previewScope.sourceEnd);
    }
    try {
      const previewSnapshot = await desktopApi.engine.command({
        type: "generate",
        request: {
          requestId: `preview-${crypto.randomUUID()}`,
          title: "30 字试听",
          modelId: store.selectedModel,
          voiceId: usesVoiceDesign ? "" : store.selectedVoice,
          text: previewText,
          expression: store.expression,
          language: store.language,
          emotion: store.emotion,
          speed: store.speed,
          volume: store.volume,
          format: store.format,
          preview: true,
          presetId: store.presetId,
          pronunciationRules: [],
          voxMode: store.selectedModel === "voxcpm2" ? voxMode : undefined,
          voiceDescription: usesVoiceDesign
            ? voiceDescription.trim()
            : undefined,
        },
      });
      store.setEngine(previewSnapshot);
      if (previewSnapshot.status === "generation-failed") {
        store.pushToast({
          title: "试听没有生成",
          description:
            previewSnapshot.message || "请检查声音、模型和文字后重试。",
          tone: "danger",
          durationMs: null,
          dedupeKey: `preview-failed:${Date.now()}`,
        });
      }
    } catch (error) {
      store.pushToast({
        title: "试听没有生成",
        description: getUserErrorMessage(
          error,
          "请检查声音、模型和文字后重试。",
        ),
        tone: "danger",
        durationMs: null,
      });
    }
  };

  const applyDialogueExtractionToSingle = (
    result: SmartDialogueScriptResult,
  ) => {
    if (!result.lines.length) {
      store.pushToast({
        title: "没有识别到完整角色台词",
        description: "请先检查脚本内容，或手动按句导入。",
        tone: "warning",
      });
      return;
    }
    store.setText(result.lines.map((line) => line.text).join("\n"));
    store.pushToast({
      title: `已提取 ${result.lines.length} 句单人台词`,
      description: "结果留在单段配音，可以直接试听或生成。",
      tone: "success",
    });
  };

  const routeByDialogueExtraction = (result: SmartDialogueScriptResult) => {
    const destination = getSmartScriptDestination(result);
    void navigate(`/${destination}`, {
      state: { extractedDialogue: result },
    });
  };

  const changeModel = (modelId: ModelId) => {
    store.setSelectedModel(modelId);
    if (!MODEL_LANGUAGE_SUPPORT[modelId].includes(store.language)) {
      store.setLanguage("auto");
    }
  };

  const cancel = async () => {
    if (!snapshot.jobId) return;
    store.setEngine(
      await desktopApi.engine.command({
        type: "cancel",
        jobId: snapshot.jobId,
      }),
    );
  };

  return (
    <div className="page-content generate-page">
      <PageHeader
        title="单段配音"
        description="一段文字使用一个声音，快速试听并生成音频。"
        actions={
          <div className="page-header-actions">
            <label className="project-title-field project-title-field--compact project-title-field--header">
              <span>项目名称</span>
              <input
                aria-label="项目名称"
                value={projectTitle}
                maxLength={120}
                placeholder="输入项目名称"
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={!store.text.trim() || textTooLong}
              onClick={() => void saveProject()}
            >
              <Save className="h-4 w-4" />
              {projectId ? "保存修改" : "保存项目"}
            </Button>
          </div>
        }
      />

      <div className="generate-layout">
        <div className="space-y-5">
          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="1. 准备声音"
              action={
                <span
                  className="voice-source-heading-action"
                  aria-hidden={usesVoiceDesign || undefined}
                >
                  {usesVoiceDesign ? null : (
                    <Link className="inline-action-link" to="/voices?clone=1">
                      <Plus className="h-4 w-4" />
                      克隆声音
                    </Link>
                  )}
                </span>
              }
            />
            <div
              className="vox-mode-picker"
              role="tablist"
              aria-label="声音来源"
            >
              {VOX_VOICE_MODES.map((mode) => {
                const modelSupported = supportedVoiceModes.includes(mode.id);
                const recordingBlocked =
                  store.selectedModel === "voxcpm2" &&
                  mode.id === "ultimate" &&
                  ultimateReferenceTooLong;
                const supported = modelSupported && !recordingBlocked;
                const requiredModel = modelSupported
                  ? undefined
                  : MODEL_CATALOG.find((model) =>
                      MODEL_VOICE_MODE_SUPPORT[model.id].includes(mode.id),
                    );
                const requirement = recordingBlocked
                  ? "当前录音超过 30 秒；请换短录音或使用可控克隆"
                  : requiredModel
                    ? `当前模型不支持，需要切换到 ${requiredModel.name}`
                    : "当前模型暂不支持";
                return (
                  <span
                    key={mode.id}
                    className="voice-mode-option"
                    data-supported={supported}
                    data-tooltip-open={voiceModeHint === mode.id}
                    tabIndex={supported ? undefined : 0}
                    aria-label={supported ? undefined : requirement}
                    onMouseEnter={() => {
                      if (!supported) setVoiceModeHint(mode.id);
                    }}
                    onMouseLeave={() => setVoiceModeHint(null)}
                    onFocus={() => {
                      if (!supported) setVoiceModeHint(mode.id);
                    }}
                    onBlur={() => setVoiceModeHint(null)}
                  >
                    <button
                      type="button"
                      role="tab"
                      disabled={!supported}
                      aria-disabled={!supported}
                      aria-selected={
                        supported && displayedVoiceMode === mode.id
                      }
                      data-active={supported && displayedVoiceMode === mode.id}
                      onClick={() => {
                        if (supported) setVoxMode(mode.id);
                      }}
                    >
                      <span className="voice-mode-option__title">
                        <strong>{mode.label}</strong>
                        {!supported ? (
                          <LockKeyhole
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                      <span
                        className="voice-mode-option__description"
                        title={mode.description}
                      >
                        {mode.description}
                      </span>
                    </button>
                    {!supported ? (
                      <span
                        className="voice-mode-option__requirement"
                        role="tooltip"
                      >
                        {requirement}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
            <div className="voice-source-stage">
              <div
                className="voice-source-panel"
                data-active={usesVoiceDesign}
                aria-hidden={!usesVoiceDesign}
              >
                <div className="voice-design-card">
                  <span className="voice-choice__avatar">
                    <WandSparkles className="h-5 w-5" />
                  </span>
                  <div className="voice-design-card__content">
                    <label htmlFor="voice-description">声音描述</label>
                    <textarea
                      id="voice-description"
                      value={voiceDescription}
                      maxLength={240}
                      placeholder="例如：30 岁左右的沉稳男声，音色温暖，吐字清楚，语速自然"
                      onChange={(event) =>
                        setVoiceDescription(event.target.value)
                      }
                    />
                  </div>
                  <div className="voice-design-presets">
                    {[
                      "年轻女声，温柔清澈，带轻微笑意",
                      "沉稳男声，温暖可靠，语速自然",
                      "活力青年，明亮自然，节奏轻快",
                    ].map((description) => (
                      <button
                        key={description}
                        type="button"
                        onClick={() => setVoiceDescription(description)}
                      >
                        {description.split("，")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div
                className="voice-source-panel"
                data-active={!usesVoiceDesign}
                aria-hidden={usesVoiceDesign}
              >
                <div className="voice-choice">
                  <span
                    className="voice-choice__avatar"
                    style={
                      {
                        "--voice-color": selectedVoice?.color ?? "#5ca7f7",
                      } as CSSProperties
                    }
                  >
                    <Mic2 className="h-5 w-5" />
                  </span>
                  <div className="voice-choice__details">
                    <strong>{selectedVoice?.name ?? "还没有声音"}</strong>
                    <p>
                      <span className="voice-source-description">
                        {selectedVoice
                          ? store.selectedModel === "voxcpm2"
                            ? activeVoxMode?.description
                            : `${selectedVoice.referenceSamples?.length ?? 1} 段参考录音`
                          : "先添加一段清晰人声录音。"}
                      </span>
                      <span
                        className="voice-mode-warning"
                        data-visible={
                          voxMode === "ultimate" &&
                          Boolean(selectedVoice) &&
                          (selectedVoice?.referenceTextLength ?? 0) < 4
                        }
                        title="这条声音缺少完整录音原文，请改用可控克隆。"
                      >
                        这条声音缺少完整录音原文，请改用可控克隆。
                      </span>
                    </p>
                  </div>
                  {selectedVoice ? (
                    <div className="w-[230px]">
                      <SelectField
                        label="更换声音"
                        aria-label="更换声音"
                        title={selectedVoice.name}
                        value={store.selectedVoice}
                        onChange={(event) =>
                          store.setSelectedVoice(event.target.value)
                        }
                      >
                        {store.voiceProfiles.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  ) : (
                    <Link className="inline-action-link" to="/voices?clone=1">
                      <Plus className="h-4 w-4" />
                      去克隆
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="2. 输入文字"
              action={
                <div className="smart-script-heading-actions">
                  <span className="text-[11px] font-semibold text-[#78879a]">
                    {textCharacterCount.toLocaleString()} /{" "}
                    {textLimit.toLocaleString()} 字
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void selectScriptFile()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    导入文稿
                  </Button>
                  {usesVoiceDesign ? null : (
                    <SmartTextAssistant
                      compact
                      text={store.text}
                      modelId={store.selectedModel}
                      language={store.language}
                      segments={store.performanceSegments}
                      onSegmentsChange={(segments) => {
                        store.setPerformanceSegments(segments);
                        setScriptView("annotations");
                      }}
                    />
                  )}
                  <SmartDialogueExtractor
                    text={store.text}
                    actionLabel={(result) =>
                      getSmartScriptDestination(result) === "dialogue"
                        ? "转到多人对话"
                        : "转到长稿配音"
                    }
                    onResult={routeByDialogueExtraction}
                    secondaryActionLabel={(result) =>
                      getSmartScriptDestination(result) === "subtitles"
                        ? "留在单段配音"
                        : undefined
                    }
                    onSecondaryResult={applyDialogueExtractionToSingle}
                  />
                </div>
              }
            />
            <div
              className={`script-file-drop mt-4 ${draggingScript ? "script-file-drop--active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDraggingScript(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDraggingScript(true);
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setDraggingScript(false);
                }
              }}
              onDrop={handleScriptDrop}
            >
              <div className="field-shell script-input-shell">
                <div className="field-label">
                  <label htmlFor="script-text">要说的话</label>
                  <div className="script-view-controls">
                    {store.performanceSegments.length ? (
                      <div
                        className="script-view-tabs"
                        role="tablist"
                        aria-label="切换原文和智能处理结果"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={scriptView === "edit"}
                          data-active={scriptView === "edit"}
                          onClick={() => setScriptView("edit")}
                        >
                          原文编辑
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={scriptView === "annotations"}
                          data-active={scriptView === "annotations"}
                          onClick={() => setScriptView("annotations")}
                        >
                          标注结果
                        </button>
                      </div>
                    ) : null}
                    <span className="field-hint">
                      {scriptView === "annotations"
                        ? "彩色括号不会朗读"
                        : "Ctrl + Enter 生成"}
                    </span>
                  </div>
                </div>
                <textarea
                  id="script-text"
                  hidden={scriptView === "annotations"}
                  className="field-control min-h-[144px] resize-none py-3 leading-6 generate-script-input"
                  value={store.text}
                  maxLength={50_000}
                  placeholder="在这里粘贴口播、旁白或台词…"
                  onChange={(event) => store.setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.ctrlKey && event.key === "Enter") {
                      void generate();
                    }
                  }}
                />
                {scriptView === "annotations" ? (
                  <PerformanceAnnotatedText
                    segments={store.performanceSegments}
                  />
                ) : null}
              </div>
              <span className="script-file-drop__hint">
                <Upload className="h-3.5 w-3.5" />
                可拖入 TXT、SRT、MD、CSV、Word（DOCX）或 Excel（XLSX）
              </span>
            </div>
            <p
              className={`mt-3 text-[11px] font-semibold leading-5 ${textTooLong ? "text-[#d95b5b]" : "text-[#78879a]"}`}
            >
              {textTooLong
                ? `已超出 ${(textCharacterCount - textLimit).toLocaleString()} 字，请删短后再生成。`
                : "空格和空行不计字数；较长文稿会自动分段后合成。"}
            </p>
            {previewText ? (
              <div className="preview-scope" aria-live="polite">
                <Headphones className="h-3.5 w-3.5" />
                <span>试听内容：</span>
                <mark title={previewText}>{previewText}</mark>
              </div>
            ) : null}
          </GlassCard>
        </div>

        <div className="generate-control-column space-y-5">
          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="3. 调整并生成"
              description="先确认模型和表达，再试听或生成。"
            />
            <div className="mt-4 space-y-4">
              <section
                className="model-settings-panel"
                aria-labelledby="model-settings-title"
              >
                <strong
                  className="model-settings-panel__title"
                  id="model-settings-title"
                >
                  模型与语言
                </strong>
                <div className="model-settings-panel__selects">
                  <SelectField
                    label="本地模型"
                    value={store.selectedModel}
                    onChange={(event) =>
                      changeModel(event.target.value as ModelId)
                    }
                  >
                    {MODEL_CATALOG.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </SelectField>
                  <ModelLanguageSelect
                    modelId={store.selectedModel}
                    value={store.language}
                    onChange={store.setLanguage}
                  />
                </div>
                <GenerationAssistControls
                  modelId={store.selectedModel}
                  language={store.language}
                  presetId={store.presetId}
                  rules={store.pronunciationRules}
                  onPresetChange={store.setPresetId}
                  onRulesChange={store.setPronunciationRules}
                />
                <PerformanceControls
                  compact
                  modelId={store.selectedModel}
                  language={store.language}
                  emotion={store.emotion}
                  expression={store.expression}
                  expressionDisabledReason={expressionDisabledReason}
                  onEmotionChange={store.setEmotion}
                  onExpressionChange={store.setExpression}
                />
                <div className="model-settings-panel__bottom">
                  <SliderField
                    label="音量"
                    valueLabel={`${store.volume}%`}
                    min={0}
                    max={150}
                    step={5}
                    value={store.volume}
                    onChange={(event) =>
                      store.setVolume(Number(event.target.value))
                    }
                  />
                </div>
              </section>
              <SliderField
                label="语速"
                valueLabel={`${store.speed.toFixed(2)}×`}
                min={0.5}
                max={2}
                step={0.05}
                value={store.speed}
                onChange={(event) => store.setSpeed(Number(event.target.value))}
              />
              {canGenerate ? null : (
                <EngineStatusPanel
                  snapshot={snapshot}
                  modelId={store.selectedModel}
                  onChanged={store.setEngine}
                />
              )}
              <div className="generate-actions generate-actions--primary">
                {snapshot.jobId &&
                ["loading", "generating"].includes(snapshot.status) ? (
                  <Button variant="danger" onClick={() => void cancel()}>
                    <CircleStop className="h-4 w-4" />
                    停止
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      disabled={
                        !hasVoiceSource ||
                        !canGenerate ||
                        !hasText ||
                        textTooLong
                      }
                      onClick={() => void preview()}
                    >
                      <Headphones className="h-4 w-4" />
                      试听 30 字
                    </Button>
                    <Button
                      disabled={
                        !hasVoiceSource ||
                        !canGenerate ||
                        !hasText ||
                        textTooLong
                      }
                      title={
                        textTooLong
                          ? `最多输入 ${textLimit.toLocaleString()} 个字`
                          : canGenerate
                            ? "生成完整配音"
                            : "请先下载当前模型"
                      }
                      onClick={() => void generate()}
                    >
                      <Play className="h-4 w-4 fill-current" />
                      生成配音
                    </Button>
                  </>
                )}
              </div>
            </div>
          </GlassCard>

          {visibleResult ? (
            <div className="creation-result-slot creation-result-slot--standalone">
              <AudioPlayer
                compact
                result={visibleResult}
                onRegenerate={() =>
                  void (visibleResult.preview
                    ? preview()
                    : generate(crypto.randomUUID()))
                }
              />
            </div>
          ) : snapshot.jobId &&
            ["loading", "generating"].includes(snapshot.status) ? (
            <GlassCard tone="soft" padding="lg" className="generation-callout">
              <span className="generation-callout__orb">
                <AudioLines className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3>
                  {snapshot.status === "loading" ? "正在加载模型" : "正在生成"}
                </h3>
                <p>{snapshot.message}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dfeaf5]">
                  <span
                    className="block h-full rounded-full bg-[linear-gradient(90deg,#4da3ff,#52cfa9)] transition-[width] duration-150"
                    style={{ width: `${snapshot.progress}%` }}
                  />
                </div>
              </div>
            </GlassCard>
          ) : null}
        </div>
      </div>

      <Modal
        open={resumePrompt}
        size="md"
        title="检测到未完成草稿"
        description={
          resumeDraft
            ? `上次你停留在「${resumeDraft.title}」里，已有 ${countMeaningfulCharacters(resumeDraft.text)} 个字，先前设置会保留。`
            : "检测到上次未保存草稿。"
        }
        onClose={startNewProject}
        footer={
          <>
            <Button variant="secondary" onClick={startNewProject}>
              开始新项目
            </Button>
            <Button onClick={continueDraft} disabled={Boolean(!resumeDraft)}>
              继续上次项目
            </Button>
          </>
        }
      >
        <p className="delete-voice-summary">
          继续会恢复项目名、文字、语速和智能处理结果；不继续则清空当前草稿。
        </p>
      </Modal>
    </div>
  );
};
