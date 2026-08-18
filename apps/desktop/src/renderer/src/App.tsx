import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import type { EngineStatus } from "@ai-voice-studio/shared-types";

import { Sidebar } from "./components/Sidebar";
import { ToastRegion } from "./components/ToastRegion";
import { WindowTitleBar } from "./components/WindowTitleBar";
import { desktopApi } from "./lib/desktopApi";
import { featureRegistry } from "./featureRegistry";
import { useStudioStore } from "./store/studioStore";

const RoutedContent = () => {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const updateScrollHint = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    setCanScrollMore(
      main.scrollHeight > main.clientHeight + 12 &&
        main.scrollTop + main.clientHeight < main.scrollHeight - 12,
    );
  }, []);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const content = contentRef.current;
    if (!main || !content) return;
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(main);
    observer.observe(content);
    window.addEventListener("resize", updateScrollHint);
    const frame = window.requestAnimationFrame(updateScrollHint);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateScrollHint);
      observer.disconnect();
    };
  }, [location.pathname, updateScrollHint]);

  return (
    <motion.main
      ref={mainRef}
      key={location.pathname}
      className="main-scroll"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.28,
        ease: [0.22, 1, 0.36, 1],
      }}
      onScroll={updateScrollHint}
    >
      <div ref={contentRef} className="route-content">
        <Routes location={location}>
          {featureRegistry.map(({ path, component: Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {canScrollMore ? (
        <button
          type="button"
          className="scroll-more-button"
          aria-label="下方还有内容，向下滚动"
          onClick={() =>
            mainRef.current?.scrollBy({
              top: Math.max(260, mainRef.current.clientHeight * 0.68),
              behavior: reduceMotion ? "auto" : "smooth",
            })
          }
        >
          下方还有内容
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
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

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      const voices = await desktopApi.voices.list();
      if (!disposed) {
        setVoiceProfiles(voices);
        if (voices[0]) setSelectedVoice(voices[0].id);
      }
      const params = new URLSearchParams(window.location.search);
      const captureState = params.get("state") as EngineStatus | null;
      if (captureState) {
        const snapshot = await desktopApi.engine.command({
          type: "set-mock-state",
          status: captureState,
        });
        if (!disposed) {
          setSelectedModel(snapshot.modelId);
          setEngine(snapshot);
        }
      } else {
        const snapshots = await desktopApi.engine.listSnapshots();
        if (!disposed) {
          setEngines(snapshots);
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
      const results = await desktopApi.audio.listResults();
      if (!disposed) setResults(results);
      const [projects, tasks] = await Promise.all([
        desktopApi.projects.list(),
        desktopApi.tasks.list(),
      ]);
      if (!disposed) {
        setProjects(projects);
        setTasks(tasks);
      }
    };
    void initialize();
    const unsubscribe = desktopApi.engine.onSnapshot((snapshot) => {
      if (!disposed) setEngine(snapshot);
    });
    const unsubscribeTasks = desktopApi.tasks.onChanged((task) => {
      if (!disposed) updateTask(task);
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
