"""Tests for LCTA (Label Correction Tracing Algorithm)."""

from __future__ import annotations

import pytest

from api.analysis.lcta import LCTAError, run_lcta
from api.network.ets_node import create_ets_node


def _chain_network(means: list[float]):
    """Linear chain: 0 -> 1 -> ... -> N-1."""
    n = len(means)
    nodes = []
    for i in range(n):
        prec = [] if i == 0 else [i - 1]
        nodes.append(create_ets_node(i, prec, means[i]))
    return nodes


def test_lcta_two_node_chain():
    nodes = _chain_network([0.0, 10.0])
    result = run_lcta(nodes, planning_means=[0.0, 10.0])

    assert result.root_id == 1
    assert result.nodes[0].finish_flag is True
    assert result.nodes[1].finish_flag is True
    assert result.completion_mean == pytest.approx(10.0, abs=0.5)


def test_lcta_three_node_chain():
    nodes = _chain_network([0.0, 5.0, 8.0])
    result = run_lcta(nodes, planning_means=[0.0, 5.0, 8.0])

    assert result.root_id == 2
    assert result.completion_mean == pytest.approx(13.0, abs=1.0)


def test_lcta_diamond_network():
    """0 -> 1, 0 -> 2 -> 3 (merge at 3)."""
    nodes = [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0], 4.0),
        create_ets_node(2, [0], 6.0),
        create_ets_node(3, [1, 2], 2.0),
    ]
    result = run_lcta(nodes, planning_means=[0.0, 4.0, 6.0, 2.0])

    assert result.root_id == 3
    assert result.nodes[3].finish_flag is True
    # max(4, 6) + 2 ≈ 8
    assert result.completion_mean == pytest.approx(8.0, abs=1.5)
    assert all(flag == 1 for flag in result.nodes[3].path_flag)


def test_lcta_refresh_resets_runtime():
    nodes = _chain_network([0.0, 10.0])
    nodes[1].finish_flag = True
    nodes[1].output = {"values": [99.0], "probabilities": [1.0], "mean": 99.0, "stdDev": 0.0, "method": "test"}

    result = run_lcta(nodes, planning_means=[0.0, 10.0], refresh=True)
    assert result.completion_mean == pytest.approx(10.0, abs=0.5)


def test_lcta_requires_two_nodes():
    with pytest.raises(LCTAError):
        run_lcta([create_ets_node(0, [], 0.0)])
