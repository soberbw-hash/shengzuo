import {
  Captions,
  FileText,
  Headphones,
  Mic2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  parseSubtitleDocument,
  type SubtitleDocumentType,
  type SubtitleTextSegment,
} from "@ai-voice-studio/audio-tools";
import {
  ENGINE_STATUS_COPY,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  takeMeaningfulPrefix,
  type BatchGenerationRequest,
  type EngineSnapshot,
  type GenerationProject,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  SelectField,
  SliderField,
  TextAreaField,
} from "@ai-voice-studio/ui";

import { AudioPlayer } from "../components/AudioPlayer";
import { EngineStatusPanel } from "../components/EngineStatusPanel";
import { GenerationAssistControls } from "../components/GenerationAssistControls";
import { ModelLanguageSelect } from "../components/ModelLanguageSelect";
import { PageHeader } from "../components/PageHeader";
import { PerformanceControls } from "../components/PerformanceControls";
import { SectionHeading } from "../components/SectionHeading";
import { desktopApi } from "../lib/desktopApi";
import { useStudioStore } from "../store/studioStore";

interface SubtitleDraft extends SubtitleTextSegment {
  id: string;
}

const MAX_SEGMENTS = 200;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const exampleText =
  "欢迎来到今天的分享。第一部分，我们先说明这次更新。\n第二部分，再介绍具体的使用方法。最后，检查每一句并生成完整音轨。";
const captureSrt =
  "1\n00:00:01,200 --> 00:00:04,000\n欢迎来到今天的产品介绍。\n\n2\n00:00:04,400 --> 00:00:08,200\n这份字幕会使用同一个声音逐句配音。\n\n3\n00:00:08,600 --> 00:00:12,000\n检查完成后，合并成一条完整音轨。";

const toDrafts = (segments: SubtitleTextSegment[]): SubtitleDraft[] =>
  segments.map((segment, index) => ({
    ...segment,
    id: `subtitle-${index + 1}`,
  }));

const decodeTextFile = async (file: File): Promise<string> => {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("gb18030").decode(bytes);
};

const getDocumentType = (fileName: string): SubtitleDocumentType =>
  fileName.toLocaleLowerCase().endsWith(".srt") ? "srt" : "txt";

const formatCueTime = (value: string): string =>
  value.startsWith("00:") ? value.slice(3) : value;

export const SubtitlesPage = () => {
  const store = useStudioStore();
  const [searchParams] = useSearchParams();
  const captureMode = ["subtitles", "interaction"].includes(
    new URLSearchParams(window.location.search).get("capture") ?? "",
  );
  const [sourceText, setSourceText] = useState(captureMode ? captureSrt : "");
  const [segments, setSegments] = useState<SubtitleDraft[]>(() =>
    captureMode ? toDrafts(parseSubtitleDocument(captureSrt, "srt")) : [],
  );
  const [fileName, setFileName] = useState(captureMode ? "产品介绍.srt" : "");
  const [sourceType, setSourceType] = useState<"srt" | "txt">(
    captureMode ? "srt" : "txt",
  );
  const [pause, setPause] = useState(420);
  const [projectId, setProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState("字幕配音项目");
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
  const isOverLimit = validSegments.length > MAX_SEGMENTS;
  const hasLongSegment = validSegments.some(
    (segment) => segment.text.length > 2_000,
  );
  const previewText = takeMeaningfulPrefix(
    validSegments.map((segment) => segment.text).join(" "),
    30,
  );

  useEffect(() => {
    const requestedId = searchParams.get("project");
    if (!requestedId) {
      const current = useStudioStore.getState();
      current.setPresetId("longform");
      current.setPronunciationRules([]);
      return;
    }
    void desktopApi.projects.get(requestedId).then((project) => {
      if (!project || project.kind !== "subtitles") return;
      setProjectId(project.id);
      setProjectTitle(project.title);
      setSourceText(project.sourceText);
      setSegments(
        project.segments.map((segment) => ({
          id: segment.id,
          text: segment.text,
          startTime: segment.startTime,
          endTime: segment.endTime,
        })),
      );
      setPause(project.pauseMs);
      const current = useStudioStore.getState();
      current.setSelectedModel(project.modelId);
      current.setLanguage(project.language);
      current.setEmotion(project.emotion);
      current.setExpression(project.expression);
      current.setPresetId(project.presetId ?? "longform");
      current.setPronunciationRules(project.pronunciationRules ?? []);
      current.setSpeed(project.speed);
      current.setVolume(project.volume);
      const voiceId = project.segments.find(
        (segment) => segment.voiceId,
      )?.voiceId;
      if (voiceId) current.setSelectedVoice(voiceId);
    });
  }, [searchParams]);

  const applyDocument = (
    content: string,
    type: SubtitleDocumentType,
    importedName = "",
  ) => {
    const parsed = parseSubtitleDocument(content, type);
    setSourceText(content);
    setSegments(toDrafts(parsed));
    setFileName(importedName);
    setSourceType(type === "srt" ? "srt" : "txt");
    return parsed.length;
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!/\.(srt|txt)$/iu.test(file.name)) {
        store.pushToast({
          title: "请选择 SRT 或 TXT 文件",
          tone: "warning",
        });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        store.pushToast({
          title: "文件太大",
          description: "请选择不超过 2 MB 的字幕或文字文件。",
          tone: "warning",
        });
        return;
      }
      const content = await decodeTextFile(file);
      const count = applyDocument(
        content,
        getDocumentType(file.name),
        file.name,
      );
      if (count === 0) {
        store.pushToast({
          title: "没有找到可配音的文字",
          description: "请检查文件内容后重试。",
          tone: "warning",
        });
      }
    } catch {
      store.pushToast({
        title: "文件没有读取成功",
        description: "请确认文件未损坏后重试。",
        tone: "danger",
      });
    } finally {
      input.value = "";
    }
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
    if (segments.length === 0) {
      store.pushToast({ title: "先导入或粘贴稿件", tone: "warning" });
      return null;
    }
    const project = await desktopApi.projects.save({
      id: projectId || undefined,
      title: projectTitle.trim() || "字幕配音项目",
      kind: "subtitles",
      modelId: store.selectedModel,
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: pause,
      expression: store.expression,
      sourceText,
      segments: segments.map((segment) => ({
        ...segment,
        voiceId: store.selectedVoice || undefined,
      })),
      presetId: store.presetId,
      pronunciationRules: store.pronunciationRules,
    });
    setProjectId(project.id);
    store.updateProject(project);
    return project;
  };

  const generate = async () => {
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
      title: fileName
        ? `字幕配音 · ${fileName.replace(/\.(srt|txt)$/iu, "").slice(0, 96)}`
        : "字幕配音",
      kind: "subtitles",
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
      title: "已保存项目并加入队列",
      description: "可以继续准备下一份稿件；失败后只重做未完成的句子。",
      tone: "success",
    });
  };

  const preview = async () => {
    if (!store.selectedVoice || !previewText || !canGenerate) return;
    store.setEngine(
      await desktopApi.engine.command({
        type: "generate",
        request: {
          requestId: `preview-${crypto.randomUUID()}`,
          title: "字幕试听 30 字",
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
          pronunciationRules: store.pronunciationRules,
        },
      }),
    );
  };

  return (
    <div className="page-content subtitle-page">
      <PageHeader
        title="字幕配音"
        description="适合已有字幕稿或长文：按句生成，再合并为一条完整音轨。"
        actions={
          <Button
            variant="secondary"
            disabled={segments.length === 0}
            onClick={() => void saveProject()}
          >
            <Save className="h-4 w-4" />
            {projectId ? "保存修改" : "保存项目"}
          </Button>
        }
      />

      <div className="subtitle-workspace">
        <div className="subtitle-workspace__main min-w-0">
          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="1. 导入稿件"
              description="SRT 保留原分段和时间码；TXT 按标点、换行自动拆句。"
              action={
                <label className="file-button">
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  选择文件
                  <input
                    type="file"
                    accept=".srt,.txt,text/plain,application/x-subrip"
                    onChange={(event) => void importFile(event)}
                  />
                </label>
              }
            />
            <label className="project-title-field">
              <span>项目名称</span>
              <input
                value={projectTitle}
                maxLength={120}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </label>
            {fileName ? (
              <p className="imported-file-name">
                已导入 {sourceType.toUpperCase()}：{fileName}
              </p>
            ) : null}
            <div className="mt-4">
              <TextAreaField
                label="稿件内容"
                hint={`${sourceText.length.toLocaleString()} / 50,000 字`}
                className="subtitle-source-input"
                placeholder="也可以直接把长文粘贴到这里，会自动按标点和换行拆句…"
                value={sourceText}
                maxLength={50_000}
                onChange={(event) => updateSourceText(event.target.value)}
              />
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
                {segments.map((segment, index) => (
                  <article key={segment.id} className="subtitle-segment">
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
                ))}
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
              <span>试听前 30 个字：</span>
              <mark>{previewText}</mark>
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
          {snapshot.result?.preview || snapshot.result?.kind === "subtitles" ? (
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
    </div>
  );
};
