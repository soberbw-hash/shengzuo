import {
  Box,
  ChevronRight,
  Cpu,
  Download,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
  FolderOpen,
  PackageOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ENGINE_STATUS_COPY,
  LANGUAGE_OPTIONS,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  type AppRuntimeInfo,
  type DownloadSource,
  type EngineStatus,
  type ModelStorageInfo,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  Modal,
  ProgressBar,
  SelectField,
  StatusBadge,
} from "@ai-voice-studio/ui";

import { PageHeader } from "../components/PageHeader";
import { ModelRating } from "../components/ModelRating";
import { desktopApi } from "../lib/desktopApi";
import { useStudioStore } from "../store/studioStore";

const states: EngineStatus[] = [
  "not-installed",
  "downloading",
  "download-paused",
  "download-failed",
  "installing",
  "loading",
  "ready",
  "generating",
  "success",
  "generation-failed",
  "stopped",
];

const COSYVOICE_ID: ModelId = "fun-cosyvoice3-0.5b";
const COSYVOICE_DIALECTS = LANGUAGE_OPTIONS.filter(
  (option) =>
    option.group === "dialect" &&
    MODEL_LANGUAGE_SUPPORT[COSYVOICE_ID].includes(option.id),
);

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

const formatSpeed = (bytesPerSecond = 0): string => {
  if (bytesPerSecond <= 0) return "正在计算速度";
  return `${formatBytes(bytesPerSecond)}/秒`;
};

const formatEta = (seconds = 0): string => {
  if (seconds <= 0 || !Number.isFinite(seconds)) return "";
  if (seconds < 60) return `约 ${Math.ceil(seconds)} 秒`;
  if (seconds < 3600) return `约 ${Math.ceil(seconds / 60)} 分钟`;
  return `约 ${(seconds / 3600).toFixed(1)} 小时`;
};

const stateAction = (
  status: EngineStatus,
): { label: string; icon: typeof Download } => {
  if (status === "downloading") return { label: "暂停", icon: Pause };
  if (status === "installing") return { label: "暂停", icon: Pause };
  if (status === "download-paused") return { label: "继续", icon: Play };
  if (status === "download-failed")
    return { label: "失败重试", icon: RefreshCw };
  if (
    status === "ready" ||
    status === "success" ||
    status === "generation-failed" ||
    status === "stopped"
  )
    return { label: "使用", icon: Play };
  if (status === "loading" || status === "generating")
    return { label: "运行中", icon: Play };
  return { label: "下载并使用", icon: Download };
};

export const ModelsPage = () => {
  const navigate = useNavigate();
  const previewParams = new URLSearchParams(window.location.search);
  const isTestState = previewParams.has("state");
  const previewDownload = previewParams.get("download");
  const engine = useStudioStore((state) => state.engine);
  const engines = useStudioStore((state) => state.engines);
  const selectedModel = useStudioStore((state) => state.selectedModel);
  const setSelectedModel = useStudioStore((state) => state.setSelectedModel);
  const setEngine = useStudioStore((state) => state.setEngine);
  const setEngines = useStudioStore((state) => state.setEngines);
  const pushToast = useStudioStore((state) => state.pushToast);
  const [downloadSource, setDownloadSource] =
    useState<DownloadSource>("official");
  const [storage, setStorage] = useState<
    Partial<Record<ModelId, ModelStorageInfo>>
  >({});
  const [importingModel, setImportingModel] = useState<ModelId | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [modelsPath, setModelsPath] = useState("正在读取…");
  const [pendingDownload, setPendingDownload] = useState<ModelId | null>(
    MODEL_CATALOG.some((model) => model.id === previewDownload)
      ? (previewDownload as ModelId)
      : null,
  );
  const [changingModelsPath, setChangingModelsPath] = useState(false);
  const snapshot = engine ?? {
    status: "not-installed" as const,
    modelId: selectedModel,
    progress: 0,
    message: ENGINE_STATUS_COPY["not-installed"].message,
    canRetry: false,
  };
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void Promise.all([
        desktopApi.engine.listSnapshots(),
        desktopApi.models.getDownloadSource(),
        ...MODEL_CATALOG.map((model) =>
          desktopApi.models.getStorageInfo(model.id),
        ),
      ]).then(([items, source, ...storageInfo]) => {
        if (disposed) return;
        if (!isTestState) setEngines(items);
        setDownloadSource(source);
        setStorage(
          Object.fromEntries(
            storageInfo.map((info) => [info.modelId, info]),
          ) as Partial<Record<ModelId, ModelStorageInfo>>,
        );
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
    };
  }, [isTestState, setEngines]);

  useEffect(() => {
    void Promise.all([
      desktopApi.app.getRuntimeInfo(),
      desktopApi.app.getModelsPath(),
    ]).then(([runtime, currentModelsPath]) => {
      setRuntimeInfo(runtime);
      setModelsPath(currentModelsPath);
    });
  }, []);

  const changeDownloadSource = async (source: DownloadSource) => {
    try {
      setDownloadSource(await desktopApi.models.setDownloadSource(source));
      pushToast({
        title: source === "official" ? "已使用官方源" : "已使用备用下载源",
        description: "只影响之后开始或继续的下载。",
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "下载源没有切换",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    }
  };

  const importOffline = async (modelId: ModelId) => {
    if (importingModel) return;
    setImportingModel(modelId);
    try {
      const result = await desktopApi.models.importOffline(modelId);
      if (result.canceled) return;
      pushToast({
        title: result.imported ? "离线模型已导入" : "模型没有导入",
        description: result.message,
        tone: result.imported ? "success" : "danger",
      });
      if (result.imported) {
        const [snapshots, storageInfo] = await Promise.all([
          desktopApi.engine.listSnapshots(),
          desktopApi.models.getStorageInfo(modelId),
        ]);
        setEngines(snapshots);
        setStorage((current) => ({ ...current, [modelId]: storageInfo }));
      }
    } catch (error) {
      pushToast({
        title: "离线模型没有导入",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setImportingModel(null);
    }
  };

  const setState = async (status: EngineStatus) => {
    setEngine(
      await desktopApi.engine.command({
        type: "set-mock-state",
        status,
        modelId: selectedModel,
      }),
    );
  };

  const installModel = async (modelId: ModelId) => {
    setPendingDownload(null);
    setEngine(await desktopApi.engine.command({ type: "install", modelId }));
  };

  const chooseModelsPathAndInstall = async () => {
    if (!pendingDownload || changingModelsPath) return;
    const modelId = pendingDownload;
    setChangingModelsPath(true);
    try {
      const result = await desktopApi.app.changeModelsPath();
      if (result.canceled) return;
      setModelsPath(result.path);
      setEngines(await desktopApi.engine.listSnapshots());
      pushToast({
        title: result.moved ? "模型已迁移" : "下载位置已选择",
        description: result.cleanupRequired
          ? "新位置已启用，原文件夹可以手动清理。"
          : undefined,
        tone: result.cleanupRequired ? "warning" : "success",
      });
      await installModel(modelId);
    } catch (error) {
      pushToast({
        title: "没有更改模型位置",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setChangingModelsPath(false);
    }
  };

  const actionFor = async (modelId: ModelId, status: EngineStatus) => {
    setSelectedModel(modelId);
    if (status === "downloading" || status === "installing") {
      setEngine(
        await desktopApi.engine.command({ type: "pause-download", modelId }),
      );
    } else if (status === "download-paused") {
      setEngine(
        await desktopApi.engine.command({ type: "resume-download", modelId }),
      );
    } else if (status === "download-failed") {
      setEngine(await desktopApi.engine.command({ type: "retry", modelId }));
    } else if (status === "not-installed") {
      setPendingDownload(modelId);
    } else if (
      status === "ready" ||
      status === "success" ||
      status === "generation-failed" ||
      status === "stopped"
    ) {
      setEngine(await desktopApi.engine.command({ type: "prepare", modelId }));
      void navigate("/");
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="模型目录"
        description="安装并管理本机声音模型。"
        actions={
          <Button
            variant="secondary"
            onClick={() => void desktopApi.app.openModelsFolder()}
          >
            <FolderOpen className="h-4 w-4" />
            打开模型文件夹
          </Button>
        }
      />

      <div className="model-download-toolbar">
        <div>
          <strong>下载方式</strong>
          <p>自动检查磁盘空间并保留中断进度；官方源慢时可切换备用源。</p>
        </div>
        <SelectField
          label="下载源"
          value={downloadSource}
          onChange={(event) =>
            void changeDownloadSource(event.target.value as DownloadSource)
          }
        >
          <option value="official">官方源</option>
          <option value="mirror">备用源</option>
        </SelectField>
      </div>

      {isTestState ? (
        <div className="model-manager-banner">
          <span className="model-manager-banner__icon">
            <Cpu className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <strong>自动化测试状态</strong>
            <p>以下状态只用于界面测试。</p>
          </div>
          <div className="mock-state-select">
            <SelectField
              label="预览状态"
              value={snapshot.status}
              onChange={(event) =>
                void setState(event.target.value as EngineStatus)
              }
            >
              {states.map((status) => (
                <option key={status} value={status}>
                  {ENGINE_STATUS_COPY[status].label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      ) : null}

      <div className="model-list">
        {MODEL_CATALOG.map((model, index) => {
          const isActive = model.id === selectedModel;
          const modelSnapshot = engines[model.id];
          const status =
            isTestState && isActive
              ? snapshot.status
              : (modelSnapshot?.status ?? "not-installed");
          const copy = ENGINE_STATUS_COPY[status];
          const action = stateAction(status);
          const ActionIcon = action.icon;
          const storageInfo = storage[model.id];
          const progressText = [
            modelSnapshot?.message,
            status === "downloading"
              ? formatSpeed(modelSnapshot?.bytesPerSecond)
              : "",
            status === "downloading"
              ? formatEta(modelSnapshot?.etaSeconds)
              : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <GlassCard
              key={model.id}
              tone="solid"
              padding="lg"
              className="model-card"
              data-active={isActive}
            >
              <div className="model-card__top">
                <span className={`model-logo model-logo--${index + 1}`}>
                  <Box className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{model.name}</h3>
                    <span className="model-recommendation">{model.badge}</span>
                    <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
                  </div>
                  <p>{model.purpose}</p>
                  <small className="model-card__summary">{model.summary}</small>
                  <ModelRating value={model.rating} label={model.ratingLabel} />
                </div>
                <div className="model-card__actions">
                  <Button
                    size="sm"
                    variant={
                      status === "download-failed" ? "danger" : "secondary"
                    }
                    disabled={status === "loading" || status === "generating"}
                    onClick={() => void actionFor(model.id, status)}
                  >
                    <ActionIcon className="h-3.5 w-3.5" />
                    {action.label}
                  </Button>
                  {status === "not-installed" ||
                  status === "download-failed" ? (
                    <button
                      type="button"
                      className="model-offline-button"
                      disabled={Boolean(importingModel)}
                      onClick={() => void importOffline(model.id)}
                    >
                      <PackageOpen className="h-3.5 w-3.5" />
                      {importingModel === model.id ? "正在导入…" : "离线导入"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="model-spec-grid">
                <div>
                  <span>
                    <HardDrive className="h-3.5 w-3.5" />
                    预计空间
                  </span>
                  <strong>{model.estimatedSize}</strong>
                  {storageInfo ? (
                    <small>磁盘可用 {formatBytes(storageInfo.freeBytes)}</small>
                  ) : null}
                </div>
                <div>
                  <span>
                    <Cpu className="h-3.5 w-3.5" />
                    推荐硬件
                  </span>
                  <strong>{model.recommendedHardware}</strong>
                  <small>{model.hardwareNote}</small>
                  {runtimeInfo ? (
                    <small>本机：{runtimeInfo.hardware.summary}</small>
                  ) : null}
                </div>
              </div>
              {model.id === COSYVOICE_ID ? (
                <div className="model-dialects">
                  <strong>
                    支持的方言/口音（{COSYVOICE_DIALECTS.length}）
                  </strong>
                  <div>
                    {COSYVOICE_DIALECTS.map((dialect) => (
                      <span key={dialect.id}>{dialect.label}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {modelSnapshot &&
              modelSnapshot.progress > 0 &&
              status !== "ready" ? (
                <div className="mt-4">
                  <ProgressBar
                    value={modelSnapshot.progress}
                    label={progressText}
                  />
                </div>
              ) : null}
              <div className="model-card__footer">
                <button
                  onClick={() =>
                    pushToast({
                      title: model.license,
                      tone: "success",
                    })
                  }
                >
                  许可证
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <span className="ml-auto">版本：{model.version}</span>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <Modal
        open={pendingDownload !== null}
        title="选择下载位置"
        description={
          pendingDownload
            ? `${MODEL_CATALOG.find((model) => model.id === pendingDownload)?.name ?? "模型"} 会下载到下面的文件夹。`
            : undefined
        }
        onClose={() => {
          if (!changingModelsPath) setPendingDownload(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={changingModelsPath}
              onClick={() => setPendingDownload(null)}
            >
              取消
            </Button>
            <Button
              variant="secondary"
              disabled={changingModelsPath}
              onClick={() => void chooseModelsPathAndInstall()}
            >
              <FolderOpen className="h-4 w-4" />
              {changingModelsPath ? "正在迁移…" : "选择其他位置"}
            </Button>
            <Button
              disabled={changingModelsPath || !pendingDownload}
              onClick={() => {
                if (pendingDownload) void installModel(pendingDownload);
              }}
            >
              <Download className="h-4 w-4" />
              下载到这里
            </Button>
          </>
        }
      >
        <div className="model-download-location">
          <FolderOpen className="h-5 w-5" />
          <span title={modelsPath}>{modelsPath}</span>
        </div>
      </Modal>
    </div>
  );
};
