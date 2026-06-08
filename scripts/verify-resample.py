import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.analysis import (
    convolution,
    discretization,
    needs_resample,
    resample,
    RESAMPLE_TARGET_SIZE,
    RESAMPLE_THRESHOLD,
)

out = Path(__file__).with_name("_verify_resample_out.txt")
lines = []

assert RESAMPLE_THRESHOLD == 100
assert RESAMPLE_TARGET_SIZE == 10

# accumulate convolutions until > 100 support points
acc = discretization(2.0)
while len(acc.values) <= RESAMPLE_THRESHOLD:
    acc = convolution(acc, discretization(3.0))

lines.append(f"before: len={len(acc.values)}, E={acc.expected_value()}")
assert needs_resample(acc)

E_before = acc.expected_value()
Zr = resample(acc)
lines.append(f"after: len={len(Zr.values)}, E={Zr.expected_value()}, method={Zr.method}")
assert len(Zr.values) == RESAMPLE_TARGET_SIZE
assert len(Zr.probabilities) == RESAMPLE_TARGET_SIZE
assert Zr.method == "drt"
assert abs(Zr.expected_value() - E_before) < 1e-5

# within threshold: no-op
small = discretization(2.0)
assert not needs_resample(small)
assert resample(small) is small

lines.append("OK")
out.write_text("\n".join(lines), encoding="utf-8")
