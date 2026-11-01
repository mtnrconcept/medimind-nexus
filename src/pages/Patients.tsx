import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Filter, Search, Users, BookUser, ArrowUpRight } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeading from '@/components/layout/PageHeading';
import PatientDirectory from '@/components/patient/PatientDirectory';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface PatientEntry {
  id: string;
  patient_id: string;
  age: number | null;
  gender: string | null;
  nationality: string | null;
  treatment: string | null;
  outcome: string | null;
  pathologies: { name: string } | null;
}

const PER_PAGE = 20;

function outcomeBadge(outcome?: string | null) {
  switch (outcome) {
    case 'RESOLVED': return <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Résolu</Badge>;
    case 'ONGOING': return <Badge variant="outline" className="border-warning/30 bg-warning/10 text-foreground">En cours</Badge>;
    case 'SIDE_EFFECT': return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Effet indésirable</Badge>;
    default: return <span className="text-xs text-muted-foreground">Non renseigné</span>;
  }
}

const Patients = () => {
  const [entries, setEntries] = useState<PatientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [country, setCountry] = useState('all');
  const [status, setStatus] = useState('all');
  const [ageGroup, setAgeGroup] = useState('all');
  const [gender, setGender] = useState('all');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const fetchRecords = async () => {
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('id, patient_id, age, gender, nationality, treatment, outcome, pathologies(name)')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (dbError) {
        setError('Impossible de charger les dossiers accessibles. Vérifiez vos droits et votre connexion.');
      } else {
        setError(null);
        setEntries((data || []) as unknown as PatientEntry[]);
      }
      setLoading(false);
    };
    void fetchRecords();
    return () => { active = false; };
  }, [reload]);

  const countries = useMemo(() => [...new Set(entries.map(e => e.nationality).filter((e): e is string => Boolean(e)))].sort(), [entries]);
  const filtered = useMemo(() => entries.filter(patient => {
    const text = searchTerm.trim().toLocaleLowerCase('fr');
    if (text && ![patient.patient_id, patient.treatment, patient.pathologies?.name].some(v => v?.toLocaleLowerCase('fr').includes(text))) return false;
    if (country !== 'all' && patient.nationality !== country) return false;
    if (status !== 'all' && patient.outcome !== status) return false;
    if (gender !== 'all' && patient.gender !== gender) return false;
    if (ageGroup !== 'all') {
      if (patient.age == null) return false;
      const age = patient.age;
      if (ageGroup === '0-30' && age > 30) return false;
      if (ageGroup === '31-50' && (age <= 30 || age > 50)) return false;
      if (ageGroup === '51-70' && (age <= 50 || age > 70)) return false;
      if (ageGroup === '70+' && age <= 70) return false;
    }
    return true;
  }), [entries, searchTerm, country, status, gender, ageGroup]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const hasFilters = [country, status, ageGroup, gender].some(v => v !== 'all');
  const resetPage = () => setPage(1);

  return (
    <AppLayout>
      <div className="clinical-page">
        <PageHeading eyebrow="Espace clinique" title="Patients" description="Retrouvez les dossiers autorisés, consultez leur suivi ou explorez les données par identifiant." />
        <Tabs defaultValue="directory" className="space-y-5">
          <TabsList className="grid h-11 w-full max-w-[475px] grid-cols-2 rounded-xl bg-muted/80 p-1">
            <TabsTrigger value="directory" className="gap-2 rounded-lg text-xs sm:text-sm"><BookUser className="h-4 w-4" /> Dossiers nominatifs</TabsTrigger>
            <TabsTrigger value="identifiers" className="gap-2 rounded-lg text-xs sm:text-sm"><Users className="h-4 w-4" /> Vue par identifiant</TabsTrigger>
          </TabsList>
          <TabsContent value="directory" className="mt-0">
            <PatientDirectory />
          </TabsContent>
          <TabsContent value="identifiers" className="mt-0 space-y-4">
            <Card>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div><h2 className="text-base font-bold">Explorer par identifiant</h2><p className="text-xs text-muted-foreground">Cette vue contient des informations cliniques et reste soumise aux autorisations du dossier.</p></div>
                  <Badge variant="outline" className="w-fit">{loading ? 'Chargement…' : `${filtered.length} résultat(s) chargés`}</Badge>
                </div>
                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input className="h-11 pl-10" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); resetPage(); }} aria-label="Chercher un identifiant, traitement ou diagnostic" placeholder="Identifiant, diagnostic, traitement…" />
                  </div>
                  <details className="group relative rounded-xl border border-border bg-card px-3 py-1">
                    <summary className="flex h-9 cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                      <Filter className="h-4 w-4" /> Filtres {hasFilters && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Filtres actifs" />}
                    </summary>
                    <div className="grid gap-3 border-t border-border pb-3 pt-3 md:grid-cols-2">
                      <Select value={country} onValueChange={v => { setCountry(v); resetPage(); }}><SelectTrigger aria-label="Pays"><SelectValue placeholder="Pays" /></SelectTrigger><SelectContent><SelectItem value="all">Tous pays</SelectItem>{countries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                      <Select value={ageGroup} onValueChange={v => { setAgeGroup(v); resetPage(); }}><SelectTrigger aria-label="Tranche d’âge"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous âges</SelectItem><SelectItem value="0-30">0–30 ans</SelectItem><SelectItem value="31-50">31–50 ans</SelectItem><SelectItem value="51-70">51–70 ans</SelectItem><SelectItem value="70+">Plus de 70 ans</SelectItem></SelectContent></Select>
                      <Select value={gender} onValueChange={v => { setGender(v); resetPage(); }}><SelectTrigger aria-label="Genre"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous genres</SelectItem><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem></SelectContent></Select>
                      <Select value={status} onValueChange={v => { setStatus(v); resetPage(); }}><SelectTrigger aria-label="Statut"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous statuts</SelectItem><SelectItem value="RESOLVED">Résolu</SelectItem><SelectItem value="ONGOING">En cours</SelectItem><SelectItem value="SIDE_EFFECT">Effet indésirable</SelectItem></SelectContent></Select>
                      {hasFilters && <Button variant="ghost" size="sm" className="md:col-span-2" onClick={() => {setCountry('all');setAgeGroup('all');setGender('all');setStatus('all');resetPage();}}>Effacer les filtres</Button>}
                    </div>
                  </details>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              {error ? (
                <div role="alert" className="space-y-3 px-6 py-12 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setReload(x=>x+1)}>Réessayer</Button></div>
              ) : loading ? (
                <CardContent className="space-y-3 p-6">{[0,1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</CardContent>
              ) : visible.length === 0 ? (
                <CardContent className="p-12 text-center"><Users className="mx-auto h-9 w-9 text-muted-foreground/60" /><p className="mt-3 text-sm font-semibold">Aucun patient trouvé</p><p className="mt-1 text-xs text-muted-foreground">Essayez d’autres critères de recherche.</p></CardContent>
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Identifiant</TableHead><TableHead>Profil</TableHead><TableHead>Pathologie</TableHead><TableHead>Traitement</TableHead><TableHead>Suivi</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                    <TableBody>{visible.map(patient => (
                      <TableRow key={patient.id}>
                        <TableCell><Link to={`/patients/${patient.id}`} className="font-mono text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{patient.patient_id}</Link></TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{patient.age != null ? `${patient.age} ans` : 'Âge non renseigné'} · {patient.gender || '—'}<span className="ml-1 text-muted-foreground">{patient.nationality || ''}</span></TableCell>
                        <TableCell className="max-w-52 truncate text-sm">{patient.pathologies?.name || 'Non précisée'}</TableCell>
                        <TableCell className="max-w-52 truncate text-sm text-muted-foreground">{patient.treatment || 'Non renseigné'}</TableCell>
                        <TableCell>{outcomeBadge(patient.outcome)}</TableCell>
                        <TableCell><Link to={`/patients/${patient.id}`} aria-label={`Ouvrir le dossier ${patient.patient_id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"><ArrowUpRight className="h-4 w-4" /></Link></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              )}
            </Card>
            <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
              <span>{filtered.length} patient(s) dans la sélection</span>
              <div className="flex items-center gap-3">
                <Button size="icon" variant="outline" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={currentPage===1} aria-label="Page précédente"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="tabular-nums">Page {currentPage} sur {totalPages}</span>
                <Button size="icon" variant="outline" onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={currentPage>=totalPages} aria-label="Page suivante"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Patients;
