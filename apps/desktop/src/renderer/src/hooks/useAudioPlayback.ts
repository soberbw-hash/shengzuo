import { useEffect, useRef, useState } from "react";

import { clampPlaybackTime } from "../lib/playerSeek";
import { useStudioStore } from "../store/studioStore";

export const useAudioPlayback = (source: string, fallbackDuration: number) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const pushToast = useStudioStore((state) => state.pushToast);

  const reportPlaybackError = () => {
    setPlaying(false);
    pushToast({
      title: "音频暂时无法播放",
      description: "请确认文件仍在原位置，或重新生成这段音频。",
      tone: "danger",
      replaceKey: "audio-playback-error",
    });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(fallbackDuration);
    const time = () => setCurrentTime(audio.currentTime);
    const metadata = () =>
      setDuration(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : fallbackDuration,
      );
    const started = () => setPlaying(true);
    const stopped = () => setPlaying(false);
    const failed = () => {
      setPlaying(false);
      pushToast({
        title: "音频暂时无法播放",
        description: "请确认文件仍在原位置，或重新生成这段音频。",
        tone: "danger",
        replaceKey: "audio-playback-error",
      });
    };
    audio.addEventListener("timeupdate", time);
    audio.addEventListener("loadedmetadata", metadata);
    audio.addEventListener("play", started);
    audio.addEventListener("pause", stopped);
    audio.addEventListener("ended", stopped);
    audio.addEventListener("error", failed);
    return () => {
      audio.removeEventListener("timeupdate", time);
      audio.removeEventListener("loadedmetadata", metadata);
      audio.removeEventListener("play", started);
      audio.removeEventListener("pause", stopped);
      audio.removeEventListener("ended", stopped);
      audio.removeEventListener("error", failed);
      audio.pause();
    };
  }, [source, fallbackDuration, pushToast]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        reportPlaybackError();
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || audio.readyState === 0) return;
    const next = clampPlaybackTime(time, duration);
    try {
      audio.currentTime = next;
      setCurrentTime(next);
    } catch {
      reportPlaybackError();
    }
  };

  return {
    audioRef,
    playing,
    currentTime,
    duration,
    toggle,
    seekTo,
    progress:
      duration > 0
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0,
  };
};
