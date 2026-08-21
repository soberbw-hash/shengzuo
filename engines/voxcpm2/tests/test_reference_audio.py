from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from reference_audio import (  # noqa: E402
    ReferenceWindow,
    choose_stable_reference_window,
    reference_duration_error,
)


class ReferenceAudioTests(unittest.TestCase):
    def test_keeps_a_short_healthy_reference_whole(self) -> None:
        whole = ReferenceWindow(0.0, 6.4, 0.08, 0.0001, 0.12)
        self.assertEqual(choose_stable_reference_window(6.4, [whole]), whole)

    def test_long_reference_prefers_continuous_low_silence_window(self) -> None:
        noisy_start = ReferenceWindow(0.0, 10.0, 0.30, 0.0001, 0.10)
        stable_middle = ReferenceWindow(12.5, 10.0, 0.05, 0.0002, 0.11)
        clipped_end = ReferenceWindow(49.8, 10.0, 0.04, 0.012, 0.20)
        selected = choose_stable_reference_window(
            59.8, [noisy_start, stable_middle, clipped_end]
        )
        self.assertEqual(selected, stable_middle)
        self.assertGreaterEqual(selected.duration_seconds if selected else 0, 6)
        self.assertLessEqual(selected.duration_seconds if selected else 99, 12.05)

    def test_rejects_reference_when_no_window_is_healthy(self) -> None:
        silent = ReferenceWindow(0.0, 10.0, 0.92, 0.0, 0.001)
        clipped = ReferenceWindow(5.0, 10.0, 0.02, 0.08, 0.30)
        self.assertIsNone(choose_stable_reference_window(20.0, [silent, clipped]))

    def test_ultimate_never_silently_crops_a_long_prompt_pair(self) -> None:
        self.assertEqual(
            reference_duration_error(30.01, ultimate=True),
            "ULTIMATE_REFERENCE_TOO_LONG",
        )
        self.assertIsNone(reference_duration_error(30.0, ultimate=True))
        self.assertIsNone(reference_duration_error(59.8, ultimate=False))


if __name__ == "__main__":
    unittest.main()
