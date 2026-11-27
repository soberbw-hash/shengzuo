import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "common" / "worker"))
from bounded_speech import render_script


class BoundedSpeechTests(unittest.TestCase):
    def test_budget_exhaustion_renders_both_halves_in_order(self):
        calls = []

        def generate(text):
            calls.append(text)
            return np.ones(100, dtype=np.float32), 8000, len(calls) == 1

        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "audio.wav"
            render_script("介绍全新的产品规格。然后说明实际安装步骤。", path, generate)
            self.assertEqual(calls[1] + calls[2], calls[0])
            self.assertTrue(calls[1].endswith("。"))
            self.assertEqual(sf.info(path).frames, 1200)

    def test_exhausted_short_text_fails_without_partial_file(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "audio.wav"
            with self.assertRaisesRegex(RuntimeError, "AUDIO_DURATION_LIMIT"):
                render_script("短句", path, lambda _: (np.zeros(100), 8000, True))
            self.assertFalse(path.exists())
