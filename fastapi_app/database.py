from datetime import datetime
from pathlib import Path

from sqlalchemy import Column, DateTime, Integer, String, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

DATABASE_PATH = settings.database_path
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Fanfic(Base):
    """Persistent metadata for one work discovered by a platform adapter."""

    __tablename__ = "fanfics"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=False, index=True)
    platform = Column(String, nullable=False, index=True)
    url = Column(String, nullable=False, unique=True, index=True)
    tags = Column(String, nullable=False, default="")
    summary = Column(String, nullable=False, default="")
    keyword = Column(String, nullable=True, index=True)
    scraped_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


def initialize_database() -> None:
    """Create the table and add the cache key to older local databases if needed."""
    Base.metadata.create_all(bind=engine)
    columns = {column["name"] for column in inspect(engine).get_columns("fanfics")}
    if "keyword" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE fanfics ADD COLUMN keyword VARCHAR"))


initialize_database()
