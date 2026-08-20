from __future__ import annotations

import re

_CHINESE_CHARACTER = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
_SENTENCE_BOUNDARY = re.compile(r"(?<=[。！？!?；;])\s*")
_CLAUSE_BOUNDARY = re.compile(r"(?<=[，,、：:])\s*")


def spoken_units(text: str) -> int:
    """Count Chinese speech units without treating punctuation as syllables."""

    return len(_CHINESE_CHARACTER.findall(text))


def _hard_split(text: str, limit: int) -> list[str]:
    parts: list[str] = []
    current = ""
    count = 0
    for character in text:
        character_count = 0 if character.isspace() else 1
        if current and count + character_count > limit:
            parts.append(current.strip())
            current = ""
            count = 0
        current += character
        count += character_count
    if current.strip():
        parts.append(current.strip())
    return parts


def split_for_stable_pacing(text: str, limit: int = 70) -> list[str]:
    """Prefer complete sentences and cap long clauses to limit pace drift."""

    if limit < 20:
        raise ValueError("limit must be at least 20")
    normalized = re.sub(r"\s+", " ", text.replace("\r", " ")).strip()
    if not normalized:
        return []

    result: list[str] = []
    for sentence in filter(None, _SENTENCE_BOUNDARY.split(normalized)):
        sentence = sentence.strip()
        if len(re.sub(r"\s", "", sentence)) <= limit:
            result.append(sentence)
            continue

        current = ""
        clauses = [part.strip() for part in _CLAUSE_BOUNDARY.split(sentence)]
        for clause in filter(None, clauses):
            candidate = f"{current} {clause}".strip()
            if len(re.sub(r"\s", "", candidate)) <= limit:
                current = candidate
                continue
            if current:
                result.append(current)
                current = ""
            if len(re.sub(r"\s", "", clause)) <= limit:
                current = clause
            else:
                result.extend(_hard_split(clause, limit))
        if current:
            result.append(current)
    return result


def seconds_per_unit(duration_seconds: float, text: str) -> float | None:
    units = spoken_units(text)
    if units < 8 or duration_seconds <= 0:
        return None
    return duration_seconds / units


def pace_correction(
    baseline_seconds_per_unit: float | None,
    current_seconds_per_unit: float | None,
    allowed_fast_ratio: float = 0.85,
) -> float:
    """Return an FFmpeg atempo value that only slows an unusually fast chunk."""

    if baseline_seconds_per_unit is None or current_seconds_per_unit is None:
        return 1.0
    minimum_seconds_per_unit = baseline_seconds_per_unit * allowed_fast_ratio
    if current_seconds_per_unit >= minimum_seconds_per_unit:
        return 1.0
    # Large per-chunk tempo jumps sound less natural than a slightly fast phrase.
    # Keep automatic correction gentle; severe outliers are retried by the worker.
    return max(0.88, min(1.0, current_seconds_per_unit / minimum_seconds_per_unit))
