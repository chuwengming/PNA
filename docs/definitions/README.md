# PNA 數理定義與陳述式

本目錄永久記錄 **Project Network Analysis (PNA)** 專案在隨機環境下所需的數理定義、陳述式與演算法前提。  
後續網路分析演算法、資料庫欄位設計與 Python 實作，均以本目錄為權威參考。

## 索引

| 編號 | 檔案 | 主題 |
|------|------|------|
| 01 | [01-stochastic-random-variable.md](./01-stochastic-random-variable.md) | 隨機環境下的隨機變數、期望值與離散化需求 |
| 02 | [02-chebyshev-discretization.md](./02-chebyshev-discretization.md) | Chebyshev 五點離散化技術（本專案預設方法） |
| 03 | [03-initial-value-single-sample.md](./03-initial-value-single-sample.md) | 初始值單點離散化 `[0 : 1]` |
| 04 | [04-convolution.md](./04-convolution.md) | Convolution 運算（兩隨機變數相加） |
| 05 | [05-max-operation.md](./05-max-operation.md) | Max 運算（兩隨機變數取最大值） |
| 06 | [06-resample.md](./06-resample.md) | 離散化重新取樣（支撐點減肥） |
| 07 | [07-ets-node-structure.md](./07-ets-node-structure.md) | ETS 擴張樹節點資料結構 |
| 08 | [08-lcta-path-dependency.md](./08-lcta-path-dependency.md) | LCTA 路徑相依性與修正原理 |

## 使用約定

1. 靜態環境中的確定值（如 `T = 2`）在隨機環境中一律視為 **常態分佈隨機變數的期望值** `μ`。
2. 離散化記法以 `docs/source/stochastic network analyisis.pdf` 為準：**`T = [v₁…v₅ : p₁…p₅]`**（第一列樣本值，第二列機率）。
3. 任何隨機變數進入演算法運算前，**必須**先經 `discretization(Value)` 離散化（實作：`api/analysis/discretization.py`）。
4. **初始值例外：** `Value = 0` 時離散化為 **`[0 : 1]`**（單點，期望值 0），見 [03-initial-value-single-sample.md](./03-initial-value-single-sample.md)。
5. 新增定義時，請以遞增編號建立 Markdown 檔，並更新本索引表。
