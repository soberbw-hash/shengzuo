from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "common" / "worker"))
from server_core import main
from zonos3_backend import Zonos3Backend

if __name__ == "__main__":
    main(backend_factory=Zonos3Backend)
