from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import random
import matplotlib
matplotlib.use('Agg')  # 使用非 GUI 後端
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch
import numpy as np
import io
import base64
from typing import List

app = FastAPI()

class Node(BaseModel):
    id: int
    flag: bool
    pre_node: List[int]
    mean_val: float
    output: float

class NetworkResponse(BaseModel):
    success: bool
    nodeCount: int
    nodes: List[Node]
    graph: str

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

class GraphNetworkRequest(BaseModel):
    nodes: List[dict]

@app.post("/api/python/graph-network", response_model=NetworkResponse)
def graph_network(request: GraphNetworkRequest):
    try:
        # 驗證節點數據
        if not request.nodes or len(request.nodes) < 2:
            raise HTTPException(status_code=400, detail="節點數量必須至少為 2")
        
        N = len(request.nodes)
        if N > 50:
            raise HTTPException(status_code=400, detail="節點數量不能超過 50")       
        # 轉換為 node 實體列表
        network = []
        for node_data in request.nodes:
            pnode = node(node_data['id'])
            pnode.flag = node_data.get('flag', False)
            pnode.pre_node = node_data.get('previousNodes', [])
            pnode.mean_val = float(node_data.get('meanTime', 0.0))
            pnode.output = node_data.get('output', 0.0)
            network.append(pnode)       
        # 生成網路圖
        graph_base64 = network_graph_to_base64(network)
        
        response_data = {
            'success': True,
            'nodeCount': N,
            'nodes': [node.to_dict() for node in network],
            'graph': f'data:image/png;base64,{graph_base64}'
        }
        return JSONResponse(content=response_data)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")