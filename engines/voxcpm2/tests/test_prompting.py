from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from prompting import (  # noqa: E402
    build_voice_design_text,
    prepare_target_text,
    prepare_voice_design_chunk,
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

    def test_voice_design_description_is_used_only_for_the_first_chunk(self) -> None:
        first_text = "这是真实的第一段正文。"
        first_target, first_prompt = prepare_voice_design_chunk(
            first_text, "温暖沉稳的女声", 0, first_text
        )
        next_target, next_prompt = prepare_voice_design_chunk(
            "这是后续正文。", "温暖沉稳的女声", 1, first_text
        )
        self.assertEqual(first_target, f"(温暖沉稳的女声){first_text}")
        self.assertIsNone(first_prompt)
        self.assertEqual(next_target, "这是后续正文。")
        self.assertEqual(next_prompt, first_text)

    def test_ultimate_cloning_rejects_an_obviously_incomplete_transcript(self) -> None:
        self.assertFalse(reference_text_is_plausible("你好", 8.0))
        self.assertTrue(reference_text_is_plausible("大家好，这是我的参考录音原文", 8.0))
        self.assertTrue(reference_text_is_plausible("こんにちは、音声の確認です", 5.0))
        self.assertTrue(reference_text_is_plausible("안녕하세요 음성 확인입니다", 5.0))
        self.assertTrue(reference_text_is_plausible("مرحبا هذا اختبار صوتي", 5.0))
        self.assertFalse(reference_text_is_plausible("……？！", 5.0))


if __name__ == "__main__":
    unittest.main()
