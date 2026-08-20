import { Download, FolderOpen, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AudioResult } from "@ai-voice-studio/shared-types";
import { Button, GlassCard } from "@ai-voice-studio/ui";

import { desktopApi } from "../lib/desktopApi";
import { getUserErrorMessage } from "../lib/errorMessage";
import { exportAudioResult } from "../lib/exportAudio";
import { useStudioStore } from "../store/studioStore";

const waveform = [
  28, 45, 36, 64, 48, 78, 52, 38, 70, 86, 55, 42, 68, 80, 46, 58, 34, 72, 48,
  30,
];

const formatTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? seconds : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, "0")}`;
};

export const AudioPlayer = ({
  result,
  onRegenerate,
  compact = false,
}: {
  result: AudioResult;
  onRegenerate: () => void;
  compact?: boolean;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(result.durationSeconds);
  const pushToast = useStudioStore((state) => state.pushToast);
  const source = useMemo(() => result.url, [result.url]);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const timeUpdate = () => setCurrentTime(audio.currentTime);
    const metadata = () =>
      setDuration(audio.duration || result.durationSeconds);
    const ended = () => setPlaying(false);
    audio.addEventListener("timeupdate", timeUpdate);
    audio.addEventListener("loadedmetadata", metadata);
    audio.addEventListener("ended", ended);
    return () => {
      audio.removeEventListener("timeupdate", timeUpdate);
      audio.removeEventListener("loadedmetadata", metadata);
      audio.removeEventListener("ended", ended);
    };
  }, [result.durationSeconds]);

  const toggle = async () => {
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

  const exportAudio = async () => {
    try {
      const exported = await exportAudioResult(result);
      if (!exported.canceled) {
        pushToast({
          title: "音频已导出",
          description: exported.filePath,
          tone: "success",
        });
      }
    } catch (error) {
      pushToast({
        title: "音频没有导出成功",
        description: getUserErrorMessage(error, "请重试。"),
        tone: "danger",
      });
    }
  };

  const openFolder = async () => {
    const opened = await desktopApi.audio.openExportFolder();
    pushToast(
      opened
        ? { title: "已打开导出位置", tone: "success" }
        : {
            title: "请先导出一次音频",
            description: "导出后即可直接打开所在文件夹。",
            tone: "info",
          },
    );
  };

  if (compact) {
    return (
      <div className="compact-generation-result" aria-live="polite">
        <audio ref={audioRef} src={source} preload="metadata" />
        <button
          className="player-button"
          aria-label={playing ? "暂停生成结果" : "播放生成结果"}
          onClick={() => void toggle()}
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" />
          )}
        </button>
        <div className="compact-generation-result__body">
          <div>
            <strong>{result.preview ? "试听好了" : "配音生成好了"}</strong>
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <button
            type="button"
            className="compact-audio-progress"
            aria-label="调整播放进度"
            onClick={(event) => {
              const audio = audioRef.current;
              if (!audio || duration <= 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              audio.currentTime =
                ((event.clientX - rect.left) / rect.width) * duration;
            }}
          >
            <span style={{ width: `${progress}%` }} />
          </button>
        </div>
        <button
          type="button"
          className="compact-result-action"
          title={result.preview ? "重新试听" : "重新生成"}
          aria-label={result.preview ? "重新试听" : "重新生成"}
          onClick={onRegenerate}
        >
          <RotateCcw className="h-4 w-4" />
          <span>{result.preview ? "再试听" : "重新生成"}</span>
        </button>
        {result.preview ? null : (
          <button
            type="button"
            className="compact-result-action compact-result-action--primary"
            title="导出音频"
            aria-label="导出音频"
            onClick={() => void exportAudio()}
          >
            <Download className="h-4 w-4" />
            <span>导出</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <GlassCard tone="solid" padding="md" className="audio-result-card">
      <audio ref={audioRef} src={source} preload="metadata" />
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[17px] font-bold text-[#172235]">
          {result.preview ? "试听结果" : "生成结果"}
        </h3>
        <span className="rounded-full bg-[#e8f8f0] px-3 py-1 text-[11px] font-bold text-[#128552]">
          已完成 · {result.format.toUpperCase()}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          className="player-button"
          aria-label={playing ? "暂停" : "播放"}
          onClick={() => void toggle()}
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="waveform"
            role="slider"
            aria-label="音频进度"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
            onClick={(event) => {
              const audio = audioRef.current;
              if (!audio || duration <= 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              audio.currentTime =
                ((event.clientX - rect.left) / rect.width) * duration;
            }}
          >
            {waveform.map((height, index) => {
              const active = (index / waveform.length) * 100 <= progress;
              return (
                <span
                  key={`${height}-${index}`}
                  style={{ height: `${height}%` }}
                  data-active={active}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-medium text-[#78879a]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {result.quality ? (
        <div
          className="audio-quality-note"
          data-status={result.quality.status}
          title={result.quality.note}
        >
          <strong>
            {result.quality.status === "passed" ? "音频检查通过" : "建议试听"}
          </strong>
          <span>{result.quality.note}</span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onRegenerate}>
          <RotateCcw className="h-3.5 w-3.5" />
          {result.preview ? "重新试听" : "重新生成"}
        </Button>
        {result.preview ? null : (
          <>
            <Button size="sm" onClick={() => void exportAudio()}>
              <Download className="h-3.5 w-3.5" />
              导出音频
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void openFolder()}>
              <FolderOpen className="h-3.5 w-3.5" />
              打开文件位置
            </Button>
          </>
        )}
      </div>
    </GlassCard>
  );
};
