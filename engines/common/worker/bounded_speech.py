from collections.abc import Callable
import re
from pathlib import Path


def render_script(
    text: str,
    output: Path,
    generate: Callable[[str], tuple[object, int, bool]],
) -> None:
    """Retry a take as smaller paragraphs if the model exhausts its audio budget."""
    import numpy as np
    import soundfile as sf

    def render(passage: str):
        audio, rate, truncated = generate(passage)
        if not truncated:
            if not len(audio) or not np.isfinite(audio).all():
                raise RuntimeError("EMPTY_GENERATION")
            return np.asarray(audio, dtype=np.float32), rate
        midpoint = len(passage) // 2
        breaks = [m.end() for m in re.finditer(r"[。！？.!?；;，,\n]", passage)
                  if len(passage) // 4 <= m.end() <= len(passage) * 3 // 4]
        if len(passage) < 12:
            raise RuntimeError("AUDIO_DURATION_LIMIT")
        split = min(breaks, key=lambda offset: abs(offset - midpoint)) if breaks else midpoint
        left, rate = render(passage[:split].strip())
        right, _ = render(passage[split:].strip())
        return np.concatenate((left, np.zeros(rate // 8, dtype=np.float32), right)), rate

    samples, rate = render(text.strip())
    sf.write(output, samples, rate)
