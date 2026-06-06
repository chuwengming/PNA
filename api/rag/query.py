import json
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from api.rag.config import DOCS_INDEX_FILE, SYSTEM_PROMPT, TOP_K
from api.rag.embeddings import embed_query
from api.rag.generation import GenerationError, GenerationQuotaError, generate_answer
from api.rag.generation_config import MAX_CONTEXT_CHARS, MIN_CONTEXT_CHUNKS
from api.rag.web_search import fetch_web_supplement


def _load_index(index_file: Path | None = None) -> Dict[str, Any]:
    index_file = index_file or DOCS_INDEX_FILE
    if not index_file.exists():
        raise FileNotFoundError(
            f"RAG 索引尚未建立，請先執行 npm run build-docs-index（預期路徑：{index_file}）"
        )

    with index_file.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _top_chunks(question: str, payload: Dict[str, Any], top_k: int) -> List[Dict[str, Any]]:
    chunks = payload.get("chunks", [])
    if not chunks:
        return []

    query_vector = np.array(embed_query(question, index_meta=payload), dtype=np.float32)
    matrix = np.array([chunk["embedding"] for chunk in chunks], dtype=np.float32)

    query_norm = np.linalg.norm(query_vector)
    matrix_norm = np.linalg.norm(matrix, axis=1)
    if query_norm == 0 or np.any(matrix_norm == 0):
        return [
            {
                "id": chunk["id"],
                "source": chunk["source"],
                "page": chunk["page"],
                "text": chunk["text"],
                "score": 0.0,
            }
            for chunk in chunks[:top_k]
        ]

    scores = matrix @ query_vector / (matrix_norm * query_norm)
    ranked_indices = np.argsort(scores)[::-1][:top_k]

    results: List[Dict[str, Any]] = []
    for index in ranked_indices:
        chunk = chunks[int(index)]
        results.append(
            {
                "id": chunk["id"],
                "source": chunk["source"],
                "page": chunk["page"],
                "text": chunk["text"],
                "score": float(scores[int(index)]),
            }
        )

    return results


def _trim_contexts(contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not contexts:
        return []

    trimmed: List[Dict[str, Any]] = []
    total_chars = 0

    for index, item in enumerate(contexts):
        header = (
            f"[來源: {item['source']} 第 {item['page']} 頁 | 相關度: {item['score']:.3f}]\n"
        )
        text = item["text"]
        block_len = len(header) + len(text)

        if index < MIN_CONTEXT_CHUNKS:
            if total_chars + block_len > MAX_CONTEXT_CHARS:
                remaining = MAX_CONTEXT_CHARS - total_chars - len(header)
                if remaining > 120:
                    text = text[:remaining].rstrip() + "…"
                else:
                    break
            trimmed.append({**item, "text": text})
            total_chars += len(header) + len(text)
            continue

        if total_chars + block_len > MAX_CONTEXT_CHARS:
            remaining = MAX_CONTEXT_CHARS - total_chars - len(header)
            if remaining > 120:
                trimmed.append({**item, "text": text[:remaining].rstrip() + "…"})
            break

        trimmed.append({**item, "text": text})
        total_chars += block_len

    return trimmed


def _build_prompt(
    question: str,
    contexts: List[Dict[str, Any]],
    web_supplement: str,
) -> str:
    context_blocks = []
    for item in contexts:
        context_blocks.append(
            f"[來源: {item['source']} 第 {item['page']} 頁 | 相關度: {item['score']:.3f}]\n{item['text']}"
        )

    joined_context = "\n\n---\n\n".join(context_blocks)
    web_section = ""
    if web_supplement:
        web_section = f"\n\n網路補充資料（專有名詞輔助說明，若與文件矛盾以文件為準）：\n{web_supplement}\n"

    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"文件片段：\n{joined_context}"
        f"{web_section}\n\n"
        f"使用者問題：{question}\n\n"
        "請綜合上述片段回答；只要內容有所關聯就請提供說明。"
        "若出現專有名詞且文件未充分解釋，可搭配網路補充資料簡要說明。"
        "回答語言必須與上述「使用者問題」相同，勿改用其他語言或請使用者另行要求翻譯。"
    )


def answer_question(question: str, top_k: int | None = None) -> Dict[str, Any]:
    question = question.strip()
    if not question:
        raise ValueError("問題不可為空")

    payload = _load_index()
    contexts = _trim_contexts(_top_chunks(question, payload, top_k or TOP_K))
    web_supplement, web_queries = fetch_web_supplement(question)
    prompt = _build_prompt(question, contexts, web_supplement)
    answer, model_name = generate_answer(prompt)

    return {
        "answer": answer,
        "sources": [
            {
                "source": item["source"],
                "page": item["page"],
                "score": item["score"],
            }
            for item in contexts
        ],
        "model": model_name,
        "web_search_used": bool(web_supplement),
        "web_search_queries": web_queries,
    }


__all__ = [
    "GenerationError",
    "GenerationQuotaError",
    "answer_question",
]
