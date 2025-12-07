import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Search, BookOpen, Filter, ChevronRight } from 'lucide-react';

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

const Pathologies = () => {
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [filteredPathologies, setFilteredPathologies] = useState<Pathology[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const categories = [...new Set(pathologies.map(p => p.category).filter(Boolean))];

  useEffect(() => {
    const fetchPathologies = async () => {
      const { data, error } = await supabase
        .from('pathologies')
        .select('*')
        .order('name');

      if (data) {
        setPathologies(data);
        setFilteredPathologies(data);
      }
      setLoading(false);
    };

    fetchPathologies();
  }, []);

  useEffect(() => {
    let result = pathologies;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.icd_code?.toLowerCase().includes(term) ||
        p.synonyms?.some(s => s.toLowerCase().includes(term)) ||
        p.description?.toLowerCase().includes(term)
      );
    }

    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory);
    }

    if (selectedSeverity !== 'all') {
      result = result.filter(p => p.severity === selectedSeverity);
    }

    setFilteredPathologies(result);
  }, [searchTerm, selectedCategory, selectedSeverity, pathologies]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'mild': return 'bg-green-100 text-green-800 border-green-200';
      case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'severe': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
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
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Index des Pathologies
          </h1>
          <p className="text-muted-foreground mt-1">
            Consultez et recherchez dans notre base de données médicales
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher une pathologie, code CIM, synonyme..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger className="w-full md:w-[180px]">
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
        <div className="grid gap-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Chargement des pathologies...
              </CardContent>
            </Card>
          ) : filteredPathologies.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aucune pathologie ne correspond à vos critères
              </CardContent>
            </Card>
          ) : (
            filteredPathologies.map((pathology) => (
              <Link key={pathology.id} to={`/pathologies/${pathology.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{pathology.name}</h3>
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
                          <p className="text-sm text-muted-foreground mt-1">
                            Aussi appelé : {pathology.synonyms.join(', ')}
                          </p>
                        )}
                        <p className="text-sm mt-2 line-clamp-2">{pathology.description}</p>
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

        {/* Count */}
        <p className="text-sm text-muted-foreground text-center">
          {filteredPathologies.length} pathologie(s) trouvée(s)
        </p>
      </div>
    </AppLayout>
  );
};

export default Pathologies;
