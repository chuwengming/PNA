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
from typing import Any, Dict, List, Optional

import pymysql

from api.database import db_connection
from api.network.ets_node import (
    ETSNode,
    create_ets_node,
    default_outputs,
    ets_nodes_from_planning,
)
from api.analysis.lcta import LCTAError, run_lcta
from api.network.stochastic import (
    compact_output_from_dict,
    compact_output_notation,
    default_compact_output,
    distribution_variance,
    initial_stochastic,
    is_initial_compact_output,
    node_time_mean,
    stochastic_from_dict,
    stochastic_notation,
    stochastic_to_dict,
)
from api.rag.config import DOCS_INDEX_FILE
from api.rag.ingest import build_index, index_status
from api.rag.query import GenerationError, GenerationQuotaError, answer_question

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


def _ensure_docs_index() -> None:
    if DOCS_INDEX_FILE.exists():
        return
    try:
        result = build_index()
        print(
            "[docs-rag] 已建立索引:",
            result["index_file"],
            f"({result['chunk_count']} chunks, {result.get('embedding_provider')})",
        )
    except Exception as error:
        print(f"[docs-rag] 索引建立失敗: {error}")
        print(
            "[docs-rag] 請在本機執行: npm run build-docs-index"
        )


@app.on_event("startup")
def prepare_docs_index() -> None:
    _ensure_docs_index()

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


class StochasticVariableModel(BaseModel):
    values: List[float] = Field(default_factory=lambda: [0.0])
    probabilities: List[float] = Field(default_factory=lambda: [1.0])
    mean: float = 0.0
    stdDev: float = 0.0
    method: str = "initial"
    notation: Optional[str] = None


class OutputSummaryModel(BaseModel):
    """Persisted Output_i: [E(Output_i), Var(Output_i)]."""
    mean: float = 0.0
    variance: float = 0.0


class LctaResultModel(BaseModel):
    """LCTA network completion time PDF (linked to saved network)."""
    rootNodeId: int
    mean: float
    variance: float
    values: List[float]
    probabilities: List[float]
    notation: Optional[str] = None


class NodeInput(BaseModel):
    """ETS node — API / frontend payload (see docs/definitions/07-ets-node-structure.md)."""
    id: int = Field(ge=0)
    precNode: List[int] = Field(default_factory=list)
    nodeTime: float = 0.0
    finishFlag: bool = False
    output: Optional[OutputSummaryModel] = None
    outputNotation: Optional[str] = None


class GraphNetworkRequest(BaseModel):
    nodes: List[NodeInput]


class ValidateNodesResponse(BaseModel):
    success: bool
    passed: bool
    errors: List[str]


class NetworkNode(BaseModel):
    id: int
    precNode: List[int]
    nodeTime: float
    finishFlag: bool
    output: OutputSummaryModel
    outputNotation: str

class NetworkResponse(BaseModel):
    success: bool
    nodeCount: int
    nodes: List[NetworkNode]
    graph: str


class DocsAskRequest(BaseModel):
    question: str


class DocsAskResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    model: str
    web_search_used: bool = False
    web_search_queries: List[str] = Field(default_factory=list)


class DocsIndexStatusResponse(BaseModel):
    ready: bool
    index_file: str
    chunk_count: int
    sources: List[str]
    created_at: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_dimension: Optional[int] = None


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


class UpdateEtsRuntimeRequest(BaseModel):
    """Persist algorithm runtime fields without resetting to planning defaults."""
    userId: int
    nodes: List[NodeInput]


class RunLctaRequest(BaseModel):
    userId: int


class LctaAnalysisResponse(BaseModel):
    success: bool
    cached: bool = False
    completionTime: StochasticVariableModel
    completionTimeNotation: str
    completionTimeMean: float
    rootNodeId: int
    lctaResult: LctaResultModel
    nodes: List[NodeInput]
    graph: str


class SavedNetworkResponse(BaseModel):
    """儲存與回傳：ETS 節點快照 + 還原後 nodes（供前端表格與繪圖）。"""
    id: int
    userId: int
    name: str
    nodeCount: int
    precNodes: List[List[int]]
    nodeTimes: List[float]
    finishFlags: List[bool]
    outputs: List[OutputSummaryModel]
    lctaResult: Optional[LctaResultModel] = None
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
                prec_nodes_json JSON NOT NULL,
                node_times_json JSON NOT NULL,
                finish_flags_json JSON NOT NULL,
                outputs_json JSON NOT NULL,
                lcta_result_json JSON NULL,
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
    """資料表遷移：graph 移除、pass_review、ETS 欄位、舊欄位更名。"""
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

        # predecessors_json -> prec_nodes_json
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'saved_networks'
              AND COLUMN_NAME = 'prec_nodes_json'
            """
        )
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute(
                """
                SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'saved_networks'
                  AND COLUMN_NAME = 'predecessors_json'
                """
            )
            if cursor.fetchone()["cnt"]:
                cursor.execute(
                    "ALTER TABLE saved_networks CHANGE COLUMN predecessors_json prec_nodes_json JSON NOT NULL"
                )
            else:
                cursor.execute(
                    "ALTER TABLE saved_networks ADD COLUMN prec_nodes_json JSON NOT NULL"
                )

        # mean_times_json -> node_times_json
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'saved_networks'
              AND COLUMN_NAME = 'node_times_json'
            """
        )
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute(
                """
                SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'saved_networks'
                  AND COLUMN_NAME = 'mean_times_json'
                """
            )
            if cursor.fetchone()["cnt"]:
                cursor.execute(
                    "ALTER TABLE saved_networks CHANGE COLUMN mean_times_json node_times_json JSON NOT NULL"
                )
            else:
                cursor.execute(
                    "ALTER TABLE saved_networks ADD COLUMN node_times_json JSON NOT NULL"
                )

        for col in ("finish_flags_json", "outputs_json"):
            cursor.execute(
                """
                SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'saved_networks'
                  AND COLUMN_NAME = %s
                """,
                (col,),
            )
            if cursor.fetchone()["cnt"] == 0:
                cursor.execute(
                    f"ALTER TABLE saved_networks ADD COLUMN {col} JSON NOT NULL"
                )

        cursor.execute(
            """
            SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'saved_networks'
              AND COLUMN_NAME = 'lcta_result_json'
            """
        )
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute(
                "ALTER TABLE saved_networks ADD COLUMN lcta_result_json JSON NULL"
            )

        # Backfill / normalize ETS columns; convert outputs to compact [E, Var]
        cursor.execute(
            "SELECT id, node_count, prec_nodes_json, outputs_json, finish_flags_json FROM saved_networks"
        )
        for row in cursor.fetchall():
            n = int(row["node_count"])
            finish_raw = row.get("finish_flags_json")
            finish = json.loads(finish_raw) if isinstance(finish_raw, str) else (finish_raw or [])
            if not finish or len(finish) != n:
                cursor.execute(
                    "UPDATE saved_networks SET finish_flags_json = %s WHERE id = %s",
                    (json.dumps([False] * n), row["id"]),
                )

            outputs_raw = row.get("outputs_json")
            outputs = json.loads(outputs_raw) if isinstance(outputs_raw, str) else (outputs_raw or [])
            compact_outputs = []
            needs_update = not outputs or len(outputs) != n
            for i in range(n):
                if i < len(outputs) and isinstance(outputs[i], dict):
                    compact_outputs.append(compact_output_from_dict(outputs[i]))
                else:
                    compact_outputs.append(default_compact_output())
                    needs_update = True
                if i < len(outputs) and isinstance(outputs[i], dict):
                    if "values" in outputs[i]:
                        needs_update = True
            if needs_update:
                cursor.execute(
                    "UPDATE saved_networks SET outputs_json = %s WHERE id = %s",
                    (json.dumps(compact_outputs), row["id"]),
                )

        for legacy_col in ("path_flags_json", "path_times_json"):
            cursor.execute(
                """
                SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'saved_networks'
                  AND COLUMN_NAME = %s
                """,
                (legacy_col,),
            )
            if cursor.fetchone()["cnt"]:
                cursor.execute(f"ALTER TABLE saved_networks DROP COLUMN {legacy_col}")


@app.on_event("startup")
def startup():
    if not (os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL") or os.getenv("MYSQL_HOST")):
        print("WARN: MySQL env not set for FastAPI")
        return

    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)

def _is_initial_output(data: dict) -> bool:
    return is_initial_compact_output(data)


def node_input_to_ets(data: NodeInput, reset_runtime: bool = False) -> ETSNode:
    node = create_ets_node(data.id, data.precNode, float(data.nodeTime))
    if reset_runtime:
        node.reset_runtime_state()
        return node
    node.finish_flag = bool(data.finishFlag)
    if data.output is not None:
        node.output = compact_output_from_dict(data.output.model_dump())
    node.sync_path_arrays()
    return node


def ets_to_node_input(node: ETSNode) -> NodeInput:
    d = node.to_api_node(compact_output=True)
    return NodeInput(
        id=d["id"],
        precNode=d["precNode"],
        nodeTime=d["nodeTime"],
        finishFlag=d["finishFlag"],
        output=OutputSummaryModel(**d["output"]),
        outputNotation=d["outputNotation"],
    )


def ets_to_network_node(node: ETSNode) -> NetworkNode:
    d = node.to_api_node(compact_output=True)
    return NetworkNode(
        id=d["id"],
        precNode=d["precNode"],
        nodeTime=d["nodeTime"],
        finishFlag=d["finishFlag"],
        output=OutputSummaryModel(**d["output"]),
        outputNotation=d["outputNotation"],
    )


def _parse_lcta_result(row) -> Optional[LctaResultModel]:
    raw = row.get("lcta_result_json")
    if raw is None:
        return None
    data = json.loads(raw) if isinstance(raw, str) else raw
    if not data:
        return None
    return LctaResultModel(**data)


def _build_lcta_result_payload(result) -> dict:
    ct = result.completion_time
    values = list(ct["values"])
    probabilities = list(ct["probabilities"])
    mean = float(result.completion_mean)
    variance = distribution_variance(values, probabilities, mean)
    return {
        "rootNodeId": int(result.root_id),
        "mean": mean,
        "variance": variance,
        "values": values,
        "probabilities": probabilities,
        "notation": stochastic_notation(ct),
    }


def _lcta_response_from_cache(row) -> LctaAnalysisResponse:
    """Return saved LCTA results without re-running the algorithm."""
    lcta = _parse_lcta_result(row)
    if lcta is None:
        raise HTTPException(status_code=404, detail="No saved LCTA result for this network")

    node_inputs = nodes_from_db_row(row)
    network = ets_from_db_row(row)
    graph_base64 = network_graph_to_base64(network)
    notation = lcta.notation or compact_output_notation(lcta.mean, lcta.variance)
    completion = StochasticVariableModel(
        values=list(lcta.values),
        probabilities=list(lcta.probabilities),
        mean=lcta.mean,
        stdDev=float(lcta.variance**0.5),
        method="lcta_cached",
        notation=notation,
    )
    return LctaAnalysisResponse(
        success=True,
        cached=True,
        completionTime=completion,
        completionTimeNotation=notation,
        completionTimeMean=lcta.mean,
        rootNodeId=lcta.rootNodeId,
        lctaResult=lcta,
        nodes=node_inputs,
        graph=f"data:image/png;base64,{graph_base64}",
    )


def network_generator(N):
    if N < 2:
        raise ValueError("網路至少需要2個節點(起始節點和終端節點)")
    
    # 1. 建立N個節點實體
    network = [ETSNode(i) for i in range(N)]

    for pnode in network:
        pnode.set_node_time_mean(random.uniform(0, 100))

    referenced_nodes = set()

    for i in range(1, N):
        current_node = network[i]
        available_nodes = list(range(i))
        num_pre_nodes = random.randint(1, min(3, len(available_nodes)))
        selected_pre_nodes = random.sample(available_nodes, num_pre_nodes)
        current_node.set_prec_node(selected_pre_nodes)
        referenced_nodes.update(selected_pre_nodes)

    unreferenced_nodes = set(range(N - 1)) - referenced_nodes

    for unreferenced_id in unreferenced_nodes:
        possible_referrers = list(range(unreferenced_id + 1, N))
        if possible_referrers:
            referrer_id = random.choice(possible_referrers)
            referrer = network[referrer_id]
            if unreferenced_id not in referrer.prec_node:
                referrer.set_prec_node(referrer.prec_node + [unreferenced_id])

    for pnode in network:
        pnode.reset_runtime_state()

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
    if start_node and start_node.precNode:
        errors.append("節點 0 (起始節點) 的 Prec_Node 必須為空。")

    for pnode in nodes:
        if pnode.finishFlag is not False:
            errors.append(f"節點 {pnode.id} 的 finish_flag 必須為 false（規劃階段）。")

        out = pnode.output.model_dump() if pnode.output else default_compact_output()
        if not _is_initial_output(out):
            errors.append(f"節點 {pnode.id} 的 Output 必須為初始值 [E: 0, Var: 0]。")

        if pnode.nodeTime < 0:
            errors.append(f"節點 {pnode.id} 的 Node_Time 不可為負。")

        if pnode.id != 0 and not pnode.precNode:
            errors.append(f"節點 {pnode.id} (非起始節點) 至少要有一個 Prec_Node。")

        if len(pnode.precNode) != len(set(pnode.precNode)):
            errors.append(f"節點 {pnode.id} 的 Prec_Node 不可包含重複 ID。")

        for previous_id in pnode.precNode:
            if previous_id < 0 or previous_id not in node_by_id:
                errors.append(f"節點 {pnode.id} 引用了不存在的 Prec_Node ID {previous_id}。")
                continue
            if previous_id == pnode.id:
                errors.append(f"節點 {pnode.id} 的 Prec_Node 不可包含自己的 ID。")
            if previous_id == N - 1:
                errors.append(f"節點 {pnode.id} 的 Prec_Node 不可包含終端節點 ID ({N - 1})。")
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
        for previous_id in pnode.precNode:
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


def inputs_to_network(nodes: List[NodeInput]) -> List[ETSNode]:
    return [node_input_to_ets(p, reset_runtime=False) for p in sorted(nodes, key=lambda item: item.id)]


def network_to_inputs(network: List[ETSNode]) -> List[NodeInput]:
    return [ets_to_node_input(pnode) for pnode in network]


def compact_ets_snapshot(nodes: List[NodeInput], reset_runtime: bool = True) -> dict:
    ordered = sorted(nodes, key=lambda item: item.id)
    ets_list = [node_input_to_ets(p, reset_runtime=reset_runtime) for p in ordered]
    n = len(ets_list)
    if reset_runtime:
        finish_flags = [False] * n
        outputs = [default_compact_output() for _ in range(n)]
    else:
        finish_flags = [e.finish_flag for e in ets_list]
        outputs = [compact_output_from_dict(e.output) for e in ets_list]
    return {
        "node_count": n,
        "prec_nodes": [e.prec_node for e in ets_list],
        "node_times": [e.node_time_mean for e in ets_list],
        "finish_flags": finish_flags,
        "outputs": outputs,
    }


def _load_json_column(raw, fallback):
    if raw is None:
        return fallback
    return json.loads(raw) if isinstance(raw, str) else raw


def ets_from_db_row(row) -> List[ETSNode]:
    node_count = int(row["node_count"])
    prec_nodes = _load_json_column(row.get("prec_nodes_json"), [])
    node_times = _load_json_column(row.get("node_times_json"), [])
    finish_flags = _load_json_column(row.get("finish_flags_json"), [False] * node_count)
    outputs = _load_json_column(row.get("outputs_json"), default_outputs(node_count))

    if len(prec_nodes) != node_count or len(node_times) != node_count:
        raise HTTPException(status_code=500, detail="儲存的 ETS 節點資料長度不一致")

    nodes = ets_nodes_from_planning(node_count, prec_nodes, node_times)
    for i, ets in enumerate(nodes):
        ets.finish_flag = bool(finish_flags[i]) if i < len(finish_flags) else False
        if i < len(outputs) and isinstance(outputs[i], dict):
            ets.output = compact_output_from_dict(outputs[i])
        else:
            ets.output = default_compact_output()
        ets.sync_path_arrays()
    return nodes


def nodes_from_db_row(row) -> List[NodeInput]:
    return [ets_to_node_input(n) for n in ets_from_db_row(row)]


def row_to_saved_network_response(
    row,
    graph_uri: Optional[str] = None,
    include_graph: bool = True,
) -> SavedNetworkResponse:
    node_count = int(row["node_count"])
    nodes = nodes_from_db_row(row)
    prec_nodes = _load_json_column(row.get("prec_nodes_json"), [])
    node_times = _load_json_column(row.get("node_times_json"), [])
    finish_flags = _load_json_column(row.get("finish_flags_json"), [])
    outputs_raw = _load_json_column(row.get("outputs_json"), [])
    lcta_result = _parse_lcta_result(row)

    if include_graph:
        if not graph_uri:
            network = ets_from_db_row(row)
            graph_uri = f"data:image/png;base64,{network_graph_to_base64(network)}"
    else:
        graph_uri = graph_uri or ""

    return SavedNetworkResponse(
        id=row["id"],
        userId=int(row["user_id"]),
        name=row["name"],
        nodeCount=node_count,
        precNodes=prec_nodes,
        nodeTimes=node_times,
        finishFlags=finish_flags,
        outputs=[OutputSummaryModel(**compact_output_from_dict(o)) for o in outputs_raw],
        lctaResult=lcta_result,
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
    reset_runtime: bool = True,
    lcta_result: Optional[dict] = None,
    preserve_analysis: bool = False,
) -> dict:
    snapshot = compact_ets_snapshot(nodes, reset_runtime=reset_runtime)
    if preserve_analysis and network_id is not None:
        existing = fetch_network_row(connection, network_id, user_id)
        node_count = int(snapshot["node_count"])
        snapshot["finish_flags"] = _load_json_column(
            existing.get("finish_flags_json"), [False] * node_count
        )
        snapshot["outputs"] = _load_json_column(
            existing.get("outputs_json"), default_outputs(node_count)
        )

    payloads = {
        "node_count": snapshot["node_count"],
        "prec_nodes": json.dumps(snapshot["prec_nodes"]),
        "node_times": json.dumps(snapshot["node_times"]),
        "finish_flags": json.dumps(snapshot["finish_flags"]),
        "outputs": json.dumps(snapshot["outputs"]),
    }
    if lcta_result is not None:
        lcta_json = json.dumps(lcta_result)
    elif reset_runtime and not preserve_analysis:
        lcta_json = None
    elif preserve_analysis and network_id is not None:
        existing = fetch_network_row(connection, network_id, user_id)
        raw = existing.get("lcta_result_json")
        if raw is None:
            lcta_json = None
        elif isinstance(raw, str):
            lcta_json = raw
        else:
            lcta_json = json.dumps(raw)
    elif network_id is not None:
        existing = fetch_network_row(connection, network_id, user_id)
        raw = existing.get("lcta_result_json")
        if raw is None:
            lcta_json = None
        elif isinstance(raw, str):
            lcta_json = raw
        else:
            lcta_json = json.dumps(raw)
    else:
        lcta_json = None
    pass_review_value = 1 if pass_review else 0

    with connection.cursor() as cursor:
        if network_id is not None:
            cursor.execute(
                """
                UPDATE saved_networks
                SET node_count = %s,
                    prec_nodes_json = %s,
                    node_times_json = %s,
                    finish_flags_json = %s,
                    outputs_json = %s,
                    lcta_result_json = %s,
                    pass_review = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND user_id = %s
                """,
                (
                    payloads["node_count"],
                    payloads["prec_nodes"],
                    payloads["node_times"],
                    payloads["finish_flags"],
                    payloads["outputs"],
                    lcta_json,
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
                    prec_nodes_json, node_times_json,
                    finish_flags_json, outputs_json,
                    lcta_result_json, pass_review
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    node_count = VALUES(node_count),
                    prec_nodes_json = VALUES(prec_nodes_json),
                    node_times_json = VALUES(node_times_json),
                    finish_flags_json = VALUES(finish_flags_json),
                    outputs_json = VALUES(outputs_json),
                    lcta_result_json = VALUES(lcta_result_json),
                    pass_review = VALUES(pass_review),
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    user_id,
                    network_name,
                    payloads["node_count"],
                    payloads["prec_nodes"],
                    payloads["node_times"],
                    payloads["finish_flags"],
                    payloads["outputs"],
                    lcta_json,
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
        if not network[node_id].prec_node:
            return 0
        return max(get_node_level(pre_id, network) for pre_id in network[node_id].prec_node) + 1
    
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
        
        for source_id in pnode.prec_node:
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
            'nodes': [ets_to_network_node(node).model_dump() for node in network],
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
        reset_runtime = True
        preserve_analysis = False
    elif pass_review:
        # Graph Network confirm: keep prior analysis / LCTA PDF if topology unchanged in DB.
        reset_runtime = False
        preserve_analysis = True
    else:
        reset_runtime = True
        preserve_analysis = False

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
            reset_runtime=reset_runtime,
            preserve_analysis=preserve_analysis,
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
        nodes = nodes_from_db_row(row)

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


@app.post("/api/python/networks/{network_id}/lcta", response_model=LctaAnalysisResponse)
def run_lcta_analysis(network_id: int, request: RunLctaRequest):
    """
    Run LCTA in memory (load once → refresh ETS → trace → persist once).
    Returns cached results when lcta_result_json exists (network unchanged since last run).
    Requires pass_review on the saved network.
    """
    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)
        ensure_user_exists(connection, request.userId)
        row = fetch_network_row(connection, network_id, request.userId)

        if not bool(row.get("pass_review", 0)):
            raise HTTPException(
                status_code=400,
                detail="Network must pass review before LCTA analysis",
            )

        cached_lcta = _parse_lcta_result(row)
        if cached_lcta is not None:
            return _lcta_response_from_cache(row)

        node_count = int(row["node_count"])
        prec_nodes = _load_json_column(row.get("prec_nodes_json"), [])
        planning_means = _load_json_column(row.get("node_times_json"), [])

        if len(prec_nodes) != node_count or len(planning_means) != node_count:
            raise HTTPException(status_code=500, detail="儲存的 ETS 節點資料長度不一致")

        nodes = ets_nodes_from_planning(node_count, prec_nodes, planning_means)
        try:
            result = run_lcta(nodes, planning_means=planning_means, refresh=True)
        except LCTAError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        node_inputs = network_to_inputs(result.nodes)
        lcta_payload = _build_lcta_result_payload(result)
        persist_network_nodes(
            connection,
            request.userId,
            row["name"],
            node_inputs,
            pass_review=True,
            network_id=network_id,
            reset_runtime=False,
            lcta_result=lcta_payload,
        )

    graph_base64 = network_graph_to_base64(result.nodes)
    completion = StochasticVariableModel(**result.completion_time)
    lcta_model = LctaResultModel(**lcta_payload)
    return LctaAnalysisResponse(
        success=True,
        cached=False,
        completionTime=completion,
        completionTimeNotation=stochastic_notation(result.completion_time),
        completionTimeMean=result.completion_mean,
        rootNodeId=result.root_id,
        lctaResult=lcta_model,
        nodes=node_inputs,
        graph=f"data:image/png;base64,{graph_base64}",
    )


@app.put("/api/python/networks/{network_id}/ets-runtime", response_model=SavedNetworkResponse)
def update_ets_runtime(network_id: int, request: UpdateEtsRuntimeRequest):
    """Save ETS runtime fields (finishFlag, output, pathFlag, pathTime) after analysis."""
    with db_connection() as connection:
        init_schema(connection)
        migrate_schema(connection)
        ensure_user_exists(connection, request.userId)
        row = fetch_network_row(connection, network_id, request.userId)
        network_row = persist_network_nodes(
            connection,
            request.userId,
            row["name"],
            request.nodes,
            pass_review=bool(row.get("pass_review", 0)),
            network_id=network_id,
            reset_runtime=False,
        )
    return row_to_saved_network_response(network_row, include_graph=False)


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


@app.get("/api/python/docs/status", response_model=DocsIndexStatusResponse)
def docs_status():
    return index_status()


@app.post("/api/python/docs/ask", response_model=DocsAskResponse)
def docs_ask(request: DocsAskRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="提問內容不可為空")

    try:
        if not DOCS_INDEX_FILE.exists():
            _ensure_docs_index()
        return answer_question(question)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except GenerationQuotaError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except GenerationError as error:
        raise HTTPException(status_code=502, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error))
    except Exception as error:
        message = str(error)
        if "429" in message or "quota" in message.lower():
            raise HTTPException(
                status_code=503,
                detail="Gemini API 配額已用盡。請稍後再試，或改用 GENERATION_PROVIDER=ollama。",
            )
        raise HTTPException(status_code=500, detail=f"Docs RAG 錯誤: {error}")


@app.post("/api/python/docs/rebuild-index")
def docs_rebuild_index():
    try:
        return build_index()
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"建立索引失敗: {error}")


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
            "nodes": [ets_to_network_node(pnode).model_dump() for pnode in network],
            "graph": f"data:image/png;base64,{graph_base64}",
        }
        return JSONResponse(content=response_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")