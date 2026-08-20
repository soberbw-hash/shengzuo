from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from server import public_error_code  # noqa: E402


class WorkerErrorTests(unittest.TestCase):
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
