from __future__ import annotations

import re

DIALECT_NAMES = {
    "yue": "粤语",
    "dialect-dongbei": "东北话",
    "dialect-henan": "河南话",
    "dialect-minnan": "闽南话",
    "dialect-shaanxi": "陕西话",
    "dialect-shandong": "山东话",
    "dialect-sichuan": "四川话",
    "dialect-tianjin": "天津话",
    "dialect-wu": "吴语",
}


def _expression_key(value: str) -> str:
    return re.sub(r"[\s，,。、。！!？?；;：:]", "", value)


def is_neutral_expression(value: str) -> bool:
    return _expression_key(value) in {
        "",
        "自然",
        "自然清晰",
        "自然清晰像平时说话一样",
    }


def clean_control_instruction(value: str) -> str:
    """Keep control text short and prevent nested tags from becoming speech."""
    without_tags = re.sub(r"[()（）\r\n]", " ", value)
    return re.sub(r"\s+", " ", without_tags).strip()[:200]


def prepare_target_text(text: str, language: str, expression: str) -> tuple[str, bool]:
    instructions: list[str] = []
    dialect = DIALECT_NAMES.get(language)
    if dialect:
        instructions.append(dialect)
    if not is_neutral_expression(expression):
        cleaned_expression = clean_control_instruction(expression)
        if cleaned_expression:
            instructions.append(cleaned_expression)
    if not instructions:
        return text, False
    return f"({','.join(instructions)}){text}", True


def build_voice_design_text(text: str, description: str) -> str:
    cleaned_description = clean_control_instruction(description)
    if len(cleaned_description) < 4:
        raise ValueError("VOICE_DESCRIPTION_REQUIRED")
    return f"({cleaned_description}){text}"


def prepare_voice_design_chunk(
    text: str,
    description: str,
    index: int,
    first_chunk_text: str,
) -> tuple[str, str | None]:
    """Use description once, then continue from the first real text/audio pair."""

    if index == 0:
        return build_voice_design_text(text, description), None
    if not first_chunk_text.strip():
        raise ValueError("VOICE_DESCRIPTION_REQUIRED")
    return text, first_chunk_text


def reference_text_is_plausible(reference_text: str, duration_seconds: float) -> bool:
    """Reject clearly incomplete transcripts before Vox continuation cloning."""
    meaningful_units = sum(character.isalnum() for character in reference_text)
    minimum_units = max(4, int(duration_seconds + 0.999))
    maximum_units = int(duration_seconds * 14) + 20
    return minimum_units <= meaningful_units <= maximum_units
