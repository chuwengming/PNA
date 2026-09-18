"""
MCP tool implementations. Executed on the PNA FastAPI process, not by the agent.

Hermes (or any MCP client) only invokes these names; CPA / Find Paths / validation
stay in the existing Python modules.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Union

from pydantic import BaseModel, ConfigDict, Field


class PlanningNodeSpec(BaseModel):
    """AoN planning node. Runtime fields (finishFlag, output) are ignored."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: int = Field(ge=0, description="Node id; the set must be 0..N-1")
    precNode: List[int] = Field(
        default_factory=list,
        alias="prec_node",
        description="Predecessor node ids (incoming AoN arcs)",
    )
    nodeTime: float = Field(
        default=0.0,
        alias="node_time",
        description="Activity duration (planning mean); must be >= 0",
    )


PlanningNodeInput = Union[PlanningNodeSpec, Dict[str, Any]]
RequestSpec = Dict[str, Any]


def _select_nodes(
    nodes: Optional[Sequence[PlanningNodeInput]],
    node: Optional[Sequence[PlanningNodeInput]],
) -> Optional[Sequence[PlanningNodeInput]]:
    if node is not None:
        return node
    return nodes


def _apply_request_flags(
    request: Optional[RequestSpec],
    longest: bool,
    shortest: bool,
    enumerate_paths: bool,
    enumeratePaths: Optional[bool],
) -> tuple[bool, bool, bool]:
    flags = request if isinstance(request, dict) else {}
    if "longest" in flags:
        longest = bool(flags["longest"])
    if "shortest" in flags:
        shortest = bool(flags["shortest"])
    if "enumeratePaths" in flags:
        enumerate_paths = bool(flags["enumeratePaths"])
    elif "enumerate_paths" in flags:
        enumerate_paths = bool(flags["enumerate_paths"])
    if enumeratePaths is not None:
        enumerate_paths = enumeratePaths
    return longest, shortest, enumerate_paths


def _node_to_spec(node: PlanningNodeInput) -> PlanningNodeSpec:
    if isinstance(node, PlanningNodeSpec):
        return node
    if not isinstance(node, dict):
        raise ValueError("each node must be an object with id, precNode, nodeTime")
    return PlanningNodeSpec.model_validate(node)


def _to_node_inputs(nodes: Sequence[PlanningNodeInput]):
    from api.index import NodeInput

    parsed: List[Any] = []
    for raw in nodes:
        spec = _node_to_spec(raw)
        parsed.append(
            NodeInput(
                id=spec.id,
                precNode=list(spec.precNode),
                nodeTime=float(spec.nodeTime),
                finishFlag=False,
                output=None,
            )
        )
    return parsed


def _path_duration(path: Sequence[int], node_times: Sequence[float]) -> float:
    total = 0.0
    for node_id in path:
        if node_id < 0 or node_id >= len(node_times):
            raise ValueError(f"path references missing node id {node_id}")
        total += float(node_times[node_id])
    return total


def validate_network(
    nodes: Optional[List[PlanningNodeInput]] = None,
    node: Optional[List[PlanningNodeInput]] = None,
    request: Optional[RequestSpec] = None,
) -> Dict[str, Any]:
    """Validate a PNA Activity-on-Node planning network.

    Call this before analyze_project_network when converting a diagram to JSON.
    Send JSON in two parts: node (planning array) and optional request.
    Prefer argument name `node`; `nodes` is accepted as an alias.
    Each item needs id, precNode (predecessor ids), and nodeTime (duration).
    IDs must be 0..N-1 (N between 2 and 50). Node 0 must have an empty precNode.
    Node N-1 is the unique sink and must not appear in anyone's precNode.
    Predecessor ids must be smaller than the node id. Every node except the sink
    must be referenced. Do not send finishFlag, output, graph, apiKey, or userId.

    Returns success, passed, errors, and nodeCount. This function runs on PNA.
    """
    from api.index import validate_node_inputs

    del request
    nodes = list(_select_nodes(nodes, node) or [])
    if not isinstance(nodes, list) or not nodes:
        return {
            "success": False,
            "passed": False,
            "errors": ["nodes 必須是非空陣列"],
            "nodeCount": 0,
        }

    try:
        node_inputs = _to_node_inputs(nodes)
    except Exception as exc:
        return {
            "success": False,
            "passed": False,
            "errors": [f"節點 JSON 無法解析: {exc}"],
            "nodeCount": 0,
        }

    errors = validate_node_inputs(node_inputs)
    passed = len(errors) == 0
    return {
        "success": passed,
        "passed": passed,
        "errors": errors,
        "nodeCount": len(node_inputs),
    }


def analyze_project_network(
    nodes: Optional[List[PlanningNodeInput]] = None,
    node: Optional[List[PlanningNodeInput]] = None,
    request: Optional[RequestSpec] = None,
    longest: bool = True,
    shortest: bool = True,
    enumerate_paths: bool = True,
    enumeratePaths: Optional[bool] = None,
) -> Dict[str, Any]:
    """Compute longest/shortest critical paths and all start-to-end paths.

    PNA executes this (CPA + Find Paths). The agent must not compute paths itself.
    Send JSON in two parts: node (same planning array as validate_network) and
    request ({longest, shortest, enumeratePaths}). Prefer `node` + `request`;
    top-level flags and `nodes` remain aliases.
    The network is validated first with the same rules as validate_network.
    Nothing is saved to the database. Graph images are not returned.

    Path duration is the sum of nodeTime along that path.
    """
    nodes = list(_select_nodes(nodes, node) or [])
    longest, shortest, enumerate_paths = _apply_request_flags(
        request, longest, shortest, enumerate_paths, enumeratePaths
    )
    from api.analysis.find_paths import FindPathError, run_find_paths
    from api.analysis.lcta import LCTAError, run_cpa
    from api.network.ets_node import ets_nodes_from_planning

    check = validate_network(nodes)
    if not check["passed"]:
        return {
            "success": False,
            "passed": False,
            "errors": check["errors"],
            "nodeCount": check["nodeCount"],
        }

    node_inputs = _to_node_inputs(nodes)
    ordered = sorted(node_inputs, key=lambda item: item.id)
    prec_nodes = [list(item.precNode) for item in ordered]
    node_times = [float(item.nodeTime) for item in ordered]
    node_count = len(ordered)

    payload: Dict[str, Any] = {
        "success": True,
        "passed": True,
        "errors": [],
        "nodeCount": node_count,
        "rootNodeId": node_count - 1,
    }

    def fresh_network():
        return ets_nodes_from_planning(node_count, prec_nodes, node_times)

    try:
        if longest:
            result = run_cpa(
                fresh_network(),
                "longest",
                planning_means=node_times,
                refresh=True,
            )
            payload["longest"] = {
                "criticalPath": list(result.critical_path),
                "totalExpectedTime": float(result.total_expected_time),
            }

        if shortest:
            result = run_cpa(
                fresh_network(),
                "shortest",
                planning_means=node_times,
                refresh=True,
            )
            payload["shortest"] = {
                "criticalPath": list(result.critical_path),
                "totalExpectedTime": float(result.total_expected_time),
            }

        if enumerate_paths:
            found = run_find_paths(
                fresh_network(),
                planning_means=node_times,
                refresh=True,
            )
            paths = []
            for path in found.paths:
                paths.append(
                    {
                        "nodes": list(path),
                        "duration": _path_duration(path, node_times),
                    }
                )
            payload["pathCount"] = found.path_count
            payload["paths"] = paths
    except (LCTAError, FindPathError, ValueError) as exc:
        return {
            "success": False,
            "passed": True,
            "errors": [str(exc)],
            "nodeCount": node_count,
        }

    return payload
