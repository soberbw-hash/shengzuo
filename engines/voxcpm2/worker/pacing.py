from __future__ import annotations

import re
import statistics
from collections.abc import Sequence

_SENTENCE_END = frozenset("。！？!?;；")
_CLAUSE_END = frozenset("，,、：:")
_SPOKEN_TOKEN = re.compile(
    r"[A-Za-z]+(?:['’-][A-Za-z]+)*|[0-9]+|[^\W_]", re.UNICODE
)
_COMMON_SPELLED_INITIALISMS = frozenset(
    {"AI", "API", "CPU", "CUDA", "DXP", "GPU", "RAM", "TTS", "URL", "USB", "VRAM"}
)


def _estimate_english_syllables(source: str) -> int:
    word = re.sub(r"[^a-z]", "", source.lower())
    if not word:
        return 0
    if source.upper() in _COMMON_SPELLED_INITIALISMS:
        return len(source)
    if len(word) <= 3:
        return 1
    without_silent_ending = re.sub(r"(?:[^aeiou]e)$", "", word)
    without_silent_ending = re.sub(
        r"(?:[^aeiou]es|[^aeiou]ed)$", "", without_silent_ending
    )
    groups = len(re.findall(r"[aeiouy]+", without_silent_ending))
    consonant_le = 1 if re.search(r"[^aeiou]le$", word) else 0
    return max(1, groups + consonant_le)


def spoken_units(text: str) -> int:
    """Estimate spoken units for Chinese, Latin words, digits and other scripts.

    This mirrors the Main process: Latin words use a conservative syllable
    estimate, short uppercase abbreviations are read letter-by-letter, digits
    remain per-digit, and other scripts count per written character.
    """

    units = 0
    for match in _SPOKEN_TOKEN.finditer(text):
        token = match.group(0)
        if token[0].isascii() and token[0].isalpha():
            units += _estimate_english_syllables(token)
        elif token.isdigit():
            units += len(token)
        else:
            units += 1
    return units


def _boundary_penalty(text: str, actual_end: int, is_final: bool) -> float:
    if is_final:
        return 0.0
    previous = text[actual_end - 1]
    if previous in _SENTENCE_END:
        return 0.0
    if previous in _CLAUSE_END:
        return 4.0
    if actual_end < len(text) and text[actual_end].isspace():
        return 7.0
    return 18.0


def split_for_stable_pacing(
    text: str,
    limit: int = 55,
    target_min: int = 30,
    target_max: int = 50,
) -> list[str]:
    """Split text into balanced, punctuation-aware chunks without losing text.

    The dynamic partitioner targets 30--50 visible characters, never exceeds
    the 55-character hard limit, and strongly avoids leaving a tiny last
    sentence on its own. Whitespace is normalized because it has no spoken
    value; every other character remains in its original order.
    """

    if limit < 20:
        raise ValueError("limit must be at least 20")
    if target_min < 1 or target_max < target_min:
        raise ValueError("invalid target range")
    target_max = min(target_max, limit)
    normalized = re.sub(r"\s+", " ", text.replace("\r", " ")).strip()
    if not normalized:
        return []

    visible_positions = [
        index + 1
        for index, character in enumerate(normalized)
        if not character.isspace()
    ]
    total = len(visible_positions)
    if total <= limit:
        return [normalized]

    # Lengths below 30 are allowed only when the total cannot be partitioned
    # otherwise (for example 56 visible characters). Their large penalty
    # yields two balanced pieces instead of a 55+1 orphan.
    minimum_partition = min(20, target_min)
    ideal = (target_min + target_max) / 2
    costs = [float("inf")] * (total + 1)
    previous_cut = [-1] * (total + 1)
    costs[0] = 0.0

    for end in range(1, total + 1):
        lower = max(0, end - limit)
        upper = end - minimum_partition
        for start in range(lower, upper + 1):
            if costs[start] == float("inf"):
                continue
            length = end - start
            short_penalty = max(0, target_min - length) * 24.0
            long_penalty = max(0, length - target_max) * 6.0
            length_penalty = ((length - ideal) / 6.0) ** 2
            actual_end = visible_positions[end - 1]
            boundary_penalty = _boundary_penalty(
                normalized, actual_end, end == total
            )
            candidate = (
                costs[start]
                + 10.0
                + short_penalty
                + long_penalty
                + length_penalty
                + boundary_penalty
            )
            if candidate < costs[end]:
                costs[end] = candidate
                previous_cut[end] = start

    if previous_cut[total] < 0:
        # Defensive fallback: the bounds above should always permit a split.
        chunks: list[str] = []
        start = 0
        while start < total:
            end = min(total, start + limit)
            actual_start = 0 if start == 0 else visible_positions[start - 1]
            actual_end = visible_positions[end - 1]
            chunks.append(normalized[actual_start:actual_end].strip())
            start = end
        return chunks

    cuts: list[int] = []
    cursor = total
    while cursor > 0:
        cuts.append(cursor)
        cursor = previous_cut[cursor]
    cuts.reverse()

    chunks = []
    actual_start = 0
    for visible_end in cuts:
        actual_end = visible_positions[visible_end - 1]
        chunk = normalized[actual_start:actual_end].strip()
        if chunk:
            chunks.append(chunk)
        actual_start = actual_end
    return chunks


def seconds_per_unit(duration_seconds: float, text: str) -> float | None:
    units = spoken_units(text)
    if units < 8 or duration_seconds <= 0:
        return None
    return duration_seconds / units


def calibration_baseline(
    paces: Sequence[float | None],
    sample_limit: int = 3,
) -> float | None:
    """Return a frozen median based only on the first 2--3 valid chunks."""

    valid = [
        pace
        for pace in paces
        if pace is not None and 0.10 <= pace <= 0.42
    ][:sample_limit]
    if len(valid) < 2:
        return None
    return float(statistics.median(valid))


def pace_correction(
    baseline_seconds_per_unit: float | None,
    current_seconds_per_unit: float | None,
    allowed_fast_ratio: float = 0.85,
    allowed_slow_ratio: float = 1.30,
) -> float:
    """Return a pitch-preserving FFmpeg tempo correction for a pace outlier."""

    if baseline_seconds_per_unit is None or current_seconds_per_unit is None:
        return 1.0
    minimum = baseline_seconds_per_unit * allowed_fast_ratio
    maximum = baseline_seconds_per_unit * allowed_slow_ratio
    if current_seconds_per_unit < minimum:
        return max(0.90, min(1.0, current_seconds_per_unit / minimum))
    if current_seconds_per_unit > maximum:
        return min(1.10, max(1.0, current_seconds_per_unit / maximum))
    return 1.0
