import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MedicalScraperPanel } from '@/components/admin/MedicalScraperPanel';
import * as XLSX from 'xlsx';
import {
  Users,
  Activity,
  Shield,
  Stethoscope,
  FlaskConical,
  Settings,
  BookOpen,
  TrendingUp,
  Download,
  Loader2,
  RefreshCw,
  Globe,
  Upload,
  Pill,
} from 'lucide-react';

interface UserWithRole {
  id: string;
  user_id: string;
  role: 'admin' | 'researcher' | 'doctor';
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
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importingSwissmedic, setImportingSwissmedic] = useState(false);
  const [swissmedicProgress, setSwissmedicProgress] = useState({ processed: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    const fetchData = async () => {
      try {
        const [usersRes, profilesRes, pathologiesRes, symptomsRes, medicationsRes] = await Promise.all([
          supabase.from('user_roles').select('*'),
          supabase.from('profiles').select('*'),
          supabase.from('pathologies').select('id', { count: 'exact', head: true }),
          supabase.from('symptoms').select('id', { count: 'exact', head: true }),
          supabase.from('medications').select('id', { count: 'exact', head: true }),
        ]);

        if (usersRes.data) {
          const usersWithProfiles = usersRes.data.map(user => ({
            ...user,
            profiles: profilesRes.data?.find(p => p.user_id === user.user_id) || null,
          }));
          setUsers(usersWithProfiles as UserWithRole[]);
          
          const doctors = usersRes.data.filter(u => u.role === 'doctor').length;
          const researchers = usersRes.data.filter(u => u.role === 'researcher').length;
          const admins = usersRes.data.filter(u => u.role === 'admin').length;

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
        console.error('Error fetching admin data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [role, navigate]);

  const refreshStats = async () => {
    const [pathologiesRes, symptomsRes, medicationsRes] = await Promise.all([
      supabase.from('pathologies').select('id', { count: 'exact', head: true }),
      supabase.from('symptoms').select('id', { count: 'exact', head: true }),
      supabase.from('medications').select('id', { count: 'exact', head: true }),
    ]);
    setStats(prev => ({
      ...prev,
      pathologies: pathologiesRes.count || 0,
      symptoms: symptomsRes.count || 0,
      medications: medicationsRes.count || 0,
    }));
  };

  const importIcdData = async (clearExisting = false) => {
    setImporting(true);
    setImportProgress({ current: 0, total: 0 });
    
    try {
      let offset = 0;
      const limit = 500;
      let hasMore = true;
      let totalImported = 0;
      let totalInDataset = 0;
      
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('import-icd', {
          body: { limit, offset, clearExisting: clearExisting && offset === 0 }
        });
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (!data.success) {
          throw new Error(data.error || 'Import failed');
        }
        
        totalImported += data.imported;
        totalInDataset = data.totalInDataset;
        hasMore = data.hasMore;
        offset = data.nextOffset || 0;
        
        setImportProgress({ current: totalImported, total: totalInDataset });
      }
      
      toast.success(`Import terminé: ${totalImported} pathologies ICD-10 importées`);
      await refreshStats();
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSwissmedicFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingSwissmedic(true);
    setSwissmedicProgress({ processed: 0, total: 0 });

    try {
      // Read Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Find the actual header row (skip title rows)
      // The Swissmedic file has title rows at the beginning
      // We need to find where "Zulassungsnummer" column starts
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      let headerRow = 0;
      
      for (let row = range.s.r; row <= Math.min(range.s.r + 10, range.e.r); row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
        const cell = worksheet[cellAddress];
        const cellValue = cell?.v?.toString() || '';
        
        // Look for the header row - it should contain "Zulassungsnummer" or similar
        if (cellValue.includes('Zulassungsnummer') || cellValue.includes('N°') || cellValue === '1') {
          headerRow = row;
          break;
        }
        // Also check if it looks like a number (authorization number starts with 5 digits)
        if (/^\d{5}/.test(cellValue)) {
          // This is data, header is the row before
          headerRow = Math.max(0, row - 1);
          break;
        }
      }
      
      console.log('Header row detected:', headerRow);
      
      // Parse with the correct header row
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        range: headerRow,
        defval: ''
      });

      console.log('First row columns:', jsonData.length > 0 ? Object.keys(jsonData[0] as object) : 'empty');
      
      setSwissmedicProgress({ processed: 0, total: jsonData.length });
      toast.info(`${jsonData.length} lignes trouvées, envoi en cours...`);

      // Send to edge function
      const { data, error } = await supabase.functions.invoke('import-swissmedic', {
        body: { data: jsonData }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }

      const { stats: importStats } = data;
      setSwissmedicProgress({ processed: importStats.processed, total: importStats.uniqueMedications });
      
      toast.success(
        `Import Swissmedic terminé: ${importStats.processed} médicaments traités (${importStats.errors} erreurs)`
      );
      
      await refreshStats();
    } catch (error) {
      console.error('Swissmedic import error:', error);
      toast.error(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setImportingSwissmedic(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getRoleIcon = (userRole: string) => {
    switch (userRole) {
      case 'doctor': return <Stethoscope className="h-4 w-4" />;
      case 'researcher': return <FlaskConical className="h-4 w-4" />;
      case 'admin': return <Shield className="h-4 w-4" />;
      default: return null;
    }
  };

  const getRoleLabel = (userRole: string) => {
    switch (userRole) {
      case 'doctor': return 'Médecin';
      case 'researcher': return 'Chercheur';
      case 'admin': return 'Admin';
      default: return userRole;
    }
  };

  const getRoleBadgeVariant = (userRole: string) => {
    switch (userRole) {
      case 'admin': return 'destructive';
      case 'researcher': return 'secondary';
      default: return 'outline';
    }
  };

  if (role !== 'admin') {
    return null;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Administration
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez les utilisateurs et les données de la plateforme
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Utilisateurs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">comptes actifs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Médecins</CardTitle>
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.doctors}</div>
              <p className="text-xs text-muted-foreground">praticiens inscrits</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chercheurs</CardTitle>
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.researchers}</div>
              <p className="text-xs text-muted-foreground">comptes recherche</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pathologies</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pathologies}</div>
              <p className="text-xs text-muted-foreground">dans l'index</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="data">Données</TabsTrigger>
            <TabsTrigger value="scraping">
              <Globe className="h-4 w-4 mr-1" />
              Scraping
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gestion des utilisateurs</CardTitle>
                <CardDescription>
                  Liste de tous les utilisateurs inscrits sur la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {loading ? (
                    <p className="text-muted-foreground text-center py-4">
                      Chargement...
                    </p>
                  ) : users.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Aucun utilisateur
                    </p>
                  ) : (
                    users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback className="bg-primary/10">
                              {user.profiles?.first_name?.[0] || 'U'}
                              {user.profiles?.last_name?.[0] || ''}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-medium">
                              {user.profiles?.first_name || 'Utilisateur'}{' '}
                              {user.profiles?.last_name || ''}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {user.profiles?.specialty || 'Non spécifié'}{' '}
                              {user.profiles?.institution && `• ${user.profiles.institution}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={getRoleBadgeVariant(user.role) as any}>
                            <span className="flex items-center gap-1">
                              {getRoleIcon(user.role)}
                              {getRoleLabel(user.role)}
                            </span>
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Import des données ICD-10</CardTitle>
                <CardDescription>
                  Importez les codes ICD-10 depuis la base de données WHO (~14,000 pathologies)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    onClick={() => importIcdData(false)}
                    disabled={importing}
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Import en cours...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Importer ICD-10
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => importIcdData(true)}
                    disabled={importing}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Réinitialiser et importer
                  </Button>
                </div>
                
                {importing && importProgress.total > 0 && (
                  <div className="space-y-2">
                    <Progress value={(importProgress.current / importProgress.total) * 100} />
                    <p className="text-sm text-muted-foreground">
                      {importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()} pathologies importées
                    </p>
                  </div>
                )}
                
                <p className="text-sm text-muted-foreground">
                  Les données sont importées depuis le référentiel ICD-10 de l'OMS via GitHub.
                  L'import peut prendre quelques minutes.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Import Swissmedic
                </CardTitle>
                <CardDescription>
                  Importez les médicaments autorisés depuis un fichier Excel Swissmedic
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls"
                  onChange={handleSwissmedicFileSelect}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingSwissmedic}
                  variant="outline"
                >
                  {importingSwissmedic ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Importer fichier Swissmedic (.xlsx)
                    </>
                  )}
                </Button>
                
                {importingSwissmedic && swissmedicProgress.total > 0 && (
                  <div className="space-y-2">
                    <Progress value={(swissmedicProgress.processed / swissmedicProgress.total) * 100} />
                    <p className="text-sm text-muted-foreground">
                      {swissmedicProgress.processed.toLocaleString()} / {swissmedicProgress.total.toLocaleString()} médicaments traités
                    </p>
                  </div>
                )}
                
                <p className="text-sm text-muted-foreground">
                  Téléchargez le fichier depuis <a href="https://www.swissmedic.ch/swissmedic/fr/home/services/listen_neu.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Swissmedic</a> (liste des médicaments autorisés).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vue d'ensemble des données</CardTitle>
                <CardDescription>
                  Statistiques sur le contenu de la base de données
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-sm">Pathologies</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.pathologies.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm">Symptômes</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.symptoms.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Pill className="h-4 w-4" />
                      <span className="text-sm">Médicaments</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.medications.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-sm">Sources</span>
                    </div>
                    <p className="text-lg font-bold mt-1">ICD-10 / Swissmedic</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scraping">
            <MedicalScraperPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Admin;
