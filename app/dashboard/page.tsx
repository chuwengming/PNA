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
}

// 定義網路型別
interface Network {
  name: string;
  nodes: Node[];
}

// 定義表單型別
interface NodeForm {
  previousNodes: string;
  meanTime: number | string;
}

interface GenerateForm {
  nodeNumbers: string;
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
  
  // 節點資料
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<number>(0);
  
  // 網路資料
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [networkName, setNetworkName] = useState<string>('');
  
  // 表單資料
  const [nodeForm, setNodeForm] = useState<NodeForm>({
    previousNodes: '',
    meanTime: 0
  });
  
  const [generateForm, setGenerateForm] = useState<GenerateForm>({
    nodeNumbers: ''
  });

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

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // Add Node 處理
  const handleAddNode = () => {
    const previousNodesArray = nodeForm.previousNodes
      ? nodeForm.previousNodes.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n))
      : [];
    
    const newNode: Node = {
      id: currentNodeId,
      previousNodes: previousNodesArray,
      meanTime: typeof nodeForm.meanTime === 'string' ? parseFloat(nodeForm.meanTime) : nodeForm.meanTime
    };
    
    setNodes([...nodes, newNode]);
    setCurrentNodeId(currentNodeId + 1);
    setNodeForm({ previousNodes: '', meanTime: 0 });
    setShowAddNodeModal(false);
  };

  // Complete Planning 處理 - 儲存網路
  const handleCompletePlanning = () => {
    if (nodes.length > 0) {
      setShowNetworkNameModal(true);
    } else {
      alert('Please add at least one node before completing planning.');
    }
  };

  // 儲存網路
  const handleSaveNetwork = () => {
    if (!networkName.trim()) {
      alert('Please enter a network name.');
      return;
    }
    
    const newNetwork: Network = {
      name: networkName,
      nodes: [...nodes]
    };
    
    setNetworks([...networks, newNetwork]);
    setNetworkName('');
    setNodes([]);
    setCurrentNodeId(0);
    setShowNetworkNameModal(false);
    alert(`Network "${newNetwork.name}" saved successfully!`);
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
  const handleRandomGenerate = () => {
    const nodeCount = parseInt(generateForm.nodeNumbers);
    if (isNaN(nodeCount) || nodeCount < 1) {
      alert('Please enter a valid number of nodes.');
      return;
    }
    
    // 這裡之後會呼叫後端 API
    alert(`Randomly generating network with ${nodeCount} nodes...`);
    setShowGenerateModal(false);
    setGenerateForm({ nodeNumbers: '' });
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
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium text-sm flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Random Generate
              </button>
            </div>
          </div>

          {/* Right: User Info and Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">登入身份</p>
              <p className="text-white font-medium">{session.user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-6 py-2 bg-transparent border-2 border-cyan-400 text-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-slate-900 transition-all font-medium"
            >
              登出
            </button>
          </div>
        </nav>
      </header>

      <div className="flex pt-20">
        {/* Left Sidebar - Operation Panel */}
        <aside className="w-80 bg-slate-800/50 backdrop-blur-sm border-r border-blue-500/20 fixed left-0 top-20 bottom-0 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Workflow Steps Indicator */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-blue-500/30">
              <h3 className="text-white font-semibold mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                工作流程
              </h3>
              <div className="space-y-3">
                <div className="flex items-center text-cyan-400">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-cyan-400 text-slate-900">
                    1
                  </div>
                  <span className="font-medium">Network Planning</span>
                </div>
                <div className="flex items-center text-cyan-400">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-cyan-400 text-slate-900">
                    2
                  </div>
                  <span className="font-medium">Network Generation</span>
                </div>
                <div className="flex items-center text-cyan-400">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-cyan-400 text-slate-900">
                    3
                  </div>
                  <span className="font-medium">Network Analysis</span>
                </div>
              </div>
            </div>

            {/* Step 1: Network Planning and Design */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-blue-500/30">
              <h3 className="text-white font-semibold mb-4 flex items-center">
                <span className="w-6 h-6 bg-cyan-400 text-slate-900 rounded-full flex items-center justify-center text-sm font-bold mr-2">1</span>
                Network Planning & Design
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowAddNodeModal(true)}
                  className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Node
                </button>
                <button
                  onClick={() => setShowEditNodeModal(true)}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Node
                </button>
                <button
                  onClick={handleCompletePlanning}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Complete Planning
                </button>
              </div>
              <div className="mt-3 text-xs text-gray-400 bg-slate-800/50 rounded p-2">
                已添加 {nodes.length} 個節點
              </div>
            </div>

            {/* Step 2: Network Generation */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-blue-500/30">
              <h3 className="text-white font-semibold mb-4 flex items-center">
                <span className="w-6 h-6 bg-cyan-400 text-slate-900 rounded-full flex items-center justify-center text-sm font-bold mr-2">2</span>
                Network Generation
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Network
                  </label>
                  <select
                    value={selectedNetwork}
                    onChange={(e) => handleSelectNetwork(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">選擇網路...</option>
                    {networks.map((network) => (
                      <option key={network.name} value={network.name}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    已儲存 {networks.length} 個網路
                  </p>
                </div>
                <button
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  Graph Network
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
                <button
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Shortest Path
                </button>
                <button
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                  Longest Path
                </button>
                <button
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Total Path Number
                </button>
                <button
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
                  節點列表
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-blue-500/30">
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Node ID</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Previous Nodes</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Mean Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((node) => (
                        <tr key={node.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-white font-mono">{node.id}</td>
                          <td className="py-3 px-4 text-gray-300">{node.previousNodes.length > 0 ? `[${node.previousNodes.join(', ')}]` : '[]'}</td>
                          <td className="py-3 px-4 text-gray-300">{node.meanTime}</td>
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
                網路結構視覺化
              </h2>
              <div className="bg-slate-900/50 rounded-lg p-8 min-h-96 flex items-center justify-center border-2 border-dashed border-blue-500/30">
                <div className="text-center">
                  <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                  <p className="text-gray-400 text-lg mb-2">網路圖表將在此顯示</p>
                  <p className="text-gray-500 text-sm">執行 Graph Network 後，視覺化結果將在此呈現</p>
                </div>
              </div>
            </div>

            {/* Analysis Results Area */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                分析結果
              </h2>
              <div className="bg-slate-900/50 rounded-lg p-8 min-h-64 flex items-center justify-center border-2 border-dashed border-blue-500/30">
                <div className="text-center">
                  <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-400 text-lg mb-2">尚無分析結果</p>
                  <p className="text-gray-500 text-sm">執行分析後，結果將在此顯示</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Node Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Add New Node</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Node ID
                </label>
                <input
                  type="text"
                  value={currentNodeId.toString()}
                  disabled
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white font-mono cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">自動生成，不可編輯</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Previous Nodes
                </label>
                <input
                  type="text"
                  value={nodeForm.previousNodes}
                  onChange={(e) => setNodeForm({...nodeForm, previousNodes: e.target.value})}
                  placeholder="例如: 0,1,2 (以逗號分隔)"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
                <p className="text-xs text-gray-500 mt-1">輸入前置節點 ID，以逗號分隔</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mean Time
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={nodeForm.meanTime}
                  onChange={(e) => setNodeForm({...nodeForm, meanTime: e.target.value})}
                  placeholder="0.0"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => {
                  setShowAddNodeModal(false);
                  setNodeForm({ previousNodes: '', meanTime: 0 });
                }}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleAddNode}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium"
              >
                新增節點
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Network Name Modal */}
      {showNetworkNameModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Save Network</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Network Name
                </label>
                <input
                  type="text"
                  value={networkName}
                  onChange={(e) => setNetworkName(e.target.value)}
                  placeholder="輸入網路名稱"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
                <p className="text-xs text-gray-500 mt-1">為這個網路命名以便日後使用</p>
              </div>
              <div className="bg-slate-900/50 rounded p-3">
                <p className="text-sm text-gray-400">節點數量: <span className="text-white font-semibold">{nodes.length}</span></p>
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
                onClick={handleSaveNetwork}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium"
              >
                儲存網路
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
                  Node Numbers
                </label>
                <input
                  type="number"
                  min="1"
                  value={generateForm.nodeNumbers}
                  onChange={(e) => setGenerateForm({nodeNumbers: e.target.value})}
                  placeholder="輸入節點數量"
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
                }}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleRandomGenerate}
                disabled={!generateForm.nodeNumbers || parseInt(generateForm.nodeNumbers) < 1}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                生成網路
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node Modal - Placeholder */}
      {showEditNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Edit Node</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Node ID
                </label>
                <select className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400">
                  <option value="">選擇要編輯的節點</option>
                  {nodes.map(node => (
                    <option key={node.id} value={node.id}>Node {node.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Previous Nodes
                </label>
                <input
                  type="text"
                  placeholder="例如: 0,1,2"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mean Time
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
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
                  alert('編輯功能將在後端 API 完成後實作');
                  setShowEditNodeModal(false);
                }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium"
              >
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}