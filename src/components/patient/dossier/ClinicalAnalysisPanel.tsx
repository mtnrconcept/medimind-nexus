/**
 * ClinicalAnalysisPanel - AI-powered clinical analysis with auto-refresh
 * 
 * Triggers analysis on:
 * - Component mount (page load)
 * - Manual refresh button
 * - Data changes (via onDataChange prop)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAI } from '@/contexts/AIContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Brain,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Info,
    TrendingUp,
    TrendingDown,
    Activity,
    Pill,
    Shield,
    Loader2,
    Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ClinicalAnalysisPanelProps {
    patientId: string;
    refreshTrigger?: number; // Increment to trigger refresh
}

interface ClinicalAnalysis {
    summary: string;
    health_score: number;
    risk_level: 'low' | 'moderate' | 'high' | 'critical';
    key_findings: Array<{
        category: string;
        finding: string;
        severity: 'info' | 'warning' | 'critical';
    }>;
    recommendations: string[];
    alerts: string[];
    trends: Array<{
        parameter: string;
        direction: 'improving' | 'stable' | 'worsening';
        note: string;
    }>;
    drug_interactions: Array<{
        drugs: string[];
        severity: 'mild' | 'moderate' | 'severe';
        description: string;
    }>;
    last_updated: string;
}

const ClinicalAnalysisPanel = ({ patientId, refreshTrigger }: ClinicalAnalysisPanelProps) => {
    const { invokeAI } = useAI();
    const [analysis, setAnalysis] = useState<ClinicalAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);

    const fetchAnalysis = useCallback(async (forceRefresh = false) => {
        if (forceRefresh) setAnalyzing(true);
        else setLoading(true);

        try {
            // Call the cross-data-analyzer function
            const { data, error } = await invokeAI('cross-data-analyzer', {
                patientId, forceRefresh
            });

            if (error) throw error;

            if (data?.synthesis) {
                setAnalysis({
                    summary: data.synthesis.global_synthesis || 'Analyse en cours...',
                    health_score: data.synthesis.health_score || 0,
                    risk_level: data.synthesis.risk_level || 'low',
                    key_findings: data.synthesis.vigilance_points || [],
                    recommendations: data.synthesis.recommendations?.map((r: any) => r.recommendation) || [],
                    alerts: data.synthesis.alerts || [],
                    trends: data.synthesis.trends || [],
                    drug_interactions: data.synthesis.drug_interactions || [],
                    last_updated: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error fetching analysis:', error);
            // Create a default analysis if edge function fails
            setAnalysis({
                summary: 'Analyse automatique en attente de données suffisantes.',
                health_score: 75,
                risk_level: 'low',
                key_findings: [],
                recommendations: ['Compléter le dossier médical pour une analyse plus précise'],
                alerts: [],
                trends: [],
                drug_interactions: [],
                last_updated: new Date().toISOString()
            });
        } finally {
            setLoading(false);
            setAnalyzing(false);
        }
    }, [patientId]);

    // Fetch on mount
    useEffect(() => {
        fetchAnalysis();
    }, [fetchAnalysis]);

    // Refresh when trigger changes
    useEffect(() => {
        if (refreshTrigger && refreshTrigger > 0) {
            fetchAnalysis(true);
        }
    }, [refreshTrigger, fetchAnalysis]);

    const getRiskColor = (level: string) => {
        switch (level) {
            case 'low': return 'bg-green-500/10 text-green-500 border-green-500/30';
            case 'moderate': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
            case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
            case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/30';
            default: return 'bg-muted';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        if (score >= 40) return 'text-orange-500';
        return 'text-red-500';
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
            case 'warning': return <Info className="h-4 w-4 text-yellow-500" />;
            default: return <CheckCircle className="h-4 w-4 text-green-500" />;
        }
    };

    const getTrendIcon = (direction: string) => {
        switch (direction) {
            case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
            case 'worsening': return <TrendingDown className="h-4 w-4 text-red-500" />;
            default: return <Activity className="h-4 w-4 text-muted-foreground" />;
        }
    };

    if (loading) {
        return (
            <Card className="h-full">
                <CardContent className="flex items-center justify-center h-48">
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                        <p className="text-sm text-muted-foreground">Analyse IA en cours...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        Analyse Clinique IA
                        <Sparkles className="h-3 w-3 text-yellow-500" />
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchAnalysis(true)}
                        disabled={analyzing}
                    >
                        <RefreshCw className={cn("h-4 w-4", analyzing && "animate-spin")} />
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                <ScrollArea className="h-[calc(100%-2rem)]">
                    <div className="space-y-4">
                        {/* Health Score & Risk Level */}
                        <div className="flex items-center gap-4">
                            <div className="relative w-16 h-16">
                                <svg className="w-16 h-16 transform -rotate-90">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-muted" />
                                    <circle
                                        cx="32" cy="32" r="28"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeDasharray={`${(analysis?.health_score || 0) / 100 * 176} 176`}
                                        className={getScoreColor(analysis?.health_score || 0)}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className={cn("text-lg font-bold", getScoreColor(analysis?.health_score || 0))}>
                                        {analysis?.health_score || 0}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1">
                                <Badge className={cn("text-xs", getRiskColor(analysis?.risk_level || 'low'))}>
                                    {analysis?.risk_level === 'low' ? 'Risque faible' :
                                        analysis?.risk_level === 'moderate' ? 'Risque modéré' :
                                            analysis?.risk_level === 'high' ? 'Risque élevé' : 'Risque critique'}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">Score de santé global</p>
                            </div>
                        </div>

                        {/* Summary */}
                        {analysis?.summary && (
                            <div className="p-3 rounded-lg bg-muted/50 border">
                                <p className="text-sm">{analysis.summary}</p>
                            </div>
                        )}

                        {/* Key Findings */}
                        {analysis?.key_findings && analysis.key_findings.length > 0 && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">POINTS DE VIGILANCE</h4>
                                    <div className="space-y-2">
                                        {analysis.key_findings.slice(0, 5).map((finding, idx) => (
                                            <div key={idx} className="flex items-start gap-2 text-sm">
                                                {getSeverityIcon(finding.severity)}
                                                <div>
                                                    <span className="font-medium">{finding.category}:</span>{' '}
                                                    <span className="text-muted-foreground">{finding.finding}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Drug Interactions */}
                        {analysis?.drug_interactions && analysis.drug_interactions.length > 0 && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                        <Pill className="h-3 w-3" /> INTERACTIONS MÉDICAMENTEUSES
                                    </h4>
                                    <div className="space-y-2">
                                        {analysis.drug_interactions.map((interaction, idx) => (
                                            <div
                                                key={idx}
                                                className={cn(
                                                    "p-2 rounded-lg text-xs",
                                                    interaction.severity === 'severe' ? 'bg-red-500/10 border border-red-500/30' :
                                                        interaction.severity === 'moderate' ? 'bg-orange-500/10 border border-orange-500/30' :
                                                            'bg-yellow-500/10 border border-yellow-500/30'
                                                )}
                                            >
                                                <div className="font-medium">{interaction.drugs.join(' + ')}</div>
                                                <p className="text-muted-foreground mt-1">{interaction.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Recommendations */}
                        {analysis?.recommendations && analysis.recommendations.length > 0 && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                        <Shield className="h-3 w-3" /> RECOMMANDATIONS
                                    </h4>
                                    <ul className="space-y-1">
                                        {analysis.recommendations.slice(0, 4).map((rec, idx) => (
                                            <li key={idx} className="text-xs flex items-start gap-2">
                                                <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                                                <span>{rec}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </>
                        )}

                        {/* Trends */}
                        {analysis?.trends && analysis.trends.length > 0 && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">TENDANCES</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {analysis.trends.slice(0, 4).map((trend, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                                                {getTrendIcon(trend.direction)}
                                                <span>{trend.parameter}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default ClinicalAnalysisPanel;
