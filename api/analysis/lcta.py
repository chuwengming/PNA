"""
Label Correction Tracing Algorithm (LCTA).

Post-order tracing with stack-based navigation and Shared_flag path-dependency
correction. See docs/source/LCTA追蹤程序.pdf and docs/definitions/08-lcta-path-dependency.md.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

SDOMode = Optional[Literal["longest", "shortest"]]

from api.analysis.convolution import convolution
from api.analysis.discretization import DiscretizedVariable
from api.analysis.max_operation import max_operation
from api.analysis.resample import resample
from api.network.ets_node import ETSNode, prepare_network_for_lcta
from api.network.stochastic import (
    initial_stochastic,
    mu_stochastic,
    stochastic_from_dict,
    stochastic_to_dict,
)


class LCTAError(Exception):
    """Invalid network state or tracing failure during LCTA."""


def sdo(node: ETSNode, mode: Literal["longest", "shortest"]) -> None:
    """
  Stochastic Duration Ordering SDO(i) per Critical Path Algorithm.pdf.

  Reorders Prec_Node, Path_Flag, Path_Time by E(Y_k^i) before max merge.
  longest: ascending (small→left, large→right); shortest: descending.
  """
    node.sync_path_arrays()
    if len(node.prec_node) <= 1:
        return

    indices = list(range(len(node.prec_node)))

    def path_expected(idx: int) -> float:
        return stochastic_from_dict(node.path_time[idx]).expected_value()

    indices.sort(key=path_expected, reverse=(mode == "shortest"))
    node.prec_node = [node.prec_node[i] for i in indices]
    node.path_flag = [node.path_flag[i] for i in indices]
    node.path_time = [node.path_time[i] for i in indices]


def extract_critical_path(nodes: List[ETSNode], root_id: int) -> List[int]:
    """Rightmost-edge path from root to start (0), returned start→root."""
    path: List[int] = []
    current = root_id
    while True:
        path.append(current)
        if current == 0:
            break
        node = nodes[current]
        node.sync_path_arrays()
        if not node.prec_node:
            raise LCTAError(f"Cannot trace critical path: node {current} has no predecessors")
        current = node.prec_node[-1]
    path.reverse()
    return path


def critical_path_expected_time(nodes: List[ETSNode], path: List[int]) -> float:
    """Sum of Node_Time planning means along the critical path."""
    return sum(nodes[node_id].node_time_mean for node_id in path)


@dataclass
class CPAResult:
    """Outcome of CPA (LCTA + SDO) for longest or shortest critical path."""

    nodes: List[ETSNode]
    critical_path: List[int]
    total_expected_time: float
    mode: Literal["longest", "shortest"]
    root_id: int


@dataclass
class LCTAResult:
    """Outcome of a full LCTA run."""

    nodes: List[ETSNode]
    completion_time: Dict[str, object]
    root_id: int

    @property
    def completion_mean(self) -> float:
        return float(self.completion_time.get("mean", 0.0))


@dataclass
class _LCTAStack:
    """Node-label stack for push_stack / pull_stack navigation."""

    _labels: List[int] = field(default_factory=list)

    def push(self, node_id: int) -> None:
        self._labels.append(node_id)

    def pull(self) -> int:
        if not self._labels:
            raise LCTAError("LCTA stack underflow: no parent node to resume tracing")
        return self._labels.pop()


class LCTAEngine:
    """
    LCTA tracer over an in-memory ETS network.

    Conventions: start node = 0, root = N - 1.
  """

    def __init__(self, nodes: List[ETSNode], *, sdo_mode: SDOMode = None):
        if len(nodes) < 2:
            raise LCTAError("LCTA requires at least 2 nodes (start and root)")
        self.nodes = nodes
        self.n = len(nodes)
        self.start = 0
        self.root = self.n - 1
        self.stack = _LCTAStack()
        self.shared_flag = 0
        self.sdo_mode = sdo_mode

    def _root_finished(self) -> bool:
        return bool(self.nodes[self.root].finish_flag)

    def _prec_index(self, j: int, k: int) -> int:
        try:
            return self.nodes[j].prec_node.index(k)
        except ValueError as exc:
            raise LCTAError(f"Node {k} is not a predecessor of node {j}") from exc

    def _next_unvisited_predecessor(self, j: int) -> Optional[int]:
        node = self.nodes[j]
        node.sync_path_arrays()
        for idx, pred_id in enumerate(node.prec_node):
            if node.path_flag[idx] == 0:
                return pred_id
        return None

    def _apply_drt(self, var: DiscretizedVariable) -> DiscretizedVariable:
        return resample(var)

    def _max_path_times(self, j: int) -> DiscretizedVariable:
        node = self.nodes[j]
        node.sync_path_arrays()
        if not node.prec_node:
            raise LCTAError(f"Node {j} has no predecessors for max merge")
        merged = stochastic_from_dict(node.path_time[0])
        for pt in node.path_time[1:]:
            merged = max_operation(merged, stochastic_from_dict(pt))
        return merged

    def downward_tracing(self, j: int) -> None:
        """Descend along the leftmost unvisited predecessor chain (post-order)."""
        while not self._root_finished():
            node_j = self.nodes[j]

            if node_j.finish_flag:
                self.shared_flag = 1
                k = j
                j = self.stack.pull()
                self.upward_tracing(k, j)
                return

            if j == self.start:
                node_j.output = initial_stochastic()
                node_j.finish_flag = True
                k = j
                j = self.stack.pull()
                self.upward_tracing(k, j)
                return

            self.stack.push(j)
            next_pred = self._next_unvisited_predecessor(j)
            if next_pred is None:
                raise LCTAError(
                    f"Downward tracing at node {j}: no unvisited predecessor and node not finished"
                )
            j = next_pred

    def upward_tracing(self, k: int, j: int) -> None:
        """Ascend from child k to parent j; merge or branch to sibling predecessors."""
        while not self._root_finished():
            node_j = self.nodes[j]
            node_k = self.nodes[k]

            idx = self._prec_index(j, k)
            if self.shared_flag == 1:
                y_var = stochastic_from_dict(mu_stochastic(node_k.output))
                self.shared_flag = 0
            else:
                y_var = stochastic_from_dict(node_k.output)

            # Mark predecessor branch visited (including shared / duplicate paths).
            node_j.path_flag[idx] = 1

            y_var = self._apply_drt(y_var)
            node_j.path_time[idx] = stochastic_to_dict(y_var)

            next_pred = self._next_unvisited_predecessor(j)
            if next_pred is not None:
                self.stack.push(j)
                self.downward_tracing(next_pred)
                return

            if len(node_j.prec_node) > 1 and self.sdo_mode is not None:
                sdo(node_j, self.sdo_mode)

            merged = self._max_path_times(j)
            node_time_var = stochastic_from_dict(node_j.node_time)
            output_var = convolution(merged, node_time_var)
            output_var = self._apply_drt(output_var)
            node_j.output = stochastic_to_dict(output_var)
            node_j.finish_flag = True

            if j == self.root:
                return

            k = j
            j = self.stack.pull()


def run_lcta(
    nodes: List[ETSNode],
    planning_means: Optional[List[float]] = None,
    *,
    refresh: bool = True,
) -> LCTAResult:
    """
    Execute LCTA on an in-memory ETS network.

    Parameters
    ----------
    nodes:
        ETS node list (IDs 0 .. N-1).
    planning_means:
        User Node_Time means; used on refresh. If omitted, uses each node's current mean.
    refresh:
        When True (default), reset runtime fields and Chebyshev-discretize Node_Time.
    """
    if refresh:
        prepare_network_for_lcta(nodes, planning_means)

    engine = LCTAEngine(nodes)
    engine.downward_tracing(engine.root)

    if not engine.nodes[engine.root].finish_flag:
        raise LCTAError("LCTA finished without computing root node output")

    root = engine.nodes[engine.root]
    return LCTAResult(
        nodes=nodes,
        completion_time=dict(root.output),
        root_id=engine.root,
    )


def run_cpa(
    nodes: List[ETSNode],
    mode: Literal["longest", "shortest"],
    planning_means: Optional[List[float]] = None,
    *,
    refresh: bool = True,
) -> CPAResult:
    """
    Critical Path Analysis: LCTA with SDO(i) before each max merge.

    See docs/source/Critical Path Algorithm.pdf.
    """
    if mode not in ("longest", "shortest"):
        raise LCTAError("CPA mode must be 'longest' or 'shortest'")

    if refresh:
        prepare_network_for_lcta(nodes, planning_means)

    engine = LCTAEngine(nodes, sdo_mode=mode)
    engine.downward_tracing(engine.root)

    if not engine.nodes[engine.root].finish_flag:
        raise LCTAError("CPA finished without computing root node output")

    critical_path = extract_critical_path(nodes, engine.root)
    total_time = critical_path_expected_time(nodes, critical_path)

    return CPAResult(
        nodes=nodes,
        critical_path=critical_path,
        total_expected_time=total_time,
        mode=mode,
        root_id=engine.root,
    )
