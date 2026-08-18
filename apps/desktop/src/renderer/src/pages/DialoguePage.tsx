import {
  Headphones,
  MessagesSquare,
  Mic2,
  Plus,
  Save,
  ScanText,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { parseDialogueScript } from "@ai-voice-studio/audio-tools";
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
  const [projectTitle, setProjectTitle] = useState("多人对话项目");
  const [lines, setLines] = useState<DialogueLine[]>([createLine("旁白", "")]);
  const [scriptInput, setScriptInput] = useState("");
  const [organizingScript, setOrganizingScript] = useState(false);
  const [smartDialogueReview, setSmartDialogueReview] =
    useState<SmartDialogueScriptResult | null>(null);
  const [voiceAssignments, setVoiceAssignments] = useState<
    Record<string, string>
  >({});
  const [roleEmotions, setRoleEmotions] = useState<Record<string, Emotion>>({});
  const [roleSpeeds, setRoleSpeeds] = useState<Record<string, number>>({});
  const activeRoles = useMemo(
    () => [...new Set(lines.map((line) => normalizeRole(line.role)))],
    [lines],
  );
  const snapshot: EngineSnapshot = store.engines[store.selectedModel] ?? {
    status: "not-installed",
    modelId: store.selectedModel,
    progress: 0,
    message: ENGINE_STATUS_COPY["not-installed"].message,
    canRetry: false,
  };
  const usableLines = lines.filter((line) => line.text.trim());
  const previewLine = usableLines[0];
  const previewText = takeMeaningfulPrefix(previewLine?.text ?? "", 30);
  const canGenerate =
    usableLines.length > 0 &&
    store.voiceProfiles.length > 0 &&
    ["ready", "success", "generation-failed", "stopped"].includes(
      snapshot.status,
    );

  useEffect(() => {
    const requestedId = searchParams.get("project");
    if (!requestedId) {
      const current = useStudioStore.getState();
      current.setPresetId("expressive");
      current.setPronunciationRules([]);
      return;
    }
    void desktopApi.projects.get(requestedId).then((project) => {
      if (!project || project.kind !== "dialogue") return;
      setProjectId(project.id);
      setProjectTitle(project.title);
      setScriptInput(project.sourceText);
      setLines(
        project.segments.map((segment) => ({
          id: segment.id,
          role: segment.label?.trim() || "旁白",
          text: segment.text,
        })),
      );
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
      const current = useStudioStore.getState();
      current.setSelectedModel(project.modelId);
      current.setLanguage(project.language);
      current.setEmotion(project.emotion);
      current.setExpression(project.expression);
      current.setPresetId(project.presetId ?? "expressive");
      current.setPronunciationRules(project.pronunciationRules ?? []);
      current.setSpeed(project.speed);
      current.setVolume(project.volume);
    });
  }, [searchParams]);

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
        description: error instanceof Error ? error.message : "请稍后重试。",
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
    if (lines.every((line) => !line.text.trim())) {
      store.pushToast({ title: "先填写对话台词", tone: "warning" });
      return null;
    }
    const project = await desktopApi.projects.save({
      id: projectId || undefined,
      title: projectTitle.trim() || "多人对话项目",
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
          voiceId: voiceAssignments[role] ?? store.selectedVoice ?? undefined,
          expression: store.expression,
          emotion: roleEmotions[role] ?? store.emotion,
          speed: roleSpeeds[role] ?? store.speed,
        };
      }),
      presetId: store.presetId,
      pronunciationRules: store.pronunciationRules,
    });
    setProjectId(project.id);
    store.updateProject(project);
    return project;
  };

  const generate = async () => {
    if (!canGenerate) return;
    const project = await saveProject();
    if (!project) return;
    const request: BatchGenerationRequest = {
      requestId: crypto.randomUUID(),
      modelId: store.selectedModel,
      segments: usableLines.map((line) => {
        const role = normalizeRole(line.role);
        return {
          id: line.id,
          voiceId: voiceAssignments[role] ?? store.selectedVoice,
          text: line.text.trim(),
          label: role,
          expression: store.expression,
          emotion: roleEmotions[role] ?? store.emotion,
          speed: roleSpeeds[role] ?? store.speed,
        };
      }),
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: 260,
      format: "mp3",
      title: "多人对话",
      kind: "dialogue",
      projectId: project.id,
      presetId: store.presetId,
      pronunciationRules: store.pronunciationRules,
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
  };

  const preview = async () => {
    if (!previewLine || !previewText || !canGenerate) return;
    const role = normalizeRole(previewLine.role);
    const voiceId = voiceAssignments[role] ?? store.selectedVoice;
    if (!voiceId) return;
    store.setEngine(
      await desktopApi.engine.command({
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
          pronunciationRules: store.pronunciationRules,
        },
      }),
    );
  };

  return (
    <div className="page-content dialogue-page">
      <PageHeader
        title="多人对话"
        description="适合短剧和播客：不同角色使用不同声音，合成完整对话。"
        actions={
          <Button
            variant="secondary"
            disabled={lines.every((line) => !line.text.trim())}
            onClick={() => void saveProject()}
          >
            <Save className="h-4 w-4" />
            {projectId ? "保存修改" : "保存项目"}
          </Button>
        }
      />

      <label className="project-title-field project-title-field--compact">
        <span>项目名称</span>
        <input
          value={projectTitle}
          maxLength={120}
          onChange={(event) => setProjectTitle(event.target.value)}
        />
      </label>

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
          <div className="dialogue-script-import">
            <TextAreaField
              id="dialogue-script-input"
              label="粘贴小说或脚本"
              className="min-h-[100px]"
              placeholder={"可粘贴小说、分镜稿，或“角色名：台词”格式的脚本…"}
              value={scriptInput}
              maxLength={50_000}
              onChange={(event) => setScriptInput(event.target.value)}
            />
            <div className="dialogue-script-actions">
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
                  {organizingScript ? "正在整理…" : "智能整理脚本"}
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
                    按“角色名：台词”逐行拆分；不识别场景、动作或小说叙述，不调用
                    API。
                  </span>
                </span>
              </span>
            </div>
          </div>
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
            <EngineStatusPanel
              snapshot={snapshot}
              modelId={store.selectedModel}
              onChanged={store.setEngine}
            />
          </div>
          <div className="dialogue-lines" aria-label="对话台词列表">
            {lines.map((line, index) => (
              <article key={line.id} className="dialogue-line-editor">
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
            ))}
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
            title="角色声音"
            description="同一角色会统一使用这里选择的声音。"
          />
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
                    <strong>{role}</strong>
                  </div>
                  <SelectField
                    label="使用声音"
                    value={voiceAssignments[role] ?? store.selectedVoice}
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

          <div className="dialogue-generate-note">
            <MessagesSquare className="h-4 w-4" />
            <span>
              模型和语言整段统一；每个角色可单独设置声音
              {modelCapabilities.emotion ? "、情绪" : ""}和语速。
            </span>
          </div>
          {previewText && previewLine ? (
            <div className="preview-scope">
              <Headphones className="h-3.5 w-3.5" />
              <span>试听“{normalizeRole(previewLine.role)}”前 30 个字：</span>
              <mark>{previewText}</mark>
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
          {snapshot.result?.preview || snapshot.result?.kind === "dialogue" ? (
            <div className="mt-4">
              <AudioPlayer
                result={snapshot.result}
                onRegenerate={() =>
                  void (snapshot.result?.preview ? preview() : generate())
                }
              />
            </div>
          ) : null}
        </GlassCard>
      </div>

      <Modal
        open={Boolean(smartDialogueReview)}
        size="lg"
        title="确认智能整理结果"
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
            <Button onClick={applyOrganizedScript}>使用整理结果</Button>
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
                  <strong>{line.role}</strong>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
