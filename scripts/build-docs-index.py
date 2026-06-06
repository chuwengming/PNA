import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env.local", override=True)

from api.rag.ingest import build_index


def main() -> None:
    try:
        result = build_index()
    except Exception as error:
        print(f"[build-docs-index] 失敗: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from error

    print("[build-docs-index] index_file:", result["index_file"])
    print("[build-docs-index] chunk_count:", result["chunk_count"])
    print("[build-docs-index] sources:", ", ".join(result["sources"]))


if __name__ == "__main__":
    main()
