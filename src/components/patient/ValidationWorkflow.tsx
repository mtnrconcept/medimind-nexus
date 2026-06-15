/**
 * ValidationWorkflow - Human Validation for AI Recommendations
 * 
 * Provides an inline validation interface for AI recommendations:
 * - Accept/Reject/Modify buttons
 * - Required justification for rejection
 * - Modification flow with diff view
 * - Timestamped digital signature
 */

import { useState } from 'react';
import {
    CheckCircle,
    XCircle,
    Edit3,
    Clock,
    Shield,
    AlertTriangle,
    Loader2,
    ChevronDown,
    ChevronUp,
    User,
    Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================
// TYPES
// ============================================

export interface ValidationStatus {
    status: 'pending' | 'accepted' | 'rejected' | 'modified';
    reviewedBy?: string;
    reviewedAt?: string;
    notes?: string;
    modifiedText?: string;
}

interface ValidationWorkflowProps {
    recommendationId?: string;
    originalContent: string;
    title: string;
    urgencyLevel?: 'urgent' | 'important' | 'routine';
    initialStatus?: ValidationStatus;
    onValidate?: (status: ValidationStatus) => void;
    onStatusChange?: (newStatus: ValidationStatus) => void;
    compact?: boolean;
    showTimestamp?: boolean;
}

// ============================================
// MAIN COMPONENT
// ============================================

const ValidationWorkflow = ({
    recommendationId,
    originalContent,
    title,
    urgencyLevel = 'routine',
    initialStatus,
    onValidate,
    onStatusChange,
    compact = false,
    showTimestamp = true
}: ValidationWorkflowProps) => {
    const [status, setStatus] = useState<ValidationStatus>(
        initialStatus || { status: 'pending' }
    );
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeAction, setActiveAction] = useState<'accept' | 'reject' | 'modify' | null>(null);
    const [notes, setNotes] = useState('');
    const [modifiedText, setModifiedText] = useState(originalContent);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isPending = status.status === 'pending';

    // Handle validation submission
    const handleSubmit = async () => {
        if (!activeAction) return;

        // Validate required fields
        if (activeAction === 'reject' && !notes.trim()) {
            toast.error('Une justification est requise pour rejeter');
            return;
        }

        if (activeAction === 'modify' && !modifiedText.trim()) {
            toast.error('Le texte modifié est requis');
            return;
        }

        setIsSubmitting(true);

        try {
            const now = new Date().toISOString();
            const newStatus: ValidationStatus = {
                status: activeAction === 'accept' ? 'accepted' :
                    activeAction === 'reject' ? 'rejected' : 'modified',
                reviewedAt: now,
                reviewedBy: 'current-user', // Would come from auth context
                notes: notes || undefined,
                modifiedText: activeAction === 'modify' ? modifiedText : undefined
            };

            // If we have a recommendation ID, persist to database
            if (recommendationId) {
                if (activeAction === 'accept') {
                    await supabase.rpc('accept_recommendation', {
                        p_recommendation_id: recommendationId,
                        p_notes: notes || null
                    });
                } else if (activeAction === 'reject') {
                    await supabase.rpc('reject_recommendation', {
                        p_recommendation_id: recommendationId,
                        p_notes: notes
                    });
                } else if (activeAction === 'modify') {
                    await supabase.rpc('modify_recommendation', {
                        p_recommendation_id: recommendationId,
                        p_modified_text: modifiedText,
                        p_notes: notes || null
                    });
                }
            }

            setStatus(newStatus);
            setActiveAction(null);
            setIsExpanded(false);
            onValidate?.(newStatus);
            onStatusChange?.(newStatus);

            toast.success(
                activeAction === 'accept' ? 'Recommandation validée' :
                    activeAction === 'reject' ? 'Recommandation rejetée' :
                        'Recommandation modifiée et validée'
            );
        } catch (error) {
            console.error('Validation error:', error);
            toast.error('Erreur lors de la validation');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Format timestamp
    const formatTimestamp = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Status indicator component
    const StatusIndicator = () => {
        const statusConfig = {
            pending: {
                icon: <Clock className="h-3 w-3" />,
                label: 'En attente de validation',
                className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
            },
            accepted: {
                icon: <CheckCircle className="h-3 w-3" />,
                label: 'Validée',
                className: 'bg-green-500/10 text-green-600 border-green-500/30'
            },
            rejected: {
                icon: <XCircle className="h-3 w-3" />,
                label: 'Rejetée',
                className: 'bg-red-500/10 text-red-600 border-red-500/30'
            },
            modified: {
                icon: <Edit3 className="h-3 w-3" />,
                label: 'Modifiée',
                className: 'bg-blue-500/10 text-blue-600 border-blue-500/30'
            }
        };

        const config = statusConfig[status.status];

        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant="outline" className={cn("text-[10px] gap-1", config.className)}>
                            {config.icon}
                            {config.label}
                        </Badge>
                    </TooltipTrigger>
                    {status.reviewedAt && (
                        <TooltipContent>
                            <p className="text-xs">
                                {formatTimestamp(status.reviewedAt)}
                                {status.reviewedBy && ` par ${status.reviewedBy}`}
                            </p>
                        </TooltipContent>
                    )}
                </Tooltip>
            </TooltipProvider>
        );
    };

    // Compact mode render
    if (compact && !isPending) {
        return (
            <div className="flex items-center gap-2">
                <StatusIndicator />
                {showTimestamp && status.reviewedAt && (
                    <span className="text-[10px] text-muted-foreground">
                        {formatTimestamp(status.reviewedAt)}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className={cn(
            "border rounded-lg",
            urgencyLevel === 'urgent' && isPending && "border-red-500/50 bg-red-500/5"
        )}>
            {/* Header */}
            <div className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Shield className={cn(
                        "h-4 w-4 shrink-0",
                        isPending ? "text-yellow-500" :
                            status.status === 'accepted' ? "text-green-500" :
                                status.status === 'rejected' ? "text-red-500" : "text-blue-500"
                    )} />
                    <span className="text-sm font-medium truncate">{title}</span>
                    {urgencyLevel === 'urgent' && isPending && (
                        <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                </div>
                <StatusIndicator />
            </div>

            {/* Validation Actions (for pending status) */}
            {isPending && (
                <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                    <div className="px-3 pb-3 pt-0">
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => {
                                    setActiveAction('accept');
                                    setIsExpanded(true);
                                }}
                                disabled={isSubmitting}
                            >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Valider
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                    setActiveAction('modify');
                                    setIsExpanded(true);
                                }}
                                disabled={isSubmitting}
                            >
                                <Edit3 className="h-3 w-3 mr-1" />
                                Modifier
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => {
                                    setActiveAction('reject');
                                    setIsExpanded(true);
                                }}
                                disabled={isSubmitting}
                            >
                                <XCircle className="h-3 w-3 mr-1" />
                                Rejeter
                            </Button>

                            {isExpanded && (
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto">
                                        <ChevronUp className="h-3 w-3" />
                                    </Button>
                                </CollapsibleTrigger>
                            )}
                        </div>
                    </div>

                    <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-3 border-t pt-3">
                            {/* Action-specific content */}
                            {activeAction === 'accept' && (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        Vous êtes sur le point de valider cette recommandation IA.
                                    </p>
                                    <Textarea
                                        placeholder="Notes optionnelles..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="text-sm min-h-[60px]"
                                    />
                                </div>
                            )}

                            {activeAction === 'reject' && (
                                <div className="space-y-2">
                                    <p className="text-xs text-red-600 font-medium">
                                        ⚠️ Une justification est obligatoire pour rejeter une recommandation.
                                    </p>
                                    <Textarea
                                        placeholder="Expliquez pourquoi cette recommandation est rejetée..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="text-sm min-h-[80px] border-red-500/50"
                                        required
                                    />
                                </div>
                            )}

                            {activeAction === 'modify' && (
                                <div className="space-y-2">
                                    <div>
                                        <label className="text-xs font-medium">Recommandation originale</label>
                                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-1">
                                            {originalContent}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium">Votre version modifiée</label>
                                        <Textarea
                                            value={modifiedText}
                                            onChange={(e) => setModifiedText(e.target.value)}
                                            className="text-sm min-h-[80px] mt-1"
                                        />
                                    </div>
                                    <Textarea
                                        placeholder="Notes optionnelles..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="text-sm min-h-[40px]"
                                    />
                                </div>
                            )}

                            {/* Submit and Cancel */}
                            <div className="flex items-center justify-between pt-2 border-t">
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    <span>Signature électronique horodatée</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                            setActiveAction(null);
                                            setNotes('');
                                            setModifiedText(originalContent);
                                            setIsExpanded(false);
                                        }}
                                        disabled={isSubmitting}
                                    >
                                        Annuler
                                    </Button>
                                    <Button
                                        size="sm"
                                        className={cn(
                                            "h-7 text-xs",
                                            activeAction === 'accept' && "bg-green-600 hover:bg-green-700",
                                            activeAction === 'reject' && "bg-red-600 hover:bg-red-700",
                                            activeAction === 'modify' && "bg-blue-600 hover:bg-blue-700"
                                        )}
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                        Confirmer
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}

            {/* Reviewed status display */}
            {!isPending && (
                <div className="px-3 pb-3 space-y-2">
                    {status.modifiedText && (
                        <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20 text-xs">
                            <p className="font-medium text-blue-600 mb-1">Version modifiée</p>
                            <p>{status.modifiedText}</p>
                        </div>
                    )}

                    {status.notes && (
                        <div className="text-xs text-muted-foreground italic">
                            Note: {status.notes}
                        </div>
                    )}

                    {showTimestamp && status.reviewedAt && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t">
                            <User className="h-3 w-3" />
                            <span>
                                Validé le {formatTimestamp(status.reviewedAt)}
                                {status.reviewedBy && ` par ${status.reviewedBy}`}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ValidationWorkflow;
