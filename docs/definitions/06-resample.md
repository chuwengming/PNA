# 定義 06：離散化重新取樣（DRT）

> 依 `docs/source/離散化重新取樣技術.pdf`（Discrete Resample Technique, DRT）  
> 及 `stochastic network analyisis.pdf` §3.2.4 之動機說明。

## 1. 後遺症：支撐點膨脹

隨機變數經連續 **convolution** / **max_operation** 後，樣本單元數最多可達 **Q×R**，反覆運算後快速成長，離散化負擔加重。必須 **降低樣本單元數目**，同時維持 **平均值**（及近似 **變異數**）之精確度。

## 2. 觸發條件（本專案設定）

PDF：當結果之單元數 **超過 S** 則執行 DRT。本專案參數為：

```
若 len(v^Z) > 100  ⇒  執行 resample(Z)
```

`len(v^Z) ≤ 100` 時 **原樣返回**。

## 3. 重新取樣目標維度

重新取樣後固定為 **S = 10** 個樣本單元（**不再**套用 Chebyshev 五點）：

```
Z' = [z'₁, …, z'₁₀ : p'₁, …, p'₁₀]     （式 3.11，S = 10）
```

## 4. DRT 數學步驟（PDF 式 3.11–3.14）

設原變數 `Z` 有 QR 個樣本單元 `{z_d, p_d}`，令 `z_min = min(z_d)`、`z_max = max(z_d)`。

### 步驟 1：等寬分割為 S 個區間

```
Δw = (z_max − z_min) / S
```

第 k 個區間（k = 1, …, S）對應之樣本集合（式 3.12）：

```
D_k = { z_d | z_d 落在第 k 個寬度 Δw 的區間內 }
```

### 步驟 2：非空區間 — 加權聚合（式 3.13）

若 `D_k` 非空：

```
p'_k = Σ_{z_d ∈ D_k} p_d
z'_k = Σ_{z_d ∈ D_k} (z_d · p_d) / p'_k
```

### 步驟 3：空區間 — 區間中點、零機率（式 3.14）

若 `D_k` 為空：

```
z'_k = z_min + (k − 0.5) · Δw
p'_k = 0
```

### 期望值守恆

因每個原始樣本恰落入一區間，且非空區間採機率加權平均：

```
E[Z'] = Σ_k p'_k · z'_k = Σ_d z_d · p_d = E[Z]
```

## 5. 流程位置

```
discretization → conv / max → (若 len > 100) resample(DRT, S=10) → 繼續分析
```

## 6. Python 契約

```python
from api.analysis.resample import resample, needs_resample, RESAMPLE_THRESHOLD, RESAMPLE_TARGET_SIZE

if needs_resample(Z):          # len > 100
    Z = resample(Z)            # → 10 個樣本單元, method="drt"

RESAMPLE_THRESHOLD      # 100
RESAMPLE_TARGET_SIZE    # 10
```

**實作：** `api/analysis/resample.py` → `_drt_interval_resample()`, `resample()`
