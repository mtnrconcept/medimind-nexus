import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Globe, 
  Search, 
  Database, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  MapPin,
  Play,
  Pause,
  RefreshCw,
  FileText,
  Stethoscope,
  Pill
} from 'lucide-react';

interface ScrapeResult {
  url: string;
  success: boolean;
  stats?: {
    pathologiesAdded: number;
    symptomsAdded: number;
    treatmentsAdded: number;
    linksCreated: number;
  };
  error?: string;
}

interface ScrapingStats {
  pathologiesAdded: number;
  symptomsAdded: number;
  treatmentsAdded: number;
  linksCreated: number;
}

export const MedicalScraperPanel = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [pageLimit, setPageLimit] = useState([50]);
  const [isMapping, setIsMapping] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [logs, setLogs] = useState<ScrapeResult[]>([]);
  const [stats, setStats] = useState<ScrapingStats>({
    pathologiesAdded: 0,
    symptomsAdded: 0,
    treatmentsAdded: 0,
    linksCreated: 0
  });

  const addLog = (result: ScrapeResult) => {
    setLogs(prev => [result, ...prev].slice(0, 100));
  };

  const handleMapSite = async () => {
    if (!url) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer une URL",
        variant: "destructive"
      });
      return;
    }

    setIsMapping(true);
    setMappedUrls([]);
    setLogs([]);
    setStats({ pathologiesAdded: 0, symptomsAdded: 0, treatmentsAdded: 0, linksCreated: 0 });

    try {
      const { data, error } = await supabase.functions.invoke('medical-scraper', {
        body: {
          action: 'map',
          url,
          options: { limit: pageLimit[0] * 2 }
        }
      });

      if (error) throw error;

      if (data.success) {
        setMappedUrls(data.urls || []);
        toast({
          title: "Mapping terminé",
          description: `${data.urls?.length || 0} pages pertinentes trouvées sur ${data.totalUrls} URLs totales`
        });
      } else {
        throw new Error(data.error || 'Échec du mapping');
      }
    } catch (error: any) {
      console.error('Erreur mapping:', error);
      toast({
        title: "Erreur de mapping",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsMapping(false);
    }
  };

  const scrapeWithRetry = async (scrapeUrl: string, maxRetries = 3): Promise<{ data: any; error: any }> => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('medical-scraper', {
          body: {
            action: 'scrape',
            url: scrapeUrl
          }
        });
        
        if (error) {
          // Si c'est une erreur réseau, on retry
          if (error.message?.includes('Network') || error.message?.includes('500')) {
            lastError = error;
            console.log(`Tentative ${attempt}/${maxRetries} échouée pour ${scrapeUrl}, nouvelle tentative...`);
            await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); // Backoff exponentiel
            continue;
          }
          return { data: null, error };
        }
        
        return { data, error: null };
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        }
      }
    }
    return { data: null, error: lastError };
  };

  const handleStartScraping = async () => {
    if (mappedUrls.length === 0) {
      toast({
        title: "Aucune URL",
        description: "Veuillez d'abord mapper le site",
        variant: "destructive"
      });
      return;
    }

    setIsScraping(true);
    setIsPaused(false);
    setProgress(0);

    const urlsToScrape = mappedUrls.slice(0, pageLimit[0]);
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < urlsToScrape.length; i++) {
      if (isPaused) break;

      const currentScrapeUrl = urlsToScrape[i];
      setCurrentUrl(currentScrapeUrl);
      setProgress(Math.round(((i + 1) / urlsToScrape.length) * 100));

      try {
        const { data, error } = await scrapeWithRetry(currentScrapeUrl);

        if (error) throw error;

        const result: ScrapeResult = {
          url: currentScrapeUrl,
          success: data?.success ?? false,
          stats: data?.stats
        };

        addLog(result);
        successCount++;

        if (data?.stats) {
          setStats(prev => ({
            pathologiesAdded: prev.pathologiesAdded + (data.stats.pathologiesAdded || 0),
            symptomsAdded: prev.symptomsAdded + (data.stats.symptomsAdded || 0),
            treatmentsAdded: prev.treatmentsAdded + (data.stats.treatmentsAdded || 0),
            linksCreated: prev.linksCreated + (data.stats.linksCreated || 0)
          }));
        }
      } catch (error: any) {
        console.error(`Erreur scraping ${currentScrapeUrl}:`, error);
        failCount++;
        addLog({
          url: currentScrapeUrl,
          success: false,
          error: error.message || 'Erreur réseau - réessayez plus tard'
        });
      }

      // Pause entre les requêtes pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 2500));
    }

    setIsScraping(false);
    setCurrentUrl('');
    toast({
      title: "Scraping terminé",
      description: `${successCount} réussis, ${failCount} échecs. ${stats.pathologiesAdded} pathologies ajoutées.`
    });
  };

  const handlePauseScraping = () => {
    setIsPaused(true);
    setIsScraping(false);
  };

  const handleReset = () => {
    setMappedUrls([]);
    setLogs([]);
    setProgress(0);
    setStats({ pathologiesAdded: 0, symptomsAdded: 0, treatmentsAdded: 0, linksCreated: 0 });
    setCurrentUrl('');
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Configuration du scraping
          </CardTitle>
          <CardDescription>
            Configurez l'URL du site médical à scraper et les options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">URL de départ</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Collez n'importe quelle URL de site médical (ex: https://example.com)"
              disabled={isScraping}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Limite de pages : {pageLimit[0]}
            </label>
            <Slider
              value={pageLimit}
              onValueChange={setPageLimit}
              min={10}
              max={200}
              step={10}
              disabled={isScraping}
            />
            <p className="text-xs text-muted-foreground">
              Nombre maximum de pages à scraper
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleMapSite} 
              disabled={isMapping || isScraping}
              variant="outline"
            >
              {isMapping ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mapping...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Mapper le site
                </>
              )}
            </Button>

            {mappedUrls.length > 0 && !isScraping && (
              <Button onClick={handleStartScraping}>
                <Play className="mr-2 h-4 w-4" />
                Lancer le scraping ({Math.min(pageLimit[0], mappedUrls.length)} pages)
              </Button>
            )}

            {isScraping && (
              <Button onClick={handlePauseScraping} variant="secondary">
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            )}

            <Button onClick={handleReset} variant="ghost" disabled={isScraping}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* URLs mappées */}
      {mappedUrls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              URLs découvertes
              <Badge variant="secondary">{mappedUrls.length} pages</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-1">
                {mappedUrls.slice(0, 50).map((mappedUrl, index) => (
                  <div 
                    key={index} 
                    className="text-xs text-muted-foreground truncate hover:text-foreground"
                    title={mappedUrl}
                  >
                    {mappedUrl}
                  </div>
                ))}
                {mappedUrls.length > 50 && (
                  <div className="text-xs text-muted-foreground italic">
                    ... et {mappedUrls.length - 50} autres URLs
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Progression */}
      {(isScraping || progress > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Progression
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progression</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>

            {currentUrl && (
              <div className="text-sm text-muted-foreground truncate">
                <Loader2 className="inline mr-2 h-3 w-3 animate-spin" />
                {currentUrl}
              </div>
            )}

            {/* Statistiques */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <FileText className="h-5 w-5 mx-auto mb-1 text-primary" />
                <div className="text-2xl font-bold">{stats.pathologiesAdded}</div>
                <div className="text-xs text-muted-foreground">Pathologies</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Stethoscope className="h-5 w-5 mx-auto mb-1 text-primary" />
                <div className="text-2xl font-bold">{stats.symptomsAdded}</div>
                <div className="text-xs text-muted-foreground">Symptômes</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Pill className="h-5 w-5 mx-auto mb-1 text-primary" />
                <div className="text-2xl font-bold">{stats.treatmentsAdded}</div>
                <div className="text-xs text-muted-foreground">Traitements</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Database className="h-5 w-5 mx-auto mb-1 text-primary" />
                <div className="text-2xl font-bold">{stats.linksCreated}</div>
                <div className="text-xs text-muted-foreground">Liens créés</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journal des opérations */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Journal des opérations</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`flex items-start gap-2 p-2 rounded text-sm ${
                      log.success ? 'bg-green-500/10' : 'bg-destructive/10'
                    }`}
                  >
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-mono text-xs" title={log.url}>
                        {log.url}
                      </div>
                      {log.success && log.stats && (
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {log.stats.pathologiesAdded > 0 && (
                            <Badge variant="outline" className="text-xs">
                              +{log.stats.pathologiesAdded} pathologie
                            </Badge>
                          )}
                          {log.stats.symptomsAdded > 0 && (
                            <Badge variant="outline" className="text-xs">
                              +{log.stats.symptomsAdded} symptômes
                            </Badge>
                          )}
                          {log.stats.treatmentsAdded > 0 && (
                            <Badge variant="outline" className="text-xs">
                              +{log.stats.treatmentsAdded} traitements
                            </Badge>
                          )}
                        </div>
                      )}
                      {log.error && (
                        <div className="text-xs text-destructive mt-1">
                          {log.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
