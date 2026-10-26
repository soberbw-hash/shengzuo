from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import soundfile as sf

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))
from pacing import spoken_units
from server import WorkerState


class ContinuationTests(unittest.TestCase):
    def run_worker(self, mode: str = "controlled", external_seconds: float = 0, speed: float = 1):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            voices = root / "voices"
            outputs = root / "outputs"
            voices.mkdir()
            outputs.mkdir()
            rate = 16000
            reference = voices / "reference.wav"
            sf.write(reference, np.sin(np.arange(rate * 5) * 0.08) * 0.2, rate)
            calls: list[dict] = []

            def generate(**options):
                calls.append(dict(options))
                text = str(options["text"])
                if text.startswith("("):
                    text = text.split(")", 1)[1]
                length = int(spoken_units(text) * 0.20 * rate)
                return (np.sin(np.arange(length) * 0.08) * 0.2).astype(np.float32)

            def convert(command, **_kwargs):
                source = Path(command[command.index("-i") + 1])
                if source.name == "external.wav":
                    self.assertIn(f"atempo={1 / speed:.6f}", command)
                shutil.copyfile(source, Path(command[-1]))

            state = WorkerState(root / "weights", voices, outputs)
            state.model = SimpleNamespace(tts_model=SimpleNamespace(sample_rate=rate), generate=generate)
            payload = {
                "jobId": "fixed-anchor-test", "text": "这是一段需要保持稳定声音的长稿测试。" * 24,
                "referenceAudio": str(reference), "voxMode": mode,
                "voiceDescription": "自然清晰的青年男声", "longForm": True,
                "speed": speed,
            }
            if external_seconds:
                external = outputs / "external.wav"
                sf.write(external, np.zeros(int(rate * external_seconds)), rate)
                payload.update(continuationAudio=str(external), continuationText="完整的参考原文")
            fake_modules = {
                "torch": SimpleNamespace(),
                "imageio_ffmpeg": SimpleNamespace(get_ffmpeg_exe=lambda: "ffmpeg"),
            }
            with patch.dict(sys.modules, fake_modules), patch("server.seed_generation"), \
                 patch("server.subprocess.run", side_effect=convert), \
                 patch("server.analyze_reference_windows", return_value=[]), \
                 patch("server.choose_stable_reference_window", return_value=SimpleNamespace(start_seconds=0, duration_seconds=5)):
                result = state.generate(payload)
            self.assertGreaterEqual(result["pacingChunks"], 3)
            return calls

    def test_internal_prompt_freezes_first_full_audio_and_transcript(self):
        calls = self.run_worker()
        self.assertNotIn("prompt_wav_path", calls[0])
        for call in calls[1:]:
            self.assertEqual(call["prompt_wav_path"], calls[1]["prompt_wav_path"])
            self.assertEqual(call["prompt_text"], calls[0]["text"])
            self.assertIn("reference_wav_path", call)

    def test_external_prompt_is_not_replaced_with_generated_chunks(self):
        calls = self.run_worker(external_seconds=5)
        for call in calls:
            self.assertEqual(call["prompt_wav_path"], calls[0]["prompt_wav_path"])
            self.assertEqual(call["prompt_text"], "完整的参考原文")

    def test_overlong_prompt_falls_back_without_cropping_its_audio(self):
        calls = self.run_worker(external_seconds=31)
        self.assertNotIn("prompt_wav_path", calls[0])
        self.assertIn("reference_wav_path", calls[0])

    def test_exported_prompt_undoes_speed_before_conditioning(self):
        self.run_worker(external_seconds=5, speed=1.5)

    def test_design_continues_from_first_real_text_not_description(self):
        calls = self.run_worker(mode="design")
        self.assertTrue(calls[0]["text"].startswith("("))
        for call in calls[1:]:
            self.assertNotIn("reference_wav_path", call)
            self.assertFalse(call["prompt_text"].startswith("("))
            self.assertEqual(call["prompt_wav_path"], calls[1]["prompt_wav_path"])

    def test_nonfinite_settings_are_rejected_before_inference(self):
        state = WorkerState(Path("weights"), Path("voices"), Path("outputs"))
        state.model = SimpleNamespace()
        with patch.dict(sys.modules, {"torch": SimpleNamespace(), "imageio_ffmpeg": SimpleNamespace()}):
            for key in ("speed", "volume"):
                with self.assertRaisesRegex(RuntimeError, "INVALID_AUDIO_SETTINGS"):
                    state.generate({"jobId": "nan-test", "text": "正文", key: float("nan")})


if __name__ == "__main__":
    unittest.main()
