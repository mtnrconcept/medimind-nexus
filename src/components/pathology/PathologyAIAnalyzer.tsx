import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import {
  Brain,
  AlertTriangle,
  Zap,
  Users,
  Lightbulb,
  RefreshCw,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

interface Interaction {
  symptom: string;
  treatment: string;
  probability: string;
  explanation: string;
}

interface Correlation {
  symptom: string;
  related_pathology: string;
  evidence: string;
}

interface PatientInsight {
  finding: string;
  patient_count: number;
  confidence: string;
}

interface Recommendation {
  action: string;
  priority: string;
  rationale: string;
}

interface AnalysisResult {
  pathology: {
    id: string;
    name: string;
    icdCode: string;
  };
  dataContext: {
    symptomsCount: number;
    treatmentsCount: number;
    patientsCount: number;
    sourcesCount: number;
  };
  analysis: {
    interactions: Interaction[];
    correlations: Correlation[];
    patient_insights: PatientInsight[];
    recommendations: Recommendation[];
  };
}

interface PathologyAIAnalyzerProps {
  pathologyId: string;
  pathologyName: string;
}

const PathologyAIAnalyzer = ({ pathologyId, pathologyName }: PathologyAIAnalyzerProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('pathology-analyzer', {
        body: { pathologyId },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      toast.success('Analyse terminée');
    } catch (err) {
      console.error('Analysis error:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'analyse';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'haute': return 'destructive';
      case 'moyenne': return 'secondary';
      case 'faible': return 'outline';
      default: return 'secondary';
    }
  };

  const getProbabilityIcon = (probability: string) => {
    switch (probability.toLowerCase()) {
      case 'haute': return <TrendingUp className="h-4 w-4 text-destructive" />;
      case 'moyenne': return <TrendingUp className="h-4 w-4 text-warning" />;
      default: return <TrendingUp className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Analyse IA Cross-Data
        </CardTitle>
        <CardDescription>
          Analyse croisée des symptômes, traitements et données patients par intelligence artificielle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!result && !loading && (
          <div className="text-center py-6">
            <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              L'IA analysera les corrélations entre les symptômes, traitements et données cliniques des patients pour {pathologyName}.
            </p>
            <Button onClick={runAnalysis} size="lg">
              <Zap className="h-4 w-4 mr-2" />
              Lancer l'analyse IA
            </Button>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyse en cours...</span>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <div className="text-center py-6">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={runAnalysis} variant="outline">
              Réessayer
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Context Summary */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {result.dataContext?.symptomsCount || 0} symptômes
              </Badge>
              <Badge variant="outline">
                {result.dataContext?.treatmentsCount || 0} traitements
              </Badge>
              <Badge variant="outline">
                {result.dataContext?.patientsCount || 0} patients analysés
              </Badge>
              <Badge variant="outline">
                {result.dataContext?.sourcesCount || 0} sources
              </Badge>
            </div>

            {/* Interactions */}
            {result.analysis?.interactions?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-warning" />
                  Interactions Symptômes ↔ Traitements
                </h4>
                {result.analysis?.interactions?.map((interaction, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">{interaction.symptom}</Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline">{interaction.treatment}</Badge>
                      {getProbabilityIcon(interaction.probability)}
                    </div>
                    <p className="text-sm text-muted-foreground">{interaction.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Correlations */}
            {result.analysis?.correlations?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Corrélations Pathologiques
                </h4>
                {result.analysis?.correlations?.map((correlation, idx) => (
                  <div key={idx} className="p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>{correlation.symptom}</Badge>
                      <span className="text-sm text-muted-foreground">→</span>
                      <Badge variant="destructive">{correlation.related_pathology}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{correlation.evidence}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Patient Insights */}
            {result.analysis?.patient_insights?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Insights Patients
                </h4>
                {result.analysis?.patient_insights?.map((insight, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-primary/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{insight.finding}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{insight.patient_count} patients</Badge>
                        <Badge variant={getPriorityColor(insight.confidence)}>
                          {insight.confidence}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {result.analysis?.recommendations?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-warning" />
                  Recommandations
                </h4>
                {result.analysis?.recommendations?.map((rec, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-warning/30 bg-warning/5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-medium text-sm">{rec.action}</span>
                        <p className="text-xs text-muted-foreground mt-1">{rec.rationale}</p>
                      </div>
                      <Badge variant={getPriorityColor(rec.priority)}>
                        {rec.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Re-run button */}
            <Button onClick={runAnalysis} variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Relancer l'analyse
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PathologyAIAnalyzer;
