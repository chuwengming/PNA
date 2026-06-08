"""
Chebyshev five-point discretization for normal random variables.

See docs/definitions/01-stochastic-random-variable.md
    docs/definitions/02-chebyshev-discretization.md
    docs/definitions/03-initial-value-single-sample.md
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

# Chebyshev five-point: offsets k in standard-deviation units
CHEBYSHEV_OFFSETS: Tuple[int, ...] = (-2, -1, 0, 1, 2)

# Fixed probability weights (sum = 1, weighted k-sum = 0 => E[X] = mu)
CHEBYSHEV_PROBABILITIES: Tuple[float, ...] = (0.05, 0.25, 0.40, 0.25, 0.05)

# Default sigma = Value / 6 when std_dev is not supplied
DEFAULT_STD_RATIO: float = 1.0 / 6.0

MEAN_TOLERANCE: float = 1e-6
PROB_TOLERANCE: float = 1e-9


@dataclass(frozen=True)
class DiscretizedVariable:
    """Discrete approximation of X ~ N(mu, sigma^2).

    Canonical notation (PDF): T = [v1, ..., vn : p1, ..., pn]
    Matrix rows: row 0 = values, row 1 = probabilities.
    """

    mean: float
    std_dev: float
    probabilities: Tuple[float, ...]
    values: Tuple[float, ...]
    method: str = "chebyshev_5"

    def expected_value(self) -> float:
        return float(np.dot(self.probabilities, self.values))

    def as_matrix(self) -> List[List[float]]:
        """Two-row matrix per project notation: [[v1..vn], [p1..pn]]."""
        return [list(self.values), list(self.probabilities)]

    def notation(self) -> str:
        """Canonical string: T = [v1, ..., vn : p1, ..., pn] (see docs/source)."""
        vals = ", ".join(f"{v:g}" for v in self.values)
        probs = ", ".join(f"{p:g}" for p in self.probabilities)
        return f"[{vals} : {probs}]"


def _default_std_dev(value: float) -> float:
    if value == 0.0:
        return 0.0
    return abs(value) * DEFAULT_STD_RATIO


def _chebyshev_values(mean: float, std_dev: float) -> Tuple[float, ...]:
    return tuple(mean + k * std_dev for k in CHEBYSHEV_OFFSETS)


def _cap_sigma_for_non_negative_support(mean: float, std_dev: float) -> float:
    """Ensure mu - 2*sigma >= 0 so all Chebyshev support points are non-negative."""
    if mean <= 0 or std_dev <= 0:
        return std_dev
    max_sigma = mean / 2.0
    return min(std_dev, max_sigma)


def _initial_value_discretization() -> DiscretizedVariable:
    """Single-sample degenerate form [0 : 1] for initial values (E[T]=0)."""
    return DiscretizedVariable(
        mean=0.0,
        std_dev=0.0,
        probabilities=(1.0,),
        values=(0.0,),
        method="initial",
    )


def discretization(
    value: float,
    std_dev: Optional[float] = None,
) -> DiscretizedVariable:
    """
    Discretize a normal random variable with mean ``value``.

    - ``value > 0``: Chebyshev five-point discretization.
    - ``value == 0``: single-point initial value ``[0 : 1]`` (see definition 03).

    Parameters
    ----------
    value:
        Static-environment constant (mean mu of N(mu, sigma^2)).
    std_dev:
        Standard deviation sigma. Defaults to ``abs(value) * DEFAULT_STD_RATIO`` (Value/6),
        or 0 when value is 0.

    Returns
    -------
    DiscretizedVariable
        probabilities and values with E[X] == value (within MEAN_TOLERANCE).
    """
    if not np.isfinite(value):
        raise ValueError("value must be a finite number")

    mu = float(value)
    if mu == 0.0:
        result = _initial_value_discretization()
        _validate(result, mu)
        return result

    sigma = float(std_dev) if std_dev is not None else _default_std_dev(mu)
    if sigma < 0:
        raise ValueError("std_dev must be non-negative")
    sigma = _cap_sigma_for_non_negative_support(mu, sigma)

    if sigma == 0.0:
        probs = CHEBYSHEV_PROBABILITIES
        vals = tuple(mu for _ in CHEBYSHEV_OFFSETS)
        result = DiscretizedVariable(
            mean=mu,
            std_dev=0.0,
            probabilities=probs,
            values=vals,
        )
        _validate(result, mu)
        return result

    vals = _chebyshev_values(mu, sigma)
    probs = CHEBYSHEV_PROBABILITIES

    result = DiscretizedVariable(
        mean=mu,
        std_dev=sigma,
        probabilities=probs,
        values=vals,
    )
    _validate(result, mu)
    return result


def _validate(result: DiscretizedVariable, target_mean: float) -> None:
    if len(result.probabilities) != len(result.values):
        raise ValueError("probabilities and values length mismatch")
    if abs(sum(result.probabilities) - 1.0) > PROB_TOLERANCE:
        raise ValueError("probabilities must sum to 1")
    if abs(result.expected_value() - target_mean) > MEAN_TOLERANCE:
        raise ValueError(
            f"expected value {result.expected_value()} != target mean {target_mean}"
        )
    if any(v < -MEAN_TOLERANCE for v in result.values):
        raise ValueError("values must be non-negative")
