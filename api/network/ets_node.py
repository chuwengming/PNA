"""
Expanded Tree Structure (ETS) node — 擴張樹節點資料結構.

See docs/definitions/07-ets-node-structure.md
    docs/source/節點資料結構.pdf
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from api.network.stochastic import (
    compact_output_from_dict,
    compact_output_notation,
    default_compact_output,
    initial_stochastic,
    node_time_mean,
    stochastic_from_mean,
    stochastic_to_dict,
)


class ETSNode:
    """
    ETS node i fields (Table 1):
      Node(i), Prec_Node(i), finish_flag_i, Output_i,
      Path_Flag(i), Path_Time(i), Node_Time(i)
    """

    def __init__(self, node_id: int):
        if not isinstance(node_id, int) or node_id < 0:
            raise ValueError("node_id must be a non-negative integer")
        self._id = node_id
        self.prec_node: List[int] = []
        self.finish_flag: bool = False
        self.output: Dict[str, Any] = initial_stochastic()
        self.path_flag: List[int] = []
        self.path_time: List[Dict[str, Any]] = []
        self.node_time: Dict[str, Any] = initial_stochastic()

    @property
    def id(self) -> int:
        return self._id

    @property
    def node_time_mean(self) -> float:
        return node_time_mean(self.node_time)

    def sync_path_arrays(self) -> None:
        """Keep Path_Flag / Path_Time length aligned with Prec_Node."""
        n = len(self.prec_node)
        while len(self.path_flag) < n:
            self.path_flag.append(0)
        self.path_flag = self.path_flag[:n]
        while len(self.path_time) < n:
            self.path_time.append(initial_stochastic())
        self.path_time = self.path_time[:n]

    def set_prec_node(self, predecessors: List[int]) -> None:
        self.prec_node = sorted(predecessors)
        self.sync_path_arrays()

    def set_node_time_mean(self, mean: float) -> None:
        self.node_time = stochastic_from_mean(float(mean))

    def reset_runtime_state(self) -> None:
        """Reset algorithm runtime fields; keep topology and Node_Time."""
        self.finish_flag = False
        self.output = initial_stochastic()
        self.sync_path_arrays()
        self.path_flag = [0] * len(self.prec_node)
        self.path_time = [initial_stochastic() for _ in self.prec_node]

    def to_dict(self) -> Dict[str, Any]:
        self.sync_path_arrays()
        return {
            "id": self.id,
            "precNode": list(self.prec_node),
            "nodeTime": round(self.node_time_mean, 2),
            "nodeTimeVar": self.node_time,
            "finishFlag": self.finish_flag,
            "output": self.output,
            "pathFlag": list(self.path_flag),
            "pathTime": list(self.path_time),
        }

    def to_api_node(self, *, compact_output: bool = True) -> Dict[str, Any]:
        """API payload for frontend tables (Output as [E, Var] when compact_output=True)."""
        d = self.to_dict()
        if compact_output:
            summary = compact_output_from_dict(d["output"])
            return {
                "id": d["id"],
                "precNode": d["precNode"],
                "nodeTime": d["nodeTime"],
                "finishFlag": d["finishFlag"],
                "output": summary,
                "outputNotation": compact_output_notation(summary["mean"], summary["variance"]),
            }
        return {
            "id": d["id"],
            "precNode": d["precNode"],
            "nodeTime": d["nodeTime"],
            "finishFlag": d["finishFlag"],
            "output": d["output"],
            "outputNotation": compact_output_notation(
                compact_output_from_dict(d["output"])["mean"],
                compact_output_from_dict(d["output"])["variance"],
            ),
        }


def create_ets_node(node_id: int, prec_node: Optional[List[int]] = None, node_time_mean: float = 0.0) -> ETSNode:
    node = ETSNode(node_id)
    node.set_prec_node(list(prec_node or []))
    node.set_node_time_mean(node_time_mean)
    node.reset_runtime_state()
    return node


def ets_nodes_from_planning(
    node_count: int,
    prec_nodes: List[List[int]],
    node_times: List[float],
) -> List[ETSNode]:
    nodes = []
    for i in range(node_count):
        n = create_ets_node(i, prec_nodes[i], float(node_times[i]))
        nodes.append(n)
    return nodes


def default_finish_flags(node_count: int) -> List[bool]:
    return [False] * node_count


def default_outputs(node_count: int) -> List[Dict[str, Any]]:
    """Default compact outputs for DB (planning phase)."""
    return [default_compact_output() for _ in range(node_count)]


def default_path_flags(prec_nodes: List[List[int]]) -> List[List[int]]:
    return [[0] * len(prec) for prec in prec_nodes]


def default_path_times(prec_nodes: List[List[int]]) -> List[List[Dict[str, Any]]]:
    return [[initial_stochastic() for _ in prec] for prec in prec_nodes]


def prepare_network_for_lcta(
    nodes: List[ETSNode],
    planning_means: Optional[List[float]] = None,
) -> None:
    """
    Reset ETS runtime fields and discretize Node_Time (Chebyshev 5-point) before LCTA.

    Preserves ``prec_node``; uses ``planning_means`` when supplied, else current mean.
    """
    for i, node in enumerate(nodes):
        mean = float(planning_means[i]) if planning_means is not None else node.node_time_mean
        node.reset_runtime_state()
        node.set_node_time_mean(mean)
