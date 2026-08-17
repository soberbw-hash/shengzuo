import {
  CircleStop,
  Headphones,
  Mic2,
  Play,
  Plus,
  Save,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  ENGINE_STATUS_COPY,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  type EngineSnapshot,
  type GenerationProject,
  type GenerationRequest,
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
import { FirstRunGuide } from "../components/FirstRunGuide";
import { ModelLanguageSelect } from "../components/ModelLanguageSelect";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { desktopApi } from "../lib/desktopApi";
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
  const [projectId, setProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState("单段配音项目");
  const snapshot =
    store.engines[store.selectedModel] ??
    store.engine ??
    createInitialSnapshot();
  const selectedVoice = store.voiceProfiles.find(
    (voice) => voice.id === store.selectedVoice,
  );
  const canGenerate = [
    "ready",
    "success",
    "generation-failed",
    "stopped",
  ].includes(snapshot.status);
  const hasText = Boolean(store.text.trim());
  const guideAction = !canGenerate ? (
    <Link to="/models">去下载模型</Link>
  ) : !selectedVoice ? (
    <Link to="/voices?clone=1">去克隆声音</Link>
  ) : !hasText ? (
    <button
      type="button"
      onClick={() =>
        document.querySelector<HTMLTextAreaElement>("#script-text")?.focus()
      }
    >
      去输入文字
    </button>
  ) : null;

  useEffect(() => {
    const requestedId = searchParams.get("project");
    if (!requestedId) return;
    void desktopApi.projects.get(requestedId).then((project) => {
      if (!project || project.kind !== "single") return;
      setProjectId(project.id);
      setProjectTitle(project.title);
      const current = useStudioStore.getState();
      current.setText(project.sourceText);
      current.setExpression(project.expression);
      current.setSelectedModel(project.modelId);
      current.setLanguage(project.language);
      current.setEmotion(project.emotion);
      current.setSpeed(project.speed);
      current.setVolume(project.volume);
      const voiceId = project.segments[0]?.voiceId;
      if (voiceId) current.setSelectedVoice(voiceId);
    });
  }, [searchParams]);

  const saveProject = async (): Promise<GenerationProject | null> => {
    if (!store.text.trim()) {
      store.pushToast({ title: "先输入要配音的文字", tone: "warning" });
      return null;
    }
    const project = await desktopApi.projects.save({
      id: projectId || undefined,
      title: projectTitle.trim() || "单段配音项目",
      kind: "single",
      modelId: store.selectedModel,
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: 0,
      expression: store.expression,
      sourceText: store.text,
      segments: [
        {
          id: "single-1",
          text: store.text,
          voiceId: store.selectedVoice || undefined,
        },
      ],
    });
    setProjectId(project.id);
    store.updateProject(project);
    return project;
  };

  const generate = async (previewOnly = false) => {
    if (!selectedVoice) {
      store.pushToast({
        title: "先克隆一个声音",
        description: "当前没有可用声音，完成克隆后才能生成。",
        tone: "warning",
      });
      return;
    }
    if (!store.text.trim()) {
      store.pushToast({ title: "先输入要说的话", tone: "warning" });
      return;
    }
    if (!canGenerate) {
      store.pushToast({
        title: "先准备本地引擎",
        description: "点击右侧“下载并使用”即可继续。",
        tone: "info",
      });
      return;
    }
    const project = await saveProject();
    if (!project) return;
    const request: GenerationRequest = {
      requestId: crypto.randomUUID(),
      modelId: store.selectedModel,
      voiceId: store.selectedVoice,
      text: previewOnly
        ? store.text
            .split(/[。！？!?]/u)
            .slice(0, 2)
            .join("。")
        : store.text,
      expression: store.expression,
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      format: store.format,
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
        title="开始创作"
        description="适合一段口播或旁白：输入文字，快速生成一段音频。"
        actions={
          <Button
            variant="secondary"
            disabled={!store.text.trim()}
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
          aria-label="项目名称"
          value={projectTitle}
          maxLength={120}
          placeholder="给这次配音起个名字"
          onChange={(event) => setProjectTitle(event.target.value)}
        />
      </label>

      <FirstRunGuide
        steps={[
          {
            label: "准备模型",
            description: canGenerate ? "已可用" : "首次需要下载",
            complete: canGenerate,
          },
          {
            label: "克隆声音",
            description: selectedVoice?.name ?? "添加一段录音",
            complete: Boolean(selectedVoice),
          },
          {
            label: "输入文字",
            description: hasText
              ? `${store.text.length} 个字`
              : "粘贴口播或台词",
            complete: hasText,
          },
        ]}
        action={guideAction}
      />

      <div className="generate-layout">
        <div className="space-y-5">
          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="1. 选择声音"
              description="这里只显示你自己创建的声音。"
              action={
                <Link className="inline-action-link" to="/voices?clone=1">
                  <Plus className="h-4 w-4" />
                  克隆声音
                </Link>
              }
            />
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
              <div className="min-w-0 flex-1">
                <strong>{selectedVoice?.name ?? "还没有声音"}</strong>
                <p>
                  {selectedVoice
                    ? selectedVoice.description
                    : "先添加一段清晰人声录音。"}
                </p>
              </div>
              {selectedVoice ? (
                <div className="w-[230px]">
                  <SelectField
                    label="更换声音"
                    aria-label="更换声音"
                    value={store.selectedVoice}
                    onChange={(event) =>
                      store.setSelectedVoice(event.target.value)
                    }
                  >
                    {store.voiceProfiles.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}（{voice.description}）
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
          </GlassCard>

          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="2. 输入文字"
              action={
                <span className="text-[11px] font-semibold text-[#78879a]">
                  {store.text.length.toLocaleString()} / 20,000
                </span>
              }
            />
            <div className="mt-4">
              <TextAreaField
                id="script-text"
                label="要说的话"
                hint="Ctrl + Enter 生成"
                className="generate-script-input"
                value={store.text}
                maxLength={20_000}
                placeholder="在这里粘贴口播、旁白或台词…"
                onChange={(event) => store.setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.ctrlKey && event.key === "Enter") {
                    void generate(false);
                  }
                }}
              />
            </div>
            <p className="mt-3 text-[11px] font-medium leading-5 text-[#78879a]">
              当前模型会根据文字内容和标点自动调整语气。
            </p>
          </GlassCard>
        </div>

        <div className="generate-control-column space-y-5">
          <GlassCard tone="solid" padding="lg">
            <SectionHeading
              title="3. 调整并生成"
              description="首次使用当前模型时需要先下载。"
            />
            <div className="mt-4 space-y-4">
              <SliderField
                label="语速"
                valueLabel={`${store.speed.toFixed(2)}×`}
                min={0.5}
                max={2}
                step={0.05}
                value={store.speed}
                onChange={(event) => store.setSpeed(Number(event.target.value))}
              />
              <EngineStatusPanel
                snapshot={snapshot}
                modelId={store.selectedModel}
                onChanged={store.setEngine}
              />

              {snapshot.result ? null : (
                <div className="generate-actions generate-actions--primary">
                  <Button
                    variant="secondary"
                    disabled={
                      !selectedVoice ||
                      !canGenerate ||
                      snapshot.status === "generating"
                    }
                    onClick={() => void generate(true)}
                  >
                    <Headphones className="h-4 w-4" />
                    试听一小段
                  </Button>
                  {snapshot.jobId &&
                  ["loading", "generating"].includes(snapshot.status) ? (
                    <Button variant="danger" onClick={() => void cancel()}>
                      <CircleStop className="h-4 w-4" />
                      停止
                    </Button>
                  ) : (
                    <Button
                      disabled={!selectedVoice || !canGenerate}
                      title={canGenerate ? "生成完整配音" : "请先准备本地引擎"}
                      onClick={() => void generate(false)}
                    >
                      <Play className="h-4 w-4 fill-current" />
                      生成配音
                    </Button>
                  )}
                </div>
              )}

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
                    label="本地引擎"
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
                  <div className="output-format-row">
                    <span>格式</span>
                    <strong>MP3</strong>
                  </div>
                </div>
              </section>
            </div>
          </GlassCard>

          {snapshot.result ? (
            <AudioPlayer
              result={snapshot.result}
              onRegenerate={() => void generate(false)}
            />
          ) : snapshot.jobId &&
            ["loading", "generating"].includes(snapshot.status) ? (
            <GlassCard tone="soft" padding="lg" className="generation-callout">
              <span className="generation-callout__orb">
                <WandSparkles className="h-6 w-6" />
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
    </div>
  );
};
