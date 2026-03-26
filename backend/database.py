import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(__file__)), 'practices.db')}",
)

# Supabase (and some hosting providers) issue postgres:// URLs; SQLAlchemy requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    **({} if _is_sqlite else {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,  # detects stale connections after container sleep
    }),
    **({"connect_args": {"check_same_thread": False}} if _is_sqlite else {}),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
