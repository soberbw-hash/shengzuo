import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
} from "lucide-react";

import {
  ENGINE_STATUS_COPY,
  type EngineSnapshot,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import {
  Button,
  GlassCard,
  ProgressBar,
  StatusBadge,
} from "@ai-voice-studio/ui";

import { desktopApi } from "../lib/desktopApi";

const statusIcons = {
  neutral: Download,
  info: LoaderCircle,
  success: CheckCircle2,
  warning: Pause,
  danger: AlertCircle,
} as const;

const progressStatuses = new Set([
  "downloading",
  "download-paused",
  "download-failed",
  "installing",
  "loading",
  "generating",
  "generation-failed",
]);

export const EngineStatusPanel = ({
  snapshot,
  modelId,
  onChanged,
}: {
  snapshot: EngineSnapshot;
  modelId: ModelId;
  onChanged: (snapshot: EngineSnapshot) => void;
}) => {
  const copy = ENGINE_STATUS_COPY[snapshot.status];
  const Icon = statusIcons[copy.tone];

  const execute = async () => {
    if (snapshot.status === "not-installed") {
      onChanged(await desktopApi.engine.command({ type: "install", modelId }));
      return;
    }
    if (snapshot.status === "downloading" || snapshot.status === "installing") {
      onChanged(
        await desktopApi.engine.command({ type: "pause-download", modelId }),
      );
      return;
    }
    if (snapshot.status === "download-paused") {
      onChanged(
        await desktopApi.engine.command({ type: "resume-download", modelId }),
      );
      return;
    }
    if (
      snapshot.status === "download-failed" ||
      snapshot.status === "generation-failed"
    ) {
      onChanged(await desktopApi.engine.command({ type: "retry", modelId }));
      return;
    }
  };

  const buttonLabel =
    snapshot.status === "not-installed"
      ? "下载并使用"
      : snapshot.status === "downloading"
        ? "暂停下载"
        : snapshot.status === "installing"
          ? "暂停安装"
          : snapshot.status === "download-paused"
            ? "继续下载"
            : snapshot.status === "download-failed" ||
                snapshot.status === "generation-failed"
              ? "重试"
              : null;

  return (
    <GlassCard tone="soft" padding="sm" className="engine-status-panel">
      <div className="flex items-start gap-3">
        <span className={`engine-status-icon engine-status-icon--${copy.tone}`}>
          <Icon
            className={`h-[18px] w-[18px] ${
              snapshot.status === "loading" || snapshot.status === "installing"
                ? "animate-spin"
                : ""
            }`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[13px] text-[#27364a]">生成引擎</strong>
            <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
          </div>
          {snapshot.status !== "ready" && snapshot.status !== "success" ? (
            <p className="mt-1 text-[12px] leading-5 text-[#607188]">
              {snapshot.message}
            </p>
          ) : null}
        </div>
        {buttonLabel ? (
          <Button size="sm" variant="secondary" onClick={() => void execute()}>
            {snapshot.status.includes("paused") ? (
              <Play className="h-3.5 w-3.5" />
            ) : snapshot.status.includes("failed") ? (
              <RotateCw className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {buttonLabel}
          </Button>
        ) : null}
      </div>
      {snapshot.progress > 0 && progressStatuses.has(snapshot.status) ? (
        <ProgressBar value={snapshot.progress} compact />
      ) : null}
    </GlassCard>
  );
};
