import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  BookOpen,
  Search,
  Activity,
  Heart,
  Brain,
  Stethoscope,
  FlaskConical,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

interface Stats {
  pathologies: number;
  symptoms: number;
  treatments: number;
  sources: number;
}

const Dashboard = () => {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ pathologies: 0, symptoms: 0, treatments: 0, sources: 0 });
  const [recentPathologies, setRecentPathologies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pathologiesRes, symptomsRes, treatmentsRes, sourcesRes, recentRes] = await Promise.all([
          supabase.from('pathologies').select('id', { count: 'exact', head: true }),
          supabase.from('symptoms').select('id', { count: 'exact', head: true }),
          supabase.from('treatments').select('id', { count: 'exact', head: true }),
          supabase.from('medical_sources').select('id', { count: 'exact', head: true }),
          supabase.from('pathologies').select('*').order('created_at', { ascending: false }).limit(5),
        ]);

        setStats({
          pathologies: pathologiesRes.count || 0,
          symptoms: symptomsRes.count || 0,
          treatments: treatmentsRes.count || 0,
          sources: sourcesRes.count || 0,
        });

        if (recentRes.data) {
          setRecentPathologies(recentRes.data);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
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

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {getGreeting()}, {user?.user_metadata?.first_name || 'Utilisateur'}
            </h1>
            <p className="text-muted-foreground">
              Bienvenue sur la plateforme Médicore
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/search">
              <Button className="gap-2">
                <Search className="h-4 w-4" />
                Rechercher
              </Button>
            </Link>
            <Link to="/pathologies">
              <Button variant="outline" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Index
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pathologies</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pathologies}</div>
              <p className="text-xs text-muted-foreground">maladies référencées</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Symptômes</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.symptoms}</div>
              <p className="text-xs text-muted-foreground">signes cliniques</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Traitements</CardTitle>
              <Heart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.treatments}</div>
              <p className="text-xs text-muted-foreground">protocoles thérapeutiques</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sources</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sources}</div>
              <p className="text-xs text-muted-foreground">références médicales</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions and Recent */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions rapides</CardTitle>
              <CardDescription>Accédez rapidement aux fonctionnalités principales</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Link to="/search">
                <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Search className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Recherche par symptômes</h3>
                    <p className="text-sm text-muted-foreground">
                      Trouvez des pathologies à partir de symptômes
                    </p>
                  </div>
                </div>
              </Link>
              <Link to="/pathologies">
                <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                  <div className="p-2 rounded-full bg-primary/10">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Consulter l'index</h3>
                    <p className="text-sm text-muted-foreground">
                      Parcourez toutes les pathologies référencées
                    </p>
                  </div>
                </div>
              </Link>
              {role === 'researcher' && (
                <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                  <div className="p-2 rounded-full bg-primary/10">
                    <FlaskConical className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Analyses statistiques</h3>
                    <p className="text-sm text-muted-foreground">
                      Explorez les données épidémiologiques
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Pathologies */}
          <Card>
            <CardHeader>
              <CardTitle>Pathologies récentes</CardTitle>
              <CardDescription>Dernières pathologies consultées ou ajoutées</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentPathologies.map((pathology) => (
                  <Link key={pathology.id} to={`/pathologies/${pathology.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors">
                      <div className="flex-1">
                        <h4 className="font-medium">{pathology.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {pathology.specialty} • {pathology.icd_code}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs ${getSeverityColor(pathology.severity)}`}>
                        {getSeverityLabel(pathology.severity)}
                      </span>
                    </div>
                  </Link>
                ))}
                {recentPathologies.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">
                    Aucune pathologie récente
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
