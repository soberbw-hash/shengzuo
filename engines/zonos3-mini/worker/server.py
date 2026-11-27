from pathlib import Path
import sys

worker_root = Path(__file__).resolve().parent
sys.path[:0] = [str(worker_root), str(worker_root.parents[1] / "common" / "worker")]
from server_core import main
from zonos3_backend import Zonos3Backend

if __name__ == "__main__":
    main(backend_factory=Zonos3Backend)
