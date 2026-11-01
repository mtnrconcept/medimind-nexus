import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import PageHeading from "@/components/layout/PageHeading";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Search, BookOpen, Filter, ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";

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

const ITEMS_PER_PAGE = 20;

const Pathologies = () => {
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filtres et Pagination
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");

  // On récupère les catégories uniques depuis la DB (optionnel, sinon on peut les coder en dur)
  // Pour simplifier ici, je garde une liste statique ou dynamique basée sur la requête,
  // mais idéalement il faudrait une requête distincte pour les catégories.
  const categories = [
    "Infectieuse",
    "Oncologique",
    "Hématologique",
    "Métabolique",
    "Psychiatrique",
    "Neurologique",
    "Ophtalmologique",
    "ORL",
    "Cardiovasculaire",
    "Respiratoire",
    "Digestive",
    "Dermatologique",
    "Rhumatologique",
    "Urologique",
    "Obstétrique",
    "Néonatale",
    "Congénitale",
    "Symptômes",
    "Traumatique",
    "Spéciale",
    "Causes externes",
    "Facteurs de santé",
    "Autre",
  ];

  useEffect(() => {
    const fetchPathologies = async () => {
      setLoading(true);

      // Construction de la requête de base
      let query = supabase.from("pathologies").select("id, name, icd_code, synonyms, description, category, specialty, severity", { count: "exact" });

      // Application des filtres Serveur
      const safeQuery = searchTerm.trim().slice(0, 80).replace(/[(),.%*]/g, ' ');
      if (safeQuery.trim()) {
        query = query.or(`name.ilike.%${safeQuery}%,icd_code.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`);
      }

      if (selectedCategory !== "all") {
        query = query.eq("category", selectedCategory);
      }

      if (selectedSeverity !== "all") {
        query = query.eq("severity", selectedSeverity);
      }

      // Application de la Pagination
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await query.order("name", { ascending: true }).range(from, to);

      if (error) {
        console.error("Erreur chargement pathologies:", error);
        setErrorMessage('Le référentiel médical est momentanément indisponible.');
        setPathologies([]);
        setTotalCount(0);
      } else {
        setPathologies(data || []);
        setTotalCount(count || 0);
        setErrorMessage(null);
      }

      setLoading(false);
    };

    // Debounce pour la recherche pour éviter trop d'appels API pendant la frappe
    const timer = setTimeout(() => {
      fetchPathologies();
    }, 300);

    return () => clearTimeout(timer);
  }, [page, searchTerm, selectedCategory, selectedSeverity]);

  // Réinitialiser la page à 1 si on change les filtres
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedCategory, selectedSeverity]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "mild":
        return "bg-success/10 text-success border-success/30";
      case "moderate":
        return "bg-warning/10 text-warning border-warning/30";
      case "severe":
        return "bg-destructive/20 text-destructive border-destructive/30";
      case "critical":
        return "bg-destructive/30 text-destructive border-destructive/40";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "mild":
        return "Bénin";
      case "moderate":
        return "Modéré";
      case "severe":
        return "Sévère";
      case "critical":
        return "Critique";
      default:
        return severity || 'Non classé';
    }
  };

  return (
    <AppLayout>
      <div className="clinical-page">
        <PageHeading
          eyebrow="Référentiel médical"
          title="Pathologies"
          description={`Recherchez un diagnostic, un code ou une spécialité dans l’index médical (${totalCount.toLocaleString('fr-CH')} résultats dans la sélection).`}
        />

        {/* Filters */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nom, code CIM, description…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-11 pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger aria-label="Catégorie" className="h-11 w-full md:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger aria-label="Sévérité" className="h-11 w-full md:w-[180px]">
                  <SelectValue placeholder="Sévérité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes sévérités</SelectItem>
                  <SelectItem value="mild">Bénin</SelectItem>
                  <SelectItem value="moderate">Modéré</SelectItem>
                  <SelectItem value="severe">Sévère</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="grid gap-3">
          {errorMessage ? (
            <Card><CardContent className="py-10 text-center text-sm text-destructive" role="alert">{errorMessage}</CardContent></Card>
          ) : loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <div className="flex justify-center mb-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
                Chargement des pathologies...
              </CardContent>
            </Card>
          ) : pathologies.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aucune pathologie ne correspond à vos critères
              </CardContent>
            </Card>
          ) : (
            pathologies.map((pathology) => (
              <Link key={pathology.id} to={`/pathologies/${pathology.id}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Card className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/[0.02]">
                  <CardContent className="px-5 py-5 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold tracking-tight">{pathology.name}</h3>
                          {pathology.icd_code && (
                            <Badge variant="outline" className="font-mono">
                              {pathology.icd_code}
                            </Badge>
                          )}
                          <Badge className={getSeverityColor(pathology.severity)}>
                            {getSeverityLabel(pathology.severity)}
                          </Badge>
                        </div>
                        {pathology.synonyms && pathology.synonyms.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            Aussi appelé : {pathology.synonyms.slice(0, 3).join(", ")}
                            {pathology.synonyms.length > 3 && "..."}
                          </p>
                        )}
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{pathology.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary">{pathology.category}</Badge>
                          <Badge variant="secondary">{pathology.specialty}</Badge>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0 py-4">
            <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
              <span className="hidden sm:inline">Affichage de {(page - 1) * ITEMS_PER_PAGE + 1} à {Math.min(page * ITEMS_PER_PAGE, totalCount)} sur</span> {totalCount} résultats
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Suivant
                <ChevronRightIcon className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Pathologies;
