import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAutoTranslation } from "@/contexts/TranslationContext";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// Assurez-vous que ce chemin est correct selon votre structure de dossiers
import { MedicalScraperPanel } from "@/components/admin/MedicalScraperPanel";
import DataImportPanel from "@/components/admin/DataImportPanel";
import DatabaseTranslationPanel from "@/components/admin/DatabaseTranslationPanel";
import OpenFDAImportPanel from "@/components/admin/OpenFDAImportPanel";
import {
  Users,
  Activity,
  Shield,
  Stethoscope,
  FlaskConical,
  Settings,
  BookOpen,
  Download,
  Loader2,
  RefreshCw,
  Globe,
  Pill,
  FileSpreadsheet,
} from "lucide-react";

interface UserWithRole {
  id: string;
  user_id: string;
  role: "admin" | "researcher" | "doctor";
  created_at: string;
  profiles: {
    first_name: string;
    last_name: string;
    specialty: string;
    institution: string;
  } | null;
}

interface Stats {
  totalUsers: number;
  doctors: number;
  researchers: number;
  admins: number;
  pathologies: number;
  symptoms: number;
  medications: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { t } = useAutoTranslation();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    doctors: 0,
    researchers: 0,
    admins: 0,
    pathologies: 0,
    symptoms: 0,
    medications: 0,
  });
  const [loading, setLoading] = useState(true);

  // États pour l'import ICD (Géré ici car c'est un seed serveur via Edge Function)
  const [importingIcd, setImportingIcd] = useState(false);
  const [importIcdProgress, setImportIcdProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    // TEMPORAIRE: Désactivé pour config initiale
    // if (role !== "admin") {
    //   navigate("/dashboard");
    //   return;
    // }

    const fetchData = async () => {
      try {
        const [usersRes, profilesRes, pathologiesRes, symptomsRes, medicationsRes] = await Promise.all([
          supabase.from("user_roles").select("*"),
          supabase.from("profiles").select("*"),
          supabase.from("pathologies").select("id", { count: "exact", head: true }),
          supabase.from("symptoms").select("id", { count: "exact", head: true }),
          supabase.from("medications").select("id", { count: "exact", head: true }),
        ]);

        if (usersRes.data) {
          const usersWithProfiles = usersRes.data.map((user) => ({
            ...user,
            profiles: profilesRes.data?.find((p) => p.user_id === user.user_id) || null,
          }));
          setUsers(usersWithProfiles as UserWithRole[]);

          const doctors = usersRes.data.filter((u) => u.role === "doctor").length;
          const researchers = usersRes.data.filter((u) => u.role === "researcher").length;
          const admins = usersRes.data.filter((u) => u.role === "admin").length;

          setStats({
            totalUsers: usersRes.data.length,
            doctors,
            researchers,
            admins,
            pathologies: pathologiesRes.count || 0,
            symptoms: symptomsRes.count || 0,
            medications: medicationsRes.count || 0,
          });
        }
      } catch (error) {
        console.error("Error fetching admin data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [role, navigate]);

  const refreshStats = async () => {
    const [pathologiesRes, symptomsRes, medicationsRes] = await Promise.all([
      supabase.from("pathologies").select("id", { count: "exact", head: true }),
      supabase.from("symptoms").select("id", { count: "exact", head: true }),
      supabase.from("medications").select("id", { count: "exact", head: true }),
    ]);
    setStats((prev) => ({
      ...prev,
      pathologies: pathologiesRes.count || 0,
      symptoms: symptomsRes.count || 0,
      medications: medicationsRes.count || 0,
    }));
  };

  const importIcdData = async (clearExisting = false) => {
    setImportingIcd(true);
    setImportIcdProgress({ current: 0, total: 0 });

    try {
      let offset = 0;
      const limit = 500;
      let hasMore = true;
      let totalImported = 0;
      let totalInDataset = 0;

      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("import-icd", {
          body: { limit, offset, clearExisting: clearExisting && offset === 0 },
        });

        if (error) throw new Error(error.message);
        if (!data.success) throw new Error(data.error || "Import failed");

        totalImported += data.imported;
        totalInDataset = data.totalInDataset;
        hasMore = data.hasMore;
        offset = data.nextOffset || 0;

        setImportIcdProgress({ current: totalImported, total: totalInDataset });
      }

      toast.success(`Import terminé: ${totalImported} pathologies ICD-10 importées`);
      await refreshStats();
    } catch (error) {
      console.error("Import error:", error);
      toast.error(`Erreur d'import: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    } finally {
      setImportingIcd(false);
    }
  };

  const getRoleIcon = (userRole: string) => {
    switch (userRole) {
      case "doctor":
        return <Stethoscope className="h-4 w-4" />;
      case "researcher":
        return <FlaskConical className="h-4 w-4" />;
      case "admin":
        return <Shield className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getRoleBadgeVariant = (userRole: string) => {
    switch (userRole) {
      case "admin":
        return "destructive";
      case "researcher":
        return "secondary";
      default:
        return "outline";
    }
  };

  // TEMPORAIRE: Désactivé pour config initiale
  // if (role !== "admin") {
  //   return null;
  // }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            {t('Administration')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('Gérez les utilisateurs et les données de la plateforme')}</p>
        </div>

        {/* Stats globales */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('Utilisateurs')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">{t('comptes actifs')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pathologies</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pathologies}</div>
              <p className="text-xs text-muted-foreground">{t('dans l\'index')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('Symptômes')}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.symptoms}</div>
              <p className="text-xs text-muted-foreground">{t('répertoriés')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('Médicaments')}</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.medications}</div>
              <p className="text-xs text-muted-foreground">en base</p>
            </CardContent>
          </Card>
        </div>

        {/* Navigation principale */}
        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="data">Données & ICD-10</TabsTrigger>
            <TabsTrigger value="tools">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import & Outils
            </TabsTrigger>
          </TabsList>

          {/* Onglet Utilisateurs */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gestion des utilisateurs</CardTitle>
                <CardDescription>Liste de tous les utilisateurs inscrits sur la plateforme</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {loading ? (
                    <p className="text-muted-foreground text-center py-4">Chargement...</p>
                  ) : users.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">Aucun utilisateur</p>
                  ) : (
                    users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback className="bg-primary/10">
                              {user.profiles?.first_name?.[0] || "U"}
                              {user.profiles?.last_name?.[0] || ""}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-medium">
                              {user.profiles?.first_name || "Utilisateur"} {user.profiles?.last_name || ""}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {user.profiles?.specialty || "Non spécifié"}{" "}
                              {user.profiles?.institution && `• ${user.profiles.institution}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={getRoleBadgeVariant(user.role) as any}>
                            <span className="flex items-center gap-1">
                              {getRoleIcon(user.role)}{" "}
                              {user.role === "admin" ? "Admin" : user.role === "doctor" ? "Médecin" : "Chercheur"}
                            </span>
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString("fr-FR")}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet Données (ICD-10) */}
          <TabsContent value="data" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Import des données ICD-10</CardTitle>
                  <CardDescription>
                    Importez les codes ICD-10 depuis la base de données WHO (~14,000 pathologies). Utilisez ceci pour
                    initialiser la base de données pathologies.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => importIcdData(false)} disabled={importingIcd}>
                      {importingIcd ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" /> Importer ICD-10
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => importIcdData(true)}
                      disabled={importingIcd}
                      className="text-destructive hover:text-destructive"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" /> Réinitialiser et importer
                    </Button>
                  </div>

                  {importingIcd && importIcdProgress.total > 0 && (
                    <div className="space-y-2">
                      <Progress value={(importIcdProgress.current / importIcdProgress.total) * 100} />
                      <p className="text-sm text-muted-foreground text-center">
                        {importIcdProgress.current.toLocaleString()} / {importIcdProgress.total.toLocaleString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Vue d'ensemble</CardTitle>
                  <CardDescription>État actuel de la base de données</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-sm text-muted-foreground">Source Pathologies</span>
                      <Badge variant="outline">ICD-10 WHO</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-sm text-muted-foreground">Source Médicaments</span>
                      <Badge variant="outline">Swissmedic / Compendium</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2">
                      <span className="text-sm text-muted-foreground">Dernière mise à jour</span>
                      <span className="text-sm font-medium">Aujourd'hui</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Onglet Outils (Import fichiers + Scraper + Traduction) */}
          <TabsContent value="tools" className="space-y-6">
            {/* Import des données gratuites (OpenFDA, symptômes) */}
            <OpenFDAImportPanel />

            {/* Traduction des données en français */}
            <DatabaseTranslationPanel />

            {/* Import de fichiers CSV/Excel */}
            <DataImportPanel />

            {/* Scraper web */}
            <MedicalScraperPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Admin; // <--- C'est cette ligne qui manquait !
