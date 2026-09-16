"""FastMCP HTTP app mounted at /mcp. Tools run inside PNA (FastAPI)."""

from __future__ import annotations

from typing import Any, Optional

from api.mcp_tools import analyze_project_network, validate_network

mcp_asgi_app: Any = None

try:
    from fastmcp import FastMCP
except ImportError:
    FastMCP = None  # type: ignore[misc, assignment]
    mcp = None
else:
    mcp = FastMCP(
        name="PNA",
        instructions=(
            "Project Network Analysis (PNA) server. "
            "The agent converts an AoN network diagram into JSON; "
            "these tools validate that JSON and compute paths on PNA. "
            "Do not invent path results. Do not send apiKey or userId."
        ),
    )
    mcp.tool(validate_network, name="validate_network")
    mcp.tool(analyze_project_network, name="analyze_project_network")
    mcp_asgi_app = mcp.http_app(
        path="/",
        transport="streamable-http",
        stateless_http=True,
    )


def get_mcp_asgi_app() -> Optional[Any]:
    return mcp_asgi_app
