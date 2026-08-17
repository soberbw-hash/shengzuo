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


def prepare_target_text(text: str, language: str, expression: str) -> tuple[str, bool]:
    instructions: list[str] = []
    dialect = DIALECT_NAMES.get(language)
    if dialect:
        instructions.append(dialect)
    if not is_neutral_expression(expression):
        cleaned_expression = re.sub(r"[()（）]", "", expression).strip()
        if cleaned_expression:
            instructions.append(cleaned_expression)
    if not instructions:
        return text, False
    return f"({','.join(instructions)}){text}", True
