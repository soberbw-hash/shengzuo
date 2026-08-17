import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cpu,
  FileArchive,
  FileAudio,
  FolderOpen,
  HardDrive,
  Info,
  RefreshCw,
  Stethoscope,
  Wrench,
} from "lucide-react";
import {
  DEFAULT_EXPORT_NAMING_TEMPLATE,
  EXPORT_NAMING_TOKENS,
  isExportNamingTemplate,
  renderExportFileStem,
  type AppRuntimeInfo,
  type SystemCheckItemStatus,
  type SystemCheckResult,
} from "@ai-voice-studio/shared-types";
import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { Button, GlassCard, Modal, TextField } from "@ai-voice-studio/ui";

import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { desktopApi } from "../lib/desktopApi";
import { useStudioStore } from "../store/studioStore";

const SettingRow = ({
  icon,
  title,
  description,
  children,
}: PropsWithChildren<{
  icon: ReactNode;
  title: string;
  description?: string;
}>) => (
  <div className="setting-row">
    <span className="setting-row__icon">{icon}</span>
    <div className="min-w-0 flex-1">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
    <div className="setting-row__action">{children}</div>
  </div>
);

const EnabledValue = ({ children }: PropsWithChildren) => (
  <strong className="setting-fixed-value">{children}</strong>
);

const checkStatusCopy: Record<
  SystemCheckItemStatus,
  { label: string; icon: ReactNode }
> = {
  ok: {
    label: "正常",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  repaired: {
    label: "已修复",
    icon: <Wrench className="h-4 w-4" />,
  },
  notice: {
    label: "未准备",
    icon: <Info className="h-4 w-4" />,
  },
  attention: {
    label: "需处理",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
};

export const SettingsPage = () => {
  const navigate = useNavigate();
  const captureNaming =
    new URLSearchParams(window.location.search).get("naming") ??
    new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("naming");
  const [showLicenses, setShowLicenses] = useState(false);
  const [showNaming, setShowNaming] = useState(captureNaming === "1");
  const [modelsPath, setModelsPath] = useState("正在读取…");
  const [namingTemplate, setNamingTemplate] = useState(
    DEFAULT_EXPORT_NAMING_TEMPLATE,
  );
  const [namingDraft, setNamingDraft] = useState(
    DEFAULT_EXPORT_NAMING_TEMPLATE,
  );
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [movingModels, setMovingModels] = useState(false);
  const [savingNaming, setSavingNaming] = useState(false);
  const [checkingSystem, setCheckingSystem] = useState(false);
  const [systemCheck, setSystemCheck] = useState<SystemCheckResult | null>(
    null,
  );
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const pushToast = useStudioStore((state) => state.pushToast);

  useEffect(() => {
    void Promise.all([
      desktopApi.app.getModelsPath(),
      desktopApi.app.getRuntimeInfo(),
      desktopApi.audio.getExportNamingSettings(),
    ]).then(([pathValue, runtime, naming]) => {
      setModelsPath(pathValue);
      setRuntimeInfo(runtime);
      setNamingTemplate(naming.template);
      setNamingDraft(naming.template);
    });
  }, []);

  const namingPreview = `${renderExportFileStem(namingDraft, {
    title: "产品介绍",
    kind: "single",
    modelName: "VoxCPM2",
    createdAt: "2026-08-17T14:26:08",
  })}.mp3`;
  const namingValid = isExportNamingTemplate(namingDraft);

  const saveNaming = async () => {
    if (!namingValid || savingNaming) return;
    setSavingNaming(true);
    try {
      const saved = await desktopApi.audio.updateExportNamingSettings({
        template: namingDraft,
      });
      setNamingTemplate(saved.template);
      setNamingDraft(saved.template);
      setShowNaming(false);
      pushToast({ title: "文件命名规则已保存", tone: "success" });
    } catch (error) {
      pushToast({
        title: "命名规则没有保存",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setSavingNaming(false);
    }
  };

  const exportDiagnostics = async () => {
    if (exportingDiagnostics) return;
    setExportingDiagnostics(true);
    try {
      const result = await desktopApi.app.exportDiagnostics();
      if (!result.canceled) {
        pushToast({
          title: "诊断包已导出",
          description: "ZIP 不包含稿件、录音和私人路径。",
          tone: "success",
        });
      }
    } catch (error) {
      pushToast({
        title: "诊断包没有导出",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setExportingDiagnostics(false);
    }
  };

  const checkAndRepair = async () => {
    if (checkingSystem) return;
    setCheckingSystem(true);
    try {
      const result = await desktopApi.app.checkAndRepair();
      setSystemCheck(result);
      setShowSystemCheck(true);
      pushToast({
        title:
          result.overall === "healthy"
            ? result.repairedCount > 0
              ? "检查完成，问题已修复"
              : "检查完成，一切正常"
            : `检查完成，${result.attentionCount} 项需要处理`,
        description: `${result.readyModelCount} 款模型已准备完整。`,
        tone: result.overall === "healthy" ? "success" : "warning",
      });
    } catch (error) {
      pushToast({
        title: "检查没有完成",
        description:
          error instanceof Error ? error.message : "请关闭软件后重新打开。",
        tone: "danger",
      });
    } finally {
      setCheckingSystem(false);
    }
  };

  const changeModelsPath = async () => {
    if (movingModels) return;
    setMovingModels(true);
    try {
      const result = await desktopApi.app.changeModelsPath();
      if (result.canceled) return;
      setModelsPath(result.path);
      pushToast({
        title: result.moved ? "模型已迁移" : "模型位置已更新",
        description: result.cleanupRequired
          ? "新位置已启用；原文件夹无法自动删除，可以手动清理。"
          : "后续下载会继续保存到这里。",
        tone: result.cleanupRequired ? "warning" : "success",
      });
    } catch (error) {
      pushToast({
        title: "没有更改模型位置",
        description: error instanceof Error ? error.message : "请重试。",
        tone: "danger",
      });
    } finally {
      setMovingModels(false);
    }
  };

  return (
    <div className="page-content">
      <PageHeader title="设置" />

      <GlassCard tone="soft" padding="md" className="settings-health-card">
        <div className="settings-health-banner">
          <span className="settings-health-banner__icon">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <strong>检查与修复</strong>
            <p>检查后台、模型、FFmpeg 和文件权限。</p>
            {systemCheck ? (
              <small>
                上次结果：{systemCheck.readyModelCount} 款模型可用
                {systemCheck.attentionCount
                  ? `，${systemCheck.attentionCount} 项需处理`
                  : "，基础配置正常"}
              </small>
            ) : null}
          </div>
          <Button
            variant="secondary"
            disabled={checkingSystem}
            onClick={() => void checkAndRepair()}
          >
            <RefreshCw
              className={`h-4 w-4${checkingSystem ? " animate-spin" : ""}`}
            />
            {checkingSystem ? "正在检查…" : "一键检查修复"}
          </Button>
        </div>
      </GlassCard>

      <div className="settings-grid">
        <GlassCard tone="solid" padding="lg">
          <SectionHeading title="本机" />
          <div className="mt-4 divide-y divide-[#e7eef5]">
            <SettingRow
              icon={<HardDrive className="h-4 w-4" />}
              title="模型文件夹"
              description="下载的模型和未完成的断点都在这里。"
            >
              <div className="model-path-actions">
                <button
                  className="path-button"
                  onClick={() => void desktopApi.app.openModelsFolder()}
                >
                  <span title={modelsPath}>{modelsPath}</span>
                  <FolderOpen className="h-4 w-4" />
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={movingModels}
                  onClick={() => void changeModelsPath()}
                >
                  {movingModels ? "正在迁移…" : "迁移位置"}
                </Button>
              </div>
            </SettingRow>
            <SettingRow
              icon={<FileAudio className="h-4 w-4" />}
              title="导出文件名"
              description={`示例：${renderExportFileStem(namingTemplate, {
                title: "产品介绍",
                kind: "single",
                modelName: "VoxCPM2",
                createdAt: "2026-08-17T14:26:08",
              })}.mp3`}
            >
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setNamingDraft(namingTemplate);
                  setShowNaming(true);
                }}
              >
                修改规则
              </Button>
            </SettingRow>
            <SettingRow
              icon={<Cpu className="h-4 w-4" />}
              title="运行设备"
              description={
                runtimeInfo?.hardware.summary ?? "正在检测显卡和系统内存…"
              }
            >
              <EnabledValue>
                {runtimeInfo?.hardware.computeMode === "cpu" ? "CPU" : "CUDA"}
              </EnabledValue>
            </SettingRow>
          </div>
        </GlassCard>

        <GlassCard tone="solid" padding="lg">
          <SectionHeading title="帮助与维护" />
          <div className="mt-4 divide-y divide-[#e7eef5]">
            <SettingRow
              icon={<CircleHelp className="h-4 w-4" />}
              title="使用帮助"
            >
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigate("/help")}
              >
                打开帮助
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </SettingRow>
            <SettingRow
              icon={<Stethoscope className="h-4 w-4" />}
              title="导出诊断包"
              description="仅包含脱敏日志、系统和显卡信息。"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={exportingDiagnostics}
                onClick={() => void exportDiagnostics()}
              >
                <FileArchive className="h-3.5 w-3.5" />
                {exportingDiagnostics ? "正在整理…" : "导出 ZIP"}
              </Button>
            </SettingRow>
            <SettingRow
              icon={<FileArchive className="h-4 w-4" />}
              title="开源许可"
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowLicenses(true)}
              >
                查看
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </SettingRow>
          </div>
        </GlassCard>
      </div>

      <Modal
        open={showNaming}
        title="导出文件名"
        description="保存后会一直使用；每次导出仍可临时改名。"
        onClose={() => {
          setNamingDraft(namingTemplate);
          setShowNaming(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setNamingDraft(namingTemplate);
                setShowNaming(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={!namingValid || savingNaming}
              onClick={() => void saveNaming()}
            >
              {savingNaming ? "正在保存…" : "保存规则"}
            </Button>
          </>
        }
      >
        <div className="export-naming-editor">
          <TextField
            label="命名规则"
            aria-label="文件命名规则"
            value={namingDraft}
            maxLength={120}
            error={namingValid ? undefined : "请保留文字，并只使用下方内容。"}
            onChange={(event) => setNamingDraft(event.target.value)}
          />
          <div className="export-naming-tokens" aria-label="可插入的命名内容">
            {EXPORT_NAMING_TOKENS.map((item) => (
              <button
                key={item.token}
                type="button"
                onClick={() =>
                  setNamingDraft(
                    (value) =>
                      `${value}${value && !/[_\- ]$/u.test(value) ? "_" : ""}${item.token}`,
                  )
                }
              >
                + {item.label}
              </button>
            ))}
          </div>
          <div className="export-naming-preview">
            <small>导出示例</small>
            <strong>{namingPreview}</strong>
          </div>
          <button
            type="button"
            className="export-naming-reset"
            onClick={() => setNamingDraft(DEFAULT_EXPORT_NAMING_TEMPLATE)}
          >
            恢复推荐规则
          </button>
        </div>
      </Modal>

      <Modal
        open={showSystemCheck}
        title={
          systemCheck?.overall === "attention"
            ? "检查完成 · 有项目需要处理"
            : systemCheck?.repairedCount
              ? "检查完成 · 已自动修复"
              : "检查完成 · 一切正常"
        }
        description={
          systemCheck
            ? `${systemCheck.readyModelCount} 款模型可用；${systemCheck.attentionCount} 项需要处理。`
            : "正在检查本地运行环境。"
        }
        onClose={() => setShowSystemCheck(false)}
        footer={
          <>
            {systemCheck?.attentionCount ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setShowSystemCheck(false);
                  void navigate("/models");
                }}
              >
                打开本地引擎
              </Button>
            ) : null}
            <Button onClick={() => setShowSystemCheck(false)}>完成</Button>
          </>
        }
      >
        <div className="system-check-list">
          {systemCheck?.items.map((item) => {
            const status = checkStatusCopy[item.status];
            return (
              <div
                className="system-check-item"
                data-status={item.status}
                key={item.id}
              >
                <span className="system-check-item__icon">{status.icon}</span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
                <small>{status.label}</small>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={showLicenses}
        title="开源许可"
        description="本软件使用的开源组件。"
        onClose={() => setShowLicenses(false)}
        footer={<Button onClick={() => setShowLicenses(false)}>知道了</Button>}
      >
        <div className="space-y-2 text-[13px] text-[#607188]">
          {[
            "VoxCPM2 · Apache License 2.0",
            "Fun-CosyVoice3 · Apache License 2.0",
            "Electron、React、Vite、Tailwind CSS · MIT License",
            "Lucide · ISC License",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[12px] border border-[#e3ebf4] bg-[#f8fbfe] px-3 py-2.5"
            >
              {item}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};
