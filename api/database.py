"""MySQL 連線（Railway / 本機共用）。"""
import os
from contextlib import contextmanager
from typing import Any
from urllib.parse import unquote, urlparse

import pymysql
from fastapi import HTTPException
from pymysql.cursors import DictCursor


def _load_env():
    if os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL"):
        return
    try:
        from dotenv import load_dotenv
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        load_dotenv(root / ".env")
        load_dotenv(root / ".env.local", override=True)
    except ImportError:
        return


_load_env()


def database_config() -> dict[str, Any]:
    database_url = (
        (os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL") or "").strip().strip('"').strip("'")
    )
    if database_url:
        parsed = urlparse(database_url)
        database = parsed.path.lstrip("/")
        if "?" in database:
            database = database.split("?", 1)[0]
        return {
            "host": parsed.hostname,
            "port": parsed.port or 3306,
            "user": unquote(parsed.username) if parsed.username else None,
            "password": unquote(parsed.password) if parsed.password else None,
            "database": database or None,
        }
    return {
        "host": os.getenv("MYSQL_HOST"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER"),
        "password": os.getenv("MYSQL_PASSWORD"),
        "database": os.getenv("MYSQL_DATABASE"),
    }


@contextmanager
def db_connection():
    config = database_config()
    connect_config = {
        k: v
        for k, v in config.items()
        if k in ("host", "port", "user", "password", "database")
    }
    missing = [key for key in ("host", "user", "database") if not connect_config.get(key)]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"MySQL 未設定，缺少: {', '.join(missing)}",
        )

    try:
        connection = pymysql.connect(
            **connect_config,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
            connect_timeout=15,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"MySQL 連線失敗（{connect_config.get('host')}）：{exc}",
        ) from exc

    try:
        yield connection
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"MySQL 操作失敗：{exc}") from exc
    finally:
        connection.close()
