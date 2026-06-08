from pathlib import Path
root = Path(r"C:\Users\chuwe\Downloads\PNA")
src = root / "docs" / "source"
out = root / "scripts" / "_dir_list.txt"
lines = [str(root.exists()), str(src)]
if src.exists():
    lines += [str(p) for p in src.iterdir()]
out.write_text("\n".join(lines), encoding="utf-8")
