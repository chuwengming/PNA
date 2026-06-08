"""
Stochastic variable serialization for ETS nodes.

Canonical matrix notation: [v1, ..., vn : p1, ..., pn]
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from api.analysis.discretization import DiscretizedVariable, discretization

INITIAL_NOTATION = "[0 : 1]"


def initial_stochastic() -> Dict[str, Any]:
    """Output / Path_Time initial state: [0 : 1], E=0."""
    d = discretization(0.0)
    return stochastic_to_dict(d)


def stochastic_from_mean(mean: float) -> Dict[str, Any]:
    """Node_Time planning value stored with discretization metadata."""
    if mean == 0.0:
        return initial_stochastic()
    d = discretization(mean)
    return stochastic_to_dict(d)


def stochastic_to_dict(var: DiscretizedVariable) -> Dict[str, Any]:
    return {
        "values": list(var.values),
        "probabilities": list(var.probabilities),
        "mean": var.mean,
        "stdDev": var.std_dev,
        "method": var.method,
        "notation": var.notation(),
    }


def stochastic_from_dict(data: Dict[str, Any]) -> DiscretizedVariable:
    return DiscretizedVariable(
        mean=float(data["mean"]),
        std_dev=float(data.get("stdDev", 0.0)),
        probabilities=tuple(float(p) for p in data["probabilities"]),
        values=tuple(float(v) for v in data["values"]),
        method=str(data.get("method", "unknown")),
    )


def stochastic_notation(data: Dict[str, Any]) -> str:
    if "notation" in data and data["notation"]:
        return str(data["notation"])
    vals = ", ".join(f"{v:g}" for v in data.get("values", []))
    probs = ", ".join(f"{p:g}" for p in data.get("probabilities", []))
    return f"[{vals} : {probs}]"


def node_time_mean(data: Dict[str, Any]) -> float:
    return float(data.get("mean", 0.0))


def mu_stochastic(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strip variance: μ(Output) → [E(Output) : 1] per LCTA path-dependency correction.
    """
    expected = stochastic_from_dict(data).expected_value()
    if abs(expected) <= 1e-9:
        return initial_stochastic()
    return {
        "values": [expected],
        "probabilities": [1.0],
        "mean": expected,
        "stdDev": 0.0,
        "method": "mu_stripped",
        "notation": f"[{expected:g} : 1]",
    }
