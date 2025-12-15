import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import {
    ChevronRight, ChevronDown, Search, Loader2,
    Pill, Stethoscope, Thermometer, Syringe, HeartPulse,
    Brain, Wind, Bone, Eye, Bug, Heart, Activity, Target,
    Droplets, AlertCircle, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Category {
    id: string;
    name: string;
    name_fr: string;
    parent_id: string | null;
    node_type: string;
    icon: string;
    color: string;
    node_count: number;
    depth: number;
}

interface CategoryTreePanelProps {
    onCategorySelect?: (categoryId: string | null, nodeType?: string) => void;
    selectedCategoryId?: string | null;
    onNodeTypeFilter?: (nodeType: string | null) => void;
}

const ICON_MAP: Record<string, any> = {
    pill: Pill,
    stethoscope: Stethoscope,
    thermometer: Thermometer,
    syringe: Syringe,
    'heart-pulse': HeartPulse,
    brain: Brain,
    wind: Wind,
    bone: Bone,
    eye: Eye,
    bug: Bug,
    heart: Heart,
    activity: Activity,
    target: Target,
    droplets: Droplets,
    'alert-circle': AlertCircle,
    shield: Shield,
};

const CategoryTreePanel = ({
    onCategorySelect,
    selectedCategoryId,
    onNodeTypeFilter,
}: CategoryTreePanelProps) => {
    const { t } = useAutoTranslation();
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .rpc('get_category_tree', { p_node_type: null });

            if (error) throw error;
            setCategories(data || []);

            // Expand all root categories by default
            const rootIds = new Set(
                (data || []).filter((c: Category) => c.parent_id === null).map((c: Category) => c.id)
            );
            setExpandedCategories(rootIds);
        } catch (err) {
            console.error('Error loading categories:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleExpanded = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const getIcon = (iconName: string) => {
        const IconComponent = ICON_MAP[iconName] || Pill;
        return IconComponent;
    };

    const filteredCategories = categories.filter(cat =>
        cat.name_fr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const nodeTypes = [...new Set(categories.map(c => c.node_type))];

    const getCategoriesByType = (nodeType: string) => {
        return filteredCategories.filter(c => c.node_type === nodeType && c.parent_id === null);
    };

    const getChildCategories = (parentId: string) => {
        return filteredCategories.filter(c => c.parent_id === parentId);
    };

    const renderCategory = (category: Category, level: number = 0) => {
        const IconComponent = getIcon(category.icon);
        const children = getChildCategories(category.id);
        const hasChildren = children.length > 0;
        const isExpanded = expandedCategories.has(category.id);
        const isSelected = selectedCategoryId === category.id;

        return (
            <div key={category.id}>
                <div
                    className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                        "hover:bg-slate-100 dark:hover:bg-slate-800",
                        isSelected && "bg-violet-100 dark:bg-violet-900/30 border-l-2 border-violet-500"
                    )}
                    style={{ paddingLeft: `${level * 16 + 8}px` }}
                    onClick={() => {
                        onCategorySelect?.(category.id, category.node_type);
                    }}
                >
                    {hasChildren && (
                        <button
                            className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(category.id);
                            }}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronRight className="h-3 w-3" />
                            )}
                        </button>
                    )}
                    {!hasChildren && <div className="w-4" />}

                    <div
                        className="w-4 h-4 rounded flex items-center justify-center"
                        style={{ backgroundColor: category.color + '20' }}
                    >
                        <IconComponent
                            className="h-3 w-3"
                            style={{ color: category.color }}
                        />
                    </div>

                    <span className="flex-1 text-sm truncate text-slate-700 dark:text-slate-300">
                        {category.name_fr}
                    </span>

                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {category.node_count}
                    </Badge>
                </div>

                {hasChildren && isExpanded && (
                    <div>
                        {children.map(child => renderCategory(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    const NODE_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
        pathology: { label: 'Pathologies', icon: Stethoscope, color: '#ef4444' },
        substance: { label: 'Substances', icon: Pill, color: '#3b82f6' },
        symptom: { label: 'Symptômes', icon: Thermometer, color: '#f59e0b' },
        medication: { label: 'Médicaments', icon: Syringe, color: '#22c55e' },
        treatment: { label: 'Traitements', icon: HeartPulse, color: '#8b5cf6' },
    };

    return (
        <div className="h-full flex flex-col bg-white/50 dark:bg-slate-900/50 rounded-lg border">
            {/* Header */}
            <div className="p-3 border-b">
                <h3 className="font-semibold text-sm mb-2">{t('Catégories')}</h3>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder={t('Rechercher...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
            </div>

            {/* Node type filters */}
            <div className="p-2 border-b flex flex-wrap gap-1">
                <Button
                    size="sm"
                    variant={selectedNodeType === null ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => {
                        setSelectedNodeType(null);
                        onNodeTypeFilter?.(null);
                    }}
                >
                    {t('Tous')}
                </Button>
                {nodeTypes.map(type => {
                    const config = NODE_TYPE_CONFIG[type];
                    if (!config) return null;
                    const Icon = config.icon;
                    return (
                        <Button
                            key={type}
                            size="sm"
                            variant={selectedNodeType === type ? "default" : "outline"}
                            className="h-7 text-xs gap-1"
                            style={selectedNodeType === type ? { backgroundColor: config.color } : {}}
                            onClick={() => {
                                setSelectedNodeType(type);
                                onNodeTypeFilter?.(type);
                            }}
                        >
                            <Icon className="h-3 w-3" />
                            {t(config.label)}
                        </Button>
                    );
                })}
            </div>

            {/* Category tree */}
            <ScrollArea className="flex-1">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                    </div>
                ) : (
                    <div className="p-2">
                        {/* Show all button */}
                        <div
                            className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors mb-2",
                                "hover:bg-slate-100 dark:hover:bg-slate-800",
                                selectedCategoryId === null && "bg-violet-100 dark:bg-violet-900/30"
                            )}
                            onClick={() => onCategorySelect?.(null)}
                        >
                            <div className="w-4" />
                            <Target className="h-4 w-4 text-violet-500" />
                            <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                {t('Tous les nœuds')}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                                {categories.reduce((sum, c) => sum + c.node_count, 0)}
                            </Badge>
                        </div>

                        {/* Categories by type */}
                        {(selectedNodeType ? [selectedNodeType] : nodeTypes).map(type => {
                            const config = NODE_TYPE_CONFIG[type];
                            if (!config) return null;
                            const typeCategories = getCategoriesByType(type);
                            if (typeCategories.length === 0) return null;

                            return (
                                <div key={type} className="mb-4">
                                    <div className="flex items-center gap-2 px-2 py-1 mb-1">
                                        <config.icon
                                            className="h-4 w-4"
                                            style={{ color: config.color }}
                                        />
                                        <span className="text-xs font-semibold text-slate-500 uppercase">
                                            {t(config.label)}
                                        </span>
                                    </div>
                                    {typeCategories.map(cat => renderCategory(cat))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};

export default CategoryTreePanel;
