# ETS 節點重構 — MySQL 欄位確認表

## `saved_networks` 資料表（更新後）

| 欄位 | 型態 | 初始值（新建網路） | 說明 |
|------|------|-------------------|------|
| `id` | BIGINT PK | auto | 網路 ID |
| `user_id` | BIGINT FK | — | 所屬使用者 |
| `name` | VARCHAR(191) | 使用者輸入 | 網路名稱 |
| `node_count` | INT | N | 節點數 |
| `prec_nodes_json` | JSON | `[[], [0], ...]` | Prec_Node(i)，使用者規劃 |
| `node_times_json` | JSON | `[0, μ₁, μ₂, ...]` | Node_Time 靜態均值 |
| `finish_flags_json` | JSON | `[false, false, ...]` | finish_flag，**全 false** |
| `outputs_json` | JSON | 每節點 `{values:[0], probabilities:[1], mean:0, ...}` | Output，**全 [0:1]** |
| `path_flags_json` | JSON | `[[], [0], [0,0], ...]` | Path_Flag，**與 prec 等長、全 0** |
| `path_times_json` | JSON | 每路徑 `{...[0:1]...}` | Path_Time，**與 prec 等長** |
| `pass_review` | TINYINT(1) | **0** | 審查通過後為 1 |
| `created_at` / `updated_at` | TIMESTAMP | now | 時間戳 |

## 舊欄位遷移

| 舊欄位 | 新欄位 |
|--------|--------|
| `predecessors_json` | `prec_nodes_json`（自動 CHANGE） |
| `mean_times_json` | `node_times_json`（自動 CHANGE） |
| — | `finish_flags_json`（新增並 backfill） |
| — | `outputs_json`（新增並 backfill） |
| — | `path_flags_json`（新增並 backfill） |
| — | `path_times_json`（新增並 backfill） |

FastAPI 啟動時 `migrate_schema()` 會自動執行上述遷移。

## API 節點欄位（前後端）

| PDF 符號 | API 名稱 | 規劃可編輯 |
|----------|----------|-----------|
| Node(i) | `id` | — |
| Prec_Node(i) | `precNode` | ✅ |
| finish_flagᵢ | `finishFlag` | 唯讀（初始 false） |
| Outputᵢ | `output` + `outputNotation` | 唯讀（初始 [0:1]） |
| Path_Flag(i) | `pathFlag` | 唯讀（初始全 0） |
| Path_Time(i) | `pathTime` + `pathTimeNotation` | 唯讀（初始 [0:1]） |
| Node_Time(i) | `nodeTime` | ✅ |

詳見 `docs/definitions/07-ets-node-structure.md`。
