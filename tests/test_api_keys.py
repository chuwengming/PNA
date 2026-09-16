"""User-issued MCP API key helpers."""

from __future__ import annotations

from contextlib import contextmanager

from api.api_keys import (
    API_KEY_PREFIX,
    authorize_mcp_bearer,
    generate_api_key,
    hash_api_key,
    lookup_key_hash,
)


def test_generated_key_is_hashed_stably():
    token = generate_api_key()
    assert token.startswith(API_KEY_PREFIX)
    assert hash_api_key(token) == hash_api_key(token)
    assert hash_api_key(token) != hash_api_key(token + "x")
    assert len(hash_api_key(token)) == 64


def test_env_mcp_key_still_authorizes(monkeypatch):
    monkeypatch.setenv("MCP_API_KEY", "ops-fallback-secret")
    ok, status, _ = authorize_mcp_bearer("Bearer ops-fallback-secret")
    assert ok is True
    assert status == 200


def test_wrong_bearer_is_unauthorized(monkeypatch):
    monkeypatch.setenv("MCP_API_KEY", "ops-fallback-secret")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("MYSQL_URL", raising=False)
    monkeypatch.delenv("MYSQL_HOST", raising=False)
    ok, status, _ = authorize_mcp_bearer("Bearer other-secret")
    assert ok is False
    assert status == 401


def test_no_env_and_no_mysql_is_unavailable(monkeypatch):
    monkeypatch.delenv("MCP_API_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("MYSQL_URL", raising=False)
    monkeypatch.delenv("MYSQL_HOST", raising=False)
    ok, status, message = authorize_mcp_bearer("Bearer anything")
    assert ok is False
    assert status == 503
    assert "MCP_API_KEY" in message


def test_db_key_hash_authorizes_without_env(monkeypatch):
    monkeypatch.delenv("MCP_API_KEY", raising=False)
    monkeypatch.setenv("MYSQL_HOST", "localhost")
    monkeypatch.setattr(
        "api.api_keys.lookup_key_hash",
        lambda token: "match" if token == "pna_user_issued_key" else "miss",
    )
    ok, status, _ = authorize_mcp_bearer("Bearer pna_user_issued_key")
    assert ok is True
    assert status == 200
    ok, status, _ = authorize_mcp_bearer("Bearer other-secret")
    assert ok is False
    assert status == 401


def test_mysql_store_failure_is_unavailable_not_unauthorized(monkeypatch):
    monkeypatch.delenv("MCP_API_KEY", raising=False)
    monkeypatch.setenv("MYSQL_HOST", "localhost")
    monkeypatch.setattr("api.api_keys.lookup_key_hash", lambda _token: "unavailable")
    ok, status, message = authorize_mcp_bearer("Bearer pna_user_issued_key")
    assert ok is False
    assert status == 503
    assert "key store" in message.lower()


def test_lookup_key_hash_db_error_is_unavailable(monkeypatch):
    monkeypatch.setenv("MYSQL_HOST", "localhost")

    @contextmanager
    def failing_db():
        raise RuntimeError("connection refused")
        yield

    monkeypatch.setattr("api.api_keys.db_connection", failing_db)
    assert lookup_key_hash("pna_user_issued_key") == "unavailable"
