from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import random
import matplotlib
matplotlib.use('Agg')  # 使用非 GUI 後端
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch
import numpy as np
import io
import base64
import bcrypt
import json
import os
from pathlib import Path
from typing import List, Optional

import pymysql

from api.database import db_connection

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_local_env():
    """本機開發：載入 .env（MySQL）與 .env.local（NextAuth / OAuth）。"""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    load_dotenv(_PROJECT_ROOT / ".env")
    load_dotenv(_PROJECT_ROOT / ".env.local", override=True)


_load_local_env()

app = FastAPI()

class UserRegisterRequest(BaseModel):
    email: str
    passwordHash: str


class UserVerifyRequest(BaseModel):
    email: str
    password: str


class OAuthUserRequest(BaseModel):
    email: str
    name: Optional[str] = None
    provider: str = "google"


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None


class ApiMessageResponse(BaseModel):
    message: str
    user: Optional[UserResponse] = None


class NodeInput(BaseModel):
    id: int = Field(ge=0)
    previousNodes: List[int] = Field(default_factory=list)
    meanTime: float = 0.0
    flag: bool = False
    output: float = 0.0


class GraphNetworkRequest(BaseModel):
    nodes: List[NodeInput]


class ValidateNodesResponse(BaseModel):
    success: bool
    passed: bool
    errors: List[str]


class NetworkNode(BaseModel):
    id: int
    flag: bool
    pre_node: List[int]
    mean_val: float
    output: float

class NetworkResponse(BaseModel):
    success: bool
    nodeCount: int
    nodes: List[NetworkNode]
    graph: str


class SaveNetworkRequest(BaseModel):
    userId: int
    name: str
    nodes: List[NodeInput]
    graph: Optional[str] = None
    passReview: bool = False
    draft: bool = False


class UpdateNetworkRequest(BaseModel):
    userId: int
    nodes: List[NodeInput]
    graph: Optional[str] = None
    passReview: Optional[bool] = None
    draft: bool = False


class ReviewNetworkRequest(BaseModel):
    userId: int


class SavedNetworkResponse(BaseModel):
    """儲存與回傳：簡化欄位 + 還原後的 nodes（供前端表格與繪圖一致）。"""
    id: int
    userId: int
    name: str
    nodeCount: int
    predecessors: List[List[int]]
    meanTimes: List[float]
    nodes: List[NodeInput]
    graph: str
    passReview: bool


@app.get("/api/python/health/db")
def health_db():
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 AS ok")
        return {"ok": True, "message": "MySQL 連線成功"}
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"ok": False, "message": exc.detail},
        )


def init_schema(connection):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NULL,
                name VARCHAR(255) NULL,
                provider VARCHAR(64) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_networks (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                name VARCHAR(191) NOT NULL,
                node_count INT NOT NULL,
                predecessors_json JSON NOT NULL,
                mean_times_json JSON NOT NULL,
                pass_review TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_saved_networks_user_name (user_id, name),
                CONSTRAINT fk_saved_networks_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )


def migrate_schema(connection):
    """資料表遷移：移除 graph 欄位、補上 pass_review。"""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'saved_networks'
              AND COLUMN_NAME = 'graph'
            """
        )
        row = cursor.fetchone()
        if row and row["cnt"]:
            cursor.execute("ALTER TABLE saved_networks DROP COLUMN graph")

        cursor.execute(
            """
            SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'saved_networks'
              AND COLUMN_NAME = 'pass_review'
            """
        )
        row = cursor.fetchone()
        if row and not row["cnt"]:
            cursor.execute(
                "ALTER TABLE saved_networks ADD COLUMN pass_review TINYINT(1) NOT NULL DEFAULT 0"
            )


@app.on_event("startup")
def startup():
    if not (os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL") or os.getenv("MYSQL_HOST")):
        print("WARN: MySQL env not set for FastAPI")
        return

    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)

class node:
    def __init__(self, node_id):
        if not isinstance(node_id, int) or node_id < 0:
            raise ValueError("node_id 必須是非負整數")
        
        self.__id = node_id
        self.flag = False
        self.pre_node = []
        self.mean_val = 0.0
        self.pre_path = []
        self.output = 0.0
    
    @property
    def id(self):
        return self.__id
    
    def to_dict(self):
        """轉換為字典格式以便 JSON 序列化"""
        return {
            'id': self.id,
            'flag': self.flag,
            'pre_node': self.pre_node,
            'mean_val': round(self.mean_val, 2),
            'output': self.output
        }
    
    def __str__(self):
        return f"Node(id={self.id}, flag={self.flag}, pre_node={self.pre_node}, mean_val={self.mean_val:.2f}, output={self.output})"
    
    def __repr__(self):
        return self.__str__()


def network_generator(N):
    if N < 2:
        raise ValueError("網路至少需要2個節點(起始節點和終端節點)")
    
    # 1. 建立N個節點實體
    network = [node(i) for i in range(N)]
    
    # 2. 設定所有節點的 mean_val(隨機浮點數)
    for pnode in network:
        pnode.mean_val = random.uniform(0, 100)
    
    # 3. 設定起始節點(pnode)
    # pre_node 保持為空列表 []
    
    # 4. 追蹤每個節點是否被其他節點引用
    referenced_nodes = set()
    
    # 5. 為中間節點和終端節點設定 pre_node
    for i in range(1, N):
        current_node = network[i]
        
        # 可選擇的前驅節點範圍: 0 到 i-1
        available_nodes = list(range(i))
        
        # 隨機決定選擇1到3個前驅節點
        num_pre_nodes = random.randint(1, min(3, len(available_nodes)))
        
        # 隨機選擇前驅節點
        selected_pre_nodes = random.sample(available_nodes, num_pre_nodes)
        current_node.pre_node = sorted(selected_pre_nodes)
        
        # 記錄被引用的節點
        referenced_nodes.update(selected_pre_nodes)
    
    # 6. 確保所有中間節點至少被引用一次
    unreferenced_nodes = set(range(N-1)) - referenced_nodes
    
    for unreferenced_id in unreferenced_nodes:
        possible_referrers = list(range(unreferenced_id + 1, N))
        
        if possible_referrers:
            referrer_id = random.choice(possible_referrers)
            
            if unreferenced_id not in network[referrer_id].pre_node:
                network[referrer_id].pre_node.append(unreferenced_id)
                network[referrer_id].pre_node.sort()
    
    return network


def validate_node_inputs(nodes: List[NodeInput]) -> List[str]:
    errors = []
    N = len(nodes)

    if N < 2:
        return ["節點數量必須至少為 2。"]

    if N > 50:
        errors.append("節點數量不能超過 50。")

    node_ids = [pnode.id for pnode in nodes]
    expected_ids = list(range(N))
    if sorted(node_ids) != expected_ids:
        errors.append("節點 ID 必須從 0 開始且連續，不可重複或缺漏。")

    node_by_id = {pnode.id: pnode for pnode in nodes}
    all_referenced_node_ids = set()

    start_node = node_by_id.get(0)
    if start_node and start_node.previousNodes:
        errors.append("節點 0 (起始節點) 的 Previous Nodes 必須為空。")

    for pnode in nodes:
        if pnode.flag is not False:
            errors.append(f"節點 {pnode.id} 的 Flag 必須為 false。")

        if pnode.output != 0.0:
            errors.append(f"節點 {pnode.id} 的 Output 必須為 0.0。")

        if pnode.id != 0 and not pnode.previousNodes:
            errors.append(f"節點 {pnode.id} (非起始節點) 至少要有一個 Previous Node。")

        if len(pnode.previousNodes) != len(set(pnode.previousNodes)):
            errors.append(f"節點 {pnode.id} 的 Previous Nodes 不可包含重複 ID。")

        for previous_id in pnode.previousNodes:
            if previous_id < 0 or previous_id not in node_by_id:
                errors.append(f"節點 {pnode.id} 引用了不存在的 Previous Node ID {previous_id}。")
                continue
            if previous_id == pnode.id:
                errors.append(f"節點 {pnode.id} 的 Previous Nodes 不可包含自己的 ID。")
            if previous_id == N - 1:
                errors.append(f"節點 {pnode.id} 的 Previous Nodes 不可包含終端節點 ID ({N - 1})。")
            if previous_id > pnode.id:
                errors.append(f"節點 {pnode.id} 不可引用後序節點 {previous_id}，以避免形成循環。")
            all_referenced_node_ids.add(previous_id)

    for node_id in range(N - 1):
        if node_id not in all_referenced_node_ids:
            errors.append(f"節點 {node_id} 未被任何其他節點引用，可能導致網路斷開。")

    if has_cycle(nodes):
        errors.append("網路不可包含循環連結。")

    return errors


def validate_draft_nodes(nodes: List[NodeInput]) -> List[str]:
    if not nodes:
        return ["至少需要一個節點。"]
    if len(nodes) > 50:
        return ["節點數量不能超過 50。"]
    return []


def has_cycle(nodes: List[NodeInput]) -> bool:
    graph = {pnode.id: [] for pnode in nodes}
    for pnode in nodes:
        for previous_id in pnode.previousNodes:
            if previous_id in graph:
                graph[previous_id].append(pnode.id)

    visiting = set()
    visited = set()

    def visit(node_id):
        if node_id in visiting:
            return True
        if node_id in visited:
            return False

        visiting.add(node_id)
        for next_id in graph.get(node_id, []):
            if visit(next_id):
                return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    return any(visit(node_id) for node_id in graph)


def inputs_to_network(nodes: List[NodeInput]):
    network = []
    for pnode_data in sorted(nodes, key=lambda item: item.id):
        pnode = node(pnode_data.id)
        pnode.flag = pnode_data.flag
        pnode.pre_node = sorted(pnode_data.previousNodes)
        pnode.mean_val = float(pnode_data.meanTime)
        pnode.output = float(pnode_data.output)
        network.append(pnode)
    return network


def network_to_inputs(network) -> List[NodeInput]:
    return [
        NodeInput(
            id=pnode.id,
            previousNodes=pnode.pre_node,
            meanTime=round(pnode.mean_val, 2),
            flag=pnode.flag,
            output=pnode.output,
        )
        for pnode in network
    ]


def compact_from_node_inputs(nodes: List[NodeInput]) -> tuple[int, List[List[int]], List[float]]:
    ordered = sorted(nodes, key=lambda item: item.id)
    n = len(ordered)
    predecessors = [list(p.previousNodes) for p in ordered]
    mean_times = [float(p.meanTime) for p in ordered]
    return n, predecessors, mean_times


def node_inputs_from_compact(
    node_count: int,
    predecessors: List[List[int]],
    mean_times: List[float],
) -> List[NodeInput]:
    if len(predecessors) != node_count or len(mean_times) != node_count:
        raise HTTPException(status_code=500, detail="儲存的網路資料長度不一致")
    return [
        NodeInput(
            id=i,
            previousNodes=list(predecessors[i]),
            meanTime=float(mean_times[i]),
            flag=False,
            output=0.0,
        )
        for i in range(node_count)
    ]


def row_to_saved_network_response(
    row,
    graph_uri: Optional[str] = None,
    include_graph: bool = True,
) -> SavedNetworkResponse:
    predecessors_raw = row["predecessors_json"]
    mean_times_raw = row["mean_times_json"]
    predecessors = json.loads(predecessors_raw) if isinstance(predecessors_raw, str) else predecessors_raw
    mean_times = json.loads(mean_times_raw) if isinstance(mean_times_raw, str) else mean_times_raw
    node_count = int(row["node_count"])
    nodes = node_inputs_from_compact(node_count, predecessors, mean_times)
    if include_graph:
        if not graph_uri:
            network = inputs_to_network(nodes)
            graph_uri = f"data:image/png;base64,{network_graph_to_base64(network)}"
    else:
        graph_uri = graph_uri or ""
    return SavedNetworkResponse(
        id=row["id"],
        userId=int(row["user_id"]),
        name=row["name"],
        nodeCount=node_count,
        predecessors=predecessors,
        meanTimes=mean_times,
        nodes=nodes,
        graph=graph_uri,
        passReview=bool(row.get("pass_review", 0)),
    )


def fetch_network_row(connection, network_id: int, user_id: int):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM saved_networks WHERE id = %s AND user_id = %s",
            (network_id, user_id),
        )
        row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="找不到網路")
    return row


def persist_network_nodes(
    connection,
    user_id: int,
    network_name: str,
    nodes: List[NodeInput],
    pass_review: bool,
    network_id: Optional[int] = None,
) -> dict:
    node_count, predecessors, mean_times = compact_from_node_inputs(nodes)
    predecessors_payload = json.dumps(predecessors)
    mean_times_payload = json.dumps(mean_times)
    pass_review_value = 1 if pass_review else 0

    with connection.cursor() as cursor:
        if network_id is not None:
            cursor.execute(
                """
                UPDATE saved_networks
                SET node_count = %s,
                    predecessors_json = %s,
                    mean_times_json = %s,
                    pass_review = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND user_id = %s
                """,
                (
                    node_count,
                    predecessors_payload,
                    mean_times_payload,
                    pass_review_value,
                    network_id,
                    user_id,
                ),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="找不到網路")
            return fetch_network_row(connection, network_id, user_id)

        try:
            cursor.execute(
                """
                INSERT INTO saved_networks (
                    user_id, name, node_count,
                    predecessors_json, mean_times_json, pass_review
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    node_count = VALUES(node_count),
                    predecessors_json = VALUES(predecessors_json),
                    mean_times_json = VALUES(mean_times_json),
                    pass_review = VALUES(pass_review),
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    user_id,
                    network_name,
                    node_count,
                    predecessors_payload,
                    mean_times_payload,
                    pass_review_value,
                ),
            )
        except pymysql.err.IntegrityError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        cursor.execute(
            "SELECT * FROM saved_networks WHERE user_id = %s AND name = %s",
            (user_id, network_name),
        )
        return cursor.fetchone()


def ensure_user_exists(connection, user_id: int):
    with connection.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="找不到使用者")


def network_graph_to_base64(my_network):
    N = len(my_network)
    
    # 建立圖形
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # 計算節點位置(使用分層佈局)
    def get_node_level(node_id, network):
        """計算節點所在的層級"""
        if node_id == 0:
            return 0
        if not network[node_id].pre_node:
            return 0
        return max(get_node_level(pre_id, network) for pre_id in network[node_id].pre_node) + 1
    
    # 計算每個節點的層級
    node_levels = [get_node_level(i, my_network) for i in range(N)]
    max_level = max(node_levels)
    
    # 按層級分組節點
    levels = {}
    for i, level in enumerate(node_levels):
        if level not in levels:
            levels[level] = []
        levels[level].append(i)
    
    # 計算節點座標
    positions = {}
    for level, nodes_in_level in levels.items():
        num_nodes = len(nodes_in_level)
        x = level * 2
        
        if num_nodes == 1:
            y_positions = [0]  # 修復：單個節點時放在中央
        else:
            y_positions = np.linspace(-num_nodes/2, num_nodes/2, num_nodes)
        
        for idx, node_id in enumerate(nodes_in_level):
            positions[node_id] = (x, y_positions[idx])
    
    # 繪製連接線(箭頭)
    for pnode in my_network:
        target_id = pnode.id
        target_pos = positions[target_id]
        
        for source_id in pnode.pre_node:
            source_pos = positions[source_id]
            
            arrow = FancyArrowPatch(
                source_pos, target_pos,
                arrowstyle='->,head_width=0.4,head_length=0.8',
                color='gray',
                linewidth=1.5,
                alpha=0.6,
                connectionstyle="arc3,rad=0.1",
                zorder=1
            )
            ax.add_patch(arrow)
    
    # 繪製節點
    for node_id, (x, y) in positions.items():
        if node_id == 0:
            color = 'lightgreen'
        elif node_id == N - 1:
            color = 'lightcoral'
        else:
            color = 'lightblue'
        
        circle = mpatches.Circle((x, y), 0.3, color=color, ec='black', linewidth=2, zorder=2)
        ax.add_patch(circle)
        
        ax.text(x, y, str(node_id), ha='center', va='center', 
                fontsize=12, fontweight='bold', zorder=3)
    
    # 設定圖形屬性
    ax.set_aspect('equal')
    ax.autoscale()
    ax.margins(0.2)
    ax.axis('off')
    
    plt.title(f'Network Visualization (N={N} nodes)', fontsize=16, fontweight='bold')
    
    legend_elements = [
        mpatches.Patch(facecolor='lightgreen', edgecolor='black', label='Start Node'),
        mpatches.Patch(facecolor='lightblue', edgecolor='black', label='Middle Node'),
        mpatches.Patch(facecolor='lightcoral', edgecolor='black', label='End Node')
    ]
    ax.legend(handles=legend_elements, loc='upper right', fontsize=10)
    
    plt.tight_layout()
    
    # 將圖形轉換為 base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    plt.close('all')

    return img_base64


@app.post("/api/python/auth/register", response_model=ApiMessageResponse)
def register_user(request: UserRegisterRequest):
    email = request.email.strip().lower()
    if not email or not request.passwordHash:
        raise HTTPException(status_code=400, detail="請提供電子郵件和密碼")

    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="此電子郵件已被註冊")

            cursor.execute(
                "INSERT INTO users (email, password_hash, provider) VALUES (%s, %s, %s)",
                (email, request.passwordHash, "credentials"),
            )
            user_id = cursor.lastrowid

    return ApiMessageResponse(
        message="註冊成功",
        user=UserResponse(id=user_id, email=email),
    )


@app.post("/api/python/auth/user-by-email", response_model=Optional[UserResponse])
def user_by_email(request: OAuthUserRequest):
    email = request.email.strip().lower()
    if not email:
        return None

    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, email, name FROM users WHERE email = %s", (email,))
            row = cursor.fetchone()
            if not row:
                return None

    return UserResponse(id=row["id"], email=row["email"], name=row["name"])


@app.post("/api/python/auth/verify", response_model=Optional[UserResponse])
def verify_user(request: UserVerifyRequest):
    email = request.email.strip().lower()
    if not email or not request.password:
        return None

    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, email, name, password_hash FROM users WHERE email = %s",
                (email,),
            )
            row = cursor.fetchone()

    if not row or not row["password_hash"]:
        return None

    password_ok = bcrypt.checkpw(
        request.password.encode("utf-8"),
        row["password_hash"].encode("utf-8"),
    )
    if not password_ok:
        return None

    return UserResponse(id=row["id"], email=row["email"], name=row["name"])


@app.post("/api/python/auth/oauth-user", response_model=UserResponse)
def ensure_oauth_user(request: OAuthUserRequest):
    email = request.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="缺少 OAuth 電子郵件")

    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, email, name FROM users WHERE email = %s", (email,))
            row = cursor.fetchone()
            if row:
                if request.name and row["name"] != request.name:
                    cursor.execute("UPDATE users SET name = %s WHERE id = %s", (request.name, row["id"]))
                    row["name"] = request.name
                return UserResponse(id=row["id"], email=row["email"], name=row["name"])

            cursor.execute(
                "INSERT INTO users (email, name, provider) VALUES (%s, %s, %s)",
                (email, request.name, request.provider),
            )
            user_id = cursor.lastrowid

    return UserResponse(id=user_id, email=email, name=request.name)

@app.get("/api/python/network-generation", response_model=NetworkResponse)
def get_network(n: int):
    if n < 2:
        raise HTTPException(status_code=400, detail="節點數量必須至少為 2")
    if n > 50:
        raise HTTPException(status_code=400, detail="節點數量不能超過 50")

    try:
        network = network_generator(n)
        graph_base64 = network_graph_to_base64(network)
        
        response_data = {
            'success': True,
            'nodeCount': n,
            'nodes': [node.to_dict() for node in network],
            'graph': f'data:image/png;base64,{graph_base64}'
        }
        return JSONResponse(content=response_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.post("/api/python/validate-nodes", response_model=ValidateNodesResponse)
def validate_nodes(request: GraphNetworkRequest):
    errors = validate_node_inputs(request.nodes)
    return ValidateNodesResponse(
        success=len(errors) == 0,
        passed=len(errors) == 0,
        errors=errors,
    )


@app.post("/api/python/networks/graph", response_model=SavedNetworkResponse)
def save_network_graph(request: SaveNetworkRequest):
    network_name = request.name.strip()
    if not network_name:
        raise HTTPException(status_code=400, detail="網路名稱不可為空")

    if request.draft:
        errors = validate_draft_nodes(request.nodes)
    else:
        errors = validate_node_inputs(request.nodes)
    if errors:
        raise HTTPException(status_code=400, detail={"message": "節點資料驗證失敗", "errors": errors})

    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)
        ensure_user_exists(connection, request.userId)
        network_row = persist_network_nodes(
            connection,
            request.userId,
            network_name,
            request.nodes,
            pass_review=request.passReview and not request.draft,
        )

    return row_to_saved_network_response(
        network_row,
        request.graph,
        include_graph=request.graph is not None,
    )


@app.put("/api/python/networks/{network_id}", response_model=SavedNetworkResponse)
def update_network(network_id: int, request: UpdateNetworkRequest):
    if request.draft:
        errors = validate_draft_nodes(request.nodes)
    else:
        errors = validate_node_inputs(request.nodes)
    if errors:
        raise HTTPException(status_code=400, detail={"message": "節點資料驗證失敗", "errors": errors})

    pass_review = False if request.passReview is None else request.passReview
    if request.draft:
        pass_review = False

    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)
        ensure_user_exists(connection, request.userId)
        fetch_network_row(connection, network_id, request.userId)
        network_row = persist_network_nodes(
            connection,
            request.userId,
            "",
            request.nodes,
            pass_review=pass_review,
            network_id=network_id,
        )

    return row_to_saved_network_response(
        network_row,
        request.graph,
        include_graph=request.graph is not None,
    )


@app.post("/api/python/networks/{network_id}/review", response_model=SavedNetworkResponse)
def review_network(network_id: int, request: ReviewNetworkRequest):
    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)
        ensure_user_exists(connection, request.userId)
        row = fetch_network_row(connection, network_id, request.userId)
        predecessors = json.loads(row["predecessors_json"]) if isinstance(row["predecessors_json"], str) else row["predecessors_json"]
        mean_times = json.loads(row["mean_times_json"]) if isinstance(row["mean_times_json"], str) else row["mean_times_json"]
        nodes = node_inputs_from_compact(int(row["node_count"]), predecessors, mean_times)

        errors = validate_node_inputs(nodes)
        if errors:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE saved_networks SET pass_review = 0 WHERE id = %s AND user_id = %s",
                    (network_id, request.userId),
                )
            raise HTTPException(
                status_code=400,
                detail={"message": "審查未通過", "errors": errors},
            )

        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE saved_networks SET pass_review = 1, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND user_id = %s",
                (network_id, request.userId),
            )
        row = fetch_network_row(connection, network_id, request.userId)

    return row_to_saved_network_response(row, include_graph=False)


@app.get("/api/python/networks", response_model=List[SavedNetworkResponse])
def list_networks(userId: int, includeGraph: bool = False):
    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM saved_networks WHERE user_id = %s ORDER BY updated_at DESC",
                (userId,),
            )
            rows = cursor.fetchall()

    return [
        row_to_saved_network_response(row, include_graph=includeGraph)
        for row in rows
    ]


@app.post("/api/python/graph-network", response_model=NetworkResponse)
def graph_network(request: GraphNetworkRequest):
    errors = validate_node_inputs(request.nodes)
    if errors:
        raise HTTPException(status_code=400, detail={"message": "Node Table 驗證失敗", "errors": errors})

    try:
        network = inputs_to_network(request.nodes)
        graph_base64 = network_graph_to_base64(network)

        response_data = {
            "success": True,
            "nodeCount": len(network),
            "nodes": [pnode.to_dict() for pnode in network],
            "graph": f"data:image/png;base64,{graph_base64}",
        }
        return JSONResponse(content=response_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")