# MCP 紅燈：307 Location 指向 127.0.0.1:8000

實測日期：2026-09-18

## 症狀

Cursor Tools & MCP 的 `pna` 紅燈。關掉再開、Reload Window 無效。
MCP log：`streamableHttp` 失敗後 SSE fallback `connect ECONNREFUSED 127.0.0.1:8000`。

## 驗錯層

A 層（不夠）：mcp.json URL、金鑰、是否 Reload。
B 層（根因）：對 `https://pna-production.up.railway.app/mcp` 帶 Bearer `POST initialize`，回：

```
307 Location: https://127.0.0.1:8000/mcp/
```

無金鑰的 POST 是 401，不會 307。公開 `/mcp/` 被 Next.js 308 回 `/mcp`，與 FastAPI 尾斜線對打。

## 原因

Starlette `Mount("/mcp")` 把 `/mcp` 轉到 `/mcp/`，`Location` 用 upstream Host（`127.0.0.1:8000`）再加上轉送的 `x-forwarded-proto: https`。Next 代理 `redirect: 'manual'` 把這個 Location 原樣回給 Cursor。

## 修法

1. FastAPI：把 path `/mcp` 改寫成 `/mcp/`，避免 Mount 307。
2. Next 代理：內部請求 `/mcp/`、跟隨指向 loopback 的 3xx、對外 Location 不得含 `127.0.0.1`。
3. 客戶端 URL 維持 `/mcp`（不要 `/mcp/`，否則 Next 308）。
