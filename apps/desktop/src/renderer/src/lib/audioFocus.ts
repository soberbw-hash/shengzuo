interface AudioPlaybackTarget {
  paused: boolean;
  pause: () => void;
}

export const pauseOtherAudio = (
  active: AudioPlaybackTarget,
  sources: Iterable<AudioPlaybackTarget>,
): void => {
  for (const source of sources) {
    if (source !== active && !source.paused) source.pause();
  }
};
