"""
Find Path Algorithm — enumerate all start→root paths via LCTA-style tracing.

See docs/source/完成路徑數量演算法.pdf
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from api.network.ets_node import ETSNode, prepare_network_for_find_paths


class FindPathError(Exception):
    """Invalid network state or tracing failure during path enumeration."""


PathList = List[List[int]]


@dataclass
class FindPathResult:
    """Outcome of Find Path Algorithm (not persisted to DB)."""

    nodes: List[ETSNode]
    paths: PathList
    root_id: int

    @property
    def path_count(self) -> int:
        return len(self.paths)


@dataclass
class _FindPathStack:
    _labels: List[int] = field(default_factory=list)

    def push(self, node_id: int) -> None:
        self._labels.append(node_id)

    def pull(self) -> int:
        if not self._labels:
            raise FindPathError("Find-path stack underflow: no parent node to resume tracing")
        return self._labels.pop()


def record_path(nodes: List[ETSNode], j: int, k: int) -> None:
    """
    Extend predecessor k paths with node j (append) into Path_Sequence(j)[idx of k].

    Only the single branch k is processed.
    """
    node_j = nodes[j]
    node_k = nodes[k]
    node_j.sync_sequence_arrays()
    idx = node_j.prec_node.index(k)
    node_j.path_sequence[idx] = [path + [j] for path in node_k.total_sequence]
    node_j.path_flag[idx] = 1


def record_total(nodes: List[ETSNode], j: int) -> None:
    """Merge all Path_Sequence(j) entries into Total_Sequence(j)."""
    node_j = nodes[j]
    node_j.sync_sequence_arrays()
    merged: PathList = []
    for seq in node_j.path_sequence:
        merged.extend(seq)
    node_j.total_sequence = merged


class FindPathEngine:
    """
    LCTA-style tracer enumerating all completion paths (start=0, root=N-1).

    No stochastic / time computation; uses Path_Sequence and Total_Sequence only.
    """

    def __init__(self, nodes: List[ETSNode]):
        if len(nodes) < 2:
            raise FindPathError("Find-path requires at least 2 nodes (start and root)")
        self.nodes = nodes
        self.n = len(nodes)
        self.start = 0
        self.root = self.n - 1
        self.stack = _FindPathStack()

    def _root_finished(self) -> bool:
        return bool(self.nodes[self.root].finish_flag)

    def _next_unvisited_predecessor(self, j: int) -> Optional[int]:
        node = self.nodes[j]
        node.sync_sequence_arrays()
        for idx, pred_id in enumerate(node.prec_node):
            if node.path_flag[idx] == 0:
                return pred_id
        return None

    def _all_predecessors_visited(self, j: int) -> bool:
        node = self.nodes[j]
        node.sync_sequence_arrays()
        return len(node.prec_node) == 0 or all(flag == 1 for flag in node.path_flag)

    def downward_tracing(self, j: int) -> None:
        while not self._root_finished():
            node_j = self.nodes[j]

            if node_j.finish_flag:
                k = j
                j = self.stack.pull()
                record_path(self.nodes, j, k)
                self.upward_tracing(k, j)
                return

            if j == self.start:
                node_j.total_sequence = [[self.start]]
                node_j.finish_flag = True
                k = j
                j = self.stack.pull()
                record_path(self.nodes, j, k)
                self.upward_tracing(k, j)
                return

            self.stack.push(j)
            next_pred = self._next_unvisited_predecessor(j)
            if next_pred is None:
                raise FindPathError(
                    f"Downward tracing at node {j}: no unvisited predecessor and node not finished"
                )
            j = next_pred

    def upward_tracing(self, k: int, j: int) -> None:
        while not self._root_finished():
            if not self._all_predecessors_visited(j):
                self.stack.push(j)
                next_pred = self._next_unvisited_predecessor(j)
                if next_pred is None:
                    raise FindPathError(
                        f"Upward tracing at node {j}: expected unvisited predecessor"
                    )
                self.downward_tracing(next_pred)
                return

            record_total(self.nodes, j)
            self.nodes[j].finish_flag = True

            if j == self.root:
                return

            k = j
            j = self.stack.pull()
            record_path(self.nodes, j, k)


def run_find_paths(
    nodes: List[ETSNode],
    planning_means: Optional[List[float]] = None,
    *,
    refresh: bool = True,
) -> FindPathResult:
    """
    Enumerate all paths from start (0) to root (N-1).

    Results live in memory only (Total_Sequence at root); not written to DB.
    """
    if refresh:
        prepare_network_for_find_paths(nodes, planning_means)

    engine = FindPathEngine(nodes)
    engine.downward_tracing(engine.root)

    root = engine.nodes[engine.root]
    if not root.finish_flag:
        raise FindPathError("Find-path finished without completing root node")

    return FindPathResult(
        nodes=nodes,
        paths=[list(path) for path in root.total_sequence],
        root_id=engine.root,
    )
