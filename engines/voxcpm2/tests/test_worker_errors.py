from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from server import (  # noqa: E402
    badcase_ratio_threshold,
    parse_generation_seed,
    parse_long_form,
    public_error_code,
    retry_target_pace,
    seed_generation,
    should_use_long_form,
)


class WorkerErrorTests(unittest.TestCase):
    def test_retry_prefers_the_previous_chunk_while_baseline_is_forming(self) -> None:
        self.assertEqual(retry_target_pace(None, 0.40), 0.40)
        self.assertEqual(retry_target_pace(0.21, 0.40), 0.21)
        self.assertEqual(retry_target_pace(None, None), 0.22)

    def test_badcase_ratio_is_strict_for_chinese_long_form_only(self) -> None:
        self.assertEqual(badcase_ratio_threshold("这是中文长稿", True), 3.2)
        self.assertEqual(
            badcase_ratio_threshold("A longer English narration", True), 5.0
        )
        self.assertEqual(badcase_ratio_threshold("这是短稿", False), 6.0)

    def test_validates_long_form_and_32_bit_generation_seed(self) -> None:
        self.assertTrue(parse_long_form(True))
        self.assertEqual(parse_generation_seed(0xFFFFFFFF), 0xFFFFFFFF)
        for invalid in (True, -1, 0x100000000, 1.5, "3407"):
            with self.assertRaises(RuntimeError):
                parse_generation_seed(invalid)
        with self.assertRaises(RuntimeError):
            parse_long_form("false")

    def test_keeps_short_takes_whole_and_auto_stabilizes_large_direct_calls(self) -> None:
        self.assertFalse(should_use_long_form("短句" * 30, False))
        self.assertTrue(should_use_long_form("长稿" * 36, False))
        self.assertTrue(should_use_long_form("短句", True))

    def test_seeds_numpy_torch_and_cuda_for_each_request(self) -> None:
        class FakeRandom:
            value: int | None = None

            def seed(self, value: int) -> None:
                self.value = value

        class FakeNumpy:
            random = FakeRandom()

        class FakeCuda:
            value: int | None = None

            @staticmethod
            def is_available() -> bool:
                return True

            @classmethod
            def manual_seed_all(cls, value: int) -> None:
                cls.value = value

        class FakeTorch:
            cuda = FakeCuda()
            value: int | None = None

            @classmethod
            def manual_seed(cls, value: int) -> None:
                cls.value = value

        seed_generation(FakeTorch, FakeNumpy, 20260821)
        self.assertEqual(FakeNumpy.random.value, 20260821)
        self.assertEqual(FakeTorch.value, 20260821)
        self.assertEqual(FakeTorch.cuda.value, 20260821)

    def test_keeps_stable_public_codes(self) -> None:
        self.assertEqual(
            public_error_code(RuntimeError("VOICE_SAMPLE_NOT_FOUND")),
            "VOICE_SAMPLE_NOT_FOUND",
        )

    def test_classifies_gpu_memory_without_leaking_technical_details(self) -> None:
        self.assertEqual(
            public_error_code(RuntimeError("CUDA out of memory at a private path")),
            "GPU_MEMORY_LOW",
        )

    def test_classifies_audio_conversion_failures(self) -> None:
        error = subprocess.CalledProcessError(1, ["ffmpeg"])
        self.assertEqual(public_error_code(error), "AUDIO_CONVERSION_FAILED")

    def test_hides_unknown_worker_exceptions(self) -> None:
        self.assertEqual(
            public_error_code(RuntimeError("C:\\private\\voice.wav failed")),
            "WORKER_ERROR",
        )


if __name__ == "__main__":
    unittest.main()
