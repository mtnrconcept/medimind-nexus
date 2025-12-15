import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ReactFlow,
    Node as RFNode,
    Edge as RFEdge,
    Controls,
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    MarkerType,
    Handle,
    Position,
    NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    Network, ZoomIn, ZoomOut, Maximize2, Loader2, Link2,
    Circle, Search, RefreshCw, X, Database, Box, Brain
} from 'lucide-react';
import { Suspense, lazy } from 'react';

// Lazy load 3D component for performance
const KnowledgeGraph3D = lazy(() => import('./KnowledgeGraph3D'));
import CategoryTreePanel from './CategoryTreePanel';
import LinkCreationModal from './LinkCreationModal';
import LinkAnalysisPanel from './LinkAnalysisPanel';

interface Node {
    id: string;
    node_type: string;
    name: string;
    external_id: string | null;
    category_id: string | null;
    properties: Record<string, any>;
}

interface Edge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
    provenance: string;
    confidence_score: number | null;
}

const NODE_COLORS: Record<string, string> = {
    substance: '#3b82f6',
    medication: '#22c55e',
    pathology: '#ef4444',
    symptom: '#f59e0b',
    treatment: '#8b5cf6',
    enzyme: '#ec4899',
    receptor: '#06b6d4',
    allergen: '#f97316',
    food: '#84cc16',
    vaccine: '#14b8a6',
    organ: '#64748b',
};

// Custom node component with connection handles
const KGNode = ({ data, selected }: NodeProps) => {
    const color = NODE_COLORS[data.nodeType as string] || '#94a3b8';

    return (
        <div
            className={`px-3 py-2 rounded-lg border-2 shadow-sm transition-all ${selected ? 'ring-2 ring-violet-500 ring-offset-2' : ''
                }`}
            style={{
                backgroundColor: `${color}15`,
                borderColor: color,
                minWidth: 100,
                maxWidth: 180,
            }}
        >
            {/* Connection handles for edge drawing */}
            <Handle
                type="target"
                position={Position.Top}
                className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
            />
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
            />
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
            />

            <div className="flex items-center gap-2">
                <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                    {data.label as string}
                </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 capitalize">
                {data.nodeType as string}
            </div>
        </div>
    );
};

const nodeTypes = { kgNode: KGNode };

const KnowledgeGraphView = () => {
    const { t } = useAutoTranslation();

    // ReactFlow state
    const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

    // Original data
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalNodeCount, setTotalNodeCount] = useState(0);

    // UI state
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);

    // Modal state for edge creation
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [pendingConnection, setPendingConnection] = useState<{ source: Node | null; target: Node | null }>({
        source: null,
        target: null,
    });

    // 3D view state
    const [view3D, setView3D] = useState(false);
    const [linkRefreshTrigger, setLinkRefreshTrigger] = useState(0);

    // Pagination
    const [currentPage, setCurrentPage] = useState(0);
    const PAGE_SIZE = 200;

    // Load graph data with filters
    const loadGraphData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Build query
            let query = supabase.from('cde_nodes').select('*', { count: 'exact' });

            if (selectedCategoryId) {
                query = query.eq('category_id', selectedCategoryId);
            }
            if (selectedNodeType) {
                query = query.eq('node_type', selectedNodeType);
            }
            if (searchQuery) {
                query = query.ilike('name', `%${searchQuery}%`);
            }

            query = query.range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

            const { data: nodesData, error: nodesError, count } = await query;

            if (nodesError) throw nodesError;

            setNodes((nodesData || []) as Node[]);
            setTotalNodeCount(count || 0);

            // Load edges for visible nodes
            if (nodesData && nodesData.length > 0) {
                const nodeIds = nodesData.map(n => n.id);
                const { data: edgesData } = await supabase
                    .from('cde_edges')
                    .select('*')
                    .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`)
                    .limit(1000);

                setEdges((edgesData || []) as Edge[]);
            } else {
                setEdges([]);
            }
        } catch (err) {
            console.error('Error loading graph:', err);
            toast.error(t('Erreur lors du chargement du graphe'));
        } finally {
            setIsLoading(false);
        }
    }, [selectedCategoryId, selectedNodeType, searchQuery, currentPage, t]);

    useEffect(() => {
        loadGraphData();
    }, [loadGraphData]);

    // Convert nodes to ReactFlow format
    useEffect(() => {
        if (nodes.length === 0) {
            setRfNodes([]);
            setRfEdges([]);
            return;
        }

        // Group nodes by type for layout
        const nodesByType: Record<string, Node[]> = {};
        nodes.forEach(node => {
            if (!nodesByType[node.node_type]) {
                nodesByType[node.node_type] = [];
            }
            nodesByType[node.node_type].push(node);
        });

        // Calculate positions
        const types = Object.keys(nodesByType);
        const centerX = 400;
        const centerY = 300;
        const positions: Record<string, { x: number; y: number }> = {};

        types.forEach((type, typeIndex) => {
            const typeNodes = nodesByType[type];
            const typeAngle = (2 * Math.PI * typeIndex) / types.length;
            const typeRadius = 200;
            const typeCenterX = centerX + typeRadius * Math.cos(typeAngle) * 0.5;
            const typeCenterY = centerY + typeRadius * Math.sin(typeAngle) * 0.5;

            typeNodes.forEach((node, nodeIndex) => {
                const nodeAngle = (2 * Math.PI * nodeIndex) / typeNodes.length;
                const nodeRadius = Math.min(150, 30 + typeNodes.length * 3);
                positions[node.id] = {
                    x: typeCenterX + nodeRadius * Math.cos(nodeAngle),
                    y: typeCenterY + nodeRadius * Math.sin(nodeAngle)
                };
            });
        });

        // Create ReactFlow nodes
        const newRfNodes: RFNode[] = nodes.map(node => ({
            id: node.id,
            type: 'kgNode',
            position: positions[node.id] || { x: 0, y: 0 },
            data: {
                label: node.name,
                nodeType: node.node_type,
                originalNode: node,
            },
        }));

        // Create ReactFlow edges
        const nodeIdSet = new Set(nodes.map(n => n.id));
        const newRfEdges: RFEdge[] = edges
            .filter(edge => nodeIdSet.has(edge.source_node_id) && nodeIdSet.has(edge.target_node_id))
            .map(edge => ({
                id: edge.id,
                source: edge.source_node_id,
                target: edge.target_node_id,
                label: edge.relationship_type,
                markerEnd: { type: MarkerType.ArrowClosed },
                style: { stroke: '#94a3b8', strokeWidth: 1.5 },
                labelStyle: { fontSize: 10, fill: '#64748b' },
            }));

        setRfNodes(newRfNodes);
        setRfEdges(newRfEdges);
    }, [nodes, edges, setRfNodes, setRfEdges]);

    // Handle connection (when user drags an edge between nodes)
    const onConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return;

        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);

        if (sourceNode && targetNode) {
            setPendingConnection({ source: sourceNode, target: targetNode });
            setIsLinkModalOpen(true);
        }
    }, [nodes]);

    // Handle node selection
    const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
        const originalNode = node.data.originalNode as Node;
        setSelectedNodes([originalNode]);
    }, []);

    const handleCreateLink = () => {
        if (selectedNodes.length !== 2) {
            toast.info(t('Sélectionnez 2 nœuds (Ctrl+clic) pour créer un lien'));
            return;
        }
        setPendingConnection({ source: selectedNodes[0], target: selectedNodes[1] });
        setIsLinkModalOpen(true);
    };

    const handleLinkCreated = () => {
        setLinkRefreshTrigger(prev => prev + 1);
        setSelectedNodes([]);
        setPendingConnection({ source: null, target: null });
        // Reload graph to show new edge
        loadGraphData();
    };

    const handleCategorySelect = (categoryId: string | null) => {
        setSelectedCategoryId(categoryId);
        setCurrentPage(0);
    };

    const handleNodeTypeFilter = (nodeType: string | null) => {
        setSelectedNodeType(nodeType);
        setCurrentPage(0);
    };

    const handleSeedKG = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase.rpc('seed_cde_knowledge_graph');
            if (error) throw error;

            // Also classify nodes
            await supabase.rpc('classify_cde_nodes');

            toast.success(t('Knowledge Graph peuplé avec succès'));
            loadGraphData();
        } catch (err: any) {
            console.error('Seed KG error:', err);
            toast.error(err.message || t('Erreur lors du peuplement'));
        } finally {
            setIsLoading(false);
        }
    };

    // Stats
    const nodesByType = nodes.reduce((acc, node) => {
        acc[node.node_type] = (acc[node.node_type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)]">
            {/* Left Panel: Category Tree */}
            <div className="col-span-3">
                <CategoryTreePanel
                    onCategorySelect={handleCategorySelect}
                    selectedCategoryId={selectedCategoryId}
                    onNodeTypeFilter={handleNodeTypeFilter}
                />
            </div>

            {/* Center: Graph Canvas */}
            <div className="col-span-6">
                <Card className="h-full bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Network className="h-5 w-5 text-violet-600" />
                                {t('Knowledge Graph')}
                                <Badge variant="outline">
                                    {nodes.length}/{totalNodeCount}
                                </Badge>
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                {/* Search */}
                                <div className="relative">
                                    <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder={t('Rechercher...')}
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setCurrentPage(0);
                                        }}
                                        className="pl-8 h-8 w-40"
                                    />
                                </div>

                                {/* Seed button */}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleSeedKG}
                                    disabled={isLoading}
                                    title={t('Peupler/Rafraîchir le KG')}
                                >
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                                </Button>

                                <Button size="sm" variant="outline" onClick={loadGraphData} disabled={isLoading}>
                                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </Button>

                                {/* 3D Toggle */}
                                <Button
                                    size="sm"
                                    variant={view3D ? "default" : "outline"}
                                    onClick={() => setView3D(!view3D)}
                                    title={view3D ? t('Passer en 2D') : t('Passer en 3D')}
                                    className={view3D ? "bg-violet-600 hover:bg-violet-700" : ""}
                                >
                                    <Box className="h-4 w-4" />
                                    <span className="ml-1 text-xs">{view3D ? '3D' : '2D'}</span>
                                </Button>
                            </div>
                        </div>

                        {/* Selection toolbar */}
                        {selectedNodes.length > 0 && (
                            <div className="flex items-center gap-2 mt-2 p-2 bg-violet-50 dark:bg-violet-900/30 rounded-lg">
                                <span className="text-sm text-violet-700 dark:text-violet-300">
                                    {selectedNodes.length} sélectionné(s)
                                </span>
                                {selectedNodes.length === 2 && (
                                    <Button
                                        size="sm"
                                        onClick={handleCreateLink}
                                        className="h-7 gap-1 bg-violet-500 hover:bg-violet-600"
                                    >
                                        <Link2 className="h-3 w-3" />
                                        {t('Créer un lien')}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedNodes([])}
                                    className="h-7"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        )}

                        {/* Drag hint */}
                        <div className="text-xs text-slate-500 mt-1">
                            💡 {t('Tirez depuis un nœud vers un autre pour créer un lien')}
                        </div>
                    </CardHeader>

                    <CardContent className="h-[calc(100%-120px)]">
                        {/* 3D View */}
                        {view3D ? (
                            <Suspense fallback={
                                <div className="w-full h-full flex items-center justify-center bg-gray-950 rounded-lg">
                                    <div className="text-white flex items-center gap-2">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                        <span>Chargement de la vue 3D...</span>
                                    </div>
                                </div>
                            }>
                                <KnowledgeGraph3D />
                            </Suspense>
                        ) : (
                            /* 2D ReactFlow View */
                            <div className="w-full h-full rounded-lg border overflow-hidden">
                                {isLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                                    </div>
                                ) : nodes.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                                        <Network className="h-12 w-12 mb-4 opacity-50" />
                                        <p>{t('Knowledge Graph vide')}</p>
                                        <Button onClick={handleSeedKG} className="mt-4 gap-2">
                                            <Database className="h-4 w-4" />
                                            {t('Peupler le graphe')}
                                        </Button>
                                    </div>
                                ) : (
                                    <ReactFlow
                                        nodes={rfNodes}
                                        edges={rfEdges}
                                        onNodesChange={onNodesChange}
                                        onEdgesChange={onEdgesChange}
                                        onConnect={onConnect}
                                        onNodeClick={onNodeClick}
                                        nodeTypes={nodeTypes}
                                        fitView
                                        fitViewOptions={{ padding: 0.2 }}
                                        defaultEdgeOptions={{
                                            type: 'smoothstep',
                                            markerEnd: { type: MarkerType.ArrowClosed },
                                        }}
                                        className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800"
                                    >
                                        <Controls className="!bg-white/80 dark:!bg-slate-800/80" />
                                        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                                    </ReactFlow>
                                )}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalNodeCount > PAGE_SIZE && (
                            <div className="flex items-center justify-center gap-2 mt-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={currentPage === 0}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                >
                                    {t('Précédent')}
                                </Button>
                                <span className="text-sm text-slate-500">
                                    Page {currentPage + 1} / {Math.ceil(totalNodeCount / PAGE_SIZE)}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={(currentPage + 1) * PAGE_SIZE >= totalNodeCount}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                >
                                    {t('Suivant')}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Right Panel: Details & Links */}
            <div className="col-span-3 space-y-4">
                {/* Selected Node Details */}
                {selectedNodes.length > 0 && (
                    <Card className="bg-white/50 dark:bg-slate-900/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Circle className="h-4 w-4" style={{ color: NODE_COLORS[selectedNodes[0].node_type] }} />
                                {t('Nœud sélectionné')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {selectedNodes.map(node => (
                                <div key={node.id} className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                    <p className="font-medium">{node.name}</p>
                                    <Badge
                                        className="mt-1 text-white"
                                        style={{ backgroundColor: NODE_COLORS[node.node_type] }}
                                    >
                                        {node.node_type}
                                    </Badge>
                                    {node.properties && Object.keys(node.properties).length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {Object.entries(node.properties)
                                                .filter(([, v]) => v)
                                                .slice(0, 3)
                                                .map(([key, value]) => (
                                                    <div key={key} className="text-xs text-slate-500">
                                                        <span className="font-medium">{key}:</span> {String(value).slice(0, 30)}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* User Links Panel with Analyze button */}
                <LinkAnalysisPanel refreshTrigger={linkRefreshTrigger} />

                {/* Legend */}
                <Card className="bg-white/50 dark:bg-slate-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t('Légende')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-1">
                            {Object.entries(nodesByType).map(([type, count]) => (
                                <div key={type} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{ backgroundColor: NODE_COLORS[type] }}
                                        />
                                        <span className="capitalize truncate">{type}</span>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] px-1">{count}</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Link Creation Modal */}
            <LinkCreationModal
                isOpen={isLinkModalOpen}
                onClose={() => {
                    setIsLinkModalOpen(false);
                    setPendingConnection({ source: null, target: null });
                }}
                sourceNode={pendingConnection.source}
                targetNode={pendingConnection.target}
                onLinkCreated={handleLinkCreated}
            />
        </div>
    );
};

export default KnowledgeGraphView;
