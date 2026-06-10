'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';

// 節點 Output 精簡儲存型態 [E, Var]
interface OutputSummary {
  mean: number;
  variance: number;
}

interface LctaResultJson {
  rootNodeId: number;
  mean: number;
  variance: number;
  values: number[];
  probabilities: number[];
  notation?: string;
}

// ETS 節點（擴張樹節點資料結構 — API / 資料表顯示）
interface Node {
  id: number;
  precNode: number[];
  nodeTime: number;
  finishFlag: boolean;
  output: OutputSummary;
  outputNotation?: string;
}

interface EditableNode {
  id: number;
  precNode: string;
  nodeTime: string;
  finishFlag: boolean;
  outputNotation: string;
  pathFlagDisplay: string;
  pathTimeDisplay: string;
}

interface Network {
  id: number;
  userId?: number;
  name: string;
  nodeCount?: number;
  precNodes?: number[][];
  nodeTimes?: number[];
  finishFlags?: boolean[];
  lctaResult?: LctaResultJson | null;
  nodes: Node[];
  graph: string;
  passReview: boolean;
}

// 定義表單型別
interface NodeForm {
  previousNodes: string;
  meanTime: number | string;
}

interface GenerateForm {
  nodeNumbers: string;
}

interface ValidateNodesResponse {
  success: boolean;
  passed: boolean;
  errors: string[];
}

// API 響應型別
interface NetworkGenerationResponse {
  success: boolean;
  nodeCount: number;
  nodes: Node[];
  graph: string;
}

const INITIAL_OUTPUT_NOTATION = '[E: 0, Var: 0]';

const defaultOutputSummary = (): OutputSummary => ({ mean: 0, variance: 0 });

const formatOutputNotation = (output: OutputSummary, notation?: string) =>
  notation || `[E: ${output.mean.toFixed(2)}, Var: ${output.variance.toFixed(4)}]`;

const lctaResultToAnalysis = (lcta: LctaResultJson, networkName: string, cached = false): LctaAnalysisResult => ({
  networkName,
  mean: lcta.mean,
  variance: lcta.variance,
  values: lcta.values,
  probabilities: lcta.probabilities,
  notation: lcta.notation ?? '',
  cached,
});

interface LctaAnalysisResult {
  networkName: string;
  mean: number;
  variance: number;
  values: number[];
  probabilities: number[];
  notation: string;
  cached?: boolean;
}

interface CpaAnalysisResult {
  networkName: string;
  mode: 'longest' | 'shortest';
  criticalPath: number[];
  totalExpectedTime: number;
}

interface FindPathsAnalysisResult {
  networkName: string;
  pathCount: number;
  paths: number[][];
}

const computeDistributionVariance = (
  values: number[],
  probabilities: number[],
  mean: number,
): number => {
  if (values.length === 0) return 0;
  return values.reduce((acc, value, index) => {
    const p = probabilities[index] ?? 0;
    return acc + p * (value - mean) ** 2;
  }, 0);
};

function CompletionTimePdfChart({
  values,
  probabilities,
}: {
  values: number[];
  probabilities: number[];
}) {
  const width = 720;
  const height = 320;
  const margin = { top: 24, right: 28, bottom: 48, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  if (values.length === 0) {
    return <p className="text-gray-500 text-sm">No distribution data.</p>;
  }

  const xMin = Math.min(...values);
  const xMax = Math.max(...values);
  const yMax = Math.max(...probabilities, 0.001);
  const xSpan = xMax - xMin || 1;

  const toX = (v: number) => margin.left + ((v - xMin) / xSpan) * plotWidth;
  const toY = (p: number) => margin.top + plotHeight - (p / yMax) * plotHeight;

  const points = values.map((v, i) => `${toX(v)},${toY(probabilities[i] ?? 0)}`);
  const polyline = points.join(' ');

  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  const xTickCount = Math.min(6, values.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    if (xTickCount === 1) return xMin;
    return xMin + (xSpan * i) / (xTickCount - 1);
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto max-h-[360px]"
      role="img"
      aria-label="Network completion time probability distribution"
    >
      <rect x={0} y={0} width={width} height={height} fill="transparent" />

      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={margin.left}
            y1={toY(tick)}
            x2={width - margin.right}
            y2={toY(tick)}
            stroke="rgba(148, 163, 184, 0.2)"
            strokeDasharray="4 4"
          />
          <text
            x={margin.left - 8}
            y={toY(tick) + 4}
            textAnchor="end"
            fill="#94a3b8"
            fontSize={11}
          >
            {tick.toFixed(3)}
          </text>
        </g>
      ))}

      <line
        x1={margin.left}
        y1={margin.top + plotHeight}
        x2={width - margin.right}
        y2={margin.top + plotHeight}
        stroke="#64748b"
      />
      <line
        x1={margin.left}
        y1={margin.top}
        x2={margin.left}
        y2={margin.top + plotHeight}
        stroke="#64748b"
      />

      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line
            x1={toX(tick)}
            y1={margin.top + plotHeight}
            x2={toX(tick)}
            y2={margin.top + plotHeight + 6}
            stroke="#64748b"
          />
          <text
            x={toX(tick)}
            y={margin.top + plotHeight + 22}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize={11}
          >
            {tick.toFixed(1)}
          </text>
        </g>
      ))}

      <polyline
        points={polyline}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {values.map((v, i) => (
        <circle
          key={`pt-${i}`}
          cx={toX(v)}
          cy={toY(probabilities[i] ?? 0)}
          r={4}
          fill="#f59e0b"
          stroke="#0f172a"
          strokeWidth={1.5}
        />
      ))}

      <text
        x={width / 2}
        y={height - 6}
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize={12}
      >
        Completion time T
      </text>
      <text
        x={14}
        y={height / 2}
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize={12}
        transform={`rotate(-90 14 ${height / 2})`}
      >
        P(T)
      </text>
    </svg>
  );
}

const editableToNode = (node: EditableNode): Node => ({
  id: node.id,
  precNode: node.precNode.trim() === ''
    ? []
    : node.precNode.split(',').map((value) => parseInt(value.trim(), 10)),
  nodeTime: Number.isFinite(parseFloat(node.nodeTime)) ? parseFloat(node.nodeTime) : 0,
  finishFlag: node.finishFlag,
  output: defaultOutputSummary(),
  outputNotation: node.outputNotation,
});

const nodeToEditable = (node: Node): EditableNode => ({
  id: node.id,
  precNode: node.precNode.join(', '),
  nodeTime: String(node.nodeTime),
  finishFlag: node.finishFlag,
  outputNotation: node.outputNotation || formatOutputNotation(node.output),
  pathFlagDisplay: '[]',
  pathTimeDisplay: '[]',
});

const apiNodeToNode = (node: Node): Node => ({
  id: node.id,
  precNode: node.precNode,
  nodeTime: node.nodeTime,
  finishFlag: node.finishFlag,
  output: node.output ?? defaultOutputSummary(),
  outputNotation: node.outputNotation || formatOutputNotation(node.output ?? defaultOutputSummary()),
});

const apiErrorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => null);
  const detail = payload?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  if (payload?.message) return payload.message;
  return `HTTP error! status: ${response.status}`;
};

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
  
  // 網路資料（MySQL saved_networks）
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedNetworkForEdit, setSelectedNetworkForEdit] = useState<string>('');
  const [editingNetworkId, setEditingNetworkId] = useState<number | null>(null);
  const [selectedNetworkForReview, setSelectedNetworkForReview] = useState<string>('');
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
  const [selectedReviewedNetwork, setSelectedReviewedNetwork] = useState<string>('');
  const [graphNetworkName, setGraphNetworkName] = useState<string>('');
  const [isGraphing, setIsGraphing] = useState<boolean>(false);
  const [isRunningLcta, setIsRunningLcta] = useState<boolean>(false);
  const [isRunningCpa, setIsRunningCpa] = useState<boolean>(false);
  const [isRunningFindPaths, setIsRunningFindPaths] = useState<boolean>(false);
  const [lctaAnalysis, setLctaAnalysis] = useState<LctaAnalysisResult | null>(null);
  const [cpaAnalysis, setCpaAnalysis] = useState<CpaAnalysisResult | null>(null);
  const [findPathsAnalysis, setFindPathsAnalysis] = useState<FindPathsAnalysisResult | null>(null);
  const [showNodeTable, setShowNodeTable] = useState<boolean>(true);
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null);
  const [isResolvingDbUser, setIsResolvingDbUser] = useState(false);

  const sessionUserId = session?.user?.id ? Number(session.user.id) : NaN;
  const hasSessionDbUser = Number.isFinite(sessionUserId) && sessionUserId > 0;
  const effectiveUserId = hasSessionDbUser ? sessionUserId : resolvedUserId;
  const hasDbUser =
    effectiveUserId !== null &&
    Number.isFinite(effectiveUserId) &&
    effectiveUserId > 0;
  const reviewedNetworks = networks.filter((n) => n.passReview);

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

  useEffect(() => {
    if (hasSessionDbUser || !session?.user?.email) {
      setResolvedUserId(null);
      return;
    }

    let cancelled = false;
    setIsResolvingDbUser(true);

    fetch('/api/python/auth/user-by-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: session.user.email,
        name: session.user.name,
        provider: 'google',
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await apiErrorMessage(response));
        }
        return response.json() as Promise<{ id?: number } | null>;
      })
      .then((user) => {
        if (!cancelled && user?.id && user.id > 0) {
          setResolvedUserId(user.id);
        }
      })
      .catch((error) => {
        console.error('Error resolving DB user by email:', error);
        if (!cancelled) {
          setGenerationError(
            error instanceof Error
              ? error.message
              : '無法依 email 連結 MySQL 使用者',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolvingDbUser(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasSessionDbUser, session?.user?.email, session?.user?.name]);

  const reloadNetworks = async () => {
    if (!hasDbUser || effectiveUserId === null) return;
    const networkResponse = await fetch(
      `/api/python/networks?userId=${encodeURIComponent(String(effectiveUserId))}&includeGraph=false`
    );
    if (!networkResponse.ok) {
      throw new Error(await apiErrorMessage(networkResponse));
    }
    const persistedNetworks: Network[] = await networkResponse.json();
    setNetworks(persistedNetworks);
  };

  useEffect(() => {
    if (!hasDbUser) return;
    reloadNetworks().catch((error) => {
      console.error('Error loading persisted networks:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to load saved networks');
    });
  }, [hasDbUser, effectiveUserId]);

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
    setLctaAnalysis(null);
    setCpaAnalysis(null);
    setFindPathsAnalysis(null);
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // 開啟 Add Node Modal 並初始化
  const handleOpenAddNodeModal = () => {
    clearDisplayAreas();
    setModalNodes([{
      id: 0,
      precNode: '',
      nodeTime: '',
      finishFlag: false,
      outputNotation: INITIAL_OUTPUT_NOTATION,
      pathFlagDisplay: '[]',
      pathTimeDisplay: '[]',
    }]);
    setShowAddNodeModal(true);
  };

  // 處理 Modal 中節點資料的變更
  const handleModalNodeChange = (index: number, field: keyof EditableNode, value: string | number | boolean) => {
    if (index === 0 && field === 'precNode') {
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
      precNode: '',
      nodeTime: '',
      finishFlag: false,
      outputNotation: INITIAL_OUTPUT_NOTATION,
      pathFlagDisplay: '[]',
      pathTimeDisplay: '[]',
    };
    const newModalNodes = [
      ...modalNodes.slice(0, index + 1),
      newRow,
      ...modalNodes.slice(index + 1)
    ].map((node, i) => ({ ...node, id: i })); // 重新編號 ID
    setModalNodes(newModalNodes);
  };

  // 刪除節點行並重新編號 ID，同步調整 previousNodes 參照
  const deleteModalNodeRow = (index: number) => {
    if (modalNodes.length <= 1) {
      alert('至少需要保留一個節點。');
      return;
    }
    if (index === 0) {
      alert('無法刪除起始節點（ID 0）。');
      return;
    }

    const deletedId = index;
    const remapped = modalNodes
      .filter((_, i) => i !== index)
      .map((node, newId) => {
        const predecessors = node.precNode.trim() === ''
          ? []
          : node.precNode
              .split(',')
              .map((value) => parseInt(value.trim(), 10))
              .filter((value) => !Number.isNaN(value));

        const adjusted = predecessors
          .filter((id) => id !== deletedId)
          .map((id) => (id > deletedId ? id - 1 : id));

        return {
          ...node,
          id: newId,
          precNode: adjusted.join(', '),
        };
      });

    setModalNodes(remapped);
  };

  const buildNodePayload = (sourceNodes: Node[]) =>
    sourceNodes.map((n) => ({
      id: n.id,
      precNode: n.precNode,
      nodeTime: n.nodeTime,
      finishFlag: false,
      output: defaultOutputSummary(),
    }));

  const filterValidModalNodes = () =>
    modalNodes.filter((n, index) => {
      if (index === 0) return true;
      return n.precNode.trim() !== '' || n.nodeTime.trim() !== '';
    });

  const upsertNetworkInState = (saved: Network) => {
    setNetworks((prev) => {
      const idx = prev.findIndex((n) => n.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      return prev.map((n) => (n.id === saved.id ? saved : n));
    });
  };

  // 儲存至 MySQL（草稿，尚未 Review）
  const handleSaveNetwork = async () => {
    if (!networkName.trim()) {
      alert('Please enter a network name.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account before saving networks.');
      return;
    }

    const validModalNodes = filterValidModalNodes();
    if (validModalNodes.length === 0) {
      alert('Please add at least one valid node.');
      return;
    }

    try {
      const response = await fetch('/api/python/networks/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          name: networkName.trim(),
          draft: true,
          passReview: false,
          nodes: buildNodePayload(validModalNodes.map(editableToNode)),
        }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }

      const saved: Network = await response.json();
      upsertNetworkInState(saved);
      setNodes(saved.nodes.map(apiNodeToNode));
      setCurrentNodeId(saved.nodes.length);
      setShowNodeTable(true);
      setLctaAnalysis(null);
      setNetworkGraph('');
      setNetworkName('');
      setShowNetworkNameModal(false);
      setShowAddNodeModal(false);
      alert(`Network "${saved.name}" saved. Run Review Network before graphing.`);
    } catch (error) {
      console.error('Error saving network:', error);
      alert(error instanceof Error ? error.message : 'Failed to save network.');
    }
  };

  // 更新已儲存網路（編輯後需重新 Review）
  const handleUpdateNetwork = async () => {
    if (editingNetworkId === null) {
      alert('No network selected for update.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account.');
      return;
    }

    const validModalNodes = filterValidModalNodes();
    if (validModalNodes.length === 0) {
      alert('A network cannot be empty.');
      return;
    }

    try {
      const response = await fetch(`/api/python/networks/${editingNetworkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          draft: true,
          passReview: false,
          nodes: buildNodePayload(validModalNodes.map(editableToNode)),
        }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }

      const saved: Network = await response.json();
      upsertNetworkInState({ ...saved, passReview: false, lctaResult: null });
      setNodes(saved.nodes.map(apiNodeToNode));
      setCurrentNodeId(saved.nodes.length);
      setShowNodeTable(true);
      setLctaAnalysis(null);
      setNetworkGraph('');
      setSelectedNetwork('');
      setShowEditNodeModal(false);
      setIsEditingTable(false);
      setSelectedNetworkForEdit('');
      setEditingNetworkId(null);
      alert(`Network "${saved.name}" updated. Analysis results were reset — please run Review Network again.`);
    } catch (error) {
      console.error('Error updating network:', error);
      alert(error instanceof Error ? error.message : 'Failed to update network.');
    }
  };

  const applyLctaResultsToView = (net: Network, cached = false) => {
    setNodes(net.nodes.map(apiNodeToNode));
    setCurrentNodeId(net.nodes.length);
    setShowNodeTable(true);
    if (net.lctaResult) {
      setLctaAnalysis(lctaResultToAnalysis(net.lctaResult, net.name, cached));
    }
    if (net.graph) {
      setNetworkGraph(net.graph);
    }
  };

  const handleRunLcta = async () => {
    if (!selectedNetwork) {
      alert('Please select a reviewed network for LCTA analysis.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account.');
      return;
    }

    const networkId = Number(selectedNetwork);
    const network = reviewedNetworks.find((n) => n.id === networkId);
    if (!network) {
      alert('Selected network not found.');
      return;
    }

    setIsRunningLcta(true);
    setLctaAnalysis(null);
    setCpaAnalysis(null);
    setFindPathsAnalysis(null);
    setGenerationError('');

    try {
      // Reuse saved LCTA PDF when network topology was not changed (Edit save clears this).
      if (network.lctaResult) {
        applyLctaResultsToView(network, true);
        return;
      }

      const response = await fetch(`/api/python/networks/${networkId}/lcta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }

      const data = await response.json();
      const analyzedNodes: Node[] = (data.nodes ?? []).map(apiNodeToNode);
      const updatedNetwork: Network = {
        ...network,
        nodes: analyzedNodes,
        lctaResult: data.lctaResult ?? network.lctaResult,
        passReview: true,
      };
      setNodes(analyzedNodes);
      setCurrentNodeId(analyzedNodes.length);
      setShowNodeTable(true);

      if (data.lctaResult) {
        setLctaAnalysis(lctaResultToAnalysis(data.lctaResult, network.name, Boolean(data.cached)));
      }

      if (data.graph) {
        setNetworkGraph(data.graph);
        updatedNetwork.graph = data.graph;
      }

      upsertNetworkInState(updatedNetwork);
    } catch (error) {
      console.error('LCTA analysis failed:', error);
      alert(error instanceof Error ? error.message : 'LCTA analysis failed.');
    } finally {
      setIsRunningLcta(false);
    }
  };

  const handleRunCpa = async (mode: 'longest' | 'shortest') => {
    if (!selectedNetwork) {
      alert('Please select a reviewed network for CPA analysis.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account.');
      return;
    }

    const networkId = Number(selectedNetwork);
    const network = reviewedNetworks.find((n) => n.id === networkId);
    if (!network) {
      alert('Selected network not found.');
      return;
    }

    setIsRunningCpa(true);
    setLctaAnalysis(null);
    setCpaAnalysis(null);
    setFindPathsAnalysis(null);
    setGenerationError('');

    try {
      const response = await fetch(`/api/python/networks/${networkId}/cpa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId, mode }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }

      const data = await response.json();
      const analyzedNodes: Node[] = (data.nodes ?? []).map(apiNodeToNode);
      setNodes(analyzedNodes);
      setCurrentNodeId(analyzedNodes.length);
      setShowNodeTable(true);
      setCpaAnalysis({
        networkName: network.name,
        mode: data.mode,
        criticalPath: data.criticalPath,
        totalExpectedTime: data.totalExpectedTime,
      });
      if (data.graph) {
        setNetworkGraph(data.graph);
      }
    } catch (error) {
      console.error('CPA analysis failed:', error);
      alert(error instanceof Error ? error.message : 'CPA analysis failed.');
    } finally {
      setIsRunningCpa(false);
    }
  };

  const handleRunFindPaths = async () => {
    if (!selectedNetwork) {
      alert('Please select a reviewed network for path enumeration.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account.');
      return;
    }

    const networkId = Number(selectedNetwork);
    const network = reviewedNetworks.find((n) => n.id === networkId);
    if (!network) {
      alert('Selected network not found.');
      return;
    }

    setIsRunningFindPaths(true);
    setLctaAnalysis(null);
    setCpaAnalysis(null);
    setFindPathsAnalysis(null);
    setGenerationError('');

    try {
      const response = await fetch(`/api/python/networks/${networkId}/find-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }

      const data = await response.json();
      const analyzedNodes: Node[] = (data.nodes ?? []).map(apiNodeToNode);
      setNodes(analyzedNodes);
      setCurrentNodeId(analyzedNodes.length);
      setShowNodeTable(true);
      setFindPathsAnalysis({
        networkName: network.name,
        pathCount: data.pathCount,
        paths: data.paths,
      });
      if (data.graph) {
        setNetworkGraph(data.graph);
      }
    } catch (error) {
      console.error('Find-path analysis failed:', error);
      alert(error instanceof Error ? error.message : 'Find-path analysis failed.');
    } finally {
      setIsRunningFindPaths(false);
    }
  };

  // 選擇網路（分析區顯示）
  const handleSelectNetwork = async (networkId: string) => {
    setSelectedNetwork(networkId);
    setCpaAnalysis(null);
    setFindPathsAnalysis(null);
    const network = reviewedNetworks.find((n) => String(n.id) === networkId);
    if (!network) return;

    setNodes(network.nodes.map(apiNodeToNode));
    setCurrentNodeId(network.nodes.length);
    setLctaAnalysis(network.lctaResult ? lctaResultToAnalysis(network.lctaResult, network.name, true) : null);

    if (network.graph) {
      setNetworkGraph(network.graph);
      return;
    }

    try {
      const graphResponse = await fetch('/api/python/graph-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: buildNodePayload(network.nodes) }),
      });
      if (!graphResponse.ok) {
        throw new Error(await apiErrorMessage(graphResponse));
      }
      const graphData: NetworkGenerationResponse = await graphResponse.json();
      setNetworkGraph(graphData.graph);
    } catch (error) {
      console.error('Error loading network graph:', error);
      setNetworkGraph('');
    }
  };

  // Randomly Generate Network 處理
  const handleRandomGenerate = async () => {
    if (!randomNetworkName.trim()) {
      alert('Please enter a network name.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account before saving networks.');
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
        const convertedNodes: Node[] = data.nodes.map(apiNodeToNode);

        const saveResponse = await fetch('/api/python/networks/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            name: randomNetworkName,
            graph: data.graph,
            passReview: true,
            nodes: buildNodePayload(convertedNodes),
          }),
        });

        if (!saveResponse.ok) {
          throw new Error(await apiErrorMessage(saveResponse));
        }

        const savedNetwork: Network = await saveResponse.json();

        setNodes(convertedNodes);
        setCurrentNodeId(convertedNodes.length);
        setShowNodeTable(true);
        setLctaAnalysis(null);
        setNetworkGraph(savedNetwork.graph || data.graph);
        upsertNetworkInState({ ...savedNetwork, graph: savedNetwork.graph || data.graph, passReview: true });
        
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
    if (!selectedReviewedNetwork) {
      alert('Please select a network.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account before saving networks.');
      return;
    }

    const network = networks.find((n) => String(n.id) === selectedReviewedNetwork);
    if (!network) {
      alert('Selected network not found.');
      return;
    }
    if (!network.passReview) {
      alert('Please review and pass the network before graphing.');
      return;
    }

    setIsGraphing(true);
    setShowGraphNetworkModal(false);
    
    try {
      const graphResponse = await fetch('/api/python/graph-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: buildNodePayload(network.nodes) }),
      });

      if (!graphResponse.ok) {
        throw new Error(await apiErrorMessage(graphResponse));
      }

      const graphData: NetworkGenerationResponse = await graphResponse.json();

      const response = await fetch(`/api/python/networks/${network.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          passReview: true,
          graph: graphData.graph,
          nodes: buildNodePayload(network.nodes),
        }),
      });
      
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      
      const data: Network = await response.json();
      
      setNodes(data.nodes.map(apiNodeToNode));
      setCurrentNodeId(data.nodes.length);
      setShowNodeTable(true);
      setNetworkGraph(graphData.graph);
      upsertNetworkInState({ ...data, graph: graphData.graph, passReview: true });
      
      alert(`Successfully graphed network "${network.name}"!`);
      
    } catch (error) {
      console.error('Error graphing network:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to graph network');
      alert('Failed to create network graph. Please try again.');
    } finally {
      setIsGraphing(false);
      setSelectedReviewedNetwork('');
      setGraphNetworkName('');
    }
  };

  const handleReviewNetwork = async () => {
    if (!selectedNetworkForReview) {
      alert('Please select a network to review.');
      return;
    }
    if (!hasDbUser) {
      alert('Please sign in with a database-backed account.');
      return;
    }

    const networkId = Number(selectedNetworkForReview);
    const network = networks.find((n) => n.id === networkId);
    if (!network) {
      alert('Selected network not found.');
      return;
    }

    try {
      const response = await fetch(`/api/python/networks/${networkId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const detail = payload?.detail;
        if (detail?.errors) {
          setReviewErrors(detail.errors);
          setShowReviewErrorsModal(true);
          upsertNetworkInState({ ...network, passReview: false });
          return;
        }
        throw new Error(await apiErrorMessage(response));
      }

      const reviewed: Network = await response.json();
      upsertNetworkInState({ ...reviewed, passReview: true });
      alert(`Network "${network.name}" has passed the review!`);
      setShowReviewNodeModal(false);
      setSelectedNetworkForReview('');
    } catch (error) {
      console.error('Error reviewing network:', error);
      alert(error instanceof Error ? error.message : 'Failed to review network.');
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
                Q &amp; A
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
              <p className="text-xs text-gray-500">
                DB user id:{' '}
                {hasDbUser
                  ? effectiveUserId
                  : isResolvingDbUser
                    ? '正在連結 MySQL…'
                    : '未連線 MySQL（無法載入已存網路）'}
              </p>
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
                  Create Network
                </button>
                <button
                  onClick={() => {
                    clearDisplayAreas();
                    setShowEditNodeModal(true);
                    setIsEditingTable(false);
                    setSelectedNetworkForEdit('');
                  }}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Network
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
                    setSelectedNetworkForReview('');
                  }}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Review Network
                </button>
                <button
                  onClick={() => {
                    clearDisplayAreas();
                    setShowGraphNetworkModal(true);
                    setSelectedReviewedNetwork('');
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
                    {reviewedNetworks.map((network) => (
                      <option key={network.id} value={network.id}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {reviewedNetworks.length === 0
                      ? 'No reviewed networks yet. Complete Review Network first.'
                      : `${reviewedNetworks.length} reviewed network(s) available for analysis`}
                  </p>
                </div>
                <button
                  onClick={() => handleRunCpa('shortest')}
                  disabled={!selectedNetwork || isRunningCpa || isRunningLcta || isRunningFindPaths || !hasDbUser}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRunningCpa ? (
                    <span className="animate-pulse">Running CPA...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Shortest Path (CPA)
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleRunCpa('longest')}
                  disabled={!selectedNetwork || isRunningCpa || isRunningLcta || isRunningFindPaths || !hasDbUser}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRunningCpa ? (
                    <span className="animate-pulse">Running CPA...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                      Longest Path (CPA)
                    </>
                  )}
                </button>
                <button
                  onClick={handleRunFindPaths}
                  disabled={!selectedNetwork || isRunningFindPaths || isRunningCpa || isRunningLcta || !hasDbUser}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRunningFindPaths ? (
                    <span className="animate-pulse">Running...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Network Path List
                    </>
                  )}
                </button>
                <button
                  onClick={handleRunLcta}
                  disabled={!selectedNetwork || isRunningLcta || isRunningFindPaths || !hasDbUser}
                  className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all font-medium text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRunningLcta ? (
                    <>
                      <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Running LCTA...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Network Completion Time (LCTA)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="ml-80 flex-1 p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {!hasDbUser && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-900/30 p-4 text-amber-100 text-sm">
                目前登入身分尚未對應到 MySQL 數字使用者 ID，無法讀寫已存網路。請確認 Railway 的{' '}
                <code className="text-amber-200">DATABASE_URL</code> 與 FastAPI 是否正常，並重新登入。
                本機與線上為<strong>不同資料庫</strong>，在本機建立的 network 不會自動出現在 Railway。
              </div>
            )}
            {/* Network Visualization Area */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
              <div className="flex items-center justify-between mb-4 gap-4">
                <h2 className="text-2xl font-bold text-white flex items-center">
                  <svg className="w-6 h-6 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Network Structure Visualization
                </h2>
                {nodes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNodeTable((prev) => !prev)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-600 text-gray-300 hover:text-white hover:border-cyan-400/50 transition-colors shrink-0"
                  >
                    {showNodeTable ? '收合資料表' : '展開資料表'}
                  </button>
                )}
              </div>

              {nodes.length > 0 && showNodeTable && (
                <div className="mb-6 overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-900/40">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-blue-500/30">
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Node ID</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Prec Node</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Node Time</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Finish Flag</th>
                        <th className="py-3 px-4 text-cyan-400 font-semibold">Output [E, Var]</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((node) => (
                        <tr key={node.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-white font-mono">{node.id}</td>
                          <td className="py-3 px-4 text-gray-300">{node.precNode.length > 0 ? `[${node.precNode.join(', ')}]` : '[]'}</td>
                          <td className="py-3 px-4 text-gray-300">{typeof node.nodeTime === 'number' ? node.nodeTime.toFixed(2) : node.nodeTime}</td>
                          <td className="py-3 px-4 text-gray-300">{node.finishFlag.toString()}</td>
                          <td className="py-3 px-4 text-gray-300 text-xs">
                            {node.outputNotation || formatOutputNotation(node.output)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
              <div className="bg-slate-900/50 rounded-lg p-6 min-h-64 border-2 border-dashed border-blue-500/30">
                {isRunningLcta ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-400 mb-4" />
                    <p className="text-gray-400">Running LCTA analysis...</p>
                  </div>
                ) : isRunningCpa ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mb-4" />
                    <p className="text-gray-400">Running CPA analysis...</p>
                  </div>
                ) : isRunningFindPaths ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-400 mb-4" />
                    <p className="text-gray-400">Enumerating network paths...</p>
                  </div>
                ) : findPathsAnalysis ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm border border-emerald-500/30">
                        Network Path List
                      </span>
                      <span className="text-gray-500 text-sm">{findPathsAnalysis.networkName}</span>
                    </div>

                    <div className="rounded-lg bg-slate-800/80 border border-emerald-500/20 p-4">
                      <p className="text-sm text-gray-400 mb-1">Total path count</p>
                      <p className="text-3xl font-bold text-emerald-300 tabular-nums">
                        {findPathsAnalysis.pathCount}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-white font-semibold mb-3">
                        All paths (Total_Sequence at root)
                      </h3>
                      <div className="rounded-lg bg-slate-950/60 border border-slate-700/50 divide-y divide-slate-700/50 max-h-80 overflow-y-auto">
                        {findPathsAnalysis.paths.length === 0 ? (
                          <p className="p-4 text-gray-500 text-sm">No paths found.</p>
                        ) : (
                          findPathsAnalysis.paths.map((path, index) => (
                            <div key={index} className="px-4 py-3 flex items-baseline gap-3">
                              <span className="text-gray-500 text-xs font-mono shrink-0 w-8">
                                #{index + 1}
                              </span>
                              <span className="text-white font-mono text-sm tracking-wide">
                                {path.join(' → ')}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : cpaAnalysis ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-sm border border-cyan-500/30">
                        CPA — {cpaAnalysis.mode === 'longest' ? 'Longest Path' : 'Shortest Path'}
                      </span>
                      <span className="text-gray-500 text-sm">{cpaAnalysis.networkName}</span>
                    </div>

                    <div className="rounded-lg bg-slate-800/80 border border-cyan-500/20 p-4">
                      <p className="text-sm text-gray-400 mb-2">Critical path (start → root)</p>
                      <p className="text-xl font-mono text-white tracking-wide">
                        {cpaAnalysis.criticalPath.join(' → ')}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-800/80 border border-amber-500/20 p-4">
                      <p className="text-sm text-gray-400 mb-1">Total expected path time</p>
                      <p className="text-3xl font-bold text-amber-300 tabular-nums">
                        {cpaAnalysis.totalExpectedTime.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Sum of Node_Time means along the critical path
                      </p>
                    </div>
                  </div>
                ) : lctaAnalysis ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-sm border border-amber-500/30">
                        LCTA — {lctaAnalysis.networkName}
                      </span>
                      {lctaAnalysis.cached && (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-sm border border-emerald-500/30">
                          已載入先前計算結果
                        </span>
                      )}
                      <span className="text-gray-500 text-sm">
                        {lctaAnalysis.values.length} discrete support points
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-lg bg-slate-800/80 border border-cyan-500/20 p-4">
                        <p className="text-sm text-gray-400 mb-1">Expected completion time E[T]</p>
                        <p className="text-3xl font-bold text-cyan-300 tabular-nums">
                          {lctaAnalysis.mean.toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 border border-amber-500/20 p-4">
                        <p className="text-sm text-gray-400 mb-1">Variance Var(T)</p>
                        <p className="text-3xl font-bold text-amber-300 tabular-nums">
                          {lctaAnalysis.variance.toFixed(4)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          σ ≈ {Math.sqrt(lctaAnalysis.variance).toFixed(4)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-white font-semibold mb-3">
                        Completion time probability distribution P(T)
                      </h3>
                      <div className="rounded-lg bg-slate-950/60 border border-slate-700/50 p-4">
                        <CompletionTimePdfChart
                          values={lctaAnalysis.values}
                          probabilities={lctaAnalysis.probabilities}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-400 text-lg mb-2">Analyze the Selected Network</p>
                    <p className="text-gray-500 text-sm">
                      Run <span className="text-emerald-300">Network Path List</span>,{' '}
                      <span className="text-cyan-300">Shortest/Longest Path (CPA)</span>, or{' '}
                      <span className="text-amber-300">Network Completion Time (LCTA)</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Node Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-4xl w-full border border-blue-500/30 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-2xl font-bold text-white mb-6">Create Network — Add Nodes</h3>
            <div className="flex-grow overflow-y-auto pr-2">
              <table className="w-full text-left table-fixed">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="border-b border-blue-500/30">
                    <th className="py-3 px-2 w-16 text-cyan-400 font-semibold text-sm">ID</th>
                    <th className="py-3 px-2 w-36 text-cyan-400 font-semibold text-sm">Prec Node</th>
                    <th className="py-3 px-2 w-28 text-cyan-400 font-semibold text-sm">Node Time</th>
                    <th className="py-3 px-2 w-20 text-cyan-400 font-semibold text-sm">Finish</th>
                    <th className="py-3 px-2 w-28 text-cyan-400 font-semibold text-sm">Output</th>
                    <th className="py-3 px-2 w-24 text-cyan-400 font-semibold text-sm">Actions</th>
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
                            value={node.precNode}
                            onChange={(e) => handleModalNodeChange(index, 'precNode', e.target.value)}
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
                          value={node.nodeTime}
                          onChange={(e) => handleModalNodeChange(index, 'nodeTime', e.target.value)}
                          placeholder="0.0"
                          className="w-full px-2 py-1 bg-slate-900 border border-blue-500/30 rounded-md text-white focus:outline-none focus:border-cyan-400"
                        />
                      </td>
                      <td className="py-2 px-2 text-gray-400">{node.finishFlag.toString()}</td>
                      <td className="py-2 px-2 text-gray-400 text-xs">{node.outputNotation}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => addModalNodeRow(index)}
                            title="Add New Node"
                            className="text-green-400 hover:text-green-300"
                          >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteModalNodeRow(index)}
                            disabled={index === 0}
                            title="Delete Node"
                            className="text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex space-x-3 mt-8 pt-4 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => addModalNodeRow(modalNodes.length - 1)}
                className="px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm"
              >
                Add New Node
              </button>
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
                      return n.precNode.trim() !== '' || n.nodeTime.trim() !== '';
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
                onClick={handleSaveNetwork}
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

      {/* Edit Network Modal */}
      {showEditNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-slate-800 rounded-2xl p-8 w-full border border-blue-500/30 shadow-2xl flex flex-col max-h-[90vh] ${isEditingTable ? 'max-w-4xl' : 'max-w-md'}`}>
            <h3 className="text-2xl font-bold text-white mb-6">Edit Network</h3>
            
            {!isEditingTable ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Network
                  </label>
                  <select 
                    value={selectedNetworkForEdit}
                    onChange={(e) => setSelectedNetworkForEdit(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">選擇要編輯的網路...</option>
                    {networks.map((net) => (
                      <option key={net.id} value={net.id}>
                        {net.name}{net.passReview ? ' (Reviewed)' : ''}
                      </option>
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
                      const net = networks.find((n) => String(n.id) === selectedNetworkForEdit);
                      if (net) {
                        setModalNodes(net.nodes.map(nodeToEditable));
                        setEditingNetworkId(net.id);
                        setIsEditingTable(true);
                      } else {
                        alert('Please select a network to edit.');
                      }
                    }}
                    disabled={!selectedNetworkForEdit || networks.length === 0}
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
                        <th className="py-3 px-2 w-36 text-cyan-400 font-semibold text-sm">Prec Node</th>
                        <th className="py-3 px-2 w-28 text-cyan-400 font-semibold text-sm">Node Time</th>
                        <th className="py-3 px-2 w-20 text-cyan-400 font-semibold text-sm">Finish</th>
                        <th className="py-3 px-2 w-28 text-cyan-400 font-semibold text-sm">Output</th>
                        <th className="py-3 px-2 w-24 text-cyan-400 font-semibold text-sm">Actions</th>
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
                                value={node.precNode}
                                onChange={(e) => handleModalNodeChange(index, 'precNode', e.target.value)}
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
                              value={node.nodeTime}
                              onChange={(e) => handleModalNodeChange(index, 'nodeTime', e.target.value)}
                              placeholder="0.0"
                              className="w-full px-2 py-1 bg-slate-900 border border-blue-500/30 rounded-md text-white focus:outline-none focus:border-cyan-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-gray-400">{node.finishFlag.toString()}</td>
                          <td className="py-2 px-2 text-gray-400 text-xs">{node.outputNotation}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => addModalNodeRow(index)}
                                title="Add New Node"
                                className="text-green-400 hover:text-green-300"
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteModalNodeRow(index)}
                                disabled={index === 0}
                                title="Delete Node"
                                className="text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex space-x-3 mt-8 pt-4 border-t border-slate-700/50">
                  <button
                    type="button"
                    onClick={() => addModalNodeRow(modalNodes.length - 1)}
                    className="px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium text-sm"
                  >
                    Add New Node
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingTable(false);
                      setEditingNetworkId(null);
                    }}
                    className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
                  >
                    返回
                  </button>
                  <button
                    onClick={handleUpdateNetwork}
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

      {/* Review Network Modal */}
      {showReviewNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-blue-500/30 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Review Network</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Network to Review
                </label>
                <select 
                  value={selectedNetworkForReview}
                  onChange={(e) => setSelectedNetworkForReview(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">選擇要審查的網路...</option>
                  {networks.map((net) => (
                    <option key={net.id} value={net.id}>
                      {net.name}{net.passReview ? ' (Passed)' : ''}
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
                onClick={handleReviewNetwork}
                disabled={!selectedNetworkForReview || networks.length === 0}
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
                  Select Reviewed Network
                </label>
                <select 
                  value={selectedReviewedNetwork}
                  onChange={(e) => {
                    setSelectedReviewedNetwork(e.target.value);
                    const net = networks.find((n) => String(n.id) === e.target.value);
                    setGraphNetworkName(net?.name || '');
                  }}
                  className="w-full px-4 py-3 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Select a reviewed network...</option>
                  {networks
                    .filter((net) => net.passReview === true)
                    .map((net) => (
                      <option key={net.id} value={net.id}>
                        {net.name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Only networks that passed review are available
                </p>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => {
                  setShowGraphNetworkModal(false);
                  setSelectedReviewedNetwork('');
                  setGraphNetworkName('');
                }}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleGraphNetwork}
                disabled={!selectedReviewedNetwork}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Graph Network
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
            <p className="text-gray-300 mb-6">The following issues were found in the network:</p>
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
