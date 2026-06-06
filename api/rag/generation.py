import os
from typing import List

import google.generativeai as genai
import requests
from google.api_core import exceptions as google_exceptions

from api.rag.generation_config import (
    GEMINI_GENERATION_MODEL,
    GEMINI_GENERATION_MODELS,
    GENERATION_PROVIDER,
    OLLAMA_BASE_URL,
    OLLAMA_GENERATION_MODEL,
)


class GenerationQuotaError(RuntimeError):
    pass


class GenerationError(RuntimeError):
    pass


def _gemini_models() -> List[str]:
    models: List[str] = []
    for model in [GEMINI_GENERATION_MODEL, *GEMINI_GENERATION_MODELS]:
        if model and model not in models:
            models.append(model)
    return models


def _generate_with_gemini(prompt: str) -> tuple[str, str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GenerationError("GEMINI_API_KEY 未設定")

    genai.configure(api_key=api_key)
    last_error: Exception | None = None

    for model_name in _gemini_models():
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            answer = (response.text or "").strip()
            if answer:
                return answer, model_name
            last_error = GenerationError(f"Gemini ({model_name}) 未回傳有效內容")
        except google_exceptions.ResourceExhausted as error:
            last_error = error
            print(f"[generate:gemini] quota exceeded for {model_name}", flush=True)
            continue
        except Exception as error:
            last_error = error
            print(f"[generate:gemini] failed for {model_name}: {error}", flush=True)
            continue

    if isinstance(last_error, google_exceptions.ResourceExhausted):
        raise GenerationQuotaError(
            "Gemini API 配額已用盡或未啟用（limit: 0）。"
            "請至 Google AI Studio 確認 API Key 配額，或改用 GENERATION_PROVIDER=ollama 本機生成。"
        ) from last_error

    raise GenerationError(f"Gemini 生成失敗: {last_error}")


def _generate_with_ollama(prompt: str) -> tuple[str, str]:
    model_name = OLLAMA_GENERATION_MODEL
    response = requests.post(
        f"{OLLAMA_BASE_URL}/api/generate",
        json={"model": model_name, "prompt": prompt, "stream": False},
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    answer = (payload.get("response") or "").strip()
    if not answer:
        raise GenerationError(f"Ollama ({model_name}) 未回傳有效內容")
    return answer, model_name


def generate_answer(prompt: str) -> tuple[str, str]:
    if GENERATION_PROVIDER == "ollama":
        return _generate_with_ollama(prompt)
    if GENERATION_PROVIDER == "gemini":
        return _generate_with_gemini(prompt)
    raise GenerationError(
        f"不支援的 GENERATION_PROVIDER: {GENERATION_PROVIDER}（可用：gemini、ollama）"
    )
