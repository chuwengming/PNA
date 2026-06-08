"""
Discrete max of two discretized random variables: Z = max(X, Y).

See docs/definitions/05-max-operation.md
    docs/source/stochastic network analyisis.pdf §3.2.3
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, Tuple

import numpy as np

from api.analysis.convolution import _distribution_variance, _merge_key
from api.analysis.discretization import DiscretizedVariable, _validate


def max_operation(X: DiscretizedVariable, Y: DiscretizedVariable) -> DiscretizedVariable:
    """
    Maximum of independent discrete random variables: Z = max(X, Y).

    For every pair (v_i, p_i) from X and (v_j, q_j) from Y:
        support z = max(v_i, v_j)  with  mass p_i * q_j
    Equal z values merge by summing probabilities (NOT element-wise max).

    Parameters
    ----------
    X, Y:
        Discretized variables from ``discretization()`` or prior stochastic ops.

    Returns
    -------
    DiscretizedVariable
        Z with ``method="max"``; mean and std_dev derived from the result distribution.
    """
    mass: Dict[float, float] = defaultdict(float)

    for xi, pi in zip(X.values, X.probabilities):
        for yj, qj in zip(Y.values, Y.probabilities):
            z = _merge_key(max(xi, yj))
            mass[z] += pi * qj

    sorted_values = sorted(mass.keys())
    probabilities = tuple(mass[v] for v in sorted_values)
    values = tuple(sorted_values)

    target_mean = float(np.dot(probabilities, values))
    variance = _distribution_variance(values, probabilities)

    result = DiscretizedVariable(
        mean=target_mean,
        std_dev=float(np.sqrt(max(variance, 0.0))),
        probabilities=probabilities,
        values=values,
        method="max",
    )
    _validate(result, target_mean)
    return result
