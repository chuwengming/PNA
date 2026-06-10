"""Tests for Find Path Algorithm."""

from __future__ import annotations

import pytest

from api.analysis.find_paths import FindPathError, record_path, record_total, run_find_paths
from api.network.ets_node import create_ets_node, prepare_network_for_find_paths


def _diamond_network():
    return [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0], 4.0),
        create_ets_node(2, [0], 6.0),
        create_ets_node(3, [1, 2], 2.0),
    ]


def _chain_network():
    return [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0], 5.0),
        create_ets_node(2, [1], 3.0),
    ]


def test_record_path_appends_node_at_end():
    nodes = _chain_network()
    prepare_network_for_find_paths(nodes)
    nodes[0].total_sequence = [[0]]
    record_path(nodes, 1, 0)
    assert nodes[1].path_sequence[0] == [[0, 1]]
    assert nodes[1].path_flag[0] == 1


def test_record_total_merges_path_sequence():
    nodes = _diamond_network()
    prepare_network_for_find_paths(nodes)
    nodes[3].path_sequence = [[[0, 1, 3]], [[0, 2, 3]]]
    record_total(nodes, 3)
    assert nodes[3].total_sequence == [[0, 1, 3], [0, 2, 3]]


def test_find_paths_diamond():
    nodes = _diamond_network()
    result = run_find_paths(nodes, planning_means=[0.0, 4.0, 6.0, 2.0])
    assert result.path_count == 2
    assert sorted(result.paths) == sorted([[0, 1, 3], [0, 2, 3]])


def test_find_paths_chain():
    nodes = _chain_network()
    result = run_find_paths(nodes, planning_means=[0.0, 5.0, 3.0])
    assert result.path_count == 1
    assert result.paths == [[0, 1, 2]]


def test_find_paths_single_edge():
    nodes = [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0], 1.0),
    ]
    result = run_find_paths(nodes)
    assert result.paths == [[0, 1]]


def test_find_paths_shared_start_revisit():
    """0→1→3 and 0→2→1→3: node 0 revisited when tracing second branch."""
    nodes = [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0, 2], 1.0),
        create_ets_node(2, [0], 2.0),
        create_ets_node(3, [1], 1.0),
    ]
    result = run_find_paths(nodes)
    assert result.path_count == 2
    assert sorted(result.paths) == sorted([[0, 1, 3], [0, 2, 1, 3]])


def test_find_paths_too_few_nodes():
    with pytest.raises(FindPathError):
        run_find_paths([create_ets_node(0, [], 0.0)])
