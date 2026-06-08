# 定義 04：Convolution 運算（兩隨機變數相加）

> 依 `docs/source/stochastic network analyisis.pdf` **§3.2.3 離散化 max 及 convolution 運算原理**。

## 1. 陳述式：隨機變數相加

設 `X`、`Y` 為已離散化的隨機變數（二維矩陣表示）：

```
X = [v₁^X, …, v_m^X : p₁^X, …, p_m^X]
Y = [v₁^Y, …, v_n^Y : p₁^Y, …, p_n^Y]
```

定義 **和隨機變數** `Z = X + Y`，同樣以二維矩陣表示：

```
Z = [v₁^Z, …, v_k^Z : p₁^Z, …, p_k^Z]
```

## 2. 陳述式：非逐元素相加（重要）

**Convolution 絕不是** 同索引逐元素相加：

```
❌ 錯誤：Z = [v₁^X + v₁^Y, … : p₁^X + p₁^Y, …]   （piecewise / 逐元素）
```

而是 **shuffle（全配對交叉）** 運算：

1. 自 `X` 取任一支撐點 `vᵢ^X`（機率 `pᵢ^X`）
2. 自 `Y` 取任一支撐點 `vⱼ^Y`（機率 `pⱼ^Y`）
3. 形成 `Z` 的一個支撐點：
   - **樣本值**：`v = vᵢ^X + vⱼ^Y`
   - **機率**：`p = pᵢ^X × pⱼ^Y`

對所有 `(i, j)` 配對執行後，若不同配對產生 **相同樣本值** `v`，則將其機率 **累加**。

## 3. 陳述式：數學形式

```
P(Z = z) = Σ_{i,j : vᵢ^X + vⱼ^Y = z}  pᵢ^X · pⱼ^Y
```

**期望值**（守恆）：

```
E[Z] = E[X] + E[Y] = Σᵢ pᵢ^X vᵢ^X + Σⱼ pⱼ^Y vⱼ^Y
```

**變異數**通常 **增大**（獨立和之變異數相加），故 `Z` 的支撐點數 `k` 往往 **大於** `m` 或 `n`，最多 `m × n` 個相異值（合併後可能較少）。

## 4. 數值範例

```
X = [1, 3 : 0.5, 0.5]        E[X] = 2
Y = [10, 20 : 0.5, 0.5]      E[Y] = 15
```

全配對（shuffle）：

| 配對 | vᵢ^X + vⱼ^Y | pᵢ^X × pⱼ^Y |
|------|-------------|-------------|
| (1, 10) | 11 | 0.5 × 0.5 = 0.25 |
| (1, 20) | 21 | 0.25 |
| (3, 10) | 13 | 0.25 |
| (3, 20) | 23 | 0.25 |

```
Z = [11, 13, 21, 23 : 0.25, 0.25, 0.25, 0.25]
E[Z] = 17 = 2 + 15  ✓
```

維度由 2 與 2 **擴張** 為 4（本例無重複和，故為 `m × n`）。

## 5. 與初始值 `[0 : 1]` 的組合

若 `X = [0 : 1]`（初始值，定義 03），則：

```
Z = X + Y  ⇒  Z = [v₁^Y, …, v_n^Y : p₁^Y, …, p_n^Y] = Y
```

即退化初始值不改變 `Y` 的分佈，僅語意上代表「從 0 開始累加」。

## 6. Python 契約

```python
from api.analysis.discretization import discretization
from api.analysis.convolution import convolution

X = discretization(2.0)
Y = discretization(3.0)
Z = convolution(X, Y)

Z.notation()          # [v1, ..., vk : p1, ..., pk]
Z.expected_value()    # E[X] + E[Y] == 5.0
Z.method              # "convolution"
len(Z.values)         # 通常 > max(len(X.values), len(Y.values))
```

**實作：** `api/analysis/convolution.py` → `convolution(X, Y) -> DiscretizedVariable`

## 7. 備註：max 運算

同章節另述 **離散化 max 運算**（`Z = max(X, Y)`），與 convolution 同為 shuffle 全配對，但樣本值改為 `max(vᵢ^X, vⱼ^Y)`。見 [05-max-operation.md](./05-max-operation.md)。
