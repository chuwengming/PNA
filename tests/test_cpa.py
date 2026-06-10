"""Tests for CPA (Critical Path Analysis)."""

from __future__ import annotations

import pytest

from api.analysis.lcta import LCTAError, extract_critical_path, run_cpa, sdo
from api.network.ets_node import create_ets_node
from api.network.stochastic import stochastic_from_dict, stochastic_to_dict
from api.analysis.discretization import discretization


def _diamond_network():
    """0 -> 1 (t=4), 0 -> 2 (t=6), merge at 3 (t=2)."""
    return [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0], 4.0),
        create_ets_node(2, [0], 6.0),
        create_ets_node(3, [1, 2], 2.0),
    ]


def test_sdo_reorders_by_expected_path_time():
    node = create_ets_node(3, [1, 2, 4], 2.0)
    node.path_flag = [1, 1, 1]
    node.path_time = [
        stochastic_to_dict(discretization(3.0)),
        stochastic_to_dict(discretization(7.0)),
        stochastic_to_dict(discretization(1.0)),
    ]
    sdo(node, "longest")
    assert node.prec_node == [4, 1, 2]


def test_cpa_longest_diamond():
    nodes = _diamond_network()
    result = run_cpa(nodes, "longest", planning_means=[0.0, 4.0, 6.0, 2.0])
    assert result.critical_path[0] == 0
    assert result.critical_path[-1] == 3
    assert 2 in result.critical_path
    assert result.total_expected_time == pytest.approx(8.0, abs=0.5)


def test_cpa_shortest_diamond():
    nodes = _diamond_network()
    result = run_cpa(nodes, "shortest", planning_means=[0.0, 4.0, 6.0, 2.0])
    assert result.critical_path[0] == 0
    assert result.critical_path[-1] == 3
    assert 1 in result.critical_path
    assert result.total_expected_time == pytest.approx(6.0, abs=0.5)


def test_extract_critical_path_chain():
    nodes = [
        create_ets_node(0, [], 0.0),
        create_ets_node(1, [0], 5.0),
        create_ets_node(2, [1], 3.0),
    ]
    for n in nodes:
        n.prec_node = list(n.prec_node)
    path = extract_critical_path(nodes, 2)
    assert path == [0, 1, 2]


def test_cpa_invalid_mode():
    with pytest.raises(LCTAError):
        run_cpa(_diamond_network(), "invalid")  # type: ignore[arg-type]
