from __future__ import annotations
"""Inspect persisted SQLite entries that could affect the 義忍 search flow."""

from pathlib import Path
import sqlite3


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = PROJECT_ROOT / "fanfic.db"
TERMS = ("義忍", "义忍", "Tomioka Giyuu/Kochou Shinobu")


def main() -> None:
    print(f"[CacheAudit] Database: {DATABASE_PATH}")
    if not DATABASE_PATH.exists():
        print("[CacheAudit] No SQLite database found.")
        return

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT keyword, title, author, platform, url, tags, scraped_at
            FROM fanfics
            WHERE keyword IN (?, ?, ?)
               OR title LIKE '%' || ? || '%'
               OR title LIKE '%' || ? || '%'
               OR tags LIKE '%' || ? || '%'
            ORDER BY scraped_at DESC
            """,
            (*TERMS, TERMS[0], TERMS[1], TERMS[0]),
        ).fetchall()

    print(f"[CacheAudit] Related records: {len(rows)}")
    for row in rows:
        print(
            "[CacheAudit] "
            f"keyword={row['keyword']!r} | platform={row['platform']} | "
            f"title={row['title']!r} | url={row['url']} | scraped_at={row['scraped_at']}"
        )


if __name__ == "__main__":
    main()
