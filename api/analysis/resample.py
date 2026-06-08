"""
Discrete Resample Technique (DRT) per 離散化重新取樣技術.pdf.

See docs/definitions/06-resample.md
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np

from api.analysis.convolution import _distribution_variance
from api.analysis.discretization import (
    MEAN_TOLERANCE,
    DiscretizedVariable,
    _initial_value_discretization,
    _validate,
)

# Trigger when support count exceeds this value (PDF: execute DRT when count > S).
RESAMPLE_THRESHOLD: int = 100

# Target number of intervals / sample units after resampling (PDF equation 3.11).
RESAMPLE_TARGET_SIZE: int = 10


def needs_resample(Z: DiscretizedVariable, threshold: int = RESAMPLE_THRESHOLD) -> bool:
    """True when support size exceeds ``threshold`` (default 100)."""
    return len(Z.values) > threshold


def _bin_index(z: float, z_min: float, z_max: float, delta: float, s: int) -> int:
    """Map sample value to 0-based interval index (PDF eq. 3.12)."""
    if z <= z_min:
        return 0
    if z >= z_max:
        return s - 1
    k = int(np.ceil((float(z) - z_min) / delta - 1e-12))
    return min(max(k - 1, 0), s - 1)


def _drt_interval_resample(
    values: Tuple[float, ...],
    probabilities: Tuple[float, ...],
    target_size: int,
) -> Tuple[Tuple[float, ...], Tuple[float, ...]]:
    """
    PDF DRT: partition [z_min, z_max] into S intervals (eq. 3.12–3.14).

    Non-empty interval k:
        p'_k = sum(p_d),  z'_k = sum(z_d * p_d) / p'_k
    Empty interval k:
        p'_k = 0,  z'_k = z_min + (k - 0.5) * delta
    """
    s = target_size
    if s < 1:
        raise ValueError("target_size must be at least 1")

    z_min = float(min(values))
    z_max = float(max(values))
    delta = (z_max - z_min) / s

    bin_values: List[List[float]] = [[] for _ in range(s)]
    bin_probs: List[List[float]] = [[] for _ in range(s)]

    if delta <= MEAN_TOLERANCE:
        # All support on one value — entire mass in bin 1 (eq. 3.13).
        bin_values[0] = list(values)
        bin_probs[0] = list(probabilities)
    else:
        for z, p in zip(values, probabilities):
            idx = _bin_index(float(z), z_min, z_max, delta, s)
            bin_values[idx].append(float(z))
            bin_probs[idx].append(float(p))

    new_values: List[float] = []
    new_probs: List[float] = []

    for k in range(s):
        if bin_probs[k]:
            mass = float(sum(bin_probs[k]))
            weighted = float(sum(z * pr for z, pr in zip(bin_values[k], bin_probs[k])))
            new_values.append(weighted / mass)
            new_probs.append(mass)
        else:
            # Eq. 3.14: empty interval → center of bin, zero probability.
            new_values.append(z_min + (k + 0.5) * delta)
            new_probs.append(0.0)

    return tuple(new_values), tuple(new_probs)


def resample(
    Z: DiscretizedVariable,
    threshold: int = RESAMPLE_THRESHOLD,
    target_size: int = RESAMPLE_TARGET_SIZE,
) -> DiscretizedVariable:
    """
    Discrete Resample Technique (DRT) when ``len(Z.values) > threshold``.

    Partitions the current distribution into ``target_size`` equal-width intervals
    on [z_min, z_max], aggregates probability mass per interval (eq. 3.13), and
    uses interval centers for empty bins (eq. 3.14). Preserves **expected value**
    exactly when every original point falls into exactly one bin.

    Default: threshold=100, target_size=10 (per project specification).
    """
    if threshold < 1:
        raise ValueError("threshold must be at least 1")
    if target_size < 1:
        raise ValueError("target_size must be at least 1")

    if not needs_resample(Z, threshold):
        return Z

    mu = Z.expected_value()

    if abs(mu) <= MEAN_TOLERANCE and all(abs(v) <= MEAN_TOLERANCE for v in Z.values):
        result = _initial_value_discretization()
        _validate(result, 0.0)
        return result

    values, probabilities = _drt_interval_resample(Z.values, Z.probabilities, target_size)
    variance = _distribution_variance(values, probabilities)

    result = DiscretizedVariable(
        mean=mu,
        std_dev=float(np.sqrt(max(variance, 0.0))),
        probabilities=probabilities,
        values=values,
        method="drt",
    )
    _validate(result, mu)
    return result
