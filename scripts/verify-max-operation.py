import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.analysis.convolution import convolution
from api.analysis.discretization import DiscretizedVariable, discretization
from api.analysis.max_operation import max_operation

out = Path(__file__).with_name("_verify_max_operation_out.txt")
lines = []

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
Z = max_operation(X, Y)
lines.append(f"max example: {Z.notation()}")
lines.append(f"E[Z]={Z.expected_value()} (expect 15)")
assert Z.values == (10.0, 20.0)
assert Z.probabilities == (0.5, 0.5)
assert abs(Z.expected_value() - 15.0) < 1e-6
assert Z.method == "max"

Z0 = max_operation(discretization(0.0), discretization(2.0))
lines.append(f"initial max T2 E={Z0.expected_value()} (expect 2)")
assert abs(Z0.expected_value() - 2.0) < 1e-6

A = discretization(2.0)
B = discretization(3.0)
Zm = max_operation(A, B)
Zc = convolution(A, B)
lines.append(f"5x5 max support={len(Zm.values)}, conv support={len(Zc.values)}")
assert len(Zm.values) >= 1
assert Zm.method == "max"

lines.append("OK")
out.write_text("\n".join(lines), encoding="utf-8")
