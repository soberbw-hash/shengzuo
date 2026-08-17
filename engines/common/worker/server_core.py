from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

MAX_REQUEST_BYTES = 4 * 1024 * 1024
JOB_ID_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")
SUPPORTED_LANGUAGES = {
    "auto", "zh", "en", "ja", "ko", "de", "es", "fr", "it", "ru",
    "yue", "dialect-dongbei", "dialect-gansu", "dialect-guizhou",
    "dialect-henan", "dialect-hubei", "dialect-hunan", "dialect-jiangxi",
    "dialect-minnan", "dialect-ningxia", "dialect-shanxi",
    "dialect-shaanxi", "dialect-shandong", "dialect-shanghai",
    "dialect-sichuan", "dialect-suhang", "dialect-tianjin",
    "dialect-wuzhong", "dialect-yunnan",
}
DIALECT_NAMES = {
    "yue": "广东话",
    "dialect-dongbei": "东北话",
    "dialect-gansu": "甘肃话",
    "dialect-guizhou": "贵州话",
    "dialect-henan": "河南话",
    "dialect-hubei": "湖北话",
    "dialect-hunan": "湖南话",
    "dialect-jiangxi": "江西话",
    "dialect-minnan": "闽南话",
    "dialect-ningxia": "宁夏话",
    "dialect-shanxi": "山西话",
    "dialect-shaanxi": "陕西话",
    "dialect-shandong": "山东话",
    "dialect-shanghai": "上海话",
    "dialect-sichuan": "四川话",
    "dialect-suhang": "苏杭口音",
    "dialect-tianjin": "天津话",
    "dialect-wuzhong": "吴中口音",
    "dialect-yunnan": "云南话",
}


def safe_job_id(value: object) -> str:
    job_id = str(value)
    if not job_id or len(job_id) > 120 or any(char not in JOB_ID_CHARS for char in job_id):
        raise RuntimeError("INVALID_JOB_ID")
    return job_id


def is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def ffmpeg_executable() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def normalize_reference(source: Path, destination: Path) -> None:
    subprocess.run(
        [
            ffmpeg_executable(), "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(source), "-ac", "1", "-ar", "24000", str(destination),
        ],
        check=True,
        capture_output=True,
    )
    import soundfile as sf

    duration = float(sf.info(destination).duration)
    if duration < 3 or duration > 60:
        raise RuntimeError("VOICE_SAMPLE_DURATION")


def encode_mp3(source: Path, destination: Path, speed: float, volume: float) -> float:
    import soundfile as sf

    source_duration = float(sf.info(source).duration)
    subprocess.run(
        [
            ffmpeg_executable(), "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(source), "-filter:a",
            f"atempo={speed:.3f},volume={volume / 100:.3f}", "-ac", "1",
            "-codec:a", "libmp3lame", "-b:a", "192k", str(destination),
        ],
        check=True,
        capture_output=True,
    )
    return source_duration / speed


class CosyVoiceBackend:
    def __init__(self, weights_root: Path, source_root: Path) -> None:
        self.weights_root = weights_root
        self.source_root = source_root
        self.model: Any | None = None
        self.device = "not-loaded"

    def load(self) -> dict[str, str]:
        if self.model is not None:
            return {"device": self.device}
        import torch

        cosy_source = self.source_root / "CosyVoice"
        matcha_source = self.source_root / "Matcha-TTS"
        sys.path.insert(0, str(matcha_source))
        sys.path.insert(0, str(cosy_source))
        from cosyvoice.cli.cosyvoice import CosyVoice3

        cuda_ready = (
            torch.cuda.is_available()
            and os.environ.get("SHENGZUO_FORCE_CPU") != "1"
        )
        self.device = "cuda:0" if cuda_ready else "cpu"
        self.model = CosyVoice3(
            str(self.weights_root / "Fun-CosyVoice3-0.5B-2512"),
            fp16=cuda_ready,
        )
        return {"device": self.device}

    def generate_wav(
        self,
        text: str,
        reference_audio: Path,
        reference_text: str,
        language: str,
        expression: str,
        output_wav: Path,
    ) -> None:
        self.load()
        import numpy as np
        import soundfile as sf

        if language not in SUPPORTED_LANGUAGES:
            raise RuntimeError("UNSUPPORTED_LANGUAGE")
        dialect = DIALECT_NAMES.get(language)
        if dialect:
            instruction_parts = [f"请用{dialect}表达"]
            if expression and expression not in {"自然", "自然、清晰"}:
                instruction_parts.append(expression)
            instruction = "You are a helpful assistant. " + "，".join(instruction_parts) + "。<|endofprompt|>"
            iterator = self.model.inference_instruct2(
                text, instruction, str(reference_audio), stream=False, speed=1.0
            )
        elif reference_text:
            prompt = f"You are a helpful assistant.<|endofprompt|>{reference_text}"
            iterator = self.model.inference_zero_shot(
                text, prompt, str(reference_audio), stream=False, speed=1.0
            )
        else:
            iterator = self.model.inference_cross_lingual(
                text, str(reference_audio), stream=False, speed=1.0
            )
        parts = [
            item["tts_speech"].detach().float().cpu().numpy().reshape(-1)
            for item in iterator
        ]
        if not parts:
            raise RuntimeError("EMPTY_GENERATION")
        sf.write(output_wav, np.concatenate(parts), int(self.model.sample_rate))


class IndexTTSBackend:
    SUPPORTED = {"auto", "zh", "en", "ja", "es", "ar"}
    EMOTIONS = {
        "自然": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.35],
        "温暖": [0.25, 0.0, 0.0, 0.0, 0.0, 0.15, 0.0, 0.35],
        "开心": [0.65, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0],
        "沉稳": [0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.65],
        "激动": [0.35, 0.15, 0.0, 0.0, 0.0, 0.0, 0.3, 0.0],
        "悲伤": [0.0, 0.0, 0.65, 0.0, 0.0, 0.15, 0.0, 0.0],
    }

    def __init__(self, weights_root: Path, source_root: Path) -> None:
        self.weights = weights_root / "IndexTTS-2.5"
        self.source = source_root / "index-tts"
        self.model: Any | None = None
        self.device = "not-loaded"

    def load(self) -> dict[str, str]:
        if self.model is not None:
            return {"device": self.device}
        if not (self.weights / "config.yaml").is_file() or not self.source.is_dir():
            raise RuntimeError("MODEL_NOT_INSTALLED")
        os.environ["HF_HUB_CACHE"] = str(self.weights / "hf_cache")
        sys.path.insert(0, str(self.source))
        import torch
        # kaldifst cannot open FST files from a Unicode Windows path. Keep a
        # disposable ASCII-path copy so the normalizer still remains enabled.
        import wetext
        import wetext.utils
        import wetext.wetext
        from kaldifst import TextNormalizer as KaldiTextNormalizer

        wetext_source = Path(wetext.__file__).resolve().parent / "fsts"
        wetext_compat = Path(tempfile.gettempdir()) / "ShengZuoWetext-0.0.9"
        if not (wetext_compat / "zh" / "tn" / "tagger.fst").is_file():
            shutil.copytree(wetext_source, wetext_compat, dirs_exist_ok=True)

        def load_compat_fst(relative_path: str) -> Any:
            return KaldiTextNormalizer(str(wetext_compat / relative_path))

        wetext.utils.load_fst = load_compat_fst
        wetext.wetext.load_fst = load_compat_fst
        from indextts.infer_v2_5 import IndexTTS2

        cuda_ready = (
            torch.cuda.is_available()
            and os.environ.get("SHENGZUO_FORCE_CPU") != "1"
        )
        self.device = "cuda:0" if cuda_ready else "cpu"
        self.model = IndexTTS2(
            cfg_path=str(self.weights / "config.yaml"),
            model_dir=str(self.weights),
            device=self.device,
            use_bf16=cuda_ready,
            use_cuda_kernel=False,
            use_deepspeed=False,
            use_qwen_emo=True,
        )
        return {"device": self.device}

    @staticmethod
    def detect_language(text: str) -> str:
        if any("\u3040" <= char <= "\u30ff" for char in text):
            return "ja"
        if any("\u0600" <= char <= "\u06ff" for char in text):
            return "ar"
        if any("\u4e00" <= char <= "\u9fff" for char in text):
            return "zh"
        return "en"

    def generate_wav(
        self,
        text: str,
        reference_audio: Path,
        _reference_text: str,
        language: str,
        expression: str,
        emotion: str,
        output_wav: Path,
    ) -> None:
        self.load()
        if language not in self.SUPPORTED:
            raise RuntimeError("UNSUPPORTED_LANGUAGE")
        lang = self.detect_language(text) if language == "auto" else language
        custom_expression = expression.strip() not in {"", "自然", "自然、清晰"}
        result = self.model.infer(
            spk_audio_prompt=str(reference_audio),
            text=text,
            output_path=str(output_wav),
            lang=lang.upper(),
            emo_vector=None if custom_expression else self.EMOTIONS.get(emotion, self.EMOTIONS["自然"]),
            use_emo_text=custom_expression,
            emo_text=expression if custom_expression else None,
            use_random=False,
            verbose=False,
        )
        if result is None or not output_wav.is_file():
            raise RuntimeError("EMPTY_GENERATION")


class WorkerState:
    def __init__(
        self,
        weights_root: Path,
        source_root: Path,
        voice_root: Path,
        output_root: Path,
        backend_name: str,
    ) -> None:
        if backend_name == "indextts":
            self.backend = IndexTTSBackend(weights_root.resolve(), source_root.resolve())
        else:
            self.backend = CosyVoiceBackend(weights_root.resolve(), source_root.resolve())
        self.voice_root = voice_root.resolve()
        self.output_root = output_root.resolve()
        self.lock = threading.RLock()

    def load(self) -> dict[str, str]:
        with self.lock:
            return self.backend.load()

    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            job_id = safe_job_id(payload.get("jobId"))
            text = str(payload.get("text", ""))
            if not text.strip() or len(text) > 20_000:
                raise RuntimeError("INVALID_TEXT")
            reference_audio = Path(str(payload.get("referenceAudio", ""))).resolve()
            if not reference_audio.is_file() or not is_within(reference_audio, self.voice_root):
                raise RuntimeError("VOICE_SAMPLE_NOT_FOUND")
            reference_text = str(payload.get("referenceText", "")).strip()
            if len(reference_text) > 1_000:
                raise RuntimeError("INVALID_REFERENCE_TEXT")
            language = str(payload.get("language", "auto"))
            expression = str(payload.get("expression", ""))[:500]
            emotion = str(payload.get("emotion", "自然"))[:20]
            speed = float(payload.get("speed", 1.0))
            volume = float(payload.get("volume", 100.0))
            if speed < 0.5 or speed > 2.0 or volume < 0 or volume > 150:
                raise RuntimeError("INVALID_AUDIO_SETTINGS")

            self.output_root.mkdir(parents=True, exist_ok=True)
            output_path = (self.output_root / f"{job_id}.mp3").resolve()
            if not is_within(output_path, self.output_root):
                raise RuntimeError("INVALID_OUTPUT_PATH")
            with tempfile.TemporaryDirectory(dir=self.output_root) as temporary_name:
                temporary = Path(temporary_name)
                normalized_reference = temporary / "reference.wav"
                raw_output = temporary / "generated.wav"
                normalize_reference(reference_audio, normalized_reference)
                if isinstance(self.backend, IndexTTSBackend):
                    self.backend.generate_wav(
                        text, normalized_reference, reference_text, language,
                        expression, emotion, raw_output
                    )
                else:
                    self.backend.generate_wav(
                        text, normalized_reference, reference_text, language,
                        expression, raw_output
                    )
                if not raw_output.is_file():
                    raise RuntimeError("EMPTY_GENERATION")
                duration = encode_mp3(raw_output, output_path, speed, volume)
            return {
                "fileName": output_path.name,
                "durationSeconds": round(duration, 3),
                "device": self.backend.device,
            }


class VoiceWorkerServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], state: WorkerState, boot_token: str) -> None:
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
        return (
            self.client_address[0] == "127.0.0.1"
            and self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"
            and self.headers.get("Origin") is None
        )

    def authorized(self) -> bool:
        return (
            self.trusted_loopback_request()
            and self.server.session_token is not None
            and secrets.compare_digest(
                self.headers.get("Authorization", ""),
                f"Bearer {self.server.session_token}",
            )
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
            raw_code = str(error).split(":", maxsplit=1)[0]
            code = raw_code if raw_code.replace("_", "").isalnum() and raw_code.upper() == raw_code and len(raw_code) > 2 else "WORKER_ERROR"
            self.send_json(500, {"ok": False, "code": code[:80]})

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
            {"ok": True, "sessionToken": self.server.session_token, "protocolVersion": "1.0"},
        )


def main(default_backend: str | None = None) -> None:
    if default_backend not in {None, "cosyvoice", "indextts"}:
        raise RuntimeError("UNKNOWN_BACKEND")
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--boot-token", required=True)
    parser.add_argument("--weights-root", required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--voice-root", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()
    if args.port < 1024 or args.port > 65535 or len(args.boot_token) < 32:
        raise SystemExit(2)
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    state = WorkerState(
        Path(args.weights_root),
        Path(args.source_root),
        Path(args.voice_root),
        Path(args.output_root),
        default_backend or "cosyvoice",
    )
    VoiceWorkerServer(("127.0.0.1", args.port), state, args.boot_token).serve_forever(
        poll_interval=0.25
    )
