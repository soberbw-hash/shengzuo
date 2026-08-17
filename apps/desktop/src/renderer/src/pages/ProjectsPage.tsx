import {
  Clock3,
  FileAudio,
  FolderKanban,
  Heart,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  AudioResult,
  GenerationProject,
  GenerationTask,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  EmptyState,
  GlassCard,
  Modal,
  ProgressBar,
  StatusBadge,
} from "@ai-voice-studio/ui";

import { HistoryAudioRow } from "../components/HistoryAudioRow";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { desktopApi } from "../lib/desktopApi";
import { useStudioStore } from "../store/studioStore";

const dateKey = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const dateLabel = (key: string): string => {
  const date = new Date(`${key}T00:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (key === dateKey(today)) return "今天";
  if (key === dateKey(yesterday)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
};

const projectDestination: Record<GenerationProject["kind"], string> = {
  single: "/",
  dialogue: "/dialogue",
  subtitles: "/subtitles",
};

const projectKindLabel: Record<GenerationProject["kind"], string> = {
  single: "文字配音",
  dialogue: "多人对话",
  subtitles: "字幕配音",
};

const taskStatus = (
  status: GenerationTask["status"],
): {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
} => {
  if (status === "running") return { label: "生成中", tone: "info" };
  if (status === "queued") return { label: "等待中", tone: "neutral" };
  if (status === "completed") return { label: "已完成", tone: "success" };
  if (status === "failed") return { label: "未完成", tone: "danger" };
  return { label: "已取消", tone: "warning" };
};

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const results = useStudioStore((state) => state.results);
  const projects = useStudioStore((state) => state.projects);
  const tasks = useStudioStore((state) => state.tasks);
  const updateResult = useStudioStore((state) => state.updateResult);
  const removeResult = useStudioStore((state) => state.removeResult);
  const removeProject = useStudioStore((state) => state.removeProject);
  const updateTask = useStudioStore((state) => state.updateTask);
  const pushToast = useStudioStore((state) => state.pushToast);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [busyResultId, setBusyResultId] = useState("");
  const [resultToDelete, setResultToDelete] = useState<AudioResult | null>(
    null,
  );

  const favoriteCount = results.filter((result) => result.favorite).length;
  const actionableTasks = tasks.filter((task) =>
    ["queued", "running", "failed"].includes(task.status),
  );
  const groupedResults = useMemo(() => {
    const groups = new Map<string, AudioResult[]>();
    const visible = favoritesOnly
      ? results.filter((result) => result.favorite)
      : results;
    for (const result of visible) {
      const key = dateKey(new Date(result.createdAt));
      groups.set(key, [...(groups.get(key) ?? []), result]);
    }
    return [...groups.entries()];
  }, [favoritesOnly, results]);

  const continueProject = (project: GenerationProject) => {
    void navigate(`${projectDestination[project.kind]}?project=${project.id}`);
  };

  const deleteProject = async (project: GenerationProject) => {
    try {
      if (await desktopApi.projects.remove(project.id))
        removeProject(project.id);
    } catch (error) {
      pushToast({
        title: "项目没有删除",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    }
  };

  const retryTask = async (task: GenerationTask) => {
    try {
      updateTask(await desktopApi.tasks.retry(task.id));
    } catch (error) {
      pushToast({
        title: "任务没有重新开始",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    }
  };

  const cancelTask = async (task: GenerationTask) => {
    try {
      updateTask(await desktopApi.tasks.cancel(task.id));
    } catch (error) {
      pushToast({
        title: "任务没有取消",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    }
  };

  const toggleFavorite = async (result: AudioResult) => {
    if (busyResultId) return;
    setBusyResultId(result.id);
    try {
      updateResult(
        await desktopApi.audio.setFavorite({
          resultId: result.id,
          favorite: !result.favorite,
        }),
      );
    } catch (error) {
      pushToast({
        title: "收藏状态没有保存",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setBusyResultId("");
    }
  };

  const deleteResult = async () => {
    if (!resultToDelete || busyResultId) return;
    const target = resultToDelete;
    setBusyResultId(target.id);
    try {
      const deleted = await desktopApi.audio.removeResult(target.id);
      if (!deleted) throw new Error("这条记录已经不存在。");
      removeResult(target.id);
      setResultToDelete(null);
    } catch (error) {
      pushToast({
        title: "生成记录没有删除",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setBusyResultId("");
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="项目与记录"
        description="稿件可继续编辑，任务会在后台依次生成。"
        actions={
          <Button onClick={() => void navigate("/")}>
            <Plus className="h-4 w-4" />
            新建配音
          </Button>
        }
      />

      <div
        className="workspace-overview-grid"
        data-has-queue={actionableTasks.length > 0}
      >
        <GlassCard tone="solid" padding="lg" className="workspace-panel">
          <SectionHeading
            title="配音项目"
            description={`${projects.length} 个项目`}
          />
          {projects.length ? (
            <div className="project-compact-list">
              {projects.slice(0, 6).map((project) => (
                <div key={project.id} className="project-compact-row">
                  <span className="project-compact-row__icon">
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => continueProject(project)}
                  >
                    <strong>{project.title}</strong>
                    <small>
                      {projectKindLabel[project.kind]} ·{" "}
                      {project.segments.length} 句 ·{" "}
                      {dateLabel(dateKey(new Date(project.updatedAt)))}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="icon-quiet-button"
                    aria-label={`删除项目 ${project.title}`}
                    onClick={() => void deleteProject(project)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="workspace-panel-empty">
              <FolderKanban className="h-5 w-5" />
              <span>保存稿件后会显示在这里</span>
            </div>
          )}
        </GlassCard>

        {actionableTasks.length ? (
          <GlassCard tone="solid" padding="lg" className="workspace-panel">
            <SectionHeading
              title="任务队列"
              description={`${actionableTasks.length} 个任务需要处理`}
            />
            <div className="task-compact-list">
              {actionableTasks.slice(0, 5).map((task) => {
                const status = taskStatus(task.status);
                return (
                  <div key={task.id} className="task-compact-row">
                    <div className="task-compact-row__title">
                      {task.status === "running" ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Clock3 className="h-3.5 w-3.5" />
                      )}
                      <strong>{task.title}</strong>
                      <StatusBadge tone={status.tone}>
                        {status.label}
                      </StatusBadge>
                    </div>
                    <ProgressBar value={task.progress} label={task.message} />
                    <div className="task-compact-row__actions">
                      {task.status === "failed" ||
                      task.status === "canceled" ? (
                        <button
                          type="button"
                          onClick={() => void retryTask(task)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          重试
                        </button>
                      ) : null}
                      {task.status === "queued" || task.status === "running" ? (
                        <button
                          type="button"
                          onClick={() => void cancelTask(task)}
                        >
                          {task.status === "running" ? (
                            <Pause className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          取消
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        ) : null}
      </div>

      {results.length > 0 ? (
        <>
          <div className="history-toolbar">
            <h2>
              生成记录 <small>{results.length}</small>
            </h2>
            <div role="group" aria-label="筛选生成记录">
              <button
                type="button"
                data-active={!favoritesOnly}
                onClick={() => setFavoritesOnly(false)}
              >
                全部
              </button>
              <button
                type="button"
                data-active={favoritesOnly}
                onClick={() => setFavoritesOnly(true)}
              >
                <Heart className="h-3.5 w-3.5" />
                收藏 {favoriteCount}
              </button>
            </div>
          </div>

          {groupedResults.length > 0 ? (
            <div className="history-groups">
              {groupedResults.map(([key, items]) => (
                <section key={key} className="history-group">
                  <header>
                    <h2>{dateLabel(key)}</h2>
                    <span>{items.length} 条</span>
                  </header>
                  <div className="history-list">
                    {items.map((result) => (
                      <HistoryAudioRow
                        key={result.id}
                        result={result}
                        busy={busyResultId === result.id}
                        onToggleFavorite={toggleFavorite}
                        onDelete={setResultToDelete}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <GlassCard
              tone="solid"
              padding="lg"
              className="history-filter-empty"
            >
              <Heart className="h-5 w-5" />
              <strong>还没有收藏</strong>
              <button type="button" onClick={() => setFavoritesOnly(false)}>
                查看全部记录
              </button>
            </GlassCard>
          )}
        </>
      ) : (
        <GlassCard tone="solid" padding="lg" className="history-empty-card">
          <EmptyState
            icon={<FileAudio className="h-6 w-6" />}
            title="还没有生成记录"
            description="任务完成后，音频会按日期显示在这里。"
            actionLabel="开始配音"
            onAction={() => void navigate("/")}
          />
        </GlassCard>
      )}

      <Modal
        open={Boolean(resultToDelete)}
        title="删除这条生成记录？"
        onClose={() => {
          if (!busyResultId) setResultToDelete(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={Boolean(busyResultId)}
              onClick={() => setResultToDelete(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={Boolean(busyResultId)}
              onClick={() => void deleteResult()}
            >
              <Trash2 className="h-4 w-4" />
              {busyResultId ? "正在删除…" : "删除"}
            </Button>
          </>
        }
      >
        <p className="delete-voice-summary">
          “{resultToDelete?.title ?? "配音"}”及其音频文件会一起删除。
        </p>
      </Modal>
    </div>
  );
};
