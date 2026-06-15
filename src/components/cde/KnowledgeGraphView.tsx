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
    Circle, Search, RefreshCw, X, Database, Box, Brain, Globe
} from 'lucide-react';
import { Suspense, lazy } from 'react';

// Lazy load 3D component for performance
const KnowledgeGraph3D = lazy(() => import('./KnowledgeGraph3D'));

import LinkCreationModal from './LinkCreationModal';
import LinkAnalysisPanel from './LinkAnalysisPanel';
import KnowledgeGraphNCBISearchModal from './KnowledgeGraphNCBISearchModal';
import { KGCategorySidebar } from './KGCategorySidebar';

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

const GroupNode = ({ data, style }: any) => (
    <div
        style={style}
        className="text-slate-400 font-bold uppercase tracking-wider text-sm pt-4 text-center w-full h-full pointer-events-none"
    >
        {data.label}
    </div>
);



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
    const [visibleCategoryIds, setVisibleCategoryIds] = useState<string[]>([]);
    const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);

    // Modal state for edge creation
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [pendingConnection, setPendingConnection] = useState<{ source: Node | null; target: Node | null }>({
        source: null,
        target: null,
    });
    const [isNCBIModalOpen, setIsNCBIModalOpen] = useState(false);

    // 3D view state
    const [view3D, setView3D] = useState(false);
    const [linkRefreshTrigger, setLinkRefreshTrigger] = useState(0);

    // Pagination
    const [currentPage, setCurrentPage] = useState(0);
    const PAGE_SIZE = 500; // Increased page size for multi-category view

    // Memoize nodeTypes to prevent ReactFlow warning
    const nodeTypes = useMemo(() => ({ kgNode: KGNode, group: GroupNode }), []);

    // Load graph data with filters
    const loadGraphData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Build query
            let query = supabase.from('cde_nodes').select('*', { count: 'exact' });

            if (visibleCategoryIds.length > 0) {
                // Fetch nodes belonging to ANY visible category
                query = query.in('category_id', visibleCategoryIds);
            } else if (searchQuery) {
                // If search query but no category selected, search globally
                query = query.ilike('name', `%${searchQuery}%`);
            } else {
                // Default: Load random/top nodes if nothing selected
                // Just fetch first page of nodes
            }

            if (selectedNodeType) {
                query = query.eq('node_type', selectedNodeType);
            }
            // Search within categories
            if (searchQuery) {
                query = query.ilike('name', `%${searchQuery}%`);
            }

            // Increase limit if multiple categories
            const limit = Math.max(PAGE_SIZE, visibleCategoryIds.length * 100);
            query = query.range(currentPage * limit, (currentPage + 1) * limit - 1);

            const { data: nodesData, error: nodesError, count } = await query;

            if (nodesError) throw nodesError;

            // Sort nodes alphabetically for consistent grid layout
            const sortedNodes = (nodesData || []).sort((a, b) => a.name.localeCompare(b.name));
            setNodes(sortedNodes as Node[]);
            setTotalNodeCount(count || 0);

            // Load edges for visible nodes (intra-category and inter-category)
            if (nodesData && nodesData.length > 0) {
                const nodeIds = nodesData.map(n => n.id);

                // Fetch edges in chunks to avoid URL length limits
                const CHUNK_SIZE = 30;
                const chunks = [];
                for (let i = 0; i < nodeIds.length; i += CHUNK_SIZE) {
                    chunks.push(nodeIds.slice(i, i + CHUNK_SIZE));
                }

                const edgePromises = chunks.map(chunkIds =>
                    () => supabase
                        .from('cde_edges')
                        .select('*')
                        .or(`source_node_id.in.(${chunkIds.join(',')}),target_node_id.in.(${chunkIds.join(',')})`)
                );

                // Execute requests with limited concurrency (5 at a time)
                const CONCURRENCY_LIMIT = 5;
                const results = [];

                for (let i = 0; i < edgePromises.length; i += CONCURRENCY_LIMIT) {
                    const batch = edgePromises.slice(i, i + CONCURRENCY_LIMIT).map(p => p());
                    const batchResults = await Promise.all(batch);
                    results.push(...batchResults);
                }

                // Combine and deduplicate edges
                const allEdges = results.flatMap(r => r.data || []);
                const uniqueEdgesMap = new Map();
                allEdges.forEach(edge => {
                    if (!uniqueEdgesMap.has(edge.id)) {
                        uniqueEdgesMap.set(edge.id, edge);
                    }
                });

                setEdges(Array.from(uniqueEdgesMap.values()) as Edge[]);
            } else {
                setEdges([]);
            }
        } catch (err) {
            console.error('Error loading graph:', err);
            toast.error(t('Erreur lors du chargement du graphe'));
        } finally {
            setIsLoading(false);
        }
    }, [visibleCategoryIds, selectedNodeType, searchQuery, currentPage, t]);

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

        // Group nodes by category
        const nodesByCategory: Record<string, Node[]> = {};
        // Also keep track of nodes without category
        const uncategorizedNodes: Node[] = [];

        nodes.forEach(node => {
            if (node.category_id && visibleCategoryIds.includes(node.category_id)) {
                if (!nodesByCategory[node.category_id]) {
                    nodesByCategory[node.category_id] = [];
                }
                nodesByCategory[node.category_id].push(node);
            } else {
                uncategorizedNodes.push(node);
            }
        });

        // Layout constants
        const COLUMN_WIDTH = 1050; // Width of each category column (5 * 200 + padding)
        const COLUMN_GAP = 100;   // Gap between columns
        const NODE_WIDTH = 180;   // Sort of max width of a node
        const NODE_HEIGHT = 60;   // Approx height
        const GRID_COLS = 5;      // Nodes per row within a column
        const GROUP_PADDING = 40; // Padding inside group

        const newRfNodes: RFNode[] = [];

        // Helper to create category group node
        const createGroupNode = (categoryId: string, index: number, height: number) => {
            // Find category name (we don't have it in nodes effectively, but we can try to find from node prop or just ID)
            // Ideally we would have category map. For now let's use the ID or a placeholder. 
            // Better: fetches categories in separate effect and stores in map. 
            // For this iteration, we use a simple label.
            return {
                id: `group-${categoryId}`,
                type: 'group',
                position: { x: index * (COLUMN_WIDTH + COLUMN_GAP), y: 0 },
                style: {
                    width: COLUMN_WIDTH,
                    height: height,
                    backgroundColor: 'rgba(240, 240, 240, 0.2)',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                },
                data: { label: 'Catégorie' }, // We'll update label later if possible
            };
        };

        let columnIndex = 0;

        // Process each visible category
        visibleCategoryIds.forEach(categoryId => {
            const categoryNodes = nodesByCategory[categoryId] || [];
            if (categoryNodes.length === 0) return;

            // Sort nodes by name
            categoryNodes.sort((a, b) => a.name.localeCompare(b.name));

            // Calculate height needed
            const rows = Math.ceil(categoryNodes.length / GRID_COLS);
            const groupHeight = rows * (NODE_HEIGHT + 20) + GROUP_PADDING * 2;

            // Create group node
            newRfNodes.push({
                id: `group-${categoryId}`,
                type: 'group',

                position: { x: columnIndex * (COLUMN_WIDTH + COLUMN_GAP), y: -50 },
                style: {
                    width: COLUMN_WIDTH,
                    height: 40,
                    backgroundColor: 'transparent',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    textAlign: 'center',
                    pointerEvents: 'none',
                },
                data: { label: `Category ${categoryId.slice(0, 8)}...` }, // Placeholder name
                draggable: false,
                selectable: false,
            });

            // Position nodes in grid
            categoryNodes.forEach((node, idx) => {
                const col = idx % GRID_COLS;
                const row = Math.floor(idx / GRID_COLS);

                const x = columnIndex * (COLUMN_WIDTH + COLUMN_GAP) + col * (NODE_WIDTH + 20) + 20;
                const y = row * (NODE_HEIGHT + 20);

                newRfNodes.push({
                    id: node.id,
                    type: 'kgNode',
                    position: { x, y },
                    data: {
                        label: node.name,
                        nodeType: node.node_type,
                        originalNode: node,
                    },
                });
            });

            columnIndex++;
        });

        // Handle uncategorized nodes (if any selected via search but not in visible categories, shouldn't happen with current logic but for safety)
        if (uncategorizedNodes.length > 0) {
            const startX = columnIndex * (COLUMN_WIDTH + COLUMN_GAP);
            uncategorizedNodes.forEach((node, idx) => {
                const col = idx % GRID_COLS;
                const row = Math.floor(idx / GRID_COLS);
                newRfNodes.push({
                    id: node.id,
                    type: 'kgNode',
                    position: {
                        x: startX + col * (NODE_WIDTH + 20) + 20,
                        y: row * (NODE_HEIGHT + 20)
                    },
                    data: {
                        label: node.name,
                        nodeType: node.node_type,
                        originalNode: node,
                    },
                });
            });
        }

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
    }, [nodes, edges, visibleCategoryIds, setRfNodes, setRfEdges]);

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
    const onNodeClick = useCallback((event: React.MouseEvent, node: RFNode) => {
        const originalNode = node.data.originalNode as Node;

        if (event.ctrlKey || event.metaKey) {
            setSelectedNodes(prev => {
                const isAlreadySelected = prev.some(n => n.id === originalNode.id);
                let newSelection;

                if (isAlreadySelected) {
                    newSelection = prev.filter(n => n.id !== originalNode.id);
                } else {
                    newSelection = [...prev, originalNode];
                }

                // If we have exactly 2 nodes, open the modal automatically
                if (newSelection.length === 2) {
                    // We must do this outside the render cycle ideally, but here it works as it's an event handler
                    // However, we are setting state inside a state setter which is not ideal for the side effect
                    // So we'll set the timeout to ensure state is processed or just trigger it 
                    // Actually, better to just set the values using the derived newSelection
                    setPendingConnection({ source: newSelection[0], target: newSelection[1] });
                    setIsLinkModalOpen(true);
                }

                return newSelection;
            });
        } else {
            setSelectedNodes([originalNode]);
        }
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
        if (categoryId) {
            setVisibleCategoryIds([categoryId]);
        } else {
            setVisibleCategoryIds([]);
        }
        setCurrentPage(0);
    };

    const handleCategoryAdd = (categoryId: string) => {
        if (categoryId && !visibleCategoryIds.includes(categoryId)) {
            setVisibleCategoryIds(prev => [...prev, categoryId]);
        }
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
            {/* Left Panel: Categories */}
            <div className="col-span-2 hidden md:block">
                <KGCategorySidebar
                    visibleCategoryIds={visibleCategoryIds}
                    onToggleCategory={(categoryId) => {
                        handleCategoryAdd(categoryId); // Reuse add logic which actually toggles if modified or add simple toggle
                        // Let's refine handleCategoryAdd to be a toggle
                        setVisibleCategoryIds(prev =>
                            prev.includes(categoryId)
                                ? prev.filter(id => id !== categoryId)
                                : [...prev, categoryId]
                        );
                    }}
                    onNodeSelect={(node) => {
                        // When selecting a node from sidebar:
                        // 1. Ensure its category is visible
                        // 2. Center/Select it in graph? 
                        // For now just select.
                        // We need the full node object, but sidebar only has partial.
                        // Ideally loadGraphData should include it if we add category.

                        // Just set search query to find it?
                        setSearchQuery(node.name);
                        // And maybe auto-add category? We don't verify parent cat here easily without data.
                        // Let's rely on search for now.
                    }}
                />
            </div>

            {/* Center: Graph Canvas */}
            <div className="col-span-12 md:col-span-7">
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
                                        placeholder={t('Rechercher un nœud...')}
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

                                {/* NCBI Search Button */}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    onClick={() => setIsNCBIModalOpen(true)}
                                    title={t('Rechercher sur NCBI (Web)')}
                                >
                                    <Globe className="h-4 w-4" />
                                    <span className="ml-1 text-xs hidden sm:inline">NCBI</span>
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
                                        <p>{t('Aucun nœud affiché')}</p>
                                        <p className="text-xs mt-1">{t('Sélectionnez une rubrique ou effectuez une recherche')}</p>
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
            <div className="col-span-12 md:col-span-3 space-y-4">
                {/* ... (Right panel content preserved) */}
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

            {/* NCBI Search Modal */}
            <KnowledgeGraphNCBISearchModal
                isOpen={isNCBIModalOpen}
                onClose={() => setIsNCBIModalOpen(false)}
                onNodeAdded={() => {
                    loadGraphData(); // Refresh graph to show new node
                    toast.success("Graphe mis à jour");
                }}
            />
        </div>
    );
};

export default KnowledgeGraphView;
