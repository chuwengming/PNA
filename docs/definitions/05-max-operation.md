# 定義 05：Max 運算（兩隨機變數取最大值）

> 依 `docs/source/stochastic network analyisis.pdf` **§3.2.3 離散化 max 及 convolution 運算原理**。

## 1. 陳述式：隨機變數取最大值

設 `X`、`Y` 為已離散化的隨機變數：

```
X = [v₁^X, …, v_m^X : p₁^X, …, p_m^X]
Y = [v₁^Y, …, v_n^Y : p₁^Y, …, p_n^Y]
```

定義 **最大值隨機變數** `Z = max(X, Y)`，同樣以二維矩陣表示：

```
Z = [v₁^Z, …, v_k^Z : p₁^Z, …, p_k^Z]
```

## 2. 陳述式：非逐元素取 max（重要）

**Max 運算絕不是** 同索引逐元素取 max：

```
❌ 錯誤：Z = [max(v₁^X, v₁^Y), … : p₁^X × p₁^Y, …]   （僅對相同索引）
❌ 錯誤：Z = [max(v₁^X, v₁^Y), … : p₁^X + p₁^Y, …]
```

而是與 convolution 相同結構的 **shuffle（全配對交叉）** 運算，僅將「相加」改為「取最大值」：

1. 自 `X` 取 `vᵢ^X`（機率 `pᵢ^X`）
2. 自 `Y` 取 `vⱼ^Y`（機率 `pⱼ^Y`）
3. 形成 `Z` 的一個支撐點：
   - **樣本值**：`v = max(vᵢ^X, vⱼ^Y)`
   - **機率**：`p = pᵢ^X × pⱼ^Y`

對所有 `(i, j)` 配對執行後，**相同樣本值** 的機率 **累加**。

## 3. 陳述式：數學形式

```
P(Z = z) = Σ_{i,j : max(vᵢ^X, vⱼ^Y) = z}  pᵢ^X · pⱼ^Y
```

**期望值**（由結果分佈計算，**無** convolution 的 `E[X]+E[Y]` 簡公式）：

```
E[Z] = Σ_k p_k^Z · v_k^Z
```

一般 **`E[max(X,Y)] ≥ max(E[X], E[Y])`**。支撐點數 `k` 最多 `m × n`，合併後可能較少；變異數可能增大或重新集中，依分佈而定。

## 4. 數值範例

```
X = [1, 3 : 0.5, 0.5]        E[X] = 2
Y = [10, 20 : 0.5, 0.5]      E[Y] = 15
```

全配對（shuffle + max）：

| 配對 | max(vᵢ^X, vⱼ^Y) | pᵢ^X × pⱼ^Y |
|------|-----------------|-------------|
| (1, 10) | 10 | 0.25 |
| (1, 20) | 20 | 0.25 |
| (3, 10) | 10 | 0.25 |
| (3, 20) | 20 | 0.25 |

合併後：

```
Z = [10, 20 : 0.5, 0.5]
E[Z] = 15
```

維度由 4 個中間配對 **合併** 為 2 個支撐點（仍可能因 shuffle 而先擴張再合併）。

## 5. 與 Convolution 的對照

| 項目 | Convolution (`X + Y`) | Max (`max(X, Y)`) |
|------|----------------------|-------------------|
| 配對樣本值 | `vᵢ^X + vⱼ^Y` | `max(vᵢ^X, vⱼ^Y)` |
| 配對機率 | `pᵢ^X × pⱼ^Y` | `pᵢ^X × pⱼ^Y` |
| 期望值 | `E[X] + E[Y]` | 由結果分佈計算 |
| 典型用途 | 平行路徑時間累加 | 合併節點取最長前置等 |

## 6. 與初始值 `[0 : 1]` 的組合

若 `X = [0 : 1]` 且 `Y` 的樣本值皆 ≥ 0，則：

```
Z = max(X, Y)  ⇒  Z = Y
```

因 `max(0, vⱼ^Y) = vⱼ^Y`。

## 7. Python 契約

```python
from api.analysis.discretization import discretization
from api.analysis.max_operation import max_operation

X = discretization(2.0)
Y = discretization(3.0)
Z = max_operation(X, Y)

Z.notation()          # [v1, ..., vk : p1, ..., pk]
Z.expected_value()    # E[max(X,Y)]
Z.method              # "max"
```

**實作：** `api/analysis/max_operation.py` → `max_operation(X, Y) -> DiscretizedVariable`
