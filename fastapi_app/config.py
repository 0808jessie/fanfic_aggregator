import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Runtime settings with safe local-development defaults."""

    database_path: Path
    cache_ttl_seconds: int
    host: str
    port: int


def load_settings() -> Settings:
    project_root = Path(__file__).resolve().parent.parent
    database_path = Path(os.getenv("FANFIC_DB_PATH", project_root / "fanfic.db"))
    return Settings(
        database_path=database_path,
        cache_ttl_seconds=int(os.getenv("CACHE_TTL_SECONDS", "43200")),
        host=os.getenv("FASTAPI_HOST", "0.0.0.0"),
        port=int(os.getenv("FASTAPI_PORT", "8000")),
    )


settings = load_settings()
