import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import type {
  EngineStatus,
  GenerationTaskStatus,
} from "@ai-voice-studio/shared-types";

import { Sidebar } from "./components/Sidebar";
import { ToastRegion } from "./components/ToastRegion";
import { WindowTitleBar } from "./components/WindowTitleBar";
import { desktopApi } from "./lib/desktopApi";
import { featureRegistry } from "./featureRegistry";
import { useStudioStore } from "./store/studioStore";

const RoutedContent = () => {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <motion.main
      key={location.pathname}
      className="main-scroll"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.28,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="route-content">
        <Routes location={location}>
          {featureRegistry.map(({ path, component: Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </motion.main>
  );
};

const AppBootstrap = () => {
  const setEngine = useStudioStore((state) => state.setEngine);
  const setEngines = useStudioStore((state) => state.setEngines);
  const setResults = useStudioStore((state) => state.setResults);
  const setProjects = useStudioStore((state) => state.setProjects);
  const setTasks = useStudioStore((state) => state.setTasks);
  const updateTask = useStudioStore((state) => state.updateTask);
  const setSelectedModel = useStudioStore((state) => state.setSelectedModel);
  const setSelectedVoice = useStudioStore((state) => state.setSelectedVoice);
  const setVoiceProfiles = useStudioStore((state) => state.setVoiceProfiles);
  const pushToast = useStudioStore((state) => state.pushToast);
  const taskStatuses = useRef(new Map<string, GenerationTaskStatus>());
  const startupSummaryShown = useRef(false);

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      const captureState = params.get("state") as EngineStatus | null;
      const engineLoad = async () => {
        const selectedSnapshot = captureState
          ? await desktopApi.engine.command({
              type: "set-mock-state",
              status: captureState,
            })
          : null;
        return {
          selectedSnapshot,
          snapshots: await desktopApi.engine.listSnapshots(),
        };
      };
      const [voices, engineState, results, projects, tasks] =
        await Promise.allSettled([
          desktopApi.voices.list(),
          engineLoad(),
          desktopApi.audio.listResults(),
          desktopApi.projects.list(),
          desktopApi.tasks.list(),
        ]);
      if (disposed) return;

      if (voices.status === "fulfilled") {
        setVoiceProfiles(voices.value);
        if (voices.value[0]) setSelectedVoice(voices.value[0].id);
      }
      if (engineState.status === "fulfilled") {
        const { selectedSnapshot, snapshots } = engineState.value;
        setEngines(snapshots);
        if (selectedSnapshot) {
          setSelectedModel(selectedSnapshot.modelId);
          setEngine(selectedSnapshot);
        } else {
          const usableStatuses: EngineStatus[] = [
            "ready",
            "success",
            "generation-failed",
            "stopped",
          ];
          const preferred =
            snapshots.find((snapshot) =>
              usableStatuses.includes(snapshot.status),
            ) ??
            snapshots.find((snapshot) => snapshot.status !== "not-installed");
          if (preferred) setSelectedModel(preferred.modelId);
        }
      }
      if (results.status === "fulfilled") setResults(results.value);
      if (projects.status === "fulfilled") setProjects(projects.value);
      if (tasks.status === "fulfilled") {
        setTasks(tasks.value);
        for (const task of tasks.value) {
          taskStatuses.current.set(task.id, task.status);
        }
        const failedCount = tasks.value.filter(
          (task) => task.status === "failed",
        ).length;
        if (failedCount && !startupSummaryShown.current) {
          startupSummaryShown.current = true;
          pushToast({
            title: `有 ${failedCount} 个以前未完成的任务`,
            description: "它们不是正在生成，可以查看原因后重试、编辑或移除。",
            tone: "warning",
            durationMs: null,
            dedupeKey: "startup-failed-tasks",
            action: { label: "查看未完成任务", to: "/projects" },
          });
        }
      }
      const failedSections = [
        voices.status === "rejected" ? "声音" : "",
        engineState.status === "rejected" ? "模型状态" : "",
        results.status === "rejected" ? "生成记录" : "",
        projects.status === "rejected" ? "项目" : "",
        tasks.status === "rejected" ? "任务队列" : "",
      ].filter(Boolean);
      if (failedSections.length) {
        pushToast({
          title: "有些本地内容暂时没有加载",
          description: `${failedSections.join("、")}没有读取成功。可以重开软件，或到设置运行检查修复。`,
          tone: "warning",
          durationMs: null,
          dedupeKey: "startup-partial-load",
          action: { label: "检查修复", to: "/settings" },
        });
      }
    };
    void initialize();
    const unsubscribe = desktopApi.engine.onSnapshot((snapshot) => {
      if (disposed) return;
      setEngine(snapshot);
    });
    const unsubscribeTasks = desktopApi.tasks.onChanged((task) => {
      if (disposed) return;
      const previousStatus = taskStatuses.current.get(task.id);
      taskStatuses.current.set(task.id, task.status);
      updateTask(task);
      if (task.status === "completed" && previousStatus !== "completed") {
        if (task.preview) return;
        void desktopApi.audio.listResults().then((results) => {
          if (disposed) return;
          setResults(results);
          const params = new URLSearchParams();
          if (task.projectId) params.set("project", task.projectId);
          if (task.resultId) params.set("result", task.resultId);
          const query = params.toString();
          pushToast({
            title: `“${task.title}”已经生成`,
            description: "音频已经保存，可以现在试听或导出。",
            tone: "success",
            durationMs: 15_000,
            dedupeKey: `task-completed:${task.id}:${task.updatedAt}`,
            replaceKey: `task-result:${task.id}`,
            action: {
              label: "查看并试听",
              to: `/projects${query ? `?${query}` : ""}`,
            },
          });
        });
      }
      if (task.status === "failed" && previousStatus !== "failed") {
        const params = new URLSearchParams();
        if (task.projectId) params.set("project", task.projectId);
        params.set("task", task.id);
        pushToast({
          title: `“${task.title}”生成失败`,
          description: task.message,
          tone: "danger",
          durationMs: null,
          dedupeKey: `task-failed:${task.id}:${task.updatedAt}`,
          replaceKey: `task-result:${task.id}`,
          action: {
            label: "查看任务",
            to: `/projects?${params.toString()}`,
          },
        });
      }
    });
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeTasks();
    };
  }, [
    setEngine,
    setEngines,
    setResults,
    setProjects,
    setTasks,
    setSelectedModel,
    setSelectedVoice,
    setVoiceProfiles,
    updateTask,
    pushToast,
  ]);

  return null;
};

export const App = () => (
  <HashRouter>
    <div className="app-shell">
      <AppBootstrap />
      <WindowTitleBar />
      <div className="app-body">
        <Sidebar />
        <RoutedContent />
      </div>
      <ToastRegion />
    </div>
  </HashRouter>
);
