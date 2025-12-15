/**
 * ExplainabilityPanel - AI Response Explainability
 * 
 * Displays detailed explanation of AI reasoning:
 * - Sources cited with links
 * - Confidence level visualization
 * - Reasoning chain (simplified graph)
 * - Toggle between expert and simplified modes
 */

import { useState } from 'react';
import {
    BookOpen,
    Brain,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Lightbulb,
    Shield,
    AlertTriangle,
    CheckCircle,
    HelpCircle,
    Zap,
    Layers
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

export interface Source {
    id: string;
    type: 'pubmed' | 'clinical_guideline' | 'drug_database' | 'icd' | 'internal' | 'textbook';
    title: string;
    url?: string;
    authors?: string;
    year?: number;
    relevance: number; // 0-1
    excerpt?: string;
}

export interface ReasoningStep {
    id: string;
    step: number;
    title: string;
    description: string;
    confidence: number;
    sources?: string[]; // Source IDs
}

export interface ExplainabilityData {
    overallConfidence: number;
    confidenceFactors: {
        dataQuality: number;
        sourceReliability: number;
        consensusLevel: number;
        patientSpecificity: number;
    };
    sources: Source[];
    reasoningChain: ReasoningStep[];
    limitations?: string[];
    alternativeConsiderations?: string[];
}

interface ExplainabilityPanelProps {
    data: ExplainabilityData;
    mode?: 'expert' | 'simplified';
    onModeChange?: (mode: 'expert' | 'simplified') => void;
    className?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    if (confidence >= 0.4) return 'text-orange-500';
    return 'text-red-500';
};

const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'Élevée';
    if (confidence >= 0.6) return 'Modérée';
    if (confidence >= 0.4) return 'Limitée';
    return 'Faible';
};

const getSourceIcon = (type: Source['type']) => {
    switch (type) {
        case 'pubmed': return '📚';
        case 'clinical_guideline': return '📋';
        case 'drug_database': return '💊';
        case 'icd': return '🏥';
        case 'internal': return '🔒';
        case 'textbook': return '📖';
        default: return '📄';
    }
};

const getSourceLabel = (type: Source['type']): string => {
    switch (type) {
        case 'pubmed': return 'PubMed';
        case 'clinical_guideline': return 'Guideline';
        case 'drug_database': return 'Drug DB';
        case 'icd': return 'CIM-11';
        case 'internal': return 'Interne';
        case 'textbook': return 'Manuel';
        default: return 'Source';
    }
};

// ============================================
// SUBCOMPONENTS
// ============================================

const ConfidenceMeter = ({
    confidence,
    label,
    size = 'md'
}: {
    confidence: number;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
}) => {
    const sizeClasses = {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3'
    };

    return (
        <div className="space-y-1">
            {label && (
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={cn("font-medium", getConfidenceColor(confidence))}>
                        {Math.round(confidence * 100)}%
                    </span>
                </div>
            )}
            <Progress
                value={confidence * 100}
                className={cn(
                    sizeClasses[size],
                    confidence >= 0.8 && "[&>div]:bg-green-500",
                    confidence >= 0.6 && confidence < 0.8 && "[&>div]:bg-yellow-500",
                    confidence >= 0.4 && confidence < 0.6 && "[&>div]:bg-orange-500",
                    confidence < 0.4 && "[&>div]:bg-red-500"
                )}
            />
        </div>
    );
};

const SourceCard = ({ source, simplified = false }: { source: Source; simplified?: boolean }) => {
    const [expanded, setExpanded] = useState(false);

    if (simplified) {
        return (
            <div className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50">
                <span>{getSourceIcon(source.type)}</span>
                <span className="flex-1 truncate">{source.title}</span>
                {source.url && (
                    <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>
        );
    }

    return (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
            <div className="border rounded-lg p-2 text-xs">
                <CollapsibleTrigger asChild>
                    <div className="flex items-start gap-2 cursor-pointer">
                        <span className="text-lg">{getSourceIcon(source.type)}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                    {getSourceLabel(source.type)}
                                </Badge>
                                <span className="text-muted-foreground">
                                    Pertinence: {Math.round(source.relevance * 100)}%
                                </span>
                            </div>
                            <p className="font-medium mt-1 line-clamp-2">{source.title}</p>
                            {source.authors && (
                                <p className="text-muted-foreground truncate">
                                    {source.authors} {source.year && `(${source.year})`}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {source.url && (
                                <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline p-1"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                            {expanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                        </div>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    {source.excerpt && (
                        <div className="mt-2 pt-2 border-t text-muted-foreground italic">
                            "{source.excerpt}"
                        </div>
                    )}
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
};

const ReasoningChain = ({ steps, sources }: { steps: ReasoningStep[]; sources: Source[] }) => {
    return (
        <div className="space-y-3">
            {steps.map((step, index) => (
                <div key={step.id} className="relative">
                    {/* Connector line */}
                    {index < steps.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />
                    )}

                    <div className="flex gap-3">
                        {/* Step number */}
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                            step.confidence >= 0.7
                                ? "bg-green-500/20 text-green-600"
                                : step.confidence >= 0.4
                                    ? "bg-yellow-500/20 text-yellow-600"
                                    : "bg-red-500/20 text-red-600"
                        )}>
                            {step.step}
                        </div>

                        {/* Step content */}
                        <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{step.title}</span>
                                <Badge variant="outline" className={cn(
                                    "text-[10px]",
                                    getConfidenceColor(step.confidence)
                                )}>
                                    {Math.round(step.confidence * 100)}%
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{step.description}</p>

                            {/* Linked sources */}
                            {step.sources && step.sources.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {step.sources.map(sourceId => {
                                        const source = sources.find(s => s.id === sourceId);
                                        if (!source) return null;
                                        return (
                                            <TooltipProvider key={sourceId}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge variant="secondary" className="text-[10px] cursor-help">
                                                            {getSourceIcon(source.type)} {getSourceLabel(source.type)}
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs text-xs">{source.title}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ExplainabilityPanel = ({
    data,
    mode = 'simplified',
    onModeChange,
    className
}: ExplainabilityPanelProps) => {
    const [currentMode, setCurrentMode] = useState<'expert' | 'simplified'>(mode);
    const [isExpanded, setIsExpanded] = useState(false);

    const handleModeChange = (newMode: 'expert' | 'simplified') => {
        setCurrentMode(newMode);
        onModeChange?.(newMode);
    };

    return (
        <Card className={cn("border-border/50", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        Expliquabilité IA
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Tabs value={currentMode} onValueChange={(v) => handleModeChange(v as any)}>
                            <TabsList className="h-7">
                                <TabsTrigger value="simplified" className="text-[10px] h-5 px-2">
                                    <Lightbulb className="h-3 w-3 mr-1" />
                                    Simple
                                </TabsTrigger>
                                <TabsTrigger value="expert" className="text-[10px] h-5 px-2">
                                    <Layers className="h-3 w-3 mr-1" />
                                    Expert
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Overall Confidence */}
                <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Shield className={cn("h-4 w-4", getConfidenceColor(data.overallConfidence))} />
                            <span className="text-sm font-medium">Niveau de confiance</span>
                        </div>
                        <Badge className={cn(
                            "text-xs",
                            data.overallConfidence >= 0.8 ? "bg-green-500/20 text-green-600 border-green-500/30" :
                                data.overallConfidence >= 0.6 ? "bg-yellow-500/20 text-yellow-600 border-yellow-500/30" :
                                    data.overallConfidence >= 0.4 ? "bg-orange-500/20 text-orange-600 border-orange-500/30" :
                                        "bg-red-500/20 text-red-600 border-red-500/30"
                        )}>
                            {getConfidenceLabel(data.overallConfidence)} ({Math.round(data.overallConfidence * 100)}%)
                        </Badge>
                    </div>

                    <Progress
                        value={data.overallConfidence * 100}
                        className={cn(
                            "h-2",
                            data.overallConfidence >= 0.8 && "[&>div]:bg-green-500",
                            data.overallConfidence >= 0.6 && data.overallConfidence < 0.8 && "[&>div]:bg-yellow-500",
                            data.overallConfidence >= 0.4 && data.overallConfidence < 0.6 && "[&>div]:bg-orange-500",
                            data.overallConfidence < 0.4 && "[&>div]:bg-red-500"
                        )}
                    />

                    {/* Confidence factors (expert mode only) */}
                    {currentMode === 'expert' && (
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t">
                            <ConfidenceMeter
                                confidence={data.confidenceFactors.dataQuality}
                                label="Qualité données"
                                size="sm"
                            />
                            <ConfidenceMeter
                                confidence={data.confidenceFactors.sourceReliability}
                                label="Fiabilité sources"
                                size="sm"
                            />
                            <ConfidenceMeter
                                confidence={data.confidenceFactors.consensusLevel}
                                label="Niveau consensus"
                                size="sm"
                            />
                            <ConfidenceMeter
                                confidence={data.confidenceFactors.patientSpecificity}
                                label="Spécificité patient"
                                size="sm"
                            />
                        </div>
                    )}
                </div>

                {/* Sources */}
                <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full h-auto p-2 justify-between">
                            <div className="flex items-center gap-2 text-sm">
                                <BookOpen className="h-4 w-4" />
                                Sources ({data.sources.length})
                            </div>
                            {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                            ) : (
                                <ChevronDown className="h-4 w-4" />
                            )}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2">
                        {data.sources.slice(0, currentMode === 'simplified' ? 3 : undefined).map(source => (
                            <SourceCard
                                key={source.id}
                                source={source}
                                simplified={currentMode === 'simplified'}
                            />
                        ))}
                        {currentMode === 'simplified' && data.sources.length > 3 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => handleModeChange('expert')}
                            >
                                Voir {data.sources.length - 3} sources supplémentaires
                            </Button>
                        )}
                    </CollapsibleContent>
                </Collapsible>

                {/* Reasoning Chain (expert mode) */}
                {currentMode === 'expert' && data.reasoningChain.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            Chaîne de raisonnement
                        </h4>
                        <ReasoningChain steps={data.reasoningChain} sources={data.sources} />
                    </div>
                )}

                {/* Limitations */}
                {data.limitations && data.limitations.length > 0 && (
                    <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                        <h4 className="text-xs font-medium flex items-center gap-2 text-yellow-600 mb-2">
                            <AlertTriangle className="h-3 w-3" />
                            Limites à considérer
                        </h4>
                        <ul className="space-y-1">
                            {data.limitations.slice(0, currentMode === 'simplified' ? 2 : undefined).map((limitation, idx) => (
                                <li key={idx} className="text-[11px] text-muted-foreground flex items-start gap-1">
                                    <span className="shrink-0">•</span>
                                    <span>{limitation}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Alternative considerations (expert mode) */}
                {currentMode === 'expert' && data.alternativeConsiderations && data.alternativeConsiderations.length > 0 && (
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                        <h4 className="text-xs font-medium flex items-center gap-2 text-blue-600 mb-2">
                            <HelpCircle className="h-3 w-3" />
                            Considérations alternatives
                        </h4>
                        <ul className="space-y-1">
                            {data.alternativeConsiderations.map((consideration, idx) => (
                                <li key={idx} className="text-[11px] text-muted-foreground flex items-start gap-1">
                                    <span className="shrink-0">•</span>
                                    <span>{consideration}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default ExplainabilityPanel;
