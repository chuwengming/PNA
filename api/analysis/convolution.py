"""
Discrete convolution of two discretized random variables (Z = X + Y).

See docs/definitions/04-convolution.md
    docs/source/stochastic network analyisis.pdf §3.2.3
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, Tuple

import numpy as np

from api.analysis.discretization import (
    MEAN_TOLERANCE,
    PROB_TOLERANCE,
    DiscretizedVariable,
    _validate,
)

VALUE_MERGE_DECIMALS = 10


def _merge_key(value: float) -> float:
    return round(float(value), VALUE_MERGE_DECIMALS)


def _distribution_variance(values: Tuple[float, ...], probabilities: Tuple[float, ...]) -> float:
    mean = float(np.dot(probabilities, values))
    return float(np.dot(probabilities, [(v - mean) ** 2 for v in values]))


def convolution(X: DiscretizedVariable, Y: DiscretizedVariable) -> DiscretizedVariable:
    """
    Sum of independent discrete random variables: Z = X + Y.

    For every pair (v_i, p_i) from X and (v_j, q_j) from Y:
        support z = v_i + v_j  with  mass p_i * q_j
    Equal z values merge by summing probabilities (NOT element-wise addition).

    Parameters
    ----------
    X, Y:
        Discretized variables from ``discretization()`` (or prior ``convolution()``).

    Returns
    -------
    DiscretizedVariable
        Z with ``method="convolution"``, E[Z] = E[X] + E[Y], typically wider support.
    """
    mass: Dict[float, float] = defaultdict(float)

    for xi, pi in zip(X.values, X.probabilities):
        for yj, qj in zip(Y.values, Y.probabilities):
            z = _merge_key(xi + yj)
            mass[z] += pi * qj

    sorted_values = sorted(mass.keys())
    probabilities = tuple(mass[v] for v in sorted_values)
    values = tuple(sorted_values)

    target_mean = X.expected_value() + Y.expected_value()
    variance = _distribution_variance(values, probabilities)

    result = DiscretizedVariable(
        mean=target_mean,
        std_dev=float(np.sqrt(max(variance, 0.0))),
        probabilities=probabilities,
        values=values,
        method="convolution",
    )
    _validate(result, target_mean)
    return result
