from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from pacing import (  # noqa: E402
    pace_correction,
    seconds_per_unit,
    split_for_stable_pacing,
    spoken_units,
)


class VoxPacingTests(unittest.TestCase):
    def test_prefers_complete_sentences_and_preserves_text(self) -> None:
        source = "第一句比较短。第二句也不长！" + "很长的内容，" * 12 + "结束。"
        chunks = split_for_stable_pacing(source, 40)
        self.assertEqual(chunks[0], "第一句比较短。")
        self.assertEqual(chunks[1], "第二句也不长！")
        self.assertTrue(all(len(chunk.replace(" ", "")) <= 40 for chunk in chunks))
        self.assertEqual("".join(chunks).replace(" ", ""), source)

    def test_counts_only_chinese_speech_units(self) -> None:
        self.assertEqual(spoken_units("大家好，我是小林！2026"), 7)
        self.assertIsNone(seconds_per_unit(2.0, "太短了"))
        self.assertAlmostEqual(seconds_per_unit(2.0, "这是刚好八个中文字啊") or 0, 0.2)

    def test_only_slows_chunks_that_are_clearly_faster(self) -> None:
        self.assertEqual(pace_correction(0.2, 0.18), 1.0)
        self.assertAlmostEqual(pace_correction(0.2, 0.12), 0.88)
        self.assertEqual(pace_correction(None, 0.12), 1.0)


if __name__ == "__main__":
    unittest.main()
