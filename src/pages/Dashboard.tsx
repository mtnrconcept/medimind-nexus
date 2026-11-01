import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined,
  CheckCircle2, ChevronRight, FileText, HeartPulse, Search,
  ShieldCheck, Stethoscope, Users, type LucideIcon,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { displayCount, displayPatientName, getGreeting } from '@/lib/dashboardSummary';

type RecentPatient = {
  id: string;
  patient_id: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
  age: number | null;
  pathologies: { name: string } | null;
};

interface Overview {
  patientCount: number | null;
  pathologyCount: number | null;
  recentPatients: RecentPatient[];
  error: string | null;
}

const overviewEmpty: Overview = { patientCount: null, pathologyCount: null, recentPatients: [], error: null };

const shortcuts: { title: string; description: string; path: string; icon: LucideIcon; eyebrow: string }[] = [
  { title: 'Dossiers patients', description: 'Consulter les informations et le suivi clinique.', path: '/patients', icon: Users, eyebrow: 'Prise en charge' },
  { title: 'Index des pathologies', description: 'Rechercher un diagnostic ou une référence.', path: '/pathologies', icon: BookOpen, eyebrow: 'Connaissances' },
  { title: 'Analyses croisées', description: 'Comparer les données de dossiers autorisés.', path: '/cross-data-analysis', icon: ChartNoAxesCombined, eyebrow: 'Analyse' },
  { title: 'Recherche médicale', description: 'Explorer des symptômes et des sources médicales.', path: '/search', icon: Search, eyebrow: 'Recherche' },
];

const Dashboard = () => {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview>(overviewEmpty);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const firstName = typeof user?.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : '';

  useEffect(() => {
    let active = true;
    const fetchOverview = async () => {
      setLoading(true);
      const [patients, pathologies, recent] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }),
        supabase.from('pathologies').select('id', { count: 'exact', head: true }),
        supabase.from('patients').select('id, patient_id, first_name, last_name, age, created_at, pathologies(name)').order('created_at', { ascending: false }).limit(5),
      ]);
      if (!active) return;
      setOverview({
        patientCount: patients.error ? null : patients.count,
        pathologyCount: pathologies.error ? null : pathologies.count,
        recentPatients: recent.error ? [] : (recent.data || []) as unknown as RecentPatient[],
        error: patients.error || pathologies.error || recent.error
          ? 'Certaines informations n’ont pas pu être chargées. Vérifiez votre connexion et vos droits d’accès.'
          : null,
      });
      setLoading(false);
    };
    void fetchOverview();
    return () => { active = false; };
  }, [refresh]);

  return (
    <AppLayout>
      <div className="clinical-page">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="clinical-eyebrow">Votre espace de travail</p>
            <h1 className="text-[clamp(1.7rem,3vw,2.35rem)] font-bold tracking-tight">
              {getGreeting(new Date().getHours())}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Accédez rapidement à vos dossiers, recherchez une pathologie ou lancez une analyse.
            </p>
          </div>
          <Button asChild className="h-11 shrink-0 gap-2 shadow-sm">
            <Link to="/patients"><Users className="h-4 w-4" /> Ouvrir les dossiers <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>

        {overview.error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
            <span>{overview.error}</span>
            <Button variant="outline" size="sm" onClick={() => setRefresh(n => n + 1)}>Réessayer</Button>
          </div>
        )}

        <section aria-label="Vue d’ensemble des données accessibles" className="grid gap-4 md:grid-cols-3">
          <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-card shadow-sm md:col-span-1">
            <CardContent className="flex h-full flex-col justify-between gap-7 p-6">
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Stethoscope className="h-5 w-5" /></span>
                <Badge variant="outline" className="border-primary/20 bg-card text-primary">Mon espace clinique</Badge>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold">Prendre en charge un patient</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">Consultez le dossier, les analyses disponibles et les comparaisons cliniques autorisées.</p>
                <Link to="/patients" className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-primary hover:underline">
                  Accéder aux patients <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-1">
            <CardContent className="flex h-full flex-col justify-between gap-8 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dossiers patients accessibles</p>
                {loading ? <Skeleton className="mt-3 h-12 w-24" /> : <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums">{displayCount(overview.patientCount)}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Comptage réel selon les droits de votre session</p>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-1">
            <CardContent className="flex h-full flex-col justify-between gap-8 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary"><BookOpen className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pathologies dans l’index</p>
                {loading ? <Skeleton className="mt-3 h-12 w-24" /> : <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums">{displayCount(overview.pathologyCount)}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Référentiel disponible pour votre session</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]" aria-labelledby="recent-records-heading">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/70 px-6 py-5">
              <div className="space-y-1">
                <CardTitle id="recent-records-heading" className="text-base font-bold">Dossiers récents</CardTitle>
                <p className="text-xs text-muted-foreground">Derniers patients visibles par votre compte</p>
              </div>
              <Button variant="ghost" size="sm" asChild><Link to="/patients">Tout voir <ArrowRight className="h-4 w-4" /></Link></Button>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              {loading ? (
                <div className="space-y-3 p-3">{[0,1,2].map(n=><Skeleton key={n} className="h-14 w-full rounded-xl" />)}</div>
              ) : overview.recentPatients.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-12 text-center"><FileText className="h-8 w-8 text-muted-foreground/50" /><p className="font-medium">Aucun dossier récent accessible</p><p className="text-xs text-muted-foreground">Les dossiers autorisés apparaîtront ici.</p></div>
              ) : (
                <ul className="divide-y divide-border/55">
                  {overview.recentPatients.map((patient) => (
                    <li key={patient.id}>
                      <Link to={`/patients/${patient.id}`} className="group flex min-h-[72px] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><FileText className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{displayPatientName(patient)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{patient.pathologies?.name || 'Diagnostic non précisé'} · {patient.patient_id}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b border-border/70 px-6 py-5">
              <CardTitle className="text-base font-bold">Repères de travail</CardTitle>
              <p className="text-xs text-muted-foreground">Une progression simple, du dossier à l’analyse</p>
            </CardHeader>
            <CardContent className="space-y-5 px-6 py-6">
              {[
                { icon: Users, title: 'Ouvrir un dossier', description: 'Partir des données du patient.' },
                { icon: ChartNoAxesCombined, title: 'Comparer les parcours', description: 'Rechercher des antécédents similaires.' },
                { icon: CheckCircle2, title: 'Vérifier les conclusions', description: 'Interpréter les résultats avec un professionnel.' },
              ].map(({ icon: Icon, title, description }, index) => (
                <div key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-primary"><Icon className="h-4 w-4" /></span>
                  <div><p className="text-sm font-semibold">{index + 1}. {title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
                </div>
              ))}
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Les outils d’analyse assistent la décision : ils ne remplacent pas une validation clinique.
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="tools-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 id="tools-heading" className="clinical-section-heading">Aller plus loin</h2><p className="mt-1 text-sm text-muted-foreground">Accès direct aux principales fonctionnalités</p></div>
            <Badge variant="secondary" className="gap-1.5 text-[11px]"><HeartPulse className="h-3.5 w-3.5" /> Espace de travail</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {shortcuts.map(({ title, description, path, icon: Icon, eyebrow }) => (
              <Link key={path} to={path} className="group rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></span>
                <span className="mt-5 block text-[10px] font-bold uppercase tracking-[0.13em] text-primary">{eyebrow}</span>
                <span className="mt-1 block text-sm font-bold text-foreground">{title}</span>
                <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
