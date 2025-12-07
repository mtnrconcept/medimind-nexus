import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Search as SearchIcon, Activity, ChevronRight, X, Sparkles } from 'lucide-react';

interface Symptom {
  id: string;
  name: string;
  description: string;
  body_system: string;
}

interface PathologyResult {
  id: string;
  name: string;
  icd_code: string;
  description: string;
  category: string;
  specialty: string;
  severity: string;
  matchScore: number;
  matchedSymptoms: string[];
}

const Search = () => {
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [results, setResults] = useState<PathologyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const fetchSymptoms = async () => {
      const { data } = await supabase
        .from('symptoms')
        .select('*')
        .order('name');
      
      if (data) setSymptoms(data);
    };

    fetchSymptoms();
  }, []);

  const groupedSymptoms = symptoms.reduce((acc, symptom) => {
    const system = symptom.body_system || 'Autre';
    if (!acc[system]) acc[system] = [];
    acc[system].push(symptom);
    return acc;
  }, {} as Record<string, Symptom[]>);

  const toggleSymptom = (symptomId: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptomId) 
        ? prev.filter(id => id !== symptomId)
        : [...prev, symptomId]
    );
  };

  const clearSelection = () => {
    setSelectedSymptoms([]);
    setResults([]);
    setHasSearched(false);
  };

  const handleSearch = async () => {
    if (selectedSymptoms.length === 0) return;

    setLoading(true);
    setHasSearched(true);

    try {
      // Get all pathology-symptom links for selected symptoms
      const { data: links } = await supabase
        .from('pathology_symptoms')
        .select(`
          pathology_id,
          frequency_percent,
          symptom_id,
          pathologies(*)
        `)
        .in('symptom_id', selectedSymptoms);

      if (links) {
        // Group by pathology and calculate match score
        const pathologyMap = new Map<string, PathologyResult>();

        for (const link of links) {
          const pathology = link.pathologies as any;
          if (!pathology) continue;

          if (!pathologyMap.has(pathology.id)) {
            pathologyMap.set(pathology.id, {
              ...pathology,
              matchScore: 0,
              matchedSymptoms: [],
            });
          }

          const existing = pathologyMap.get(pathology.id)!;
          existing.matchScore += link.frequency_percent || 0;
          existing.matchedSymptoms.push(link.symptom_id);
        }

        // Convert to array and sort by match score
        const resultsArray = Array.from(pathologyMap.values())
          .sort((a, b) => b.matchScore - a.matchScore);

        setResults(resultsArray);
      }
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getSymptomName = (id: string) => {
    return symptoms.find(s => s.id === id)?.name || '';
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SearchIcon className="h-8 w-8" />
            Recherche par Symptômes
          </h1>
          <p className="text-muted-foreground mt-1">
            Sélectionnez les symptômes observés pour identifier les pathologies possibles
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Symptom Selection */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Symptômes</span>
                  {selectedSymptoms.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearSelection}>
                      <X className="h-4 w-4 mr-1" />
                      Effacer
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedSymptoms.length} symptôme(s) sélectionné(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-6">
                    {Object.entries(groupedSymptoms).map(([system, systemSymptoms]) => (
                      <div key={system}>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">
                          {system}
                        </h4>
                        <div className="space-y-2">
                          {systemSymptoms.map((symptom) => (
                            <div key={symptom.id} className="flex items-start gap-2">
                              <Checkbox
                                id={symptom.id}
                                checked={selectedSymptoms.includes(symptom.id)}
                                onCheckedChange={() => toggleSymptom(symptom.id)}
                              />
                              <Label
                                htmlFor={symptom.id}
                                className="text-sm cursor-pointer leading-relaxed"
                              >
                                {symptom.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <Button 
                  className="w-full mt-4" 
                  onClick={handleSearch}
                  disabled={selectedSymptoms.length === 0 || loading}
                >
                  {loading ? 'Recherche...' : 'Rechercher'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 space-y-4">
            {!hasSearched ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Prêt à diagnostiquer</h3>
                  <p className="text-muted-foreground">
                    Sélectionnez des symptômes dans le panneau de gauche pour commencer la recherche
                  </p>
                </CardContent>
              </Card>
            ) : results.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Aucun résultat</h3>
                  <p className="text-muted-foreground">
                    Aucune pathologie ne correspond aux symptômes sélectionnés
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    {results.length} pathologie(s) trouvée(s)
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Triées par pertinence
                  </p>
                </div>
                {results.map((pathology, index) => (
                  <Link key={pathology.id} to={`/pathologies/${pathology.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardContent className="py-4">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">{pathology.name}</h3>
                              {pathology.icd_code && (
                                <Badge variant="outline" className="font-mono">
                                  {pathology.icd_code}
                                </Badge>
                              )}
                              <Badge className={getSeverityColor(pathology.severity)}>
                                {getSeverityLabel(pathology.severity)}
                              </Badge>
                            </div>
                            <p className="text-sm mt-1 line-clamp-2 text-muted-foreground">
                              {pathology.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                Symptômes correspondants :
                              </span>
                              {pathology.matchedSymptoms.map((symptomId) => (
                                <Badge key={symptomId} variant="secondary" className="text-xs">
                                  {getSymptomName(symptomId)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Search;
