from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

COMMON_WORKER_ROOT = Path(__file__).resolve().parents[2] / "common" / "worker"
sys.path.insert(0, str(COMMON_WORKER_ROOT))

from inspect_audio import estimate_median_pitch_hz  # noqa: E402


class GeneratedAudioPitchTests(unittest.TestCase):
    sample_rate = 16000

    def harmonic_voice(self, frequency: float) -> np.ndarray:
        time = np.arange(self.sample_rate * 2, dtype=np.float32) / self.sample_rate
        envelope = np.minimum(1.0, np.minimum(time * 8, (2 - time) * 8))
        signal = np.sin(2 * np.pi * frequency * time)
        signal += 0.35 * np.sin(2 * np.pi * frequency * 2 * time)
        return (signal * envelope * 0.25).astype(np.float32)

    def test_recovers_median_pitch_for_low_and_high_voices(self) -> None:
        low = estimate_median_pitch_hz(self.harmonic_voice(200), self.sample_rate)
        high = estimate_median_pitch_hz(self.harmonic_voice(300), self.sample_rate)
        self.assertIsNotNone(low)
        self.assertIsNotNone(high)
        self.assertAlmostEqual(low or 0, 200, delta=4)
        self.assertAlmostEqual(high or 0, 300, delta=5)

    def test_returns_none_for_silence_and_unpitched_noise(self) -> None:
        silence = np.zeros(self.sample_rate * 2, dtype=np.float32)
        noise = np.random.default_rng(20260821).normal(
            0, 0.04, self.sample_rate * 2
        ).astype(np.float32)
        self.assertIsNone(estimate_median_pitch_hz(silence, self.sample_rate))
        self.assertIsNone(estimate_median_pitch_hz(noise, self.sample_rate))


if __name__ == "__main__":
    unittest.main()
