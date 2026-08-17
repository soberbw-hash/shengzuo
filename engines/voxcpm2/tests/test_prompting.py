from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1] / "worker"
sys.path.insert(0, str(WORKER_ROOT))

from prompting import prepare_target_text  # noqa: E402


class PromptingTests(unittest.TestCase):
    def test_neutral_expression_never_changes_spoken_text(self) -> None:
        text = "大家好，我是郑轮"
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
        text = "大家好，我是郑轮"
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


if __name__ == "__main__":
    unittest.main()
