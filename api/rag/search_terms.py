import re
from typing import List


def build_search_queries(question: str) -> List[str]:
    queries: List[str] = []
    seen: set[str] = set()

    def add(query: str) -> None:
        normalized = query.strip()
        if len(normalized) < 2 or normalized in seen:
            return
        seen.add(normalized)
        queries.append(normalized)

    for match in re.finditer(
        r"\b[A-Z]{2,}\b|\b(?:Monte\s*Carlo|PERT|CPM|GERT|SNA|DAC)\b",
        question,
        flags=re.IGNORECASE,
    ):
        add(f"{match.group(0)} 專案管理 意思")

    for term in re.findall(r"[「『\"']([^」』\"']{2,30})[」』\"']", question):
        add(term)

    for term in re.findall(r"\b[A-Za-z][A-Za-z0-9\-]{2,}\b", question):
        if term.lower() not in {"the", "and", "what", "how", "why"}:
            add(f"{term} definition")

    if not queries:
        add(question[:80])

    return queries[:2]
