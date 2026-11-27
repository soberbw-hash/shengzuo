from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "common" / "worker"))
from server_core import main
from qwen3_backend import Qwen3Backend

if __name__ == "__main__":
    main(backend_factory=Qwen3Backend)
