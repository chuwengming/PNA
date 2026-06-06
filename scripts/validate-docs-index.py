import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX = PROJECT_ROOT / "docs" / "index" / "chunks.json"
SOURCE = PROJECT_ROOT / "docs" / "source"


def main() -> int:
    if not INDEX.exists():
        print("FAIL: chunks.json not found")
        return 1

    stat = INDEX.stat()
    print(f"SIZE_BYTES={stat.st_size}")
    print(f"LAST_WRITE={stat.st_mtime}")

    data = json.loads(INDEX.read_text(encoding="utf-8"))
    for key in (
        "version",
        "embedding_provider",
        "embedding_model",
        "embedding_dimension",
        "chunk_count",
        "created_at",
        "chunk_size",
        "chunk_overlap",
    ):
        print(f"{key}={data.get(key)}")

    chunks = data.get("chunks", [])
    sources = sorted({c["source"] for c in chunks})
    print(f"SOURCES={sources}")

    for label, idx in [("FIRST", 0), ("MIDDLE", len(chunks) // 2), ("LAST", -1)]:
        chunk = chunks[idx]
        emb = chunk.get("embedding", [])
        print(
            f"{label}_id={chunk.get('id')} page={chunk.get('page')} "
            f"text_len={len(chunk.get('text', ''))} emb_len={len(emb)}"
        )

    dims = {len(c.get("embedding", [])) for c in chunks}
    print(f"DIM_UNIQUE={sorted(dims)}")
    print(f"DIM_CONSISTENT={len(dims) == 1}")

    try:
        from dotenv import load_dotenv

        load_dotenv(PROJECT_ROOT / ".env")
    except ImportError:
        pass
    env_model = os.getenv("LOCAL_EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    print(f"ENV_MODEL={env_model}")
    print(f"MODEL_MATCH={data.get('embedding_model') == env_model}")

    pdfs = sorted(SOURCE.glob("*.pdf"))
    print(f"PDF_COUNT={len(pdfs)}")
    for pdf in pdfs:
        print(f"PDF={pdf.name} size={pdf.stat().st_size}")

    required = {"id", "source", "page", "text", "embedding"}
    bad = [c["id"] for c in chunks if not required.issubset(c.keys())]
    print(f"CHUNK_SCHEMA_OK={len(bad) == 0}")
    if bad:
        print(f"BAD_CHUNKS={bad[:5]}")

    ok = (
        data.get("version") == 3
        and data.get("embedding_provider") == "local"
        and data.get("embedding_model") == env_model
        and data.get("chunk_count") == len(chunks)
        and len(dims) == 1
        and len(chunks) > 0
        and len(bad) == 0
    )
    print(f"OVERALL={'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
