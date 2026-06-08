# 定義 07：ETS 擴張樹節點資料結構

> 依 `docs/source/節點資料結構.pdf` 表 1。

## 1. 節點集合

專案網路含 **N** 個節點：`node(0)` ~ `node(N-1)`  
- `node(0)`：起始節點  
- `node(N-1)`：終端節點  

## 2. 節點 i 的七個欄位

| # | 符號 | 程式/API 名稱 | 型態 | 初始值 | 說明 |
|---|------|---------------|------|--------|------|
| 1 | Node(i) | `id` | int | 0…N−1 | 節點編號 |
| 2 | Prec_Node(i) | `precNode` | int[] | `[]`（節點 0） | 輸入節點集合 Bᵢ |
| 3 | finish_flagᵢ | `finishFlag` | bool | **false (0)** | 完成節點運算指標 |
| 4 | Outputᵢ | `output` | 隨機變數 | **`[0 : 1]`** | 節點輸出時間 |
| 5 | Path_Flag(i) | `pathFlag` | int[] | **全 0** | 與 Prec_Node 等長 |
| 6 | Path_Time(i) | `pathTime` | 隨機變數[] | **各 `[0 : 1]`** | Yⱼᵢ，與 Prec_Node 等長 |
| 7 | Node_Time(i) | `nodeTime` | 隨機變數（規劃均值） | 使用者輸入 | 節點作業時間 |

### 隨機變數 JSON 格式

```
{
  "values": [v1, ...],
  "probabilities": [p1, ...],
  "mean": μ,
  "stdDev": σ,
  "method": "initial | chebyshev_5 | ...",
  "notation": "[v1, ... : p1, ...]"
}
```

規劃階段初始 Output / Path_Time：`[0 : 1]`（定義 03）。

## 3. MySQL `saved_networks` 欄位

| 欄位 | JSON 結構 | 初始值（新建網路） |
|------|-----------|-------------------|
| `node_count` | INT | N |
| `prec_nodes_json` | `[[], [0], [0,1], ...]` | 使用者規劃 |
| `node_times_json` | `[0, 12.5, ...]` | 使用者輸入均值 |
| `finish_flags_json` | `[false, false, ...]` | **全 false** |
| `outputs_json` | `[{...[0:1]...}, ...]` | **全 `[0 : 1]`** |
| `path_flags_json` | `[[], [0], [0,0], ...]` | **與 prec 等長，全 0** |
| `path_times_json` | `[[], [{...[0:1]...}], ...]` | **與 prec 等長，各 `[0 : 1]`** |
| `pass_review` | TINYINT | 0 |

## 4. 規劃 vs 演算階段

| 階段 | 使用者可編輯 | 演算法可更新 |
|------|-------------|-------------|
| **規劃**（Dashboard 建網） | `precNode`, `nodeTime` | — |
| **演算**（後續分析） | — | `finishFlag`, `output`, `pathFlag`, `pathTime` |

儲存/更新規劃時，後端會 **重置** runtime 欄位為初始值。

## 5. Python 實作

- `api/network/ets_node.py` — `ETSNode` 類別
- `api/network/stochastic.py` — 隨機變數序列化
- `api/index.py` — API 模型、驗證、持久化
