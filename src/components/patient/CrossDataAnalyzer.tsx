import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { 
  Brain, 
  Loader2, 
  AlertTriangle, 
  ArrowRight, 
  Link2, 
  Activity,
  Pill,
  Stethoscope,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Globe,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';

interface Pathology {
  id: string;
  name: string;
}

interface Symptom {
  id: string;
  name: string;
}

interface Treatment {
  id: string;
  name: string;
  pathology_id: string;
}

interface WebSource {
  title: string;
  url: string;
}

interface WebResearch {
  query: string;
  findings: string[];
  sources: WebSource[];
}

interface CausalLink {
  from: string;
  fromType: 'symptom' | 'pathology' | 'treatment';
  to: string;
  toType: 'symptom' | 'pathology' | 'treatment';
  relationship: string;
  probability: 'high' | 'medium' | 'low';
  evidence: string;
  patientCount: number;
  webSources?: string[];
}

interface AnalysisResult {
  causalLinks: CausalLink[];
  summary: string;
  warnings: string[];
  recommendations: string[];
  webResearch: WebResearch[];
}

const CrossDataAnalyzer = () => {
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedPathologies, setSelectedPathologies] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [pathologiesRes, symptomsRes, treatmentsRes] = await Promise.all([
        supabase.from('pathologies').select('id, name').order('name'),
        supabase.from('symptoms').select('id, name').order('name'),
        supabase.from('treatments').select('id, name, pathology_id').order('name')
      ]);

      if (pathologiesRes.data) setPathologies(pathologiesRes.data);
      if (symptomsRes.data) setSymptoms(symptomsRes.data);
      if (treatmentsRes.data) setTreatments(treatmentsRes.data);
      setLoading(false);
    };

    fetchData();
  }, []);

  const toggleSelection = (
    id: string, 
    selected: string[], 
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const getTotalSelected = () => 
    selectedPathologies.length + selectedSymptoms.length + selectedTreatments.length;

  const runAnalysis = async () => {
    if (getTotalSelected() < 2) {
      toast.error('Sélectionnez au moins 2 éléments pour analyser les liens de causalité');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('cross-data-analyzer', {
        body: {
          pathologyIds: selectedPathologies,
          symptomIds: selectedSymptoms,
          treatmentIds: selectedTreatments
        }
      });

      if (fnError) throw fnError;

      if (data.error) {
        if (data.error.includes('Crédits insuffisants') || data.error.includes('402')) {
          setError('Crédits IA insuffisants. Rechargez votre compte dans Paramètres → Workspace → Usage.');
        } else if (data.error.includes('Limite') || data.error.includes('429')) {
          setError('Limite de requêtes atteinte. Réessayez dans quelques instants.');
        } else {
          setError(data.error);
        }
        return;
      }

      setResult(data.analysis);
      toast.success(`Analyse terminée : ${data.context.pubmedSearches || 0} recherches PubMed effectuées`);
    } catch (err) {
      console.error('Erreur d\'analyse:', err);
      setError('Erreur lors de l\'analyse. Veuillez réessayer.');
    } finally {
      setAnalyzing(false);
    }
  };

  const getProbabilityBadge = (probability: string) => {
    switch (probability) {
      case 'high':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Forte</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Moyenne</Badge>;
      case 'low':
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Faible</Badge>;
      default:
        return <Badge variant="secondary">{probability}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'symptom':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'pathology':
        return <Stethoscope className="h-4 w-4 text-purple-500" />;
      case 'treatment':
        return <Pill className="h-4 w-4 text-green-500" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'symptom': return 'Symptôme';
      case 'pathology': return 'Pathologie';
      case 'treatment': return 'Traitement';
      default: return type;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Analyse IA Cross-Data
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Analyse les liens de causalité en croisant vos données patients et la littérature médicale (PubMed)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Panneaux de sélection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pathologies */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <Stethoscope className="h-4 w-4 text-purple-500" />
              Pathologies ({selectedPathologies.length})
            </div>
            <ScrollArea className="h-48 border rounded-md p-2">
              <div className="space-y-2">
                {pathologies.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`pathology-${p.id}`}
                      checked={selectedPathologies.includes(p.id)}
                      onCheckedChange={() => toggleSelection(p.id, selectedPathologies, setSelectedPathologies)}
                    />
                    <label 
                      htmlFor={`pathology-${p.id}`} 
                      className="text-sm cursor-pointer truncate"
                    >
                      {p.name}
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Symptômes */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <Activity className="h-4 w-4 text-blue-500" />
              Symptômes ({selectedSymptoms.length})
            </div>
            <ScrollArea className="h-48 border rounded-md p-2">
              <div className="space-y-2">
                {symptoms.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`symptom-${s.id}`}
                      checked={selectedSymptoms.includes(s.id)}
                      onCheckedChange={() => toggleSelection(s.id, selectedSymptoms, setSelectedSymptoms)}
                    />
                    <label 
                      htmlFor={`symptom-${s.id}`} 
                      className="text-sm cursor-pointer truncate"
                    >
                      {s.name}
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Traitements */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <Pill className="h-4 w-4 text-green-500" />
              Traitements ({selectedTreatments.length})
            </div>
            <ScrollArea className="h-48 border rounded-md p-2">
              <div className="space-y-2">
                {treatments.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`treatment-${t.id}`}
                      checked={selectedTreatments.includes(t.id)}
                      onCheckedChange={() => toggleSelection(t.id, selectedTreatments, setSelectedTreatments)}
                    />
                    <label 
                      htmlFor={`treatment-${t.id}`} 
                      className="text-sm cursor-pointer truncate"
                    >
                      {t.name}
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Bouton d'analyse */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {getTotalSelected()} élément(s) sélectionné(s) • Recherche web incluse
          </p>
          <Button 
            onClick={runAnalysis} 
            disabled={analyzing || getTotalSelected() < 2}
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Analyser les liens
              </>
            )}
          </Button>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Résultats */}
        {result && (
          <div className="space-y-6 pt-4 border-t">
            {/* Résumé */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Résumé de l'analyse</h4>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>

            {/* Liens de causalité */}
            {result.causalLinks && result.causalLinks.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Liens de causalité détectés
                </h4>
                <div className="space-y-3">
                  {result.causalLinks.map((link, index) => (
                    <div 
                      key={index} 
                      className="p-4 border rounded-lg bg-card space-y-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded">
                          {getTypeIcon(link.fromType)}
                          <span className="text-sm font-medium">{link.from}</span>
                          <span className="text-xs text-muted-foreground">({getTypeLabel(link.fromType)})</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded">
                          {getTypeIcon(link.toType)}
                          <span className="text-sm font-medium">{link.to}</span>
                          <span className="text-xs text-muted-foreground">({getTypeLabel(link.toType)})</span>
                        </div>
                        {getProbabilityBadge(link.probability)}
                      </div>
                      <p className="text-sm font-medium text-primary">{link.relationship}</p>
                      <p className="text-sm text-muted-foreground">{link.evidence}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {link.patientCount > 0 && (
                          <span>Observé chez {link.patientCount} patient(s)</span>
                        )}
                        {link.webSources && link.webSources.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {link.webSources.length} source(s) web
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recherche web */}
            {result.webResearch && result.webResearch.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <BookOpen className="h-4 w-4" />
                  Recherche scientifique (PubMed)
                </h4>
                <div className="space-y-3">
                  {result.webResearch.map((research, index) => (
                    <div key={index} className="p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm font-medium mb-2">Recherche : "{research.query}"</p>
                      {research.findings && research.findings.length > 0 && (
                        <ul className="space-y-1 mb-2">
                          {research.findings.map((finding, fIndex) => (
                            <li key={fIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              {finding}
                            </li>
                          ))}
                        </ul>
                      )}
                      {research.sources && research.sources.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {research.sources.map((source, sIndex) => (
                            <a 
                              key={sIndex}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {source.title.slice(0, 50)}...
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Avertissements */}
            {result.warnings && result.warnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  Avertissements
                </h4>
                <ul className="space-y-1">
                  {result.warnings.map((warning, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommandations */}
            {result.recommendations && result.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Recommandations
                </h4>
                <ul className="space-y-1">
                  {result.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <HelpCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CrossDataAnalyzer;
