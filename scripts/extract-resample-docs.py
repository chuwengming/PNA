from pathlib import Path
from pypdf import PdfReader

root = Path(r"C:\Users\chuwe\Downloads\PNA")
pdf_path = root / "docs" / "source" / "stochastic network analyisis.pdf"
out = root / "scripts" / "_resample_pdf_extract.txt"

lines = []
if not pdf_path.exists():
    lines.append(f"PDF not found: {pdf_path}")
    lines.append("files: " + str(list((root / "docs" / "source").glob("*")) if (root / "docs" / "source").exists() else "no source dir")
else:
    reader = PdfReader(str(pdf_path))
    lines.append(f"pages: {len(reader.pages)}")
    for pn, page in enumerate(reader.pages, 1):
        t = page.extract_text() or ""
        if any(k in t for k in ["3.2.4", "重新取樣", "重新取样", "取樣", "支撐", "resample", "減肥"]):
            lines.append(f"\n=== page {pn} ===\n{t}")
    if len(lines) == 1:
        # dump all pages text search 3.2
        for pn, page in enumerate(reader.pages, 1):
            t = page.extract_text() or ""
            if "3.2" in t:
                lines.append(f"\n=== page {pn} (3.2) ===\n{t[:4000]}")

out.write_text("\n".join(lines), encoding="utf-8")
