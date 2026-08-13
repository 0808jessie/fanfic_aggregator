"""Remove persisted search rows for 義忍 aliases so the next request is live-only."""

from pathlib import Path
import sqlite3


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = PROJECT_ROOT / "fanfic.db"
KEYWORDS = ("義忍", "义忍")


def main() -> None:
    if not DATABASE_PATH.exists():
        print("[GiyushinoCacheReset] No database file found; nothing to clear.")
        return

    with sqlite3.connect(DATABASE_PATH) as connection:
        before = connection.execute(
            "SELECT COUNT(*) FROM fanfics WHERE keyword IN (?, ?)", KEYWORDS
        ).fetchone()[0]
        connection.execute("DELETE FROM fanfics WHERE keyword IN (?, ?)", KEYWORDS)
        connection.commit()

    print(f"[GiyushinoCacheReset] Removed {before} persisted rows for {KEYWORDS}.")


if __name__ == "__main__":
    main()
