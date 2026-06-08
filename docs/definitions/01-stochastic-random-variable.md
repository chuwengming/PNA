# 定義 01：隨機環境下的隨機變數

## 1. 靜態環境 vs 隨機環境

| 環境 | 時間變數 T 的表達 | 說明 |
|------|-------------------|------|
| **靜態環境** | `T = 2` | 確定常數，無隨機性 |
| **隨機環境** | `T ~ N(μ, σ²)`，其中 `μ = 2` | 常態分佈隨機變數；`2` 為**期望值**，非每次實現的固定值 |

本專案在隨機環境下，**所有數值性質的變數**（活動時間、成本等）均採 **常態分佈** 建模。

## 2. 陳述式：期望值

對離散化後的表示（依 `docs/source/stochastic network analyisis.pdf`）：

```
T = [v₁, v₂, v₃, v₄, v₅ : p₁, p₂, p₃, p₄, p₅]
```

其中：

- `vᵢ`：第 `i` 個樣本值
- `pᵢ`：第 `i` 個樣本值對應的機率（`Σ pᵢ = 1`）

**期望值（Expected Value）** 定義為：

```
E[T] = Σᵢ (pᵢ × vᵢ) = p₁v₁ + p₂v₂ + p₃v₃ + p₄v₄ + p₅v₅
```

**約束條件：** 離散化結果必須滿足 `E[T] = Value`，其中 `Value` 為靜態環境下的原始數值（即常態分佈的均值 `μ`）。

### 範例

靜態環境 `T = 2`，隨機環境下 `μ = 2`。若五點離散化為：

```
T = [v₁, v₂, v₃, v₄, v₅ : 0.05, 0.25, 0.40, 0.25, 0.05]
```

則必須滿足：

```
2 = 0.05·v₁ + 0.25·v₂ + 0.40·v₃ + 0.25·v₄ + 0.05·v₅
```

## 3. 陳述式：為何需要離散化（取樣）

連續常態分佈無法直接在有限步驟的離散演算法中運算。為使電腦可實質計算：

1. 自 `N(μ, σ²)` **取 5 個代表點**（五點離散化，本專案預設 `n = 5`）。
2. 以 **二維矩陣**（兩列）表示：
   - **第一列**：樣本值 `[v₁, v₂, v₃, v₄, v₅]`
   - **第二列**：對應機率 `[p₁, p₂, p₃, p₄, p₅]`
3. 記法：`T = [v₁…v₅ : p₁…p₅]`

## 4. 陳述式：離散化函式契約

所有隨機變數在進入網路分析演算法之前，**必須**先呼叫：

```python
discretization(Value) -> DiscretizedVariable
```

**輸入：** `Value`（float）— 靜態環境的確定值，即 `μ`。

**輸出：** 含 `probabilities`、`values` 的結構，且：

1. `len(probabilities) == len(values)`（通常為 5；**初始值 `Value=0` 時為 1**，見 [03-initial-value-single-sample.md](./03-initial-value-single-sample.md)）
2. `sum(probabilities) == 1`（允許浮點誤差 `1e-9`）
3. `dot(probabilities, values) == Value`（允許浮點誤差 `1e-6`）
4. 所有 `vᵢ ≥ 0`（活動時間不可為負）

**實作位置：** `api/analysis/discretization.py`  
**預設方法：** Chebyshev 五點離散化（`Value > 0`，見 [02-chebyshev-discretization.md](./02-chebyshev-discretization.md)）。  
**初始值方法：** `Value = 0` → `[0 : 1]`（見 [03-initial-value-single-sample.md](./03-initial-value-single-sample.md)）。

## 5. 標準差 σ 的來源

僅知 `Value`（均值）時，常態分佈尚未完全確定，尚需 **標準差 σ**。本專案預設：

```
σ = Value / 6    （即 μ 的 1/6，可透過參數覆寫）
```

此設定使五點落在 `[μ − 2σ, μ + 2σ] = [2μ/3, 4μ/3]`，涵蓋 Chebyshev 定理下 ≥ 75% 機率質量所在的區間。  
若節點日後儲存個別 `σ` 或變異係數，應改以節點級參數傳入 `discretization(Value, std_dev=σ)`。
