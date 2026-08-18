from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    args = parser.parse_args()
    audio_path = Path(args.audio).resolve()
    if not audio_path.is_file() or audio_path.suffix.lower() != ".mp3":
        raise RuntimeError("INVALID_AUDIO_PATH")

    samples, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    if sample_rate <= 0 or samples.size == 0:
        raise RuntimeError("EMPTY_AUDIO")
    mono = np.mean(samples, axis=1)
    absolute = np.abs(mono)
    duration = len(mono) / sample_rate
    peak = float(np.max(absolute))
    rms = float(np.sqrt(np.mean(np.square(mono))))
    silence_threshold = 10 ** (-45 / 20)
    silence_ratio = float(np.mean(absolute < silence_threshold))
    clipped_ratio = float(np.mean(absolute >= 0.995))

    active = np.flatnonzero(absolute >= silence_threshold)
    if active.size:
        leading_silence = float(active[0] / sample_rate)
        trailing_silence = float((len(mono) - 1 - active[-1]) / sample_rate)
    else:
        leading_silence = duration
        trailing_silence = duration

    def to_db(value: float) -> float:
        return -120.0 if value <= 0 else float(20 * np.log10(value))

    print(
        json.dumps(
            {
                "durationSeconds": round(duration, 3),
                "peakDb": round(to_db(peak), 2),
                "rmsDb": round(to_db(rms), 2),
                "silenceRatio": round(silence_ratio, 4),
                "clippedRatio": round(clipped_ratio, 6),
                "leadingSilenceSeconds": round(leading_silence, 3),
                "trailingSilenceSeconds": round(trailing_silence, 3),
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
