from typing import List

from api.rag.config import (
    RAG_WEB_SEARCH_ENABLED,
    RAG_WEB_SEARCH_MAX_CHARS,
    RAG_WEB_SEARCH_MAX_RESULTS,
)
from api.rag.search_terms import build_search_queries


def _search_query(query: str, max_results: int) -> List[dict]:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        print("[web-search] duckduckgo-search 未安裝，略過網路補充", flush=True)
        return []

    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as error:
        print(f"[web-search] 搜尋失敗 ({query}): {error}", flush=True)
        return []


def fetch_web_supplement(question: str) -> tuple[str, List[str]]:
    if not RAG_WEB_SEARCH_ENABLED:
        return "", []

    queries = build_search_queries(question)
    blocks: List[str] = []
    used_queries: List[str] = []
    total_chars = 0

    for query in queries:
        results = _search_query(query, RAG_WEB_SEARCH_MAX_RESULTS)
        if not results:
            continue

        used_queries.append(query)
        for index, item in enumerate(results, start=1):
            title = (item.get("title") or "").strip()
            body = (item.get("body") or item.get("snippet") or "").strip()
            href = (item.get("href") or item.get("link") or "").strip()
            if not body:
                continue

            block = f"[{len(blocks) + 1}] {title}\n{body}"
            if href:
                block += f"\n來源: {href}"

            if total_chars + len(block) > RAG_WEB_SEARCH_MAX_CHARS:
                break

            blocks.append(block)
            total_chars += len(block)

        if total_chars >= RAG_WEB_SEARCH_MAX_CHARS:
            break

    if not blocks:
        return "", used_queries

    return "\n\n".join(blocks), used_queries
