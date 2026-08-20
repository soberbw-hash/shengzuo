import { Download, Heart, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  MODEL_CATALOG,
  getGenerationPreset,
  getModelGenerationCapabilities,
  type AudioResult,
} from "@ai-voice-studio/shared-types";

import { exportAudioResult } from "../lib/exportAudio";
import { getUserErrorMessage } from "../lib/errorMessage";
import { resolveResultTitle } from "../lib/projectNaming";
import { useStudioStore } from "../store/studioStore";

const formatDuration = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, "0")}`;
};

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

export const HistoryAudioRow = ({
  result,
  busy,
  projectTitle,
  highlighted = false,
  onEdit,
  onToggleFavorite,
  onDelete,
}: {
  result: AudioResult;
  busy: boolean;
  projectTitle?: string;
  highlighted?: boolean;
  onEdit?: (result: AudioResult) => void;
  onToggleFavorite: (result: AudioResult) => Promise<void>;
  onDelete: (result: AudioResult) => void;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(result.durationSeconds);
  const pushToast = useStudioStore((state) => state.pushToast);
  const source = useMemo(() => result.url, [result.url]);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const modelName =
    MODEL_CATALOG.find((model) => model.id === result.modelId)?.name ??
    "本地模型";
  const presetLabel = getGenerationPreset(result.presetId).label;
  const capabilities = result.modelId
    ? getModelGenerationCapabilities(result.modelId, result.language ?? "auto")
    : undefined;
  const voiceLabel = result.voiceNames?.length
    ? result.voiceNames.length === 1
      ? result.voiceNames[0]
      : `${result.voiceNames.slice(0, 2).join("、")}${result.voiceNames.length > 2 ? `等 ${result.voiceNames.length} 个声音` : ""}`
    : undefined;
  const kindLabel =
    result.kind === "dialogue"
      ? "多人对话"
      : result.kind === "subtitles"
        ? "长稿配音"
        : "单段配音";
  const rowTitle = resolveResultTitle(
    projectTitle,
    result.title,
    result.createdAt,
    kindLabel,
  );
  const rowMeta = [
    kindLabel,
    voiceLabel ? `声音：${voiceLabel}` : undefined,
    `策略：${presetLabel}`,
    capabilities?.emotion && result.emotion
      ? `情绪：${result.emotion}`
      : undefined,
    modelName,
    result.projectId && result.takeNumber
      ? `第 ${result.takeNumber} 版`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () =>
      setDuration(audio.duration || result.durationSeconds);
    const stop = () => setPlaying(false);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", stop);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", stop);
    };
  }, [result.durationSeconds]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (percentage: number) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    audio.currentTime =
      (Math.min(100, Math.max(0, percentage)) / 100) * duration;
  };

  const exportAudio = async () => {
    try {
      const exported = await exportAudioResult(result);
      if (!exported.canceled) {
        pushToast({ title: "音频已导出", tone: "success" });
      }
    } catch (error) {
      pushToast({
        title: "音频没有导出成功",
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    }
  };

  return (
    <article
      className="history-audio-row"
      data-favorite={Boolean(result.favorite)}
      data-highlighted={highlighted}
      data-result-id={result.id}
    >
      <audio ref={audioRef} src={source} preload="metadata" />
      <div className="history-audio-main">
        <button
          type="button"
          className="history-play-button"
          aria-label={playing ? "暂停" : "播放"}
          onClick={() => void togglePlayback()}
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" />
          )}
        </button>

        <div className="history-audio-info">
          <strong title={rowTitle}>{rowTitle}</strong>
          <small title={rowMeta}>{rowMeta}</small>
        </div>
        <time dateTime={result.createdAt}>{formatTime(result.createdAt)}</time>
      </div>

      <div className="history-audio-timeline">
        <button
          type="button"
          className="history-progress"
          aria-label="调整播放进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          role="slider"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            seek(((event.clientX - rect.left) / rect.width) * 100);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") seek(progress - 5);
            if (event.key === "ArrowRight") seek(progress + 5);
          }}
        >
          <span style={{ width: `${progress}%` }} />
        </button>
        <small>
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </small>
      </div>

      <div className="history-audio-actions">
        {onEdit && result.projectId ? (
          <button
            type="button"
            className="history-export-button"
            aria-label="用这个版本继续编辑"
            title="打开当时的文稿并继续编辑"
            onClick={() => onEdit(result)}
          >
            <Pencil className="h-4 w-4" />
            <span>编辑</span>
          </button>
        ) : null}
        <button
          type="button"
          className="history-export-button"
          aria-label="导出音频"
          title="导出"
          onClick={() => void exportAudio()}
        >
          <Download className="h-4 w-4" />
          <span>导出</span>
        </button>
        <button
          type="button"
          className="favorite-button"
          data-active={Boolean(result.favorite)}
          aria-label={result.favorite ? "取消收藏" : "收藏"}
          title={result.favorite ? "取消收藏" : "收藏"}
          disabled={busy}
          onClick={() => void onToggleFavorite(result)}
        >
          <Heart
            className="h-4 w-4"
            fill={result.favorite ? "currentColor" : "none"}
          />
        </button>
        <button
          type="button"
          className="history-delete-button"
          aria-label="删除生成记录"
          title="删除"
          disabled={busy}
          onClick={() => {
            audioRef.current?.pause();
            onDelete(result);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
};
