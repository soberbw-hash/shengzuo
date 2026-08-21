from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf


def estimate_median_pitch_hz(samples: np.ndarray, sample_rate: int) -> float | None:
    """Return a conservative whole-utterance median F0, or None when unreliable."""
    if sample_rate < 8000 or len(samples) < int(sample_rate * 0.4):
        return None

    downsample = max(1, round(sample_rate / 16000))
    if downsample > 1:
        kernel = np.ones(downsample, dtype=np.float32) / downsample
        analysis = np.convolve(samples, kernel, mode="same")[::downsample]
        analysis_rate = sample_rate / downsample
    else:
        analysis = samples
        analysis_rate = float(sample_rate)

    frame_size = max(512, int(analysis_rate * 0.05))
    hop_size = max(256, int(analysis_rate * 0.025))
    min_lag = max(2, int(analysis_rate / 500))
    max_lag = min(frame_size - 2, int(analysis_rate / 65))
    if min_lag >= max_lag:
        return None

    global_rms = float(np.sqrt(np.mean(np.square(analysis))))
    minimum_rms = max(0.0025, global_rms * 0.12)
    window = np.hanning(frame_size).astype(np.float32)
    fft_size = 1 << (frame_size * 2 - 1).bit_length()
    pitches: list[float] = []
    eligible_frames = 0

    for start in range(0, len(analysis) - frame_size + 1, hop_size):
        frame = analysis[start : start + frame_size].astype(np.float64, copy=True)
        frame -= float(np.mean(frame))
        if float(np.sqrt(np.mean(np.square(frame)))) < minimum_rms:
            continue
        eligible_frames += 1
        frame *= window
        spectrum = np.fft.rfft(frame, n=fft_size)
        autocorrelation = np.fft.irfft(
            spectrum * np.conjugate(spectrum), n=fft_size
        )[:frame_size]
        squared = np.square(frame)
        prefix = np.concatenate(([0.0], np.cumsum(squared)))
        lags = np.arange(max_lag + 1)
        difference = (
            prefix[frame_size - lags]
            + prefix[frame_size]
            - prefix[lags]
            - 2 * autocorrelation[lags]
        )
        difference = np.maximum(difference, 0.0)
        cumulative = np.cumsum(difference[1:])
        normalized = np.ones(max_lag + 1, dtype=np.float64)
        normalized[1:] = difference[1:] * np.arange(1, max_lag + 1) / np.maximum(
            cumulative, 1e-12
        )

        lag: int | None = None
        for candidate in range(min_lag, max_lag):
            if normalized[candidate] >= 0.18:
                continue
            while (
                candidate + 1 <= max_lag
                and normalized[candidate + 1] < normalized[candidate]
            ):
                candidate += 1
            lag = candidate
            break
        if lag is None:
            candidate = int(np.argmin(normalized[min_lag : max_lag + 1])) + min_lag
            if normalized[candidate] <= 0.26:
                lag = candidate
        if lag is None:
            continue

        refined_lag = float(lag)
        if 1 <= lag < max_lag:
            left = normalized[lag - 1]
            center = normalized[lag]
            right = normalized[lag + 1]
            denominator = left - 2 * center + right
            if abs(denominator) > 1e-12:
                refined_lag += float(0.5 * (left - right) / denominator)
        pitch = analysis_rate / max(refined_lag, 1.0)
        if 65 <= pitch <= 500:
            pitches.append(float(pitch))

    if (
        len(pitches) < 6
        or eligible_frames == 0
        or len(pitches) / eligible_frames < 0.25
    ):
        return None

    log_pitches = np.log2(np.asarray(pitches, dtype=np.float64))
    center = float(np.median(log_pitches))
    mad = float(np.median(np.abs(log_pitches - center)))
    tolerance = min(0.35, max(0.08, mad * 4.5))
    kept = log_pitches[np.abs(log_pitches - center) <= tolerance]
    if len(kept) < max(5, int(len(log_pitches) * 0.45)):
        return None
    result = float(2 ** np.median(kept))
    return result if 65 <= result <= 500 else None


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

    median_pitch_hz = estimate_median_pitch_hz(mono, sample_rate)
    result = {
        "durationSeconds": round(duration, 3),
        "peakDb": round(to_db(peak), 2),
        "rmsDb": round(to_db(rms), 2),
        "silenceRatio": round(silence_ratio, 4),
        "clippedRatio": round(clipped_ratio, 6),
        "leadingSilenceSeconds": round(leading_silence, 3),
        "trailingSilenceSeconds": round(trailing_silence, 3),
    }
    if median_pitch_hz is not None:
        result["medianPitchHz"] = round(median_pitch_hz, 2)
    print(
        json.dumps(result),
        flush=True,
    )


if __name__ == "__main__":
    main()
