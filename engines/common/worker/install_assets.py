from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import urllib.request
import uuid
import zipfile
from pathlib import Path
from typing import Any

from huggingface_hub import snapshot_download


def emit(progress: int, message: str) -> None:
    print(json.dumps({"progress": progress, "message": message}, ensure_ascii=False), flush=True)


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_files(root: Path) -> list[Path]:
    return sorted(
        file_path
        for file_path in root.rglob("*")
        if file_path.is_file() and ".cache" not in file_path.relative_to(root).parts
    )


def verify_required(root: Path, required: dict[str, str]) -> None:
    for relative_name, expected in required.items():
        file_path = root / Path(relative_name)
        if not file_path.is_file() or sha256_file(file_path) != expected.lower():
            raise RuntimeError(f"MODEL_SHA256_MISMATCH:{relative_name}")


def atomic_receipt(root: Path, value: dict[str, Any]) -> None:
    temporary = root / f"install-receipt.{uuid.uuid4().hex}.tmp"
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, root / "install-receipt.json")


def quarantine_incomplete(target: Path) -> None:
    if target.exists():
        os.replace(target, target.with_name(f"{target.name}.incomplete.{uuid.uuid4().hex}"))


def download_with_resume(url: str, destination: Path) -> None:
    """Download to a stable .part file so terminating the worker keeps progress."""
    partial = destination.with_name(f"{destination.name}.part")
    partial.parent.mkdir(parents=True, exist_ok=True)
    downloaded = partial.stat().st_size if partial.is_file() else 0
    request = urllib.request.Request(url)
    if downloaded:
        request.add_header("Range", f"bytes={downloaded}-")
    response = urllib.request.urlopen(request, timeout=60)
    append = downloaded > 0 and getattr(response, "status", None) == 206
    if downloaded and not append:
        downloaded = 0
    with partial.open("ab" if append else "wb") as handle:
        while True:
            chunk = response.read(8 * 1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(partial, destination)


def install_extra_files(target: Path, cache_root: Path, item: dict[str, Any]) -> None:
    for extra in item.get("extraFiles", []):
        relative_path = Path(str(extra["path"]))
        destination = (target / relative_path).resolve()
        if target.resolve() not in destination.parents:
            raise RuntimeError("INVALID_EXTRA_FILE_PATH")
        expected = str(extra["sha256"]).lower()
        if destination.is_file() and sha256_file(destination) == expected:
            continue

        cache_path = cache_root / "sources" / str(extra.get("cacheName", relative_path.name))
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        if not cache_path.is_file() or sha256_file(cache_path) != expected:
            emit(62, f"正在下载 {extra['label']}…")
            download_with_resume(str(extra["url"]), cache_path)
            if sha256_file(cache_path) != expected:
                cache_path.rename(cache_path.with_suffix(".invalid"))
                raise RuntimeError("EXTRA_FILE_SHA256_MISMATCH")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary_destination = destination.with_suffix(f".installing.{uuid.uuid4().hex}.tmp")
        shutil.copy2(cache_path, temporary_destination)
        os.replace(temporary_destination, destination)


def install_source(source_root: Path, cache_root: Path, item: dict[str, Any], progress: int) -> None:
    directory = str(item["directory"])
    target = source_root / directory
    required = {str(key): str(value) for key, value in item.get("requiredSha256", {}).items()}
    receipt = target / "install-receipt.json"
    if receipt.is_file():
        install_extra_files(target, cache_root, item)
        verify_required(target, required)
        return

    archive_name = f"{directory}-{str(item['sha256'])[:16]}.zip"
    archive_path = cache_root / "sources" / archive_name
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    if not archive_path.is_file():
        emit(progress, f"正在下载 {item['label']} 官方源码…")
        download_with_resume(str(item["url"]), archive_path)
        if sha256_file(archive_path) != str(item["sha256"]).lower():
            archive_path.rename(archive_path.with_suffix(".invalid"))
            raise RuntimeError("SOURCE_SHA256_MISMATCH")
    if sha256_file(archive_path) != str(item["sha256"]).lower():
        raise RuntimeError("SOURCE_SHA256_MISMATCH")

    staging = source_root / f"{directory}.installing"
    if staging.exists():
        quarantine_incomplete(staging)
    staging.mkdir(parents=True, exist_ok=False)
    extract_root = staging / "extracted"
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(extract_root)
    entries = list(extract_root.iterdir())
    content_root = entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_root
    for child in list(content_root.iterdir()):
        shutil.move(str(child), staging / child.name)
    shutil.rmtree(extract_root)
    install_extra_files(staging, cache_root, item)
    verify_required(staging, required)
    atomic_receipt(
        staging,
        {
            "url": item["url"],
            "sha256": item["sha256"],
            "files": {
                file_path.relative_to(staging).as_posix(): sha256_file(file_path)
                for file_path in safe_files(staging)
            },
        },
    )
    quarantine_incomplete(target)
    os.replace(staging, target)


def install_model(
    weights_root: Path, cache_root: Path, item: dict[str, Any], progress: int
) -> None:
    directory = str(item["directory"])
    target = weights_root / directory
    required = {str(key): str(value) for key, value in item["requiredSha256"].items()}
    receipt = target / "install-receipt.json"
    if receipt.is_file():
        install_extra_files(target, cache_root, item)
        verify_required(target, required)
        return

    staging = weights_root / f"{directory}.installing"
    staging.mkdir(parents=True, exist_ok=True)
    emit(progress, f"正在下载 {item['label']} 官方权重…")
    snapshot_download(
        repo_id=str(item["repository"]),
        revision=str(item["revision"]),
        local_dir=staging,
        allow_patterns=[str(pattern) for pattern in item.get("allowPatterns", ["*"])],
    )
    install_extra_files(staging, cache_root, item)
    emit(min(92, progress + 10), f"正在校验 {item['label']} 权重 SHA-256…")
    verify_required(staging, required)
    atomic_receipt(
        staging,
        {
            "repository": item["repository"],
            "revision": item["revision"],
            "files": {
                file_path.relative_to(staging).as_posix(): sha256_file(file_path)
                for file_path in safe_files(staging)
            },
        },
    )
    quarantine_incomplete(target)
    os.replace(staging, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights-root", required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--cache-root", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    weights_root = Path(args.weights_root).resolve()
    source_root = Path(args.source_root).resolve()
    cache_root = Path(args.cache_root).resolve()
    manifest = json.loads(Path(args.manifest).resolve().read_text(encoding="utf-8"))
    weights_root.mkdir(parents=True, exist_ok=True)
    source_root.mkdir(parents=True, exist_ok=True)
    cache_root.mkdir(parents=True, exist_ok=True)

    sources = list(manifest.get("sources", []))
    models = list(manifest.get("models", []))
    total = max(1, len(sources) + len(models))
    for index, item in enumerate(sources):
        install_source(source_root, cache_root, item, 44 + round(index * 45 / total))
    for index, item in enumerate(models, start=len(sources)):
        install_model(weights_root, cache_root, item, 44 + round(index * 45 / total))
    emit(94, "模型源码与权重已通过 SHA-256 校验。")


if __name__ == "__main__":
    main()
