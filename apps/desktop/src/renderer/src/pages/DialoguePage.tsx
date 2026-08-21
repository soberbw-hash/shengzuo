import {
  Headphones,
  Mic2,
  Plus,
  Save,
  ScanText,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
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
  parseDialogueScript,
} from "@ai-voice-studio/audio-tools";
import {
  ENGINE_STATUS_COPY,
  EMOTION_OPTIONS,
  getModelGenerationCapabilities,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  takeMeaningfulPrefix,
  type BatchGenerationRequest,
  type Emotion,
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
  TextField,
} from "@ai-voice-studio/ui";

import { PageHeader } from "../components/PageHeader";
import { AudioPlayer } from "../components/AudioPlayer";
import { EngineStatusPanel } from "../components/EngineStatusPanel";
import { GenerationAssistControls } from "../components/GenerationAssistControls";
import { ModelLanguageSelect } from "../components/ModelLanguageSelect";
import { PerformanceControls } from "../components/PerformanceControls";
import { SectionHeading } from "../components/SectionHeading";
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
  type DialogueCreationDraft,
} from "../lib/projectDrafts";
import {
  findLatestSegmentGenerationTask,
  resolveSegmentGenerationState,
  SEGMENT_GENERATION_STATE_LABEL,
  type SegmentGenerationState,
} from "../lib/segmentGenerationState";
import { useSmartApiAvailability } from "../hooks/useSmartApiAvailability";
import { useStudioStore } from "../store/studioStore";

interface DialogueLine {
  id: string;
  role: string;
  text: string;
}

const MAX_DIALOGUE_LINES = 200;
const normalizeRole = (role: string): string => role.trim() || "旁白";

const createLine = (role = "旁白", text = ""): DialogueLine => ({
  id: crypto.randomUUID(),
  role,
  text,
});

export const DialoguePage = () => {
  const store = useStudioStore();
  const location = useLocation();
  const navigate = useNavigate();
  const smartDialogueTooltipId = useId();
  const directDialogueTooltipId = useId();
  const { status: apiStatus, configured: apiConfigured } =
    useSmartApiAvailability();
  const modelCapabilities = getModelGenerationCapabilities(
    store.selectedModel,
    store.language,
  );
  const [searchParams] = useSearchParams();
  const [projectId, setProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState(createDefaultProjectTitle);
  const [lines, setLines] = useState<DialogueLine[]>([createLine("旁白", "")]);
  const [scriptInput, setScriptInput] = useState("");
  const [organizingScript, setOrganizingScript] = useState(false);
  const [draggingScript, setDraggingScript] = useState(false);
  const [smartDialogueReview, setSmartDialogueReview] =
    useState<SmartDialogueScriptResult | null>(null);
  const [voiceAssignments, setVoiceAssignments] = useState<
    Record<string, string>
  >({});
  const [roleEmotions, setRoleEmotions] = useState<Record<string, Emotion>>({});
  const [roleSpeeds, setRoleSpeeds] = useState<Record<string, number>>({});
  const [resumePrompt, setResumePrompt] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<DialogueCreationDraft | null>(
    null,
  );
  const routedExtraction = (
    location.state as { extractedDialogue?: SmartDialogueScriptResult } | null
  )?.extractedDialogue;
  const activeRoles = useMemo(
    () => [
      ...new Set(
        lines
          .filter((line) => line.text.trim())
          .map((line) => normalizeRole(line.role)),
      ),
    ],
    [lines],
  );
  const availableVoiceIds = new Set(
    store.voiceProfiles.map((voice) => voice.id),
  );
  const resolveRoleVoiceId = (role: string): string | undefined => {
    const assigned = voiceAssignments[role];
    if (assigned && availableVoiceIds.has(assigned)) return assigned;
    return availableVoiceIds.has(store.selectedVoice)
      ? store.selectedVoice
      : undefined;
  };
  const rolesWithoutVoice = activeRoles.filter(
    (role) => !resolveRoleVoiceId(role),
  );
  const snapshot: EngineSnapshot = store.engines[store.selectedModel] ?? {
    status: "not-installed",
    modelId: store.selectedModel,
    progress: 0,
    message: ENGINE_STATUS_COPY["not-installed"].message,
    canRetry: false,
  };
  const usableLines = lines.filter((line) => line.text.trim());
  const currentProject = store.projects.find(
    (project) => project.id === projectId && project.kind === "dialogue",
  );
  const segmentTask = currentProject
    ? findLatestSegmentGenerationTask(store.tasks, {
        projectId: currentProject.id,
        kind: "dialogue",
        totalSegments: usableLines.length,
        projectUpdatedAt: currentProject.updatedAt,
      })
    : undefined;
  const batchIndexByLineId = new Map(
    usableLines.map((line, index) => [line.id, index]),
  );
  const projectSegmentById = new Map(
    currentProject?.segments.map((segment) => [segment.id, segment]) ?? [],
  );
  const getLineGenerationState = (
    line: DialogueLine,
  ): SegmentGenerationState => {
    const batchIndex = batchIndexByLineId.get(line.id);
    const savedSegment = projectSegmentById.get(line.id);
    if (
      batchIndex === undefined ||
      !savedSegment ||
      savedSegment.text.trim() !== line.text.trim() ||
      savedSegment.label !== normalizeRole(line.role)
    ) {
      return "pending";
    }
    return resolveSegmentGenerationState(segmentTask, batchIndex);
  };
  const previewCandidate = usableLines
    .map((line) => ({
      line,
      text: applyTextReplacementRules(line.text, store.pronunciationRules),
    }))
    .find((item) => /[\p{L}\p{N}]/u.test(item.text));
  const previewLine = previewCandidate?.line;
  const previewText = takeMeaningfulPrefix(previewCandidate?.text ?? "", 30);
  const visibleResult =
    snapshot.result &&
    ((snapshot.result.preview && snapshot.result.sourceText === previewText) ||
      (!snapshot.result.preview &&
        snapshot.result.kind === "dialogue" &&
        Boolean(projectId) &&
        snapshot.result.projectId === projectId))
      ? snapshot.result
      : undefined;
  const canGenerate =
    usableLines.length > 0 &&
    rolesWithoutVoice.length === 0 &&
    ["ready", "success", "generation-failed", "stopped"].includes(
      snapshot.status,
    );
  const draftState = useMemo(
    () => ({
      kind: "dialogue" as const,
      title: projectTitle.trim(),
      projectId: projectId || undefined,
      modelId: store.selectedModel,
      scriptInput,
      lines: lines.map((line) => ({
        id: line.id,
        role: line.role,
        text: line.text,
      })),
      language: store.language,
      emotion: store.emotion,
      expression: store.expression,
      presetId: store.presetId,
      speed: store.speed,
      volume: store.volume,
      selectedVoice: store.selectedVoice,
      pronunciationRules: store.pronunciationRules,
      voiceAssignments,
      roleEmotions,
      roleSpeeds,
    }),
    [
      projectId,
      projectTitle,
      lines,
      scriptInput,
      store.language,
      store.emotion,
      store.expression,
      store.presetId,
      store.selectedModel,
      store.selectedVoice,
      store.speed,
      store.pronunciationRules,
      store.volume,
      voiceAssignments,
      roleEmotions,
      roleSpeeds,
    ],
  );

  const clearResumeState = () => {
    setResumeDraft(null);
    setResumePrompt(false);
  };

  const resetForNewProject = useCallback(() => {
    clearResumeState();
    clearCreationDraft("dialogue");
    setProjectId("");
    setProjectTitle(createDefaultProjectTitle());
    setLines([createLine("旁白", "")]);
    setScriptInput("");
    setVoiceAssignments({});
    setRoleEmotions({});
    setRoleSpeeds({});
    const current = useStudioStore.getState();
    current.setPresetId("natural");
    current.setPronunciationRules([]);
    setDraftHydrated(true);
  }, []);

  const applyDraft = useCallback((draft: DialogueCreationDraft) => {
    const current = useStudioStore.getState();
    setResumeDraft(null);
    setResumePrompt(false);
    setProjectId(draft.projectId || "");
    setProjectTitle(draft.title);
    setScriptInput(draft.scriptInput);
    const restoredLines =
      draft.lines.length > 0
        ? draft.lines.map((line) => ({
            id: line.id || crypto.randomUUID(),
            role: line.role || "旁白",
            text: line.text,
          }))
        : [createLine("旁白", "")];
    setLines(restoredLines);
    setVoiceAssignments(draft.voiceAssignments);
    setRoleEmotions(draft.roleEmotions);
    setRoleSpeeds(draft.roleSpeeds);
    current.setSelectedModel(draft.modelId);
    current.setLanguage(draft.language);
    current.setEmotion(draft.emotion);
    current.setExpression(draft.expression);
    current.setSpeed(draft.speed);
    current.setVolume(draft.volume);
    current.setPresetId(draft.presetId);
    current.setPronunciationRules(draft.pronunciationRules);
    if (
      draft.selectedVoice &&
      current.voiceProfiles.some((voice) => voice.id === draft.selectedVoice)
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
    if (!routedExtraction || searchParams.get("project")) return;
    resetForNewProject();
    const nextLines = routedExtraction.lines
      .slice(0, MAX_DIALOGUE_LINES)
      .map((line) => ({
        id: crypto.randomUUID(),
        role: line.role,
        text: line.text,
      }));
    setLines(nextLines.length ? nextLines : [createLine()]);
    setScriptInput(
      routedExtraction.lines
        .map((line) => `${line.role}：${line.text}`)
        .join("\n"),
    );
    useStudioStore.getState().pushToast({
      title: `已带入 ${nextLines.length} 句台词`,
      description: `${routedExtraction.roles.length} 个角色，可以继续修改和分配声音。`,
      tone: "success",
    });
    void navigate("/dialogue", { replace: true, state: null });
  }, [routedExtraction, navigate, resetForNewProject, searchParams]);

  useEffect(() => {
    const revisitingThisSession = markCreationPageVisited("dialogue");
    const requestedId = searchParams.get("project");
    if (!requestedId) {
      if (routedExtraction) return;
      const resume = loadCreationDraft("dialogue");
      if (resume && hasMeaningfulDraftContent(resume)) {
        if (revisitingThisSession) {
          applyDraft(resume);
          return;
        }
        setResumeDraft(resume);
        setResumePrompt(true);
        return;
      }
      resetForNewProject();
      return;
    }
    void desktopApi.projects.get(requestedId).then((project) => {
      if (!project || project.kind !== "dialogue") return;
      const current = useStudioStore.getState();
      const requestedResult = searchParams.get("result");
      const result = requestedResult
        ? current.results.find((item) => item.id === requestedResult)
        : undefined;
      const restoredText = result?.sourceText ?? project.sourceText;
      const restoredLines = result?.sourceText
        ? parseDialogueScript(restoredText).map((line) => ({
            id: crypto.randomUUID(),
            role: line.character,
            text: line.text,
          }))
        : project.segments.map((segment) => ({
            id: segment.id,
            role: segment.label?.trim() || "旁白",
            text: segment.text,
          }));
      setProjectId(project.id);
      setProjectTitle(resolveProjectTitle(project.title, project.createdAt));
      setScriptInput(restoredText);
      setLines(restoredLines.length ? restoredLines : [createLine()]);
      setVoiceAssignments(
        project.segments.reduce<Record<string, string>>(
          (assignments, segment) => {
            if (segment.label && segment.voiceId) {
              assignments[segment.label] = segment.voiceId;
            }
            return assignments;
          },
          {},
        ),
      );
      setRoleEmotions(
        project.segments.reduce<Record<string, Emotion>>(
          (assignments, segment) => {
            if (segment.label && segment.emotion) {
              assignments[segment.label] = segment.emotion;
            }
            return assignments;
          },
          {},
        ),
      );
      setRoleSpeeds(
        project.segments.reduce<Record<string, number>>(
          (assignments, segment) => {
            if (segment.label && segment.speed) {
              assignments[segment.label] = segment.speed;
            }
            return assignments;
          },
          {},
        ),
      );
      current.setSelectedModel(result?.modelId ?? project.modelId);
      current.setLanguage(result?.language ?? project.language);
      current.setEmotion(result?.emotion ?? project.emotion);
      current.setExpression(result?.expression ?? project.expression);
      current.setPresetId(result?.presetId ?? project.presetId ?? "natural");
      current.setPronunciationRules(project.pronunciationRules ?? []);
      current.setSpeed(project.speed);
      current.setVolume(project.volume);
      setDraftHydrated(true);
    });
  }, [applyDraft, routedExtraction, resetForNewProject, searchParams]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (searchParams.get("project")) return;
    if (hasMeaningfulDraftContent(draftState)) {
      saveCreationDraft(draftState);
      return;
    }
    clearCreationDraft("dialogue");
  }, [searchParams, draftHydrated, draftState]);

  const updateLine = (id: string, changes: Partial<DialogueLine>) => {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...changes } : line)),
    );
  };

  const removeLine = (id: string) => {
    setLines((current) =>
      current.length === 1
        ? [createLine()]
        : current.filter((line) => line.id !== id),
    );
  };

  const recognizeScript = () => {
    const parsed = parseDialogueScript(scriptInput).slice(
      0,
      MAX_DIALOGUE_LINES,
    );
    if (parsed.length === 0) {
      store.pushToast({ title: "没有识别到台词", tone: "warning" });
      return;
    }
    setLines(
      parsed.map((line) => ({
        id: crypto.randomUUID(),
        role: line.character,
        text: line.text,
      })),
    );
    store.pushToast({
      title: `已识别 ${parsed.length} 句、${new Set(parsed.map((line) => line.character)).size} 个角色`,
      tone: "success",
    });
  };

  const applyImportedDocument = (name: string, text: string) => {
    setScriptInput(text);
    store.pushToast({
      title: `已导入 ${name}`,
      description: "可直接识别规范脚本，或用智能处理提取角色和台词。",
      tone: "success",
    });
  };

  const selectScriptDocument = async () => {
    try {
      const imported = await desktopApi.documents.select();
      if (imported) applyImportedDocument(imported.name, imported.text);
    } catch (error) {
      store.pushToast({
        title: "文稿没有导入",
        description: getUserErrorMessage(error, "请重新选择文件。"),
        tone: "danger",
      });
    }
  };

  const dropScriptDocument = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingScript(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    void desktopApi.documents
      .readDropped(file)
      .then((imported) => applyImportedDocument(imported.name, imported.text))
      .catch((error: unknown) => {
        store.pushToast({
          title: "文稿没有导入",
          description: getUserErrorMessage(error, "请重新选择文件。"),
          tone: "danger",
        });
      });
  };

  const organizeScript = async () => {
    if (!scriptInput.trim() || organizingScript || !apiConfigured) return;
    setOrganizingScript(true);
    try {
      setSmartDialogueReview(
        await desktopApi.smart.processDialogue({ text: scriptInput }),
      );
    } catch (error) {
      store.pushToast({
        title: "脚本没有整理完成",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setOrganizingScript(false);
    }
  };

  const applyOrganizedScript = () => {
    if (!smartDialogueReview) return;
    const nextLines = smartDialogueReview.lines.map((line) => ({
      id: crypto.randomUUID(),
      role: line.role,
      text: line.text,
    }));
    setLines(nextLines);
    setScriptInput(
      smartDialogueReview.lines
        .map((line) => `${line.role}：${line.text}`)
        .join("\n"),
    );
    setSmartDialogueReview(null);
    store.pushToast({
      title: `已整理 ${nextLines.length} 句台词`,
      description: `${smartDialogueReview.roles.length} 个角色，可以继续修改和分配声音。`,
      tone: "success",
    });
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
    if (lines.every((line) => !line.text.trim())) {
      store.pushToast({ title: "先填写对话台词", tone: "warning" });
      return null;
    }
    const project = await desktopApi.projects.save({
      id: projectId || undefined,
      title: projectTitle.trim(),
      kind: "dialogue",
      modelId: store.selectedModel,
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: 260,
      expression: store.expression,
      sourceText: lines
        .map((line) => `${normalizeRole(line.role)}：${line.text}`)
        .join("\n"),
      segments: lines.map((line) => {
        const role = normalizeRole(line.role);
        return {
          id: line.id,
          text: line.text,
          label: role,
          voiceId: resolveRoleVoiceId(role),
          expression: store.expression,
          emotion: roleEmotions[role] ?? store.emotion,
          speed: roleSpeeds[role] ?? store.speed,
        };
      }),
      presetId: store.presetId,
      pronunciationRules: store.pronunciationRules,
    });
    setProjectId(project.id);
    saveCreationDraft({
      ...draftState,
      projectId: project.id,
      title: project.title,
    });
    setResumeDraft(null);
    setResumePrompt(false);
    store.updateProject(project);
    return project;
  };

  const generate = async (regenerationId?: string) => {
    if (!projectTitle.trim()) {
      store.pushToast({
        title: "请先新建项目",
        description: "在项目名称里输入一个名字后再生成。",
        tone: "warning",
      });
      return;
    }
    if (rolesWithoutVoice.length) {
      store.pushToast({
        title: "还有角色没有选择声音",
        description: `请先给${rolesWithoutVoice.slice(0, 3).join("、")}选择声音。`,
        tone: "warning",
      });
      return;
    }
    if (!canGenerate) return;
    try {
      const project = await saveProject();
      if (!project) return;
      const segments: BatchGenerationRequest["segments"] = [];
      for (const line of usableLines) {
        const role = normalizeRole(line.role);
        const voiceId = resolveRoleVoiceId(role);
        if (!voiceId) {
          store.pushToast({
            title: `先给“${role}”选择声音`,
            tone: "warning",
          });
          return;
        }
        segments.push({
          id: line.id,
          voiceId,
          text: line.text.trim(),
          label: role,
          expression: store.expression,
          emotion: roleEmotions[role] ?? store.emotion,
          speed: roleSpeeds[role] ?? store.speed,
        });
      }
      const request: BatchGenerationRequest = {
        requestId: crypto.randomUUID(),
        modelId: store.selectedModel,
        segments,
        language: store.language,
        emotion: store.emotion,
        speed: store.speed,
        volume: store.volume,
        pauseMs: 260,
        format: "mp3",
        title: project.title,
        kind: "dialogue",
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
        title: "对话已加入任务队列",
        description: "可以继续编辑其他内容，任务会依次生成。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "多人对话没有开始生成",
        description: getUserErrorMessage(error, "请检查声音和模型后重试。"),
        tone: "danger",
      });
    }
  };

  const preview = async () => {
    if (!previewLine || !previewText || !canGenerate) return;
    const role = normalizeRole(previewLine.role);
    const voiceId = resolveRoleVoiceId(role);
    if (!voiceId) return;
    try {
      const previewSnapshot = await desktopApi.engine.command({
        type: "generate",
        request: {
          requestId: `preview-${crypto.randomUUID()}`,
          title: `${role}试听 30 字`,
          modelId: store.selectedModel,
          voiceId,
          text: previewText,
          expression: store.expression,
          language: store.language,
          emotion: roleEmotions[role] ?? store.emotion,
          speed: roleSpeeds[role] ?? store.speed,
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
          title: "角色试听没有生成",
          description:
            previewSnapshot.message || "请检查角色声音、模型和台词后重试。",
          tone: "danger",
          durationMs: null,
          dedupeKey: `preview-failed:${Date.now()}`,
        });
      }
    } catch (error) {
      store.pushToast({
        title: "角色试听没有生成",
        description: getUserErrorMessage(
          error,
          "请检查角色声音、模型和台词后重试。",
        ),
        tone: "danger",
        durationMs: null,
      });
    }
  };

  return (
    <div className="page-content dialogue-page">
      <PageHeader
        title="多人对话"
        description="多个角色分别选择声音，按台词顺序合成完整对话。"
        actions={
          <div className="page-header-actions">
            <label className="project-title-field project-title-field--compact project-title-field--header">
              <span>项目名称</span>
              <input
                aria-label="项目名称"
                placeholder="输入项目名称"
                value={projectTitle}
                maxLength={120}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={lines.every((line) => !line.text.trim())}
              onClick={() => void saveProject()}
            >
              <Save className="h-4 w-4" />
              {projectId ? "保存修改" : "保存项目"}
            </Button>
          </div>
        }
      />

      <div className="dialogue-layout">
        <GlassCard
          tone="solid"
          padding="lg"
          className="dialogue-script-card min-w-0"
        >
          <SectionHeading
            title="对话台词"
            description={`${lines.length} 句 · ${activeRoles.length} 个角色；可直接粘贴“角色名：台词”。`}
            action={
              <Button
                size="sm"
                variant="secondary"
                disabled={lines.length >= MAX_DIALOGUE_LINES}
                onClick={() =>
                  setLines((current) => [...current, createLine()])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                添加一句
              </Button>
            }
          />
          <div
            className={`dialogue-script-import dialogue-document-drop ${
              draggingScript ? "dialogue-document-drop--active" : ""
            }`}
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
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDraggingScript(false);
              }
            }}
            onDrop={dropScriptDocument}
          >
            <TextAreaField
              id="dialogue-script-input"
              label="粘贴脚本或文稿"
              className="min-h-[100px]"
              placeholder={"可粘贴分镜稿、对白稿，或“角色名：台词”格式的脚本…"}
              value={scriptInput}
              maxLength={50_000}
              onChange={(event) => setScriptInput(event.target.value)}
            />
            <div className="dialogue-script-actions">
              <Button
                variant="ghost"
                onClick={() => void selectScriptDocument()}
              >
                <Upload className="h-4 w-4" />
                导入文稿
              </Button>
              <span
                className="smart-text-help-trigger"
                tabIndex={apiConfigured ? undefined : 0}
              >
                <Button
                  disabled={
                    !scriptInput.trim() || organizingScript || !apiConfigured
                  }
                  aria-describedby={smartDialogueTooltipId}
                  onClick={() => void organizeScript()}
                >
                  <Sparkles className="h-4 w-4" />
                  {organizingScript ? "正在提取…" : "智能提取角色"}
                </Button>
                <span
                  className="smart-text-tooltip"
                  id={smartDialogueTooltipId}
                  role="tooltip"
                >
                  {apiStatus === "configured" ? (
                    <>
                      <strong>提取角色与台词</strong>
                      <span>
                        删除场景、镜头、动作、表情和音效等非朗读内容，整理成可编辑的角色台词。结果会先给你确认。
                      </span>
                    </>
                  ) : apiStatus === "loading" ? (
                    <>
                      <strong>正在读取 API配置</strong>
                      <span>读取完成后会自动显示是否可以使用。</span>
                    </>
                  ) : apiStatus === "key-error" ? (
                    <>
                      <strong>保存的 API Key 无法读取</strong>
                      <span>到设置里重新输入 API Key，再保存并验证。</span>
                    </>
                  ) : apiStatus === "missing-key" ? (
                    <>
                      <strong>还需填写 API Key</strong>
                      <span>到设置里输入 API Key，再保存并验证。</span>
                    </>
                  ) : apiStatus === "error" ? (
                    <>
                      <strong>API配置读取失败</strong>
                      <span>请重开软件，或到设置里重新保存并验证。</span>
                    </>
                  ) : (
                    <>
                      <strong>需要先配置 API</strong>
                      <span>
                        打开设置里的“API配置”，填写接口信息后才能使用。
                      </span>
                    </>
                  )}
                </span>
              </span>
              <span className="smart-text-help-trigger">
                <Button
                  variant="secondary"
                  disabled={!scriptInput.trim()}
                  aria-describedby={directDialogueTooltipId}
                  onClick={recognizeScript}
                >
                  <ScanText className="h-4 w-4" />
                  直接识别
                </Button>
                <span
                  className="smart-text-tooltip"
                  id={directDialogueTooltipId}
                  role="tooltip"
                >
                  <strong>按格式拆分台词</strong>
                  <span>
                    按“角色名：台词”逐行拆分；不识别场景、动作或其他非台词内容，不调用
                    API。
                  </span>
                </span>
              </span>
            </div>
            <span className="script-file-drop__hint dialogue-script-file-hint">
              <Upload className="h-3.5 w-3.5" />
              可拖入 TXT、SRT、Word（DOCX）或 Excel（XLSX）
            </span>
          </div>
          <div className="dialogue-lines" aria-label="对话台词列表">
            {lines.map((line, index) => {
              const lineState = getLineGenerationState(line);
              return (
                <article
                  key={line.id}
                  className="dialogue-line-editor"
                  data-state={lineState}
                  title={SEGMENT_GENERATION_STATE_LABEL[lineState]}
                  aria-label={`第 ${index + 1} 句台词，${SEGMENT_GENERATION_STATE_LABEL[lineState]}`}
                >
                  <span className="line-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="dialogue-line-editor__role">
                    <TextField
                      label="角色"
                      value={line.role}
                      maxLength={24}
                      onChange={(event) =>
                        updateLine(line.id, { role: event.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <TextAreaField
                      label="台词"
                      className="dialogue-line-editor__text"
                      placeholder="输入这个角色要说的话…"
                      value={line.text}
                      maxLength={2_000}
                      onChange={(event) =>
                        updateLine(line.id, { text: event.target.value })
                      }
                    />
                  </div>
                  <button
                    className="mini-play dialogue-line-editor__remove"
                    aria-label={`删除第 ${index + 1} 句`}
                    onClick={() => removeLine(line.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
          </div>
          <Button
            variant="secondary"
            fullWidth
            className="dialogue-add-line mt-3"
            disabled={lines.length >= MAX_DIALOGUE_LINES}
            onClick={() => setLines((current) => [...current, createLine()])}
          >
            <Plus className="h-4 w-4" />
            继续添加台词
          </Button>
        </GlassCard>

        <GlassCard tone="solid" padding="lg" className="dialogue-role-card">
          <SectionHeading
            title="声音与生成"
            description="整段统一模型和语言，每个角色单独选择声音。"
          />
          <div className="dialogue-global-controls">
            <SelectField
              label="本地模型"
              value={store.selectedModel}
              onChange={(event) => {
                const modelId = event.target.value as ModelId;
                store.setSelectedModel(modelId);
                if (!MODEL_LANGUAGE_SUPPORT[modelId].includes(store.language)) {
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
            {snapshot.status !== "ready" && snapshot.status !== "success" ? (
              <EngineStatusPanel
                snapshot={snapshot}
                modelId={store.selectedModel}
                onChanged={store.setEngine}
              />
            ) : null}
          </div>
          <strong className="dialogue-role-list-title">角色声音</strong>
          {store.voiceProfiles.length === 0 ? (
            <div className="dialogue-voice-empty">
              <span>
                <Mic2 className="h-5 w-5" />
              </span>
              <strong>还没有可分配的声音</strong>
              <p>先克隆自己的声音，再回来给角色分配。</p>
              <Link className="inline-action-link" to="/voices?clone=1">
                <Plus className="h-4 w-4" />
                去克隆声音
              </Link>
            </div>
          ) : (
            <div className="dialogue-role-list">
              {activeRoles.map((role) => (
                <article key={role} className="role-settings-card">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="role-avatar">{role.slice(0, 1)}</span>
                    <strong title={role}>{role}</strong>
                  </div>
                  <SelectField
                    label="使用声音"
                    title={
                      store.voiceProfiles.find(
                        (voice) => voice.id === resolveRoleVoiceId(role),
                      )?.name
                    }
                    value={resolveRoleVoiceId(role) ?? ""}
                    onChange={(event) =>
                      setVoiceAssignments((current) => ({
                        ...current,
                        [role]: event.target.value,
                      }))
                    }
                  >
                    {store.voiceProfiles.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </SelectField>
                  <div className="role-performance-grid">
                    {modelCapabilities.emotion ? (
                      <SelectField
                        label="情绪"
                        value={roleEmotions[role] ?? store.emotion}
                        onChange={(event) =>
                          setRoleEmotions((current) => ({
                            ...current,
                            [role]: event.target.value as Emotion,
                          }))
                        }
                      >
                        {EMOTION_OPTIONS.map((emotion) => (
                          <option key={emotion} value={emotion}>
                            {emotion}
                          </option>
                        ))}
                      </SelectField>
                    ) : null}
                    <SliderField
                      label="语速"
                      valueLabel={`${(roleSpeeds[role] ?? store.speed).toFixed(2)}×`}
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={roleSpeeds[role] ?? store.speed}
                      onChange={(event) =>
                        setRoleSpeeds((current) => ({
                          ...current,
                          [role]: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          )}

          {previewText && previewLine ? (
            <div className="preview-scope">
              <Headphones className="h-3.5 w-3.5" />
              <span>试听“{normalizeRole(previewLine.role)}”：</span>
              <mark title={previewText}>{previewText}</mark>
            </div>
          ) : null}
          <div className="batch-generate-actions">
            <Button
              variant="secondary"
              disabled={!canGenerate || !previewText}
              onClick={() => void preview()}
            >
              <Headphones className="h-4 w-4" />
              试听 30 字
            </Button>
            <Button disabled={!canGenerate} onClick={() => void generate()}>
              {snapshot.status === "generating" ? "正在生成…" : "生成整段对话"}
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
        open={Boolean(smartDialogueReview)}
        size="lg"
        title="确认角色和台词"
        description={
          smartDialogueReview
            ? `识别出 ${smartDialogueReview.roles.length} 个角色、${smartDialogueReview.lines.length} 句台词。确认后才会替换当前内容。`
            : undefined
        }
        onClose={() => setSmartDialogueReview(null)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setSmartDialogueReview(null)}
            >
              保留原稿
            </Button>
            <Button onClick={applyOrganizedScript}>使用这些台词</Button>
          </>
        }
      >
        {smartDialogueReview ? (
          <div className="dialogue-smart-review">
            <div className="dialogue-smart-review__summary">
              <Sparkles className="h-4 w-4" />
              <div>
                <strong>本次做了什么</strong>
                <p>{smartDialogueReview.summary}</p>
                {smartDialogueReview.removedContent.length ? (
                  <div>
                    <span>已去除</span>
                    {smartDialogueReview.removedContent.map((item) => (
                      <small key={item}>{item}</small>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="dialogue-smart-review__lines">
              {smartDialogueReview.lines.map((line, index) => (
                <div key={`${line.role}-${index}`}>
                  <strong title={line.role}>{line.role}</strong>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={resumePrompt}
        size="md"
        title="检测到未完成草稿"
        description={
          resumeDraft
            ? `上次你停留在「${resumeDraft.title}」里，已有 ${
                resumeDraft.scriptInput.trim().length
              } 个字符，先前角色设置会保留。`
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
          继续会恢复项目名、台词、角色配音和音色设置；不继续会清空草稿。
        </p>
      </Modal>
    </div>
  );
};
