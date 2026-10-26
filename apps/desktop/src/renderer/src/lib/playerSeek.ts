export const clampPlaybackTime = (time: number, duration: number): number =>
  Number.isFinite(time) && Number.isFinite(duration) && duration > 0
    ? Math.max(0, Math.min(time, duration))
    : 0;

export const keyboardSeekTime = (
  key: string,
  time: number,
  duration: number,
): number | undefined => {
  if (key === "Home") return 0;
  if (key === "End") return clampPlaybackTime(duration, duration);
  if (key === "ArrowRight" || key === "ArrowUp")
    return clampPlaybackTime(time + 5, duration);
  if (key === "ArrowLeft" || key === "ArrowDown")
    return clampPlaybackTime(time - 5, duration);
  return undefined;
};
