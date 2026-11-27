import os
from pathlib import Path
import re

from bounded_speech import render_script
from server_core import shorten_reference_for_clone

LANGUAGE_ALIASES = {"zh": "cmn", "en": "en_us", "fr": "fr_fr", "pt": "pt_br"}
LANGUAGES = set(
    "auto zh en fr es de it pt nl el sv da no fi pl cs sk hu ro bg ru uk tr ar "
    "he ka ja ko vi id ms th tl hi bn ta te mr gu kn ml pa or ur".split()
)
MAX_AUDIO_FRAMES = 1800


class Zonos3Backend:
    def __init__(self, weights_root: Path, _source_root: Path) -> None:
        self.weights = weights_root / "ZONOS3-Mini-hf"
        self.model = None
        self.device = "not-loaded"

    def load(self) -> dict[str, str]:
        if self.model is None:
            import torch
            from transformers import AutoModel

            cuda = torch.cuda.is_available() and os.environ.get("SHENGZUO_FORCE_CPU") != "1"
            self.device = "cuda:0" if cuda else "cpu"
            self.model = AutoModel.from_pretrained(
                str(self.weights), local_files_only=True, trust_remote_code=True,
                dtype=torch.bfloat16 if cuda else torch.float32,
            ).eval().to(self.device)
        return {"device": self.device}

    def render(self, text, audio, _reference_text, language, speed, seed, output) -> bool:
        import soundfile as sf

        if language not in LANGUAGES:
            raise RuntimeError("UNSUPPORTED_LANGUAGE")
        self.load()
        shorten_reference_for_clone(audio, "")
        samples, rate = sf.read(audio, dtype="float32")
        embedding = self.model.embed_speaker(samples, rate)
        if language == "auto":
            language = "zh" if re.search(r"[\u3400-\u9fff]", text) else "en"
        language_code = LANGUAGE_ALIASES.get(language, language)

        def generate(passage):
            out = self.model.generate(
                passage, language=language_code, speaker_embedding=embedding,
                condition_values={"speaking_rate": 14.0 * speed},
                max_new_frames=MAX_AUDIO_FRAMES, seed=seed,
            )
            # The codec drops the trailing delay slots for the ten codebooks.
            last_complete_frame = MAX_AUDIO_FRAMES - (self.model.config.lm["n_codebooks"] - 1)
            return (out.waveform.detach().cpu().numpy(), out.sampling_rate,
                    len(out.codes) >= last_complete_frame)

        render_script(text, output, generate)
        return True
