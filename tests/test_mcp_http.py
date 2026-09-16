"""HTTP auth for the /mcp mount."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def mcp_client():
    import os

    saved = {
        key: os.environ.get(key)
        for key in ("MCP_API_KEY", "DATABASE_URL", "MYSQL_URL", "MYSQL_HOST")
    }
    os.environ["MCP_API_KEY"] = "test-mcp-secret-key-32chars-long!"
    for key in ("DATABASE_URL", "MYSQL_URL", "MYSQL_HOST"):
        os.environ.pop(key, None)
    from api.index import app

    with TestClient(app) as client:
        yield client

    for key, value in saved.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def test_mcp_rejects_missing_bearer(mcp_client):
    response = mcp_client.post("/mcp", json={})
    assert response.status_code == 401
    assert response.json()["message"] == "Unauthorized"


def test_mcp_rejects_wrong_bearer(mcp_client):
    response = mcp_client.post(
        "/mcp",
        json={},
        headers={"Authorization": "Bearer wrong-key"},
    )
    assert response.status_code == 401


def test_mcp_accepts_valid_bearer_for_jsonrpc(mcp_client):
    response = mcp_client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {}},
        headers={
            "Authorization": "Bearer test-mcp-secret-key-32chars-long!",
            "Accept": "application/json, text/event-stream",
        },
    )
    assert response.status_code != 401
    assert response.status_code != 503


def test_mcp_bearer_helper_requires_configured_key(monkeypatch):
    monkeypatch.delenv("MCP_API_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("MYSQL_URL", raising=False)
    monkeypatch.delenv("MYSQL_HOST", raising=False)
    from api.api_keys import authorize_mcp_bearer

    ok, status, message = authorize_mcp_bearer("Bearer anything")
    assert ok is False
    assert status == 503
    assert "MCP_API_KEY" in message


def _mcp_sse_payload(response) -> dict:
    for line in response.text.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    raise AssertionError(response.text)


def test_mcp_tools_list_only_two_tools(mcp_client):
    response = mcp_client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        headers={
            "Authorization": "Bearer test-mcp-secret-key-32chars-long!",
            "Accept": "application/json, text/event-stream",
        },
    )
    assert response.status_code == 200
    payload = _mcp_sse_payload(response)
    names = sorted(tool["name"] for tool in payload["result"]["tools"])
    assert names == ["analyze_project_network", "validate_network"]
