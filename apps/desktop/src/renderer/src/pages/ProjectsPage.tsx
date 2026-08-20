import {
  ChevronDown,
  Clock3,
  FileAudio,
  FolderOpen,
  FolderKanban,
  Heart,
  Pause,
  Play,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  MODEL_CATALOG,
  createTitleFromText,
  getGenerationPreset,
  getModelGenerationCapabilities,
  type AudioResult,
  type GenerationProject,
  type GenerationTask,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  Modal,
  ProgressBar,
  StatusBadge,
} from "@ai-voice-studio/ui";

import { HistoryAudioRow } from "../components/HistoryAudioRow";
import { PageHeader } from "../components/PageHeader";
import { desktopApi } from "../lib/desktopApi";
import { getUserErrorMessage } from "../lib/errorMessage";
import { resolveProjectTitle, resolveResultTitle } from "../lib/projectNaming";
import { primaryRoutes } from "../routes";
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

const dateTimeLabel = (value: string): string =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

const projectDestination: Record<GenerationProject["kind"], string> = {
  single: "/",
  dialogue: "/dialogue",
  subtitles: "/subtitles",
};

const projectKindLabel: Record<GenerationProject["kind"], string> = {
  single: "单段配音",
  dialogue: "多人对话",
  subtitles: "长稿配音",
};

const projectTitle = (project: GenerationProject): string =>
  resolveProjectTitle(project.title, project.createdAt);

const resultTitle = (
  result: AudioResult,
  projectById: ReadonlyMap<string, GenerationProject>,
): string => {
  const project = result.projectId
    ? projectById.get(result.projectId)
    : undefined;
  const kindLabel =
    result.kind === "dialogue"
      ? "多人对话"
      : result.kind === "subtitles"
        ? "长稿配音"
        : "单段配音";
  return resolveResultTitle(
    project ? projectTitle(project) : undefined,
    result.title,
    result.createdAt,
    kindLabel,
  );
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

const creationChoices = primaryRoutes.filter(
  (route) => route.area === "create",
);

const CreationLauncher = ({
  onChoose,
  label = "新建配音",
  compact = false,
  placement = "down",
}: {
  onChoose: (path: string) => void;
  label?: string;
  compact?: boolean;
  placement?: "down" | "up";
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="creation-launcher" data-placement={placement}>
      <Button
        size={compact ? "sm" : "md"}
        variant={compact ? "secondary" : "primary"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Plus className="h-4 w-4" />
        {label}
        <ChevronDown
          className="creation-launcher__chevron h-3.5 w-3.5"
          data-open={open}
        />
      </Button>
      {open ? (
        <div className="creation-launcher__menu" role="menu">
          {creationChoices.map((choice) => {
            const Icon = choice.icon;
            return (
              <button
                key={choice.path}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onChoose(choice.path);
                }}
              >
                <span className="creation-launcher__icon">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <strong>{choice.label}</strong>
                  <small>{choice.caption}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get("project") ?? "";
  const requestedResultId = searchParams.get("result") ?? "";
  const requestedTaskId = searchParams.get("task") ?? "";
  const results = useStudioStore((state) => state.results);
  const projects = useStudioStore((state) => state.projects);
  const tasks = useStudioStore((state) => state.tasks);
  const updateResult = useStudioStore((state) => state.updateResult);
  const removeResult = useStudioStore((state) => state.removeResult);
  const removeProject = useStudioStore((state) => state.removeProject);
  const updateProject = useStudioStore((state) => state.updateProject);
  const updateTask = useStudioStore((state) => state.updateTask);
  const removeTaskFromStore = useStudioStore((state) => state.removeTask);
  const pushToast = useStudioStore((state) => state.pushToast);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [busyResultId, setBusyResultId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [resultToDelete, setResultToDelete] = useState<AudioResult | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] =
    useState(requestedProjectId);
  const [projectToDelete, setProjectToDelete] =
    useState<GenerationProject | null>(null);
  const [projectToRename, setProjectToRename] =
    useState<GenerationProject | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);

  const activeTasks = useMemo(
    () => tasks.filter((task) => ["queued", "running"].includes(task.status)),
    [tasks],
  );
  const failedTasks = useMemo(
    () => tasks.filter((task) => task.status === "failed"),
    [tasks],
  );
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("zh-CN");
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const resultsByProject = useMemo(() => {
    const grouped = new Map<string, AudioResult[]>();
    for (const result of results) {
      if (!result.projectId) continue;
      grouped.set(result.projectId, [
        ...(grouped.get(result.projectId) ?? []),
        result,
      ]);
    }
    return grouped;
  }, [results]);
  const selectedProject = selectedProjectId
    ? projectById.get(selectedProjectId)
    : undefined;
  const projectDetails = (project: GenerationProject): string => {
    const sourceHint = createTitleFromText(project.sourceText, "").trim();
    return [
      projectKindLabel[project.kind],
      sourceHint || `${project.segments.length} 句`,
      dateLabel(dateKey(new Date(project.updatedAt))),
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const selectedProjectTitle = selectedProject
    ? projectTitle(selectedProject)
    : "全部生成记录";
  const selectedProjectDetails = selectedProject
    ? projectDetails(selectedProject)
    : `${projects.length} 个项目 · ${results.length} 条录音`;
  const visibleProjects = useMemo(
    () =>
      normalizedSearch
        ? projects.filter((project) =>
            [
              resolveProjectTitle(project.title, project.createdAt),
              project.sourceText,
              projectKindLabel[project.kind],
              getGenerationPreset(project.presetId).label,
              project.emotion,
            ]
              .join(" ")
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedSearch),
          )
        : projects,
    [normalizedSearch, projects],
  );
  const scopedResults = useMemo(
    () =>
      selectedProjectId
        ? results.filter((result) => result.projectId === selectedProjectId)
        : results,
    [results, selectedProjectId],
  );
  const favoriteCount = scopedResults.filter(
    (result) => result.favorite,
  ).length;
  const scopedTaskGroups = useMemo(() => {
    const scope = (items: GenerationTask[]) =>
      selectedProjectId
        ? items.filter((task) => task.projectId === selectedProjectId)
        : items;
    return [
      { key: "active", label: "正在处理", tasks: scope(activeTasks) },
      { key: "failed", label: "以前未完成", tasks: scope(failedTasks) },
    ].filter((group) => group.tasks.length > 0);
  }, [activeTasks, failedTasks, selectedProjectId]);
  const groupedResults = useMemo(() => {
    const groups = new Map<string, AudioResult[]>();
    const favoriteResults = favoritesOnly
      ? scopedResults.filter((result) => result.favorite)
      : scopedResults;
    const visible = normalizedSearch
      ? favoriteResults.filter((result) => {
          const project = result.projectId
            ? projectById.get(result.projectId)
            : undefined;
          const modelName =
            MODEL_CATALOG.find((model) => model.id === result.modelId)?.name ??
            "";
          return [
            resultTitle(result, projectById),
            project ? projectTitle(project) : undefined,
            modelName,
            result.kind,
            result.voiceNames?.join(" "),
            getGenerationPreset(result.presetId).label,
            result.emotion,
            project?.sourceText,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedSearch);
        })
      : favoriteResults;
    for (const result of visible) {
      const key = dateKey(new Date(result.createdAt));
      groups.set(key, [...(groups.get(key) ?? []), result]);
    }
    return [...groups.entries()];
  }, [favoritesOnly, normalizedSearch, projectById, scopedResults]);
  const visibleResultCount = groupedResults.reduce(
    (count, [, items]) => count + items.length,
    0,
  );

  useEffect(() => {
    if (requestedProjectId) setSelectedProjectId(requestedProjectId);
  }, [requestedProjectId]);

  useEffect(() => {
    const targetId = requestedResultId || requestedTaskId;
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      const selector = requestedResultId ? "data-result-id" : "data-task-id";
      const target = [
        ...document.querySelectorAll<HTMLElement>(`[${selector}]`),
      ].find((element) => element.getAttribute(selector) === targetId);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedResultId, requestedTaskId, scopedTaskGroups, groupedResults]);

  const continueProject = (project: GenerationProject) => {
    void navigate(`${projectDestination[project.kind]}?project=${project.id}`);
  };

  const deleteProject = async () => {
    if (!projectToDelete || projectBusy) return;
    setProjectBusy(true);
    try {
      if (await desktopApi.projects.remove(projectToDelete.id)) {
        removeProject(projectToDelete.id);
        if (selectedProjectId === projectToDelete.id) setSelectedProjectId("");
      }
      setProjectToDelete(null);
    } catch (error) {
      pushToast({
        title: "项目没有删除",
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    } finally {
      setProjectBusy(false);
    }
  };

  const renameProject = async () => {
    if (!projectToRename || !projectName.trim() || projectBusy) return;
    setProjectBusy(true);
    try {
      const updated = await desktopApi.projects.save({
        id: projectToRename.id,
        title: projectName.trim(),
        kind: projectToRename.kind,
        modelId: projectToRename.modelId,
        language: projectToRename.language,
        emotion: projectToRename.emotion,
        speed: projectToRename.speed,
        volume: projectToRename.volume,
        pauseMs: projectToRename.pauseMs,
        expression: projectToRename.expression,
        sourceText: projectToRename.sourceText,
        segments: projectToRename.segments,
        presetId: projectToRename.presetId,
        pronunciationRules: projectToRename.pronunciationRules,
        voxMode: projectToRename.voxMode,
        voiceDescription: projectToRename.voiceDescription,
      });
      updateProject(updated);
      setProjectToRename(null);
      setProjectName("");
      pushToast({ title: "项目名称已修改", tone: "success" });
    } catch (error) {
      pushToast({
        title: "项目名称没有修改",
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    } finally {
      setProjectBusy(false);
    }
  };

  const editResult = (result: AudioResult) => {
    if (!result.projectId) return;
    const project = projectById.get(result.projectId);
    if (!project) return;
    void navigate(
      `${projectDestination[project.kind]}?project=${project.id}&result=${result.id}`,
    );
  };

  const retryTask = async (task: GenerationTask) => {
    try {
      updateTask(await desktopApi.tasks.retry(task.id));
    } catch (error) {
      pushToast({
        title: "任务没有重新开始",
        description: getUserErrorMessage(error, "请重试。"),
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
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    }
  };

  const removeTask = async (task: GenerationTask) => {
    try {
      if (!(await desktopApi.tasks.remove(task.id))) {
        throw new Error("这条任务已经不存在。");
      }
      removeTaskFromStore(task.id);
      pushToast({ title: "任务已从队列移除", tone: "success" });
    } catch (error) {
      pushToast({
        title: "任务没有移除",
        description: getUserErrorMessage(error, "请重试。"),
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
        description: getUserErrorMessage(error, "请重试。"),
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
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    } finally {
      setBusyResultId("");
    }
  };

  return (
    <div className="page-content projects-page">
      <PageHeader
        title="项目与记录"
        description="一个项目收好一份文稿和它生成的所有录音版本。"
        actions={<CreationLauncher onChoose={(path) => void navigate(path)} />}
      />

      <div className="projects-workspace">
        <GlassCard tone="solid" padding="md" className="project-library-panel">
          <header className="project-library-header">
            <div>
              <h2>配音项目</h2>
              <span>
                {normalizedSearch
                  ? `找到 ${visibleProjects.length} 个`
                  : `${projects.length} 个`}
              </span>
            </div>
          </header>

          <label className="workspace-search project-library-search">
            <Search className="h-4 w-4" />
            <input
              type="search"
              value={searchQuery}
              placeholder="搜索项目或录音"
              aria-label="搜索项目或录音"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <button
            type="button"
            className="project-library-all"
            data-active={!selectedProjectId}
            onClick={() => setSelectedProjectId("")}
          >
            <span className="project-library-item__icon">
              <FolderKanban className="h-5 w-5" />
            </span>
            <span>
              <strong>全部录音</strong>
              <small>{results.length} 条记录</small>
            </span>
          </button>

          <div className="project-library-list">
            {visibleProjects.length ? (
              visibleProjects.map((project) => {
                const projectResults = resultsByProject.get(project.id) ?? [];
                const displayTitle = projectTitle(project);
                const displayDetails = projectDetails(project);
                return (
                  <article
                    key={project.id}
                    className="project-library-item"
                    data-active={selectedProjectId === project.id}
                  >
                    <button
                      type="button"
                      className="project-library-item__open"
                      title={`${displayTitle}\n${displayDetails}`}
                      aria-label={`打开项目 ${displayTitle}，${displayDetails}`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <span className="project-library-item__icon">
                        <FolderOpen className="h-5 w-5" />
                      </span>
                      <span className="project-library-item__text">
                        <strong title={displayTitle}>{displayTitle}</strong>
                        <small title={displayDetails}>{displayDetails}</small>
                      </span>
                      <span className="project-library-item__count">
                        {projectResults.length}
                      </span>
                    </button>
                    <div className="project-library-item__actions">
                      <button
                        type="button"
                        title="修改项目名称"
                        aria-label={`修改项目名称 ${projectTitle(project)}`}
                        onClick={() => {
                          setProjectToRename(project);
                          setProjectName(projectTitle(project));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="删除项目"
                        aria-label={`删除项目 ${projectTitle(project)}`}
                        onClick={() => setProjectToDelete(project)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="project-library-empty">
                <FolderKanban className="h-5 w-5" />
                <span>
                  {normalizedSearch
                    ? "没有找到相关项目"
                    : "保存稿件后会显示在这里"}
                </span>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard tone="solid" padding="md" className="project-records-panel">
          <header className="project-records-header">
            <div className="project-records-title">
              <span className="project-records-title__icon">
                {selectedProject ? (
                  <FolderOpen className="h-5 w-5" />
                ) : (
                  <FileAudio className="h-5 w-5" />
                )}
              </span>
              <div>
                <h2>
                  <span title={selectedProjectTitle}>
                    {selectedProjectTitle}
                  </span>
                </h2>
                <p title={selectedProjectDetails}>{selectedProjectDetails}</p>
              </div>
            </div>
            <div className="project-records-actions">
              {selectedProject ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => continueProject(selectedProject)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  继续编辑
                </Button>
              ) : null}
              <div
                className="record-filter-tabs"
                role="group"
                aria-label="筛选生成记录"
              >
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
          </header>

          <div className="project-records-body">
            {scopedTaskGroups.map((group) => (
              <section
                key={group.key}
                className="project-task-section"
                data-group={group.key}
              >
                <header>
                  <div>
                    <Clock3 className="h-4 w-4" />
                    <strong>{group.label}</strong>
                    <span>{group.tasks.length} 个任务</span>
                  </div>
                </header>
                <div className="project-task-grid">
                  {group.tasks.map((task) => {
                    const status = taskStatus(task.status);
                    const taskProject = task.projectId
                      ? projectById.get(task.projectId)
                      : undefined;
                    const taskKindLabel =
                      task.kind === "dialogue"
                        ? "多人对话"
                        : task.kind === "subtitles"
                          ? "长稿配音"
                          : "单段配音";
                    const taskTitle = taskProject
                      ? projectTitle(taskProject)
                      : task.title;
                    const taskMeta = `${taskKindLabel} · ${getGenerationPreset(task.presetId).label}${
                      getModelGenerationCapabilities(task.modelId, "auto")
                        .emotion && task.emotion
                        ? ` · 情绪：${task.emotion}`
                        : ""
                    } · ${dateTimeLabel(task.updatedAt)}`;
                    return (
                      <div
                        key={task.id}
                        className="task-compact-row"
                        data-highlighted={requestedTaskId === task.id}
                        data-task-id={task.id}
                      >
                        <div className="task-compact-row__title">
                          {task.status === "running" ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Clock3 className="h-3.5 w-3.5" />
                          )}
                          <strong title={taskTitle}>{taskTitle}</strong>
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </div>
                        <small
                          className="task-compact-row__meta"
                          title={taskMeta}
                        >
                          {taskMeta}
                        </small>
                        <ProgressBar
                          value={task.progress}
                          label={task.message}
                        />
                        <div className="task-compact-row__actions">
                          {task.status === "failed" ||
                          task.status === "canceled" ? (
                            taskProject ? (
                              <button
                                type="button"
                                onClick={() => continueProject(taskProject)}
                              >
                                <Pencil className="h-3 w-3" />
                                编辑项目
                              </button>
                            ) : null
                          ) : null}
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
                          {task.status === "failed" ||
                          task.status === "canceled" ? (
                            <button
                              type="button"
                              title="只移除这条任务，不删除项目和录音"
                              onClick={() => void removeTask(task)}
                            >
                              <Trash2 className="h-3 w-3" />
                              移除
                            </button>
                          ) : null}
                          {task.status === "queued" ||
                          task.status === "running" ? (
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
              </section>
            ))}

            <section className="project-history-section">
              <header className="project-history-heading">
                <h3>{selectedProject ? "录音版本" : "最近生成"}</h3>
                <span>{visibleResultCount} 条</span>
              </header>

              {groupedResults.length > 0 ? (
                <div className="history-groups">
                  {groupedResults.map(([key, items]) => (
                    <section key={key} className="history-group">
                      <header>
                        <h2>{dateLabel(key)}</h2>
                        <span>{items.length} 条</span>
                      </header>
                      <div className="project-records-grid">
                        {items.map((result) => (
                          <HistoryAudioRow
                            key={result.id}
                            result={result}
                            projectTitle={
                              result.projectId
                                ? (() => {
                                    const project = projectById.get(
                                      result.projectId,
                                    );
                                    return project
                                      ? projectTitle(project)
                                      : undefined;
                                  })()
                                : undefined
                            }
                            highlighted={requestedResultId === result.id}
                            busy={busyResultId === result.id}
                            onEdit={editResult}
                            onToggleFavorite={toggleFavorite}
                            onDelete={setResultToDelete}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : scopedResults.length > 0 ? (
                <div className="project-history-empty">
                  <Heart className="h-5 w-5" />
                  <strong>
                    {normalizedSearch ? "没有找到相关记录" : "还没有收藏"}
                  </strong>
                  {favoritesOnly ? (
                    <button
                      type="button"
                      onClick={() => setFavoritesOnly(false)}
                    >
                      查看全部记录
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="project-history-empty project-history-empty--large">
                  <FileAudio className="h-6 w-6" />
                  <strong>
                    {selectedProject ? "这个项目还没有录音" : "还没有生成记录"}
                  </strong>
                  <span>
                    {selectedProject
                      ? "继续编辑项目，生成后的版本会收在这里。"
                      : "任务完成后，音频会按日期显示在这里。"}
                  </span>
                  {selectedProject ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => continueProject(selectedProject)}
                    >
                      继续编辑
                    </Button>
                  ) : (
                    <CreationLauncher
                      compact
                      label="开始配音"
                      placement="up"
                      onChoose={(path) => void navigate(path)}
                    />
                  )}
                </div>
              )}
            </section>
          </div>
        </GlassCard>
      </div>

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
          “{resultToDelete ? resultTitle(resultToDelete, projectById) : "配音"}
          ”及其音频文件会一起删除。
        </p>
      </Modal>

      <Modal
        open={Boolean(projectToRename)}
        title="修改项目名称"
        onClose={() => {
          if (!projectBusy) setProjectToRename(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={projectBusy}
              onClick={() => setProjectToRename(null)}
            >
              取消
            </Button>
            <Button
              disabled={!projectName.trim() || projectBusy}
              onClick={() => void renameProject()}
            >
              {projectBusy ? "正在保存…" : "保存名称"}
            </Button>
          </>
        }
      >
        <label className="project-rename-field">
          <span>项目名称</span>
          <input
            autoFocus
            maxLength={120}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void renameProject();
            }}
          />
        </label>
      </Modal>

      <Modal
        open={Boolean(projectToDelete)}
        title="删除这个项目？"
        onClose={() => {
          if (!projectBusy) setProjectToDelete(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={projectBusy}
              onClick={() => setProjectToDelete(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={projectBusy}
              onClick={() => void deleteProject()}
            >
              <Trash2 className="h-4 w-4" />
              {projectBusy ? "正在删除…" : "删除项目"}
            </Button>
          </>
        }
      >
        <p className="delete-voice-summary">
          删除“
          {projectToDelete ? projectTitle(projectToDelete) : "这个项目"}
          ”后，已经生成的录音仍会保留。
        </p>
      </Modal>
    </div>
  );
};
