import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.analysis.discretization import discretization

out = Path(__file__).with_name("_verify_discretization_out.txt")
lines = []

r2 = discretization(2.0)
lines += [
    "T=2:",
    f"  notation: {r2.notation()}",
    f"  E[T]: {r2.expected_value()}",
    f"  method: {r2.method}",
]

r0 = discretization(0.0)
lines += [
    "T=0:",
    f"  notation: {r0.notation()}",
    f"  matrix: {r0.as_matrix()}",
    f"  E[T]: {r0.expected_value()}",
    f"  method: {r0.method}",
]

assert r0.notation() == "[0 : 1]"
assert r0.method == "initial"
assert abs(r0.expected_value()) < 1e-6
assert abs(r2.expected_value() - 2.0) < 1e-6

lines.append("OK")
out.write_text("\n".join(lines), encoding="utf-8")
