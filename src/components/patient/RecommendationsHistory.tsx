/**
 * RecommendationsHistory - AI Recommendations Audit Trail
 * 
 * Displays the history of AI recommendations with:
 * - Status tracking (pending, accepted, rejected, modified)
 * - Filtering and search
 * - Review workflow actions
 * - Outcome recording
 */

import { useState, useEffect } from 'react';
import {
    History,
    CheckCircle,
    XCircle,
    Clock,
    Edit3,
    ChevronDown,
    ChevronUp,
    Filter,
    Search,
    Brain,
    User,
    Calendar,
    MessageSquare,
    TrendingUp,
    AlertTriangle,
    Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================
// TYPES
// ============================================

interface Recommendation {
    id: string;
    recommendation_type: string;
    category: string;
    title: string;
    description: string;
    urgency_score: number;
    status: 'pending' | 'accepted' | 'rejected' | 'modified' | 'implemented' | 'expired';
    ai_model_version?: string;
    ai_confidence_score?: number;
    reasoning?: string;
    reviewed_by?: string;
    reviewed_at?: string;
    reviewer_notes?: string;
    modified_recommendation?: string;
    outcome_status?: string;
    outcome_notes?: string;
    created_at: string;
    context_snapshot?: Record<string, unknown>;
}

interface RecommendationsHistoryProps {
    patientId: string;
    onReviewComplete?: () => void;
}

// ============================================
// STATUS HELPERS
// ============================================

const statusConfig: Record<string, {
    label: string;
    color: string;
    icon: React.ReactNode;
}> = {
    pending: {
        label: 'En attente',
        color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
        icon: <Clock className="h-3 w-3" />
    },
    accepted: {
        label: 'Acceptée',
        color: 'bg-green-500/10 text-green-600 border-green-500/30',
        icon: <CheckCircle className="h-3 w-3" />
    },
    rejected: {
        label: 'Rejetée',
        color: 'bg-red-500/10 text-red-600 border-red-500/30',
        icon: <XCircle className="h-3 w-3" />
    },
    modified: {
        label: 'Modifiée',
        color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
        icon: <Edit3 className="h-3 w-3" />
    },
    implemented: {
        label: 'Appliquée',
        color: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
        icon: <TrendingUp className="h-3 w-3" />
    },
    expired: {
        label: 'Expirée',
        color: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
        icon: <Clock className="h-3 w-3" />
    }
};

const categoryColors: Record<string, string> = {
    medication: 'bg-blue-500',
    exercise: 'bg-green-500',
    nutrition: 'bg-orange-500',
    monitoring: 'bg-purple-500',
    lifestyle: 'bg-teal-500',
    urgent: 'bg-red-500',
    general: 'bg-gray-500'
};

// ============================================
// MAIN COMPONENT
// ============================================

const RecommendationsHistory = ({
    patientId,
    onReviewComplete
}: RecommendationsHistoryProps) => {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Review dialog state
    const [reviewDialog, setReviewDialog] = useState<{
        open: boolean;
        recommendation: Recommendation | null;
        action: 'accept' | 'reject' | 'modify' | null;
    }>({ open: false, recommendation: null, action: null });
    const [reviewNotes, setReviewNotes] = useState('');
    const [modifiedText, setModifiedText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Fetch recommendations
    useEffect(() => {
        const fetchRecommendations = async () => {
            setLoading(true);

            try {
                const { data, error } = await supabase
                    .from('recommendations_log')
                    .select('*')
                    .eq('patient_id', patientId)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setRecommendations(data || []);
            } catch (error) {
                console.error('Error fetching recommendations:', error);
                // Use mock data if table doesn't exist yet
                setRecommendations([]);
            } finally {
                setLoading(false);
            }
        };

        if (patientId) {
            fetchRecommendations();
        }
    }, [patientId]);

    // Filter recommendations
    const filteredRecommendations = recommendations.filter(rec => {
        const matchesSearch = searchQuery === '' ||
            rec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rec.description.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'all' || rec.status === statusFilter;
        const matchesType = typeFilter === 'all' || rec.recommendation_type === typeFilter;

        return matchesSearch && matchesStatus && matchesType;
    });

    // Statistics
    const stats = {
        total: recommendations.length,
        pending: recommendations.filter(r => r.status === 'pending').length,
        accepted: recommendations.filter(r => r.status === 'accepted' || r.status === 'modified').length,
        rejected: recommendations.filter(r => r.status === 'rejected').length
    };

    // Handle review actions
    const handleReviewAction = async () => {
        if (!reviewDialog.recommendation || !reviewDialog.action) return;

        setSubmitting(true);

        try {
            const { id } = reviewDialog.recommendation;

            if (reviewDialog.action === 'accept') {
                await supabase.rpc('accept_recommendation', {
                    p_recommendation_id: id,
                    p_notes: reviewNotes || null
                });
                toast.success('Recommandation acceptée');
            } else if (reviewDialog.action === 'reject') {
                if (!reviewNotes.trim()) {
                    toast.error('Une justification est requise pour rejeter');
                    setSubmitting(false);
                    return;
                }
                await supabase.rpc('reject_recommendation', {
                    p_recommendation_id: id,
                    p_notes: reviewNotes
                });
                toast.success('Recommandation rejetée');
            } else if (reviewDialog.action === 'modify') {
                if (!modifiedText.trim()) {
                    toast.error('Le texte modifié est requis');
                    setSubmitting(false);
                    return;
                }
                await supabase.rpc('modify_recommendation', {
                    p_recommendation_id: id,
                    p_modified_text: modifiedText,
                    p_notes: reviewNotes || null
                });
                toast.success('Recommandation modifiée et acceptée');
            }

            // Update local state
            setRecommendations(prev =>
                prev.map(r => r.id === id ? {
                    ...r,
                    status: reviewDialog.action === 'reject' ? 'rejected' :
                        reviewDialog.action === 'modify' ? 'modified' : 'accepted',
                    reviewer_notes: reviewNotes,
                    reviewed_at: new Date().toISOString(),
                    ...(reviewDialog.action === 'modify' && { modified_recommendation: modifiedText })
                } : r)
            );

            setReviewDialog({ open: false, recommendation: null, action: null });
            setReviewNotes('');
            setModifiedText('');
            onReviewComplete?.();
        } catch (error) {
            console.error('Error processing review:', error);
            toast.error('Erreur lors du traitement');
        } finally {
            setSubmitting(false);
        }
    };

    const openReviewDialog = (rec: Recommendation, action: 'accept' | 'reject' | 'modify') => {
        setReviewDialog({ open: true, recommendation: rec, action });
        setReviewNotes('');
        setModifiedText(rec.description);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <Card className="border-border/50">
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card className="border-border/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <History className="h-4 w-4 text-primary" />
                            Historique des Recommandations
                        </CardTitle>
                        <div className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary">{stats.total} total</Badge>
                            {stats.pending > 0 && (
                                <Badge className="bg-yellow-500/20 text-yellow-600">
                                    {stats.pending} en attente
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-2">
                        <div className="relative flex-1 min-w-[150px]">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-7 h-8 text-xs"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                                <SelectValue placeholder="Statut" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts</SelectItem>
                                <SelectItem value="pending">En attente</SelectItem>
                                <SelectItem value="accepted">Acceptées</SelectItem>
                                <SelectItem value="rejected">Rejetées</SelectItem>
                                <SelectItem value="modified">Modifiées</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les types</SelectItem>
                                <SelectItem value="medication">Médicament</SelectItem>
                                <SelectItem value="exercise">Exercice</SelectItem>
                                <SelectItem value="nutrition">Nutrition</SelectItem>
                                <SelectItem value="monitoring">Surveillance</SelectItem>
                                <SelectItem value="lifestyle">Mode de vie</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Recommendations List */}
                    {filteredRecommendations.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Aucune recommandation trouvée</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredRecommendations.map((rec) => {
                                const status = statusConfig[rec.status] || statusConfig.pending;
                                const isExpanded = expandedId === rec.id;

                                return (
                                    <div
                                        key={rec.id}
                                        className={cn(
                                            "border rounded-lg overflow-hidden transition-all",
                                            rec.status === 'pending' && rec.urgency_score >= 8 && "border-red-500/50 bg-red-500/5"
                                        )}
                                    >
                                        {/* Header */}
                                        <div
                                            className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full mt-2 shrink-0",
                                                    categoryColors[rec.recommendation_type] || 'bg-gray-500'
                                                )} />

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-sm truncate">
                                                            {rec.title}
                                                        </span>
                                                        {rec.urgency_score >= 8 && (
                                                            <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                                        {rec.description}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Badge className={cn("text-[10px]", status.color)}>
                                                        {status.icon}
                                                        <span className="ml-1">{status.label}</span>
                                                    </Badge>
                                                    {isExpanded ? (
                                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-3 pb-3 border-t bg-muted/30">
                                                <div className="pt-3 space-y-3">
                                                    {/* Full description */}
                                                    <div>
                                                        <p className="text-xs text-muted-foreground mb-1">Description complète</p>
                                                        <p className="text-sm">{rec.description}</p>
                                                    </div>

                                                    {/* Modified recommendation if applicable */}
                                                    {rec.modified_recommendation && (
                                                        <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
                                                            <p className="text-xs font-medium text-blue-600 mb-1">Version modifiée</p>
                                                            <p className="text-sm">{rec.modified_recommendation}</p>
                                                        </div>
                                                    )}

                                                    {/* Metadata */}
                                                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {formatDate(rec.created_at)}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Brain className="h-3 w-3" />
                                                            Confiance: {Math.round((rec.ai_confidence_score || 0.8) * 100)}%
                                                        </div>
                                                        {rec.reviewed_at && (
                                                            <div className="flex items-center gap-1">
                                                                <User className="h-3 w-3" />
                                                                Revu le {formatDate(rec.reviewed_at)}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Reviewer notes */}
                                                    {rec.reviewer_notes && (
                                                        <div className="flex items-start gap-2 text-xs">
                                                            <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground" />
                                                            <p className="italic">{rec.reviewer_notes}</p>
                                                        </div>
                                                    )}

                                                    {/* Actions for pending recommendations */}
                                                    {rec.status === 'pending' && (
                                                        <div className="flex gap-2 pt-2">
                                                            <Button
                                                                size="sm"
                                                                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openReviewDialog(rec, 'accept');
                                                                }}
                                                            >
                                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                                Accepter
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-xs"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openReviewDialog(rec, 'modify');
                                                                }}
                                                            >
                                                                <Edit3 className="h-3 w-3 mr-1" />
                                                                Modifier
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                className="h-7 text-xs"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openReviewDialog(rec, 'reject');
                                                                }}
                                                            >
                                                                <XCircle className="h-3 w-3 mr-1" />
                                                                Rejeter
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Review Dialog */}
            <Dialog open={reviewDialog.open} onOpenChange={(open) =>
                !submitting && setReviewDialog({ open, recommendation: null, action: null })
            }>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {reviewDialog.action === 'accept' && 'Accepter la recommandation'}
                            {reviewDialog.action === 'reject' && 'Rejeter la recommandation'}
                            {reviewDialog.action === 'modify' && 'Modifier la recommandation'}
                        </DialogTitle>
                        <DialogDescription>
                            {reviewDialog.recommendation?.title}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {reviewDialog.action === 'modify' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Recommandation modifiée</label>
                                <Textarea
                                    value={modifiedText}
                                    onChange={(e) => setModifiedText(e.target.value)}
                                    placeholder="Entrez la version modifiée..."
                                    rows={3}
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Notes {reviewDialog.action === 'reject' && '(obligatoire)'}
                            </label>
                            <Textarea
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder={
                                    reviewDialog.action === 'reject'
                                        ? "Expliquez pourquoi cette recommandation est rejetée..."
                                        : "Notes optionnelles..."
                                }
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setReviewDialog({ open: false, recommendation: null, action: null })}
                            disabled={submitting}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleReviewAction}
                            disabled={submitting}
                            className={cn(
                                reviewDialog.action === 'accept' && "bg-green-600 hover:bg-green-700",
                                reviewDialog.action === 'reject' && "bg-red-600 hover:bg-red-700"
                            )}
                        >
                            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Confirmer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default RecommendationsHistory;
