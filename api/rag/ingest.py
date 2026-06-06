import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from pypdf import PdfReader

from api.rag.chunking import split_text
from api.rag.config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    DOCS_INDEX_DIR,
    DOCS_INDEX_FILE,
    DOCS_SOURCE_DIR,
    resolve_embedding_model,
    resolve_embedding_provider,
)
from api.rag.embeddings import embed_texts


def _extract_pdf_pages(pdf_path: Path) -> List[Dict[str, Any]]:
    reader = PdfReader(str(pdf_path))
    pages: List[Dict[str, Any]] = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(
                {
                    "source": pdf_path.name,
                    "page": page_number,
                    "text": text,
                }
            )

    return pages


def _collect_chunks(source_dir: Path) -> List[Dict[str, Any]]:
    pdf_files = sorted(source_dir.glob("*.pdf"))
    if not pdf_files:
        raise FileNotFoundError(f"在 {source_dir} 找不到任何 PDF 文件")

    chunks: List[Dict[str, Any]] = []
    chunk_id = 0

    for pdf_path in pdf_files:
        for page in _extract_pdf_pages(pdf_path):
            for text in split_text(page["text"], CHUNK_SIZE, CHUNK_OVERLAP):
                chunk_id += 1
                chunks.append(
                    {
                        "id": f"chunk-{chunk_id:05d}",
                        "source": page["source"],
                        "page": page["page"],
                        "text": text,
                    }
                )

    if not chunks:
        raise ValueError("PDF 文件無法擷取可用文字內容")

    return chunks


def build_index(source_dir: Path | None = None, index_file: Path | None = None) -> Dict[str, Any]:
    source_dir = source_dir or DOCS_SOURCE_DIR
    index_file = index_file or DOCS_INDEX_FILE
    provider = resolve_embedding_provider()
    model = resolve_embedding_model(provider)

    chunks = _collect_chunks(source_dir)
    print(f"[build-docs-index] provider: {provider}", flush=True)
    print(f"[build-docs-index] model: {model}", flush=True)
    print(f"[build-docs-index] chunks: {len(chunks)}", flush=True)

    embeddings = embed_texts(
        [chunk["text"] for chunk in chunks],
        task_type="retrieval_document",
    )

    for chunk, embedding in zip(chunks, embeddings):
        chunk["embedding"] = embedding

    embedding_dimension = len(embeddings[0]) if embeddings else 0

    payload = {
        "version": 3,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "embedding_provider": provider,
        "embedding_model": model,
        "embedding_dimension": embedding_dimension,
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
        "source_dir": str(source_dir),
        "chunk_count": len(chunks),
        "chunks": chunks,
    }

    index_file.parent.mkdir(parents=True, exist_ok=True)
    with index_file.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)

    return {
        "index_file": str(index_file),
        "chunk_count": len(chunks),
        "sources": sorted({chunk["source"] for chunk in chunks}),
        "embedding_provider": provider,
        "embedding_model": model,
    }


def index_status(index_file: Path | None = None) -> Dict[str, Any]:
    index_file = index_file or DOCS_INDEX_FILE
    if not index_file.exists():
        return {
            "ready": False,
            "index_file": str(index_file),
            "chunk_count": 0,
            "sources": [],
        }

    with index_file.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    return {
        "ready": True,
        "index_file": str(index_file),
        "chunk_count": payload.get("chunk_count", 0),
        "sources": sorted({chunk["source"] for chunk in payload.get("chunks", [])}),
        "created_at": payload.get("created_at"),
        "embedding_provider": payload.get("embedding_provider"),
        "embedding_model": payload.get("embedding_model"),
        "embedding_dimension": payload.get("embedding_dimension"),
    }
