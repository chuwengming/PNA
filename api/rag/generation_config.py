import os

GENERATION_PROVIDER = os.getenv("GENERATION_PROVIDER", "gemini").strip().lower()

GEMINI_GENERATION_MODEL = os.getenv("GEMINI_GENERATION_MODEL", "gemini-2.5-flash-lite")
GEMINI_GENERATION_MODELS = [
    model.strip()
    for model in os.getenv(
        "GEMINI_GENERATION_MODELS",
        "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-1.5-flash",
    ).split(",")
    if model.strip()
]

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_GENERATION_MODEL = os.getenv("OLLAMA_GENERATION_MODEL", "llama3.2")

MAX_CONTEXT_CHARS = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "10000"))
MIN_CONTEXT_CHUNKS = int(os.getenv("RAG_MIN_CONTEXT_CHUNKS", "3"))
