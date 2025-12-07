import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft,
  Activity,
  Pill,
  BookOpen,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

interface Pathology {
  id: string;
  name: string;
  icd_code: string;
  synonyms: string[];
  description: string;
  category: string;
  specialty: string;
  severity: string;
}

interface SymptomLink {
  frequency_percent: number;
  is_primary: boolean;
  symptoms: {
    id: string;
    name: string;
    description: string;
    body_system: string;
  };
}

interface Treatment {
  id: string;
  name: string;
  type: string;
  description: string;
  contraindications: string[];
}

interface Source {
  id: string;
  source_type: string;
  title: string;
  url: string;
  pubmed_id: string;
  published_date: string;
}

const PathologyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [pathology, setPathology] = useState<Pathology | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomLink[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        const [pathologyRes, symptomsRes, treatmentsRes, sourcesRes] = await Promise.all([
          supabase.from('pathologies').select('*').eq('id', id).single(),
          supabase.from('pathology_symptoms')
            .select('frequency_percent, is_primary, symptoms(*)')
            .eq('pathology_id', id)
            .order('frequency_percent', { ascending: false }),
          supabase.from('treatments').select('*').eq('pathology_id', id),
          supabase.from('medical_sources').select('*').eq('pathology_id', id),
        ]);

        if (pathologyRes.data) setPathology(pathologyRes.data);
        if (symptomsRes.data) setSymptoms(symptomsRes.data as SymptomLink[]);
        if (treatmentsRes.data) setTreatments(treatmentsRes.data);
        if (sourcesRes.data) setSources(sourcesRes.data);
      } catch (error) {
        console.error('Error fetching pathology details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'mild': return 'bg-green-100 text-green-800';
      case 'moderate': return 'bg-yellow-100 text-yellow-800';
      case 'severe': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'mild': return 'Bénin';
      case 'moderate': return 'Modéré';
      case 'severe': return 'Sévère';
      case 'critical': return 'Critique';
      default: return severity;
    }
  };

  const getTreatmentTypeLabel = (type: string) => {
    switch (type) {
      case 'medication': return 'Médicament';
      case 'surgery': return 'Chirurgie';
      case 'therapy': return 'Thérapie';
      case 'lifestyle': return 'Hygiène de vie';
      default: return type;
    }
  };

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case 'pubmed': return 'PubMed';
      case 'who': return 'OMS';
      case 'has': return 'HAS';
      case 'clinical_trial': return 'Essai Clinique';
      default: return type;
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Activity className="h-8 w-8 animate-pulse text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!pathology) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Pathologie non trouvée</h2>
          <Link to="/pathologies">
            <Button variant="link">Retour à l'index</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link to="/pathologies">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{pathology.name}</h1>
              {pathology.icd_code && (
                <Badge variant="outline" className="font-mono text-lg">
                  {pathology.icd_code}
                </Badge>
              )}
              <Badge className={getSeverityColor(pathology.severity)}>
                {getSeverityLabel(pathology.severity)}
              </Badge>
            </div>
            {pathology.synonyms && pathology.synonyms.length > 0 && (
              <p className="text-muted-foreground mt-1">
                Aussi appelé : {pathology.synonyms.join(', ')}
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary">{pathology.category}</Badge>
              <Badge variant="secondary">{pathology.specialty}</Badge>
            </div>
          </div>
        </div>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed">{pathology.description}</p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Symptoms */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Symptômes associés
              </CardTitle>
              <CardDescription>
                Fréquence d'apparition chez les patients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {symptoms.length === 0 ? (
                <p className="text-muted-foreground">Aucun symptôme référencé</p>
              ) : (
                symptoms.map((link) => (
                  <div key={link.symptoms.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{link.symptoms.name}</span>
                        {link.is_primary && (
                          <Badge variant="secondary" className="text-xs">Principal</Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {link.frequency_percent}%
                      </span>
                    </div>
                    <Progress value={link.frequency_percent} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {link.symptoms.description} • {link.symptoms.body_system}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Treatments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Traitements
              </CardTitle>
              <CardDescription>
                Protocoles thérapeutiques recommandés
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {treatments.length === 0 ? (
                <p className="text-muted-foreground">Aucun traitement référencé</p>
              ) : (
                treatments.map((treatment) => (
                  <div key={treatment.id} className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{treatment.name}</h4>
                      <Badge variant="outline">
                        {getTreatmentTypeLabel(treatment.type)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {treatment.description}
                    </p>
                    {treatment.contraindications && treatment.contraindications.length > 0 && (
                      <div className="mt-2 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-destructive">
                          <span className="font-medium">Contre-indications :</span>{' '}
                          {treatment.contraindications.join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Sources et Références
            </CardTitle>
            <CardDescription>
              Documentation scientifique et médicale
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-muted-foreground">Aucune source référencée</p>
            ) : (
              <div className="space-y-3">
                {sources.map((source) => (
                  <div key={source.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {getSourceTypeLabel(source.source_type)}
                        </Badge>
                        {source.pubmed_id && (
                          <span className="text-xs text-muted-foreground font-mono">
                            PMID: {source.pubmed_id}
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium mt-1">{source.title}</h4>
                      {source.published_date && (
                        <p className="text-xs text-muted-foreground">
                          Publié le {new Date(source.published_date).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>
                    {source.url && (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PathologyDetail;
