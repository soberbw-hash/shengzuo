from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ReferenceWindow:
    start_seconds: float
    duration_seconds: float
    silence_ratio: float
    clipping_ratio: float
    rms: float


def reference_duration_error(
    duration_seconds: float, *, ultimate: bool
) -> str | None:
    if duration_seconds < 3.0 or duration_seconds > 60.0:
        return "VOICE_SAMPLE_DURATION"
    if ultimate and duration_seconds > 30.0:
        return "ULTIMATE_REFERENCE_TOO_LONG"
    return None


def reference_window_is_healthy(window: ReferenceWindow) -> bool:
    return (
        3.0 <= window.duration_seconds <= 12.05
        and window.silence_ratio <= 0.45
        and window.clipping_ratio <= 0.015
        and window.rms >= 0.004
    )


def choose_stable_reference_window(
    total_duration_seconds: float,
    candidates: list[ReferenceWindow],
) -> ReferenceWindow | None:
    """Choose a continuous low-silence, low-clipping reference window.

    Healthy recordings up to twelve seconds are kept whole. Longer recordings
    use the best measured candidate; the caller writes that selection to a
    temporary file and never changes the user's original recording.
    """

    healthy = [window for window in candidates if reference_window_is_healthy(window)]
    if not healthy:
        return None
    if total_duration_seconds <= 12.05:
        return min(healthy, key=lambda window: abs(window.start_seconds))

    def score(window: ReferenceWindow) -> tuple[float, float]:
        quality = (
            window.silence_ratio * 5.0
            + window.clipping_ratio * 80.0
            + max(0.0, 0.018 - window.rms) * 8.0
        )
        # Stable quality wins; an earlier window is the deterministic tie-break.
        return quality, window.start_seconds

    return min(healthy, key=score)


def analyze_reference_windows(
    samples: Any,
    sample_rate: int,
    total_duration_seconds: float,
) -> list[ReferenceWindow]:
    """Measure deterministic 10-second candidates from normalized PCM audio."""

    import numpy as np

    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    if sample_rate <= 0 or audio.size == 0:
        return []

    if total_duration_seconds <= 12.05:
        offsets = [0]
        window_samples = audio.size
    else:
        window_samples = min(audio.size, int(round(sample_rate * 10.0)))
        final_start = max(0, audio.size - window_samples)
        hop = max(1, int(round(sample_rate * 0.5)))
        offsets = list(range(0, final_start + 1, hop))
        if not offsets or offsets[-1] != final_start:
            offsets.append(final_start)

    frame_size = max(1, int(round(sample_rate * 0.02)))
    windows: list[ReferenceWindow] = []
    for start in offsets:
        segment = audio[start : start + window_samples]
        frame_count = segment.size // frame_size
        if frame_count:
            framed = segment[: frame_count * frame_size].reshape(
                frame_count, frame_size
            )
            frame_rms = np.sqrt(np.mean(np.square(framed), axis=1))
            silence_ratio = float(np.mean(frame_rms < 0.006))
        else:
            silence_ratio = 1.0
        clipping_ratio = float(np.mean(np.abs(segment) >= 0.995))
        rms = float(np.sqrt(np.mean(np.square(segment))))
        windows.append(
            ReferenceWindow(
                start_seconds=start / sample_rate,
                duration_seconds=segment.size / sample_rate,
                silence_ratio=silence_ratio,
                clipping_ratio=clipping_ratio,
                rms=rms,
            )
        )
    return windows
