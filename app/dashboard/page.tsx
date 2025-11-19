'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';

// 定義節點型別
interface Node {
  id: number;
  previousNodes: number[];
  meanTime: number;
  flag: boolean;
  output: number;
}

// 定義彈出視窗中可編輯的節點型別
interface EditableNode {
  id: number;
  previousNodes: string;
  meanTime: string;
  flag: boolean;
  output: number;
}

// 定義網路型別
interface Network {
  name: string;
  nodes: Node[];
}

// 定義節點參數資料表型別
interface NodeTable {
  name: string;
  nodes: EditableNode[];
  passFlag?: boolean;
}

// 定義表單型別
interface NodeForm {
  previousNodes: string;
  meanTime: number | string;
}

interface GenerateForm {
  nodeNumbers: string;
}

// API 響應型別
interface NetworkGenerationResponse {
  success: boolean;
  nodeCount: number;
  nodes: Array<{
    id: number;
    pre_node: number[];
    mean_val: number;
    flag: boolean;
    output: number;
  }>;
  graph: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // 工作流程狀態
  const [currentStep, setCurrentStep] = useState<number>(1);
  
  // Modal 狀態
  const [showAddNodeModal, setShowAddNodeModal] = useState<boolean>(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState<boolean>(false);
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [showNetworkNameModal, setShowNetworkNameModal] = useState<boolean>(false);
  const [showReviewNodeModal, setShowReviewNodeModal] = useState<boolean>(false);
  const [showReviewErrorsModal, setShowReviewErrorsModal] = useState<boolean>(false);
  
  // 節點資料
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<number>(0);
  const [modalNodes, setModalNodes] = useState<EditableNode[]>([]);
  
  // 網路資料
  const [networks, setNetworks] = useState<Network[]>([]);
  const [nodeTables, setNodeTables] = useState<NodeTable[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedNodeTable, setSelectedNodeTable] = useState<string>('');
  const [selectedNodeTableForReview, setSelectedNodeTableForReview] = useState<string>('');
  const [reviewErrors, setReviewErrors] = useState<string[]>([]);
  const [isEditingTable, setIsEditingTable] = useState<boolean>(false);
  const [networkName, setNetworkName] = useState<string>('');
  
  // 網路視覺化
  const [networkGraph, setNetworkGraph] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string>('');
  
  // 表單資料
  const [nodeForm, setNodeForm] = useState<NodeForm>({
    previousNodes: '',
    meanTime: 0
  });
  
  const [generateForm, setGenerateForm] = useState<GenerateForm>({
    nodeNumbers: ''
  });
  const [randomNetworkName, setRandomNetworkName] = useState<string>('');

  // Graph Network Modal
  const [showGraphNetworkModal, setShowGraphNetworkModal] = useState<boolean>(false);
  const [selectedPassedTable, setSelectedPassedTable] = useState<string>('');
  const [graphNetworkName, setGraphNetworkName] = useState<string>('');
  const [isGraphing, setIsGraphing] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNetworkNameModal(false);
        setNetworkName('');
      }
    };

    if (showNetworkNameModal) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNetworkNameModal]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-white text-lg">載入中...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const clearDisplayAreas = () => {
    setNodes([]);
    setNetworkGraph('');
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // 開啟 Add Node Modal 並初始化
  const handleOpenAddNodeModal = () => {
    clearDisplayAreas();
    setModalNodes([{
      id: 0,
      previousNodes: '',
      meanTime: '',
      flag: false,
      output: 0.0
    }]);
    setShowAddNodeModal(true);
  };

  // 處理 Modal 中節點資料的變更
  const handleModalNodeChange = (index: number, field: keyof EditableNode, value: string | number | boolean) => {
    if (index === 0 && field === 'previousNodes') {
      // 確保第一行的 previousNodes 欄位不能被編輯
      return;
    }
    const newModalNodes = [...modalNodes];
    (newModalNodes[index] as any)[field] = value;
    setModalNodes(newModalNodes);
  };

  // 在 Modal 中新增一個節點行
  const addModalNodeRow = (index: number) => {
    const newRow: EditableNode = {
      id: modalNodes.length,
      previousNodes: '',
      meanTime: '',
      flag: false,
      output: 0.0
    };
    const newModalNodes = [
      ...modalNodes.slice(0, index + 1),
      newRow,
      ...modalNodes.slice(index + 1)
    ].map((node, i) => ({ ...node, id: i })); // 重新編號 ID
    setModalNodes(newModalNodes);
  };

  // 儲存節點參數資料表
  const handleSaveNodeTable = () => {
  if (!networkName.trim()) {
    alert('Please enter a table name.');
    return;
  }

  const validModalNodes = modalNodes.filter((n, index) => {
    if (index === 0) return true;
    return n.previousNodes.trim() !== '' || n.meanTime.trim() !== '';
  });

  if (validModalNodes.length === 0) {
    alert('Please add at least one valid node.');
    return;
  }
  
  const newNodeTable: NodeTable = {
    name: networkName,
    nodes: validModalNodes
  };
  
  setNodeTables([...nodeTables, newNodeTable]);
  setNetworkName('');
  setShowNetworkNameModal(false);
  setShowAddNodeModal(false);
  alert(`Node Table "${newNodeTable.name}" saved successfully!`);
};

  // 更新節點參數資料表
  const handleUpdateNodeTable = () => {
  const tableIndex = nodeTables.findIndex(t => t.name === selectedNodeTable);
  if (tableIndex === -1) {
    alert('Could not find the selected table to update.');
    return;
  }

  const validModalNodes = modalNodes.filter((n, index) => {
    if (index === 0) return true;
    return n.previousNodes.trim() !== '' || n.meanTime.trim() !== '';
  });
  
  if (validModalNodes.length === 0) {
    alert('A node table cannot be empty.');
    return;
  }

  const updatedNodeTables = [...nodeTables];
  updatedNodeTables[tableIndex] = {
    ...updatedNodeTables[tableIndex],
    nodes: validModalNodes
  };

  setNodeTables(updatedNodeTables);
  setShowEditNodeModal(false);
  setIsEditingTable(false);
  setSelectedNodeTable('');
  alert(`Node Table "${selectedNodeTable}" updated successfully!`);
};

  // 選擇網路
  const handleSelectNetwork = (networkName: string) => {
    setSelectedNetwork(networkName);
    const network = networks.find(n => n.name === networkName);
    if (network) {
      setNodes([...network.nodes]);
      setCurrentNodeId(network.nodes.length);
    }
  };

  // Randomly Generate Network 處理
  const handleRandomGenerate = async () => {
    if (!randomNetworkName.trim()) {
      alert('Please enter a network name.');
      return;
    }
    const nodeCount = parseInt(generateForm.nodeNumbers);
    if (isNaN(nodeCount) || nodeCount < 2) {
      alert('Please enter a valid number of nodes (minimum 2).');
      return;
    }
    
    if (nodeCount > 50) {
      alert('Maximum 50 nodes allowed.');
      return;
    }
    
    setIsGenerating(true);
    setGenerationError('');
    setShowGenerateModal(false);
    
    try {
      // 呼叫 Python API
      const response = await fetch(`/api/python/network-generation?n=${nodeCount}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: NetworkGenerationResponse = await response.json();
      
      if (data.success) {
        // 轉換節點資料格式 for display
        const convertedNodes: Node[] = data.nodes.map(node => ({
          id: node.id,
          previousNodes: node.pre_node,
          meanTime: node.mean_val,
          flag: node.flag,
          output: node.output
        }));
        setNodes(convertedNodes);
        setCurrentNodeId(convertedNodes.length);
        
        // 更新網路圖形
        setNetworkGraph(data.graph);

        // Create and save NodeTable
        const editableNodes: EditableNode[] = data.nodes.map(node => ({
          id: node.id,
          previousNodes: node.pre_node.join(', '),
          meanTime: String(node.mean_val),
          flag: node.flag,
          output: node.output
        }));

        const newNodeTable: NodeTable = {
          name: randomNetworkName,
          nodes: editableNodes
        };

        setNodeTables(prevNodeTables => [...prevNodeTables, newNodeTable]);
        
        alert(`Successfully generated and saved network "${randomNetworkName}" with ${nodeCount} nodes!`);
      } else {
        throw new Error('Generation failed');
      }
      
    } catch (error) {
      console.error('Error generating network:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate network');
      alert('Failed to generate network. Please try again.');
    } finally {
      setIsGenerating(false);
      setGenerateForm({ nodeNumbers: '' });
      setRandomNetworkName(''); // Reset the name
    }
  };

  // Graph Network Generation
  const handleGraphNetwork = async () => {
    if (!selectedPassedTable) {
      alert('Please select a node table.');
      return;
    }
    
    const networkName = graphNetworkName.trim() || selectedPassedTable;
    
    setIsGraphing(true);
    setShowGraphNetworkModal(false);
    
    try {
      const table = nodeTables.find(t => t.name === selectedPassedTable);
      if (!table) {
        throw new Error('Selected table not found.');
      }
      
      const networkNodes = table.nodes.map(node => ({
        id: node.id,
        previousNodes: node.previousNodes === '' 
          ? [] 
          : node.previousNodes.split(',').map(s => parseInt(s.trim())),
        meanTime: parseFloat(node.meanTime),
        flag: node.flag,
        output: node.output
      }));
      
      const response = await fetch('/api/python/graph-network', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodes: networkNodes
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: NetworkGenerationResponse = await response.json();
      
      if (data.success) {
        const convertedNodes: Node[] = data.nodes.map(node => ({
          id: node.id,
          previousNodes: node.pre_node,
          meanTime: node.mean_val,
          flag: node.flag,
          output: node.output
        }));
        
        setNodes(convertedNodes);
        setCurrentNodeId(convertedNodes.length);
        
        setNetworkGraph(data.graph);
        
        const newNetwork: Network = {
          name: networkName,
          nodes: convertedNodes
        };
        setNetworks(prevNetworks => [...prevNetworks, newNetwork]);
        
        alert(`Successfully created network "${networkName}"!`);
      } else {
        throw new Error('Graph generation failed');
      }
      
    } catch (error) {
      console.error('Error graphing network:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to graph network');
      alert('Failed to create network graph. Please try again.');
    } finally {
      setIsGraphing(false);
      setSelectedPassedTable('');
      setGraphNetworkName('');
    }
  };

  // 審查節點參數資料表
  const handleReviewNodeTable = () => {
    const table = nodeTables.find(t => t.name === selectedNodeTableForReview);
    if (!table) {
      alert('Selected node table not found.');
      return;
    }

    const nodes = table.nodes;
    const N = nodes.length;
    const errors: string[] = [];

    if (N === 0) {
      errors.push('節點表不能為空。');
    } else {
      // 規則：node(0)的Previous Nodes欄位資料必須為空的
      if (nodes[0].previousNodes.trim() !== '') {
        errors.push("節點 0 (起始節點) 的 'Previous Nodes' 欄位必須為空。");
      }

      const allReferencedNodeIds = new Set<number>();

      for (const node of nodes) {
        // 規則：所有節點的Flag為預設值false
        if (node.flag !== false) {
          errors.push(`節點 ${node.id} 的 'Flag' 欄位必須為 false。`);
        }
        // 規則：Output欄位資料都必須保持預設值0.0
        if (node.output !== 0.0) {
          errors.push(`節點 ${node.id} 的 'Output' 欄位必須為 0.0。`);
        }
        // 規則：所有節點的Mean Value欄位輸入資料都必須為數值
        const meanTime = parseFloat(node.meanTime);
        if (isNaN(meanTime) || !isFinite(meanTime)) {
          errors.push(`節點 ${node.id} 的 'Mean Time' 欄位必須是有效的數值。`);
        }

        // --- Previous Nodes 欄位驗證 ---
        const prevNodesStr = node.previousNodes.trim();
        const prevs = prevNodesStr === '' ? [] : prevNodesStr.split(',').map(s => parseFloat(s.trim()));

        if (prevs.some(isNaN)) {
          errors.push(`節點 ${node.id} 的 'Previous Nodes' 欄位包含無效的 ID。`);
        } else {
          // 規則：內容不得含有該節點自己的ID值
          if (prevs.includes(node.id)) {
            errors.push(`節點 ${node.id} 的 'Previous Nodes' 欄位不能包含自己的 ID。`);
          }
          // 規則：所有節點的Previous Nodes欄位資料，不得存在N-1的ID值
          if (prevs.includes(N - 1)) {
            errors.push(`節點 ${node.id} 的 'Previous Nodes' 欄位不能包含終端節點 ID (${N - 1})。`);
          }
          // 規則：為list資料型態，數值為正整數(節點ID值)
          if (prevs.some(id => !Number.isInteger(id) || id < 0)) {
            errors.push(`節點 ${node.id} 的 'Previous Nodes' 欄位必須為正整數。`);
          }
          
          prevs.forEach(id => allReferencedNodeIds.add(id));
        }

        // 規則：node(0)除外，其餘節點均至少要有一個數值
        if (node.id !== 0 && prevs.length === 0) {
          errors.push(`節點 ${node.id} (非起始節點) 至少要有一個 'Previous Node'。`);
        }
      }

      // 規則：node(N-1)除外，其餘節點所屬的ID值，至少一次要出現在其他節點Previous Nodes欄位內
      if (N > 1) {
        for (let i = 0; i < N - 1; i++) {
          if (!allReferencedNodeIds.has(i)) {
            errors.push(`節點 ${i} 未被任何其他節點的 'Previous Nodes' 引用，可能導致網路斷開。`);
          }
        }
      }
    }

    if (errors.length > 0) {
      setReviewErrors(errors);
      setShowReviewErrorsModal(true);
    } else {
      const updatedNodeTables = nodeTables.map(t => 
        t.name === selectedNodeTableForReview ? { ...t, passFlag: true } : t
      );
      setNodeTables(updatedNodeTables);
      alert(`Node Table "${selectedNodeTableForReview}" has passed the review!`);
      setShowReviewNodeModal(false);
      setSelectedNodeTableForReview('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 fixed top-0 left-0 right-0 z-50">
        <nav className="px-6 py-4 flex items-center justify-between">
          {/* Left: Logo and Menu */}
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <a href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <div className="relative w-24 h-10">
                <Image
                  src="/logo.jpeg"
                  alt="PNA Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </a>

            {/* Menu Items */}
            <div className="hidden md:flex items-center space-x-6">
              <button className="text-gray-300 hover:text-white transition-colors font-medium">
                Explore
              </button>
              <button
                onClick={() => router.push('/docs')}
                className="text-gray-300 hover:text-white transition-colors font-medium"
              >
                Docs
              </button>
              <button className="text-gray-300 hover:text-white transition-colors font-medium">
                Contact
              </button>
            </div>
          </div>

          {/* Right: User Info and Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">Login Identity</p>
              <p className="text-white font-medium">{session.user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-6 py-2 bg-transparent border-2 border-cyan-400 text-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-slate-900 transition-all font-medium"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>

      <div className="flex pt-20">
        {/* Left Sidebar - Operation Panel */}
        <aside className="w-80 bg-slate-800/50 backdrop-blur-sm border-r border-blue-500/20 fixed left-0 top-20 bottom-0 overflow-y-auto">
          <div className="p-6 space-y-6">
            
            {/* Step 1: Network Planning and Design */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-blue-500/30">
              <h3 className="text-white font-semibold mb-4 flex items-center">
                <span className="w-6 h-6 bg-cyan-400 text-slate-900 rounded-full flex items-center justify-center text-sm font-bold mr-2">1</span>
                Network Planning
              </h3>
              <div className="space-y-2">
                <button
                  onClick={handleOpenAddNodeModal}
                  className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Creat Node Table
                </button>
                <button
                  onClick={() => {
                    clearDisplayAreas();
                    setShowEditNodeModal(true);
                    setIsEditingTable(false);
                    setSelectedNodeTable('');
                  }}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Node Table
                </button>
                <button
                  onClick={() => setShowGenerateModal(true)}
                  disabled={isGenerating}
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Random Generate
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step 2: Network Generation */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-blue-500/30">
              <h3 className="text-white font-semibold mb-4 flex items-center">
                <span className="w-6 h-6 bg-cyan-400 text-slate-900 rounded-full flex items-center justify-center text-sm font-bold mr-2">2</span>
                Network Generation
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    clearDisplayAreas();
                    setShowReviewNodeModal(true);
                    setSelectedNodeTableForReview('');
                  }}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Review Node Table
                </button>
                <button
                  onClick={() => {
                    clearDisplayAreas();
                    setShowGraphNetworkModal(true);
                    setSelectedPassedTable('');
                    setGraphNetworkName('');
                  }}
                  disabled={isGraphing}
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGraphing ? (
                    <>
                      <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Graphing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                      Graph Network
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step 3: Network Analysis */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-blue-500/30">
              <h3 className="text-white font-semibold mb-4 flex items-center">
                <span className="w-6 h-6 bg-cyan-400 text-slate-900 rounded-full flex items-center justify-center text-sm font-bold mr-2">3</span>
                Network Analysis
              </h3>
              <div className="space-y-2">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Network
                  </label>
                  <select
                    value={selectedNetwork}
                    onChange={(e) => handleSelectNetwork(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400 text-sm"
                  >
                    <option value="">Select Network...</option>
                    {networks.map((network) => (
                      <option key={network.name} value={network.name}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    There are {networks.length} networks avalilable
                  </p>
                </div>
                <button
                  onClick={clearDisplayAreas}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Shortest Path
                </button>
                <button
                  onClick={clearDisplayAreas}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                  Longest Path
                </button>
                <button
                  onClick={clearDisplayAreas}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Total Path Number
                </button>
                <button
                  onClick={clearDisplayAreas}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Network Completion Time
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="ml-80 flex-1 p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Current Nodes Table */}
            {nodes.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Node Table Visualization
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-blue-500/30">
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Node ID</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Previous Nodes</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Mean Time</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Flag</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((node) => (
                        <tr key={node.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-white font-mono">{node.id}</td>
                          <td className="py-3 px-4 text-gray-300">{node.previousNodes.length > 0 ? `[${node.previousNodes.join(', ')}]` : '[]'}</td>
                          <td className="py-3 px-4 text-gray-300">{typeof node.meanTime === 'number' ? node.meanTime.toFixed(2) : node.meanTime}</td>
                          <td className="py-3 px-4 text-gray-300">{node.flag.toString()}</td>
                          <td className="py-3 px-4 text-gray-300">{node.output.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Network Visualization Area */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Network Structure Visualization
              </h2>
              <div className="bg-slate-900/50 rounded-lg p-8 min-h-96 flex items-center justify-center border-2 border-dashed border-blue-500/30">
                {isGenerating ? (
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                    <p className="text-gray-400 text-lg">Generating Network Diagram...</p>
                  </div>
                ) : networkGraph ? (
                  <div className="w-full">
                    <img 
                      src={networkGraph} 
                      alt="Network Visualization" 
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                    <p className="text-gray-400 text-lg mb-2">The network chart will be displayed here</p>  
                  </div>
                )}
              </div>
              {generationError && (
                <div className="mt-4 p-4 bg-red-900/50 border border-red-500/50 rounded-lg">
                  <p className="text-red-300 text-sm">Error: {generationError}</p>
                </div>
              )}
            </div>

            {/* Analysis Results Area */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Analysis Results
              </h2>
              <div className="bg-slate-900/50 rounded-lg p-8 min-h-64 flex items-center justify-center border-2 border-dashed border-blue-500/30">
                <div className="text-center">
                  <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-400 text-lg mb-2">Analyze the Selected Network</p>
                  <p className="text-gray-500 text-sm">The analysis results will be displayed here</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Node Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-4xl w-full border border-blue-500/30 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-2xl font-bold text-white mb-6">Add New Nodes</h3>
            <div className="flex-grow overflow-y-auto pr-2">
              <table className="w-full text-left table-fixed">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="border-b border-blue-500/30">
                    <th className="py-3 px-2 w-16 text-cyan-400 font-semibold text-sm">ID</th>
                    <th className="py-3 px-2 w-40 text-cyan-400 font-semibold text-sm">Previous Nodes</th>
                    <th className="py-3 px-2 w-32 text-cyan-400 font-semibold text-sm">Mean Time</th>
                    <th className="py-3 px-2 w-24 text-cyan-400 font-semibold text-sm">Flag</th>
                    <th className="py-3 px-2 w-24 text-cyan-400 font-semibold text-sm">Output</th>
                    <th className="py-3 px-2 w-12 text-cyan-400 font-semibold text-sm"></th>
                  </tr>
                </thead>
                <tbody>
                  {modalNodes.map((node, index) => (
                    <tr key={index} className="border-b border-slate-700/50">
                      <td className="py-2 px-2 text-white font-mono">{node.id}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center bg-slate-900 border border-blue-500/30 rounded-md">
                          <span className="text-gray-400 pl-2">[</span>
                          <input
                            type="text"
                            value={node.previousNodes}
                            onChange={(e) => handleModalNodeChange(index, 'previousNodes', e.target.value)}
                            placeholder={index === 0 ? '' : '1, 2'}
                            className="w-full px-1 py-1 bg-transparent text-white focus:outline-none"
                            disabled={index === 0}
                          />
                          <span className="text-gray-400 pr-2">]</span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.1"
                          value={node.meanTime}
                          onChange={(e) => handleModalNodeChange(index, 'meanTime', e.target.value)}
                          placeholder="0.0"
                          className="w-full px-2 py-1 bg-slate-900 border border-blue-500/30 rounded-md text-white focus:outline-none focus:border-cyan-400"
                        />
                      </td>
                      <td className="py-2 px-2 text-gray-400">{node.flag.toString()}</td>
                      <td className="py-2 px-2 text-gray-400">{node.output.toFixed(1)}</td>
                      <td className="py-2 px-2 text-center">
                        <button onClick={() => addModalNodeRow(index)} className="text-green-400 hover:text-green-300">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex space-x-3 mt-8 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={() => setShowNetworkNameModal(true)}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Network Name Modal */}
      {showNetworkNameModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Save Node Table</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Node Table Name
                </label>
                <input
                  type="text"
                  value={networkName}
                  onChange={(e) => setNetworkName(e.target.value)}
                  placeholder="輸入網路名稱"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">為這個網路命名以便日後使用</p>
              </div>
              <div className="bg-slate-900/50 rounded p-3">
                <p className="text-sm text-gray-400">
                  節點數量: <span className="text-white font-semibold">
                    {modalNodes.filter((n, index) => {
                      // ID=0 的節點一定要算進去
                      if (index === 0) return true;
                      // 其他節點: 至少要有 meanTime 或 previousNodes
                      return n.previousNodes.trim() !== '' || n.meanTime.trim() !== '';
                    }).length}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => {
                  setShowNetworkNameModal(false);
                  setNetworkName('');
                }}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleSaveNodeTable}
                disabled={!networkName.trim()}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Network Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Randomly Generate Network</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  輸入網路名稱
                </label>
                <input
                  type="text"
                  value={randomNetworkName}
                  onChange={(e) => setRandomNetworkName(e.target.value)}
                  placeholder="為生成的網路命名"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Node Numbers
                </label>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={generateForm.nodeNumbers}
                  onChange={(e) => setGenerateForm({nodeNumbers: e.target.value})}
                  placeholder="輸入節點數量 (2-50)"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
                <p className="text-xs text-gray-500 mt-1">系統將自動生成指定數量的隨機網路節點</p>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGenerateForm({nodeNumbers: ''});
                  setRandomNetworkName('');
                }}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleRandomGenerate}
                disabled={!randomNetworkName.trim() || !generateForm.nodeNumbers || parseInt(generateForm.nodeNumbers) < 2 || parseInt(generateForm.nodeNumbers) > 50}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Network
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node Table Modal */}
      {showEditNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-slate-800 rounded-2xl p-8 w-full border border-blue-500/30 shadow-2xl flex flex-col max-h-[90vh] ${isEditingTable ? 'max-w-4xl' : 'max-w-md'}`}>
            <h3 className="text-2xl font-bold text-white mb-6">Edit Node Table</h3>
            
            {!isEditingTable ? (
              // Step 1: Select Node Table
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Node Table
                  </label>
                  <select 
                    value={selectedNodeTable}
                    onChange={(e) => setSelectedNodeTable(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">選擇要編輯的資料表...</option>
                    {nodeTables.map(table => (
                      <option key={table.name} value={table.name}>{table.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex space-x-3 mt-8">
                  <button
                    onClick={() => setShowEditNodeModal(false)}
                    className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const table = nodeTables.find(t => t.name === selectedNodeTable);
                      if (table) {
                        setModalNodes(table.nodes);
                        setIsEditingTable(true);
                      } else {
                        alert('Please select a node table to edit.');
                      }
                    }}
                    disabled={!selectedNodeTable}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium disabled:opacity-50"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              // Step 2: Edit the selected table
              <>
                <div className="flex-grow overflow-y-auto pr-2">
                  <table className="w-full text-left table-fixed">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="border-b border-blue-500/30">
                        <th className="py-3 px-2 w-16 text-cyan-400 font-semibold text-sm">ID</th>
                        <th className="py-3 px-2 w-40 text-cyan-400 font-semibold text-sm">Previous Nodes</th>
                        <th className="py-3 px-2 w-32 text-cyan-400 font-semibold text-sm">Mean Time</th>
                        <th className="py-3 px-2 w-24 text-cyan-400 font-semibold text-sm">Flag</th>
                        <th className="py-3 px-2 w-24 text-cyan-400 font-semibold text-sm">Output</th>
                        <th className="py-3 px-2 w-12 text-cyan-400 font-semibold text-sm"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalNodes.map((node, index) => (
                        <tr key={index} className="border-b border-slate-700/50">
                          <td className="py-2 px-2 text-white font-mono">{node.id}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center bg-slate-900 border border-blue-500/30 rounded-md">
                              <span className="text-gray-400 pl-2">[</span>
                              <input
                                type="text"
                                value={node.previousNodes}
                                onChange={(e) => handleModalNodeChange(index, 'previousNodes', e.target.value)}
                                placeholder="1, 2"
                                className="w-full px-1 py-1 bg-transparent text-white focus:outline-none"
                              />
                              <span className="text-gray-400 pr-2">]</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              step="0.1"
                              value={node.meanTime}
                              onChange={(e) => handleModalNodeChange(index, 'meanTime', e.target.value)}
                              placeholder="0.0"
                              className="w-full px-2 py-1 bg-slate-900 border border-blue-500/30 rounded-md text-white focus:outline-none focus:border-cyan-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-gray-400">{node.flag.toString()}</td>
                          <td className="py-2 px-2 text-gray-400">{node.output.toFixed(1)}</td>
                          <td className="py-2 px-2 text-center">
                            <button onClick={() => addModalNodeRow(index)} className="text-green-400 hover:text-green-300">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex space-x-3 mt-8 pt-4 border-t border-slate-700/50">
                  <button
                    onClick={() => setIsEditingTable(false)}
                    className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
                  >
                    返回
                  </button>
                  <button
                    onClick={handleUpdateNodeTable}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium"
                  >
                    儲存變更
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Review Node Table Modal */}
      {showReviewNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Review Node Table</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Node Table to Review
                </label>
                <select 
                  value={selectedNodeTableForReview}
                  onChange={(e) => setSelectedNodeTableForReview(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">選擇要審查的資料表...</option>
                  {nodeTables.map(table => (
                    <option key={table.name} value={table.name}>
                      {table.name} {table.passFlag && ' (Passed)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => setShowReviewNodeModal(false)}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleReviewNodeTable}
                disabled={!selectedNodeTableForReview}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graph Network Modal */}
      {showGraphNetworkModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Graph Network</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Reviewed Node Table
                </label>
                <select 
                  value={selectedPassedTable}
                  onChange={(e) => {
                    setSelectedPassedTable(e.target.value);
                    setGraphNetworkName(e.target.value);
                  }}
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Select a passed table...</option>
                  {nodeTables
                    .filter(table => table.passFlag === true)
                    .map(table => (
                      <option key={table.name} value={table.name}>
                        {table.name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Only tables that passed review are available
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Network Name
                </label>
                <input
                  type="text"
                  value={graphNetworkName}
                  onChange={(e) => setGraphNetworkName(e.target.value)}
                  placeholder={selectedPassedTable || "Enter network name"}
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to use table name
                </p>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => {
                  setShowGraphNetworkModal(false);
                  setSelectedPassedTable('');
                  setGraphNetworkName('');
                }}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleGraphNetwork}
                disabled={!selectedPassedTable}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Network
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Errors Modal */}
      {showReviewErrorsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-lg w-full border border-red-500/30 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-2xl font-bold text-red-400 mb-4">Review Failed</h3>
            <p className="text-gray-300 mb-6">The following issues were found in the node table:</p>
            <div className="flex-grow overflow-y-auto bg-slate-900/50 rounded-lg p-4 space-y-2 border border-slate-700">
              {reviewErrors.map((error, index) => (
                <p key={index} className="text-red-300 text-sm">
                  <span className="font-mono mr-2">{`-`}</span>{error}
                </p>
              ))}
            </div>
            <div className="mt-8">
              <button
                onClick={() => setShowReviewErrorsModal(false)}
                className="w-full px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
