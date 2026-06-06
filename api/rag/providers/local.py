from typing import List

from api.rag.config import LOCAL_EMBED_BATCH_SIZE, LOCAL_EMBEDDING_MODEL

_model = None
_model_name = ""


def _get_model(model_name: str):
    global _model, _model_name
    if _model is None or _model_name != model_name:
        from sentence_transformers import SentenceTransformer

        print(f"[embed:local] loading model: {model_name}", flush=True)
        _model = SentenceTransformer(model_name)
        _model_name = model_name
    return _model


def _prefix_texts(texts: List[str], task_type: str, model_name: str) -> List[str]:
    if "e5" not in model_name.lower():
        return texts
    if task_type == "retrieval_query":
        return [f"query: {text}" for text in texts]
    return [f"passage: {text}" for text in texts]


def local_embed_texts(
    texts: List[str],
    task_type: str = "retrieval_document",
    model: str | None = None,
) -> List[List[float]]:
    if not texts:
        return []

    model_name = model or LOCAL_EMBEDDING_MODEL
    encoder = _get_model(model_name)
    inputs = _prefix_texts(texts, task_type, model_name)
    batch_size = max(1, LOCAL_EMBED_BATCH_SIZE)

    print(
        f"[embed:local] encoding {len(texts)} texts ({model_name}, batch={batch_size})",
        flush=True,
    )
    vectors = encoder.encode(
        inputs,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=len(texts) > batch_size,
    )

    return [vector.tolist() for vector in vectors]
