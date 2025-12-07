import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Pill,
  Clock,
  AlertTriangle
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
  rateLimited?: boolean;
}

interface ScrapingStats {
  pathologiesAdded: number;
  symptomsAdded: number;
  treatmentsAdded: number;
  linksCreated: number;
}

type RateLimitMode = 'slow' | 'normal' | 'fast';

const RATE_LIMIT_DELAYS: Record<RateLimitMode, number> = {
  slow: 15000,    // 15 secondes - très prudent
  normal: 8000,   // 8 secondes - équilibré
  fast: 4000      // 4 secondes - risqué
};

const RATE_LIMIT_LABELS: Record<RateLimitMode, string> = {
  slow: 'Prudent (15s)',
  normal: 'Normal (8s)',
  fast: 'Rapide (4s)'
};

const SCRAPED_URLS_KEY = 'medical_scraper_scraped_urls';

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
  const [rateLimitMode, setRateLimitMode] = useState<RateLimitMode>('normal');
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [scrapedUrls, setScrapedUrls] = useState<Set<string>>(new Set());
  const [rateLimitHits, setRateLimitHits] = useState(0);

  // Charger les URLs déjà scrapées
  useEffect(() => {
    const saved = localStorage.getItem(SCRAPED_URLS_KEY);
    if (saved) {
      try {
        setScrapedUrls(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error('Erreur chargement URLs scrapées:', e);
      }
    }
  }, []);

  // Sauvegarder les URLs scrapées
  const saveScrapedUrl = (url: string) => {
    setScrapedUrls(prev => {
      const newSet = new Set(prev);
      newSet.add(url);
      localStorage.setItem(SCRAPED_URLS_KEY, JSON.stringify([...newSet]));
      return newSet;
    });
  };

  // Calculer le temps estimé
  useEffect(() => {
    if (mappedUrls.length > 0) {
      const urlsToProcess = mappedUrls.filter(u => !scrapedUrls.has(u)).slice(0, pageLimit[0]);
      const delayPerUrl = RATE_LIMIT_DELAYS[rateLimitMode];
      const totalSeconds = (urlsToProcess.length * delayPerUrl) / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.round(totalSeconds % 60);
      setEstimatedTime(minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`);
    }
  }, [mappedUrls, pageLimit, rateLimitMode, scrapedUrls]);

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
    setRateLimitHits(0);

    try {
      const { data, error } = await supabase.functions.invoke('medical-scraper', {
        body: {
          action: 'map',
          url,
          options: { limit: pageLimit[0] * 2 }
        }
      });

      if (error) throw error;

      if (data.rateLimited) {
        toast({
          title: "Rate limit atteint",
          description: "Veuillez patienter quelques minutes avant de réessayer",
          variant: "destructive"
        });
        return;
      }

      if (data.success) {
        // Filtrer les URLs déjà scrapées
        const newUrls = (data.urls || []).filter((u: string) => !scrapedUrls.has(u));
        const skippedCount = (data.urls?.length || 0) - newUrls.length;
        
        setMappedUrls(newUrls);
        toast({
          title: "Mapping terminé",
          description: `${newUrls.length} nouvelles pages trouvées${skippedCount > 0 ? ` (${skippedCount} déjà scrapées)` : ''}`
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

  const scrapeWithRetry = async (scrapeUrl: string, maxRetries = 3): Promise<{ data: any; error: any; rateLimited?: boolean }> => {
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
          const errorMessage = error.message || '';
          
          // Erreur 429 - rate limit
          if (errorMessage.includes('429') || errorMessage.includes('rate limit') || data?.rateLimited) {
            const waitTime = 30000 * attempt; // 30s, 60s, 90s
            console.log(`Rate limit détecté, attente ${waitTime/1000}s...`);
            setRateLimitHits(prev => prev + 1);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          
          // Erreur réseau
          if (errorMessage.includes('Network') || errorMessage.includes('500')) {
            lastError = error;
            console.log(`Tentative ${attempt}/${maxRetries} échouée pour ${scrapeUrl}`);
            await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
            continue;
          }
          
          return { data: null, error };
        }
        
        // Vérifier si la réponse contient rateLimited
        if (data?.rateLimited) {
          const waitTime = 30000 * attempt;
          console.log(`Rate limit dans la réponse, attente ${waitTime/1000}s...`);
          setRateLimitHits(prev => prev + 1);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        return { data, error: null };
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
        }
      }
    }
    return { data: null, error: lastError, rateLimited: true };
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
    setRateLimitHits(0);

    // Filtrer les URLs déjà scrapées
    const urlsToScrape = mappedUrls
      .filter(u => !scrapedUrls.has(u))
      .slice(0, pageLimit[0]);
    
    let successCount = 0;
    let failCount = 0;
    let localStats = { ...stats };
    
    for (let i = 0; i < urlsToScrape.length; i++) {
      if (isPaused) break;

      const currentScrapeUrl = urlsToScrape[i];
      setCurrentUrl(currentScrapeUrl);
      setProgress(Math.round(((i + 1) / urlsToScrape.length) * 100));

      try {
        const { data, error, rateLimited } = await scrapeWithRetry(currentScrapeUrl);

        if (rateLimited) {
          // Trop de rate limits, basculer en mode prudent
          if (rateLimitMode !== 'slow') {
            setRateLimitMode('slow');
            toast({
              title: "Mode prudent activé",
              description: "Rate limit détecté, passage en mode lent automatique",
            });
          }
          failCount++;
          addLog({
            url: currentScrapeUrl,
            success: false,
            error: 'Rate limit - sera réessayé plus tard',
            rateLimited: true
          });
          continue;
        }

        if (error) throw error;

        const result: ScrapeResult = {
          url: currentScrapeUrl,
          success: data?.success ?? false,
          stats: data?.stats
        };

        addLog(result);
        successCount++;
        saveScrapedUrl(currentScrapeUrl);

        if (data?.stats) {
          localStats = {
            pathologiesAdded: localStats.pathologiesAdded + (data.stats.pathologiesAdded || 0),
            symptomsAdded: localStats.symptomsAdded + (data.stats.symptomsAdded || 0),
            treatmentsAdded: localStats.treatmentsAdded + (data.stats.treatmentsAdded || 0),
            linksCreated: localStats.linksCreated + (data.stats.linksCreated || 0)
          };
          setStats(localStats);
        }
      } catch (error: any) {
        console.error(`Erreur scraping ${currentScrapeUrl}:`, error);
        failCount++;
        addLog({
          url: currentScrapeUrl,
          success: false,
          error: error.message || 'Erreur réseau'
        });
      }

      // Pause entre les requêtes selon le mode
      const delay = RATE_LIMIT_DELAYS[rateLimitMode];
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    setIsScraping(false);
    setCurrentUrl('');
    toast({
      title: "Scraping terminé",
      description: `${successCount} réussis, ${failCount} échecs. ${localStats.pathologiesAdded} pathologies ajoutées.`
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
    setRateLimitHits(0);
  };

  const handleClearCache = () => {
    localStorage.removeItem(SCRAPED_URLS_KEY);
    setScrapedUrls(new Set());
    toast({
      title: "Cache vidé",
      description: "L'historique des URLs scrapées a été effacé"
    });
  };

  const newUrlsCount = mappedUrls.filter(u => !scrapedUrls.has(u)).length;

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mode rate limit</label>
              <Select 
                value={rateLimitMode} 
                onValueChange={(v) => setRateLimitMode(v as RateLimitMode)}
                disabled={isScraping}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">{RATE_LIMIT_LABELS.slow}</SelectItem>
                  <SelectItem value="normal">{RATE_LIMIT_LABELS.normal}</SelectItem>
                  <SelectItem value="fast">{RATE_LIMIT_LABELS.fast}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Plus lent = moins de risque d'erreurs 429
              </p>
            </div>
          </div>

          {mappedUrls.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
              <Clock className="h-4 w-4" />
              Temps estimé : {estimatedTime} pour {Math.min(pageLimit[0], newUrlsCount)} pages
            </div>
          )}

          {rateLimitHits > 0 && (
            <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 p-2 rounded">
              <AlertTriangle className="h-4 w-4" />
              {rateLimitHits} rate limit(s) détecté(s) - considérez le mode prudent
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
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
              <Button onClick={handleStartScraping} disabled={newUrlsCount === 0}>
                <Play className="mr-2 h-4 w-4" />
                Scraper ({Math.min(pageLimit[0], newUrlsCount)} nouvelles pages)
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

            {scrapedUrls.size > 0 && (
              <Button onClick={handleClearCache} variant="ghost" size="sm" disabled={isScraping}>
                Vider cache ({scrapedUrls.size} URLs)
              </Button>
            )}
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
              {scrapedUrls.size > 0 && (
                <Badge variant="outline">{newUrlsCount} nouvelles</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-1">
                {mappedUrls.slice(0, 50).map((mappedUrl, index) => (
                  <div 
                    key={index} 
                    className={`text-xs truncate hover:text-foreground flex items-center gap-1 ${
                      scrapedUrls.has(mappedUrl) ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'
                    }`}
                    title={mappedUrl}
                  >
                    {scrapedUrls.has(mappedUrl) && <CheckCircle2 className="h-3 w-3 text-green-500" />}
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
                      log.success ? 'bg-green-500/10' : log.rateLimited ? 'bg-yellow-500/10' : 'bg-destructive/10'
                    }`}
                  >
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : log.rateLimited ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
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
                        <div className={`text-xs mt-1 ${log.rateLimited ? 'text-yellow-600' : 'text-destructive'}`}>
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
