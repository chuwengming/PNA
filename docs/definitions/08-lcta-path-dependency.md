# 定義 08：LCTA 路徑相依性與 Label Correction Tracing

> 依 `docs/source/LCTA技術說明.pdf`  
> 前三項（柴比契夫離散化、max/convolution、DRT）已實作；本文件記錄 **路徑相依偏差** 與 **LCTA 修正原理**。

## 1. LCTA 在專案中的位置

**LCTA（Label Correction Tracing Algorithm）** 是本專案隨機專案網路時間估算的核心方法，有別於 PERT 與一般離散化累加。

| 階段 | 內容 | 專案狀態 |
|------|------|----------|
| 離散化基礎 | 柴比契夫取樣、max、convolution、DRT | ✅ 已實作 |
| 路徑相依問題 | 重複路徑導致 max 高估 | 📖 本文件 |
| LCTA 修正 | Tracing + 去除重複路徑 variance | 🔜 待實作 |

## 2. 一般估算程序（未修正）

對節點 `i`，依 ETS 結構：

- **單一路徑輸入**：`Path_Time` 累加 → **convolution**
- **多路徑匯合**：各 `Path_Time` → **max_operation**
- **節點作業時間**：再與 `Node_Time` → **convolution**（⊕）

網路完成時間 = 終端節點 `Output` 的期望值（或整網傳播後之結果）。

## 3. 路徑相依性（Path Dependency）是什麼？

當兩條（或多條）**完成路徑**共用同一段子路徑（重複節點集合）時，該子路徑的隨機時間在數學上**不是獨立的**，但一般程序卻當作獨立變數反覆做 max。

### 範例（PDF 圖 1）

路徑 `(1→2→4)` 與 `(1→2→3→4)` 共用節點 `{1, 2}`。  
路徑 `(1→3→4)` 與 `(1→2→3→4)` 共用節點 `{1, 3}`。

### 範例（PDF 圖 2）

- 路徑 A：`(1→2→3→4→5→7)`
- 路徑 B：`(1→2→3→4→6→7)`
- **共同子路徑**：`(1→2→3→4)`

在節點 6 做 max 時，子路徑 `(1→2→3→4)` 的變異數（variance）**理論上只應影響 max 一次**；若兩條輸入路徑都帶有該子路徑的完整隨機性，等於把同一段子路徑的 variance **計入兩次**。

## 4. 為何產生偏差？

### 4.1 隨機變數的 max ≠ 數值的 max

對隨機變數 `X`, `Y`：

```
max(X, Y)  （離散 shuffle + 機率相乘）
≠
max(數值 x, 數值 y) 逐點取較大
```

**特性（PDF 陳述）：**

1. max 結果**強受 variance 影響**，variance 越大偏差越大
2. 兩常態變數的 max **不一定是常態**
3. 重疊路徑若用一般程序 → **路徑相依偏差**，估算值通常 **大於** 實際值（高估）

### 4.2 PERT 與蒙地卡羅的對照

| 方法 | 路徑相依時 |
|------|------------|
| **一般離散 max/conv 程序** | 常 **高估** |
| **PERT** | 亦無法處理相依，常 **低估** |
| **蒙地卡羅（如 20000 次）** | 接近實際，作為比較基準 |

本專案選 LCTA 而非 PERT，正是為了在可計算的前提下修正路徑相依，提高精度。

## 5. 偏差機制（圖 2 說明）

**未修正程序：**

```
Output₃ = Path(1→3) 累加          // convolution
Output₄ = Output₃ ⊕ Node_Time(4)
Output₅ = Output₃ ⊕ Node_Time(5)   // 兩路徑共用 Output₃ 的完整隨機性
Output₆ = max(Output₄, Output₅) ⊕ Node_Time(6)
```

問題：`Output₃` 的 variance 在 `max(Output₄, Output₅)` 中透過兩條輸入**各貢獻一次**，子路徑 `(1→2→3→4)` 的隨機波動被 **重複計入**。

**關鍵概念：** 共同子路徑的 variance 在匯合點的 max 運算中，**只能允許影響一次**。

## 6. LCTA 修正原理（本專案核心發明）

### 6.1 兩個關鍵

1. **Tracing（追蹤）**：有效找出網路中各路徑間的 **重複子路徑**
2. **Variance 去除**：對重複路徑中「多餘」的那份隨機變數，在 max 前剝離 variance，只保留期望值

### 6.2 去除 variance 的方式

設隨機變數 `Z = [v₁, v₂, … : p₁, p₂, …]`，去除 variance 後：

```
Z′ = [E(Z) : 1]
```

即退化為 **單點確定分布**（與規劃階段 `nodeTime` 轉 `[T : 1]` 同型），僅保留期望值、機率全為 1。

### 6.3 修正後程序（圖 2）

```
Output₃  = Path(1→3) 累加
Output₄  = Output₃ ⊕ Node_Time(4)
Output₃′ = [E(Output₃) : 1]        // 其中一條重複路徑去除 variance
Output₅  = Output₃′ ⊕ Node_Time(5)
Output₆  = max(Output₄, Output₅) ⊕ Node_Time(6)
```

僅 **一條** 重複路徑保留完整隨機性；其餘改為 `[E(Z) : 1]`，使 max 時子路徑 variance 只計入一次。

### 6.4 演算流程概述（待實作）

1. 找出各完成路徑間的 **重複路徑（重複子路徑）**
2. 對執行 **max** 的節點，檢查輸入路徑是否存在重複
3. 若存在：僅 **一條** 路徑的隨機時間保留 variance，其餘重複路徑 **去除 variance**
4. 以 **Shared_flag** 旗標配合 `Downward_Tracing(n)`、`Upward_Tracing()` 實作追蹤與標記

## 7. 與 ETS 節點結構的對應

| ETS 欄位 | LCTA 角色 |
|----------|-----------|
| `Path_Time(i)` | 各路徑 Yⱼᵢ，convolution/max 的輸入 |
| `Path_Flag(i)` | 路徑是否已計算完成 |
| `finish_flag` | 節點是否完成 LCTA 傳播 |
| `Output` | 節點輸出隨機變數，向下游傳遞 |
| **Shared_flag**（演算法用） | 標記重複路徑是否已保留/剝離 variance |

## 8. 與已實作工具的關係

```
discretization(T)     →  [T : 1] 或 Chebyshev 五點
convolution(X, Y)     →  路徑時間累加
max_operation(X, Y)   →  多路徑匯合
resample(Z)           →  控制支撐點數（DRT）
[E(Z) : 1] 轉換       →  LCTA variance 去除（待實作 deterministic_stochastic）
Tracing               →  找出重複路徑 + Shared_flag（待實作）
```

## 9. 小結

- **問題**：隨機網路中路徑共用節點 → max 運算重複計入子路徑 variance → 完成時間偏差（一般方法常高估）。
- **LCTA 解法**：Tracing 找重複路徑 + 僅一條保留 variance、其餘改 `[E(Z):1]` + 再執行 max/convolution。
- **下一步**：實作 `Downward_Tracing`、`Upward_Tracing`、`Shared_flag` 與 variance 剝離函式，接入 ETS 節點傳播流程。
