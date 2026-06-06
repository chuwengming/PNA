import os
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

DOCS_SOURCE_DIR = _PROJECT_ROOT / "docs" / "source"
DOCS_INDEX_DIR = _PROJECT_ROOT / "docs" / "index"
DOCS_INDEX_FILE = DOCS_INDEX_DIR / "chunks.json"

EMBEDDING_PROVIDER = "local"
LOCAL_EMBEDDING_MODEL = os.getenv(
    "LOCAL_EMBEDDING_MODEL",
    "intfloat/multilingual-e5-small",
)
LOCAL_EMBED_BATCH_SIZE = int(os.getenv("LOCAL_EMBED_BATCH_SIZE", "32"))

CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))
TOP_K = int(os.getenv("RAG_TOP_K", "8"))

RAG_WEB_SEARCH_ENABLED = os.getenv("RAG_WEB_SEARCH_ENABLED", "true").lower() == "true"
RAG_WEB_SEARCH_MAX_RESULTS = int(os.getenv("RAG_WEB_SEARCH_MAX_RESULTS", "3"))
RAG_WEB_SEARCH_MAX_CHARS = int(os.getenv("RAG_WEB_SEARCH_MAX_CHARS", "2000"))

SYSTEM_PROMPT = """你是 PNA（Project Network Analysis）專案文件助理。
以下文件片段已由系統依語意相似度自動檢索，請優先根據這些內容回答使用者問題。
只要片段中有任何與提問相關的資訊，請整理、摘要、綜合後提供回覆，並說明依據（可引用頁碼）；有部分相關內容也應回答，總比什麼都沒有好。
若提問的內容與文件內容毫無相關，請明確說明該提問不歸屬本專案的回答範圍。
若提問或回答中涉及特別的專有名詞、縮寫或外來術語，可參考「網路補充資料」予以簡要說明；專案文件仍為主要依據，網路資料僅作輔助補充，若兩者矛盾以文件為準。
【語言規則—務必遵守】使用者以哪種語言提問，回答就必須使用同一種語言；不得擅自改用其他語言，也不得要求使用者另外請求翻譯。文件片段或網路資料若為其他語言，請先理解後以提問語言重新表述。
若無法判斷提問語言，預設使用繁體中文。條理清楚。"""


def resolve_embedding_provider(index_meta: dict | None = None) -> str:
    if index_meta and index_meta.get("embedding_provider"):
        return str(index_meta["embedding_provider"]).lower()
    return EMBEDDING_PROVIDER


def resolve_embedding_model(_provider: str, index_meta: dict | None = None) -> str:
    if index_meta and index_meta.get("embedding_model"):
        return str(index_meta["embedding_model"])
    return LOCAL_EMBEDDING_MODEL
