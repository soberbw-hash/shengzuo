from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from pacing import (  # noqa: E402
    calibration_baseline,
    pace_correction,
    seconds_per_unit,
    split_for_stable_pacing,
    spoken_units,
)


class VoxPacingTests(unittest.TestCase):
    def test_balances_sentences_and_preserves_every_visible_character(self) -> None:
        source = "第一句比较短。第二句也不长！" + "很长的内容，" * 12 + "结束。"
        chunks = split_for_stable_pacing(source)
        lengths = [len(chunk.replace(" ", "")) for chunk in chunks]
        self.assertTrue(all(length <= 55 for length in lengths))
        self.assertTrue(all(length >= 20 for length in lengths))
        self.assertEqual("".join(chunks).replace(" ", ""), source)

    def test_rebalances_a_tiny_tail_instead_of_leaving_an_orphan(self) -> None:
        source = "甲" * 56
        chunks = split_for_stable_pacing(source)
        self.assertEqual([len(chunk) for chunk in chunks], [28, 28])
        self.assertEqual("".join(chunks), source)

    def test_counts_chinese_latin_digits_and_other_scripts(self) -> None:
        self.assertEqual(spoken_units("大家好，AI 2026! こんにちは"), 14)
        self.assertEqual(spoken_units("Hello world from OpenAI 2026"), 11)
        self.assertEqual(spoken_units("CPU GPU DXP480T"), 13)
        self.assertEqual(spoken_units("THIS IS DXP480T"), 9)
        self.assertIsNone(seconds_per_unit(2.0, "太短了"))
        self.assertAlmostEqual(seconds_per_unit(2.0, "这是刚好八个中文字啊") or 0, 0.2)

    def test_frozen_baseline_ignores_later_acceleration(self) -> None:
        initial = calibration_baseline([0.21, 0.20, 0.19])
        after_drift = calibration_baseline([0.21, 0.20, 0.19, 0.16, 0.13])
        self.assertAlmostEqual(initial or 0, 0.20)
        self.assertEqual(initial, after_drift)
        self.assertIsNone(calibration_baseline([0.20]))
        self.assertAlmostEqual(
            calibration_baseline([0.58, 0.21, 0.20]) or 0, 0.205
        )

    def test_corrects_chunks_that_are_clearly_faster_or_slower(self) -> None:
        self.assertEqual(pace_correction(0.2, 0.18), 1.0)
        self.assertAlmostEqual(pace_correction(0.2, 0.12), 0.90)
        self.assertGreater(pace_correction(0.2, 0.32), 1.0)
        self.assertLessEqual(pace_correction(0.2, 0.60), 1.10)
        self.assertEqual(pace_correction(None, 0.12), 1.0)


if __name__ == "__main__":
    unittest.main()
