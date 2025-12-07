import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar,
  User,
  ChevronRight,
  Users,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Patient {
  id: string;
  patient_id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  age: number;
  gender: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  nationality: string;
}

const PatientDirectory = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'last_name' | 'first_name' | 'date_of_birth'>('last_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: 'M',
    phone: '',
    email: '',
    address: '',
    city: '',
    postal_code: '',
    nationality: 'Suisse'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('patients')
      .select('id, patient_id, first_name, last_name, date_of_birth, age, gender, phone, email, address, city, postal_code, nationality')
      .order('last_name', { ascending: true });

    if (error) {
      console.error('Erreur chargement patients:', error);
      toast.error('Erreur lors du chargement des patients');
    } else {
      setPatients(data || []);
    }
    setLoading(false);
  };

  const filteredPatients = useMemo(() => {
    let filtered = patients.filter(p => {
      const searchLower = search.toLowerCase();
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const phone = p.phone?.toLowerCase() || '';
      const email = p.email?.toLowerCase() || '';
      const city = p.city?.toLowerCase() || '';
      
      return fullName.includes(searchLower) || 
             phone.includes(searchLower) || 
             email.includes(searchLower) ||
             city.includes(searchLower);
    });

    // Tri
    filtered.sort((a, b) => {
      let valA: string | null = null;
      let valB: string | null = null;

      switch (sortField) {
        case 'last_name':
          valA = a.last_name || '';
          valB = b.last_name || '';
          break;
        case 'first_name':
          valA = a.first_name || '';
          valB = b.first_name || '';
          break;
        case 'date_of_birth':
          valA = a.date_of_birth || '';
          valB = b.date_of_birth || '';
          break;
      }

      if (sortOrder === 'asc') {
        return valA.localeCompare(valB);
      } else {
        return valB.localeCompare(valA);
      }
    });

    return filtered;
  }, [patients, search, sortField, sortOrder]);

  // Grouper par première lettre du nom
  const groupedPatients = useMemo(() => {
    const groups: Record<string, Patient[]> = {};
    
    filteredPatients.forEach(patient => {
      const letter = (patient.last_name?.[0] || patient.first_name?.[0] || '#').toUpperCase();
      if (!groups[letter]) {
        groups[letter] = [];
      }
      groups[letter].push(patient);
    });

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredPatients]);

  const toggleSort = (field: 'last_name' | 'first_name' | 'date_of_birth') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const calculateAge = (dateOfBirth: string): number => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleAddPatient = async () => {
    if (!newPatient.first_name || !newPatient.last_name) {
      toast.error('Le nom et le prénom sont requis');
      return;
    }

    setSaving(true);
    
    // Générer un patient_id unique
    const patientId = `PAT-${Date.now().toString(36).toUpperCase()}`;
    const age = newPatient.date_of_birth ? calculateAge(newPatient.date_of_birth) : 0;

    const { error } = await supabase
      .from('patients')
      .insert({
        patient_id: patientId,
        first_name: newPatient.first_name,
        last_name: newPatient.last_name,
        date_of_birth: newPatient.date_of_birth || null,
        age: age,
        gender: newPatient.gender,
        phone: newPatient.phone || null,
        email: newPatient.email || null,
        address: newPatient.address || null,
        city: newPatient.city || null,
        postal_code: newPatient.postal_code || null,
        nationality: newPatient.nationality
      });

    if (error) {
      console.error('Erreur création patient:', error);
      toast.error('Erreur lors de la création du patient');
    } else {
      toast.success(`Patient ${newPatient.first_name} ${newPatient.last_name} créé`);
      setDialogOpen(false);
      setNewPatient({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        gender: 'M',
        phone: '',
        email: '',
        address: '',
        city: '',
        postal_code: '',
        nationality: 'Suisse'
      });
      fetchPatients();
    }
    
    setSaving(false);
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.[0] || '';
    const last = lastName?.[0] || '';
    return `${first}${last}`.toUpperCase() || '?';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Non renseignée';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: fr });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Répertoire Patients
            </CardTitle>
            <CardDescription>
              {patients.length} patient(s) enregistré(s)
            </CardDescription>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau patient
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nouveau patient</DialogTitle>
                <DialogDescription>
                  Renseignez les informations du patient
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">Prénom *</Label>
                    <Input
                      id="first_name"
                      value={newPatient.first_name}
                      onChange={(e) => setNewPatient({...newPatient, first_name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Nom *</Label>
                    <Input
                      id="last_name"
                      value={newPatient.last_name}
                      onChange={(e) => setNewPatient({...newPatient, last_name: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">Date de naissance</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={newPatient.date_of_birth}
                      onChange={(e) => setNewPatient({...newPatient, date_of_birth: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Genre</Label>
                    <select
                      id="gender"
                      value={newPatient.gender}
                      onChange={(e) => setNewPatient({...newPatient, gender: e.target.value})}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="M">Homme</option>
                      <option value="F">Femme</option>
                      <option value="O">Autre</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={newPatient.phone}
                      onChange={(e) => setNewPatient({...newPatient, phone: e.target.value})}
                      placeholder="+41 79 123 45 67"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newPatient.email}
                      onChange={(e) => setNewPatient({...newPatient, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={newPatient.address}
                    onChange={(e) => setNewPatient({...newPatient, address: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Code postal</Label>
                    <Input
                      id="postal_code"
                      value={newPatient.postal_code}
                      onChange={(e) => setNewPatient({...newPatient, postal_code: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville</Label>
                    <Input
                      id="city"
                      value={newPatient.city}
                      onChange={(e) => setNewPatient({...newPatient, city: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleAddPatient} disabled={saving}>
                  {saving ? 'Création...' : 'Créer le patient'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barre de recherche et tri */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, téléphone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant={sortField === 'last_name' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => toggleSort('last_name')}
            >
              Nom
              {sortField === 'last_name' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3 ml-1" /> : <SortDesc className="h-3 w-3 ml-1" />)}
            </Button>
            <Button 
              variant={sortField === 'date_of_birth' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => toggleSort('date_of_birth')}
            >
              Date naiss.
              {sortField === 'date_of_birth' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3 ml-1" /> : <SortDesc className="h-3 w-3 ml-1" />)}
            </Button>
          </div>
        </div>

        {/* Liste des patients groupés */}
        <ScrollArea className="h-[500px]">
          {groupedPatients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Aucun patient trouvé</p>
              {search && <p className="text-sm">Essayez une autre recherche</p>}
            </div>
          ) : (
            <div className="space-y-6">
              {groupedPatients.map(([letter, patientsInGroup]) => (
                <div key={letter}>
                  {/* Lettre de groupe */}
                  <div className="sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b">
                    <span className="text-lg font-bold text-primary">{letter}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({patientsInGroup.length})
                    </span>
                  </div>

                  {/* Patients dans le groupe */}
                  <div className="space-y-2 pt-2">
                    {patientsInGroup.map((patient) => (
                      <div
                        key={patient.id}
                        onClick={() => navigate(`/patients/${patient.id}`)}
                        className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors group"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {getInitials(patient.first_name, patient.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium truncate">
                              {patient.last_name || 'Nom inconnu'}, {patient.first_name || 'Prénom inconnu'}
                            </h4>
                            <Badge variant="outline" className="text-xs">
                              {patient.gender === 'M' ? 'H' : patient.gender === 'F' ? 'F' : patient.gender}
                            </Badge>
                            {patient.age > 0 && (
                              <span className="text-sm text-muted-foreground">{patient.age} ans</span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                            {patient.date_of_birth && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(patient.date_of_birth)}
                              </span>
                            )}
                            {patient.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {patient.phone}
                              </span>
                            )}
                            {patient.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {patient.email}
                              </span>
                            )}
                            {patient.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {patient.postal_code} {patient.city}
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default PatientDirectory;
