import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    History, Search, Filter, Loader2, Clock, Target, Brain,
    CheckCircle2, XCircle, AlertTriangle, ChevronRight, Lightbulb,
    Stethoscope, Pill, FlaskConical, Calendar, Trash2, Eye
} from 'lucide-react';

interface ResearchSession {
    id: string;
    target_type: 'pathology' | 'medication' | 'substance';
    target_name: string;
    status: 'running' | 'completed' | 'error';
    discoveries: any[];
    simple_explanation?: string;
    custom_prompt?: string;
    kg_nodes_analyzed: number;
    kg_edges_analyzed: number;
    pubmed_articles_found: number;
    hypotheses_generated: number;
    error_message?: string;
    created_at: string;
    completed_at?: string;
}

const ResearchHistoryPanel = () => {
    const { t } = useAutoTranslation();
    const [sessions, setSessions] = useState<ResearchSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [selectedSession, setSelectedSession] = useState<ResearchSession | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        setIsLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error(t('Vous devez être connecté'));
                return;
            }

            const { data, error } = await supabase
                .from('focused_research_sessions')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setSessions((data as ResearchSession[]) || []);
        } catch (err: any) {
            console.error('Error loading sessions:', err);
            toast.error(t('Erreur lors du chargement'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm(t('Supprimer cette recherche ?'))) return;

        try {
            const { error } = await supabase
                .from('focused_research_sessions')
                .delete()
                .eq('id', sessionId);

            if (error) throw error;

            setSessions(prev => prev.filter(s => s.id !== sessionId));
            toast.success(t('Recherche supprimée'));
        } catch (err: any) {
            toast.error(t('Erreur lors de la suppression'));
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'error':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'running':
                return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
            default:
                return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'pathology':
                return <Stethoscope className="h-4 w-4 text-blue-500" />;
            case 'medication':
                return <Pill className="h-4 w-4 text-green-500" />;
            case 'substance':
                return <FlaskConical className="h-4 w-4 text-purple-500" />;
            default:
                return <Target className="h-4 w-4 text-slate-500" />;
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getDuration = (startStr: string, endStr?: string) => {
        const start = new Date(startStr);
        const end = endStr ? new Date(endStr) : new Date();
        const diffMs = end.getTime() - start.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffSec = Math.floor((diffMs % 60000) / 1000);
        return diffMin > 0 ? `${diffMin}m ${diffSec}s` : `${diffSec}s`;
    };

    // Filter sessions
    const filteredSessions = sessions.filter(session => {
        const matchesSearch = session.target_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (session.custom_prompt?.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
        const matchesType = typeFilter === 'all' || session.target_type === typeFilter;
        return matchesSearch && matchesStatus && matchesType;
    });

    return (
        <div className="space-y-4">
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5 text-violet-600" />
                        {t('Historique des Recherches')}
                        <Badge variant="outline" className="ml-2">
                            {sessions.length} {t('sessions')}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search and Filters */}
                    <div className="flex flex-wrap gap-2">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={t('Rechercher par nom ou prompt...')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[140px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder={t('Statut')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('Tous statuts')}</SelectItem>
                                <SelectItem value="completed">{t('Terminé')}</SelectItem>
                                <SelectItem value="running">{t('En cours')}</SelectItem>
                                <SelectItem value="error">{t('Erreur')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-[160px]">
                                <Target className="h-4 w-4 mr-2" />
                                <SelectValue placeholder={t('Type')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('Tous types')}</SelectItem>
                                <SelectItem value="pathology">{t('Pathologie')}</SelectItem>
                                <SelectItem value="medication">{t('Médicament')}</SelectItem>
                                <SelectItem value="substance">{t('Substance')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={loadSessions}>
                            <Loader2 className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>

                    {/* Sessions List */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p>{searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                                ? t('Aucune recherche ne correspond aux filtres')
                                : t('Aucune recherche effectuée')}</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[500px]">
                            <div className="space-y-2">
                                {filteredSessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                        onClick={() => {
                                            setSelectedSession(session);
                                            setIsDetailOpen(true);
                                        }}
                                    >
                                        {/* Type Icon */}
                                        <div className="flex-shrink-0">
                                            {getTypeIcon(session.target_type)}
                                        </div>

                                        {/* Main Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                                    {session.target_name}
                                                </span>
                                                {getStatusIcon(session.status)}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <Calendar className="h-3 w-3" />
                                                {formatDate(session.created_at)}
                                                {session.completed_at && (
                                                    <>
                                                        <span>•</span>
                                                        <Clock className="h-3 w-3" />
                                                        {getDuration(session.created_at, session.completed_at)}
                                                    </>
                                                )}
                                            </div>
                                            {session.custom_prompt && (
                                                <p className="text-xs text-slate-400 mt-1 truncate italic">
                                                    "{session.custom_prompt}"
                                                </p>
                                            )}
                                        </div>

                                        {/* Stats */}
                                        <div className="flex items-center gap-3 text-xs text-slate-500">
                                            {session.hypotheses_generated > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <Lightbulb className="h-3 w-3 text-amber-500" />
                                                    <span>{session.hypotheses_generated}</span>
                                                </div>
                                            )}
                                            {session.kg_nodes_analyzed > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <Brain className="h-3 w-3 text-violet-500" />
                                                    <span>{session.kg_nodes_analyzed}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSession(session.id);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" />
                                            </Button>
                                            <ChevronRight className="h-4 w-4 text-slate-400" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {selectedSession && getTypeIcon(selectedSession.target_type)}
                            {selectedSession?.target_name}
                            {selectedSession && (
                                <Badge variant={selectedSession.status === 'completed' ? 'default' : 'destructive'}>
                                    {selectedSession.status}
                                </Badge>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedSession && (
                        <div className="space-y-4">
                            {/* Metadata */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    <span>{formatDate(selectedSession.created_at)}</span>
                                </div>
                                <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                    <Brain className="h-4 w-4 text-violet-500" />
                                    <span>{selectedSession.kg_nodes_analyzed} {t('nœuds')}</span>
                                </div>
                                <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                    <Target className="h-4 w-4 text-blue-500" />
                                    <span>{selectedSession.kg_edges_analyzed} {t('liens')}</span>
                                </div>
                                <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                    <Lightbulb className="h-4 w-4 text-amber-500" />
                                    <span>{selectedSession.hypotheses_generated} {t('découvertes')}</span>
                                </div>
                            </div>

                            {/* Custom Prompt */}
                            {selectedSession.custom_prompt && (
                                <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                                    <p className="text-sm font-medium text-violet-700 dark:text-violet-300 mb-1">
                                        {t('Prompt personnalisé')}:
                                    </p>
                                    <p className="text-sm text-violet-600 dark:text-violet-400 italic">
                                        "{selectedSession.custom_prompt}"
                                    </p>
                                </div>
                            )}

                            {/* Simple Explanation */}
                            {selectedSession.simple_explanation && (
                                <div className="p-4 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
                                        <Lightbulb className="h-4 w-4" />
                                        {t('Explication simplifiée')}
                                    </p>
                                    <p className="text-slate-700 dark:text-slate-300">
                                        {selectedSession.simple_explanation}
                                    </p>
                                </div>
                            )}

                            {/* Discoveries */}
                            {selectedSession.discoveries && selectedSession.discoveries.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                        <Lightbulb className="h-4 w-4 text-amber-500" />
                                        {t('Découvertes')} ({selectedSession.discoveries.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {selectedSession.discoveries.map((discovery: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                                            >
                                                <p className="font-medium text-sm text-slate-800 dark:text-slate-200">
                                                    {discovery.title}
                                                </p>
                                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                                    {discovery.hypothesis}
                                                </p>
                                                <div className="flex gap-2 mt-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        {t('Plausibilité')}: {Math.round((discovery.plausibility_score || 0) * 100)}%
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">
                                                        {t('Sévérité')}: {Math.round((discovery.severity_score || 0) * 100)}%
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error Message */}
                            {selectedSession.error_message && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        <AlertTriangle className="h-4 w-4 inline mr-2" />
                                        {selectedSession.error_message}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ResearchHistoryPanel;
