from pathlib import Path
from pypdf import PdfReader

pdf_path = Path(r"C:\Users\chuwe\Downloads\PNA\docs\source\離散化重新取樣技術.pdf")
out = Path(r"C:\Users\chuwe\Downloads\PNA\scripts\_resample_method_pdf.txt")

lines = []
if not pdf_path.exists():
    lines.append(f"NOT FOUND: {pdf_path}")
else:
    reader = PdfReader(str(pdf_path))
    lines.append(f"pages: {len(reader.pages)}")
    for pn, page in enumerate(reader.pages, 1):
        t = page.extract_text() or ""
        lines.append(f"\n{'='*60}\nPAGE {pn}\n{'='*60}\n{t}")

out.write_text("\n".join(lines), encoding="utf-8")
print("done", out)
