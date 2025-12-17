import { useState, useEffect, useMemo } from 'react';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
    ChevronRight, ChevronDown, ListFilter, Search, Layers,
    FolderTree, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Category {
    id: string;
    name: string;
    name_fr?: string;
    icon: string;
    color: string;
    node_type: string;
    node_count?: number;
    parent_id?: string | null;
    depth?: number;
    sort_order?: number;
}

interface Node {
    id: string;
    name: string;
    node_type: string;
}

interface CategoryWithChildren extends Category {
    children: CategoryWithChildren[];
}

interface KGCategorySidebarProps {
    visibleCategoryIds: string[];
    onToggleCategory: (categoryId: string) => void;
    onNodeSelect: (node: any) => void;
    className?: string;
}

export const KGCategorySidebar = ({
    visibleCategoryIds,
    onToggleCategory,
    onNodeSelect,
    className
}: KGCategorySidebarProps) => {
    const { t, language } = useAutoTranslation();
    const [categories, setCategories] = useState<Category[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
    const [categoryNodes, setCategoryNodes] = useState<Record<string, Node[]>>({});
    const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Fetch categories on mount
    useEffect(() => {
        const fetchCategories = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase.rpc('get_category_tree');

                if (error) throw error;

                if (!data || data.length === 0) {
                    const { data: simpleData } = await supabase
                        .from('cde_node_categories')
                        .select('*')
                        .order('sort_order', { ascending: true });
                    setCategories(simpleData || []);
                } else {
                    setCategories(data);
                }
            } catch (err) {
                console.error('Error fetching categories:', err);
                const { data: simpleData } = await supabase
                    .from('cde_node_categories')
                    .select('*')
                    .order('sort_order', { ascending: true });
                setCategories(simpleData || []);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCategories();
    }, []);

    // Build hierarchical tree structure
    const categoryTree = useMemo(() => {
        const rootCategories: CategoryWithChildren[] = [];
        const categoryMap = new Map<string, CategoryWithChildren>();

        // First pass: create all category objects with empty children
        for (const cat of categories) {
            categoryMap.set(cat.id, { ...cat, children: [] });
        }

        // Second pass: build tree structure
        for (const cat of categories) {
            const catWithChildren = categoryMap.get(cat.id)!;
            if (cat.parent_id && categoryMap.has(cat.parent_id)) {
                categoryMap.get(cat.parent_id)!.children.push(catWithChildren);
            } else if (!cat.parent_id) {
                rootCategories.push(catWithChildren);
            }
        }

        // Sort children by sort_order
        const sortChildren = (cats: CategoryWithChildren[]) => {
            cats.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            cats.forEach(c => sortChildren(c.children));
        };
        sortChildren(rootCategories);

        return rootCategories;
    }, [categories]);

    // Fetch nodes for a category
    const fetchNodes = async (categoryId: string) => {
        if (categoryNodes[categoryId] || loadingNodes.has(categoryId)) return;

        setLoadingNodes(prev => new Set([...prev, categoryId]));

        try {
            const { data } = await supabase
                .from('cde_nodes')
                .select('id, name, node_type')
                .eq('category_id', categoryId)
                .order('name')
                .limit(50);

            if (data) {
                setCategoryNodes(prev => ({ ...prev, [categoryId]: data }));
            }
        } catch (err) {
            console.error('Error fetching nodes:', err);
        } finally {
            setLoadingNodes(prev => {
                const next = new Set(prev);
                next.delete(categoryId);
                return next;
            });
        }
    };

    // Toggle category expansion (root level)
    const toggleCategory = (categoryId: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    };

    // Toggle subcategory expansion
    const toggleSubcategory = async (categoryId: string) => {
        const isExpanding = !expandedSubcategories.has(categoryId);

        setExpandedSubcategories(prev => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });

        if (isExpanding) {
            await fetchNodes(categoryId);
        }
    };

    // Filter logic
    const filterCategories = (cats: CategoryWithChildren[]): CategoryWithChildren[] => {
        if (!searchQuery) return cats;

        const query = searchQuery.toLowerCase();

        return cats.filter(cat => {
            const matchName = cat.name.toLowerCase().includes(query) ||
                cat.name_fr?.toLowerCase().includes(query);
            const hasMatchingChildren = filterCategories(cat.children).length > 0;
            return matchName || hasMatchingChildren;
        }).map(cat => ({
            ...cat,
            children: filterCategories(cat.children)
        }));
    };

    const filteredTree = useMemo(() => filterCategories(categoryTree), [categoryTree, searchQuery]);

    // Get display name based on language
    const getDisplayName = (cat: Category) => {
        return language === 'fr' && cat.name_fr ? cat.name_fr : cat.name;
    };

    // Render a subcategory item
    const renderSubcategory = (subcat: CategoryWithChildren, depth: number) => {
        const isExpanded = expandedSubcategories.has(subcat.id);
        const isVisible = visibleCategoryIds.includes(subcat.id);
        const nodes = categoryNodes[subcat.id] || [];
        const isLoadingNodes = loadingNodes.has(subcat.id);
        const hasChildren = subcat.children.length > 0;

        return (
            <div key={subcat.id} className="space-y-0.5">
                <div
                    className={cn(
                        "flex items-center gap-1.5 py-1 px-2 rounded-md text-xs",
                        "hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-colors",
                        isVisible && "bg-violet-50 dark:bg-violet-900/20"
                    )}
                    style={{ marginLeft: `${depth * 12}px` }}
                >
                    <Checkbox
                        checked={isVisible}
                        onCheckedChange={() => onToggleCategory(subcat.id)}
                        className="h-3 w-3"
                    />
                    <div
                        className="flex-1 flex items-center justify-between"
                        onClick={() => toggleSubcategory(subcat.id)}
                    >
                        <div className="flex items-center gap-1.5">
                            <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: subcat.color }}
                            />
                            <span className="truncate max-w-[140px]">
                                {getDisplayName(subcat)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            {(subcat.node_count || 0) > 0 && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
                                    {subcat.node_count}
                                </Badge>
                            )}
                            {isLoadingNodes ? (
                                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                            ) : (
                                isExpanded ?
                                    <ChevronDown className="h-3 w-3 text-slate-400" /> :
                                    <ChevronRight className="h-3 w-3 text-slate-400" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Subcategory children */}
                {isExpanded && hasChildren && (
                    <div className="border-l border-slate-200 dark:border-slate-700 ml-3">
                        {subcat.children.map(child => renderSubcategory(child, depth + 1))}
                    </div>
                )}

                {/* Nodes list */}
                {isExpanded && !hasChildren && (
                    <div
                        className="space-y-0.5 border-l border-slate-200 dark:border-slate-700"
                        style={{ marginLeft: `${(depth + 1) * 12 + 8}px` }}
                    >
                        {nodes.length > 0 ? (
                            nodes.slice(0, 20).map(node => (
                                <div
                                    key={node.id}
                                    className="text-[10px] py-0.5 px-2 rounded hover:bg-violet-50 dark:hover:bg-violet-900/20 cursor-pointer truncate text-slate-500 dark:text-slate-400 hover:text-violet-600"
                                    onClick={() => onNodeSelect(node)}
                                >
                                    {node.name}
                                </div>
                            ))
                        ) : isLoadingNodes ? (
                            <div className="text-[10px] text-slate-400 py-1 flex items-center gap-1">
                                <Loader2 className="h-2 w-2 animate-spin" />
                                {t('Chargement...')}
                            </div>
                        ) : (
                            <div className="text-[10px] text-slate-400 py-1 italic">
                                {t('Aucun nœud')}
                            </div>
                        )}
                        {nodes.length > 20 && (
                            <div className="text-[9px] text-slate-400 py-0.5 px-2">
                                +{nodes.length - 20} {t('autres')}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Render a root category with its subcategories
    const renderRootCategory = (category: CategoryWithChildren) => {
        const isExpanded = expandedCategories.has(category.id);
        const isVisible = visibleCategoryIds.includes(category.id);
        const hasSubcategories = category.children.length > 0;

        // Calculate total node count including subcategories
        const totalNodes = (category.node_count || 0) +
            category.children.reduce((sum, c) => sum + (c.node_count || 0), 0);

        return (
            <Collapsible
                key={category.id}
                open={isExpanded}
                onOpenChange={() => toggleCategory(category.id)}
            >
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2 group">
                        <Checkbox
                            checked={isVisible}
                            onCheckedChange={() => onToggleCategory(category.id)}
                            className="h-4 w-4"
                        />
                        <CollapsibleTrigger asChild>
                            <div
                                className={cn(
                                    "flex-1 flex items-center justify-between p-2 rounded-md",
                                    "hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors",
                                    isVisible && "bg-slate-50 dark:bg-slate-800/50"
                                )}
                            >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <span
                                        className="w-3 h-3 rounded-full shadow-sm"
                                        style={{ backgroundColor: category.color }}
                                    />
                                    {getDisplayName(category)}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {hasSubcategories && (
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-violet-100 text-violet-700">
                                            {category.children.length} sous-cat.
                                        </Badge>
                                    )}
                                    {totalNodes > 0 && (
                                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                                            {totalNodes}
                                        </Badge>
                                    )}
                                    {isExpanded ?
                                        <ChevronDown className="h-4 w-4 text-slate-400" /> :
                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                    }
                                </div>
                            </div>
                        </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent>
                        <div className="ml-6 border-l-2 border-slate-200 dark:border-slate-700 pl-2 space-y-0.5 py-1">
                            {hasSubcategories ? (
                                category.children.map(subcat => renderSubcategory(subcat, 0))
                            ) : (
                                <div className="text-[10px] text-slate-400 py-1 px-2 italic">
                                    {t('Pas de sous-catégories')}
                                </div>
                            )}
                        </div>
                    </CollapsibleContent>
                </div>
            </Collapsible>
        );
    };

    return (
        <Card className={cn(
            "h-full flex flex-col bg-white/70 dark:bg-slate-800/70 border-white/30",
            className
        )}>
            <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-violet-500" />
                    {t('Rubriques & Nœuds')}
                </CardTitle>
                <div className="relative mt-2">
                    <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
                    <Input
                        placeholder={t('Filtrer les catégories...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-7 h-7 text-xs"
                    />
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full">
                    <div className="p-3 space-y-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                            </div>
                        ) : filteredTree.length > 0 ? (
                            filteredTree.map(renderRootCategory)
                        ) : (
                            <div className="text-center py-8 text-sm text-slate-400">
                                {searchQuery ? t('Aucun résultat') : t('Aucune catégorie')}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};
