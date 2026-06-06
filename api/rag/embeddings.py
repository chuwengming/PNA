from typing import Any, Dict, List

from api.rag.config import resolve_embedding_model, resolve_embedding_provider
from api.rag.providers.local import local_embed_texts


def embed_texts(
    texts: List[str],
    task_type: str = "retrieval_document",
    index_meta: Dict[str, Any] | None = None,
) -> List[List[float]]:
    provider = resolve_embedding_provider(index_meta)
    model = resolve_embedding_model(provider, index_meta)

    if provider != "local":
        raise RuntimeError(
            f"索引嵌入提供者為 {provider}，目前僅支援 local（sentence-transformers）。"
            "請重新執行 npm run build-docs-index。"
        )

    return local_embed_texts(texts, task_type=task_type, model=model)


def embed_query(text: str, index_meta: Dict[str, Any] | None = None) -> List[float]:
    return embed_texts([text], task_type="retrieval_query", index_meta=index_meta)[0]
