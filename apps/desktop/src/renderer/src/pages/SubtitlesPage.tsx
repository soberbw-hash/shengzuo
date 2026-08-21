import {
  Captions,
  FileText,
  Headphones,
  Mic2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  applyTextReplacementRules,
  parseSubtitleDocument,
  type SubtitleDocumentType,
  type SubtitleTextSegment,
} from "@ai-voice-studio/audio-tools";
import {
  ENGINE_STATUS_COPY,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  countMeaningfulCharacters,
  takeMeaningfulPrefix,
  type BatchGenerationRequest,
  type EngineSnapshot,
  type GenerationProject,
  type ModelId,
  type SmartDialogueScriptResult,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  Modal,
  SelectField,
  SliderField,
  TextAreaField,
} from "@ai-voice-studio/ui";

import { AudioPlayer } from "../components/AudioPlayer";
import { EngineStatusPanel } from "../components/EngineStatusPanel";
import { GenerationAssistControls } from "../components/GenerationAssistControls";
import { ModelLanguageSelect } from "../components/ModelLanguageSelect";
import { PageHeader } from "../components/PageHeader";
import { SmartDialogueExtractor } from "../components/SmartDialogueExtractor";
import { PerformanceControls } from "../components/PerformanceControls";
import { SectionHeading } from "../components/SectionHeading";
import { getUserErrorMessage } from "../lib/errorMessage";
import {
  clearCreationDraft,
  hasMeaningfulDraftContent,
  loadCreationDraft,
  markCreationPageVisited,
  saveCreationDraft,
  type SubtitlesCreationDraft,
} from "../lib/projectDrafts";
import { desktopApi } from "../lib/desktopApi";
import {
  createDefaultProjectTitle,
  resolveProjectTitle,
} from "../lib/projectNaming";
import {
  findLatestSegmentGenerationTask,
  resolveSegmentGenerationState,
  SEGMENT_GENERATION_STATE_LABEL,
  type SegmentGenerationState,
} from "../lib/segmentGenerationState";
import { useStudioStore } from "../store/studioStore";

interface SubtitleDraft extends SubtitleTextSegment {
  id: string;
}

const MAX_SEGMENTS = 200;
const exampleText =
  "欢迎来到今天的分享。第一部分，我们先说明这次更新。\n第二部分，再介绍具体的使用方法。最后，检查每一句并生成完整音轨。";
const captureSrt =
  "1\n00:00:01,200 --> 00:00:04,000\n欢迎来到今天的产品介绍。\n\n2\n00:00:04,400 --> 00:00:08,200\n这份字幕会使用同一个声音逐句配音。\n\n3\n00:00:08,600 --> 00:00:12,000\n检查完成后，合并成一条完整音轨。";

const toDrafts = (segments: SubtitleTextSegment[]): SubtitleDraft[] =>
  segments.map((segment, index) => ({
    ...segment,
    id: `subtitle-${index + 1}`,
  }));

const getDocumentType = (fileName: string): SubtitleDocumentType =>
  fileName.toLocaleLowerCase().endsWith(".srt") ? "srt" : "txt";

const formatCueTime = (value: string): string =>
  value.startsWith("00:") ? value.slice(3) : value;

export const SubtitlesPage = () => {
  const store = useStudioStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const captureMode = ["subtitles", "interaction"].includes(
    new URLSearchParams(window.location.search).get("capture") ?? "",
  );
  const [sourceText, setSourceText] = useState(captureMode ? captureSrt : "");
  const [segments, setSegments] = useState<SubtitleDraft[]>(() =>
    captureMode ? toDrafts(parseSubtitleDocument(captureSrt, "srt")) : [],
  );
  const [fileName, setFileName] = useState(captureMode ? "产品介绍.srt" : "");
  const [pause, setPause] = useState(420);
  const [projectId, setProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState(createDefaultProjectTitle);
  const [draggingDocument, setDraggingDocument] = useState(false);
  const [resumePrompt, setResumePrompt] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<SubtitlesCreationDraft | null>(
    null,
  );
  const routedExtraction = (
    location.state as { extractedDialogue?: SmartDialogueScriptResult } | null
  )?.extractedDialogue;
  const snapshot: EngineSnapshot = store.engines[store.selectedModel] ?? {
    status: "not-installed",
    modelId: store.selectedModel,
    progress: 0,
    message: ENGINE_STATUS_COPY["not-installed"].message,
    canRetry: false,
  };
  const canGenerate = [
    "ready",
    "success",
    "generation-failed",
    "stopped",
  ].includes(snapshot.status);
  const validSegments = segments.filter((segment) => segment.text.trim());
  const currentProject = store.projects.find(
    (project) => project.id === projectId && project.kind === "subtitles",
  );
  const segmentTask = currentProject
    ? findLatestSegmentGenerationTask(store.tasks, {
        projectId: currentProject.id,
        kind: "subtitles",
        totalSegments: validSegments.length,
        projectUpdatedAt: currentProject.updatedAt,
      })
    : undefined;
  const batchIndexBySegmentId = new Map(
    validSegments.map((segment, index) => [segment.id, index]),
  );
  const projectSegmentById = new Map(
    currentProject?.segments.map((segment) => [segment.id, segment]) ?? [],
  );
  const getSegmentGenerationState = (
    segment: SubtitleDraft,
  ): SegmentGenerationState => {
    const batchIndex = batchIndexBySegmentId.get(segment.id);
    const savedSegment = projectSegmentById.get(segment.id);
    if (
      batchIndex === undefined ||
      !savedSegment ||
      savedSegment.text.trim() !== segment.text.trim()
    ) {
      return "pending";
    }
    return resolveSegmentGenerationState(segmentTask, batchIndex);
  };
  const isOverLimit = validSegments.length > MAX_SEGMENTS;
  const hasLongSegment = validSegments.some(
    (segment) => segment.text.length > 2_000,
  );
  const preparedPreviewText = takeMeaningfulPrefix(
    applyTextReplacementRules(
      validSegments.map((segment) => segment.text).join(" "),
      store.pronunciationRules,
    ),
    30,
  );
  const previewText = /[\p{L}\p{N}]/u.test(preparedPreviewText)
    ? preparedPreviewText
    : "";
  const visibleResult =
    snapshot.result &&
    ((snapshot.result.preview && snapshot.result.sourceText === previewText) ||
      (!snapshot.result.preview &&
        snapshot.result.kind === "subtitles" &&
        Boolean(projectId) &&
        snapshot.result.projectId === projectId))
      ? snapshot.result
      : undefined;
  const draftState: SubtitlesCreationDraft = useMemo(
    () => ({
      kind: "subtitles",
      title: projectTitle.trim(),
      projectId: projectId || undefined,
      modelId: store.selectedModel,
      sourceText,
      fileName,
      pauseMs: pause,
      language: store.language,
      emotion: store.emotion,
      expression: store.expression,
      presetId: store.presetId,
      speed: store.speed,
      volume: store.volume,
      selectedVoice: store.selectedVoice,
      pronunciationRules: store.pronunciationRules,
      segments: segments.map((segment) => ({
        id: segment.id,
        text: segment.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
      })),
    }),
    [
      projectTitle,
      projectId,
      sourceText,
      fileName,
      pause,
      store.selectedModel,
      store.language,
      store.emotion,
      store.expression,
      store.presetId,
      store.speed,
      store.volume,
      store.selectedVoice,
      store.pronunciationRules,
      segments,
    ],
  );

  const restoreDraft = (draft: SubtitlesCreationDraft) => {
    setProjectId(draft.projectId || "");
    setProjectTitle(draft.title);
    setSourceText(draft.sourceText);
    setFileName(draft.fileName ?? "");
    setPause(draft.pauseMs);
    setSegments(
      toDrafts(
        draft.segments.map((segment) => ({
          id: segment.id,
          text: segment.text,
          startTime: segment.startTime,
          endTime: segment.endTime,
        })),
      ),
    );
    const current = useStudioStore.getState();
    current.setSelectedModel(draft.modelId);
    current.setLanguage(draft.language);
    current.setEmotion(draft.emotion);
    current.setExpression(draft.expression);
    current.setSpeed(draft.speed);
    current.setVolume(draft.volume);
    current.setPresetId(draft.presetId ?? "longform");
    current.setPronunciationRules(draft.pronunciationRules);
    if (
      draft.selectedVoice &&
      current.voiceProfiles.some((item) => item.id === draft.selectedVoice)
    ) {
      current.setSelectedVoice(draft.selectedVoice);
    }
    setDraftHydrated(true);
  };

  const resetForNewProject = useCallback(() => {
    setResumePrompt(false);
    setResumeDraft(null);
    clearCreationDraft("subtitles");
    setProjectId("");
    setProjectTitle(createDefaultProjectTitle());
    setSourceText("");
    setSegments([]);
    setFileName("");
    setPause(420);
    const current = useStudioStore.getState();
    current.setPronunciationRules([]);
    current.setPresetId("longform");
    setDraftHydrated(true);
  }, []);

  const continueDraft = () => {
    if (!resumeDraft) return;
    setResumePrompt(false);
    restoreDraft(resumeDraft);
    setResumeDraft(null);
  };

  const startNewProject = () => {
    resetForNewProject();
  };

  const applyDialogueExtraction = useCallback(
    (result: SmartDialogueScriptResult, keepingMultipleRoles = false) => {
      const extracted = result.lines.slice(0, MAX_SEGMENTS);
      const extractedSegments = extracted.map((line, index) => ({
        id: `smart-subtitle-${index + 1}`,
        text: line.text,
      }));
      if (extractedSegments.length === 0) {
        useStudioStore.getState().pushToast({
          title: "没有提取到可配音台词",
          description: "请确认脚本里有完整台词后重试。",
          tone: "warning",
        });
        return;
      }
      setSourceText(
        extractedSegments.map((segment) => segment.text).join("\n"),
      );
      setSegments(toDrafts(extractedSegments));
      setFileName("提取台词.txt");
      const roles = new Set(
        extracted.map((line) => line.role.trim() || "旁白"),
      );
      if (roles.size >= 2) {
        useStudioStore.getState().pushToast({
          title: `已按一个声音写入 ${extractedSegments.length} 句台词`,
          description: keepingMultipleRoles
            ? "角色名不会朗读，全部句子会使用右侧选择的统一声音。"
            : `识别到 ${roles.size} 个角色；如需分别选声音，请转到多人对话。`,
          tone: keepingMultipleRoles ? "success" : "warning",
        });
      } else {
        useStudioStore.getState().pushToast({
          title: `已识别 ${extractedSegments.length} 句台词`,
          description: "可以直接逐句确认后生成长稿配音。",
          tone: "success",
        });
      }
    },
    [],
  );

  const routeOrApplyDialogueExtraction = useCallback(
    (result: SmartDialogueScriptResult) => {
      const roles = new Set(
        result.lines
          .filter((line) => line.text.trim())
          .map((line) => line.role.trim() || "旁白"),
      );
      if (roles.size >= 2) {
        void navigate("/dialogue", {
          state: { extractedDialogue: result },
        });
        return;
      }
      applyDialogueExtraction(result);
    },
    [applyDialogueExtraction, navigate],
  );

  useEffect(() => {
    const revisitingThisSession = markCreationPageVisited("subtitles");
    const requestedId = searchParams.get("project");
    if (!requestedId) {
      if (routedExtraction) return;
      if (captureMode) {
        setProjectTitle(createDefaultProjectTitle());
        setDraftHydrated(true);
        return;
      }
      const resume = loadCreationDraft("subtitles");
      if (resume && hasMeaningfulDraftContent(resume)) {
        if (revisitingThisSession) {
          restoreDraft(resume);
          return;
        }
        setResumeDraft(resume);
        setResumePrompt(true);
        return;
      }
      setResumeDraft(null);
      setResumePrompt(false);
      const current = useStudioStore.getState();
      setProjectId("");
      setProjectTitle("");
      current.setPresetId("longform");
      setSourceText("");
      setSegments([]);
      setFileName("");
      setPause(420);
      current.setPronunciationRules([]);
      setProjectTitle(createDefaultProjectTitle());
      setDraftHydrated(true);
      return;
    }
    void desktopApi.projects.get(requestedId).then((project) => {
      if (!project || project.kind !== "subtitles") return;
      const current = useStudioStore.getState();
      const requestedResult = searchParams.get("result");
      const result = requestedResult
        ? current.results.find((item) => item.id === requestedResult)
        : undefined;
      const restoredText = result?.sourceText ?? project.sourceText;
      setProjectId(project.id);
      setProjectTitle(resolveProjectTitle(project.title, project.createdAt));
      setSourceText(restoredText);
      setSegments(
        result?.sourceText
          ? toDrafts(parseSubtitleDocument(result.sourceText, "auto"))
          : project.segments.map((segment) => ({
              id: segment.id,
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
            })),
      );
      setPause(project.pauseMs);
      current.setSelectedModel(result?.modelId ?? project.modelId);
      current.setLanguage(result?.language ?? project.language);
      current.setEmotion(result?.emotion ?? project.emotion);
      current.setExpression(result?.expression ?? project.expression);
      current.setPresetId(result?.presetId ?? project.presetId ?? "longform");
      current.setPronunciationRules(project.pronunciationRules ?? []);
      current.setSpeed(project.speed);
      current.setVolume(project.volume);
      const voiceId = project.segments.find(
        (segment) => segment.voiceId,
      )?.voiceId;
      if (voiceId) current.setSelectedVoice(voiceId);
      setDraftHydrated(true);
    });
  }, [captureMode, routedExtraction, searchParams]);

  useEffect(() => {
    if (!routedExtraction || searchParams.get("project")) return;
    resetForNewProject();
    applyDialogueExtraction(routedExtraction);
    void navigate("/subtitles", { replace: true, state: null });
  }, [
    applyDialogueExtraction,
    navigate,
    resetForNewProject,
    routedExtraction,
    searchParams,
  ]);

  useEffect(() => {
    if (!draftHydrated) return;
    const shouldSaveDraft = searchParams.get("project") === null;
    if (!shouldSaveDraft) return;
    if (!sourceText.trim() && !segments.length) {
      clearCreationDraft("subtitles");
      return;
    }
    if (hasMeaningfulDraftContent(draftState)) {
      saveCreationDraft(draftState);
    }
  }, [draftHydrated, searchParams, draftState, sourceText, segments]);

  const applyDocument = (
    content: string,
    type: SubtitleDocumentType,
    importedName = "",
  ) => {
    const parsed = parseSubtitleDocument(content, type);
    setSourceText(content);
    setSegments(toDrafts(parsed));
    setFileName(importedName);
    return parsed.length;
  };

  const importDocument = async (file: File) => {
    try {
      const imported = await desktopApi.documents.readDropped(file);
      const count = applyDocument(
        imported.text,
        getDocumentType(imported.name),
        imported.name,
      );
      if (count === 0) {
        store.pushToast({
          title: "没有找到可配音的文字",
          description: "请检查文件内容后重试。",
          tone: "warning",
        });
      }
    } catch (error) {
      store.pushToast({
        title: "文稿没有导入",
        description: getUserErrorMessage(error, "请重新选择文件。"),
        tone: "danger",
      });
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) await importDocument(file);
    input.value = "";
  };

  const dropDocument = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingDocument(false);
    const file = event.dataTransfer.files[0];
    if (file) void importDocument(file);
  };

  const updateSourceText = (value: string) => {
    applyDocument(value, "auto");
  };

  const updateSegment = (id: string, text: string) => {
    setSegments((current) =>
      current.map((segment) =>
        segment.id === id ? { ...segment, text } : segment,
      ),
    );
  };

  const removeSegment = (id: string) => {
    setSegments((current) => current.filter((segment) => segment.id !== id));
  };

  const saveProject = async (): Promise<GenerationProject | null> => {
    if (!projectTitle.trim()) {
      store.pushToast({
        title: "请先新建项目",
        description: "在项目名称里输入一个名字后再保存。",
        tone: "warning",
      });
      return null;
    }
    if (segments.length === 0) {
      store.pushToast({ title: "先导入或粘贴稿件", tone: "warning" });
      return null;
    }
    const currentSourceText = segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n");
    if (!currentSourceText) {
      store.pushToast({ title: "先输入稿件内容", tone: "warning" });
      return null;
    }
    const project = await desktopApi.projects.save({
      id: projectId || undefined,
      title: projectTitle.trim(),
      kind: "subtitles",
      modelId: store.selectedModel,
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: pause,
      expression: store.expression,
      sourceText: currentSourceText,
      segments: segments.map((segment) => ({
        ...segment,
        voiceId: store.selectedVoice || undefined,
      })),
      presetId: store.presetId,
      pronunciationRules: store.pronunciationRules,
    });
    setProjectId(project.id);
    saveCreationDraft({
      ...draftState,
      projectId: project.id,
      title: project.title,
    });
    store.updateProject(project);
    return project;
  };

  const generate = async (regenerationId?: string) => {
    if (!store.selectedVoice || validSegments.length === 0 || !canGenerate)
      return;
    if (isOverLimit || hasLongSegment) {
      store.pushToast({
        title: "稿件需要再整理一下",
        description: isOverLimit
          ? `一次最多生成 ${MAX_SEGMENTS} 句，请删减或拆成两次生成。`
          : "单句不能超过 2,000 字，请拆成更短的句子。",
        tone: "warning",
      });
      return;
    }
    try {
      const project = await saveProject();
      if (!project) return;
      const request: BatchGenerationRequest = {
        requestId: crypto.randomUUID(),
        modelId: store.selectedModel,
        segments: validSegments.map((segment) => ({
          id: segment.id,
          voiceId: store.selectedVoice,
          text: segment.text.trim(),
          expression: store.expression,
        })),
        language: store.language,
        emotion: store.emotion,
        speed: store.speed,
        volume: store.volume,
        pauseMs: pause,
        format: "mp3",
        title: project.title,
        kind: "subtitles",
        projectId: project.id,
        sourceText: project.sourceText,
        presetId: store.presetId,
        pronunciationRules: store.pronunciationRules,
        regenerationId,
      };
      const task = await desktopApi.tasks.enqueue({
        type: "generate-batch",
        request,
        projectId: project.id,
      });
      store.updateTask(task);
      store.pushToast({
        title: "已保存项目并加入队列",
        description: "可以继续准备下一份稿件；失败后只重做未完成的句子。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "长稿配音没有开始生成",
        description: getUserErrorMessage(error, "请检查声音和模型后重试。"),
        tone: "danger",
      });
    }
  };

  const preview = async () => {
    if (!store.selectedVoice || !previewText || !canGenerate) return;
    try {
      const previewSnapshot = await desktopApi.engine.command({
        type: "generate",
        request: {
          requestId: `preview-${crypto.randomUUID()}`,
          title: "长稿试听 30 字",
          modelId: store.selectedModel,
          voiceId: store.selectedVoice,
          text: previewText,
          expression: store.expression,
          language: store.language,
          emotion: store.emotion,
          speed: store.speed,
          volume: store.volume,
          format: "mp3",
          preview: true,
          presetId: store.presetId,
          pronunciationRules: [],
        },
      });
      store.setEngine(previewSnapshot);
      if (previewSnapshot.status === "generation-failed") {
        store.pushToast({
          title: "长稿试听没有生成",
          description:
            previewSnapshot.message || "请检查声音、模型和文稿后重试。",
          tone: "danger",
          durationMs: null,
          dedupeKey: `preview-failed:${Date.now()}`,
        });
      }
    } catch (error) {
      store.pushToast({
        title: "长稿试听没有生成",
        description: getUserErrorMessage(
          error,
          "请检查声音、模型和稿件内容后重试。",
        ),
        tone: "danger",
        durationMs: null,
      });
    }
  };

  return (
    <div className="page-content subtitle-page">
      <PageHeader
        title="长稿配音"
        description="整篇文稿使用一个声音，逐句调整后合并成完整音轨。"
        actions={
          <div className="page-header-actions">
            <label className="project-title-field project-title-field--compact project-title-field--header">
              <span>项目名称</span>
              <input
                aria-label="项目名称"
                value={projectTitle}
                placeholder="输入项目名称"
                maxLength={120}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={segments.length === 0 || sourceText.trim().length === 0}
              onClick={() => void saveProject()}
            >
              <Save className="h-4 w-4" />
              {projectId ? "保存修改" : "保存项目"}
            </Button>
          </div>
        }
      />

      <div className="subtitle-workspace">
        <div className="subtitle-workspace__main min-w-0">
          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="1. 导入稿件"
              description="SRT 保留时间码；其他文稿按标点和换行自动拆句。"
              action={
                <div className="smart-script-heading-actions">
                  <label className="file-button">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    选择文件
                    <input
                      type="file"
                      accept=".srt,.txt,.md,.markdown,.csv,.docx,.xlsx"
                      onChange={(event) => void importFile(event)}
                    />
                  </label>
                  <SmartDialogueExtractor
                    text={sourceText}
                    onResult={routeOrApplyDialogueExtraction}
                    actionLabel={(result) => {
                      const roles = new Set(
                        result.lines
                          .filter((line) => line.text.trim())
                          .map((line) => line.role.trim() || "旁白"),
                      );
                      return roles.size >= 2 ? "转到多人对话" : "写入长稿配音";
                    }}
                    secondaryActionLabel={(result) => {
                      const roles = new Set(
                        result.lines
                          .filter((line) => line.text.trim())
                          .map((line) => line.role.trim() || "旁白"),
                      );
                      return roles.size >= 2 ? "仍用一个声音" : undefined;
                    }}
                    onSecondaryResult={(result) =>
                      applyDialogueExtraction(result, true)
                    }
                  />
                </div>
              }
            />
            {fileName ? (
              <p className="imported-file-name" title={`已导入：${fileName}`}>
                已导入：{fileName}
              </p>
            ) : null}
            <div
              className={`subtitle-document-drop mt-4 ${
                draggingDocument ? "subtitle-document-drop--active" : ""
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDraggingDocument(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDraggingDocument(true);
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setDraggingDocument(false);
                }
              }}
              onDrop={dropDocument}
            >
              <TextAreaField
                label="稿件内容"
                hint={`${sourceText.length.toLocaleString()} / 50,000 字`}
                className="subtitle-source-input"
                placeholder="也可以直接把长文粘贴到这里，会自动按标点和换行拆句…"
                value={sourceText}
                maxLength={50_000}
                onChange={(event) => updateSourceText(event.target.value)}
              />
              <span className="script-file-drop__hint">
                <Upload className="h-3.5 w-3.5" />
                可拖入 SRT、TXT、Word（DOCX）或 Excel（XLSX）
              </span>
            </div>
            {!sourceText ? (
              <button
                type="button"
                className="sample-text-button"
                onClick={() => applyDocument(exampleText, "txt")}
              >
                <FileText className="h-3.5 w-3.5" />
                看一个示例
              </button>
            ) : null}
          </GlassCard>

          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="2. 逐句检查"
              description={
                validSegments.length > 0
                  ? `${validSegments.length} 句 · 可直接修改或删除，再统一生成。`
                  : "导入稿件后，每一句会显示在这里。"
              }
            />
            {segments.length > 0 ? (
              <div className="subtitle-segment-list">
                {segments.map((segment, index) => {
                  const segmentState = getSegmentGenerationState(segment);
                  return (
                    <article
                      key={segment.id}
                      className="subtitle-segment"
                      data-state={segmentState}
                      title={SEGMENT_GENERATION_STATE_LABEL[segmentState]}
                      aria-label={`第 ${index + 1} 句，${SEGMENT_GENERATION_STATE_LABEL[segmentState]}`}
                    >
                      <div className="subtitle-segment__meta">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        {segment.startTime && segment.endTime ? (
                          <small>
                            {formatCueTime(segment.startTime)}–
                            {formatCueTime(segment.endTime)}
                          </small>
                        ) : null}
                      </div>
                      <textarea
                        aria-label={`第 ${index + 1} 句`}
                        value={segment.text}
                        maxLength={2_000}
                        rows={2}
                        onChange={(event) =>
                          updateSegment(segment.id, event.target.value)
                        }
                      />
                      <button
                        type="button"
                        aria-label={`删除第 ${index + 1} 句`}
                        title="删除这句"
                        onClick={() => removeSegment(segment.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="subtitle-empty">
                <Captions className="h-5 w-5" />
                <span>还没有可配音的句子</span>
              </div>
            )}
            {isOverLimit ? (
              <p className="subtitle-limit-warning">
                当前超过 {MAX_SEGMENTS} 句，请删减或拆成两次生成。
              </p>
            ) : null}
          </GlassCard>
        </div>

        <GlassCard tone="solid" padding="lg" className="subtitle-settings-card">
          <SectionHeading
            title="3. 生成设置"
            description="全部句子使用同一个声音，最后合并为一个 MP3。"
          />
          <div className="subtitle-settings">
            <div className="subtitle-settings__grid">
              <SelectField
                label="本地模型"
                value={store.selectedModel}
                onChange={(event) => {
                  const modelId = event.target.value as ModelId;
                  store.setSelectedModel(modelId);
                  if (
                    !MODEL_LANGUAGE_SUPPORT[modelId].includes(store.language)
                  ) {
                    store.setLanguage("auto");
                  }
                }}
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
              modelId={store.selectedModel}
              language={store.language}
              emotion={store.emotion}
              expression={store.expression}
              onEmotionChange={store.setEmotion}
              onExpressionChange={store.setExpression}
            />
            <div className="subtitle-settings__grid">
              {store.voiceProfiles.length > 0 ? (
                <SelectField
                  label="统一声音"
                  title={
                    store.voiceProfiles.find(
                      (voice) => voice.id === store.selectedVoice,
                    )?.name
                  }
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
              ) : (
                <div className="subtitle-voice-empty">
                  <Mic2 className="h-4 w-4" />
                  <span>还没有声音</span>
                  <Link to="/voices?clone=1">去克隆</Link>
                </div>
              )}
              <SliderField
                label="每句停顿"
                valueLabel={`${pause} 毫秒`}
                min={0}
                max={1_200}
                step={20}
                value={pause}
                onChange={(event) => setPause(Number(event.target.value))}
              />
            </div>
            {!canGenerate ? (
              <EngineStatusPanel
                snapshot={snapshot}
                modelId={store.selectedModel}
                onChanged={store.setEngine}
              />
            ) : null}
          </div>
          {previewText ? (
            <div className="preview-scope">
              <Headphones className="h-3.5 w-3.5" />
              <span>试听内容：</span>
              <mark title={previewText}>{previewText}</mark>
            </div>
          ) : null}
          <div className="batch-generate-actions">
            <Button
              variant="secondary"
              disabled={!previewText || !store.selectedVoice || !canGenerate}
              onClick={() => void preview()}
            >
              <Headphones className="h-4 w-4" />
              试听 30 字
            </Button>
            <Button
              disabled={
                validSegments.length === 0 ||
                !store.selectedVoice ||
                !canGenerate ||
                isOverLimit ||
                hasLongSegment
              }
              onClick={() => void generate()}
            >
              {snapshot.status === "generating"
                ? "正在逐句生成…"
                : "生成完整音轨"}
            </Button>
          </div>
          {visibleResult ? (
            <div className="creation-result-slot">
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
          ) : null}
        </GlassCard>
      </div>

      <Modal
        open={resumePrompt}
        size="md"
        title="检测到未完成草稿"
        description={
          resumeDraft
            ? `上次你停留在「${resumeDraft.title}」里，已有 ${countMeaningfulCharacters(
                resumeDraft.sourceText,
              )} 个字，先前配置会保留。`
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
          继续将恢复项目名、稿件文本、统一停顿和模型配置，不继续会清空草稿。
        </p>
      </Modal>
    </div>
  );
};
