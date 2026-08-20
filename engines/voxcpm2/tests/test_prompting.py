from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from prompting import (  # noqa: E402
    build_voice_design_text,
    prepare_target_text,
    reference_text_is_plausible,
)


class PromptingTests(unittest.TestCase):
    def test_neutral_expression_never_changes_spoken_text(self) -> None:
        text = "大家好，我是小林"
        for expression in (
            "",
            "自然",
            "自然、清晰",
            "自然、清晰，像平时说话一样。",
        ):
            prepared, controlled = prepare_target_text(text, "auto", expression)
            self.assertEqual(prepared, text)
            self.assertFalse(controlled)

    def test_dialect_uses_short_control_tag_instead_of_spoken_instruction(self) -> None:
        text = "大家好，我是小林"
        cantonese, cantonese_controlled = prepare_target_text(
            text, "yue", "自然、清晰，像平时说话一样。"
        )
        dongbei, dongbei_controlled = prepare_target_text(
            text, "dialect-dongbei", "自然、清晰"
        )

        self.assertEqual(cantonese, f"(粤语){text}")
        self.assertEqual(dongbei, f"(东北话){text}")
        self.assertNotIn("请用", cantonese)
        self.assertNotIn("自然表达", dongbei)
        self.assertTrue(cantonese_controlled)
        self.assertTrue(dongbei_controlled)

    def test_voice_design_adds_one_sanitized_control_tag(self) -> None:
        prepared = build_voice_design_text(
            "欢迎收听今天的节目", "（年轻女声）\n温暖、从容，语速稍慢"
        )

        self.assertEqual(
            prepared,
            "(年轻女声 温暖、从容，语速稍慢)欢迎收听今天的节目",
        )
        self.assertEqual(prepared.count("("), 1)
        self.assertEqual(prepared.count(")"), 1)

    def test_ultimate_cloning_rejects_an_obviously_incomplete_transcript(self) -> None:
        self.assertFalse(reference_text_is_plausible("你好", 8.0))
        self.assertTrue(reference_text_is_plausible("大家好，这是我的参考录音原文", 8.0))


if __name__ == "__main__":
    unittest.main()
