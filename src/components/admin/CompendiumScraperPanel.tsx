import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { 
  Tablets, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download,
  MapPin,
  TestTube,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

// URLs de test prédéfinies
const TEST_URLS = [
  'https://compendium.ch/product/1122930-ultratechnekow-fm-generateur-25-8-gbq/mpro',
  'https://compendium.ch/product/1122929-ultratechnekow-fm-generateur-30-1-gbq/mpro',
  'https://compendium.ch/product/1122928-ultratechnekow-fm-generateur-34-4-gbq/mpro',
  'https://compendium.ch/product/1122927-ultratechnekow-fm-generateur-43-gbq/mpro',
  'https://compendium.ch/product/1553866-ultravist-sol-inj-150-mg-ml-50ml/mpro'
];

interface ScrapeResult {
  url: string;
  success: boolean;
  stats?: {
    medicationsAdded: number;
    sideEffectsAdded: number;
    interactionsAdded: number;
    contraindicationsAdded: number;
  };
  error?: string;
}

const CompendiumScraperPanel = () => {
  const [mapping, setMapping] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [testing, setTesting] = useState(false);
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [manualUrls, setManualUrls] = useState('');
  const [totalStats, setTotalStats] = useState({
    medicationsAdded: 0,
    sideEffectsAdded: 0,
    interactionsAdded: 0,
    contraindicationsAdded: 0
  });

  const mapCompendium = async () => {
    setMapping(true);
    setMappedUrls([]);
    
    try {
      const { data, error } = await supabase.functions.invoke('medical-scraper', {
        body: {
          action: 'map-compendium',
          url: 'https://compendium.ch/fr/product',
          options: { limit: 200 }
        }
      });

      if (error) throw error;

      if (data.rateLimited) {
        toast.error('Crédits Firecrawl insuffisants - vérifiez votre quota');
        return;
      }

      if (data.success && data.urls) {
        setMappedUrls(data.urls);
        toast.success(`${data.urls.length} URLs de médicaments découvertes`);
      } else {
        toast.error(data.error || 'Erreur lors du mapping');
      }
    } catch (err: any) {
      console.error('Erreur mapping:', err);
      toast.error(err.message || 'Erreur lors du mapping Compendium');
    } finally {
      setMapping(false);
    }
  };

  const startScraping = async () => {
    if (mappedUrls.length === 0) {
      toast.error('Mappez d\'abord les URLs');
      return;
    }

    setScraping(true);
    setResults([]);
    setProgress(0);
    setTotalStats({ medicationsAdded: 0, sideEffectsAdded: 0, interactionsAdded: 0, contraindicationsAdded: 0 });

    // Scraper par lots de 5 pour éviter le timeout
    const batchSize = 5;
    const newResults: ScrapeResult[] = [];
    const newStats = { ...totalStats };

    for (let i = 0; i < mappedUrls.length; i += batchSize) {
      const batch = mappedUrls.slice(i, i + batchSize);
      
      try {
        const { data, error } = await supabase.functions.invoke('medical-scraper', {
          body: {
            action: 'batch-medications',
            urls: batch
          }
        });

        if (error) throw error;

        if (data.results) {
          newResults.push(...data.results);
          
          // Mise à jour des stats
          if (data.totalStats) {
            newStats.medicationsAdded += data.totalStats.medicationsAdded || 0;
            newStats.sideEffectsAdded += data.totalStats.sideEffectsAdded || 0;
            newStats.interactionsAdded += data.totalStats.interactionsAdded || 0;
            newStats.contraindicationsAdded += data.totalStats.contraindicationsAdded || 0;
          }
        }

        // Arrêter si rate limited
        if (data.results?.some((r: ScrapeResult) => r.error?.includes('rate limit') || r.error?.includes('402'))) {
          toast.warning('Rate limit atteint - scraping arrêté');
          break;
        }
      } catch (err: any) {
        console.error('Erreur batch:', err);
        batch.forEach(url => {
          newResults.push({ url, success: false, error: err.message });
        });
      }

      setResults([...newResults]);
      setTotalStats({ ...newStats });
      setProgress(Math.round((Math.min(i + batchSize, mappedUrls.length) / mappedUrls.length) * 100));
    }

    setScraping(false);
    toast.success(`Scraping terminé: ${newStats.medicationsAdded} médicaments ajoutés`);
  };

  // Test avec URLs spécifiques
  const testWithUrls = async (urls: string[]) => {
    if (urls.length === 0) {
      toast.error('Aucune URL à tester');
      return;
    }

    setTesting(true);
    setResults([]);
    setTotalStats({ medicationsAdded: 0, sideEffectsAdded: 0, interactionsAdded: 0, contraindicationsAdded: 0 });

    const newResults: ScrapeResult[] = [];
    const newStats = { medicationsAdded: 0, sideEffectsAdded: 0, interactionsAdded: 0, contraindicationsAdded: 0 };

    try {
      const { data, error } = await supabase.functions.invoke('medical-scraper', {
        body: {
          action: 'batch-medications',
          urls: urls
        }
      });

      if (error) throw error;

      if (data.results) {
        newResults.push(...data.results);
        
        if (data.totalStats) {
          newStats.medicationsAdded = data.totalStats.medicationsAdded || 0;
          newStats.sideEffectsAdded = data.totalStats.sideEffectsAdded || 0;
          newStats.interactionsAdded = data.totalStats.interactionsAdded || 0;
          newStats.contraindicationsAdded = data.totalStats.contraindicationsAdded || 0;
        }
      }

      setResults(newResults);
      setTotalStats(newStats);
      toast.success(`Test terminé: ${newStats.medicationsAdded} médicaments ajoutés`);
    } catch (err: any) {
      console.error('Erreur test:', err);
      toast.error(err.message || 'Erreur lors du test');
    } finally {
      setTesting(false);
    }
  };

  // Ajouter URLs manuelles aux URLs mappées
  const addManualUrls = () => {
    const urls = manualUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('https://compendium.ch'));
    
    if (urls.length === 0) {
      toast.error('Aucune URL Compendium valide trouvée');
      return;
    }

    setMappedUrls(prev => [...new Set([...prev, ...urls])]);
    setManualUrls('');
    toast.success(`${urls.length} URLs ajoutées`);
  };

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tablets className="h-5 w-5 text-orange-500" />
          Scraper Compendium.ch
        </CardTitle>
        <CardDescription>
          Importez les médicaments, effets secondaires, interactions et contre-indications depuis Compendium.ch
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test rapide avec URLs prédéfinies */}
        <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <TestTube className="h-4 w-4 text-blue-500" />
              Test rapide (5 URLs prédéfinies)
            </p>
            <Button 
              size="sm"
              onClick={() => testWithUrls(TEST_URLS)}
              disabled={testing || scraping || mapping}
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Test en cours...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Lancer le test
                </>
              )}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {TEST_URLS.map((url, i) => (
              <div key={i} className="truncate">{url.split('/').pop()?.replace('/mpro', '')}</div>
            ))}
          </div>
        </div>

        {/* Saisie manuelle d'URLs */}
        <div className="space-y-2">
          <p className="text-sm font-medium">URLs manuelles</p>
          <Textarea
            placeholder="Collez des URLs Compendium.ch (une par ligne)&#10;Exemple: https://compendium.ch/product/1234567-nom-medicament/mpro"
            value={manualUrls}
            onChange={(e) => setManualUrls(e.target.value)}
            rows={3}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={addManualUrls}
              disabled={!manualUrls.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              Ajouter aux URLs
            </Button>
            <Button 
              size="sm"
              onClick={() => {
                const urls = manualUrls
                  .split('\n')
                  .map(u => u.trim())
                  .filter(u => u.startsWith('https://compendium.ch'));
                testWithUrls(urls);
              }}
              disabled={!manualUrls.trim() || testing || scraping}
            >
              <TestTube className="h-4 w-4 mr-1" />
              Tester ces URLs
            </Button>
          </div>
        </div>

        {/* Actions mapping/scraping */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={mapCompendium} 
            disabled={mapping || scraping || testing}
            variant="outline"
          >
            {mapping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mapping en cours...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                Mapper les URLs ({mappedUrls.length})
              </>
            )}
          </Button>

          <Button 
            onClick={startScraping} 
            disabled={scraping || mapping || testing || mappedUrls.length === 0}
          >
            {scraping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scraping... ({progress}%)
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Lancer le scraping
              </>
            )}
          </Button>
        </div>

        {/* Progression */}
        {scraping && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {results.length} / {mappedUrls.length} URLs traitées
            </p>
          </div>
        )}

        {/* Statistiques */}
        {(totalStats.medicationsAdded > 0 || results.length > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold text-orange-500">{totalStats.medicationsAdded}</p>
              <p className="text-xs text-muted-foreground">Médicaments</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold text-red-500">{totalStats.sideEffectsAdded}</p>
              <p className="text-xs text-muted-foreground">Effets secondaires</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold text-yellow-500">{totalStats.interactionsAdded}</p>
              <p className="text-xs text-muted-foreground">Interactions</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold text-purple-500">{totalStats.contraindicationsAdded}</p>
              <p className="text-xs text-muted-foreground">Contre-indications</p>
            </div>
          </div>
        )}

        {/* Résumé des résultats */}
        {results.length > 0 && (
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {successCount} succès
            </Badge>
            <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400">
              <XCircle className="h-3 w-3 mr-1" />
              {errorCount} erreurs
            </Badge>
          </div>
        )}

        {/* Liste des URLs mappées */}
        {mappedUrls.length > 0 && !scraping && results.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">URLs découvertes ({mappedUrls.length})</p>
            <ScrollArea className="h-40 border rounded-lg p-2">
              <div className="space-y-1">
                {mappedUrls.slice(0, 50).map((url, i) => (
                  <p key={i} className="text-xs text-muted-foreground truncate" title={url}>
                    {url}
                  </p>
                ))}
                {mappedUrls.length > 50 && (
                  <p className="text-xs text-muted-foreground italic">
                    ... et {mappedUrls.length - 50} autres URLs
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Détails des résultats */}
        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Détails du scraping</p>
            <ScrollArea className="h-40 border rounded-lg p-2">
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.success ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    )}
                    <span className="truncate flex-1" title={r.url}>
                      {r.url.split('/').pop()}
                    </span>
                    {r.stats && (
                      <span className="text-muted-foreground">
                        +{r.stats.medicationsAdded} med
                      </span>
                    )}
                    {r.error && (
                      <span className="text-red-500 truncate max-w-[150px]" title={r.error}>
                        {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Avertissement crédits */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-yellow-700 dark:text-yellow-400">Attention aux crédits Firecrawl</p>
            <p>Le scraping consomme des crédits Firecrawl. Vérifiez votre quota avant de lancer un scraping massif.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CompendiumScraperPanel;
