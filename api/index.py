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
from contextlib import contextmanager
from typing import List, Optional
from urllib.parse import unquote, urlparse

import pymysql
from pymysql.cursors import DictCursor

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


class NodeTableCreateRequest(BaseModel):
    ownerUserId: str
    name: str
    nodes: List[NodeInput]


class NodeTableUpdateRequest(BaseModel):
    ownerUserId: str
    name: Optional[str] = None
    nodes: List[NodeInput]


class NodeTableResponse(BaseModel):
    id: int
    ownerUserId: str
    name: str
    passFlag: bool
    nodes: List[NodeInput]


class ReviewResponse(BaseModel):
    success: bool
    passed: bool
    errors: List[str]
    nodeTable: Optional[NodeTableResponse] = None


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


class NetworkCreateRequest(BaseModel):
    ownerUserId: str
    nodeTableId: int
    networkName: Optional[str] = None


class SavedNetworkResponse(BaseModel):
    id: int
    ownerUserId: str
    nodeTableId: int
    name: str
    nodes: List[NodeInput]
    graph: str


def _database_config():
    database_url = os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL")
    if database_url:
        parsed = urlparse(database_url)
        return {
            "host": parsed.hostname,
            "port": parsed.port or 3306,
            "user": unquote(parsed.username) if parsed.username else None,
            "password": unquote(parsed.password) if parsed.password else None,
            "database": parsed.path.lstrip("/"),
        }

    return {
        "host": os.getenv("MYSQL_HOST"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER"),
        "password": os.getenv("MYSQL_PASSWORD"),
        "database": os.getenv("MYSQL_DATABASE"),
    }


@contextmanager
def db_connection():
    config = _database_config()
    missing = [key for key in ("host", "user", "database") if not config.get(key)]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"MySQL is not configured. Missing: {', '.join(missing)}",
        )

    connection = pymysql.connect(
        **config,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


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
            CREATE TABLE IF NOT EXISTS node_tables (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                owner_user_id VARCHAR(64) NOT NULL,
                name VARCHAR(191) NOT NULL,
                pass_flag BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_node_tables_owner_name (owner_user_id, name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS node_table_nodes (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                node_table_id BIGINT NOT NULL,
                node_id INT NOT NULL,
                previous_nodes JSON NOT NULL,
                mean_time DOUBLE NOT NULL DEFAULT 0,
                flag BOOLEAN NOT NULL DEFAULT FALSE,
                output DOUBLE NOT NULL DEFAULT 0,
                UNIQUE KEY uq_node_table_nodes_table_node (node_table_id, node_id),
                CONSTRAINT fk_node_table_nodes_table
                    FOREIGN KEY (node_table_id)
                    REFERENCES node_tables(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS networks (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                owner_user_id VARCHAR(64) NOT NULL,
                node_table_id BIGINT NOT NULL,
                name VARCHAR(191) NOT NULL,
                nodes_json JSON NOT NULL,
                graph LONGTEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_networks_owner_name (owner_user_id, name),
                CONSTRAINT fk_networks_node_table
                    FOREIGN KEY (node_table_id)
                    REFERENCES node_tables(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )


@app.on_event("startup")
def startup():
    config = _database_config()
    if not all(config.get(key) for key in ("host", "user", "database")):
        return

    with db_connection() as connection:
        init_schema(connection)

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


def row_to_node_table(connection, table_row) -> NodeTableResponse:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT node_id, previous_nodes, mean_time, flag, output
            FROM node_table_nodes
            WHERE node_table_id = %s
            ORDER BY node_id ASC
            """,
            (table_row["id"],),
        )
        node_rows = cursor.fetchall()

    nodes = [
        NodeInput(
            id=row["node_id"],
            previousNodes=json.loads(row["previous_nodes"]),
            meanTime=float(row["mean_time"]),
            flag=bool(row["flag"]),
            output=float(row["output"]),
        )
        for row in node_rows
    ]

    return NodeTableResponse(
        id=table_row["id"],
        ownerUserId=str(table_row["owner_user_id"]),
        name=table_row["name"],
        passFlag=bool(table_row["pass_flag"]),
        nodes=nodes,
    )


def save_node_rows(connection, node_table_id: int, nodes: List[NodeInput]):
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM node_table_nodes WHERE node_table_id = %s", (node_table_id,))
        for pnode in sorted(nodes, key=lambda item: item.id):
            cursor.execute(
                """
                INSERT INTO node_table_nodes
                    (node_table_id, node_id, previous_nodes, mean_time, flag, output)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    node_table_id,
                    pnode.id,
                    json.dumps(pnode.previousNodes),
                    pnode.meanTime,
                    pnode.flag,
                    pnode.output,
                ),
            )


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

@app.post("/api/python/node-tables", response_model=NodeTableResponse)
def create_node_table(request: NodeTableCreateRequest):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Node Table 名稱不可為空")

    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            try:
                cursor.execute(
                    "INSERT INTO node_tables (owner_user_id, name, pass_flag) VALUES (%s, %s, FALSE)",
                    (request.ownerUserId, name),
                )
            except pymysql.err.IntegrityError:
                raise HTTPException(status_code=400, detail="同名 Node Table 已存在")
            node_table_id = cursor.lastrowid
        save_node_rows(connection, node_table_id, request.nodes)
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM node_tables WHERE id = %s", (node_table_id,))
            row = cursor.fetchone()
        response = row_to_node_table(connection, row)

    return response


@app.get("/api/python/node-tables", response_model=List[NodeTableResponse])
def list_node_tables(ownerUserId: str):
    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM node_tables WHERE owner_user_id = %s ORDER BY updated_at DESC",
                (ownerUserId,),
            )
            rows = cursor.fetchall()
        return [row_to_node_table(connection, row) for row in rows]


@app.put("/api/python/node-tables/{node_table_id}", response_model=NodeTableResponse)
def update_node_table(node_table_id: int, request: NodeTableUpdateRequest):
    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM node_tables WHERE id = %s AND owner_user_id = %s",
                (node_table_id, request.ownerUserId),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="找不到指定的 Node Table")

            new_name = (request.name or row["name"]).strip()
            try:
                cursor.execute(
                    """
                    UPDATE node_tables
                    SET name = %s, pass_flag = FALSE
                    WHERE id = %s AND owner_user_id = %s
                    """,
                    (new_name, node_table_id, request.ownerUserId),
                )
            except pymysql.err.IntegrityError:
                raise HTTPException(status_code=400, detail="同名 Node Table 已存在")

        save_node_rows(connection, node_table_id, request.nodes)
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM node_tables WHERE id = %s", (node_table_id,))
            updated_row = cursor.fetchone()
        response = row_to_node_table(connection, updated_row)

    return response


@app.post("/api/python/node-tables/{node_table_id}/review", response_model=ReviewResponse)
def review_node_table(node_table_id: int, ownerUserId: str):
    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM node_tables WHERE id = %s AND owner_user_id = %s",
                (node_table_id, ownerUserId),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="找不到指定的 Node Table")

        node_table = row_to_node_table(connection, row)
        errors = validate_node_inputs(node_table.nodes)

        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE node_tables SET pass_flag = %s WHERE id = %s",
                (len(errors) == 0, node_table_id),
            )
            cursor.execute("SELECT * FROM node_tables WHERE id = %s", (node_table_id,))
            updated_row = cursor.fetchone()
        updated_node_table = row_to_node_table(connection, updated_row)

    return ReviewResponse(
        success=len(errors) == 0,
        passed=len(errors) == 0,
        errors=errors,
        nodeTable=updated_node_table,
    )


@app.post("/api/python/networks/graph", response_model=SavedNetworkResponse)
def create_network_from_table(request: NetworkCreateRequest):
    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM node_tables WHERE id = %s AND owner_user_id = %s",
                (request.nodeTableId, request.ownerUserId),
            )
            table_row = cursor.fetchone()
            if not table_row:
                raise HTTPException(status_code=404, detail="找不到指定的 Node Table")
            if not table_row["pass_flag"]:
                raise HTTPException(status_code=400, detail="Node Table 尚未通過審查")

        node_table = row_to_node_table(connection, table_row)
        errors = validate_node_inputs(node_table.nodes)
        if errors:
            raise HTTPException(status_code=400, detail={"message": "Node Table 驗證失敗", "errors": errors})

        network_name = (request.networkName or node_table.name).strip() or node_table.name
        network = inputs_to_network(node_table.nodes)
        graph_base64 = network_graph_to_base64(network)
        graph = f"data:image/png;base64,{graph_base64}"

        nodes_json = json.dumps([node_input.dict() for node_input in node_table.nodes])
        with connection.cursor() as cursor:
            try:
                cursor.execute(
                    """
                    INSERT INTO networks (owner_user_id, node_table_id, name, nodes_json, graph)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        node_table_id = VALUES(node_table_id),
                        nodes_json = VALUES(nodes_json),
                        graph = VALUES(graph),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (request.ownerUserId, request.nodeTableId, network_name, nodes_json, graph),
                )
            except pymysql.err.IntegrityError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

            cursor.execute(
                "SELECT * FROM networks WHERE owner_user_id = %s AND name = %s",
                (request.ownerUserId, network_name),
            )
            network_row = cursor.fetchone()

    return SavedNetworkResponse(
        id=network_row["id"],
        ownerUserId=str(network_row["owner_user_id"]),
        nodeTableId=network_row["node_table_id"],
        name=network_row["name"],
        nodes=node_table.nodes,
        graph=network_row["graph"],
    )


@app.get("/api/python/networks", response_model=List[SavedNetworkResponse])
def list_networks(ownerUserId: str):
    with db_connection() as connection:
        init_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM networks WHERE owner_user_id = %s ORDER BY updated_at DESC",
                (ownerUserId,),
            )
            rows = cursor.fetchall()

    return [
        SavedNetworkResponse(
            id=row["id"],
            ownerUserId=str(row["owner_user_id"]),
            nodeTableId=row["node_table_id"],
            name=row["name"],
            nodes=[NodeInput(**node_data) for node_data in json.loads(row["nodes_json"])],
            graph=row["graph"],
        )
        for row in rows
    ]


class GraphNetworkRequest(BaseModel):
    nodes: List[NodeInput]


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