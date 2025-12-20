import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import {
  Brain,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Stethoscope,
  TestTube,
  ShieldAlert,
  BookOpen,
  Database,
  Globe,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';

interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

interface PathologyMatch {
  name: string;
  icdCode?: string;
  confidence: 'high' | 'medium' | 'low';
  matchedSymptoms: string[];
  description: string;
  severity?: string;
  treatmentSuggestions?: string[];
  sources: WebSource[];
  isInDatabase: boolean;
  databaseId?: string;
}

interface DeepResearchResult {
  pathologies: PathologyMatch[];
  summary: string;
  differentialDiagnosis: string;
  redFlags: string[];
  recommendedTests: string[];
  webSourcesCount: number;
}

interface DeepResearchPanelProps {
  selectedSymptomIds: string[];
  selectedSymptomNames: string[];
}

const DeepResearchPanel = ({ selectedSymptomIds, selectedSymptomNames }: DeepResearchPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeepResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');

  // Filtered pathologies
  const filteredPathologies = useMemo(() => {
    if (!result?.pathologies) return [];

    return result.pathologies.filter(pathology => {
      // Filter by severity
      if (severityFilter !== 'all' && pathology.severity !== severityFilter) {
        return false;
      }
      // Filter by confidence
      if (confidenceFilter !== 'all' && pathology.confidence !== confidenceFilter) {
        return false;
      }
      return true;
    });
  }, [result?.pathologies, severityFilter, confidenceFilter]);

  const runDeepResearch = async () => {
    if (selectedSymptomNames.length === 0) {
      toast.error('Sélectionnez au moins un symptôme pour lancer la Deep Research');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('deep-research', {
        body: {
          symptomIds: selectedSymptomIds,
          symptomNames: selectedSymptomNames
        }
      });

      if (fnError) throw fnError;

      if (data.error) {
        if (data.error.includes('Crédits') || data.error.includes('402')) {
          setError('Crédits IA insuffisants. Rechargez votre compte dans Paramètres → Workspace → Usage.');
        } else if (data.error.includes('Limite') || data.error.includes('429')) {
          setError('Limite de requêtes atteinte. Réessayez dans quelques instants.');
        } else {
          setError(data.error);
        }
        return;
      }

      setResult(data.result);
      toast.success(`Deep Research terminée : ${data.result.pathologies?.length || 0} pathologies identifiées`);
    } catch (err) {
      console.error('Erreur Deep Research:', err);
      setError('Erreur lors de la recherche. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Haute</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Moyenne</Badge>;
      case 'low':
        return <Badge className="bg-muted text-muted-foreground border-muted">Faible</Badge>;
      default:
        return <Badge variant="secondary">{confidence}</Badge>;
    }
  };

  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case 'mild':
        return <Badge variant="outline" className="text-green-600">Bénin</Badge>;
      case 'moderate':
        return <Badge variant="outline" className="text-yellow-600">Modéré</Badge>;
      case 'severe':
        return <Badge variant="outline" className="text-orange-600">Sévère</Badge>;
      case 'critical':
        return <Badge variant="outline" className="text-destructive">Critique</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Deep Research IA
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Recherche approfondie combinant base de données et littérature médicale (PubMed)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Symptômes sélectionnés */}
        {selectedSymptomNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedSymptomNames.map((name, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {name}
              </Badge>
            ))}
          </div>
        )}

        {/* Bouton de recherche */}
        <Button
          onClick={runDeepResearch}
          disabled={loading || selectedSymptomNames.length === 0}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Recherche approfondie en cours...
            </>
          ) : (
            <>
              <Brain className="h-4 w-4 mr-2" />
              Lancer la Deep Research ({selectedSymptomNames.length} symptômes)
            </>
          )}
        </Button>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Résultats */}
        {result && (
          <div className="space-y-6 pt-4 border-t">
            {/* Résumé */}
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Résumé du diagnostic
              </h4>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>

            {/* Signaux d'alerte */}
            {result.redFlags && result.redFlags.length > 0 && (
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                <h4 className="font-medium mb-2 flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  Signaux d'alerte (Red Flags)
                </h4>
                <ul className="space-y-1">
                  {result.redFlags.map((flag, index) => (
                    <li key={index} className="text-sm text-destructive flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pathologies identifiées */}
            {result.pathologies && result.pathologies.length > 0 && (
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Pathologies identifiées ({filteredPathologies.length}/{result.pathologies.length})
                  </h4>
                </div>

                {/* Filtres */}
                <div className="flex flex-wrap gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Plausibilité:</span>
                    <div className="flex gap-1">
                      {['all', 'high', 'medium', 'low'].map((conf) => (
                        <Badge
                          key={conf}
                          variant={confidenceFilter === conf ? 'default' : 'outline'}
                          className="cursor-pointer text-xs"
                          onClick={() => setConfidenceFilter(conf)}
                        >
                          {conf === 'all' ? 'Toutes' : conf === 'high' ? 'Haute' : conf === 'medium' ? 'Moyenne' : 'Faible'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Sévérité:</span>
                    <div className="flex gap-1">
                      {['all', 'mild', 'moderate', 'severe', 'critical'].map((sev) => (
                        <Badge
                          key={sev}
                          variant={severityFilter === sev ? 'default' : 'outline'}
                          className={`cursor-pointer text-xs ${severityFilter === sev ? '' :
                            sev === 'mild' ? 'border-green-500 text-green-600' :
                              sev === 'moderate' ? 'border-yellow-500 text-yellow-600' :
                                sev === 'severe' ? 'border-orange-500 text-orange-600' :
                                  sev === 'critical' ? 'border-red-500 text-red-600' : ''}`}
                          onClick={() => setSeverityFilter(sev)}
                        >
                          {sev === 'all' ? 'Toutes' : sev === 'mild' ? 'Bénin' : sev === 'moderate' ? 'Modéré' : sev === 'severe' ? 'Sévère' : 'Critique'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {filteredPathologies.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucune pathologie ne correspond aux filtres sélectionnés
                      </p>
                    ) : (
                      <Accordion type="single" collapsible className="space-y-2">
                        {filteredPathologies.map((pathology, index) => (
                          <AccordionItem key={index} value={`pathology-${index}`} className="border rounded-lg px-4 bg-card">
                            <AccordionTrigger className="hover:no-underline py-3">
                              <div className="flex items-center gap-3 flex-1 text-left">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{pathology.name}</span>
                                    {pathology.icdCode && (
                                      <Badge variant="outline" className="font-mono text-xs">
                                        {pathology.icdCode}
                                      </Badge>
                                    )}
                                    {getConfidenceBadge(pathology.confidence)}
                                    {getSeverityBadge(pathology.severity)}
                                    {pathology.isInDatabase && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Database className="h-3 w-3 mr-1" />
                                        Base locale
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 space-y-3">
                              <p className="text-sm text-muted-foreground">{pathology.description}</p>

                              {/* Symptômes correspondants */}
                              {pathology.matchedSymptoms && pathology.matchedSymptoms.length > 0 && (
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground">Symptômes correspondants :</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {pathology.matchedSymptoms.map((symptom, sIndex) => (
                                      <Badge key={sIndex} variant="secondary" className="text-xs">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        {symptom}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Suggestions de traitement */}
                              {pathology.treatmentSuggestions && pathology.treatmentSuggestions.length > 0 && (
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground">Pistes thérapeutiques :</span>
                                  <ul className="mt-1 space-y-1">
                                    {pathology.treatmentSuggestions.map((treatment, tIndex) => (
                                      <li key={tIndex} className="text-sm text-muted-foreground">• {treatment}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Sources */}
                              {pathology.sources && pathology.sources.length > 0 && (
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground">Sources :</span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {pathology.sources.map((source, srcIndex) => (
                                      <a
                                        key={srcIndex}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        {source.title.slice(0, 40)}...
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Lien vers fiche si dans la base */}
                              {pathology.isInDatabase && pathology.databaseId && (
                                <Link
                                  to={`/pathologies/${pathology.databaseId}`}
                                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-2"
                                >
                                  Voir la fiche complète
                                  <ChevronRight className="h-4 w-4" />
                                </Link>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Diagnostic différentiel */}
            {result.differentialDiagnosis && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Diagnostic différentiel</h4>
                <p className="text-sm text-muted-foreground">{result.differentialDiagnosis}</p>
              </div>
            )}

            {/* Examens recommandés */}
            {result.recommendedTests && result.recommendedTests.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  Examens complémentaires recommandés
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.recommendedTests.map((test, index) => (
                    <Badge key={index} variant="outline">
                      {test}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Statistiques */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                Base locale consultée
              </span>
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {result.webSourcesCount} sources PubMed analysées
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DeepResearchPanel;
