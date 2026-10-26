"""Optional local ASR regression review; never part of production generation.

Requires openai-whisper and tiktoken in a separate test dependency directory.
ASR is imperfect: this report is evidence for review, not a pass/fail oracle.
"""
from __future__ import annotations

import argparse
import difflib
import json
import subprocess
import sys
import unicodedata
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--dependencies", type=Path, required=True)
parser.add_argument("--weights", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--source-record", type=Path)
parser.add_argument("audio", nargs="+", type=Path)
args = parser.parse_args()
sys.path.insert(0, str(args.dependencies.resolve()))

import imageio_ffmpeg
import numpy as np
import torch
import whisper

try:
    from opencc import OpenCC
    chinese_converter = OpenCC("t2s")
except ImportError:
    chinese_converter = None

torch.set_num_threads(4)
model = whisper.load_model("small", device="cpu", download_root=str(args.weights))
source = ""
if args.source_record:
    source = json.loads(args.source_record.read_text(encoding="utf-8"))["sourceText"]


def normalize(text: str) -> str:
    if chinese_converter is not None:
        text = chinese_converter.convert(text)
    return "".join(c.lower() for c in unicodedata.normalize("NFKC", text) if c.isalnum())


reports = []
for file in args.audio:
    decoded = subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-threads", "1",
        "-i", str(file), "-f", "s16le", "-ac", "1", "-ar", "16000", "-",
    ], check=True, capture_output=True)
    samples = np.frombuffer(decoded.stdout, np.int16).astype(np.float32) / 32768.0
    result = model.transcribe(samples, language="zh", temperature=0, fp16=False, condition_on_previous_text=False)
    report = {"fileName": file.name, "durationSeconds": len(samples) / 16000, "text": result["text"], "segments": result["segments"]}
    if source:
        comparison = difflib.SequenceMatcher(None, normalize(source), normalize(result["text"]), autojunk=False)
        report["matchingRatio"] = comparison.ratio()
        report["unexpectedSpans"] = [
            normalize(result["text"])[j1:j2]
            for tag, _i1, _i2, j1, j2 in comparison.get_opcodes()
            if tag in ("insert", "replace") and j2 - j1 >= 8
        ]
    reports.append(report)
    print(json.dumps({"fileName": file.name, "durationSeconds": report["durationSeconds"], "matchingRatio": report.get("matchingRatio")}, ensure_ascii=False), flush=True)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({"reports": reports}, ensure_ascii=False, indent=2), encoding="utf-8")
