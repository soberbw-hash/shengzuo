import {
  Box,
  Cpu,
  Download,
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
  type DownloadSource,
  type EngineSnapshot,
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
import { getUserErrorMessage } from "../lib/errorMessage";
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

interface ModelsPageLoadIssues {
  snapshots: boolean;
  downloadSource: boolean;
  storage: Partial<Record<ModelId, boolean>>;
}

type ModelsPageLoadValue =
  | { kind: "snapshots"; value: EngineSnapshot[] }
  | { kind: "download-source"; value: DownloadSource }
  | { kind: "storage"; modelId: ModelId; value: ModelStorageInfo };

interface ModelsPageLoadTask {
  kind: ModelsPageLoadValue["kind"];
  modelId?: ModelId;
  promise: Promise<ModelsPageLoadValue>;
}

const MODEL_USE_STATUSES = new Set<EngineStatus>([
  "ready",
  "success",
  "generation-failed",
  "stopped",
]);

const isExplicitModelUseStatus = (status: EngineStatus): boolean =>
  MODEL_USE_STATUSES.has(status);

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
    return { label: "重新下载", icon: RefreshCw };
  if (
    status === "ready" ||
    status === "success" ||
    status === "generation-failed" ||
    status === "stopped"
  )
    return { label: "使用", icon: Play };
  if (status === "loading" || status === "generating")
    return { label: "运行中", icon: Play };
  return { label: "下载", icon: Download };
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
  const [modelsPath, setModelsPath] = useState("正在读取…");
  const [dialectsOpen, setDialectsOpen] = useState(false);
  const [licenseModelId, setLicenseModelId] = useState<ModelId | null>(null);
  const [pendingDownload, setPendingDownload] = useState<ModelId | null>(
    MODEL_CATALOG.some((model) => model.id === previewDownload)
      ? (previewDownload as ModelId)
      : null,
  );
  const [changingModelsPath, setChangingModelsPath] = useState(false);
  const [loadIssues, setLoadIssues] = useState<ModelsPageLoadIssues>({
    snapshots: false,
    downloadSource: false,
    storage: {},
  });
  const snapshot = engine ?? {
    status: "not-installed" as const,
    modelId: selectedModel,
    progress: 0,
    message: ENGINE_STATUS_COPY["not-installed"].message,
    canRetry: false,
  };
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const loadTasks: ModelsPageLoadTask[] = [
        {
          kind: "snapshots",
          promise: desktopApi.engine
            .listSnapshots()
            .then((value) => ({ kind: "snapshots", value })),
        },
        {
          kind: "download-source",
          promise: desktopApi.models
            .getDownloadSource()
            .then((value) => ({ kind: "download-source", value })),
        },
        ...MODEL_CATALOG.map(
          (model): ModelsPageLoadTask => ({
            kind: "storage",
            modelId: model.id,
            promise: desktopApi.models
              .getStorageInfo(model.id)
              .then((value) => ({
                kind: "storage",
                modelId: model.id,
                value,
              })),
          }),
        ),
      ];
      const settled = await Promise.allSettled(
        loadTasks.map((task) => task.promise),
      );
      if (disposed) return;

      const nextIssues: ModelsPageLoadIssues = {
        snapshots: false,
        downloadSource: false,
        storage: {},
      };
      const storageUpdates: Partial<Record<ModelId, ModelStorageInfo>> = {};

      settled.forEach((result, index) => {
        const task = loadTasks[index];
        if (!task) return;
        if (result.status === "rejected") {
          if (task.kind === "snapshots") nextIssues.snapshots = true;
          if (task.kind === "download-source") {
            nextIssues.downloadSource = true;
          }
          if (task.kind === "storage" && task.modelId) {
            nextIssues.storage[task.modelId] = true;
          }
          return;
        }

        const loaded = result.value;
        if (loaded.kind === "snapshots") {
          if (!isTestState) setEngines(loaded.value);
          return;
        }
        if (loaded.kind === "download-source") {
          setDownloadSource(loaded.value);
          return;
        }
        storageUpdates[loaded.modelId] = loaded.value;
      });

      setStorage((current) => ({ ...current, ...storageUpdates }));
      setLoadIssues(nextIssues);

      const failedStorageCount = Object.keys(nextIssues.storage).length;
      const failedParts = [
        nextIssues.snapshots ? "模型状态" : "",
        nextIssues.downloadSource ? "下载源" : "",
        failedStorageCount > 0 ? `${failedStorageCount} 个模型的空间信息` : "",
      ].filter(Boolean);
      if (failedParts.length > 0) {
        pushToast({
          title: "部分模型信息没有刷新",
          description: `暂时没有读到：${failedParts.join("、")}。其他信息仍可正常使用，回到本页会自动重试。`,
          tone: "warning",
          dedupeKey: "models-page-partial-load",
        });
      }
    };
    void refresh();
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [isTestState, pushToast, setEngines]);

  useEffect(() => {
    void desktopApi.app.getModelsPath().then(setModelsPath);
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
        description: getUserErrorMessage(error, "请重试。"),
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
        title: result.imported ? "模型已导入" : "模型没有导入",
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
        title: "模型没有导入",
        description: getUserErrorMessage(error, "请重试。"),
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
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    } finally {
      setChangingModelsPath(false);
    }
  };

  const actionFor = async (modelId: ModelId, status: EngineStatus) => {
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
    } else if (isExplicitModelUseStatus(status)) {
      const prepared = await desktopApi.engine.command({
        type: "prepare",
        modelId,
      });
      setEngine(prepared);
      setSelectedModel(modelId);
      void navigate("/");
    }
  };

  return (
    <div className="page-content models-page">
      <PageHeader
        title="本地模型"
        description="按用途选一款；不知道怎么选就用 VoxCPM2。"
        actions={
          <div className="page-header-actions model-page-actions">
            <div className="model-download-source-field">
              <SelectField
                label="下载源"
                value={downloadSource}
                onChange={(event) =>
                  void changeDownloadSource(
                    event.target.value as DownloadSource,
                  )
                }
              >
                <option value="official">官方源</option>
                <option value="mirror">备用源</option>
              </SelectField>
            </div>
            <Button
              variant="secondary"
              onClick={() => void desktopApi.app.openModelsFolder()}
            >
              <FolderOpen className="h-4 w-4" />
              打开模型文件夹
            </Button>
          </div>
        }
      />

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

      {!isTestState && (loadIssues.snapshots || loadIssues.downloadSource) ? (
        <div className="model-manager-banner" role="status">
          <span className="model-manager-banner__icon">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <strong>部分信息没有刷新</strong>
            <p>
              {loadIssues.snapshots ? "模型状态暂时没有读到。" : ""}
              {loadIssues.downloadSource ? "下载源暂按当前选项显示。" : ""}
              切回本页会自动重试。
            </p>
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
          const snapshotUnavailable =
            !isTestState && loadIssues.snapshots && !modelSnapshot;
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
                    {model.usageRestriction ? (
                      <span
                        className="model-usage-restriction"
                        title="当前安装组合包含仅限非商业使用的辅助权重"
                      >
                        {model.usageRestriction}
                      </span>
                    ) : null}
                    <StatusBadge
                      tone={snapshotUnavailable ? "warning" : copy.tone}
                    >
                      {snapshotUnavailable ? "状态未读到" : copy.label}
                    </StatusBadge>
                  </div>
                  <ModelRating value={model.rating} label={model.ratingLabel} />
                </div>
                <div className="model-card__actions">
                  <Button
                    size="sm"
                    variant={
                      status === "download-failed" ? "danger" : "secondary"
                    }
                    disabled={
                      snapshotUnavailable ||
                      status === "loading" ||
                      status === "generating"
                    }
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
                      {importingModel === model.id
                        ? "正在导入…"
                        : "从文件夹导入"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="model-facts">
                <div>
                  <span>适合</span>
                  <strong title={model.purpose}>{model.purpose}</strong>
                </div>
                <div>
                  <span>电脑需要</span>
                  <strong title={model.recommendedHardware}>
                    {model.recommendedHardware}
                  </strong>
                </div>
                <div>
                  <span>占用空间</span>
                  <strong title={model.estimatedSize}>
                    {model.estimatedSize}
                  </strong>
                  {storageInfo ? (
                    <small>
                      还剩 {formatBytes(storageInfo.freeBytes)}
                      {loadIssues.storage[model.id] ? " · 暂未刷新" : ""}
                    </small>
                  ) : loadIssues.storage[model.id] ? (
                    <small>空间信息暂时没有读到</small>
                  ) : null}
                </div>
                <div>
                  <span>语言</span>
                  <strong title={model.hardwareNote}>
                    {model.hardwareNote}
                  </strong>
                  {model.id === COSYVOICE_ID ? (
                    <button
                      type="button"
                      className="model-dialect-button"
                      onClick={() => setDialectsOpen(true)}
                    >
                      查看全部
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="model-license-button"
                onClick={() => setLicenseModelId(model.id)}
              >
                查看模型许可证
              </button>
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
            </GlassCard>
          );
        })}
      </div>

      <Modal
        open={dialectsOpen}
        title={`${COSYVOICE_DIALECTS.length} 种方言和口音`}
        description="CosyVoice 可以直接选择下面这些说法。"
        onClose={() => setDialectsOpen(false)}
        footer={<Button onClick={() => setDialectsOpen(false)}>知道了</Button>}
      >
        <div className="model-dialect-list">
          {COSYVOICE_DIALECTS.map((dialect) => (
            <span key={dialect.id}>{dialect.label}</span>
          ))}
        </div>
      </Modal>

      <Modal
        open={licenseModelId !== null}
        title={`${MODEL_CATALOG.find((model) => model.id === licenseModelId)?.name ?? "模型"} 许可证`}
        description="使用和分享模型文件前，请遵守模型作者的许可条款。"
        onClose={() => setLicenseModelId(null)}
        footer={<Button onClick={() => setLicenseModelId(null)}>知道了</Button>}
      >
        <div className="model-license-content">
          <strong>
            {MODEL_CATALOG.find((model) => model.id === licenseModelId)
              ?.license ?? "未找到许可证"}
          </strong>
          <p>
            完整许可文件保存在软件目录的 licenses 文件夹中，可长期查看和复制。
          </p>
          {MODEL_CATALOG.find((model) => model.id === licenseModelId)
            ?.usageRestriction ? (
            <p className="model-license-restriction">
              当前安装组合包含仅限非商业使用的辅助权重。用于收费内容、商业宣传或其他商业用途前，请先取得相应授权，或改用
              VoxCPM2 / Fun-CosyVoice3。
            </p>
          ) : null}
        </div>
      </Modal>

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
        {pendingDownload === "indextts2-5" ? (
          <div className="model-download-license-note" role="note">
            <strong>当前组合仅限非商业使用</strong>
            <p>
              包含采用非商业许可的辅助权重。用于收费内容、商业宣传或其他商业用途前，请先取得授权，或选择另外两款模型。
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
