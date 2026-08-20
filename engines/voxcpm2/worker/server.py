from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

WORKER_ROOT = Path(__file__).resolve().parent
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

from prompting import (
    DIALECT_NAMES,
    build_voice_design_text,
    prepare_target_text,
    reference_text_is_plausible,
)
from pacing import pace_correction, seconds_per_unit, split_for_stable_pacing

MAX_REQUEST_BYTES = 128 * 1024
JOB_ID_PATTERN = re.compile(r"^[a-zA-Z0-9-]{1,120}$")
SUPPORTED_LANGUAGES = {
    "auto", "zh", "en", "ja", "ko", "ar", "my", "da", "nl", "fi",
    "fr", "de", "el", "he", "hi", "id", "it", "km", "lo", "ms",
    "no", "pl", "pt", "ru", "es", "sw", "sv", "tl", "th", "tr", "vi",
    "yue", "dialect-dongbei", "dialect-henan", "dialect-minnan",
    "dialect-shaanxi", "dialect-shandong", "dialect-sichuan",
    "dialect-tianjin", "dialect-wu",
}
def is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def public_error_code(error: Exception) -> str:
    raw = str(error).strip()
    if re.fullmatch(r"[A-Z][A-Z0-9_]{2,79}", raw):
        return raw
    lowered = raw.lower()
    if "out of memory" in lowered or "memory allocation" in lowered:
        return "GPU_MEMORY_LOW"
    if any(token in lowered for token in ("cuda", "cudnn", "cublas", "device-side")):
        return "GPU_RUNTIME_ERROR"
    if isinstance(error, subprocess.CalledProcessError) or any(
        token in lowered for token in ("ffmpeg", "audio conversion", "encoding")
    ):
        return "AUDIO_CONVERSION_FAILED"
    return "WORKER_ERROR"


class WorkerState:
    def __init__(self, weights: Path, voice_root: Path, output_root: Path) -> None:
        self.weights = weights.resolve()
        self.voice_root = voice_root.resolve()
        self.output_root = output_root.resolve()
        self.model: Any | None = None
        self.device = "not-loaded"
        self.lock = threading.RLock()

    def load(self) -> dict[str, str]:
        with self.lock:
            if self.model is not None:
                return {"device": self.device}
            if not (self.weights / "install-receipt.json").is_file():
                raise RuntimeError("MODEL_NOT_INSTALLED")

            import torch
            from voxcpm import VoxCPM

            cuda_ready = (
                torch.cuda.is_available()
                and os.environ.get("SHENGZUO_FORCE_CPU") != "1"
            )
            self.device = "cuda:0" if cuda_ready else "cpu"
            self.model = VoxCPM.from_pretrained(
                str(self.weights),
                load_denoiser=False,
                local_files_only=True,
                optimize=False,
                device=self.device,
            )
            return {"device": self.device}

    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            self.load()
            import imageio_ffmpeg
            import numpy as np
            import soundfile as sf

            job_id = str(payload.get("jobId", ""))
            if not JOB_ID_PATTERN.fullmatch(job_id):
                raise RuntimeError("INVALID_JOB_ID")
            text = str(payload.get("text", "")).strip()
            if not text or len(text) > 20_000:
                raise RuntimeError("INVALID_TEXT")
            language = str(payload.get("language", "auto"))
            if language not in SUPPORTED_LANGUAGES:
                raise RuntimeError("UNSUPPORTED_LANGUAGE")
            speed = float(payload.get("speed", 1.0))
            volume = float(payload.get("volume", 100.0))
            if speed < 0.5 or speed > 2.0 or volume < 0 or volume > 150:
                raise RuntimeError("INVALID_AUDIO_SETTINGS")

            vox_mode = str(payload.get("voxMode", "controlled"))
            if vox_mode not in {"controlled", "ultimate", "design"}:
                raise RuntimeError("INVALID_VOX_MODE")
            voice_description = str(payload.get("voiceDescription", "")).strip()
            if len(voice_description) > 240:
                raise RuntimeError("INVALID_VOICE_DESCRIPTION")

            reference_audio: Path | None = None
            if vox_mode != "design":
                reference_audio = Path(
                    str(payload.get("referenceAudio", ""))
                ).resolve()
                if not reference_audio.is_file() or not is_within(
                    reference_audio, self.voice_root
                ):
                    raise RuntimeError("VOICE_SAMPLE_NOT_FOUND")
            elif len(voice_description) < 4:
                raise RuntimeError("VOICE_DESCRIPTION_REQUIRED")
            reference_text = str(payload.get("referenceText", "")).strip()
            if len(reference_text) > 1_000:
                raise RuntimeError("INVALID_REFERENCE_TEXT")

            expression = str(payload.get("expression", "")).strip()[:200]
            text_chunks = split_for_stable_pacing(text)
            if not text_chunks:
                raise RuntimeError("INVALID_TEXT")

            self.output_root.mkdir(parents=True, exist_ok=True)
            output_path = (self.output_root / f"{job_id}.mp3").resolve()
            if not is_within(output_path, self.output_root):
                raise RuntimeError("INVALID_OUTPUT_PATH")

            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            with tempfile.TemporaryDirectory(dir=self.output_root) as temporary_name:
                temporary = Path(temporary_name)
                normalized_reference: Path | None = None
                raw_output = temporary / "generated.wav"
                if reference_audio is not None:
                    normalized_reference = temporary / "reference.wav"
                    subprocess.run(
                        [
                            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                            "-i", str(reference_audio), "-ac", "1", "-ar", "48000",
                            str(normalized_reference),
                        ],
                        check=True,
                        capture_output=True,
                    )
                    reference_info = sf.info(normalized_reference)
                    if reference_info.duration < 3 or reference_info.duration > 60:
                        raise RuntimeError("VOICE_SAMPLE_DURATION")
                    if vox_mode == "ultimate" and not reference_text_is_plausible(
                        reference_text, reference_info.duration
                    ):
                        raise RuntimeError("REFERENCE_TEXT_MISMATCH")

                sample_rate = int(self.model.tts_model.sample_rate)
                generated_chunks: list[np.ndarray] = []
                baseline_pace: float | None = None
                pace_retries = 0
                pace_corrections = 0

                for index, chunk in enumerate(text_chunks):
                    if vox_mode == "design":
                        dialect = DIALECT_NAMES.get(language)
                        design_description = ", ".join(
                            item for item in (dialect, voice_description) if item
                        )
                        try:
                            target_text = build_voice_design_text(
                                chunk, design_description
                            )
                        except ValueError as error:
                            raise RuntimeError(str(error)) from error
                    elif vox_mode == "ultimate":
                        target_text = chunk
                    else:
                        target_text, _ = prepare_target_text(
                            chunk, language, expression
                        )
                    generation_options: dict[str, Any] = {
                        "text": target_text,
                        # 声作已在主进程完成文本清理。Vox 的可选 normalize 会在
                        # 首次生成时联网拉取 WeText，离线环境中反而会导致整次失败。
                        "normalize": False,
                        "denoise": False,
                        "cfg_value": 2.0,
                        "inference_timesteps": 10,
                        "retry_badcase": True,
                        "retry_badcase_max_times": 3,
                    }
                    if normalized_reference is not None:
                        generation_options["reference_wav_path"] = str(
                            normalized_reference
                        )
                    # 极致克隆是显式模式：只有逐字稿经过长度校验后才进入续写路径。
                    if vox_mode == "ultimate" and normalized_reference is not None:
                        generation_options["prompt_wav_path"] = str(normalized_reference)
                        generation_options["prompt_text"] = reference_text

                    waveform = np.asarray(
                        self.model.generate(**generation_options), dtype=np.float32
                    ).reshape(-1)
                    if waveform.size == 0:
                        raise RuntimeError("EMPTY_GENERATION")
                    chunk_pace = seconds_per_unit(waveform.size / sample_rate, chunk)

                    is_unusually_fast = (
                        chunk_pace is not None
                        and (
                            chunk_pace < 0.11
                            or (
                                baseline_pace is not None
                                and chunk_pace < baseline_pace * 0.78
                            )
                        )
                    )
                    if is_unusually_fast:
                        retry_waveform = np.asarray(
                            self.model.generate(**generation_options), dtype=np.float32
                        ).reshape(-1)
                        retry_pace = seconds_per_unit(
                            retry_waveform.size / sample_rate, chunk
                        )
                        if retry_waveform.size and (
                            retry_pace is not None
                            and (chunk_pace is None or retry_pace > chunk_pace)
                        ):
                            waveform = retry_waveform
                            chunk_pace = retry_pace
                        pace_retries += 1

                    if baseline_pace is None and chunk_pace is not None:
                        baseline_pace = max(0.14, min(0.35, chunk_pace))

                    correction = pace_correction(baseline_pace, chunk_pace)
                    if correction < 0.999:
                        chunk_input = temporary / f"chunk-{index}.wav"
                        chunk_output = temporary / f"chunk-{index}-stable.wav"
                        sf.write(chunk_input, waveform, sample_rate)
                        subprocess.run(
                            [
                                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                                "-i", str(chunk_input), "-filter:a",
                                f"atempo={correction:.4f}", "-ac", "1",
                                str(chunk_output),
                            ],
                            check=True,
                            capture_output=True,
                        )
                        waveform = np.asarray(
                            sf.read(chunk_output, dtype="float32")[0],
                            dtype=np.float32,
                        ).reshape(-1)
                        pace_corrections += 1
                    if chunk_pace is not None:
                        effective_pace = chunk_pace / correction
                        bounded_pace = max(0.14, min(0.35, effective_pace))
                        baseline_pace = (
                            bounded_pace
                            if baseline_pace is None
                            else baseline_pace * 0.82 + bounded_pace * 0.18
                        )
                    fade_samples = min(int(sample_rate * 0.012), waveform.size // 2)
                    if fade_samples > 1:
                        fade = np.sin(
                            np.linspace(0, np.pi / 2, fade_samples, dtype=np.float32)
                        ) ** 2
                        waveform[:fade_samples] *= fade
                        waveform[-fade_samples:] *= fade[::-1]
                    generated_chunks.append(waveform)

                separator = np.zeros(int(sample_rate * 0.06), dtype=np.float32)
                merged_chunks: list[np.ndarray] = []
                for index, chunk_waveform in enumerate(generated_chunks):
                    if index:
                        merged_chunks.append(separator)
                    merged_chunks.append(chunk_waveform)
                waveform = np.concatenate(merged_chunks)
                sf.write(raw_output, waveform, sample_rate)

                subprocess.run(
                    [
                        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                        "-i", str(raw_output), "-filter:a",
                        f"atempo={speed:.3f},volume={volume / 100:.3f}",
                        "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "192k",
                        str(output_path),
                    ],
                    check=True,
                    capture_output=True,
                )
                duration = float(waveform.size / sample_rate / speed)
            return {
                "fileName": output_path.name,
                "durationSeconds": round(duration, 3),
                "device": self.device,
                "pacingChunks": len(text_chunks),
                "paceRetries": pace_retries,
                "paceCorrections": pace_corrections,
            }


class VoiceWorkerServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self, address: tuple[str, int], state: WorkerState, boot_token: str
    ) -> None:
        super().__init__(address, VoiceWorkerHandler)
        self.state = state
        self.boot_token: str | None = boot_token
        self.session_token: str | None = None


class VoiceWorkerHandler(BaseHTTPRequestHandler):
    server: VoiceWorkerServer

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_payload(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_REQUEST_BYTES:
            raise RuntimeError("INVALID_REQUEST_SIZE")
        value = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(value, dict):
            raise RuntimeError("INVALID_JSON")
        return value

    def trusted_loopback_request(self) -> bool:
        expected_host = f"127.0.0.1:{self.server.server_port}"
        return (
            self.client_address[0] == "127.0.0.1"
            and self.headers.get("Host") == expected_host
            and self.headers.get("Origin") is None
        )

    def authorized(self) -> bool:
        if not self.trusted_loopback_request() or self.server.session_token is None:
            return False
        return secrets.compare_digest(
            self.headers.get("Authorization", ""),
            f"Bearer {self.server.session_token}",
        )

    def do_POST(self) -> None:
        try:
            if self.path == "/handshake":
                self.handle_handshake()
                return
            if not self.authorized():
                self.send_json(401, {"ok": False, "code": "UNAUTHORIZED"})
                return
            payload = self.read_payload()
            if self.path == "/load":
                self.send_json(200, {"ok": True, **self.server.state.load()})
            elif self.path == "/generate":
                self.send_json(200, {"ok": True, **self.server.state.generate(payload)})
            elif self.path == "/shutdown":
                self.send_json(200, {"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            else:
                self.send_json(404, {"ok": False, "code": "NOT_FOUND"})
        except Exception as error:
            self.send_json(500, {"ok": False, "code": public_error_code(error)})

    def handle_handshake(self) -> None:
        if not self.trusted_loopback_request() or self.server.boot_token is None:
            self.send_json(401, {"ok": False, "code": "HANDSHAKE_REJECTED"})
            return
        if not secrets.compare_digest(
            self.headers.get("Authorization", ""),
            f"Bearer {self.server.boot_token}",
        ):
            self.send_json(401, {"ok": False, "code": "HANDSHAKE_REJECTED"})
            return
        self.read_payload()
        self.server.boot_token = None
        self.server.session_token = secrets.token_urlsafe(32)
        self.send_json(
            200,
            {
                "ok": True,
                "sessionToken": self.server.session_token,
                "protocolVersion": "1.0",
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--boot-token", required=True)
    parser.add_argument("--weights", required=True)
    parser.add_argument("--voice-root", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()
    if args.port < 1024 or args.port > 65535 or len(args.boot_token) < 32:
        raise SystemExit(2)

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    state = WorkerState(Path(args.weights), Path(args.voice_root), Path(args.output_root))
    server = VoiceWorkerServer(("127.0.0.1", args.port), state, args.boot_token)
    server.serve_forever(poll_interval=0.25)


if __name__ == "__main__":
    main()
