import { MessagesSquare, Mic2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  ENGINE_STATUS_COPY,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  type BatchGenerationRequest,
  type EngineSnapshot,
  type GenerationProject,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  SelectField,
  TextAreaField,
} from "@ai-voice-studio/ui";

import { PageHeader } from "../components/PageHeader";
import { AudioPlayer } from "../components/AudioPlayer";
import { EngineStatusPanel } from "../components/EngineStatusPanel";
import { ModelLanguageSelect } from "../components/ModelLanguageSelect";
import { SectionHeading } from "../components/SectionHeading";
import { desktopApi } from "../lib/desktopApi";
import { useStudioStore } from "../store/studioStore";

const roleOptions = ["旁白", "角色 1", "角色 2", "角色 3"] as const;

interface DialogueLine {
  id: string;
  role: (typeof roleOptions)[number];
  text: string;
}

const createLine = (
  role: DialogueLine["role"] = "旁白",
  text = "",
): DialogueLine => ({ id: crypto.randomUUID(), role, text });

export const DialoguePage = () => {
  const store = useStudioStore();
  const [searchParams] = useSearchParams();
  const [projectId, setProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState("多人对话项目");
  const [lines, setLines] = useState<DialogueLine[]>([createLine("旁白", "")]);
  const [voiceAssignments, setVoiceAssignments] = useState<
    Record<string, string>
  >({});
  const activeRoles = useMemo(
    () => [...new Set(lines.map((line) => line.role))],
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
  const canGenerate =
    usableLines.length > 0 &&
    store.voiceProfiles.length > 0 &&
    ["ready", "success", "generation-failed", "stopped"].includes(
      snapshot.status,
    );

  useEffect(() => {
    const requestedId = searchParams.get("project");
    if (!requestedId) return;
    void desktopApi.projects.get(requestedId).then((project) => {
      if (!project || project.kind !== "dialogue") return;
      setProjectId(project.id);
      setProjectTitle(project.title);
      setLines(
        project.segments.map((segment) => ({
          id: segment.id,
          role: roleOptions.includes(segment.label as DialogueLine["role"])
            ? (segment.label as DialogueLine["role"])
            : "旁白",
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
      const current = useStudioStore.getState();
      current.setSelectedModel(project.modelId);
      current.setLanguage(project.language);
      current.setEmotion(project.emotion);
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
      expression: "按角色自然对话",
      sourceText: lines.map((line) => `${line.role}：${line.text}`).join("\n"),
      segments: lines.map((line) => ({
        id: line.id,
        text: line.text,
        label: line.role,
        voiceId:
          voiceAssignments[line.role] ?? store.selectedVoice ?? undefined,
      })),
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
      segments: usableLines.map((line) => ({
        id: line.id,
        voiceId: voiceAssignments[line.role] ?? store.selectedVoice,
        text: line.text.trim(),
        label: line.role,
      })),
      language: store.language,
      emotion: store.emotion,
      speed: store.speed,
      volume: store.volume,
      pauseMs: 260,
      format: "mp3",
      title: "多人对话",
      kind: "dialogue",
      projectId: project.id,
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

  return (
    <div className="page-content">
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
        <GlassCard tone="solid" padding="lg" className="min-w-0">
          <SectionHeading
            title="对话台词"
            description={`${lines.length} 句 · ${activeRoles.length} 个角色`}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLines((current) => [...current, createLine()])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                添加一句
              </Button>
            }
          />
          <div className="mt-4 space-y-4">
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
                  <SelectField
                    label="角色"
                    value={line.role}
                    onChange={(event) =>
                      updateLine(line.id, {
                        role: event.target.value as DialogueLine["role"],
                      })
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </SelectField>
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
            className="mt-3"
            onClick={() => setLines((current) => [...current, createLine()])}
          >
            <Plus className="h-4 w-4" />
            继续添加台词
          </Button>
        </GlassCard>

        <GlassCard tone="solid" padding="lg">
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
            <div className="mt-4 space-y-3">
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
                </article>
              ))}
            </div>
          )}

          <div className="dialogue-generate-note">
            <MessagesSquare className="h-4 w-4" />
            <span>会按台词顺序逐句生成，并自动合并为一个 MP3。</span>
          </div>
          <Button
            fullWidth
            className="mt-3"
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            {snapshot.status === "generating" ? "正在生成…" : "生成整段对话"}
          </Button>
          {snapshot.result?.kind === "dialogue" ? (
            <div className="mt-4">
              <AudioPlayer
                result={snapshot.result}
                onRegenerate={() => void generate()}
              />
            </div>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
};
