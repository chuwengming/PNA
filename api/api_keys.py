"""User-issued MCP API keys stored in MySQL."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Any, Dict, List, Literal

import pymysql
from fastapi import HTTPException

from api.database import db_connection

API_KEY_PREFIX = "pna_"
MAX_KEYS_PER_USER = 20
MAX_APP_NAME_LEN = 191

CREATE_API_KEYS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS api_keys (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    email VARCHAR(255) NOT NULL,
    app_name VARCHAR(191) NOT NULL,
    api_key VARCHAR(191) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_api_keys_hash (key_hash),
    UNIQUE KEY uq_api_keys_user_app (user_id, app_name),
    CONSTRAINT fk_api_keys_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def hash_api_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"


def mysql_configured() -> bool:
    return bool(
        os.getenv("DATABASE_URL")
        or os.getenv("MYSQL_URL")
        or os.getenv("MYSQL_HOST")
    )


def env_mcp_key_matches(token: str) -> bool:
    expected = (os.getenv("MCP_API_KEY") or "").strip()
    if not expected:
        return False
    left = token.encode("utf-8")
    right = expected.encode("utf-8")
    if len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


KeyLookupResult = Literal["match", "miss", "unavailable"]


def lookup_key_hash(token: str) -> KeyLookupResult:
    if not token:
        return "miss"
    if not mysql_configured():
        return "unavailable"
    digest = hash_api_key(token)
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM api_keys WHERE key_hash = %s LIMIT 1",
                    (digest,),
                )
                return "match" if cursor.fetchone() is not None else "miss"
    except Exception:
        return "unavailable"


def authorize_mcp_bearer(authorization: str) -> tuple[bool, int, str]:
    """Validate Authorization header for /mcp. Env key or api_keys row."""
    if not authorization.startswith("Bearer "):
        return False, 401, "Unauthorized"
    token = authorization[7:].strip()
    if not token:
        return False, 401, "Unauthorized"
    if env_mcp_key_matches(token):
        return True, 200, ""
    result = lookup_key_hash(token)
    if result == "match":
        return True, 200, ""
    if result == "unavailable":
        if mysql_configured():
            return False, 503, "MCP key store unavailable"
        if not (os.getenv("MCP_API_KEY") or "").strip():
            return False, 503, "MCP_API_KEY is not configured"
        return False, 401, "Unauthorized"
    return False, 401, "Unauthorized"


def _row_to_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    created = row.get("created_at")
    return {
        "id": int(row["id"]),
        "userId": int(row["user_id"]),
        "email": row["email"],
        "appName": row["app_name"],
        "apiKey": row["api_key"],
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }


def list_api_keys(user_id: int) -> List[Dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, email, app_name, api_key, created_at
                FROM api_keys
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall()
    return [_row_to_payload(row) for row in rows]


def create_api_key(user_id: int, email: str, app_name: str) -> Dict[str, Any]:
    name = (app_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="應用程式名稱不可為空")
    if len(name) > MAX_APP_NAME_LEN:
        raise HTTPException(status_code=400, detail="應用程式名稱過長")

    account = (email or "").strip().lower()
    if not account:
        raise HTTPException(status_code=400, detail="缺少使用者帳號")

    token = generate_api_key()
    digest = hash_api_key(token)

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, email FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="找不到使用者")
            stored_email = (user.get("email") or account).strip().lower()

            cursor.execute(
                "SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = %s",
                (user_id,),
            )
            count_row = cursor.fetchone()
            if count_row and int(count_row["cnt"]) >= MAX_KEYS_PER_USER:
                raise HTTPException(
                    status_code=400,
                    detail=f"每個帳號最多申請 {MAX_KEYS_PER_USER} 組 API Key",
                )

            try:
                cursor.execute(
                    """
                    INSERT INTO api_keys (user_id, email, app_name, api_key, key_hash)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, stored_email, name, token, digest),
                )
            except pymysql.err.IntegrityError:
                raise HTTPException(
                    status_code=400,
                    detail="此應用程式名稱已申請過 API Key，請改名或先刪除舊的金鑰",
                )
            new_id = cursor.lastrowid
            cursor.execute("SELECT * FROM api_keys WHERE id = %s", (new_id,))
            row = cursor.fetchone()

    return _row_to_payload(row)


def delete_api_key(user_id: int, key_id: int) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM api_keys WHERE id = %s AND user_id = %s",
                (key_id, user_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="找不到 API Key")
