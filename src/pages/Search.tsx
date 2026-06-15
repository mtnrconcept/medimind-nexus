import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAI } from '@/contexts/AIContext';
import { Search as SearchIcon, Activity, ChevronRight, X, Sparkles, Database, Globe, Filter, Loader2, MessageCircle } from 'lucide-react';
import DeepResearchPanel from '@/components/search/DeepResearchPanel';
import SymptomQuestionnaireModal from '@/components/search/SymptomQuestionnaireModal';
import { COMMON_MEDICAL_SYMPTOMS, BODY_SYSTEMS } from '@/data/medicalSymptoms';

interface Symptom {
  id: string;
  name: string;
  description: string;
  body_system: string;
  isFromDatabase?: boolean;
  isFromNCBI?: boolean;
  ncbi_id?: string;
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
  const { invokeAI } = useAI();
  const [dbSymptoms, setDbSymptoms] = useState<Symptom[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedSymptomNames, setSelectedSymptomNames] = useState<string[]>([]);
  const [results, setResults] = useState<PathologyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedSystem, setSelectedSystem] = useState<string>('all');

  // NCBI Search State
  const [ncbiSearchQuery, setNcbiSearchQuery] = useState('');
  const [ncbiResults, setNcbiResults] = useState<Symptom[]>([]);
  const [ncbiLoading, setNcbiLoading] = useState(false);

  // Questionnaire Modal State - opens automatically on page load
  const [questionnaireOpen, setQuestionnaireOpen] = useState(true);

  // Handler when questionnaire completes
  const handleQuestionnaireComplete = (symptoms: string[]) => {
    // Add symptoms to selected list
    setSelectedSymptomNames(prev => [...new Set([...prev, ...symptoms])]);
    // Try to find matching symptom IDs in database
    const matchingIds = dbSymptoms
      .filter(s => symptoms.some(name => s.name.toLowerCase() === name.toLowerCase()))
      .map(s => s.id);
    setSelectedSymptoms(prev => [...new Set([...prev, ...matchingIds])]);
  };

  useEffect(() => {
    const fetchSymptoms = async () => {
      const { data } = await supabase
        .from('symptoms')
        .select('*')
        .order('name');

      if (data) {
        setDbSymptoms(data.map(s => ({ ...s, isFromDatabase: true })));
      }
    };

    fetchSymptoms();
  }, []);

  // Debounced NCBI Search
  useEffect(() => {
    if (ncbiSearchQuery.length < 2) {
      setNcbiResults([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setNcbiLoading(true);
      try {
        const { data, error } = await invokeAI('search-medical-concepts', {
          query: ncbiSearchQuery, type: 'symptom'
        });

        if (error) throw error;

        const concepts = data?.concepts || [];
        setNcbiResults(concepts.map((c: any) => ({
          id: `ncbi-${c.id}`,
          name: c.name,
          description: c.description || '',
          body_system: 'NCBI',
          isFromDatabase: false,
          isFromNCBI: true,
          ncbi_id: c.id
        })));
      } catch (err) {
        console.error('NCBI search error:', err);
      } finally {
        setNcbiLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceTimer);
  }, [ncbiSearchQuery]);

  // Combiner symptômes de la base et symptômes médicaux communs
  const allSymptoms = useMemo(() => {
    const dbSymptomNames = new Set(dbSymptoms.map(s => s.name.toLowerCase()));

    // Ajouter les symptômes communs qui ne sont pas déjà dans la base
    const additionalSymptoms = COMMON_MEDICAL_SYMPTOMS
      .filter(s => !dbSymptomNames.has(s.name.toLowerCase()))
      .map((s, index) => ({
        id: `common-${index}`,
        name: s.name,
        description: '',
        body_system: s.body_system,
        isFromDatabase: false
      }));

    return [...dbSymptoms, ...additionalSymptoms];
  }, [dbSymptoms]);

  // Filtrer les symptômes
  const filteredSymptoms = useMemo(() => {
    let filtered = allSymptoms;

    if (searchFilter) {
      const filter = searchFilter.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(filter) ||
        s.body_system?.toLowerCase().includes(filter)
      );
    }

    if (selectedSystem !== 'all') {
      filtered = filtered.filter(s => s.body_system === selectedSystem);
    }

    return filtered;
  }, [allSymptoms, searchFilter, selectedSystem]);

  // Grouper par système
  const groupedSymptoms = useMemo(() => {
    return filteredSymptoms.reduce((acc, symptom) => {
      const system = symptom.body_system || 'Autre';
      if (!acc[system]) acc[system] = [];
      acc[system].push(symptom);
      return acc;
    }, {} as Record<string, Symptom[]>);
  }, [filteredSymptoms]);

  const toggleSymptom = (symptom: Symptom) => {
    const isSelected = selectedSymptoms.includes(symptom.id);

    if (isSelected) {
      setSelectedSymptoms(prev => prev.filter(id => id !== symptom.id));
      setSelectedSymptomNames(prev => prev.filter(name => name !== symptom.name));
    } else {
      setSelectedSymptoms(prev => [...prev, symptom.id]);
      setSelectedSymptomNames(prev => [...prev, symptom.name]);
    }
  };

  const clearSelection = () => {
    setSelectedSymptoms([]);
    setSelectedSymptomNames([]);
    setResults([]);
    setHasSearched(false);
  };

  const handleSearch = async () => {
    if (selectedSymptoms.length === 0) return;

    setLoading(true);
    setHasSearched(true);

    try {
      // Filtrer seulement les symptômes de la base de données
      const dbSymptomIds = selectedSymptoms.filter(id => !id.startsWith('common-'));

      if (dbSymptomIds.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const { data: links } = await supabase
        .from('pathology_symptoms')
        .select(`
          pathology_id,
          frequency_percent,
          symptom_id,
          pathologies(*)
        `)
        .in('symptom_id', dbSymptomIds);

      if (links) {
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
      case 'mild': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'moderate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'severe': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
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
    return allSymptoms.find(s => s.id === id)?.name || '';
  };

  // Obtenir uniquement les IDs des symptômes de la base de données pour la recherche
  const dbSelectedSymptomIds = selectedSymptoms.filter(id => !id.startsWith('common-'));

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
              <SearchIcon className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
              <span className="hidden sm:inline">Recherche Avancée par</span> Symptômes
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 hidden sm:block">
              Sélectionnez les symptômes observés pour identifier les pathologies possibles avec la Deep Research IA
            </p>
          </div>
          <Button
            onClick={() => setQuestionnaireOpen(true)}
            className="bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 touch-manipulation w-full sm:w-auto text-sm sm:text-base"
          >
            <MessageCircle className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Assistant de</span> symptômes
          </Button>
        </div>

        {/* Questionnaire Modal */}
        <SymptomQuestionnaireModal
          open={questionnaireOpen}
          onOpenChange={setQuestionnaireOpen}
          onComplete={handleQuestionnaireComplete}
        />

        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Panneau de sélection des symptômes */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-24">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Symptômes</span>
                  {selectedSymptoms.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearSelection}>
                      <X className="h-4 w-4 mr-1" />
                      Effacer
                    </Button>
                  )}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>{selectedSymptoms.length} sélectionné(s)</span>
                  <span className="text-xs">•</span>
                  <span className="text-xs">{allSymptoms.length} symptômes disponibles</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Filtre de recherche local */}
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filtrer les symptômes locaux..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* NCBI Search Panel */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Globe className="h-4 w-4" />
                    Recherche NCBI MeSH
                  </div>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un symptôme (anglais)..."
                      value={ncbiSearchQuery}
                      onChange={(e) => setNcbiSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                    {ncbiLoading && (
                      <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                  {ncbiResults.length > 0 && (
                    <ScrollArea className="h-[120px]">
                      <div className="space-y-1">
                        {ncbiResults.map((symptom) => (
                          <div key={symptom.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                            <Checkbox
                              id={symptom.id}
                              checked={selectedSymptoms.includes(symptom.id)}
                              onCheckedChange={() => toggleSymptom(symptom)}
                            />
                            <Label
                              htmlFor={symptom.id}
                              className="text-sm cursor-pointer leading-relaxed flex items-center gap-1.5 flex-1"
                            >
                              {symptom.name}
                              <Globe className="h-3 w-3 text-primary" />
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  {ncbiSearchQuery.length >= 2 && !ncbiLoading && ncbiResults.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Aucun résultat NCBI</p>
                  )}
                </div>

                {/* Filtre par système */}
                <ScrollArea className="w-full">
                  <div className="flex gap-1 pb-2">
                    <Badge
                      variant={selectedSystem === 'all' ? 'default' : 'outline'}
                      className="cursor-pointer whitespace-nowrap"
                      onClick={() => setSelectedSystem('all')}
                    >
                      Tous
                    </Badge>
                    {BODY_SYSTEMS.map((system) => (
                      <Badge
                        key={system}
                        variant={selectedSystem === system ? 'default' : 'outline'}
                        className="cursor-pointer whitespace-nowrap"
                        onClick={() => setSelectedSystem(system)}
                      >
                        {system}
                      </Badge>
                    ))}
                  </div>
                </ScrollArea>

                {/* Liste des symptômes */}
                <ScrollArea className="h-[350px] pr-4">
                  <div className="space-y-4">
                    {Object.entries(groupedSymptoms).map(([system, systemSymptoms]) => (
                      <div key={system}>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2 sticky top-0 bg-card py-1">
                          {system} ({systemSymptoms.length})
                        </h4>
                        <div className="space-y-1.5">
                          {systemSymptoms.map((symptom) => (
                            <div key={symptom.id} className="flex items-center gap-2">
                              <Checkbox
                                id={symptom.id}
                                checked={selectedSymptoms.includes(symptom.id)}
                                onCheckedChange={() => toggleSymptom(symptom)}
                              />
                              <Label
                                htmlFor={symptom.id}
                                className="text-sm cursor-pointer leading-relaxed flex items-center gap-1.5 flex-1"
                              >
                                {symptom.name}
                                {symptom.isFromDatabase && (
                                  <Database className="h-3 w-3 text-primary" />
                                )}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Boutons d'action */}
                <div className="space-y-2 pt-2 border-t">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleSearch}
                    disabled={dbSelectedSymptomIds.length === 0 || loading}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {loading ? 'Recherche...' : `Recherche locale (${dbSelectedSymptomIds.length})`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Résultats */}
          <div className="lg:col-span-2 space-y-4">
            {/* Deep Research Panel */}
            <DeepResearchPanel
              selectedSymptomIds={dbSelectedSymptomIds}
              selectedSymptomNames={selectedSymptomNames}
            />

            {/* Résultats de la recherche locale */}
            <Tabs defaultValue="results" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="results" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Base locale ({results.length})
                </TabsTrigger>
                <TabsTrigger value="selected" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Symptômes ({selectedSymptoms.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="results" className="space-y-4 mt-4">
                {!hasSearched ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">Prêt à diagnostiquer</h3>
                      <p className="text-muted-foreground">
                        Sélectionnez des symptômes puis utilisez la Deep Research IA ou la recherche locale
                      </p>
                    </CardContent>
                  </Card>
                ) : results.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">Aucun résultat local</h3>
                      <p className="text-muted-foreground">
                        Utilisez la Deep Research IA pour une recherche plus approfondie incluant la littérature médicale
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
                    <ScrollArea className="h-[calc(100vh-400px)] min-h-[300px] pr-4">
                      <div className="space-y-4">
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
                      </div>
                    </ScrollArea>
                  </>
                )}
              </TabsContent>

              <TabsContent value="selected" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Symptômes sélectionnés</CardTitle>
                    <CardDescription>
                      Liste des symptômes que vous avez sélectionnés pour l'analyse
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedSymptomNames.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        Aucun symptôme sélectionné
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedSymptomNames.map((name, index) => {
                          const symptom = allSymptoms.find(s => s.name === name);
                          return (
                            <Badge key={index} variant="secondary" className="text-sm py-1.5 px-3">
                              {name}
                              {symptom?.isFromDatabase && (
                                <Database className="h-3 w-3 ml-1.5 text-primary" />
                              )}
                              <button
                                onClick={() => symptom && toggleSymptom(symptom)}
                                className="ml-2 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Search;
