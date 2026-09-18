# Project Invariants（可執行全局契約）

> 隨專案演進持續累積。每條應可被人工或 agent 驗證（可檢查、可回歸）。
> 最後更新：2026-09-18

## 1. 產品流程
- [x] Dashboard 人機流程：建立／編輯網路 → 存成草稿（`pass_review=0`）→ Review 通過 → 才能 Graph／Find Paths／CPA／LCTA。
- [x] Edit 儲存後必須重新 Review；分析結果（含 LCTA 快取）視為失效。
- [x] LCTA／CPA／Find Paths 的 REST 入口要求資料庫中該網路 `pass_review=1`。
- [x] 文件問答（`/docs`、`/api/n8n-docs`、`/api/python/docs/ask`）與路徑分析分離；MCP 不暴露諮詢工具。

## 2. 模式／分支（若有多模式、多角色、多入口）
- [x] **瀏覽器入口**：Next.js Dashboard；`/api/python/*` 需 NextAuth session cookie。公開網域的 `/api/python/api-keys*` 一律 403（即使已登入）；金鑰只走 `/api/api-keys`（BFF 以 `PYTHON_API_URL` 直連 FastAPI）。
- [x] **Agent 入口（MCP）**：公開 URL `{AUTH_URL}/mcp`，Bearer 為環境變數 `MCP_API_KEY` **或** 使用者在 Dashboard「API KEY」申請且未刪除的金鑰。工具只有 `validate_network` 與 `analyze_project_network`。
- [x] Dashboard 已登入使用者可在頂部菜單開啟「API KEY」視窗：輸入應用程式名稱 → 生成金鑰 → 拷貝；列表顯示該帳號既有申請（帳號、應用名稱、金鑰）並可刪除。
- [x] MCP 分析在記憶體執行，**不寫入** `saved_networks`，不回傳 PNG `graph`。
- [x] MCP 與 Dashboard 共用同一套規劃驗證（`validate_node_inputs`）與 CPA／Find Paths 實作；不得另寫一套演算法。

## 3. 環境與銜接（mock / simulation / real）
- [x] Railway：FastAPI 只聽 `127.0.0.1:8000`；公開埠是 Next.js。
- [x] Next.js rewrite：`/api/python/:path*` → FastAPI `/api/python/:path*`。公開 `/mcp` 由 App Router（`app/mcp/[[...path]]`）轉發到 FastAPI，並原樣帶上 `Authorization`／`Accept`／`mcp-session-id`；不得只靠 Next rewrite（會弄丟 Bearer 或 SSE，Cursor 會紅燈）。
- [x] `PYTHON_API_URL` 預設 `http://127.0.0.1:8000`。
- [x] 未設定 `MCP_API_KEY` 且 key store 可用但金鑰不存在時，無效 Bearer 回 401；完全沒有 MySQL 且沒有環境金鑰、或 MySQL 已設定但查 `api_keys` 失敗時 `/mcp` 回 503（不得把 store 故障當成錯金鑰）。Dashboard 其餘功能仍可運行。
- [x] Next.js middleware **不得**只比對環境 `MCP_API_KEY` 而擋掉使用者申請的金鑰；`/mcp` 一律轉發 FastAPI 驗證。

## 4. 資料與設定（目錄、env 語意、預設值）
- [x] 權威規劃 JSON：節點陣列，每點 `id`、`precNode`、`nodeTime`（AoN）。id 必須 `0..N-1`；節點 0 無前驅；`N-1` 為唯一終點。
- [x] MCP 工具參數分兩段：`node`（規劃節點陣列；亦接受舊名 `nodes`）與 `request`（要算什麼）。`request` 可含 `longest`／`shortest`／`enumeratePaths`。不得把 `apiKey`／`userId` 放進這兩段。
- [x] MCP 入站會去掉 `finishFlag`／`output` 等 runtime 欄位，再跑規劃驗證。
- [x] `MCP_API_KEY`：可選的營運／後門金鑰，放 Railway Variables／本機 `.env`，禁止寫進 Git 或 MCP 工具參數。
- [x] 使用者金鑰存在 MySQL `api_keys`（`user_id`、`email`、`app_name`、`api_key`、`key_hash`）。同一使用者的 `app_name` 不可重複。MCP 以 `key_hash`（SHA-256）查找，不掃描明文比對。
- [x] 金鑰 CRUD 走已登入 session（Next.js `/api/api-keys` 注入 `users.id`），不得讓瀏覽器自填他人 `userId`，也不得經公開 rewrite `/api/python/api-keys?userId=` 讀寫明文金鑰。
- [x] 工具參數不得含 `apiKey` 或 `userId`。

## 5. UI／跨頁／跨模組契約（共用 store、handoff、顯示尺寸等）
- [x] Hermes 等 Agent 負責網路圖 → 規劃 JSON；PNA 只驗證與計算。
- [x] `analyze_project_network` 可回：最長／最短關鍵路徑與期望時間、全部路徑與各路徑 `duration`（路徑上 `nodeTime` 之和）、`pathCount`。
- [x] MCP 工具由 PNA 執行；Hermes `tools.include` 只是允許呼叫的白名單，不是 Agent 端實作。

## 6. 禁止破壞（含已修回歸）
- [x] 不得把 FastAPI 改成對公網 `0.0.0.0` 只為了 MCP。
- [x] 不得用 NextAuth cookie 當 MCP 認證。
- [x] 不得把文件 RAG／rebuild-index／註冊登入做成 MCP 工具。
- [x] 不得讓模型傳入的 `userId` 操作他人 `saved_networks`。
- [x] 不得讓已登入者用公開 `/api/python/api-keys?userId=` 讀他人明文金鑰（須走 `/api/api-keys`）。
- [x] `/mcp` 不得要求 session cookie（否則 Hermes 永遠 401）。
- [x] FastAPI `/mcp` 的 OPTIONS 不得因缺少 Bearer 回 401（預檢不是呼叫工具）。
- [x] 部署權威為 Railway（`railpack.json` + `npm run railway-start`）。已廢棄 `vercel.json` 與 Next 範本圖（`public/vercel.svg`、`file.svg`、`window.svg`、`globe.svg`、`next.svg`），不得再當部署或 UI 資源。UI Logo／首頁圖僅用 `public/logo.jpeg` 與 `public/network-visualization.png`。

## 7. 待確認
- [ ] MCP 分析目前不依 API Key 綁定 `saved_networks`（仍為無狀態計算）。
- [ ] 列表重開時顯示完整金鑰（依產品需求寫入 `api_keys.api_key`）；若改為「只顯示一次」需同步改契約。
