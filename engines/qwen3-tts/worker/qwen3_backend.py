import os
from pathlib import Path

from bounded_speech import render_script
from server_core import shorten_reference_for_clone

LANGUAGES = {
    "auto": "Auto", "zh": "Chinese", "en": "English", "ja": "Japanese",
    "ko": "Korean", "de": "German", "fr": "French", "ru": "Russian",
    "pt": "Portuguese", "es": "Spanish", "it": "Italian",
}
MAX_AUDIO_TOKENS = 1500


class Qwen3Backend:
    def __init__(self, weights_root: Path, _source_root: Path) -> None:
        self.weights = weights_root / "Qwen3-TTS-12Hz-1.7B-Base"
        self.model = None
        self.device = "not-loaded"

    def load(self) -> dict[str, str]:
        if self.model is None:
            import torch
            from qwen_tts import Qwen3TTSModel

            cuda = torch.cuda.is_available() and os.environ.get("SHENGZUO_FORCE_CPU") != "1"
            self.device = "cuda:0" if cuda else "cpu"
            self.model = Qwen3TTSModel.from_pretrained(
                str(self.weights), local_files_only=True, device_map=self.device,
                dtype=torch.bfloat16 if cuda else torch.float32, attn_implementation="sdpa",
            )
        return {"device": self.device}

    def render(self, text, audio, reference_text, language, _speed, seed, output) -> bool:
        import soundfile as sf
        import torch

        if language not in LANGUAGES:
            raise RuntimeError("UNSUPPORTED_LANGUAGE")
        self.load()
        reference_text = shorten_reference_for_clone(audio, reference_text)
        samples, rate = sf.read(audio, dtype="float32")
        prompt = self.model.create_voice_clone_prompt(
            ref_audio=(samples, rate), ref_text=reference_text,
            x_vector_only_mode=not bool(reference_text),
        )

        def generate(passage):
            torch.manual_seed(seed)
            wavs, sample_rate = self.model.generate_voice_clone(
                text=passage, language=LANGUAGES[language], voice_clone_prompt=prompt,
                max_new_tokens=MAX_AUDIO_TOKENS,
            )
            wav = wavs[0]
            return wav, sample_rate, len(wav) >= sample_rate * 119.5

        render_script(text, output, generate)
        return False
