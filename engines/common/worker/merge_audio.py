from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
import soundfile as sf


def is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    request_path = Path(args.request).resolve()
    payload = json.loads(request_path.read_text(encoding="utf-8"))
    output_root = Path(str(payload["outputRoot"])).resolve()
    inputs = [Path(str(value)).resolve() for value in payload["inputs"]]
    output = Path(str(payload["output"])).resolve()
    pause_ms = int(payload["pauseMs"])
    if (
        not inputs
        or len(inputs) > 200
        or pause_ms < 0
        or pause_ms > 5000
        or not is_within(output, output_root)
        or any(not item.is_file() or not is_within(item, output_root) for item in inputs)
    ):
        raise RuntimeError("INVALID_MERGE_REQUEST")

    command = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error"]
    for item in inputs:
        command.extend(["-i", str(item)])
    filters: list[str] = []
    labels: list[str] = []
    for index in range(len(inputs)):
        label = f"a{index}"
        filters.append(
            f"[{index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[{label}]"
        )
        labels.append(f"[{label}]")
        if pause_ms > 0 and index < len(inputs) - 1:
            silence_label = f"s{index}"
            filters.append(
                f"anullsrc=r=44100:cl=mono,atrim=duration={pause_ms / 1000:.3f}[{silence_label}]"
            )
            labels.append(f"[{silence_label}]")
    filters.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1[out]")
    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[out]",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output),
        ]
    )
    subprocess.run(command, check=True, capture_output=True)
    duration = float(sf.info(output).duration)
    print(json.dumps({"durationSeconds": round(duration, 3)}), flush=True)


if __name__ == "__main__":
    main()
