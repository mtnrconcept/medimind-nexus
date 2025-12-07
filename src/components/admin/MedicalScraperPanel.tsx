import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  AlertTriangle,
  Tablets,
  TestTube,
  Plus,
  FileSpreadsheet,
  Upload,
  ArrowRight,
  Table,
} from "lucide-react";

// --- TYPES & CONFIGURATION SCRAPER ---
type ScraperMode = "pathologies" | "medications";
type RateLimitMode = "slow" | "normal" | "fast";

interface ScrapeResult {
  url: string;
  success: boolean;
  stats?: {
    pathologiesAdded?: number;
    symptomsAdded?: number;
    treatmentsAdded?: number;
    linksCreated?: number;
    medicationsAdded?: number;
    sideEffectsAdded?: number;
    interactionsAdded?: number;
    contraindicationsAdded?: number;
  };
  error?: string;
  rateLimited?: boolean;
}

interface ScrapingStats {
  pathologiesAdded: number;
  symptomsAdded: number;
  treatmentsAdded: number;
  linksCreated: number;
  medicationsAdded: number;
  sideEffectsAdded: number;
  interactionsAdded: number;
  contraindicationsAdded: number;
}

const RATE_LIMIT_DELAYS: Record<RateLimitMode, number> = {
  slow: 45000,
  normal: 25000,
  fast: 12000,
};

const SCRAPED_URLS_KEY = "medical_scraper_scraped_urls";

// URLs de test
const TEST_MEDICATION_URLS = [
  "https://compendium.ch/product/1225565-similasan-insektenstiche-glob/mpro",
  "https://compendium.ch/product/1122930-ultratechnekow-fm-generateur-25-8-gbq/mpro",
  "https://compendium.ch/product/1553866-ultravist-sol-inj-150-mg-ml-50ml/mpro",
];

const initialScraperStats: ScrapingStats = {
  pathologiesAdded: 0,
  symptomsAdded: 0,
  treatmentsAdded: 0,
  linksCreated: 0,
  medicationsAdded: 0,
  sideEffectsAdded: 0,
  interactionsAdded: 0,
  contraindicationsAdded: 0,
};

// --- CONFIGURATION IMPORTATEUR CSV ---
const COLUMN_MAPPINGS: Record<string, string[]> = {
  swissmedic_number: ["Zulassungs-Nr.", "No d'autorisation", "swissmedic", "number", "id"],
  name: ["Arzneimittel", "Médicament", "Name", "Product", "Präparat"],
  manufacturer: ["Zulassungsinhaberin", "Titulaire de l'autorisation", "Firm", "Company"],
  atc_code: ["ATC-Code", "Code ATC", "atc"],
  substance: ["Wirkstoffe", "Principes actifs", "Substances", "Composition"],
  indications: ["Indikation", "Indication", "Anwendungsgebiet"],
  authorization_date: ["Zulassungsdatum", "Date d'autorisation", "Date"],
  validity_date: ["Gültigkeitsdatum", "Date de validité", "Expiry"],
};

interface ImportLog {
  status: "success" | "error" | "info";
  message: string;
  details?: string;
}

export const MedicalScraperPanel = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("scraper");

  // ==========================================
  // ÉTAT DU SCRAPER WEB
  // ==========================================
  const [scraperMode, setScraperMode] = useState<ScraperMode>("pathologies");
  const [url, setUrl] = useState("");
  const [manualUrls, setManualUrls] = useState("");
  const [pageLimit, setPageLimit] = useState([50]);
  const [isMapping, setIsMapping] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [scraperProgress, setScraperProgress] = useState(0);
  const [currentUrl, setCurrentUrl] = useState("");
  const [scraperLogs, setScraperLogs] = useState<ScrapeResult[]>([]);
  const [scraperStats, setScraperStats] = useState<ScrapingStats>(initialScraperStats);
  const [rateLimitMode, setRateLimitMode] = useState<RateLimitMode>("normal");
  const [scrapedUrls, setScrapedUrls] = useState<Set<string>>(new Set());
  const [rateLimitHits, setRateLimitHits] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<string>("");

  // ==========================================
  // ÉTAT DE L'IMPORTATEUR CSV
  // ==========================================
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [mappedHeaders, setMappedHeaders] = useState<Record<string, string>>({});

  // ------------------------------------------------------------------
  // LOGIQUE SCRAPER WEB
  // ------------------------------------------------------------------

  useEffect(() => {
    const saved = localStorage.getItem(SCRAPED_URLS_KEY);
    if (saved) {
      try {
        setScrapedUrls(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const saveScrapedUrl = (scrapedUrl: string) => {
    setScrapedUrls((prev) => {
      const newSet = new Set(prev);
      newSet.add(scrapedUrl);
      localStorage.setItem(SCRAPED_URLS_KEY, JSON.stringify([...newSet]));
      return newSet;
    });
  };

  useEffect(() => {
    if (mappedUrls.length > 0) {
      const urlsToProcess = mappedUrls.filter((u) => !scrapedUrls.has(u)).slice(0, pageLimit[0]);
      const delayPerUrl = RATE_LIMIT_DELAYS[rateLimitMode];
      const totalSeconds = (urlsToProcess.length * delayPerUrl) / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.round(totalSeconds % 60);
      setEstimatedTime(minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`);
    }
  }, [mappedUrls, pageLimit, rateLimitMode, scrapedUrls]);

  const addScraperLog = (result: ScrapeResult) => {
    setScraperLogs((prev) => [result, ...prev].slice(0, 100));
  };

  const handleMapSite = async () => {
    if (!url) {
      toast({ title: "Erreur", description: "Veuillez entrer une URL", variant: "destructive" });
      return;
    }

    setIsMapping(true);
    setMappedUrls([]);
    setScraperLogs([]);
    setScraperStats(initialScraperStats);
    setRateLimitHits(0);

    try {
      const action = scraperMode === "medications" ? "map-compendium" : "map";
      const { data, error } = await supabase.functions.invoke("medical-scraper", {
        body: { action, url, options: { limit: pageLimit[0] * 2 } },
      });

      if (error) throw error;
      if (data.rateLimited) {
        toast({ title: "Rate limit", description: "Attendez quelques minutes", variant: "destructive" });
        return;
      }

      if (data.success) {
        const newUrls = (data.urls || []).filter((u: string) => !scrapedUrls.has(u));
        setMappedUrls(newUrls);
        toast({ title: "Mapping terminé", description: `${newUrls.length} nouvelles pages trouvées` });
      }
    } catch (error: any) {
      toast({ title: "Erreur de mapping", description: error.message, variant: "destructive" });
    } finally {
      setIsMapping(false);
    }
  };

  const scrapeWithRetry = async (scrapeUrl: string, maxRetries = 3) => {
    const action = scraperMode === "medications" ? "scrape-medication" : "scrape";
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("medical-scraper", {
          body: { action, url: scrapeUrl },
        });

        if (error) {
          if (error.message?.includes("429") || data?.rateLimited) {
            await new Promise((r) => setTimeout(r, 60000 * attempt));
            setRateLimitHits((p) => p + 1);
            continue;
          }
          return { data: null, error };
        }
        if (data?.rateLimited) {
          await new Promise((r) => setTimeout(r, 30000 * attempt));
          setRateLimitHits((p) => p + 1);
          continue;
        }
        return { data, error: null };
      } catch (err) {
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 5000 * attempt));
        else return { data: null, error: err, rateLimited: true };
      }
    }
    return { data: null, error: "Max retries", rateLimited: true };
  };

  const handleStartScraping = async (urlsToScrape?: string[]) => {
    const urls = urlsToScrape || mappedUrls.filter((u) => !scrapedUrls.has(u)).slice(0, pageLimit[0]);
    if (urls.length === 0) return;

    setIsScraping(true);
    setIsPaused(false);
    setScraperProgress(0);
    setRateLimitHits(0);

    let localStats = { ...scraperStats };

    for (let i = 0; i < urls.length; i++) {
      if (isPaused) break;
      const current = urls[i];
      setCurrentUrl(current);
      setScraperProgress(Math.round(((i + 1) / urls.length) * 100));

      try {
        const { data, error, rateLimited } = await scrapeWithRetry(current);
        if (rateLimited) {
          addScraperLog({ url: current, success: false, error: "Rate Limit", rateLimited: true });
          continue;
        }
        if (error) throw error;

        addScraperLog({ url: current, success: true, stats: data?.stats });
        saveScrapedUrl(current);

        if (data?.stats) {
          // Mise à jour simplifiée des stats pour la lisibilité
          localStats.medicationsAdded += data.stats.medicationsAdded || 0;
          localStats.pathologiesAdded += data.stats.pathologiesAdded || 0;
          // ... ajouter les autres champs si nécessaire
          setScraperStats({ ...localStats });
        }
      } catch (e: any) {
        addScraperLog({ url: current, success: false, error: e.message });
      }
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAYS[rateLimitMode]));
    }
    setIsScraping(false);
    setCurrentUrl("");
    toast({ title: "Scraping terminé" });
  };

  // ------------------------------------------------------------------
  // LOGIQUE IMPORTATEUR CSV
  // ------------------------------------------------------------------

  const addImportLog = (status: "success" | "error" | "info", message: string, details?: string) => {
    setImportLogs((prev) => [{ status, message, details }, ...prev]);
  };

  const parseCSVLine = (text: string): string[] => {
    const result: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') inQuotes = !inQuotes;
      else if ((char === "," || char === ";") && !inQuotes) {
        result.push(cell.trim());
        cell = "";
      } else cell += char;
    }
    result.push(cell.trim());
    return result;
  };

  const handleFileAnalyze = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportLogs([]);
    setPreviewData([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);

        let headerLineIndex = -1;
        let headers: string[] = [];

        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const lineLower = lines[i].toLowerCase();
          if (lineLower.includes("arzneimittel") || lineLower.includes("médicament") || lineLower.includes("atc")) {
            headerLineIndex = i;
            headers = parseCSVLine(lines[i]).map((h) => h.replace(/['"]/g, "").trim());
            break;
          }
        }

        if (headerLineIndex === -1) throw new Error("Impossible de trouver la ligne d'en-tête");

        const newMapping: Record<string, any> = {};
        Object.entries(COLUMN_MAPPINGS).forEach(([dbCol, possibleNames]) => {
          const index = headers.findIndex((h) =>
            possibleNames.some((name) => h.toLowerCase().includes(name.toLowerCase())),
          );
          if (index !== -1) newMapping[dbCol] = { index, csvName: headers[index] };
        });

        setMappedHeaders(newMapping);
        addImportLog("success", `${Object.keys(newMapping).length} colonnes identifiées.`);

        const preview = [];
        for (let i = headerLineIndex + 1; i < Math.min(headerLineIndex + 6, lines.length); i++) {
          const rawRow = parseCSVLine(lines[i]);
          const rowObj: any = {};
          Object.entries(newMapping).forEach(([dbCol, mapInfo]: [string, any]) => {
            rowObj[dbCol] = rawRow[mapInfo.index]?.replace(/^"|"$/g, "").trim();
          });
          preview.push(rowObj);
        }
        setPreviewData(preview);

        // Stockage temporaire dans window pour l'import
        (window as any).csvDataLines = lines.slice(headerLineIndex + 1);
        (window as any).currentMapping = newMapping;
      } catch (error: any) {
        addImportLog("error", "Erreur analyse", error.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    const dataLines = (window as any).csvDataLines as string[];
    const mapping = (window as any).currentMapping as Record<string, { index: number }>;
    if (!dataLines || !mapping) return;

    setIsImporting(true);
    setImportProgress(0);

    const BATCH_SIZE = 50;
    let processed = 0;
    let successCount = 0;

    try {
      for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
        const batch = dataLines.slice(i, i + BATCH_SIZE);
        const batchData = [];

        for (const line of batch) {
          const rawRow = parseCSVLine(line);
          const rowObj: any = {};
          let isValid = false;

          Object.entries(mapping).forEach(([dbCol, mapInfo]) => {
            let val = rawRow[mapInfo.index]?.replace(/^"|"$/g, "").trim();
            if (val) {
              if (dbCol === "swissmedic_number") {
                val = val.split(" ")[0]; // Nettoyer ID
                if (val.length > 0) isValid = true;
              }
              rowObj[dbCol] = val;
            }
          });

          rowObj.updated_at = new Date().toISOString();
          if (isValid) batchData.push(rowObj);
        }

        if (batchData.length > 0) {
          const { error } = await supabase.from("medications").upsert(batchData, { onConflict: "swissmedic_number" });
          if (error) addImportLog("error", `Erreur batch ${i}`, error.message);
          else successCount += batchData.length;
        }

        processed += batch.length;
        setImportProgress(Math.round((processed / dataLines.length) * 100));
      }
      addImportLog("success", `Import terminé: ${successCount} médicaments.`);
      toast({ title: "Import terminé" });
    } catch (e: any) {
      addImportLog("error", "Erreur critique", e.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Centre de Données Médicales
          </CardTitle>
          <CardDescription>Gérez l'acquisition de données via Scraping Web ou Importation de fichiers</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="scraper" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Scraper Web
              </TabsTrigger>
              <TabsTrigger value="import" className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Import CSV / Excel
              </TabsTrigger>
            </TabsList>

            {/* ============================================================
                ONGLET 1: SCRAPER WEB
               ============================================================ */}
            <TabsContent value="scraper" className="space-y-6">
              {/* Sous-onglets Scraper */}
              <Tabs value={scraperMode} onValueChange={(v) => setScraperMode(v as ScraperMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pathologies">
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Pathologies
                  </TabsTrigger>
                  <TabsTrigger value="medications">
                    <Tablets className="h-4 w-4 mr-2" />
                    Médicaments (Web)
                  </TabsTrigger>
                </TabsList>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL Cible</label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={
                        scraperMode === "medications"
                          ? "https://compendium.ch/fr/product"
                          : "https://site-medical.com/maladies"
                      }
                    />
                  </div>

                  {/* Contrôles du Scraper */}
                  <div className="flex gap-2 flex-wrap bg-muted/30 p-4 rounded-lg border">
                    <Button variant="outline" onClick={handleMapSite} disabled={isScraping || isMapping}>
                      {isMapping ? (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      ) : (
                        <MapPin className="h-4 w-4 mr-2" />
                      )}
                      1. Mapper le site
                    </Button>
                    <Button onClick={() => handleStartScraping()} disabled={isScraping || mappedUrls.length === 0}>
                      {isScraping ? (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      2. Lancer le Scraping
                    </Button>
                    <Select value={rateLimitMode} onValueChange={(v) => setRateLimitMode(v as RateLimitMode)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Lent (Prudent)</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast">Rapide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Progression Scraper */}
                  {(isScraping || scraperProgress > 0) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progression</span>
                        <span>{scraperProgress}%</span>
                      </div>
                      <Progress value={scraperProgress} />
                      <p className="text-xs text-muted-foreground truncate">{currentUrl}</p>
                    </div>
                  )}

                  {/* Logs Scraper */}
                  {scraperLogs.length > 0 && (
                    <ScrollArea className="h-[200px] border rounded bg-muted/10 p-2">
                      {scraperLogs.map((log, i) => (
                        <div
                          key={i}
                          className={`text-xs p-1 mb-1 rounded flex gap-2 ${log.success ? "bg-green-500/10" : "bg-red-500/10"}`}
                        >
                          {log.success ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-600" />
                          )}
                          <span className="truncate flex-1">{log.url}</span>
                        </div>
                      ))}
                    </ScrollArea>
                  )}
                </div>
              </Tabs>
            </TabsContent>

            {/* ============================================================
                ONGLET 2: IMPORTATEUR CSV
               ============================================================ */}
            <TabsContent value="import" className="space-y-6">
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg">Glissez votre fichier CSV Swissmedic</h3>
                    <p className="text-sm text-muted-foreground">Détection automatique des colonnes</p>
                  </div>
                  <Input
                    type="file"
                    accept=".csv,.txt,.xls "
                    className="max-w-xs"
                    onChange={handleFileAnalyze}
                    disabled={isImporting}
                  />
                </div>
              </div>

              {Object.keys(mappedHeaders).length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs border p-2 rounded">
                  {Object.entries(mappedHeaders).map(([db, info]: [string, any]) => (
                    <div key={db} className="flex justify-between p-1 bg-muted">
                      <span>{db}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{info.csvName}</span>
                    </div>
                  ))}
                </div>
              )}

              {previewData.length > 0 && (
                <>
                  <div className="flex justify-end">
                    <Button onClick={executeImport} disabled={isImporting}>
                      {isImporting ? <Loader2 className="animate-spin mr-2" /> : <Database className="mr-2 h-4 w-4" />}
                      Importer dans la base ({previewData.length > 0 ? "Prêt" : "0"})
                    </Button>
                  </div>
                  <ScrollArea className="h-[200px] border rounded">
                    <Table>
                      <tbody className="text-xs">
                        {previewData.map((row, i) => (
                          <tr key={i} className="border-b">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="p-2 max-w-[150px] truncate">
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </ScrollArea>
                </>
              )}

              {/* Barre de progression Import */}
              {isImporting && <Progress value={importProgress} className="h-2" />}

              {/* Logs Import */}
              {importLogs.length > 0 && (
                <ScrollArea className="h-[150px] bg-black/5 dark:bg-white/5 rounded p-2">
                  {importLogs.map((log, i) => (
                    <div key={i} className={`text-xs ${log.status === "error" ? "text-red-500" : "text-green-600"}`}>
                      [{log.status.toUpperCase()}] {log.message}
                    </div>
                  ))}
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
