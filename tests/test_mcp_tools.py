"""MCP planning tools (executed by PNA, invoked by Hermes)."""

from __future__ import annotations

from api.mcp_tools import analyze_project_network, validate_network


def _diamond_nodes():
    return [
        {"id": 0, "precNode": [], "nodeTime": 0},
        {"id": 1, "precNode": [0], "nodeTime": 4},
        {"id": 2, "precNode": [0], "nodeTime": 6},
        {"id": 3, "precNode": [1, 2], "nodeTime": 2},
    ]


def test_validate_network_accepts_diamond():
    result = validate_network(_diamond_nodes())
    assert result["passed"] is True
    assert result["errors"] == []
    assert result["nodeCount"] == 4


def test_validate_network_rejects_forward_reference():
    result = validate_network(
        [
            {"id": 0, "precNode": [], "nodeTime": 0},
            {"id": 1, "precNode": [2], "nodeTime": 1},
            {"id": 2, "precNode": [0], "nodeTime": 1},
        ]
    )
    assert result["passed"] is False
    assert any("後序" in err or "循環" in err for err in result["errors"])


def test_validate_network_strips_runtime_fields():
    nodes = _diamond_nodes()
    nodes[1]["finishFlag"] = True
    nodes[1]["output"] = {"mean": 9, "variance": 1}
    result = validate_network(nodes)
    assert result["passed"] is True


def test_analyze_project_network_diamond_paths():
    result = analyze_project_network(_diamond_nodes())
    assert result["success"] is True
    assert result["longest"]["criticalPath"][0] == 0
    assert result["longest"]["criticalPath"][-1] == 3
    assert 2 in result["longest"]["criticalPath"]
    assert result["shortest"]["criticalPath"][0] == 0
    assert 1 in result["shortest"]["criticalPath"]
    assert result["pathCount"] == 2
    durations = sorted(item["duration"] for item in result["paths"])
    assert durations == [6.0, 8.0]
    assert "graph" not in result


def test_analyze_project_network_enumerate_paths_alias():
    result = analyze_project_network(
        _diamond_nodes(),
        longest=False,
        shortest=False,
        enumerate_paths=False,
        enumeratePaths=True,
    )
    assert result["success"] is True
    assert "longest" not in result
    assert result["pathCount"] == 2


def test_analyze_project_network_returns_validation_errors():
    result = analyze_project_network([{"id": 0, "precNode": [], "nodeTime": 0}])
    assert result["success"] is False
    assert result["passed"] is False
    assert result["errors"]


def test_validate_network_accepts_node_alias():
    result = validate_network(node=_diamond_nodes(), request={})
    assert result["passed"] is True
    assert result["nodeCount"] == 4


def test_analyze_project_network_node_and_request():
    result = analyze_project_network(
        node=_diamond_nodes(),
        request={"longest": True, "shortest": False, "enumeratePaths": False},
    )
    assert result["success"] is True
    assert "longest" in result
    assert "shortest" not in result
    assert "paths" not in result
