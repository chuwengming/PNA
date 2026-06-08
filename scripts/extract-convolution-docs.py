import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

p = root / "docs" / "index" / "chunks.json"
data = json.loads(p.read_text(encoding="utf-8"))
chunks = data.get("chunks", data if isinstance(data, list) else [])
keys = ["convolution", "3.2.3", "離散化 max", "shuffle", "相加", "機率", "max 及"]
out = []
for i, c in enumerate(chunks):
    text = c.get("text", c.get("content", "")) if isinstance(c, dict) else str(c)
    if any(k in text for k in keys):
        src = c.get("source", "") if isinstance(c, dict) else ""
        out.append(f"=== chunk {i} source={src} ===\n{text}\n")

(root / "scripts" / "_convolution_pdf_extract.txt").write_text(
    "\n".join(out) if out else "no hits", encoding="utf-8"
)

# also try pypdf on source pdf
try:
    from pypdf import PdfReader
    pdf_path = root / "docs" / "source" / "stochastic network analyisis.pdf"
    if pdf_path.exists():
        reader = PdfReader(str(pdf_path))
        pdf_out = []
        for pn, page in enumerate(reader.pages, 1):
            t = page.extract_text() or ""
            if any(k.lower() in t.lower() for k in ["convolution", "3.2.3", "離散", "max"]):
                pdf_out.append(f"--- page {pn} ---\n{t}")
        (root / "scripts" / "_convolution_pdf_pages.txt").write_text(
            "\n".join(pdf_out), encoding="utf-8"
        )
except Exception as e:
    (root / "scripts" / "_convolution_pdf_pages.txt").write_text(str(e), encoding="utf-8")
