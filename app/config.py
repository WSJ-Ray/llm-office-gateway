from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = str(DATA_DIR / "gateway.db")
STATIC_DIR = BASE_DIR / "static"

DEFAULT_PROVIDER_TIMEOUT = 120
