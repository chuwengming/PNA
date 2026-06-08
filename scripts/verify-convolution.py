import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.analysis.convolution import convolution
from api.analysis.discretization import DiscretizedVariable, discretization

out = Path(__file__).with_name("_verify_convolution_out.txt")
lines = []

# Example from definition 04
X = DiscretizedVariable(
    mean=2.0,
    std_dev=0.0,
    values=(1.0, 3.0),
    probabilities=(0.5, 0.5),
    method="example",
)
Y = DiscretizedVariable(
    mean=15.0,
    std_dev=0.0,
    values=(10.0, 20.0),
    probabilities=(0.5, 0.5),
    method="example",
)
Z = convolution(X, Y)
lines.append(f"small example: {Z.notation()}")
lines.append(f"E[Z]={Z.expected_value()} (expect 17)")
assert len(Z.values) == 4
assert abs(Z.expected_value() - 17.0) < 1e-6

# initial [0:1] + Y = Y
Y2 = discretization(2.0)
Z0 = convolution(discretization(0.0), Y2)
lines.append(f"initial+T2 len={len(Z0.values)} (expect 5)")
lines.append(f"initial+T2 E={Z0.expected_value()} (expect 2)")
assert len(Z0.values) == len(Y2.values)
assert abs(Z0.expected_value() - 2.0) < 1e-6

# Chebyshev 5 + 5 expands
A = discretization(2.0)
B = discretization(3.0)
Zab = convolution(A, B)
lines.append(f"5+5 support size={len(Zab.values)} (expect >5)")
lines.append(f"5+5 E={Zab.expected_value()} (expect 5)")
assert len(Zab.values) > 5
assert abs(Zab.expected_value() - 5.0) < 1e-5
assert Zab.method == "convolution"

lines.append("OK")
out.write_text("\n".join(lines), encoding="utf-8")
