import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase, aiTransport } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ScraperBatchResult } from "../../../supabase/functions/ai-tool-jobs/batch";
import * as XLSX from "xlsx";
import {
  Globe,
  Database,
  Loader2,
  FileSpreadsheet,
  Upload,
  ArrowRight,
  Table,
  MapPin,
  Play,
  Stethoscope,
  Tablets,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider"; // Assurez-vous que ce composant existe
import { MatrixLoader } from "@/components/ui/MatrixLoader"; // Import du nouveau loader

// --- CONFIGURATION ---

type ScraperMode = "pathologies" | "medications" | "molecules";
type RateLimitMode = "slow" | "normal" | "fast";

const RATE_LIMIT_DELAYS: Record<RateLimitMode, number> = {
  slow: 45000,
  normal: 25000,
  fast: 12000,
};

// Les clés (à gauche) doivent correspondre EXACTEMENT à vos colonnes Supabase
const COLUMN_MAPPINGS: Record<string, string[]> = {
  swissmedic_number: ["Zulassungs", "autorisation", "No d'autorisation", "Numéro", "Zul.-Nr."],
  name: ["Bezeichnung", "Dénomination", "Arzneimittel", "Name", "Präparat"],
  manufacturer: ["Zulassungsinhaberin", "Titulaire", "Firm", "Company"],
  atc_code: ["ATC-Code", "Code ATC", "atc"],
  substance: ["Wirkstoff", "Principe", "active", "Substances"],
  indications: ["Anwendungsgebiet", "Champ d'application", "Indication"],
  first_authorization_date: ["Erstzulassungs", "première autorisation", "Date"],
  validity_duration: ["Gültigkeitsdauer", "Durée de validité", "Expiry"],
};

interface ImportLog {
  status: "success" | "error" | "info";
  message: string;
  details?: string;
}

export const MedicalScraperPanel = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("import");

  // ETAT SCRAPER
  const [scraperMode, setScraperMode] = useState<ScraperMode>("medications");
  const [url, setUrl] = useState("");
  const [pageLimit, setPageLimit] = useState([50]);
  const [isMapping, setIsMapping] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scraperProgress, setScraperProgress] = useState(0);
  const [currentUrl, setCurrentUrl] = useState("");
  const [scraperLogs, setScraperLogs] = useState<any[]>([]);
  const [rateLimitMode, setRateLimitMode] = useState<RateLimitMode>("normal");
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [batchJob, setBatchJob] = useState<{ id: string; owner: string } | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [requestingStop, setRequestingStop] = useState(false);
  const batchObservation = useRef<AbortController | null>(null);

  useEffect(() => {
    setBatchJob(null);
    setIsScraping(false);
    setScraperProgress(0);
    setScraperLogs([]);
    setStopRequested(false);
    setRequestingStop(false);
    return () => {
      batchObservation.current?.abort();
      batchObservation.current = null;
    };
  }, [user?.id]);

  const showBatchResult = (result: ScraperBatchResult) => {
    setScraperProgress(Math.round((result.completed + result.failed + result.skipped) / Math.max(1, result.total) * 100));
    setStopRequested(previous => previous || result.stopped);
    const labels: Record<string, string> = {
      medicationsAdded: 'médicaments ajoutés', sideEffectsAdded: 'effets ajoutés', interactionsAdded: 'interactions ajoutées',
      contraindicationsAdded: 'contre-indications ajoutées', pathologiesAdded: 'pathologies ajoutées',
      symptomsAdded: 'symptômes ajoutés', treatmentsAdded: 'traitements ajoutés', linksCreated: 'liens créés',
      moleculesAdded: 'molécules ajoutées', moleculesUpdated: 'molécules mises à jour',
    };
    const statistics = Object.entries(result.stats).filter(([, count]) => count > 0)
      .map(([name, count]) => `${count} ${labels[name] || name}`).join(', ');
    setScraperLogs([
      ...result.entries.slice(-10).map(entry => ({
        type: entry.status === 'completed' ? 'success' : entry.status === 'failed' ? 'error' : 'info',
        message: `${entry.status === 'completed' ? '✓' : entry.status === 'failed' ? '⚠' : '—'} ${entry.url}: ${entry.status === 'completed' ? 'traitée' : entry.status === 'skipped' ? 'non lancée' : entry.error || 'résultat à vérifier'}`,
      })),
      { type: result.success ? 'success' : result.finished && !result.stopped ? 'error' : 'info',
        message: `${result.stopped ? 'Import arrêté. ' : ''}${result.completed}/${result.total} URL réussies, ${result.failed} en erreur, ${result.skipped} non lancées.` },
      ...(statistics ? [{ type: 'info', message: statistics }] : []),
    ]);
  };

  const handleScraperBatch = async () => {
    if (!user || batchObservation.current) return;
    const controller = new AbortController();
    batchObservation.current = controller;
    setIsScraping(true);
    let latest: ScraperBatchResult | null = null;
    try {
      let jobId = batchJob?.owner === user.id ? batchJob.id : undefined;
      if (!jobId) {
        setScraperProgress(0);
        setStopRequested(false);
        setScraperLogs([{ type: 'info', message: `Envoi de ${mappedUrls.length} URL pour un traitement par groupes de 3, délai ${RATE_LIMIT_DELAYS[rateLimitMode] / 1000} s.` }]);
        const receipt = await aiTransport.startBatch({ mode: scraperMode, urls: mappedUrls, rateLimitMode }, { owner: user.id, signal: controller.signal });
        if (controller.signal.aborted) return;
        jobId = receipt.id;
        setBatchJob({ id: jobId, owner: user.id });
      }
      const result = await aiTransport.observe<ScraperBatchResult>(jobId, {
        owner: user.id, signal: controller.signal,
        onProgress: job => {
          if (controller.signal.aborted) return;
          setScraperProgress(job.progress_percentage ?? 0);
          if (job.result_payload?.body) {
            try {
              const saved = JSON.parse(job.result_payload.body) as ScraperBatchResult;
              if (Array.isArray(saved.entries) && saved.stats && typeof saved.total === 'number') {
                latest = saved;
                showBatchResult(saved);
              }
            } catch { /* Keep the last confirmed progress if a response is incomplete. */ }
          }
        },
      });
      if (controller.signal.aborted) return;
      showBatchResult(result);
      if (!result.finished || !result.success) throw new Error('L’import est incomplet. Les résultats disponibles sont conservés dans Activité IA.');
      setBatchJob(null);
      toast({ title: 'Import terminé', description: `${result.completed} URL traitées.` });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (latest?.finished) {
        setBatchJob(null);
        showBatchResult(latest);
        toast({ title: latest.stopped ? 'Import arrêté' : 'Import terminé avec des erreurs',
          description: `${latest.completed} réussies, ${latest.failed} en erreur, ${latest.skipped} non lancées.`,
          variant: latest.stopped ? 'default' : 'destructive' });
      } else {
        toast({ title: 'Suivi momentanément indisponible',
          description: error instanceof Error ? error.message : 'Retrouvez le lot dans Activité IA.', variant: 'destructive' });
      }
    } finally {
      if (batchObservation.current === controller) {
        batchObservation.current = null;
        setIsScraping(false);
      }
    }
  };

  const handleStopBatch = async () => {
    if (!batchJob || !user || batchJob.owner !== user.id) return;
    setRequestingStop(true);
    try {
      await aiTransport.stopBatch(batchJob.id, { owner: user.id });
      setStopRequested(true);
      toast({ title: 'Arrêt demandé', description: 'Les URL non commencées sont arrêtées. Les URL déjà acceptées se terminent.' });
    } catch (error) {
      toast({ title: 'Arrêt non confirmé', description: error instanceof Error ? error.message : 'Réessayez.', variant: 'destructive' });
    } finally { setRequestingStop(false); }
  };


  // ETAT IMPORT EXCEL/CSV
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [mappedHeaders, setMappedHeaders] = useState<Record<string, string>>({});

  const addImportLog = (status: "success" | "error" | "info", message: string, details?: string) => {
    setImportLogs((prev) => [{ status, message, details }, ...prev]);
  };

  // --- ANALYSE FICHIER VIA XLSX ---

  const handleFileAnalyze = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportLogs([]);
    setPreviewData([]);
    setMappedHeaders({});

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (!rawData || rawData.length === 0) {
        throw new Error("Le fichier semble vide.");
      }

      addImportLog("info", `Fichier chargé. ${rawData.length} lignes brutes détectées.`);

      // 1. Trouver la ligne d'en-tête réelle
      let headerRowIndex = -1;
      let headers: string[] = [];

      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        const rowStr = row.map((cell) => String(cell).toLowerCase()).join(" ");

        if (
          (rowStr.includes("zulassung") && rowStr.includes("nummer")) ||
          (rowStr.includes("autorisation") && rowStr.includes("medicament")) ||
          (rowStr.includes("no") && rowStr.includes("dénomination"))
        ) {
          headerRowIndex = i;
          headers = row.map((cell) => String(cell));
          break;
        }
      }

      if (headerRowIndex === -1) {
        // Fallback
        if (rawData.length > 6 && String(rawData[6][0]).match(/\d/)) {
          headerRowIndex = 0;
        } else {
          headerRowIndex = 0;
        }
        headers = rawData[headerRowIndex].map((cell) => String(cell));
        addImportLog("info", "En-tête non détecté par mots-clés, utilisation de la première ligne.");
      } else {
        addImportLog("success", `En-têtes détectés à la ligne ${headerRowIndex + 1}`);
      }

      // 2. Mapping des colonnes
      const newMapping: Record<string, any> = {};
      const cleanStr = (s: string) =>
        s
          .replace(/[\r\n]+/g, " ")
          .toLowerCase()
          .trim();

      Object.entries(COLUMN_MAPPINGS).forEach(([dbCol, keywords]) => {
        const index = headers.findIndex((h) => {
          const hClean = cleanStr(h);
          return keywords.some((k) => hClean.includes(k.toLowerCase()));
        });

        if (index !== -1) {
          newMapping[dbCol] = {
            index,
            csvName: headers[index].replace(/[\r\n]+/g, " ").substring(0, 30) + "...",
          };
        }
      });

      if (Object.keys(newMapping).length === 0) {
        throw new Error("Aucune colonne compatible trouvée. Vérifiez le fichier.");
      }

      setMappedHeaders(newMapping);

      // 3. Préparation des données propres
      const dataRows = rawData.slice(headerRowIndex + 1);

      const preview = [];
      // UTILISATION D'UNE MAP POUR LA DÉDUPLICATION
      // Clé = Swissmedic Number, Valeur = Ligne de données
      const uniqueDataMap = new Map<string, any>();

      // --- FONCTION DE CONVERSION DES DATES ---
      const convertToISO = (val: any): string | null => {
        if (!val) return null;

        // Cas 1: Nombre Excel (ex: 42664 pour 2016-10-17)
        if (typeof val === "number" || (!isNaN(Number(val)) && !String(val).includes("."))) {
          const num = Number(val);
          // 25569 = jours entre 1900 et 1970
          const date = new Date((num - 25569) * 86400 * 1000);
          if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
        }

        const strVal = String(val).trim();

        // Cas 2: Texte DD.MM.YYYY
        if (strVal.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
          const parts = strVal.split(".");
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        // Cas 3: Déjà format ISO YYYY-MM-DD
        if (strVal.match(/^\d{4}-\d{2}-\d{2}$/)) return strVal;

        return null;
      };
      // -------------------------------------------------

      for (const row of dataRows) {
        if (!row || row.length === 0) continue;

        const rowObj: any = {};
        let hasId = false;

        Object.entries(newMapping).forEach(([dbCol, mapInfo]: [string, any]) => {
          let val = row[mapInfo.index];

          if (val !== undefined && val !== null) {
            // Nettoyage ID
            if (dbCol === "swissmedic_number") {
              val = String(val).trim();
              const match = val.match(/^(\d{5})/);
              if (match) {
                val = match[1];
                hasId = true;
              }
            }
            // Conversion Date
            else if (dbCol === "first_authorization_date" || dbCol === "validity_duration") {
              val = convertToISO(val);
            } else {
              val = String(val).trim();
            }

            if (val !== null) {
              rowObj[dbCol] = val;
            }
          }
        });

        if (hasId && rowObj.swissmedic_number) {
          rowObj.updated_at = new Date().toISOString();

          // DÉDUPLICATION : Si l'ID existe déjà, on l'écrase (ou on l'ignore)
          // Ici on écrase pour avoir la dernière version trouvée
          uniqueDataMap.set(rowObj.swissmedic_number, rowObj);

          if (preview.length < 5) preview.push(rowObj);
        }
      }

      // On convertit la Map en tableau pour l'envoi
      const validDataForImport = Array.from(uniqueDataMap.values());

      setPreviewData(preview);
      addImportLog("success", `${validDataForImport.length} médicaments uniques prêts à importer (doublons retirés).`);
      (window as any).importData = validDataForImport;
    } catch (error: any) {
      console.error(error);
      addImportLog("error", "Erreur analyse", error.message);
      toast({ title: "Erreur lecture", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const executeImport = async () => {
    const dataToImport = (window as any).importData as any[];
    if (!dataToImport || dataToImport.length === 0) {
      toast({ title: "Erreur", description: "Aucune donnée à importer", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    const BATCH_SIZE = 100;
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < dataToImport.length; i += BATCH_SIZE) {
        const batch = dataToImport.slice(i, i + BATCH_SIZE);

        const { error } = await supabase.from("medications").upsert(batch, {
          onConflict: "swissmedic_number",
          ignoreDuplicates: false,
        });

        if (error) {
          console.error("Batch error:", error);
          errorCount += batch.length;
          addImportLog("error", `Erreur lot ${Math.floor(i / BATCH_SIZE) + 1}`, error.message);
        } else {
          successCount += batch.length;
        }

        processed += batch.length;
        setImportProgress(Math.round((processed / dataToImport.length) * 100));
      }

      addImportLog("success", `Import terminé.`, `${successCount} succès, ${errorCount} erreurs.`);
      toast({
        title: "Terminé",
        description: `${successCount} médicaments importés/mis à jour.`,
        variant: successCount > 0 ? "default" : "destructive",
      });
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
          <CardDescription>Scraping Web & Importation Excel Swissmedic</CardDescription>
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
                Import Excel / CSV
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scraper" className="space-y-6">
              {/* Sélection du mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mode de scraping</label>
                  <Select value={scraperMode} onValueChange={(v: ScraperMode) => setScraperMode(v)} disabled={isScraping || Boolean(batchJob)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pathologies">
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4" />
                          Pathologies & Symptômes
                        </div>
                      </SelectItem>
                      <SelectItem value="medications">
                        <div className="flex items-center gap-2">
                          <Tablets className="h-4 w-4" />
                          Médicaments (Compendium)
                        </div>
                      </SelectItem>
                      <SelectItem value="molecules">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          Molécules (Creapharma)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vitesse (délai entre requêtes)</label>
                  <Select value={rateLimitMode} onValueChange={(v: RateLimitMode) => setRateLimitMode(v)} disabled={isScraping || Boolean(batchJob)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slow">Lent (45s) - Sécuritaire</SelectItem>
                      <SelectItem value="normal">Normal (25s)</SelectItem>
                      <SelectItem value="fast">Rapide (12s) - Risqué</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Limite de pages */}
              <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Limite de pages à scraper</label>
                  <span className="text-sm font-bold bg-primary/10 px-2 py-1 rounded text-primary">
                    {pageLimit[0]} pages
                  </span>
                </div>
                <Slider
                  defaultValue={[10]}
                  max={500}
                  step={10}
                  min={10}
                  value={pageLimit}
                  onValueChange={setPageLimit}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Définit le nombre maximum d'URLs à récupérer lors du mapping.
                </p>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {scraperMode === "medications"
                    ? "URL Compendium.ch ou laisser vide pour https://compendium.ch/fr/product"
                    : scraperMode === "molecules"
                      ? "URL Creapharma ou laisser vide pour https://www.creapharma.ch/medicaments-en-suisse/molecules-en-suisse"
                      : "URL du site médical à scraper (ex: https://www.webmd.com/)"
                  }
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder={scraperMode === "medications"
                      ? "https://compendium.ch/fr/product"
                      : scraperMode === "molecules"
                        ? "https://www.creapharma.ch/medicaments-en-suisse/molecules-en-suisse"
                        : "https://www.mayoclinic.org/diseases-conditions"
                    }
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isMapping || isScraping || Boolean(batchJob)}
                  />
                  <Button
                    onClick={async () => {
                      setIsMapping(true);
                      setScraperLogs([]);
                      setMappedUrls([]);

                      try {
                        const action = scraperMode === "medications" ? "map-compendium" : "map";
                        const targetUrl = url || (scraperMode === "medications"
                          ? "https://compendium.ch/fr/product"
                          : scraperMode === "molecules"
                            ? "https://www.creapharma.ch/medicaments-en-suisse/molecules-en-suisse"
                            : "https://www.webmd.com/"
                        );

                        setScraperLogs(prev => [...prev, {
                          type: "info",
                          message: `🔍 Mapping des URLs de ${targetUrl}...`
                        }]);

                        const { data, error } = await supabase.functions.invoke("medical-scraper", {
                          body: { action, url: targetUrl, options: { limit: pageLimit[0] } }
                        });

                        if (error) throw error;

                        if (data.success) {
                          const urls = data.urls || [];
                          setMappedUrls(urls);
                          setScraperLogs(prev => [...prev, {
                            type: "success",
                            message: `✅ ${urls.length} URLs trouvées (sur ${data.totalUrls || 0} totales)`
                          }]);
                        } else {
                          throw new Error(data.error || "Mapping échoué");
                        }
                      } catch (err: any) {
                        setScraperLogs(prev => [...prev, {
                          type: "error",
                          message: `❌ Erreur: ${err.message}`
                        }]);
                        toast({ title: "Erreur", description: err.message, variant: "destructive" });
                      } finally {
                        setIsMapping(false);
                      }
                    }}
                    disabled={isMapping || isScraping || Boolean(batchJob)}
                  >
                    {isMapping ? <Loader2 className="animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                    Mapper
                  </Button>
                </div>
              </div>

              {/* URLs mappées */}
              {mappedUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{mappedUrls.length} URLs prêtes</span>
                    <Button
                      onClick={handleScraperBatch}
                      disabled={isScraping}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isScraping ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 h-4 w-4" />}
                      {batchJob ? 'Reprendre le suivi' : 'Lancer le scraping'}
                    </Button>
                  </div>
                  {batchJob && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="destructive" size="sm" onClick={handleStopBatch} disabled={stopRequested || requestingStop}>
                        {requestingStop ? 'Demande en cours…' : stopRequested ? 'Arrêt demandé' : 'Arrêter les URL restantes'}
                      </Button>
                      {isScraping && <Button variant="outline" size="sm" onClick={() => batchObservation.current?.abort()}>Masquer le suivi</Button>}
                      <span className="text-xs text-muted-foreground">Les URL déjà acceptées se terminent après un arrêt.</span>
                    </div>
                  )}
                  <ScrollArea className="h-[100px] border rounded p-2 bg-muted/20 text-xs font-mono">
                    {mappedUrls.slice(0, 20).map((u, i) => (
                      <div key={i} className="truncate text-muted-foreground">{u}</div>
                    ))}
                    {mappedUrls.length > 20 && (
                      <div className="text-primary">... et {mappedUrls.length - 20} autres</div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {/* Animation Matrix Loader pendant le scraping */}
              {isScraping && (
                <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-green-500 flex items-center gap-2">
                      <Database className="h-5 w-5 animate-pulse" />
                      Extraction des données en cours...
                    </h3>
                    <Badge variant="outline" className="border-green-500 text-green-500 bg-green-500/10">
                      IA Powered
                    </Badge>
                  </div>

                  <MatrixLoader
                    isActive={isScraping}
                    progress={scraperProgress}
                    status={`Traitement: ${scraperLogs[scraperLogs.length - 1]?.message || "Initialisation..."}`}
                  />

                  <p className="text-xs text-center text-muted-foreground font-mono">
                    Vous pouvez quitter cette page. Le lot continue côté serveur ; son suivi et ses résultats restent dans Activité IA.
                  </p>
                </div>
              )}

              {/* Logs */}
              {scraperLogs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Journal d'activité</h3>
                  <ScrollArea className="h-[200px] bg-slate-950 text-slate-50 rounded p-3 border font-mono text-xs">
                    {scraperLogs.map((log, i) => (
                      <div
                        key={i}
                        className={`mb-1 ${log.type === "error" ? "text-red-400" :
                          log.type === "success" ? "text-green-400" :
                            "text-slate-300"
                          }`}
                      >
                        {log.message}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}

              {/* Guide rapide */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-blue-900 dark:text-blue-100">Guide rapide</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li><strong>Pathologies</strong>: Scrape les descriptions de maladies, symptômes associés et traitements</li>
                  <li><strong>Médicaments</strong>: Scrape les notices Compendium (composition, effets secondaires, interactions)</li>
                  <li><strong>Molécules</strong>: Scrape les informations détaillées sur Creapharma (IUPAC, SMILES, indications)</li>
                  <li>Utilisez le mode "Lent" pour éviter le rate-limiting de Firecrawl</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="import" className="space-y-6">
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg">Glissez votre fichier Swissmedic (.xlsx)</h3>
                    <p className="text-sm text-muted-foreground">
                      Compatible Excel et CSV. Détection automatique des colonnes.
                    </p>
                  </div>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="max-w-xs cursor-pointer"
                    onChange={handleFileAnalyze}
                    disabled={isImporting}
                  />
                </div>
              </div>

              {Object.keys(mappedHeaders).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Colonnes Mappées</h3>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {Object.keys(mappedHeaders).length} colonnes auto-détectées
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs border p-2 rounded bg-background">
                    {Object.entries(mappedHeaders).map(([db, info]: [string, any]) => (
                      <div
                        key={db}
                        className="flex justify-between items-center p-2 bg-muted rounded border-l-2 border-l-primary"
                      >
                        <span className="font-mono font-medium">{db}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground mx-2" />
                        <span className="truncate max-w-[150px] italic text-muted-foreground" title={info.csvName}>
                          {info.csvName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewData.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
                    <div>
                      <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Prêt à importer</h3>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {(window as any).importData?.length} lignes valides prêtes à être insérées.
                      </p>
                    </div>
                    <Button onClick={executeImport} disabled={isImporting} className="bg-blue-600 hover:bg-blue-700">
                      {isImporting ? <Loader2 className="animate-spin mr-2" /> : <Database className="mr-2 h-4 w-4" />}
                      Lancer l'importation
                    </Button>
                  </div>

                  <div className="border rounded-md overflow-hidden">
                    <div className="bg-muted px-4 py-2 border-b text-xs font-medium text-muted-foreground">
                      Aperçu des 5 premières lignes
                    </div>
                    <ScrollArea className="h-[200px] bg-background">
                      <Table>
                        <tbody className="text-xs">
                          {previewData.map((row, i) => (
                            <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                              {Object.entries(row).map(([key, val]: [string, any], j) => (
                                <td
                                  key={j}
                                  className="p-2 max-w-[150px] truncate border-r last:border-r-0"
                                  title={String(val)}
                                >
                                  {String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {isImporting && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Traitement en cours...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2" />
                </div>
              )}

              {importLogs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Journal d'opération</h3>
                  <ScrollArea className="h-[150px] bg-slate-950 text-slate-50 rounded p-3 border font-mono text-xs">
                    {importLogs.map((log, i) => (
                      <div
                        key={i}
                        className={`mb-1.5 flex items-start gap-2 ${log.status === "error"
                          ? "text-red-400"
                          : log.status === "success"
                            ? "text-green-400"
                            : "text-slate-400"
                          }`}
                      >
                        <span className="mt-0.5">
                          {log.status === "success" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : log.status === "error" ? (
                            <XCircle className="h-3 w-3" />
                          ) : (
                            ">"
                          )}
                        </span>
                        <span>
                          <span className="font-bold">[{log.status.toUpperCase()}]</span> {log.message}
                          {log.details && <span className="opacity-70 ml-1"> - {log.details}</span>}
                        </span>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
