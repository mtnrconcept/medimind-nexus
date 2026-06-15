import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { Search, Users, ChevronLeft, ChevronRight, BookUser } from 'lucide-react';
import PatientDirectory from '@/components/patient/PatientDirectory';

interface Patient {
  id: string;
  patient_id: string;
  age: number;
  gender: string;
  nationality: string;
  treatment: string;
  outcome: string;
  pathology_id: string;
  pathologies?: {
    name: string;
  };
}

const ITEMS_PER_PAGE = 20;

const nationalityFlags: Record<string, string> = {
  FR: '🇫🇷',
  JP: '🇯🇵',
  US: '🇺🇸',
  BR: '🇧🇷',
  DE: '🇩🇪',
  GB: '🇬🇧',
  IN: '🇮🇳',
  CA: '🇨🇦',
  AU: '🇦🇺',
  ES: '🇪🇸',
  IT: '🇮🇹',
  MX: '🇲🇽',
  CH: '🇨🇭',
  Suisse: '🇨🇭',
};

const Patients = () => {
  const { t } = useAutoTranslation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNationality, setSelectedNationality] = useState<string>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const nationalities = useMemo(() =>
    [...new Set(patients.map(p => p.nationality))].sort(),
    [patients]
  );

  useEffect(() => {
    const fetchPatients = async () => {
      const { data, error } = await supabase
        .from('patients')
        .select(`
          *,
          pathologies (name)
        `)
        .order('created_at', { ascending: false });

      if (data) {
        setPatients(data);
      }
      setLoading(false);
    };

    fetchPatients();
  }, []);

  const filteredPatients = useMemo(() => {
    let result = patients;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.patient_id.toLowerCase().includes(term) ||
        p.treatment?.toLowerCase().includes(term) ||
        p.pathologies?.name?.toLowerCase().includes(term)
      );
    }

    if (selectedNationality !== 'all') {
      result = result.filter(p => p.nationality === selectedNationality);
    }

    if (selectedOutcome !== 'all') {
      result = result.filter(p => p.outcome === selectedOutcome);
    }

    if (selectedGender !== 'all') {
      result = result.filter(p => p.gender === selectedGender);
    }

    if (selectedAgeGroup !== 'all') {
      result = result.filter(p => {
        switch (selectedAgeGroup) {
          case '0-30': return p.age <= 30;
          case '31-50': return p.age > 30 && p.age <= 50;
          case '51-70': return p.age > 50 && p.age <= 70;
          case '70+': return p.age > 70;
          default: return true;
        }
      });
    }

    return result;
  }, [patients, searchTerm, selectedNationality, selectedOutcome, selectedAgeGroup, selectedGender]);

  const totalPages = Math.ceil(filteredPatients.length / ITEMS_PER_PAGE);
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'RESOLVED':
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">{t('Résolu')}</Badge>;
      case 'ONGOING':
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">{t('En cours')}</Badge>;
      case 'SIDE_EFFECT':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">{t('Effet secondaire')}</Badge>;
      default:
        return <Badge variant="secondary">{outcome}</Badge>;
    }
  };

  const truncateId = (id: string) => `${id.slice(0, 6)}...`;

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            {t('Gestion Patients')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {t('Gérez votre patientèle et accédez aux données anonymisées')}
          </p>
        </div>

        <Tabs defaultValue="directory" className="space-y-3 sm:space-y-4">
          <TabsList className="w-full sm:w-auto flex">
            <TabsTrigger value="directory" className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm touch-manipulation">
              <BookUser className="h-4 w-4" />
              {t('Ma Patientèle')}
            </TabsTrigger>
            <TabsTrigger value="anonymous" className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm touch-manipulation">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">{t('Données')}</span> {t('Anonymisées')}
            </TabsTrigger>
          </TabsList>

          {/* Répertoire patients */}
          <TabsContent value="directory">
            <PatientDirectory />
          </TabsContent>

          {/* Données anonymisées */}
          <TabsContent value="anonymous" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par ID, traitement, pathologie..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedNationality} onValueChange={(v) => { setSelectedNationality(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[160px]">
                      <SelectValue placeholder="Nationalité" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous pays</SelectItem>
                      {nationalities.map((nat) => (
                        <SelectItem key={nat} value={nat}>
                          {nationalityFlags[nat] || '🌍'} {nat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedAgeGroup} onValueChange={(v) => { setSelectedAgeGroup(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[140px]">
                      <SelectValue placeholder="Âge" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous âges</SelectItem>
                      <SelectItem value="0-30">0-30 ans</SelectItem>
                      <SelectItem value="31-50">31-50 ans</SelectItem>
                      <SelectItem value="51-70">51-70 ans</SelectItem>
                      <SelectItem value="70+">70+ ans</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedGender} onValueChange={(v) => { setSelectedGender(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[120px]">
                      <SelectValue placeholder="Genre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="M">Homme</SelectItem>
                      <SelectItem value="F">Femme</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedOutcome} onValueChange={(v) => { setSelectedOutcome(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[160px]">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous statuts</SelectItem>
                      <SelectItem value="RESOLVED">Résolu</SelectItem>
                      <SelectItem value="ONGOING">En cours</SelectItem>
                      <SelectItem value="SIDE_EFFECT">Effet secondaire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Chargement des patients...
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-mono">ID Patient</TableHead>
                        <TableHead>Âge/Genre</TableHead>
                        <TableHead>Pays</TableHead>
                        <TableHead>Pathologie</TableHead>
                        <TableHead>Traitement</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPatients.map((patient) => (
                        <TableRow key={patient.id} className="cursor-pointer hover:bg-accent">
                          <TableCell>
                            <Link to={`/patients/${patient.id}`} className="font-mono text-primary hover:underline">
                              {truncateId(patient.patient_id)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {patient.age} ans / {patient.gender === 'M' ? '♂' : '♀'}
                          </TableCell>
                          <TableCell>
                            <span className="text-xl mr-2">{nationalityFlags[patient.nationality] || '🌍'}</span>
                            {patient.nationality}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {patient.pathologies?.name || '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {patient.treatment || '-'}
                          </TableCell>
                          <TableCell>{getOutcomeBadge(patient.outcome)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {filteredPatients.length} patient(s) trouvé(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage} sur {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Patients;
